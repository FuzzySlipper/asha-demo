use asha_gameplay_module_sdk::*;
use serde::{Deserialize, Serialize};

const MODULE_ID: &str = "demo.primary-fire-effect";
const MODULE_NAMESPACE: &str = "demo.primary-fire-effect";
const PROVIDER_ID: &str = "provider.demo.primary-fire-effect";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CloseRangeChallengeConfig {
    pub close_range_millimeters: u32,
    pub close_range_bonus: u32,
    pub objective_points: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CloseRangeChallengeState {
    pub revision: u64,
    pub status: String,
    pub trigger_entries: u32,
    pub close_range_hits: u32,
    pub score: u32,
    pub objective_points: u32,
    pub close_range_millimeters: u32,
    pub close_range_bonus: u32,
    pub last_range_millimeters: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct CloseRangeChallengeFact {
    action: String,
    score_delta: u32,
    close_range_hit: bool,
    range_millimeters: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct CloseRangeChallengeEvent {
    status: String,
    action: String,
    score_delta: u32,
    close_range_hit: bool,
    range_millimeters: Option<u32>,
    overlap_read_hash: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CombatPayload {
    distance: Option<f64>,
    defeated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct ConsoleInteractionPayload {
    instance: u64,
    role: String,
}

struct CloseRangeChallengeBehavior;

impl GameplayModuleBehavior for CloseRangeChallengeBehavior {
    fn invoke(
        &self,
        context: &GameplayModuleContext<'_>,
    ) -> Result<GameplayModuleActions, GameplayModuleError> {
        let event = context
            .event_contract()
            .ok_or_else(|| GameplayModuleError {
                code: "missingEventContract".to_owned(),
                message: "close-range challenge requires a typed gameplay event".to_owned(),
            })?;
        if event == &contract("console-interacted") {
            return record_console_interaction(context);
        }
        let state = context.named_view::<CloseRangeChallengeState>("challenge-state")?;

        if event == &StandardGameplayEventKind::TriggerEntered.contract() {
            return react_to_trigger_enter(context, &state);
        }
        if event == &StandardGameplayEventKind::TriggerExited.contract() {
            return record_progress(context, &state, "challenge-exited", 0, false, None, None);
        }
        if event == &StandardGameplayEventKind::CombatFireHit.contract() {
            let payload: CombatPayload = context.event_payload()?;
            let range_millimeters = payload
                .distance
                .map(|distance| (distance.max(0.0) * 1_000.0).round() as u32);
            let close_range_hit = range_millimeters
                .map(|range| range <= state.close_range_millimeters)
                .unwrap_or(false);
            let score_delta = 1 + if close_range_hit {
                state.close_range_bonus
            } else {
                0
            };
            return record_progress(
                context,
                &state,
                if close_range_hit {
                    "close-range-hit"
                } else {
                    "long-range-hit"
                },
                score_delta,
                close_range_hit,
                range_millimeters,
                None,
            );
        }
        if event == &StandardGameplayEventKind::CombatFireMissed.contract() {
            return record_progress(context, &state, "shot-missed", 0, false, None, None);
        }
        if event == &StandardGameplayEventKind::CombatEntityDefeated.contract() {
            let payload: CombatPayload = context.event_payload()?;
            return record_progress(
                context,
                &state,
                if payload.defeated {
                    "target-defeated"
                } else {
                    "combat-resolved"
                },
                0,
                false,
                None,
                None,
            );
        }
        if event == &StandardGameplayEventKind::EntityLifecycleChanged.contract() {
            return record_progress(context, &state, "lifecycle-observed", 0, false, None, None);
        }
        Err(GameplayModuleError {
            code: "unsupportedEvent".to_owned(),
            message: format!("close-range challenge does not handle {}", event.key()),
        })
    }
}

fn record_console_interaction(
    context: &GameplayModuleContext<'_>,
) -> Result<GameplayModuleActions, GameplayModuleError> {
    let payload: ConsoleInteractionPayload = context.event_payload()?;
    if payload.role != "interaction/sensor" {
        return Err(GameplayModuleError {
            code: "unexpectedPrefabRole".to_owned(),
            message: payload.role,
        });
    }
    let entity = context.target(0).ok_or_else(|| GameplayModuleError {
        code: "missingPrefabPartTarget".to_owned(),
        message: "console interaction requires the resolved prefab-part entity".to_owned(),
    })?;
    let mut actions = context.actions();
    actions.emit_json(
        contract("challenge-progressed"),
        &CloseRangeChallengeEvent {
            status: "active".to_owned(),
            action: "console-interacted".to_owned(),
            score_delta: 1,
            close_range_hit: false,
            range_millimeters: None,
            overlap_read_hash: None,
        },
        Some(entity),
        vec![],
        vec![entity],
    )?;
    actions.record_local_fact_json(
        contract("challenge-fact"),
        contract("challenge-state"),
        GameplayModuleStateScope::Entity { entity },
        0,
        &CloseRangeChallengeFact {
            action: "console-interacted".to_owned(),
            score_delta: 1,
            close_range_hit: false,
            range_millimeters: None,
        },
    )?;
    actions.trace(format!("console-interacted:instance-{}", payload.instance));
    Ok(actions)
}

fn react_to_trigger_enter(
    context: &GameplayModuleContext<'_>,
    state: &CloseRangeChallengeState,
) -> Result<GameplayModuleActions, GameplayModuleError> {
    let entered: TriggerOverlapGameplayPayload = context.event_payload()?;
    let overlap_read_hash = context
        .read("current-trigger-overlaps")
        .map(|read| match &read.value {
            GameplayReadValue::OwnerQuery {
                result:
                    GameplayOwnerQueryResult::CurrentTriggerOverlaps {
                        trigger, subjects, ..
                    },
            } if *trigger == entered.trigger && subjects.contains(&entered.subject) => {
                Ok(read.value_hash.clone())
            }
            _ => Err(GameplayModuleError {
                code: "triggerOverlapReadMismatch".to_owned(),
                message: "accepted trigger pair was absent from the frozen owner query".to_owned(),
            }),
        })
        .transpose()?;
    let mut actions = record_progress(
        context,
        state,
        "challenge-entered",
        0,
        false,
        None,
        overlap_read_hash,
    )?;
    actions.propose_json(
        StandardGameplayProposalKind::SetCapabilityActivation.contract(),
        &CapabilityActivationGameplayProposal {
            entity: entered.trigger,
            capability: "collision".to_owned(),
            action: "deactivate".to_owned(),
        },
        Some(entered.subject),
        vec![entered.trigger],
    )?;
    Ok(actions)
}

fn record_progress(
    context: &GameplayModuleContext<'_>,
    state: &CloseRangeChallengeState,
    action: &str,
    score_delta: u32,
    close_range_hit: bool,
    range_millimeters: Option<u32>,
    overlap_read_hash: Option<String>,
) -> Result<GameplayModuleActions, GameplayModuleError> {
    let status = if action == "target-defeated"
        || state.score.saturating_add(score_delta) >= state.objective_points
    {
        "completed"
    } else if action == "challenge-exited" {
        "outside"
    } else {
        "active"
    };
    let mut actions = context.actions();
    actions.emit_json(
        contract("challenge-progressed"),
        &CloseRangeChallengeEvent {
            status: status.to_owned(),
            action: action.to_owned(),
            score_delta,
            close_range_hit,
            range_millimeters,
            overlap_read_hash,
        },
        context.source(),
        vec![],
        context.target(0).into_iter().collect(),
    )?;
    actions.record_local_fact_json(
        contract("challenge-fact"),
        contract("challenge-state"),
        GameplayModuleStateScope::Session,
        state.revision,
        &CloseRangeChallengeFact {
            action: action.to_owned(),
            score_delta,
            close_range_hit,
            range_millimeters,
        },
    )?;
    actions.trace(action);
    Ok(actions)
}

struct CloseRangeChallengeStateAdapter;

impl GameplayTypedModuleStateAdapter for CloseRangeChallengeStateAdapter {
    type Config = CloseRangeChallengeConfig;
    type State = CloseRangeChallengeState;
    type Fact = CloseRangeChallengeFact;
    type View = CloseRangeChallengeState;

    fn module_id(&self) -> &str {
        MODULE_ID
    }
    fn state_schema(&self) -> &GameplayContractRef {
        static_ref("challenge-state")
    }
    fn fact_schema(&self) -> &GameplayContractRef {
        static_ref("challenge-fact")
    }
    fn owner(&self) -> &GameplayOwnerRef {
        static_owner()
    }

    fn decode_config(&self, bytes: &[u8]) -> Result<Self::Config, String> {
        serde_json::from_slice(bytes).map_err(|error| error.to_string())
    }
    fn decode_state(&self, bytes: &[u8]) -> Result<Self::State, String> {
        serde_json::from_slice(bytes).map_err(|error| error.to_string())
    }
    fn decode_fact(&self, bytes: &[u8]) -> Result<Self::Fact, String> {
        serde_json::from_slice(bytes).map_err(|error| error.to_string())
    }
    fn encode_state(&self, state: &Self::State) -> Result<Vec<u8>, String> {
        serde_json::to_vec(state).map_err(|error| error.to_string())
    }
    fn initialize(&self, config: &Self::Config) -> Result<Self::State, String> {
        Ok(CloseRangeChallengeState {
            revision: 0,
            status: "armed".to_owned(),
            trigger_entries: 0,
            close_range_hits: 0,
            score: 0,
            objective_points: config.objective_points,
            close_range_millimeters: config.close_range_millimeters,
            close_range_bonus: config.close_range_bonus,
            last_range_millimeters: None,
        })
    }
    fn apply_fact(&self, state: &Self::State, fact: &Self::Fact) -> Result<Self::State, String> {
        let mut next = state.clone();
        next.revision = next.revision.saturating_add(1);
        next.status = match fact.action.as_str() {
            "target-defeated" => "completed",
            "challenge-exited" => "outside",
            _ => "active",
        }
        .to_owned();
        if fact.action == "challenge-entered" {
            next.trigger_entries = next.trigger_entries.saturating_add(1);
        }
        if fact.close_range_hit {
            next.close_range_hits = next.close_range_hits.saturating_add(1);
        }
        next.score = next.score.saturating_add(fact.score_delta);
        if next.score >= next.objective_points {
            next.status = "completed".to_owned();
        }
        if fact.range_millimeters.is_some() {
            next.last_range_millimeters = fact.range_millimeters;
        }
        Ok(next)
    }
    fn migrate(&self, _from_version: u32, state: &Self::State) -> Result<Self::State, String> {
        Ok(state.clone())
    }
    fn view_schema(&self) -> Option<&GameplayContractRef> {
        Some(static_ref("challenge-state-view"))
    }
    fn project_view(&self, state: &Self::State) -> Result<Self::View, String> {
        Ok(state.clone())
    }
    fn encode_view(&self, view: &Self::View) -> Result<Vec<u8>, String> {
        serde_json::to_vec(view).map_err(|error| error.to_string())
    }
}

pub fn gameplay_module_ref() -> GameplayModuleRef {
    GameplayModuleRef {
        module_id: MODULE_ID.to_owned(),
        namespace: MODULE_NAMESPACE.to_owned(),
        version: "1.0.0".to_owned(),
        sdk_hash: "sha256:gameplay-sdk-v1".to_owned(),
        contract_hash: "sha256:demo-primary-fire-gameplay-contract-v1".to_owned(),
        artifact_hash: "sha256:demo-primary-fire-gameplay-artifact-v1".to_owned(),
        provider_id: PROVIDER_ID.to_owned(),
    }
}

pub fn gameplay_declared_read_plan_hash() -> String {
    gameplay_module_payload_hash(
        b"demo.primary-fire-effect|trigger-entered,trigger-exited,combat-fire-hit,combat-fire-missed,combat-defeated,lifecycle-changed,console-interacted|challenge-state:revision,status,score,closeRangeHits|current-trigger-overlaps|console-interacted:no-reads|v2",
    )
}

pub fn gameplay_authored_binding_registry() -> GameplayModuleBindingRegistry {
    let default_configuration = authored_configuration(
        "demo.primary-fire-effect.default",
        CloseRangeChallengeConfig {
            close_range_millimeters: 2_500,
            close_range_bonus: 5,
            objective_points: 6,
        },
    );
    let blue_configuration = authored_configuration(
        "demo.primary-fire-effect.console-blue",
        CloseRangeChallengeConfig {
            close_range_millimeters: 2_000,
            close_range_bonus: 2,
            objective_points: 3,
        },
    );
    let red_configuration = authored_configuration(
        "demo.primary-fire-effect.console-red",
        CloseRangeChallengeConfig {
            close_range_millimeters: 3_000,
            close_range_bonus: 7,
            objective_points: 9,
        },
    );
    let session_binding = GameplayModuleBinding {
        binding_id: "demo.primary-fire-effect.session".to_owned(),
        module_id: MODULE_ID.to_owned(),
        configuration_id: default_configuration.configuration_id.clone(),
        state_schema: contract("challenge-state"),
        target: GameplayModuleBindingTarget::Session,
        required_reads: vec![],
        output_contracts: vec![contract("challenge-progressed")],
        enabled: true,
    };
    let prefab_binding = GameplayModuleBinding {
        binding_id: "demo.primary-fire-effect.console-sensor".to_owned(),
        module_id: MODULE_ID.to_owned(),
        configuration_id: default_configuration.configuration_id.clone(),
        state_schema: contract("challenge-state"),
        target: GameplayModuleBindingTarget::PrefabPart {
            part: PrefabPartReference {
                prefab: PrefabId::new(70),
                role: "interaction/sensor".to_owned(),
            },
        },
        required_reads: vec![],
        output_contracts: vec![contract("challenge-progressed")],
        enabled: true,
    };
    let mut builder = GameplayModuleBindingRegistryBuilder::new();
    builder
        .configuration(default_configuration)
        .configuration(blue_configuration.clone())
        .configuration(red_configuration.clone())
        .binding(session_binding)
        .binding(prefab_binding)
        .instance_override(GameplayModuleBindingOverride {
            binding_id: "demo.primary-fire-effect.console-sensor".to_owned(),
            prefab_instance: PrefabInstanceId::new(700),
            configuration_id: Some(blue_configuration.configuration_id),
            enabled: None,
        })
        .instance_override(GameplayModuleBindingOverride {
            binding_id: "demo.primary-fire-effect.console-sensor".to_owned(),
            prefab_instance: PrefabInstanceId::new(701),
            configuration_id: Some(red_configuration.configuration_id),
            enabled: None,
        });
    builder.build()
}

/// The generic module-conformance runner exercises a binding slice without a
/// prefab registry bootstrap. The product host separately proves the authored
/// prefab-part binding and both instance overrides through real placement
/// authority, so this slice keeps only the same registry's Session binding.
pub fn gameplay_session_conformance_binding_registry() -> GameplayModuleBindingRegistry {
    let authored = gameplay_authored_binding_registry();
    let session_binding = authored
        .bindings
        .iter()
        .find(|binding| matches!(&binding.target, GameplayModuleBindingTarget::Session))
        .cloned()
        .expect("authored gameplay registry has a Session binding");
    let mut builder = GameplayModuleBindingRegistryBuilder::new();
    let configuration = authored
        .configurations
        .into_iter()
        .find(|configuration| configuration.configuration_id == session_binding.configuration_id)
        .expect("Session binding configuration is present");
    builder
        .configuration(configuration)
        .binding(session_binding);
    builder.build()
}

fn authored_configuration(
    configuration_id: &str,
    config: CloseRangeChallengeConfig,
) -> GameplayModuleConfiguration {
    let canonical_config =
        serde_json::to_vec(&config).expect("authored challenge config serializes");
    GameplayModuleConfiguration {
        configuration_id: configuration_id.to_owned(),
        module: gameplay_module_ref(),
        configuration: contract("configuration"),
        codec_id: "codec.demo.primary-fire-effect.configuration".to_owned(),
        config_hash: gameplay_module_payload_hash(&canonical_config),
        canonical_config,
    }
}

pub fn gameplay_composition() -> Result<GameplayStaticComposition, GameplayStaticCompositionError> {
    let mut builder = GameplayStaticCompositionBuilder::new();
    builder.include_standard_owner_events();
    builder.add_provider(provider());
    builder.build()
}

fn provider() -> GameplayStaticModuleProvider {
    let configuration_metadata = GameplayConfigurationSchemaMetadata {
        module_id: MODULE_ID.to_owned(),
        configuration: contract("configuration"),
        codec_id: "codec.demo.primary-fire-effect.configuration".to_owned(),
        fields: vec![
            GameplayConfigurationFieldMetadata {
                name: "closeRangeMillimeters".to_owned(),
                value_type: "u32".to_owned(),
                required: true,
            },
            GameplayConfigurationFieldMetadata {
                name: "closeRangeBonus".to_owned(),
                value_type: "u32".to_owned(),
                required: true,
            },
            GameplayConfigurationFieldMetadata {
                name: "objectivePoints".to_owned(),
                value_type: "u32".to_owned(),
                required: true,
            },
        ],
    };
    let subscriptions = [
        ("trigger-entered", StandardGameplayEventKind::TriggerEntered),
        ("trigger-exited", StandardGameplayEventKind::TriggerExited),
        ("combat-fire-hit", StandardGameplayEventKind::CombatFireHit),
        (
            "combat-fire-missed",
            StandardGameplayEventKind::CombatFireMissed,
        ),
        (
            "combat-defeated",
            StandardGameplayEventKind::CombatEntityDefeated,
        ),
        (
            "lifecycle-changed",
            StandardGameplayEventKind::EntityLifecycleChanged,
        ),
    ];
    let manifest = GameplayModuleManifest {
        module_ref: gameplay_module_ref(),
        published_events: vec![
            GameplayEventSchemaDeclaration {
                event: contract("challenge-progressed"),
                codec_id: "codec.demo.primary-fire-effect.challenge-progressed".to_owned(),
            },
            GameplayEventSchemaDeclaration {
                event: contract("console-interacted"),
                codec_id: "codec.demo.primary-fire-effect.console-interacted".to_owned(),
            },
        ],
        subscriptions: subscriptions
            .iter()
            .map(|(name, event)| GameplaySubscriptionDeclaration {
                subscription_id: format!("demo.primary-fire-effect.{name}"),
                event: event.contract(),
                invocation_id: format!("demo.primary-fire-effect.{name}.observe"),
                selector: GameplayHeaderSelector {
                    source: None,
                    target: None,
                    scope: None,
                    required_tags: vec![],
                },
                max_deliveries_per_root: 4,
            })
            .chain(std::iter::once(GameplaySubscriptionDeclaration {
                subscription_id: "demo.primary-fire-effect.console-interacted".to_owned(),
                event: contract("console-interacted"),
                invocation_id: "demo.primary-fire-effect.console-interacted.observe".to_owned(),
                selector: GameplayHeaderSelector {
                    source: None,
                    target: None,
                    scope: None,
                    required_tags: vec!["prefab-part".to_owned()],
                },
                max_deliveries_per_root: 1,
            }))
            .collect(),
        invocations: subscriptions
            .iter()
            .map(|(name, event)| GameplayInvocationDescriptor {
                invocation_id: format!("demo.primary-fire-effect.{name}.observe"),
                family: GameplayInvocationFamily::Observe,
                input_contract: event.contract(),
                output_contract: contract("challenge-progressed"),
                read_requirements: invocation_read_requirements(name),
                max_outputs: 3,
                max_payload_bytes: 4_096,
            })
            .chain(std::iter::once(GameplayInvocationDescriptor {
                invocation_id: "demo.primary-fire-effect.console-interacted.observe".to_owned(),
                family: GameplayInvocationFamily::Observe,
                input_contract: contract("console-interacted"),
                output_contract: contract("challenge-progressed"),
                read_requirements: Vec::new(),
                max_outputs: 2,
                max_payload_bytes: 1_024,
            }))
            .collect(),
        read_views: vec![
            GameplayReadViewRequirement {
                view: contract("challenge-state-view"),
                provider_id: PROVIDER_ID.to_owned(),
                kind: GameplayReadViewKind::ModuleNamed,
                fields: vec![
                    "revision".to_owned(),
                    "status".to_owned(),
                    "score".to_owned(),
                    "closeRangeHits".to_owned(),
                ],
                selector_capabilities: vec![GameplayReadSelectorCapability::ModuleStateScope],
                max_items: 1,
            },
            GameplayReadViewRequirement {
                view: contract("trigger-overlaps-view"),
                provider_id: "provider.demo.trigger-overlaps".to_owned(),
                kind: GameplayReadViewKind::OwnerQuery,
                fields: vec!["trigger".to_owned(), "subjects".to_owned()],
                selector_capabilities: vec![
                    GameplayReadSelectorCapability::EventSource,
                    GameplayReadSelectorCapability::OwnerQuery,
                ],
                max_items: 8,
            },
        ],
        proposal_kinds: vec![GameplayProposalDeclaration {
            proposal: StandardGameplayProposalKind::SetCapabilityActivation.contract(),
            owner: StandardGameplayProposalKind::SetCapabilityActivation.owner(),
        }],
        state_schemas: vec![GameplayOwnedSchemaDeclaration {
            schema: contract("challenge-state"),
            owner: owner(),
        }],
        fact_schemas: vec![GameplayOwnedSchemaDeclaration {
            schema: contract("challenge-fact"),
            owner: owner(),
        }],
        ordering: vec![],
        budget: GameplayExecutionBudget {
            max_waves: 2,
            max_events_per_root: 16,
            max_proposals_per_root: 1,
            max_invocations_per_root: 8,
            max_payload_bytes_per_root: 16_384,
        },
        deterministic_requirements: vec!["canonical-json".to_owned(), "no-ts-callback".to_owned()],
        source_hash: "sha256:demo-primary-fire-gameplay-source-v1".to_owned(),
    };
    GameplayStaticModuleProvider::linked_from_manifest(manifest, CloseRangeChallengeBehavior)
        .event_codec(GameplayEventCodecRegistration::typed(
            TypedGameplayEventCodec::new(
                GameplayEventSchemaDeclaration {
                    event: contract("challenge-progressed"),
                    codec_id: "codec.demo.primary-fire-effect.challenge-progressed".to_owned(),
                },
                |payload: &CloseRangeChallengeEvent| {
                    serde_json::to_vec(payload).map_err(|error| error.to_string())
                },
                |bytes| serde_json::from_slice(bytes).map_err(|error| error.to_string()),
            ),
        ))
        .event_codec(GameplayEventCodecRegistration::typed(
            TypedGameplayEventCodec::new(
                GameplayEventSchemaDeclaration {
                    event: contract("console-interacted"),
                    codec_id: "codec.demo.primary-fire-effect.console-interacted".to_owned(),
                },
                |payload: &ConsoleInteractionPayload| {
                    serde_json::to_vec(payload).map_err(|error| error.to_string())
                },
                |bytes| serde_json::from_slice(bytes).map_err(|error| error.to_string()),
            ),
        ))
        .read_view_provider(GameplayReadViewProviderRegistration {
            view: contract("challenge-state-view"),
            provider_id: PROVIDER_ID.to_owned(),
            kind: GameplayReadViewKind::ModuleNamed,
            fields: vec![
                "revision".to_owned(),
                "status".to_owned(),
                "score".to_owned(),
                "closeRangeHits".to_owned(),
            ],
            selector_capabilities: vec![GameplayReadSelectorCapability::ModuleStateScope],
            max_items: 1,
            ordering: "single-session-state".to_owned(),
        })
        .read_view_provider(GameplayReadViewProviderRegistration {
            view: contract("trigger-overlaps-view"),
            provider_id: "provider.demo.trigger-overlaps".to_owned(),
            kind: GameplayReadViewKind::OwnerQuery,
            fields: vec!["trigger".to_owned(), "subjects".to_owned()],
            selector_capabilities: vec![
                GameplayReadSelectorCapability::EventSource,
                GameplayReadSelectorCapability::OwnerQuery,
            ],
            max_items: 8,
            ordering: "entity-id-ascending".to_owned(),
        })
        .state_owner(GameplayStateOwnerRegistration {
            schema: contract("challenge-state"),
            owner: owner(),
        })
        .state_owner(GameplayStateOwnerRegistration {
            schema: contract("challenge-fact"),
            owner: owner(),
        })
        .state_adapter(GameplayModuleStateRegistration::typed(
            CloseRangeChallengeStateAdapter,
        ))
        .configuration_schema(configuration_metadata.clone())
        .configuration_codec(GameplayConfigurationCodecRegistration::typed::<
            CloseRangeChallengeConfig,
        >(configuration_metadata))
}

fn invocation_read_requirements(name: &str) -> Vec<GameplayInvocationReadRequirement> {
    let mut requirements = vec![GameplayInvocationReadRequirement {
        request_id: "challenge-state".to_owned(),
        view: contract("challenge-state-view"),
    }];
    if name == "trigger-entered" {
        requirements.push(GameplayInvocationReadRequirement {
            request_id: "current-trigger-overlaps".to_owned(),
            view: contract("trigger-overlaps-view"),
        });
    }
    requirements
}

fn contract(name: &str) -> GameplayContractRef {
    GameplayContractRef {
        namespace: MODULE_NAMESPACE.to_owned(),
        name: name.to_owned(),
        version: 1,
        schema_hash: format!("sha256:demo.primary-fire-effect.{name}.v1"),
    }
}

fn owner() -> GameplayOwnerRef {
    GameplayOwnerRef {
        owner_id: "authority.demo.primary-fire-effect".to_owned(),
        provider_id: PROVIDER_ID.to_owned(),
    }
}

fn static_ref(name: &str) -> &'static GameplayContractRef {
    static CONFIG: std::sync::OnceLock<GameplayContractRef> = std::sync::OnceLock::new();
    static STATE: std::sync::OnceLock<GameplayContractRef> = std::sync::OnceLock::new();
    static FACT: std::sync::OnceLock<GameplayContractRef> = std::sync::OnceLock::new();
    static VIEW: std::sync::OnceLock<GameplayContractRef> = std::sync::OnceLock::new();
    match name {
        "configuration" => CONFIG.get_or_init(|| contract("configuration")),
        "challenge-state" => STATE.get_or_init(|| contract("challenge-state")),
        "challenge-fact" => FACT.get_or_init(|| contract("challenge-fact")),
        "challenge-state-view" => VIEW.get_or_init(|| contract("challenge-state-view")),
        _ => panic!("unknown static contract"),
    }
}

fn static_owner() -> &'static GameplayOwnerRef {
    static OWNER: std::sync::OnceLock<GameplayOwnerRef> = std::sync::OnceLock::new();
    OWNER.get_or_init(owner)
}

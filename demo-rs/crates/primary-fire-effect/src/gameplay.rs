use asha_gameplay_module_sdk::*;
use asha_runtime_session_composition::{
    BundleArtifacts, GameplayBindingEntityTargets, GameplayRuntimePrefabBootstrap,
    GameplayRuntimePrefabCatalog, GameplayRuntimePrefabOverride, GameplayRuntimePrefabPlacement,
    GameplayRuntimePrefabPlacementOrigin, GameplayRuntimePrefabTransform,
    GameplayRuntimeProjectInput, GameplayRuntimeSchedulerDefinition, GameplayRuntimeSpatialEntity,
    GameplayTriggerDefinition, LoadPlan, LoadStep, RuntimeSessionId, SceneId,
    GAMEPLAY_TRIGGER_DEFINITION_SCHEMA_VERSION,
};
use serde::{Deserialize, Serialize};

const MODULE_ID: &str = "demo.primary-fire-effect";
const MODULE_NAMESPACE: &str = "demo.primary-fire-effect";
const PROVIDER_ID: &str = "provider.demo.primary-fire-effect";
const CHALLENGE_TRIGGER_ENTITY: u64 = 30;
const PRIMARY_FIRE_TRANSFORM_INVOCATION: &str = "demo.primary-fire-effect.primary-fire.transform";

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
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrefabInteractionPayload {
    instance: u64,
    role: String,
    target: u64,
}

struct CloseRangeChallengeBehavior;

impl GameplayModuleBehavior for CloseRangeChallengeBehavior {
    fn invoke(
        &self,
        context: &GameplayModuleContext<'_>,
    ) -> Result<GameplayModuleActions, GameplayModuleError> {
        if context.invocation_id() == PRIMARY_FIRE_TRANSFORM_INVOCATION {
            return transform_primary_fire(context);
        }
        let event = context
            .event_contract()
            .ok_or_else(|| GameplayModuleError {
                code: "missingEventContract".to_owned(),
                message: "close-range challenge requires a typed gameplay event".to_owned(),
            })?;
        if event == &StandardGameplayEventKind::PrefabPartInteracted.contract() {
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
        Err(GameplayModuleError {
            code: "unsupportedEvent".to_owned(),
            message: format!("close-range challenge does not handle {}", event.key()),
        })
    }
}

fn transform_primary_fire(
    context: &GameplayModuleContext<'_>,
) -> Result<GameplayModuleActions, GameplayModuleError> {
    let configuration: CloseRangeChallengeConfig = context.configuration()?;
    let mut workspace: PrimaryFireGameplayDecisionWorkspace = context.decision_workspace()?;
    let close_range_hit = workspace.shooter_role == "player"
        && workspace.target.is_some()
        && workspace
            .range_millimeters
            .is_some_and(|range| range <= configuration.close_range_millimeters);
    if close_range_hit {
        workspace.damage = workspace
            .damage
            .saturating_add(configuration.close_range_bonus);
    }
    let mut actions = context.actions();
    actions.transform_workspace_json(
        StandardGameplayProposalKind::ResolvePrimaryFire.contract(),
        context
            .decision_workspace_hash()
            .ok_or_else(|| GameplayModuleError {
                code: "missingPrimaryFireWorkspaceHash".to_owned(),
                message: "primary-fire Transform requires its coordinator-issued Workspace hash"
                    .to_owned(),
            })?,
        &workspace,
    )?;
    actions.trace(if close_range_hit {
        "closeRangeDamageTransformed"
    } else {
        "baseDamagePreserved"
    });
    Ok(actions)
}

fn record_console_interaction(
    context: &GameplayModuleContext<'_>,
) -> Result<GameplayModuleActions, GameplayModuleError> {
    let payload: PrefabInteractionPayload = context.event_payload()?;
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
    if entity != payload.target {
        return Err(GameplayModuleError {
            code: "prefabPartTargetMismatch".to_owned(),
            message: "resolved prefab-part event target did not match its typed payload".to_owned(),
        });
    }
    let mut actions = context.actions();
    actions.emit(
        &challenge_event_codec(),
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
        context
            .configuration_scope()
            .cloned()
            .unwrap_or(GameplayModuleStateScope::Entity { entity }),
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
    actions.propose(
        &capability_activation_codec(),
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
    let status = if state.score.saturating_add(score_delta) >= state.objective_points {
        "completed"
    } else if action == "challenge-exited" {
        "outside"
    } else {
        "active"
    };
    let mut actions = context.actions();
    actions.emit(
        &challenge_event_codec(),
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
    provider().manifest.module_ref
}

fn base_module_ref() -> GameplayModuleRef {
    GameplayModuleRef {
        module_id: MODULE_ID.to_owned(),
        namespace: MODULE_NAMESPACE.to_owned(),
        version: env!("CARGO_PKG_VERSION").to_owned(),
        sdk_hash: "unbuilt".to_owned(),
        contract_hash: "unbuilt".to_owned(),
        artifact_hash: "unbuilt".to_owned(),
        provider_id: PROVIDER_ID.to_owned(),
    }
}

pub fn gameplay_declared_read_plan_hash() -> String {
    let manifest = provider().manifest;
    let canonical = serde_json::to_vec(&(manifest.invocations, manifest.read_views))
        .expect("derived gameplay read plan serializes");
    gameplay_module_payload_hash(&canonical)
}

pub fn gameplay_declared_reads() -> Vec<GameplayRuntimeDeclaredReadPlan> {
    topology().declared_reads().to_vec()
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
        codec_id: gameplay_canonical_codec_id(&contract("configuration").schema_hash),
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
    let topology = topology();
    let provenance = build_provenance();
    let mut manifest = GameplayModuleManifest {
        module_ref: base_module_ref(),
        published_events: vec![event_declaration(contract("challenge-progressed"))],
        subscriptions: Vec::new(),
        invocations: Vec::new(),
        read_views: Vec::new(),
        proposal_kinds: [
            StandardGameplayProposalKind::ResolvePrimaryFire,
            StandardGameplayProposalKind::SetCapabilityActivation,
        ]
        .into_iter()
        .map(|proposal| GameplayProposalDeclaration {
            proposal: proposal.contract(),
            owner: proposal.owner(),
        })
        .collect(),
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
            max_invocations_per_root: 12,
            max_payload_bytes_per_root: 16_384,
        },
        deterministic_requirements: vec!["canonical-json".to_owned(), "no-ts-callback".to_owned()],
        source_hash: "unbuilt".to_owned(),
    };
    topology
        .apply_to_manifest(&mut manifest)
        .expect("authored Demo topology belongs to the Demo manifest");
    provenance.apply_to_manifest::<CloseRangeChallengeBehavior>(&mut manifest);
    let configuration = GameplaySerdeConfiguration::<CloseRangeChallengeConfig>::new(
        MODULE_ID,
        contract("configuration"),
        vec![
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
    );
    GameplayStaticModuleProvider::linked_from_manifest(
        manifest,
        &provenance,
        CloseRangeChallengeBehavior,
    )
    .event_codec(gameplay_serde_json_codec_registration::<
        CloseRangeChallengeEvent,
    >(
        contract("challenge-progressed"),
        schema_descriptor("challenge-progressed"),
    ))
    .derived_topology(&topology)
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
    .serde_configuration(configuration)
}

fn topology() -> GameplayDerivedModuleTopology {
    let selector = GameplayHeaderSelector {
        source: None,
        target: None,
        scope: None,
        required_tags: Vec::new(),
    };
    let mut invocations = vec![GameplayModuleInvocationTopology::decision(
        PRIMARY_FIRE_TRANSFORM_INVOCATION,
        GameplayInvocationFamily::Transform,
        StandardGameplayProposalKind::ResolvePrimaryFire.contract(),
        StandardGameplayProposalKind::ResolvePrimaryFire.contract(),
        1,
        4_096,
    )];
    for (name, event) in [
        ("trigger-entered", StandardGameplayEventKind::TriggerEntered),
        ("trigger-exited", StandardGameplayEventKind::TriggerExited),
        ("combat-fire-hit", StandardGameplayEventKind::CombatFireHit),
        (
            "combat-fire-missed",
            StandardGameplayEventKind::CombatFireMissed,
        ),
    ] {
        let event_selector = if name.starts_with("combat-") {
            GameplayHeaderSelector {
                required_tags: vec!["shooter-role:player".to_owned()],
                ..selector.clone()
            }
        } else {
            selector.clone()
        };
        let mut invocation = GameplayModuleInvocationTopology::observe(
            format!("demo.primary-fire-effect.{name}"),
            format!("demo.primary-fire-effect.{name}.observe"),
            event.contract(),
            contract("challenge-progressed"),
            event_selector,
            4,
            3,
            4_096,
        )
        .read(challenge_state_read());
        if name == "trigger-entered" {
            invocation = invocation.read(trigger_overlap_read());
        }
        invocations.push(invocation);
    }
    invocations.push(GameplayModuleInvocationTopology::observe(
        "demo.primary-fire-effect.prefab-part-interacted",
        "demo.primary-fire-effect.prefab-part-interacted.observe",
        StandardGameplayEventKind::PrefabPartInteracted.contract(),
        contract("challenge-progressed"),
        GameplayHeaderSelector {
            required_tags: vec!["prefab-part".to_owned()],
            ..selector
        },
        2,
        2,
        2_048,
    ));
    GameplayDerivedModuleTopology::derive(MODULE_ID, invocations)
        .expect("Demo gameplay topology is unambiguous")
}

fn challenge_state_read() -> GameplayModuleReadTopology {
    gameplay_session_state_read(
        "challenge-state",
        contract("challenge-state-view"),
        PROVIDER_ID,
        vec![
            "revision".to_owned(),
            "status".to_owned(),
            "score".to_owned(),
            "closeRangeHits".to_owned(),
        ],
        "single-session-state",
    )
}

fn trigger_overlap_read() -> GameplayModuleReadTopology {
    GameplayModuleReadTopology {
        request: GameplayReadRequest {
            request_id: "current-trigger-overlaps".to_owned(),
            view: contract("trigger-overlaps-view"),
            fields: vec!["trigger".to_owned(), "subjects".to_owned()],
            selector: GameplayReadSelector::OwnerQuery {
                query: GameplayOwnerQuery::CurrentTriggerOverlaps {
                    trigger: GameplayEventEntityBinding::Source,
                    max_items: 8,
                },
            },
        },
        provider_id: "provider.demo.trigger-overlaps".to_owned(),
        kind: GameplayReadViewKind::OwnerQuery,
        selector_capabilities: vec![
            GameplayReadSelectorCapability::EventSource,
            GameplayReadSelectorCapability::OwnerQuery,
        ],
        max_items: 8,
        ordering: "entity-id-ascending".to_owned(),
    }
}

pub fn gameplay_runtime_project_input() -> GameplayRuntimeProjectInput {
    GameplayRuntimeProjectInput {
        load_plan: LoadPlan {
            steps: vec![
                LoadStep::ValidateVersions {
                    bundle_schema_version: 1,
                    protocol_version: 1,
                },
                LoadStep::LoadAssetLock {
                    artifact: "assets/lock.json".to_owned(),
                    asset_count: 0,
                },
                LoadStep::LoadSceneDocument {
                    artifact: "scene/scene.json".to_owned(),
                    scene: SceneId::new(4103),
                },
                LoadStep::BootstrapScene {
                    scene: SceneId::new(4103),
                    runtime_session: RuntimeSessionId::new(4103),
                },
                LoadStep::ValidateFinalState,
            ],
        },
        artifacts: BundleArtifacts::new()
            .with_artifact("assets/lock.json", "{\"entries\":[]}")
            .with_artifact("scene/scene.json", gameplay_scene_artifact()),
        composition: gameplay_composition().expect("Demo gameplay composition is valid"),
        composition_requirement: Some(gameplay_project_composition_requirement()),
        bindings: gameplay_authored_binding_registry(),
        entity_targets: GameplayBindingEntityTargets::new(),
        spatial_entities: vec![GameplayRuntimeSpatialEntity {
            entity: EntityId::new(CHALLENGE_TRIGGER_ENTITY),
            translation: [0.0, 1.5, 0.0],
            half_extents: [0.65, 0.9, 0.45],
            static_collider: false,
        }],
        declared_reads: gameplay_declared_reads(),
        triggers: vec![GameplayTriggerDefinition {
            schema_version: GAMEPLAY_TRIGGER_DEFINITION_SCHEMA_VERSION,
            entity: CHALLENGE_TRIGGER_ENTITY,
            scope: "encounter.close-range".to_owned(),
            tags: vec![
                "challenge".to_owned(),
                "close-range".to_owned(),
                "generated-tunnel".to_owned(),
            ],
        }],
        scheduler: GameplayRuntimeSchedulerDefinition::new(
            GameplayOwnerRef {
                owner_id: "authority.asha-demo.scheduler".to_owned(),
                provider_id: "provider.asha-demo.runtime-session".to_owned(),
            },
            vec![StandardGameplayEventKind::CombatFireHit.contract()],
            vec![
                StandardGameplayProposalKind::ResolvePrimaryFire.contract(),
                StandardGameplayProposalKind::SetCapabilityActivation.contract(),
            ],
        ),
    }
}

pub fn gameplay_project_composition_requirement() -> GameplayCompositionRequirement {
    let project_bundle: serde_json::Value =
        serde_json::from_str(include_str!("../../../../project/project-bundle.json"))
            .expect("Demo ProjectBundle is valid JSON");
    serde_json::from_value(project_bundle["gameplayRuntime"]["compositionRequirement"].clone())
        .expect("Demo ProjectBundle carries a typed gameplay composition requirement")
}

pub fn gameplay_runtime_prefab_bootstrap() -> GameplayRuntimePrefabBootstrap {
    GameplayRuntimePrefabBootstrap {
        registry_json: include_str!("../../../../prefabs/registry.json").to_owned(),
        catalog: GameplayRuntimePrefabCatalog {
            asset_ids: Vec::new(),
            entity_definition_ids: vec![
                "demo.console.body".to_owned(),
                "demo.console.body.blue".to_owned(),
                "demo.console.body.red".to_owned(),
                "demo.console.sensor".to_owned(),
            ],
        },
        placements: vec![
            GameplayRuntimePrefabPlacement {
                command_id: "demo.place-prefab.700".to_owned(),
                origin: GameplayRuntimePrefabPlacementOrigin::Authored,
                instance: 700,
                prefab: 70,
                seed: 4103,
                transform: GameplayRuntimePrefabTransform {
                    translation: [-2.0, 0.0, -1.0],
                    ..GameplayRuntimePrefabTransform::IDENTITY
                },
                overrides: vec![GameplayRuntimePrefabOverride::EntityDefinition {
                    target_role: "console/body".to_owned(),
                    stable_id: "demo.console.body.blue".to_owned(),
                }],
            },
            GameplayRuntimePrefabPlacement {
                command_id: "demo.place-prefab.701".to_owned(),
                origin: GameplayRuntimePrefabPlacementOrigin::Player,
                instance: 701,
                prefab: 70,
                seed: 4104,
                transform: GameplayRuntimePrefabTransform {
                    translation: [2.0, 0.0, -1.0],
                    ..GameplayRuntimePrefabTransform::IDENTITY
                },
                overrides: vec![GameplayRuntimePrefabOverride::EntityDefinition {
                    target_role: "console/body".to_owned(),
                    stable_id: "demo.console.body.red".to_owned(),
                }],
            },
        ],
    }
}

pub fn gameplay_challenge_view_contract() -> GameplayContractRef {
    contract("challenge-state-view")
}

pub fn gameplay_composition_hash() -> String {
    gameplay_composition()
        .expect("Demo gameplay composition is valid")
        .registry()
        .registry_digest()
        .to_owned()
}

fn build_provenance() -> GameplayModuleBuildProvenance {
    GameplayModuleBuildProvenance::from_build_inputs(
        env!("CARGO_PKG_NAME"),
        env!("CARGO_PKG_VERSION"),
        &[
            include_bytes!("gameplay.rs"),
            include_bytes!("lib.rs"),
            include_bytes!("../../../../prefabs/registry.json"),
        ],
        include_bytes!("../../../Cargo.lock"),
        &[],
    )
}

fn event_declaration(event: GameplayContractRef) -> GameplayEventSchemaDeclaration {
    GameplayEventSchemaDeclaration {
        codec_id: gameplay_canonical_codec_id(&event.schema_hash),
        event,
    }
}

fn schema_descriptor(name: &str) -> String {
    format!("asha-demo:{MODULE_NAMESPACE}.{name};canonical-json-v1")
}

fn challenge_event_codec() -> TypedGameplayEventCodec<CloseRangeChallengeEvent> {
    gameplay_serde_json_codec(
        contract("challenge-progressed"),
        schema_descriptor("challenge-progressed"),
    )
}

fn capability_activation_codec() -> TypedGameplayEventCodec<CapabilityActivationGameplayProposal> {
    let proposal = StandardGameplayProposalKind::SetCapabilityActivation;
    gameplay_serde_json_codec(proposal.contract(), proposal.schema_descriptor())
}

fn contract(name: &str) -> GameplayContractRef {
    gameplay_contract(MODULE_NAMESPACE, name, 1, &schema_descriptor(name))
}

fn gameplay_scene_artifact() -> &'static str {
    r#"{
      "schemaVersion": 1,
      "id": 4103,
      "metadata": { "name": "asha-demo-composed-runtime", "authoringFormatVersion": 1 },
      "dependencies": [],
      "nodes": [
        { "id": 1, "parent": null, "childOrder": 0, "label": null, "tags": [], "transform": { "translation": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] }, "kind": { "kind": "emptyGroup" } }
      ]
    }"#
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

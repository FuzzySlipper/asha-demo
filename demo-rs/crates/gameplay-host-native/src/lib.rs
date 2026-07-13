use std::cell::RefCell;

use asha_demo_primary_fire_effect::{
    gameplay_authored_binding_registry, gameplay_composition, gameplay_declared_read_plan_hash,
};
use asha_gameplay_module_sdk::{
    gameplay_module_payload_hash, EntityId, GameplayCausationRef, GameplayContractRef,
    GameplayEmitterRef, GameplayEntityRef, GameplayEventEnvelope, GameplayEventPhase,
    GameplayModuleBindingRegistry, GameplayModuleStateScope, GameplayOwnerQuery,
    GameplayReadRequest, GameplayReadSelector, StandardGameplayEventKind,
};
use asha_gameplay_runtime_host::{
    BundleArtifacts, EventConditionedActionDraft, GameplayBindingEntityTargets,
    GameplayRuntimeDeclaredReadPlan, GameplayRuntimeHost, GameplayRuntimeHostReadout,
    GameplayRuntimePrefabBootstrap, GameplayRuntimeProjectInput,
    GameplayRuntimeSchedulerDefinition, GameplayRuntimeSpatialEntity, GameplaySchedulerCommand,
    GameplayTriggerDefinition, LoadPlan, LoadStep, RuntimeSessionId, SceneId, ScheduledActionId,
    ScheduledActionValidity, TickScheduledActionDraft,
};
use napi_derive::napi;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};

#[cfg(test)]
use asha_demo_primary_fire_effect::gameplay_session_conformance_binding_registry;
#[cfg(test)]
use asha_gameplay_module_sdk::{
    CapabilityActivationGameplayProposal, GameplayOwnerRef, GameplayProposalEnvelope,
    StandardGameplayProposalKind,
};

thread_local! {
    static HOST: RefCell<Option<GameplayRuntimeHost>> = const { RefCell::new(None) };
}

const PLAYER_ENTITY: u64 = 10;
const ENEMY_ENTITY: u64 = 20;
const CHALLENGE_TRIGGER_ENTITY: u64 = 30;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeLoadInput {
    kind: String,
    project_id: String,
    composition_hash: String,
    declared_read_plan_hash: String,
    bindings: GameplayModuleBindingRegistry,
    triggers: Vec<GameplayTriggerDefinition>,
    scheduler: GameplayRuntimeSchedulerDefinition,
    prefabs: GameplayRuntimePrefabBootstrap,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum NativeMoment {
    Tick {
        tick: u64,
    },
    ActorMovement {
        tick: u64,
        actor: u64,
        delta: [f32; 3],
    },
    OwnerEvent {
        event: Box<GameplayEventEnvelope>,
    },
    PrefabInteraction {
        tick: u64,
        instance: u64,
        role: String,
    },
    SchedulerCommand {
        command: Box<NativeSchedulerCommand>,
    },
    SchedulerRoute {
        action_id: String,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum NativeSchedulerCommand {
    ScheduleTick {
        action: TickScheduledActionDraft,
    },
    ScheduleEventConditioned {
        action: EventConditionedActionDraft,
    },
    ExecuteTick {
        action_id: String,
        tick: u64,
        targets_present: bool,
        causation_current: bool,
    },
    TriggerEvent {
        action_id: String,
        event: GameplayEventEnvelope,
        targets_present: bool,
        causation_current: bool,
    },
    Timeout {
        action_id: String,
        tick: u64,
    },
    Cancel {
        action_id: String,
        reason: String,
    },
}

impl NativeSchedulerCommand {
    fn into_authority_command(self) -> GameplaySchedulerCommand {
        match self {
            Self::ScheduleTick { action } => GameplaySchedulerCommand::ScheduleTick(action),
            Self::ScheduleEventConditioned { action } => {
                GameplaySchedulerCommand::ScheduleEventConditioned(action)
            }
            Self::ExecuteTick {
                action_id,
                tick,
                targets_present,
                causation_current,
            } => GameplaySchedulerCommand::ExecuteTick {
                action_id: ScheduledActionId::new(action_id),
                tick,
                validity: ScheduledActionValidity {
                    targets_present,
                    causation_current,
                },
            },
            Self::TriggerEvent {
                action_id,
                event,
                targets_present,
                causation_current,
            } => GameplaySchedulerCommand::TriggerEvent {
                action_id: ScheduledActionId::new(action_id),
                event,
                validity: ScheduledActionValidity {
                    targets_present,
                    causation_current,
                },
            },
            Self::Timeout { action_id, tick } => GameplaySchedulerCommand::Timeout {
                action_id: ScheduledActionId::new(action_id),
                tick,
            },
            Self::Cancel { action_id, reason } => GameplaySchedulerCommand::Cancel {
                action_id: ScheduledActionId::new(action_id),
                reason,
            },
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeSnapshot {
    kind: String,
    canonical_text: String,
    snapshot_hash: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WeaponEffectRequest {
    hook: WeaponHook,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WeaponHook {
    tick: u64,
    source: u64,
    target: Option<u64>,
    range_millimeters: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WeaponEffectResult {
    primary_fire: Option<PrimaryFireResult>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrimaryFireResult {
    shooter: u64,
    target: Option<u64>,
    target_health_before: Option<Health>,
    target_health_after: Option<Health>,
    replay_hash: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Health {
    current: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CombatPayload {
    shooter: Option<u64>,
    target: Option<u64>,
    distance: Option<f64>,
    miss_reason: Option<String>,
    damage: Option<u32>,
    health_before: Option<u32>,
    health_after: Option<u32>,
    defeated: bool,
    tick: u64,
    combat_replay_hash: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LifecyclePayload {
    entity: u64,
    action: String,
    source_kind: Option<String>,
    labels: Vec<u64>,
}

#[napi]
pub fn gameplay_host_descriptor() -> napi::Result<String> {
    let composition = gameplay_composition().map_err(napi_error)?;
    encode_json(&json!({
        "kind": "asha_demo.gameplay_host_descriptor.v1",
        "compositionHash": composition.registry().registry_digest(),
        "declaredReadPlanHash": gameplay_declared_read_plan_hash(),
        "bindings": gameplay_authored_binding_registry(),
        "triggers": [{
            "schemaVersion": 1,
            "entity": CHALLENGE_TRIGGER_ENTITY,
            "scope": "encounter.close-range",
            "tags": ["challenge", "close-range", "generated-tunnel"]
        }],
        "playerEntity": PLAYER_ENTITY,
        "enemyEntity": ENEMY_ENTITY,
        "challengeTriggerEntity": CHALLENGE_TRIGGER_ENTITY,
    }))
}

#[napi]
pub fn gameplay_host_load(input_json: String) -> napi::Result<String> {
    let input: NativeLoadInput = decode_json(&input_json)?;
    let prefabs = input.prefabs.clone();
    let staged = match validate_and_build_project(input.clone()) {
        Ok(project) => GameplayRuntimeHost::activate_project_with_prefabs(project, prefabs),
        Err(error) => return encode_json(&load_receipt(false, vec![error], None)),
    };
    match staged {
        Ok(host) => {
            let readout = readout_with_recent_frames(&host);
            HOST.with(|slot| slot.replace(Some(host)));
            encode_json(&load_receipt(true, vec![], Some(readout)))
        }
        Err(error) => encode_json(&load_receipt(false, vec![error.to_string()], None)),
    }
}

#[napi]
pub fn gameplay_host_advance(moment_json: String) -> napi::Result<String> {
    let moment: NativeMoment = decode_json(&moment_json)?;
    HOST.with(|slot| {
        let mut borrowed = slot.borrow_mut();
        let host = borrowed
            .as_mut()
            .ok_or_else(|| napi_error("gameplay host is not loaded"))?;
        let result = advance_host(host, &moment);
        let readout = host.readout();
        match result {
            Ok(frames) => encode_json(&advance_receipt(true, vec![], &moment, frames, readout)),
            Err(error) => encode_json(&advance_receipt(
                false,
                vec![error],
                &moment,
                vec![],
                readout,
            )),
        }
    })
}

#[napi]
pub fn gameplay_host_read() -> napi::Result<String> {
    with_host(|host| encode_json(&readout_with_recent_frames(host)))
}

#[napi]
pub fn gameplay_host_save() -> napi::Result<String> {
    with_host(|host| {
        let snapshot = host.compose_snapshot().map_err(napi_error)?;
        encode_json(&json!({
            "kind": "gameplay_runtime_host.snapshot.v1",
            "canonicalText": snapshot.text,
            "snapshotHash": gameplay_module_payload_hash(snapshot.text.as_bytes()),
        }))
    })
}

#[napi]
pub fn gameplay_host_restore(input_json: String, snapshot_json: String) -> napi::Result<String> {
    let input: NativeLoadInput = decode_json(&input_json)?;
    let snapshot: NativeSnapshot = decode_json(&snapshot_json)?;
    if snapshot.kind != "gameplay_runtime_host.snapshot.v1"
        || snapshot.snapshot_hash
            != gameplay_module_payload_hash(snapshot.canonical_text.as_bytes())
    {
        return encode_json(&load_receipt(
            false,
            vec!["snapshot hash or kind mismatch".to_owned()],
            None,
        ));
    }
    let prefabs = input.prefabs.clone();
    let project = match validate_and_build_project(input) {
        Ok(project) => project,
        Err(error) => return encode_json(&load_receipt(false, vec![error], None)),
    };
    match GameplayRuntimeHost::restore_project_with_prefabs(
        project,
        prefabs,
        &snapshot.canonical_text,
    ) {
        Ok(host) => {
            let readout = readout_with_recent_frames(&host);
            HOST.with(|slot| slot.replace(Some(host)));
            encode_json(&load_receipt(true, vec![], Some(readout)))
        }
        Err(error) => encode_json(&load_receipt(false, vec![error.to_string()], None)),
    }
}

#[napi]
pub fn gameplay_host_observe_weapon_effect(
    request_json: String,
    result_json: String,
) -> napi::Result<String> {
    let request: WeaponEffectRequest = decode_json(&request_json)?;
    let result: WeaponEffectResult = decode_json(&result_json)?;
    let Some(primary_fire) = result.primary_fire else {
        return encode_json(&json!([]));
    };
    let events = combat_events(&request.hook, &primary_fire)?;
    HOST.with(|slot| {
        let mut borrowed = slot.borrow_mut();
        let host = borrowed
            .as_mut()
            .ok_or_else(|| napi_error("gameplay host is not loaded"))?;
        let mut receipts = Vec::with_capacity(events.len());
        for event in events {
            let moment = NativeMoment::OwnerEvent {
                event: Box::new(event),
            };
            let frames = advance_host(host, &moment).map_err(napi_error)?;
            receipts.push(advance_receipt(
                true,
                vec![],
                &moment,
                frames,
                host.readout(),
            ));
        }
        encode_json(&receipts)
    })
}

fn validate_and_build_project(
    input: NativeLoadInput,
) -> Result<GameplayRuntimeProjectInput, String> {
    if input.kind != "gameplay_runtime_host.load.v1" || input.project_id != "asha-demo" {
        return Err("gameplay host load kind/project mismatch".to_owned());
    }
    let composition = gameplay_composition().map_err(|error| error.to_string())?;
    if input.composition_hash != composition.registry().registry_digest() {
        return Err("static gameplay composition hash mismatch".to_owned());
    }
    if input.declared_read_plan_hash != gameplay_declared_read_plan_hash() {
        return Err("declared gameplay read-plan hash mismatch".to_owned());
    }
    build_project_input(composition, input.bindings, input.triggers, input.scheduler)
}

fn build_project_input(
    composition: asha_gameplay_module_sdk::GameplayStaticComposition,
    bindings: GameplayModuleBindingRegistry,
    triggers: Vec<GameplayTriggerDefinition>,
    scheduler: GameplayRuntimeSchedulerDefinition,
) -> Result<GameplayRuntimeProjectInput, String> {
    Ok(GameplayRuntimeProjectInput {
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
            .with_artifact("scene/scene.json", scene_artifact()),
        composition,
        bindings,
        entity_targets: GameplayBindingEntityTargets::new(),
        spatial_entities: vec![
            GameplayRuntimeSpatialEntity {
                entity: EntityId::new(PLAYER_ENTITY),
                translation: [0.0, 1.62, 1.5],
                half_extents: [0.25, 0.7, 0.25],
                static_collider: false,
            },
            GameplayRuntimeSpatialEntity {
                entity: EntityId::new(ENEMY_ENTITY),
                translation: [0.0, 0.5, -2.6],
                half_extents: [0.25, 0.5, 0.25],
                static_collider: false,
            },
            GameplayRuntimeSpatialEntity {
                entity: EntityId::new(CHALLENGE_TRIGGER_ENTITY),
                translation: [0.0, 1.5, 0.0],
                half_extents: [0.65, 0.9, 0.45],
                static_collider: false,
            },
        ],
        declared_reads: declared_reads(),
        triggers,
        scheduler,
    })
}

fn declared_reads() -> Vec<GameplayRuntimeDeclaredReadPlan> {
    let names = [
        "trigger-entered",
        "trigger-exited",
        "combat-fire-hit",
        "combat-fire-missed",
        "combat-defeated",
        "lifecycle-changed",
    ];
    names
        .into_iter()
        .map(|name| {
            let mut requests = vec![GameplayReadRequest {
                request_id: "challenge-state".to_owned(),
                view: module_contract("challenge-state-view"),
                fields: vec![
                    "revision".to_owned(),
                    "status".to_owned(),
                    "score".to_owned(),
                    "closeRangeHits".to_owned(),
                ],
                selector: GameplayReadSelector::ModuleNamed {
                    scope: GameplayModuleStateScope::Session,
                },
            }];
            if name == "trigger-entered" {
                requests.push(GameplayReadRequest {
                    request_id: "current-trigger-overlaps".to_owned(),
                    view: module_contract("trigger-overlaps-view"),
                    fields: vec!["trigger".to_owned(), "subjects".to_owned()],
                    selector: GameplayReadSelector::OwnerQuery {
                        query: GameplayOwnerQuery::CurrentTriggerOverlaps {
                            trigger: asha_gameplay_module_sdk::GameplayEventEntityBinding::Source,
                            max_items: 8,
                        },
                    },
                });
            }
            GameplayRuntimeDeclaredReadPlan {
                module_id: "demo.primary-fire-effect".to_owned(),
                invocation_id: format!("demo.primary-fire-effect.{name}.observe"),
                requests,
            }
        })
        .collect()
}

fn advance_host(
    host: &mut GameplayRuntimeHost,
    moment: &NativeMoment,
) -> Result<Vec<JsonValue>, String> {
    match moment {
        NativeMoment::Tick { tick } => host
            .tick(*tick)
            .map(|receipt| vec![frame_json(receipt.frame)])
            .map_err(|error| error.to_string()),
        NativeMoment::ActorMovement { tick, actor, delta } => host
            .move_actor_and_reconcile(EntityId::new(*actor), *delta, *tick)
            .map(|receipt| {
                receipt
                    .triggers
                    .reactions
                    .into_iter()
                    .map(|reaction| frame_json(reaction.frame))
                    .collect()
            })
            .map_err(|error| error.to_string()),
        NativeMoment::OwnerEvent { event } => host
            .observe(event.as_ref().clone())
            .map(|receipt| vec![frame_json(receipt.frame)])
            .map_err(|error| error.to_string()),
        NativeMoment::PrefabInteraction {
            tick,
            instance,
            role,
        } => {
            let prefabs = host.prefab_readout();
            let active_instance = prefabs
                .instances
                .iter()
                .find(|candidate| candidate.instance == *instance)
                .ok_or_else(|| "prefab interaction instance is not active".to_owned())?;
            let target = active_instance
                .roles
                .iter()
                .find(|candidate| candidate.role == *role)
                .ok_or_else(|| "prefab interaction role is not resolved".to_owned())?
                .entity;
            let event = owner_event(
                module_contract("console-interacted"),
                &json!({ "instance": instance, "role": role }),
                *tick,
                0,
                target,
                Some(target),
                vec!["prefab-part".to_owned(), "interaction".to_owned()],
            )
            .map_err(|error| error.to_string())?;
            host.observe(event)
                .map(|receipt| vec![frame_json(receipt.frame)])
                .map_err(|error| error.to_string())
        }
        NativeMoment::SchedulerCommand { command } => host
            .apply_scheduler_command(command.as_ref().clone().into_authority_command())
            .map(|_| Vec::new())
            .map_err(|error| error.to_string()),
        NativeMoment::SchedulerRoute { action_id } => host
            .route_scheduled_action(&ScheduledActionId::new(action_id.clone()))
            .map(|_| Vec::new())
            .map_err(|error| error.to_string()),
    }
}

fn combat_events(
    hook: &WeaponHook,
    result: &PrimaryFireResult,
) -> napi::Result<Vec<GameplayEventEnvelope>> {
    if result.shooter != hook.source {
        return Err(napi_error(
            "weapon hook source does not match authoritative shooter",
        ));
    }
    if result.target.is_some() && result.target != hook.target {
        return Err(napi_error(
            "weapon hook target does not match authoritative hit target",
        ));
    }
    if result.target.is_none() {
        let payload = CombatPayload {
            shooter: Some(result.shooter),
            target: None,
            distance: None,
            miss_reason: Some("noTarget".to_owned()),
            damage: None,
            health_before: result
                .target_health_before
                .as_ref()
                .map(|health| health.current),
            health_after: result
                .target_health_after
                .as_ref()
                .map(|health| health.current),
            defeated: false,
            tick: hook.tick,
            combat_replay_hash: parse_hash_u64(&result.replay_hash)?,
        };
        return Ok(vec![owner_event(
            StandardGameplayEventKind::CombatFireMissed.contract(),
            &payload,
            hook.tick,
            0,
            result.shooter,
            None,
            vec!["missed".to_owned(), "no-target".to_owned()],
        )?]);
    }
    let target = result.target;
    let target_before = result
        .target_health_before
        .as_ref()
        .map(|health| health.current);
    let target_after = result
        .target_health_after
        .as_ref()
        .map(|health| health.current);
    let defeated = target_after == Some(0);
    let damage = target_before
        .zip(target_after)
        .map(|(before, after)| before.saturating_sub(after));
    let payload = CombatPayload {
        shooter: Some(result.shooter),
        target,
        distance: Some(f64::from(hook.range_millimeters) / 1_000.0),
        miss_reason: None,
        damage,
        health_before: target_before,
        health_after: target_after,
        defeated,
        tick: hook.tick,
        combat_replay_hash: parse_hash_u64(&result.replay_hash)?,
    };
    let mut events = vec![owner_event(
        StandardGameplayEventKind::CombatFireHit.contract(),
        &payload,
        hook.tick,
        0,
        result.shooter,
        target,
        vec!["hit".to_owned()],
    )?];
    if defeated {
        events.push(owner_event(
            StandardGameplayEventKind::CombatEntityDefeated.contract(),
            &payload,
            hook.tick,
            1,
            result.shooter,
            target,
            vec!["defeated".to_owned()],
        )?);
        events.push(owner_event(
            StandardGameplayEventKind::EntityLifecycleChanged.contract(),
            &LifecyclePayload {
                entity: target.unwrap_or(ENEMY_ENTITY),
                action: "disabled".to_owned(),
                source_kind: Some("combat".to_owned()),
                labels: vec![],
            },
            hook.tick,
            2,
            result.shooter,
            target,
            vec!["lifecycle".to_owned(), "disabled".to_owned()],
        )?);
    }
    Ok(events)
}

fn owner_event<T: Serialize>(
    contract: GameplayContractRef,
    payload: &T,
    tick: u64,
    ordinal: u32,
    source: u64,
    target: Option<u64>,
    tags: Vec<String>,
) -> napi::Result<GameplayEventEnvelope> {
    let canonical_payload = serde_json::to_vec(payload).map_err(napi_error)?;
    let root_id = format!("asha-demo.combat:{tick}:{ordinal}");
    Ok(GameplayEventEnvelope {
        event_id: format!("{root_id}:{ordinal}"),
        event: contract,
        tick,
        root_sequence: tick,
        wave: 0,
        event_sequence: ordinal,
        phase: GameplayEventPhase::PostCommit,
        emitter: GameplayEmitterRef::Owner {
            owner_id: "rule-lifecycle".to_owned(),
        },
        causation: GameplayCausationRef {
            root_id,
            parent_event_id: None,
            decision_id: None,
        },
        source: Some(entity_ref(source)),
        subjects: target.map(entity_ref).into_iter().collect(),
        targets: target.map(entity_ref).into_iter().collect(),
        scope: Some("combat".to_owned()),
        tags,
        payload_hash: gameplay_module_payload_hash(&canonical_payload),
        canonical_payload,
    })
}

fn frame_json(frame: impl Serialize) -> JsonValue {
    let value = serde_json::to_value(frame).expect("reaction frame serializes");
    json!({
        "frameHash": value["frameHash"],
        "registryDigest": value["registryDigest"],
        "deliveredEvents": value["deliveredEvents"],
        "frozenViewHashes": value["frozenViewHashes"],
        "invocationOutputHashes": value["invocationOutputHashes"],
        "routing": value["routingReceipts"],
        "acceptedModuleFactHashes": value["acceptedModuleFactHashes"],
        "stateHashBefore": value["stateHashBefore"],
        "stateHashAfter": value["stateHashAfter"],
        "finalSessionHash": value["finalSessionHash"],
        "diagnosticCodes": value["diagnosticCodes"],
    })
}

fn readout_json(readout: GameplayRuntimeHostReadout) -> JsonValue {
    json!({
        "kind": "gameplay_runtime_host.readout.v1",
        "gameplayRegistryDigest": readout.gameplay_registry_digest,
        "bindingRegistryHash": readout.binding_registry_hash,
        "activationHash": readout.activation_hash,
        "moduleStateHash": readout.module_state_hash,
        "authorityStateHash": readout.authority_state_hash,
        "triggerRevision": readout.trigger_revision,
        "triggerSnapshotHash": readout.trigger_snapshot_hash,
        "activeOverlapCount": readout.active_overlap_count,
        "reactionFrameCount": readout.reaction_frame_count,
        "lastReactionFrameHash": readout.last_reaction_frame_hash,
        "recentFrames": [],
        "scheduler": readout.scheduler,
        "runtimeHostHash": readout.runtime_host_hash,
    })
}

fn readout_with_recent_frames(host: &GameplayRuntimeHost) -> JsonValue {
    let mut readout = readout_json(host.readout());
    let frames = host
        .reaction_frames()
        .iter()
        .rev()
        .take(32)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .map(frame_json)
        .collect::<Vec<_>>();
    readout["recentFrames"] = JsonValue::Array(frames);
    readout["prefabs"] =
        serde_json::to_value(host.prefab_readout()).expect("prefab readout serializes");
    readout["moduleStates"] = serde_json::to_value(host.module_state_readouts())
        .expect("module-state readouts serialize");
    readout
}

fn load_receipt(accepted: bool, diagnostics: Vec<String>, readout: Option<JsonValue>) -> JsonValue {
    json!({
        "kind": "gameplay_runtime_host.load_receipt.v1",
        "accepted": accepted,
        "diagnostics": diagnostics,
        "readout": readout,
    })
}

fn advance_receipt(
    accepted: bool,
    diagnostics: Vec<String>,
    moment: &NativeMoment,
    frames: Vec<JsonValue>,
    readout: GameplayRuntimeHostReadout,
) -> JsonValue {
    json!({
        "kind": "gameplay_runtime_host.advance_receipt.v1",
        "accepted": accepted,
        "diagnostics": diagnostics,
        "moment": moment,
        "frames": frames,
        "readout": readout_json(readout),
    })
}

fn with_host<T>(
    operation: impl FnOnce(&GameplayRuntimeHost) -> napi::Result<T>,
) -> napi::Result<T> {
    HOST.with(|slot| {
        let borrowed = slot.borrow();
        let host = borrowed
            .as_ref()
            .ok_or_else(|| napi_error("gameplay host is not loaded"))?;
        operation(host)
    })
}

fn entity_ref(entity: u64) -> GameplayEntityRef {
    GameplayEntityRef {
        entity: EntityId::new(entity),
    }
}

fn module_contract(name: &str) -> GameplayContractRef {
    GameplayContractRef {
        namespace: "demo.primary-fire-effect".to_owned(),
        name: name.to_owned(),
        version: 1,
        schema_hash: format!("sha256:demo.primary-fire-effect.{name}.v1"),
    }
}

fn parse_hash_u64(value: &str) -> napi::Result<u64> {
    let hex = value
        .strip_prefix("fnv1a64:")
        .ok_or_else(|| napi_error("combat replay hash must use fnv1a64"))?;
    u64::from_str_radix(hex, 16).map_err(napi_error)
}

fn scene_artifact() -> &'static str {
    r#"{
      "schemaVersion": 1,
      "id": 4103,
      "metadata": { "name": "asha-demo-gameplay-host", "authoringFormatVersion": 1 },
      "dependencies": [],
      "nodes": [
        { "id": 1, "parent": null, "childOrder": 0, "label": null, "tags": [], "transform": { "translation": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1] }, "kind": { "kind": "emptyGroup" } }
      ]
    }"#
}

fn decode_json<T: for<'de> Deserialize<'de>>(text: &str) -> napi::Result<T> {
    serde_json::from_str(text).map_err(napi_error)
}

fn encode_json<T: Serialize>(value: &T) -> napi::Result<String> {
    serde_json::to_string(value).map_err(napi_error)
}

fn napi_error(error: impl std::fmt::Display) -> napi::Error {
    napi::Error::from_reason(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scheduler_definition() -> GameplayRuntimeSchedulerDefinition {
        GameplayRuntimeSchedulerDefinition::new(
            GameplayOwnerRef {
                owner_id: "authority.asha-demo.scheduler".to_owned(),
                provider_id: "provider.asha-demo.gameplay-host".to_owned(),
            },
            vec![StandardGameplayEventKind::CombatFireHit.contract()],
            vec![StandardGameplayProposalKind::SetCapabilityActivation.contract()],
        )
    }

    fn test_project_input() -> GameplayRuntimeProjectInput {
        build_project_input(
            gameplay_composition().expect("demo composition"),
            gameplay_session_conformance_binding_registry(),
            Vec::new(),
            scheduler_definition(),
        )
        .expect("demo project input")
    }

    fn scheduled_enemy_collision_deactivation() -> TickScheduledActionDraft {
        let payload = CapabilityActivationGameplayProposal {
            entity: ENEMY_ENTITY,
            capability: "collision".to_owned(),
            action: "deactivate".to_owned(),
        };
        let canonical_payload = serde_json::to_vec(&payload).expect("proposal serializes");
        TickScheduledActionDraft {
            id: ScheduledActionId::new("asha-demo.scheduler.disable-enemy-collision"),
            execute_at: 5,
            priority: 0,
            proposal: GameplayProposalEnvelope {
                proposal_id: "asha-demo.scheduler.disable-enemy-collision.proposal".to_owned(),
                proposal: StandardGameplayProposalKind::SetCapabilityActivation.contract(),
                tick: 0,
                root_sequence: 5,
                wave: 0,
                proposal_sequence: 0,
                emitter: GameplayEmitterRef::Scheduler {
                    scheduler_id: "authority.asha-demo.scheduler".to_owned(),
                },
                causation: GameplayCausationRef {
                    root_id: "asha-demo.scheduler.proof".to_owned(),
                    parent_event_id: None,
                    decision_id: None,
                },
                originating_event_id: None,
                source: None,
                targets: vec![entity_ref(ENEMY_ENTITY)],
                canonical_payload: canonical_payload.clone(),
                payload_hash: gameplay_module_payload_hash(&canonical_payload),
            },
            source: GameplayEmitterRef::Scheduler {
                scheduler_id: "authority.asha-demo.scheduler".to_owned(),
            },
            causation: GameplayCausationRef {
                root_id: "asha-demo.scheduler.proof".to_owned(),
                parent_event_id: None,
                decision_id: None,
            },
        }
    }

    #[test]
    fn public_scheduler_dispatch_survives_restore_and_routes_exactly_once() {
        let mut host = GameplayRuntimeHost::activate_project(test_project_input()).unwrap();
        let initial = host.readout();
        host.apply_scheduler_command(GameplaySchedulerCommand::ScheduleTick(
            scheduled_enemy_collision_deactivation(),
        ))
        .unwrap();
        let action_id = ScheduledActionId::new("asha-demo.scheduler.disable-enemy-collision");
        host.apply_scheduler_command(GameplaySchedulerCommand::ExecuteTick {
            action_id: action_id.clone(),
            tick: 5,
            validity: ScheduledActionValidity::CURRENT,
        })
        .unwrap();
        assert_eq!(host.readout().scheduler.outstanding_dispatch_count, 1);

        let snapshot = host.compose_snapshot().unwrap();
        let mut restored =
            GameplayRuntimeHost::restore_project(test_project_input(), &snapshot.text).unwrap();
        assert_eq!(restored.readout().scheduler.outstanding_dispatch_count, 1);
        let routed = restored.route_scheduled_action(&action_id).unwrap();
        assert!(routed.routing.accepted);
        assert_eq!(routed.readout.outstanding_dispatch_count, 0);
        assert_ne!(
            restored.readout().authority_state_hash,
            initial.authority_state_hash
        );
        assert_ne!(
            restored.readout().runtime_host_hash,
            initial.runtime_host_hash
        );

        let completed = restored.readout();
        assert!(restored.route_scheduled_action(&action_id).is_err());
        assert_eq!(restored.readout(), completed);
    }
}

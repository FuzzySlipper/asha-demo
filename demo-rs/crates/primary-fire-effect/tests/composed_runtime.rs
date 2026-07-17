use asha_demo_primary_fire_effect::{
    decode_gameplay_project_composition_requirement, gameplay_challenge_view_contract,
    gameplay_runtime_prefab_bootstrap, gameplay_runtime_project_input,
};
use asha_gameplay_module_sdk::{
    gameplay_canonical_payload_hash, gameplay_runtime_composition_identity, GameplayCausationRef,
    GameplayCompositionDiagnosticCode, GameplayCompositionLoadMode, GameplayContractRef,
    GameplayEmitterRef, GameplayEntityRef, GameplayOwnerRef, GameplayProposalEnvelope,
    PrimaryFireGameplayDecisionWorkspace, StandardGameplayProposalKind,
};
use asha_runtime_session_composition::{
    EngineBridge, EngineConfig, FpsBridgeBoundsCapability, FpsBridgeHealth, FpsBridgeRole,
    FpsBridgeStoredEntityDefinition, FpsBridgeTransformCapability, FpsBridgeWeaponMount,
    FpsPrimaryFireRequest, FpsPrimaryFireResult, FpsRuntimeSessionLoadRequest,
    FpsRuntimeSessionRestartRequest, GameplayDecisionMoment, GameplayDecisionStatus,
    GameplayModuleViewRequest, GameplayModuleViewScope, GameplayOperationWorkspace,
    GameplayPrefabPartInteractionRequest, GameplayRuntimeDecisionOwner,
    GameplayRuntimeDecisionOwnerOutput, GeneratedTunnelPreset, GeneratedTunnelRuntimeApplyRequest,
    RuntimeBridge, StaticRuntimeSessionBuilder,
};

const SENSOR_701: u64 = 1_585_192_660_180_873;

#[test]
fn serialized_legacy_project_bundle_reaches_compatible_runtime_migration() {
    let mut legacy: serde_json::Value =
        serde_json::from_str(include_str!("../../../../project/project-bundle.json")).unwrap();
    let gameplay_runtime = legacy["gameplayRuntime"].as_object_mut().unwrap();
    assert!(gameplay_runtime.remove("compositionRequirement").is_some());
    gameplay_runtime.insert(
        "compositionHash".to_owned(),
        serde_json::Value::String("fnv1a64:b0ff59982863a494".to_owned()),
    );
    let serialized = serde_json::to_string(&legacy).unwrap();
    let decoded = decode_gameplay_project_composition_requirement(&serialized).unwrap();
    assert_eq!(decoded, None);

    let mut input = gameplay_runtime_project_input();
    input.composition_requirement = decoded;
    let mut bridge = StaticRuntimeSessionBuilder::activate_project_with_prefabs(
        input,
        gameplay_runtime_prefab_bootstrap(),
    )
    .and_then(StaticRuntimeSessionBuilder::build)
    .expect("serialized legacy ProjectBundle selects compatible migration");
    let readout = bridge.read_composed_runtime_session().unwrap();
    assert_eq!(
        readout.gameplay.composition_load_mode,
        GameplayCompositionLoadMode::Compatible
    );
    assert!(readout
        .gameplay
        .compatibility_diagnostics
        .iter()
        .any(|diagnostic| {
            diagnostic.code == GameplayCompositionDiagnosticCode::LegacyCompatibilityDefaulted
        }));
}

#[test]
fn serialized_exact_composition_requirement_remains_exact() {
    let baseline = gameplay_runtime_project_input();
    let exact_artifact =
        gameplay_runtime_composition_identity(baseline.composition.registry(), &baseline.bindings)
            .artifact_provenance_digest;
    let mut exact: serde_json::Value =
        serde_json::from_str(include_str!("../../../../project/project-bundle.json")).unwrap();
    exact["gameplayRuntime"]["compositionRequirement"]["loadMode"] =
        serde_json::Value::String("exact".to_owned());
    exact["gameplayRuntime"]["compositionRequirement"]["artifactProvenanceDigest"] =
        serde_json::Value::String(exact_artifact);
    let serialized = serde_json::to_string(&exact).unwrap();
    let decoded = decode_gameplay_project_composition_requirement(&serialized)
        .unwrap()
        .expect("exact requirement");
    assert_eq!(decoded.load_mode, GameplayCompositionLoadMode::Exact);

    let mut input = gameplay_runtime_project_input();
    input.composition_requirement = Some(decoded);
    let mut bridge = StaticRuntimeSessionBuilder::activate_project_with_prefabs(
        input,
        gameplay_runtime_prefab_bootstrap(),
    )
    .and_then(StaticRuntimeSessionBuilder::build)
    .expect("unambiguous exact lock remains exact");
    assert_eq!(
        bridge
            .read_composed_runtime_session()
            .unwrap()
            .gameplay
            .composition_load_mode,
        GameplayCompositionLoadMode::Exact
    );
}

#[test]
fn compatible_project_load_survives_benign_artifact_provenance_churn() {
    let mut input = gameplay_runtime_project_input();
    input
        .composition_requirement
        .as_mut()
        .expect("Demo carries an explicit compatibility requirement")
        .artifact_provenance_digest = Some("fnv1a64:0000000000000000".to_owned());
    let mut bridge = StaticRuntimeSessionBuilder::activate_project_with_prefabs(
        input,
        gameplay_runtime_prefab_bootstrap(),
    )
    .and_then(StaticRuntimeSessionBuilder::build)
    .expect("compatible mode accepts artifact-only drift");
    let readout = bridge.read_composed_runtime_session().unwrap();
    assert!(readout
        .gameplay
        .compatibility_diagnostics
        .iter()
        .any(|diagnostic| {
            diagnostic.code == GameplayCompositionDiagnosticCode::ArtifactProvenanceMismatch
        }));
}

#[test]
fn close_range_transform_changes_authoritative_damage_but_far_fire_preserves_base() {
    let mut near = initialized_bridge(-0.5);
    let near_fire = fire(&mut near, 1);
    assert_eq!(near_fire.target_health_before.unwrap().current, 100);
    assert_eq!(near_fire.target_health_after.unwrap().current, 55);
    assert!(near_fire
        .workspace_trace
        .iter()
        .any(|entry| entry.contains("Guard -> Transform -> React")));
    let near_evidence = near.read_composed_runtime_session().unwrap();
    assert_eq!(near_evidence.gameplay.decision_receipt_count, 1);
    assert!(near_evidence.gameplay.last_decision_receipt_hash.is_some());
    assert!(near_evidence.gameplay.last_reaction_frame_hash.is_some());

    let mut far = initialized_bridge(-3.5);
    let far_fire = fire(&mut far, 2);
    assert_eq!(far_fire.target_health_before.unwrap().current, 100);
    assert_eq!(far_fire.target_health_after.unwrap().current, 60);
}

#[test]
fn enemy_fire_keeps_base_damage_and_cannot_advance_the_player_challenge() {
    let mut bridge = composed_bridge();
    bridge
        .initialize_engine(EngineConfig { seed: 4_103 })
        .unwrap();
    let mut load = fps_load_request(-0.5);
    load.definitions[1].weapon = Some(FpsBridgeWeaponMount {
        weapon_id: "weapon.demo.enemy".to_owned(),
        damage: 10,
        range_units: 16,
        ammo: 3,
        cooldown_ticks_after_fire: 4,
    });
    bridge.load_fps_runtime_session(load).unwrap();
    bridge
        .apply_generated_tunnel_to_runtime_world(GeneratedTunnelRuntimeApplyRequest {
            preset: GeneratedTunnelPreset::TinyEnclosed,
            seed: 4_103,
        })
        .unwrap();
    let before = bridge.read_composed_runtime_session().unwrap();

    let enemy_fire = bridge
        .apply_fps_primary_fire(FpsPrimaryFireRequest {
            tick: 1,
            origin: [0.0, 1.62, -0.5],
            direction: [0.0, 0.0, 1.0],
            shooter_role: Some(FpsBridgeRole::Enemy),
            target_role: Some(FpsBridgeRole::Player),
        })
        .unwrap();

    assert_eq!(enemy_fire.target_health_before.unwrap().current, 100);
    assert_eq!(enemy_fire.target_health_after.unwrap().current, 90);
    let after = bridge.read_composed_runtime_session().unwrap();
    assert_eq!(
        after.gameplay.module_state_hash,
        before.gameplay.module_state_hash
    );
}

#[test]
fn stale_primary_fire_transform_revision_rejects_before_owner_or_state_mutation() {
    let mut bridge = initialized_bridge(-0.5);
    let fps_before = bridge.read_fps_runtime_session().unwrap();
    let composed_before = bridge.read_composed_runtime_session().unwrap();
    let mut owner = RecordingPrimaryFireOwner::default();

    let receipt = bridge
        .decide_composed_gameplay(
            primary_fire_decision_moment("demo-primary-fire-stale-revision", "revision:stale"),
            &mut owner,
        )
        .unwrap();

    assert_eq!(receipt.status, GameplayDecisionStatus::Stale);
    assert!(receipt
        .diagnostics
        .iter()
        .any(|diagnostic| diagnostic.message.contains("owner revision")));
    assert_decision_rejection_did_not_mutate(&mut bridge, &owner, &fps_before, &composed_before);
}

#[test]
fn invalid_primary_fire_transform_inputs_fail_closed_without_mutation() {
    for invalid_input in [
        InvalidTransformInput::MissingPayload,
        InvalidTransformInput::UndeclaredContract,
        InvalidTransformInput::StaleWorkspaceHash,
    ] {
        let mut bridge = initialized_bridge(-0.5);
        let fps_before = bridge.read_fps_runtime_session().unwrap();
        let composed_before = bridge.read_composed_runtime_session().unwrap();
        let mut moment = primary_fire_decision_moment(
            &format!("demo-primary-fire-invalid-{invalid_input:?}"),
            "revision:current",
        );
        match invalid_input {
            InvalidTransformInput::MissingPayload => {
                moment.workspace = GameplayOperationWorkspace::from_payload(
                    StandardGameplayProposalKind::ResolvePrimaryFire.contract(),
                    Vec::new(),
                );
            }
            InvalidTransformInput::UndeclaredContract => {
                moment.workspace.contract = GameplayContractRef {
                    namespace: "demo.primary-fire-effect.invalid".to_owned(),
                    name: "undeclared-workspace".to_owned(),
                    version: 1,
                    schema_hash: "fnv1a64:0000000000000000".to_owned(),
                };
            }
            InvalidTransformInput::StaleWorkspaceHash => {
                moment.workspace.workspace_hash = "fnv1a64:0000000000000000".to_owned();
            }
        }
        let mut owner = RecordingPrimaryFireOwner::default();

        let receipt = bridge.decide_composed_gameplay(moment, &mut owner).unwrap();

        assert_ne!(
            receipt.status,
            GameplayDecisionStatus::Accepted,
            "{invalid_input:?} unexpectedly reached commit"
        );
        assert!(
            !receipt.diagnostics.is_empty(),
            "{invalid_input:?} did not produce rejection evidence"
        );
        assert!(receipt.routing.is_none());
        assert_decision_rejection_did_not_mutate(
            &mut bridge,
            &owner,
            &fps_before,
            &composed_before,
        );
    }
}

#[derive(Debug, Clone, Copy)]
enum InvalidTransformInput {
    MissingPayload,
    UndeclaredContract,
    StaleWorkspaceHash,
}

fn primary_fire_decision_moment(
    decision_id: &str,
    expected_owner_revision: &str,
) -> GameplayDecisionMoment {
    let workspace = PrimaryFireGameplayDecisionWorkspace {
        shooter: 10,
        shooter_role: "player".to_owned(),
        target: Some(20),
        range_millimeters: Some(2_000),
        base_damage: 40,
        damage: 40,
        channel_id: "value.health".to_owned(),
        tick: 1,
    };
    let canonical_payload = serde_json::to_vec(&workspace).unwrap();
    let contract = StandardGameplayProposalKind::ResolvePrimaryFire.contract();
    GameplayDecisionMoment {
        decision_id: decision_id.to_owned(),
        operation: GameplayProposalEnvelope {
            proposal_id: format!("{decision_id}:proposal"),
            proposal: contract.clone(),
            tick: 1,
            root_sequence: 0,
            wave: 0,
            proposal_sequence: 0,
            emitter: GameplayEmitterRef::Owner {
                owner_id: StandardGameplayProposalKind::ResolvePrimaryFire
                    .owner()
                    .owner_id,
            },
            causation: GameplayCausationRef {
                root_id: decision_id.to_owned(),
                parent_event_id: None,
                decision_id: Some(decision_id.to_owned()),
            },
            originating_event_id: None,
            source: Some(GameplayEntityRef {
                entity: asha_runtime_session_composition::EntityId::new(10),
            }),
            targets: vec![GameplayEntityRef {
                entity: asha_runtime_session_composition::EntityId::new(20),
            }],
            payload_hash: gameplay_canonical_payload_hash(&canonical_payload),
            canonical_payload: canonical_payload.clone(),
        },
        expected_owner_revision: expected_owner_revision.to_owned(),
        workspace: GameplayOperationWorkspace::from_payload(contract, canonical_payload),
        resume_token: None,
    }
}

fn assert_decision_rejection_did_not_mutate(
    bridge: &mut EngineBridge,
    owner: &RecordingPrimaryFireOwner,
    fps_before: &asha_runtime_session_composition::FpsRuntimeSessionSnapshot,
    composed_before: &asha_runtime_session_composition::ComposedRuntimeSessionReadout,
) {
    assert!(!owner.route_called);
    assert_eq!(&bridge.read_fps_runtime_session().unwrap(), fps_before);
    let composed_after = bridge.read_composed_runtime_session().unwrap();
    assert_eq!(
        composed_after.gameplay.module_state_hash,
        composed_before.gameplay.module_state_hash
    );
    assert_eq!(
        composed_after.gameplay.last_reaction_frame_hash,
        composed_before.gameplay.last_reaction_frame_hash
    );
}

#[derive(Default)]
struct RecordingPrimaryFireOwner {
    route_called: bool,
}

impl GameplayRuntimeDecisionOwner for RecordingPrimaryFireOwner {
    fn revision_hash(&self, owner: &GameplayOwnerRef) -> String {
        assert_eq!(
            owner,
            &StandardGameplayProposalKind::ResolvePrimaryFire.owner()
        );
        "revision:current".to_owned()
    }

    fn route_precommit(
        &mut self,
        _owner: &GameplayOwnerRef,
        _operation: &GameplayProposalEnvelope,
    ) -> GameplayRuntimeDecisionOwnerOutput {
        self.route_called = true;
        GameplayRuntimeDecisionOwnerOutput {
            accepted: true,
            ..GameplayRuntimeDecisionOwnerOutput::default()
        }
    }
}

#[test]
fn prefab_interaction_rejection_and_replay_leave_composed_authority_unchanged() {
    let mut bridge = composed_bridge();
    let before = bridge.read_composed_runtime_session().unwrap();
    let wrong =
        bridge.apply_gameplay_prefab_part_interaction(GameplayPrefabPartInteractionRequest {
            actor: 30,
            instance: 701,
            role: "interaction/sensor".to_owned(),
            expected_target: SENSOR_701 + 1,
            tick: 1,
            expected_runtime_session_hash: before.runtime_session_hash.clone(),
        });
    assert!(wrong.is_err());
    assert_eq!(bridge.read_composed_runtime_session().unwrap(), before);

    let accepted = bridge
        .apply_gameplay_prefab_part_interaction(GameplayPrefabPartInteractionRequest {
            actor: 30,
            instance: 701,
            role: "interaction/sensor".to_owned(),
            expected_target: SENSOR_701,
            tick: 1,
            expected_runtime_session_hash: before.runtime_session_hash.clone(),
        })
        .unwrap();
    let after = bridge.read_composed_runtime_session().unwrap();
    assert_eq!(accepted.runtime_session_hash, after.runtime_session_hash);

    let replay =
        bridge.apply_gameplay_prefab_part_interaction(GameplayPrefabPartInteractionRequest {
            actor: 30,
            instance: 701,
            role: "interaction/sensor".to_owned(),
            expected_target: SENSOR_701,
            tick: 1,
            expected_runtime_session_hash: before.runtime_session_hash,
        });
    assert!(replay.is_err());
    assert_eq!(bridge.read_composed_runtime_session().unwrap(), after);
}

#[test]
fn composed_checkpoint_restores_fire_evidence_and_named_challenge_view() {
    let mut bridge = initialized_bridge(-0.5);
    fire(&mut bridge, 3);
    let before = bridge.read_composed_runtime_session().unwrap();
    let view_contract = gameplay_challenge_view_contract();
    let view_before = bridge
        .read_gameplay_module_view(GameplayModuleViewRequest {
            view: view_contract.clone(),
            scope: GameplayModuleViewScope::Session,
            expected_runtime_session_hash: before.runtime_session_hash.clone(),
        })
        .unwrap();
    let checkpoint = bridge.checkpoint_composed_runtime_session().unwrap();
    let mut restored = StaticRuntimeSessionBuilder::restore_project_with_prefabs(
        gameplay_runtime_project_input(),
        gameplay_runtime_prefab_bootstrap(),
        &checkpoint,
    )
    .and_then(StaticRuntimeSessionBuilder::build)
    .unwrap();
    let restored_readout = restored.read_composed_runtime_session().unwrap();
    assert_eq!(restored_readout, before);
    let view_after = restored
        .read_gameplay_module_view(GameplayModuleViewRequest {
            view: view_contract,
            scope: GameplayModuleViewScope::Session,
            expected_runtime_session_hash: restored_readout.runtime_session_hash,
        })
        .unwrap();
    assert_eq!(view_after.canonical_payload, view_before.canonical_payload);
    assert_eq!(view_after.view_hash, view_before.view_hash);
}

#[test]
fn runtime_restart_resets_gameplay_state_and_accepts_reused_owner_fact_identity() {
    let mut bridge = initialized_bridge(-0.5);
    let initial = bridge.read_composed_runtime_session().unwrap();
    let initial_view = bridge
        .read_gameplay_module_view(GameplayModuleViewRequest {
            view: gameplay_challenge_view_contract(),
            scope: GameplayModuleViewScope::Session,
            expected_runtime_session_hash: initial.runtime_session_hash.clone(),
        })
        .unwrap();

    fire(&mut bridge, 3);
    let after_fire = bridge.read_composed_runtime_session().unwrap();
    assert_ne!(
        after_fire.gameplay.module_state_hash,
        initial.gameplay.module_state_hash
    );
    assert_eq!(after_fire.gameplay.decision_receipt_count, 1);
    assert!(bridge
        .restart_fps_runtime_session(FpsRuntimeSessionRestartRequest { expected_epoch: 0 })
        .is_err());
    assert_eq!(bridge.read_composed_runtime_session().unwrap(), after_fire);

    bridge
        .restart_fps_runtime_session(FpsRuntimeSessionRestartRequest { expected_epoch: 1 })
        .unwrap();
    let restarted = bridge.read_composed_runtime_session().unwrap();
    assert_eq!(restarted.fps_session_epoch, 2);
    assert_eq!(restarted.gameplay, initial.gameplay);
    let restarted_view = bridge
        .read_gameplay_module_view(GameplayModuleViewRequest {
            view: gameplay_challenge_view_contract(),
            scope: GameplayModuleViewScope::Session,
            expected_runtime_session_hash: restarted.runtime_session_hash,
        })
        .unwrap();
    assert_eq!(
        restarted_view.canonical_payload,
        initial_view.canonical_payload
    );

    let repeated = fire(&mut bridge, 3);
    assert_eq!(repeated.target_health_after.unwrap().current, 55);
}

fn composed_bridge() -> EngineBridge {
    StaticRuntimeSessionBuilder::activate_project_with_prefabs(
        gameplay_runtime_project_input(),
        gameplay_runtime_prefab_bootstrap(),
    )
    .and_then(StaticRuntimeSessionBuilder::build)
    .unwrap()
}

fn initialized_bridge(enemy_z: f32) -> EngineBridge {
    let mut bridge = composed_bridge();
    bridge
        .initialize_engine(EngineConfig { seed: 4_103 })
        .unwrap();
    bridge
        .load_fps_runtime_session(fps_load_request(enemy_z))
        .unwrap();
    bridge
        .apply_generated_tunnel_to_runtime_world(GeneratedTunnelRuntimeApplyRequest {
            preset: GeneratedTunnelPreset::TinyEnclosed,
            seed: 4_103,
        })
        .unwrap();
    bridge
}

fn fire(bridge: &mut EngineBridge, tick: u64) -> FpsPrimaryFireResult {
    bridge
        .apply_fps_primary_fire(FpsPrimaryFireRequest {
            tick,
            origin: [0.0, 1.62, 1.5],
            direction: [0.0, 0.0, -1.0],
            shooter_role: None,
            target_role: None,
        })
        .unwrap()
}

fn fps_load_request(enemy_z: f32) -> FpsRuntimeSessionLoadRequest {
    FpsRuntimeSessionLoadRequest {
        project_bundle: "asha-demo:4103".to_owned(),
        definitions: vec![
            entity_definition(10, FpsBridgeRole::Player, 1.5, true),
            entity_definition(20, FpsBridgeRole::Enemy, enemy_z, false),
        ],
        game_rule_modules: Vec::new(),
    }
}

fn entity_definition(
    entity: u64,
    role: FpsBridgeRole,
    z: f32,
    armed: bool,
) -> FpsBridgeStoredEntityDefinition {
    FpsBridgeStoredEntityDefinition {
        entity,
        stable_id: format!("actor/demo-{}", if armed { "player" } else { "enemy" }),
        display_name: if armed { "Demo player" } else { "Demo enemy" }.to_owned(),
        source_path: "composed-runtime-test".to_owned(),
        tags: vec![if armed { "player" } else { "enemy" }.to_owned()],
        role,
        transform: Some(FpsBridgeTransformCapability {
            translation: [0.0, 1.62, z],
            rotation: [0.0, 0.0, 0.0, 1.0],
            scale: [1.0, 1.0, 1.0],
        }),
        bounds: Some(FpsBridgeBoundsCapability {
            min: [-0.25, 1.12, z - 0.25],
            max: [0.25, 2.12, z + 0.25],
        }),
        render_visible: Some(true),
        static_collider: Some(false),
        health: Some(FpsBridgeHealth {
            current: 100,
            max: 100,
        }),
        weapon: armed.then_some(FpsBridgeWeaponMount {
            weapon_id: "weapon.demo.primary".to_owned(),
            damage: 40,
            range_units: 16,
            ammo: 3,
            cooldown_ticks_after_fire: 4,
        }),
        policy_binding: None,
    }
}

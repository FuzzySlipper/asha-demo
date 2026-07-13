use asha_demo_primary_fire_effect::{
    gameplay_challenge_view_contract, gameplay_runtime_prefab_bootstrap,
    gameplay_runtime_project_input,
};
use asha_runtime_session_composition::{
    EngineBridge, EngineConfig, FpsBridgeBoundsCapability, FpsBridgeHealth, FpsBridgeRole,
    FpsBridgeStoredEntityDefinition, FpsBridgeTransformCapability, FpsBridgeWeaponMount,
    FpsPrimaryFireRequest, FpsPrimaryFireResult, FpsRuntimeSessionLoadRequest,
    FpsRuntimeSessionRestartRequest, GameplayModuleViewRequest, GameplayModuleViewScope,
    GameplayPrefabPartInteractionRequest, GeneratedTunnelPreset,
    GeneratedTunnelRuntimeApplyRequest, RuntimeBridge, StaticRuntimeSessionBuilder,
};

const SENSOR_701: u64 = 1_585_192_660_180_873;

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

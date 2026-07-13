use std::env;
use std::fs;

use asha_demo_primary_fire_effect::{
    gameplay_challenge_view_contract, gameplay_composition,
    gameplay_session_conformance_binding_registry,
};
use asha_gameplay_module_conformance::{
    run_gameplay_module_conformance, GameplayModuleConformanceCase,
    GameplayModuleConformanceProject, GameplayModuleConformanceReachableSurface,
};
use asha_gameplay_module_sdk::{
    gameplay_canonical_payload_hash, EntityId, GameplayCausationRef, GameplayEmitterRef,
    GameplayEntityRef, GameplayEventEnvelope, GameplayEventPhase, StandardGameplayEventKind,
};
use serde::Serialize;
use serde_json::json;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CombatPayload {
    shooter: Option<u64>,
    shooter_role: Option<String>,
    weapon_id: Option<String>,
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

fn main() {
    let output = env::args().nth(1);
    let project: GameplayModuleConformanceProject = serde_json::from_value(json!({
        "schemaVersion": 1,
        "projectId": "asha-demo.close-range-challenge",
        "sceneId": 4103,
        "runtimeSessionId": 4103,
        "consumerNeeds": [
            "asha-demo.gameplay-module-sdk",
            "asha-demo.gameplay-conformance",
            "asha-demo.primary-fire-module",
            "asha-demo.challenge-state-read",
            "asha-demo.challenge-configuration"
        ],
        "gameplayModuleBindings": gameplay_session_conformance_binding_registry(),
        "declaredReads": [{
            "requestId": "challenge-state",
            "moduleId": "demo.primary-fire-effect",
            "invocationId": "demo.primary-fire-effect.combat-fire-hit.observe",
            "view": gameplay_challenge_view_contract(),
            "scope": { "kind": "session" },
            "fields": ["revision", "status", "score", "closeRangeHits"]
        }]
    }))
    .expect("committed demo conformance project is valid");
    let report = run_gameplay_module_conformance(GameplayModuleConformanceCase {
        project_bundle_json: serde_json::to_string(&project).expect("project serializes"),
        consumer_needs_manifest_json: include_str!("../consumer-needs.json").to_owned(),
        reachable_surfaces: vec![
            GameplayModuleConformanceReachableSurface::gameplay_module_sdk(),
            GameplayModuleConformanceReachableSurface::gameplay_module_conformance(),
        ],
        composition: gameplay_composition,
        events: vec![combat_event(2.25)],
    })
    .expect("demo gameplay conformance executes");
    if !report.valid {
        eprintln!("ASHA demo gameplay conformance failed: {}", report.trace);
        for gap in &report.gaps {
            eprintln!("- {}: {}", gap.code, gap.message);
        }
        std::process::exit(1);
    }
    let text = report.to_pretty_json().expect("report serializes");
    if let Some(path) = output {
        fs::write(&path, format!("{text}\n")).unwrap_or_else(|error| {
            panic!("failed to write gameplay conformance report {path}: {error}")
        });
    }
    println!(
        "asha-demo gameplay conformance OK: {} frames, registry {}",
        report.reaction_frames.len(),
        report.registry_digest
    );
}

fn combat_event(distance: f64) -> GameplayEventEnvelope {
    let payload = CombatPayload {
        shooter: Some(10),
        shooter_role: Some("player".to_owned()),
        weapon_id: Some("weapon.primary_fire.generated_tunnel.v0".to_owned()),
        target: Some(20),
        distance: Some(distance),
        miss_reason: None,
        damage: Some(40),
        health_before: Some(40),
        health_after: Some(0),
        defeated: true,
        tick: 7,
        combat_replay_hash: 7,
    };
    let canonical_payload = serde_json::to_vec(&payload).expect("combat payload serializes");
    GameplayEventEnvelope {
        event_id: "asha-demo.conformance.combat-hit".to_owned(),
        event: StandardGameplayEventKind::CombatFireHit.contract(),
        tick: 7,
        root_sequence: 7,
        wave: 0,
        event_sequence: 0,
        phase: GameplayEventPhase::PostCommit,
        emitter: GameplayEmitterRef::Owner {
            owner_id: "rule-lifecycle".to_owned(),
        },
        causation: GameplayCausationRef {
            root_id: "asha-demo.conformance.combat".to_owned(),
            parent_event_id: None,
            decision_id: None,
        },
        source: Some(entity_ref(10)),
        subjects: vec![entity_ref(20)],
        targets: vec![entity_ref(20)],
        scope: Some("combat".to_owned()),
        tags: vec![
            "hit".to_owned(),
            "close-range".to_owned(),
            "shooter-role:player".to_owned(),
            "weapon:weapon.primary_fire.generated_tunnel.v0".to_owned(),
        ],
        payload_hash: gameplay_canonical_payload_hash(&canonical_payload),
        canonical_payload,
    }
}

fn entity_ref(entity: u64) -> GameplayEntityRef {
    GameplayEntityRef {
        entity: EntityId::new(entity),
    }
}

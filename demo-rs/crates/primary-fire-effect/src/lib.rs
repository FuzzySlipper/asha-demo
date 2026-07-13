use asha_game_rule_extension::{
    GameExtensionDiagnosticCode, GameExtensionHookKind, GameExtensionProposal,
    GameRuleExtensionResult, GameRuleHookDeclaration, GameRuleModule, GameRuleModuleManifest,
    GameRuleModuleRef, WeaponEffectHookRequest,
};

mod gameplay;

pub use gameplay::{
    gameplay_authored_binding_registry, gameplay_composition, gameplay_declared_read_plan_hash,
    gameplay_module_ref, gameplay_session_conformance_binding_registry,
};

const MODULE_ID: &str = "demo.primary_fire_effect";
const MODULE_VERSION: &str = "0.1.0";
const CONTRACT_HASH: &str = "sha256:demo-primary-fire-effect-contract-v0";
const SOURCE_HASH: &str = "sha256:demo-primary-fire-effect-source-v0";
const HOOK_ID: &str = "demo.primary_fire_effect.weapon";

#[derive(Debug, Clone)]
pub struct PrimaryFireEffectModule {
    manifest: GameRuleModuleManifest,
}

impl PrimaryFireEffectModule {
    pub fn new() -> Self {
        Self {
            manifest: primary_fire_effect_manifest(),
        }
    }
}

impl Default for PrimaryFireEffectModule {
    fn default() -> Self {
        Self::new()
    }
}

impl GameRuleModule for PrimaryFireEffectModule {
    fn manifest(&self) -> &GameRuleModuleManifest {
        &self.manifest
    }

    fn evaluate_weapon_effect(
        &self,
        request: &WeaponEffectHookRequest,
    ) -> GameRuleExtensionResult<GameExtensionProposal> {
        let target = match request.target {
            Some(target) => target,
            None => {
                return Ok(GameExtensionProposal::Reject {
                    proposal_id: format!("{}.reject_no_target", request.request_id),
                    code: GameExtensionDiagnosticCode::InvalidProposal,
                    message: "demo primary fire requires an authoritative target".to_string(),
                    proposal_hash: proposal_hash(request, "reject-no-target"),
                });
            }
        };

        let close_range_bonus = if request.range_millimeters <= 2_500 {
            5
        } else {
            0
        };
        Ok(GameExtensionProposal::DamageModifier {
            proposal_id: format!("{}.close_range_bonus", request.request_id),
            target,
            channel_id: "combat.primary_fire.damage".to_string(),
            amount_delta: close_range_bonus,
            tags: vec![
                "asha-demo".to_string(),
                "primary-fire".to_string(),
                "close-range-bonus".to_string(),
            ],
            proposal_hash: proposal_hash(request, &close_range_bonus.to_string()),
        })
    }
}

pub fn primary_fire_effect_manifest() -> GameRuleModuleManifest {
    GameRuleModuleManifest {
        module_ref: GameRuleModuleRef {
            module_id: MODULE_ID.to_string(),
            version: MODULE_VERSION.to_string(),
            contract_hash: CONTRACT_HASH.to_string(),
        },
        declared_hooks: vec![GameRuleHookDeclaration {
            hook_id: HOOK_ID.to_string(),
            kind: GameExtensionHookKind::WeaponEffect,
            input_contract: "WeaponEffectHookRequest.v0".to_string(),
            output_contract: "GameExtensionProposal.v0".to_string(),
            required_capabilities: vec!["health".to_string(), "weaponMount".to_string()],
        }],
        deterministic_requirements: vec![
            "no-wall-clock".to_string(),
            "no-ambient-random".to_string(),
            "no-filesystem".to_string(),
            "no-network".to_string(),
            "no-ts-callback".to_string(),
        ],
        source_hash: SOURCE_HASH.to_string(),
    }
}

fn proposal_hash(request: &WeaponEffectHookRequest, discriminator: &str) -> String {
    format!(
        "fnv1a64:{:016x}",
        fnv1a64(&format!(
            "{}|{}|{}|{}|{}",
            MODULE_ID, request.request_id, request.base_damage, request.input_hash, discriminator
        ))
    )
}

fn fnv1a64(input: &str) -> u64 {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in input.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;
    use asha_game_rule_extension::GameRuleModule;
    use serde_json::json;

    fn request(range_millimeters: u32) -> WeaponEffectHookRequest {
        serde_json::from_value(json!({
            "moduleRef": primary_fire_effect_manifest().module_ref,
            "hookId": HOOK_ID,
            "requestId": "asha-demo.primary-fire.7",
            "tick": 7,
            "source": 10,
            "target": 20,
            "baseDamage": 40,
            "rangeMillimeters": range_millimeters,
            "tags": ["primary-fire"],
            "inputHash": "fnv1a64:input"
        }))
        .expect("generated hook request fixture is valid")
    }

    #[test]
    fn manifest_declares_demo_weapon_effect_hook() {
        let manifest = primary_fire_effect_manifest();
        assert_eq!(manifest.module_ref.module_id, "demo.primary_fire_effect");
        assert_eq!(
            manifest.declared_hooks[0].hook_id,
            "demo.primary_fire_effect.weapon"
        );
        assert!(manifest
            .deterministic_requirements
            .contains(&"no-ts-callback".to_string()));
    }

    #[test]
    fn close_range_hit_returns_typed_damage_modifier() {
        let module = PrimaryFireEffectModule::new();
        let proposal = module
            .evaluate_weapon_effect(&request(1_500))
            .expect("demo module proposes");
        match proposal {
            GameExtensionProposal::DamageModifier {
                amount_delta,
                channel_id,
                tags,
                proposal_hash,
                ..
            } => {
                assert_eq!(amount_delta, 5);
                assert_eq!(channel_id, "combat.primary_fire.damage");
                assert!(tags.contains(&"close-range-bonus".to_string()));
                assert!(proposal_hash.starts_with("fnv1a64:"));
            }
            _ => panic!("expected damage modifier"),
        }
    }

    #[test]
    fn long_range_hit_keeps_base_damage() {
        let module = PrimaryFireEffectModule::new();
        let proposal = module
            .evaluate_weapon_effect(&request(6_000))
            .expect("demo module proposes");
        match proposal {
            GameExtensionProposal::DamageModifier { amount_delta, .. } => {
                assert_eq!(amount_delta, 0);
            }
            _ => panic!("expected damage modifier"),
        }
    }
}

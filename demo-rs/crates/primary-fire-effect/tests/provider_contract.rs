use asha_demo_primary_fire_effect::{
    gameplay_challenge_view_contract, gameplay_composition, gameplay_composition_hash,
    gameplay_declared_reads, gameplay_module_ref,
};

#[test]
fn linked_provider_publishes_stable_project_content_identity() {
    let module = gameplay_module_ref();
    assert_eq!(module.module_id, "demo.primary-fire-effect");
    assert_eq!(module.namespace, "demo.primary-fire-effect");
    assert_eq!(module.provider_id, "provider.demo.primary-fire-effect");
    assert_ne!(module.sdk_hash, "unbuilt");
    assert_ne!(module.contract_hash, "unbuilt");
    assert_ne!(module.artifact_hash, "unbuilt");

    let challenge_view = gameplay_challenge_view_contract();
    assert_eq!(challenge_view.namespace, "demo.primary-fire-effect");
    assert_eq!(challenge_view.name, "challenge-state-view");
    assert_eq!(challenge_view.version, 1);
}

#[test]
fn linked_provider_composes_without_downstream_runtime_bootstrap() {
    let composition = gameplay_composition().expect("Demo provider composition is valid");
    assert_eq!(
        composition.registry().registry_digest(),
        gameplay_composition_hash()
    );
    let project_configuration = composition.project_configuration_authority();
    assert_eq!(project_configuration.schemas().len(), 1);
    assert_eq!(
        project_configuration.schemas()[0].module_id,
        "demo.primary-fire-effect"
    );
    assert!(!gameplay_declared_reads().is_empty());
}

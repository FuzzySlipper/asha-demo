use asha_demo_primary_fire_effect::{
    gameplay_challenge_view_contract, gameplay_composition, gameplay_composition_hash,
    gameplay_declared_reads, gameplay_module_ref, launch_settings_module_ref,
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

    let launch = launch_settings_module_ref();
    assert_eq!(launch.module_id, "demo.launch-settings");
    assert_eq!(launch.namespace, "demo.launch-settings");
    assert_eq!(launch.provider_id, "provider.demo.launch-settings");
    assert_ne!(launch.sdk_hash, "unbuilt");
    assert_ne!(launch.contract_hash, "unbuilt");
    assert_ne!(launch.artifact_hash, "unbuilt");
}

#[test]
fn linked_provider_composes_without_downstream_runtime_bootstrap() {
    let composition = gameplay_composition().expect("Demo provider composition is valid");
    assert_eq!(
        composition.registry().registry_digest(),
        gameplay_composition_hash()
    );
    let project_configuration = composition.project_configuration_authority();
    assert_eq!(project_configuration.schemas().len(), 2);
    let schema_modules = project_configuration
        .schemas()
        .iter()
        .map(|schema| schema.module_id.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        schema_modules,
        vec!["demo.launch-settings", "demo.primary-fire-effect"]
    );

    let launch_codec = project_configuration
        .codecs()
        .iter()
        .find(|codec| codec.metadata().module_id == "demo.launch-settings")
        .expect("Demo launch settings install a provider-owned typed codec");
    let valid = br#"{"playerEntityDefinition":"actor/demo-player","fovYDegrees":55.0,"nearClip":0.1,"farClip":100.0,"groundedMovement":true,"collisionHalfExtentX":0.25,"collisionHalfExtentY":0.25,"collisionHalfExtentZ":0.25,"collisionMaxIterations":3}"#;
    assert!(launch_codec.canonicalize(valid).is_ok());

    let inverted_clip_planes = br#"{"playerEntityDefinition":"actor/demo-player","fovYDegrees":55.0,"nearClip":100.0,"farClip":0.1,"groundedMovement":true,"collisionHalfExtentX":0.25,"collisionHalfExtentY":0.25,"collisionHalfExtentZ":0.25,"collisionMaxIterations":3}"#;
    assert!(launch_codec.canonicalize(inverted_clip_planes).is_err());

    let unknown_field = br#"{"playerEntityDefinition":"actor/demo-player","fovYDegrees":55.0,"nearClip":0.1,"farClip":100.0,"groundedMovement":true,"collisionHalfExtentX":0.25,"collisionHalfExtentY":0.25,"collisionHalfExtentZ":0.25,"collisionMaxIterations":3,"cameraOwner":"typescript"}"#;
    assert!(launch_codec.canonicalize(unknown_field).is_err());
    assert!(!gameplay_declared_reads().is_empty());
}

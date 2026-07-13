//! The Demo's one consumer-composed native RuntimeSession provider.

#![forbid(unsafe_code)]

use asha_demo_primary_fire_effect::{
    gameplay_runtime_prefab_bootstrap, gameplay_runtime_project_input,
};
use asha_native_runtime_provider::install_native_engine_bridge_factory;
use asha_runtime_session_composition::{
    EngineBridge, RuntimeBridgeError, RuntimeBridgeErrorKind, StaticRuntimeSessionBuilder,
};

pub fn build_demo_runtime_session() -> Result<EngineBridge, RuntimeBridgeError> {
    StaticRuntimeSessionBuilder::activate_project_with_prefabs(
        gameplay_runtime_project_input(),
        gameplay_runtime_prefab_bootstrap(),
    )
    .and_then(StaticRuntimeSessionBuilder::build)
    .map_err(|error| {
        RuntimeBridgeError::new(
            RuntimeBridgeErrorKind::Internal,
            format!("ASHA Demo composed RuntimeSession activation failed: {error}"),
        )
    })
}

#[asha_native_runtime_provider::native_provider_module_init]
fn install_demo_runtime_provider() {
    install_native_engine_bridge_factory(build_demo_runtime_session)
        .expect("the Demo native module installs exactly one RuntimeSession provider");
}

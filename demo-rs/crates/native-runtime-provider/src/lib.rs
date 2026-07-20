//! The Demo's one consumer-composed native RuntimeSession provider.

#![forbid(unsafe_code)]

use asha_demo_primary_fire_effect::gameplay_composition;
use asha_native_runtime_provider::{
    install_native_engine_bridge_factory, install_native_project_authoring_bridge_factory,
};
use asha_runtime_session_composition::{
    DeferredRuntimeSessionBuilder, EngineBridge, RuntimeBridgeError, RuntimeBridgeErrorKind,
    RuntimeProjectDomainAdapter, StaticProjectAuthoringBuilder,
};

pub fn build_demo_runtime_session() -> Result<EngineBridge, RuntimeBridgeError> {
    gameplay_composition()
        .map(|composition| {
            DeferredRuntimeSessionBuilder::from_static_composition(composition)
                .with_project_domain(RuntimeProjectDomainAdapter::Fps)
                .build_unloaded()
        })
        .map_err(|error| {
            RuntimeBridgeError::new(
                RuntimeBridgeErrorKind::Internal,
                format!("ASHA Demo static gameplay composition failed: {error}"),
            )
        })
}

pub fn build_demo_project_authoring() -> Result<EngineBridge, RuntimeBridgeError> {
    gameplay_composition()
        .map(|composition| {
            StaticProjectAuthoringBuilder::from_static_composition(composition).build()
        })
        .map_err(|error| {
            RuntimeBridgeError::new(
                RuntimeBridgeErrorKind::Internal,
                format!("ASHA Demo static project-authoring composition failed: {error}"),
            )
        })
}

#[asha_native_runtime_provider::native_provider_module_init]
fn install_demo_runtime_provider() {
    install_native_engine_bridge_factory(build_demo_runtime_session)
        .expect("the Demo native module installs exactly one RuntimeSession provider");
    install_native_project_authoring_bridge_factory(build_demo_project_authoring)
        .expect("the Demo native module installs exactly one project-authoring provider");
}

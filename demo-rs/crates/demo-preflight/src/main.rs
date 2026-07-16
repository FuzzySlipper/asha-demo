use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use asha_demo_primary_fire_effect::{
    gameplay_authored_binding_registry, gameplay_challenge_view_contract, gameplay_composition,
    gameplay_declared_read_plan_hash, gameplay_project_composition_requirement,
    gameplay_runtime_prefab_bootstrap, gameplay_runtime_project_input,
};
use asha_gameplay_module_sdk::{
    gameplay_module_binding_registry_hash, gameplay_module_binding_registry_semantic_hash,
    gameplay_runtime_composition_identity, GameplayModuleBindingRegistry,
};
use asha_runtime_session_composition::{
    GameplayPrefabPartInteractionRequest, StaticRuntimeSessionBuilder,
};
use serde_json::Value as JsonValue;

fn main() {
    let arguments = env::args_os().skip(1).collect::<Vec<_>>();
    if arguments
        .iter()
        .any(|argument| argument == "--print-linked-contract")
    {
        print_linked_contract();
        return;
    }
    let repo_root = arguments
        .first()
        .cloned()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));

    match run_preflight(&repo_root) {
        Ok(summary) => {
            println!(
                "asha-demo Rust preflight OK: {} project files, engine source {}",
                summary.checked_file_count, summary.engine_source
            );
        }
        Err(error) => {
            eprintln!("asha-demo Rust preflight failed:");
            eprintln!("- {error}");
            std::process::exit(1);
        }
    }
}

fn print_linked_contract() {
    let project_input = gameplay_runtime_project_input();
    let composition = gameplay_composition().expect("linked gameplay composition is valid");
    let bindings = gameplay_authored_binding_registry();
    let identity = gameplay_runtime_composition_identity(composition.registry(), &bindings);
    let value = serde_json::json!({
        "compositionRequirement": {
            "loadMode": "compatible",
            "semanticCompatibilityDigest": identity.semantic_compatibility_digest,
            "artifactProvenanceDigest": identity.artifact_provenance_digest,
        },
        "declaredReadPlanHash": gameplay_declared_read_plan_hash(),
        "challengeView": gameplay_challenge_view_contract(),
        "scheduler": project_input.scheduler,
        "gameplayModuleBindings": bindings,
    });
    println!(
        "{}",
        serde_json::to_string_pretty(&value).expect("linked contract serializes")
    );
}

#[derive(Debug, PartialEq, Eq)]
struct PreflightSummary {
    checked_file_count: usize,
    engine_source: String,
}

fn run_preflight(repo_root: &Path) -> Result<PreflightSummary, String> {
    let manifest_path = repo_root.join("asha.game.toml");
    let project_bundle_path = repo_root.join("project/project-bundle.json");
    let manifest_text = read_text(&manifest_path)?;
    let project_bundle_text = read_text(&project_bundle_path)?;
    let manifest = manifest_text
        .parse::<toml::Table>()
        .map_err(|error| format!("{} is not valid TOML: {error}", display(&manifest_path)))?;
    let project_bundle: JsonValue =
        serde_json::from_str(&project_bundle_text).map_err(|error| {
            format!(
                "{} is not valid JSON: {error}",
                display(&project_bundle_path)
            )
        })?;

    let engine_source = require_toml_string(&manifest, &["asha", "engine_source"])?;
    if engine_source != "../asha-engine" {
        return Err(format!(
            "asha.engine_source must be ../asha-engine for fresh-clone sibling layout, found {engine_source}"
        ));
    }
    reject_private_engine_path("asha.engine_source", engine_source)?;

    require_json_string(&project_bundle, &["kind"], "ProjectBundle")?;
    require_json_string(&project_bundle, &["project", "gameId"], "asha-demo")?;
    require_json_number(&project_bundle, &["runtimeRequest", "sceneId"], 4103)?;
    if project_bundle.get("gameRuleModules").is_some() {
        return Err(
            "ProjectBundle must not retain the legacy gameRuleModules hook manifest".to_owned(),
        );
    }
    let composition = gameplay_composition()
        .map_err(|error| format!("static gameplay composition is invalid: {error}"))?;
    let composition_requirement = gameplay_project_composition_requirement();
    if composition_requirement.load_mode
        != asha_gameplay_module_sdk::GameplayCompositionLoadMode::Compatible
    {
        return Err("Demo ProjectBundle must use normal compatible gameplay loading".to_owned());
    }
    let authored_bindings = gameplay_authored_binding_registry();
    let composition_identity =
        gameplay_runtime_composition_identity(composition.registry(), &authored_bindings);
    require_json_string(
        &project_bundle,
        &[
            "gameplayRuntime",
            "compositionRequirement",
            "semanticCompatibilityDigest",
        ],
        &composition_identity.semantic_compatibility_digest,
    )?;
    require_json_string(
        &project_bundle,
        &["gameplayRuntime", "declaredReadPlanHash"],
        &gameplay_declared_read_plan_hash(),
    )?;
    let stored_bindings: GameplayModuleBindingRegistry = serde_json::from_value(
        project_bundle
            .get("gameplayModuleBindings")
            .ok_or_else(|| "ProjectBundle.gameplayModuleBindings is required".to_owned())?
            .clone(),
    )
    .map_err(|error| format!("ProjectBundle.gameplayModuleBindings is invalid: {error}"))?;
    if stored_bindings.registry_hash != gameplay_module_binding_registry_hash(&stored_bindings) {
        return Err(
            "ProjectBundle gameplayModuleBindings has an invalid exact content hash".to_owned(),
        );
    }
    if gameplay_module_binding_registry_semantic_hash(&stored_bindings)
        != gameplay_module_binding_registry_semantic_hash(&authored_bindings)
    {
        return Err("ProjectBundle gameplayModuleBindings is semantically incompatible with the statically linked module contract".to_owned());
    }
    let authored_view = serde_json::to_value(gameplay_challenge_view_contract())
        .map_err(|error| format!("gameplay challenge view did not serialize: {error}"))?;
    let stored_view = read_json_path(&project_bundle, &["gameplayRuntime", "challengeView"])?;
    if stored_view != &authored_view {
        return Err(
            "ProjectBundle gameplayRuntime.challengeView drifted from the linked provider view"
                .to_owned(),
        );
    }
    let authored_scheduler = serde_json::to_value(gameplay_runtime_project_input().scheduler)
        .map_err(|error| format!("gameplay scheduler did not serialize: {error}"))?;
    let stored_scheduler = read_json_path(&project_bundle, &["gameplayRuntime", "scheduler"])?;
    if stored_scheduler != &authored_scheduler {
        return Err(
            "ProjectBundle gameplayRuntime.scheduler drifted from the linked composition"
                .to_owned(),
        );
    }
    require_json_number(&project_bundle, &["gameplayTriggers", "0", "entity"], 30)?;
    validate_prefab_interaction(&project_bundle)?;

    let mut checked_file_count = 1;
    for source_path in read_project_source_paths(&project_bundle)? {
        reject_private_engine_path("ProjectBundle sourceFiles", &source_path)?;
        let absolute_path = repo_root.join(&source_path);
        if !absolute_path.is_file() {
            return Err(format!(
                "ProjectBundle source file is missing: {source_path}"
            ));
        }
        checked_file_count += 1;
    }

    Ok(PreflightSummary {
        checked_file_count,
        engine_source: engine_source.to_owned(),
    })
}

fn read_project_source_paths(project_bundle: &JsonValue) -> Result<Vec<String>, String> {
    let source_files = project_bundle
        .get("sourceFiles")
        .and_then(JsonValue::as_object)
        .ok_or_else(|| "ProjectBundle.sourceFiles must be an object".to_owned())?;
    let mut paths = Vec::new();
    let entity_definitions = source_files
        .get("entityDefinitions")
        .and_then(JsonValue::as_array)
        .ok_or_else(|| "ProjectBundle.sourceFiles.entityDefinitions must be an array".to_owned())?;
    for value in entity_definitions {
        paths.push(
            value
                .as_str()
                .ok_or_else(|| "ProjectBundle entity definition refs must be strings".to_owned())?
                .to_owned(),
        );
    }
    paths.push(require_source_file(source_files, "sceneDocument")?);
    paths.push(require_source_file(source_files, "levelPreset")?);
    paths.push(require_source_file(source_files, "prefabRegistry")?);
    paths.push(require_source_file(source_files, "animatedMeshManifest")?);
    let catalog_refs = source_files
        .get("catalogRefs")
        .and_then(JsonValue::as_object)
        .ok_or_else(|| "ProjectBundle.sourceFiles.catalogRefs must be an object".to_owned())?;
    for value in catalog_refs.values() {
        paths.push(
            value
                .as_str()
                .ok_or_else(|| "ProjectBundle catalog refs must be strings".to_owned())?
                .to_owned(),
        );
    }
    if source_files.get("gameRuleModules").is_some() {
        return Err(
            "ProjectBundle.sourceFiles must not retain legacy gameRuleModules paths".to_owned(),
        );
    }
    Ok(paths)
}

fn validate_prefab_interaction(project_bundle: &JsonValue) -> Result<(), String> {
    let interaction = read_json_path(project_bundle, &["gameplayRuntime", "prefabInteraction"])?;
    let mut bridge = StaticRuntimeSessionBuilder::activate_project_with_prefabs(
        gameplay_runtime_project_input(),
        gameplay_runtime_prefab_bootstrap(),
    )
    .and_then(StaticRuntimeSessionBuilder::build)
    .map_err(|error| format!("linked RuntimeSession composition did not activate: {error}"))?;
    let before = bridge
        .read_composed_runtime_session()
        .map_err(|error| format!("linked RuntimeSession readout failed: {error}"))?;
    let receipt = bridge
        .apply_gameplay_prefab_part_interaction(GameplayPrefabPartInteractionRequest {
            actor: read_json_u64(interaction, "actor")?,
            instance: read_json_u64(interaction, "instance")?,
            role: interaction
                .get("role")
                .and_then(JsonValue::as_str)
                .ok_or_else(|| {
                    "gameplayRuntime.prefabInteraction.role must be a string".to_owned()
                })?
                .to_owned(),
            expected_target: read_json_u64(interaction, "expectedTarget")?,
            tick: read_json_u64(interaction, "tick")?,
            expected_runtime_session_hash: before.runtime_session_hash,
        })
        .map_err(|error| {
            format!("stored prefab interaction is not valid closed-registry evidence: {error}")
        })?;
    if receipt.target != read_json_u64(interaction, "expectedTarget")? {
        return Err("stored prefab interaction target drifted during linked activation".to_owned());
    }
    Ok(())
}

fn read_json_u64(value: &JsonValue, key: &str) -> Result<u64, String> {
    value
        .get(key)
        .and_then(JsonValue::as_u64)
        .ok_or_else(|| format!("gameplayRuntime.prefabInteraction.{key} must be a u64"))
}

fn require_source_file(
    source_files: &serde_json::Map<String, JsonValue>,
    key: &str,
) -> Result<String, String> {
    source_files
        .get(key)
        .and_then(JsonValue::as_str)
        .map(str::to_owned)
        .ok_or_else(|| format!("ProjectBundle.sourceFiles.{key} must be a string"))
}

fn require_toml_string<'a>(table: &'a toml::Table, path: &[&str]) -> Result<&'a str, String> {
    let mut value = table
        .get(path[0])
        .ok_or_else(|| format!("missing TOML key {}", path.join(".")))?;
    for key in &path[1..] {
        value = value
            .get(*key)
            .ok_or_else(|| format!("missing TOML key {}", path.join(".")))?;
    }
    value
        .as_str()
        .ok_or_else(|| format!("TOML key {} must be a string", path.join(".")))
}

fn require_json_string(value: &JsonValue, path: &[&str], expected: &str) -> Result<(), String> {
    let actual = read_json_path(value, path)?
        .as_str()
        .ok_or_else(|| format!("JSON key {} must be a string", path.join(".")))?;
    if actual != expected {
        return Err(format!(
            "JSON key {} must be {expected}, found {actual}",
            path.join(".")
        ));
    }
    Ok(())
}

fn require_json_number(value: &JsonValue, path: &[&str], expected: i64) -> Result<(), String> {
    let actual = read_json_path(value, path)?
        .as_i64()
        .ok_or_else(|| format!("JSON key {} must be a number", path.join(".")))?;
    if actual != expected {
        return Err(format!(
            "JSON key {} must be {expected}, found {actual}",
            path.join(".")
        ));
    }
    Ok(())
}

fn read_json_path<'a>(value: &'a JsonValue, path: &[&str]) -> Result<&'a JsonValue, String> {
    let mut current = value;
    for key in path {
        current = if let Ok(index) = key.parse::<usize>() {
            current.get(index)
        } else {
            current.get(*key)
        }
        .ok_or_else(|| format!("missing JSON key {}", path.join(".")))?;
    }
    Ok(current)
}

fn reject_private_engine_path(label: &str, value: &str) -> Result<(), String> {
    let forbidden_fragments = [
        "../asha-engine/engine-rs",
        "../asha-engine/ts/packages",
        "../asha/engine-rs",
        "../asha/ts/packages",
    ];
    for fragment in forbidden_fragments {
        if value.contains(fragment) {
            return Err(format!(
                "{label} must not reference private ASHA internals: {value}"
            ));
        }
    }
    Ok(())
}

fn read_text(path: &Path) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| format!("failed to read {}: {error}", display(path)))
}

fn display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_private_engine_paths() {
        let error = reject_private_engine_path("demo", "../asha-engine/engine-rs/crates/state")
            .expect_err("private engine path should be rejected");
        assert!(error.contains("private ASHA internals"));
    }
}

use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use asha_demo_primary_fire_effect::primary_fire_effect_manifest;
use serde_json::Value as JsonValue;

fn main() {
    let repo_root = env::args_os()
        .nth(1)
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
    let game_rule_modules = read_project_game_rule_modules(&project_bundle)?;
    if game_rule_modules.len() != 1 {
        return Err("ProjectBundle.gameRuleModules must declare exactly one demo rule module".to_owned());
    }
    let manifest = primary_fire_effect_manifest();
    require_json_string(
        &game_rule_modules[0],
        &["moduleRef", "moduleId"],
        manifest.module_ref.module_id.as_str(),
    )?;
    require_json_string(
        &game_rule_modules[0],
        &["moduleRef", "version"],
        manifest.module_ref.version.as_str(),
    )?;
    require_json_string(
        &game_rule_modules[0],
        &["moduleRef", "contractHash"],
        manifest.module_ref.contract_hash.as_str(),
    )?;

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
    let game_rule_modules = source_files
        .get("gameRuleModules")
        .and_then(JsonValue::as_array)
        .ok_or_else(|| "ProjectBundle.sourceFiles.gameRuleModules must be an array".to_owned())?;
    for value in game_rule_modules {
        paths.push(
            value
                .as_str()
                .ok_or_else(|| "ProjectBundle game rule module refs must be strings".to_owned())?
                .to_owned(),
        );
    }
    Ok(paths)
}

fn read_project_game_rule_modules(project_bundle: &JsonValue) -> Result<Vec<JsonValue>, String> {
    project_bundle
        .get("gameRuleModules")
        .and_then(JsonValue::as_array)
        .cloned()
        .ok_or_else(|| "ProjectBundle.gameRuleModules must declare demo Rust rule modules".to_owned())
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
        current = current
            .get(*key)
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

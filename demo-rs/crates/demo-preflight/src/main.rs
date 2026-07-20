use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use asha_demo_primary_fire_effect::{
    gameplay_challenge_view_contract, gameplay_composition, gameplay_module_ref,
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
        Ok(summary) => println!(
            "asha-demo canonical project preflight OK: {} artifacts, engine source {}",
            summary.checked_artifact_count, summary.engine_source
        ),
        Err(error) => {
            eprintln!("asha-demo canonical project preflight failed:\n- {error}");
            std::process::exit(1);
        }
    }
}

fn print_linked_contract() {
    let value = serde_json::json!({
        "module": gameplay_module_ref(),
        "challengeView": gameplay_challenge_view_contract(),
    });
    println!(
        "{}",
        serde_json::to_string_pretty(&value).expect("linked contract serializes")
    );
}

#[derive(Debug, PartialEq, Eq)]
struct PreflightSummary {
    checked_artifact_count: usize,
    engine_source: String,
}

fn run_preflight(repo_root: &Path) -> Result<PreflightSummary, String> {
    gameplay_composition().map_err(|error| format!("static gameplay composition: {error}"))?;

    let workspace_path = repo_root.join("asha.game.toml");
    let workspace_text = read_text(&workspace_path)?;
    let workspace = workspace_text
        .parse::<toml::Table>()
        .map_err(|error| format!("{} is not valid TOML: {error}", display(&workspace_path)))?;
    let engine_source = workspace
        .get("asha")
        .and_then(|asha| asha.get("engine_source"))
        .and_then(toml::Value::as_str)
        .ok_or_else(|| "asha.game.toml must declare asha.engine_source".to_owned())?;
    if engine_source != "../asha-engine" {
        return Err(format!(
            "asha.engine_source must use the fresh-clone sibling layout, found {engine_source}"
        ));
    }

    let manifest_path = repo_root.join("asha.project-bundle.json");
    let manifest_text = read_text(&manifest_path)?;
    let manifest: JsonValue = serde_json::from_str(&manifest_text)
        .map_err(|error| format!("{} is not valid JSON: {error}", display(&manifest_path)))?;
    require_u64(&manifest, "bundleSchemaVersion", 2)?;
    require_u64(&manifest, "protocolVersion", 1)?;
    require_u64(&manifest, "entryScene", 4103)?;
    let artifacts = manifest
        .get("artifacts")
        .and_then(JsonValue::as_array)
        .ok_or_else(|| "asha.project-bundle.json artifacts must be an array".to_owned())?;
    if artifacts.is_empty() {
        return Err("asha.project-bundle.json must close over stored project artifacts".to_owned());
    }

    for artifact in artifacts {
        let relative_path = artifact
            .get("path")
            .and_then(JsonValue::as_str)
            .ok_or_else(|| "manifest artifact path must be a string".to_owned())?;
        let expected_hash = artifact
            .get("contentHash")
            .and_then(JsonValue::as_str)
            .ok_or_else(|| format!("manifest artifact {relative_path} must carry contentHash"))?;
        let bytes = fs::read(repo_root.join(relative_path)).map_err(|error| {
            format!("could not read manifest artifact {relative_path}: {error}")
        })?;
        let actual_hash = format!("{:016x}", fnv1a64(&bytes));
        if actual_hash != expected_hash {
            return Err(format!(
                "manifest artifact {relative_path} hash mismatch: expected {expected_hash}, found {actual_hash}"
            ));
        }
    }

    Ok(PreflightSummary {
        checked_artifact_count: artifacts.len(),
        engine_source: engine_source.to_owned(),
    })
}

fn require_u64(value: &JsonValue, field: &str, expected: u64) -> Result<(), String> {
    let found = value.get(field).and_then(JsonValue::as_u64);
    if found == Some(expected) {
        Ok(())
    } else {
        Err(format!("{field} must be {expected}, found {found:?}"))
    }
}

fn fnv1a64(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf29ce484222325_u64, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
    })
}

fn read_text(path: &Path) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| format!("could not read {}: {error}", display(path)))
}

fn display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

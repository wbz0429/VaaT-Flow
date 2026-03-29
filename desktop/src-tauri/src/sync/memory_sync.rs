// Memory sync — monitors local memory.json and pushes changes to cloud.

use super::SyncState;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use std::time::SystemTime;

/// Tracks the last known mtime of memory.json to detect changes.
static LAST_MTIME: Mutex<Option<u64>> = Mutex::new(None);

#[derive(Serialize)]
struct MemoryPushRequest {
    agent_name: String,
    data: serde_json::Value,
    updated_at: String,
}

#[derive(Deserialize)]
struct MemoryPullResponse {
    data: Option<serde_json::Value>,
    version: i64,
    updated_at: Option<String>,
}

/// Push local memory.json to cloud if it has changed since last check.
/// Returns true if a push was performed.
pub async fn sync_memory(
    state: &SyncState,
    token: &str,
) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    let memory_path = state.memory_dir.join("memory.json");
    if !memory_path.exists() {
        return Ok(false);
    }

    // Check mtime
    let mtime = fs::metadata(&memory_path)?
        .modified()?
        .duration_since(SystemTime::UNIX_EPOCH)?
        .as_secs();

    {
        let mut last = LAST_MTIME.lock().unwrap();
        if *last == Some(mtime) {
            return Ok(false); // No change
        }
        *last = Some(mtime);
    }

    // Read and parse
    let content = fs::read_to_string(&memory_path)?;
    let data: serde_json::Value = serde_json::from_str(&content)?;

    let updated_at = data["lastUpdated"]
        .as_str()
        .unwrap_or("")
        .to_string();

    // Push to cloud
    let client = Client::new();
    let resp = client
        .post(format!("{}/sync/memory/push", state.sync_url))
        .bearer_auth(token)
        .json(&MemoryPushRequest {
            agent_name: "_default".to_string(),
            data,
            updated_at,
        })
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Memory push failed ({}): {}", status, body).into());
    }

    Ok(true)
}

/// Pull memory from cloud and write to local memory.json.
/// Used during new-device onboarding.
pub async fn pull_memory(
    memory_dir: &Path,
    sync_url: &str,
    token: &str,
) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    let client = Client::new();
    let resp = client
        .get(format!("{}/sync/memory/pull?agent_name=_default", sync_url))
        .bearer_auth(token)
        .send()
        .await?;

    if !resp.status().is_success() {
        return Err(format!("Memory pull failed: {}", resp.status()).into());
    }

    let pull: MemoryPullResponse = resp.json().await?;

    if let Some(data) = pull.data {
        let memory_path = memory_dir.join("memory.json");
        fs::create_dir_all(memory_dir)?;
        let content = serde_json::to_string_pretty(&data)?;
        fs::write(&memory_path, content)?;

        // Reset mtime tracker so we don't immediately re-push what we just pulled
        if let Ok(meta) = fs::metadata(&memory_path) {
            if let Ok(mtime) = meta.modified() {
                let secs = mtime
                    .duration_since(SystemTime::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();
                *LAST_MTIME.lock().unwrap() = Some(secs);
            }
        }

        return Ok(true);
    }

    Ok(false)
}

// Sync Engine — background synchronization of checkpoints and memory to cloud.
//
// Architecture:
// - Runs as a tokio task in the Tauri Rust runtime
// - Every 30s, checks for new local checkpoints and pushes to cloud
// - Monitors memory.json for changes and pushes updates
// - On login, pulls all data from cloud for new-device onboarding
// - Offline-resilient: skips sync when network is down, resumes automatically

pub mod checkpoint_sync;
pub mod memory_sync;
pub mod pull;
pub mod watermark;

use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{interval, Duration};
use tauri::Emitter;

/// Sync status emitted to the frontend via Tauri events.
#[derive(Debug, Clone, serde::Serialize)]
pub enum SyncStatus {
    #[serde(rename = "synced")]
    Synced,
    #[serde(rename = "syncing")]
    Syncing,
    #[serde(rename = "offline")]
    Offline,
    #[serde(rename = "error")]
    Error(String),
}

/// Shared state for the sync engine.
pub struct SyncState {
    pub sync_url: String,
    pub token: RwLock<Option<String>>,
    pub user_id: RwLock<Option<String>>,
    /// Path to the local SQLite checkpointer database
    pub checkpoint_db_path: PathBuf,
    /// Path to the local memory directory
    pub memory_dir: PathBuf,
    /// Whether sync is enabled (set to true after login)
    pub enabled: RwLock<bool>,
    /// Current sync status
    pub status: RwLock<SyncStatus>,
    /// Watermark store path (tracks last synced checkpoint per thread)
    pub watermark_path: PathBuf,
}

impl SyncState {
    pub fn new(sync_url: String, data_dir: &PathBuf) -> Self {
        Self {
            sync_url,
            token: RwLock::new(None),
            user_id: RwLock::new(None),
            checkpoint_db_path: data_dir.join("checkpoints.db"),
            memory_dir: data_dir.clone(),
            enabled: RwLock::new(false),
            status: RwLock::new(SyncStatus::Offline),
            watermark_path: data_dir.join("sync_watermarks.json"),
        }
    }
}

/// Check if the cloud sync service is reachable.
async fn is_online(sync_url: &str) -> bool {
    reqwest::Client::new()
        .get(format!("{}/health", sync_url))
        .timeout(Duration::from_secs(3))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

/// Main sync loop — runs in background, never returns.
pub async fn start_sync_loop(state: Arc<SyncState>, app_handle: tauri::AppHandle) {
    let mut ticker = interval(Duration::from_secs(30));

    loop {
        ticker.tick().await;

        // Check if sync is enabled
        if !*state.enabled.read().await {
            continue;
        }

        // Check if we have a token
        let token = match state.token.read().await.clone() {
            Some(t) => t,
            None => continue,
        };

        // Check network
        if !is_online(&state.sync_url).await {
            *state.status.write().await = SyncStatus::Offline;
            let _ = app_handle.emit("sync-status", "offline");
            continue;
        }

        // Set syncing status
        *state.status.write().await = SyncStatus::Syncing;
        let _ = app_handle.emit("sync-status", "syncing");

        let mut had_error = false;

        // Sync checkpoints
        match checkpoint_sync::sync_all_threads(&state, &token).await {
            Ok(count) => {
                if count > 0 {
                    println!("[sync] pushed {} checkpoints", count);
                }
            }
            Err(e) => {
                eprintln!("[sync] checkpoint sync error: {}", e);
                had_error = true;
            }
        }

        // Sync memory
        match memory_sync::sync_memory(&state, &token).await {
            Ok(synced) => {
                if synced {
                    println!("[sync] memory synced");
                }
            }
            Err(e) => {
                eprintln!("[sync] memory sync error: {}", e);
                had_error = true;
            }
        }

        // Update status
        if had_error {
            *state.status.write().await = SyncStatus::Error("Partial sync failure".to_string());
            let _ = app_handle.emit("sync-status", "error");
        } else {
            *state.status.write().await = SyncStatus::Synced;
            let _ = app_handle.emit("sync-status", "synced");
        }
    }
}

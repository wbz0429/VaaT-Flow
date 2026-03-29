// Pull flow — new device onboarding: pull all threads + memory from cloud.

use super::memory_sync;
use super::SyncState;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use reqwest::Client;
use rusqlite::Connection;
use serde::Deserialize;

#[derive(Deserialize)]
struct ThreadListResponse {
    threads: Vec<ThreadSummary>,
}

#[derive(Deserialize)]
struct ThreadSummary {
    thread_id: String,
    #[allow(dead_code)]
    last_synced: String,
    #[allow(dead_code)]
    checkpoint_count: i64,
}

#[derive(Deserialize)]
struct PullResponse {
    checkpoints: Vec<CheckpointData>,
    writes: Vec<WriteData>,
}

#[derive(Deserialize)]
struct CheckpointData {
    checkpoint_id: String,
    parent_checkpoint_id: Option<String>,
    checkpoint_ns: String,
    #[serde(rename = "type")]
    type_tag: Option<String>,
    checkpoint: String, // base64
    metadata: String,   // base64
}

#[derive(Deserialize)]
struct WriteData {
    checkpoint_id: String,
    checkpoint_ns: String,
    task_id: String,
    idx: i64,
    channel: String,
    #[serde(rename = "type")]
    type_tag: Option<String>,
    value: String, // base64
}

/// Pull all threads and memory from cloud to local.
/// Called after first login on a new device.
/// Returns total checkpoints pulled.
pub async fn pull_all(
    state: &SyncState,
    token: &str,
) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    let client = Client::new();
    let mut total = 0;

    // 1. Get thread list from cloud
    let resp = client
        .post(format!("{}/sync/checkpoints/threads", state.sync_url))
        .bearer_auth(token)
        .json(&serde_json::json!({"since": null}))
        .send()
        .await?;

    if !resp.status().is_success() {
        return Err(format!("Failed to list threads: {}", resp.status()).into());
    }

    let thread_list: ThreadListResponse = resp.json().await?;

    if thread_list.threads.is_empty() && !state.memory_dir.join("memory.json").exists() {
        println!("[sync] No cloud data to pull (new user)");
        return Ok(0);
    }

    // 2. Ensure local SQLite DB exists with correct schema
    std::fs::create_dir_all(&state.memory_dir)?;
    let conn = Connection::open(&state.checkpoint_db_path)?;
    ensure_tables(&conn)?;

    // 3. Pull each thread
    for thread in &thread_list.threads {
        // Check local latest checkpoint
        let local_latest: Option<String> = conn
            .query_row(
                "SELECT checkpoint_id FROM checkpoints WHERE thread_id = ?1
                 ORDER BY checkpoint_id DESC LIMIT 1",
                [&thread.thread_id],
                |row| row.get(0),
            )
            .ok();

        let resp = client
            .post(format!("{}/sync/checkpoints/pull", state.sync_url))
            .bearer_auth(token)
            .json(&serde_json::json!({
                "thread_id": thread.thread_id,
                "latest_checkpoint_id": local_latest,
            }))
            .send()
            .await?;

        if !resp.status().is_success() {
            eprintln!(
                "[sync] Failed to pull thread {}: {}",
                thread.thread_id,
                resp.status()
            );
            continue;
        }

        let pull: PullResponse = resp.json().await?;

        // Write checkpoints to local SQLite
        for cp in &pull.checkpoints {
            let blob = BASE64.decode(&cp.checkpoint).unwrap_or_default();
            let meta = BASE64.decode(&cp.metadata).unwrap_or_default();

            conn.execute(
                "INSERT OR IGNORE INTO checkpoints
                 (thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![
                    thread.thread_id,
                    cp.checkpoint_ns,
                    cp.checkpoint_id,
                    cp.parent_checkpoint_id,
                    cp.type_tag,
                    blob,
                    meta,
                ],
            )?;
            total += 1;
        }

        // Write writes to local SQLite
        for w in &pull.writes {
            let val = BASE64.decode(&w.value).unwrap_or_default();

            conn.execute(
                "INSERT OR IGNORE INTO writes
                 (thread_id, checkpoint_ns, checkpoint_id, task_id, idx, channel, type, value)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![
                    thread.thread_id,
                    w.checkpoint_ns,
                    w.checkpoint_id,
                    w.task_id,
                    w.idx,
                    w.channel,
                    w.type_tag,
                    val,
                ],
            )?;
        }
    }

    // 4. Pull memory
    match memory_sync::pull_memory(&state.memory_dir, &state.sync_url, token).await {
        Ok(true) => println!("[sync] Memory pulled from cloud"),
        Ok(false) => println!("[sync] No cloud memory to pull"),
        Err(e) => eprintln!("[sync] Memory pull error: {}", e),
    }

    println!("[sync] Pull complete: {} checkpoints from {} threads", total, thread_list.threads.len());
    Ok(total)
}

/// Ensure the local SQLite has the checkpoint/writes tables.
/// LangGraph normally creates these, but on a fresh device they may not exist yet.
fn ensure_tables(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS checkpoints (
            thread_id TEXT NOT NULL,
            checkpoint_ns TEXT NOT NULL DEFAULT '',
            checkpoint_id TEXT NOT NULL,
            parent_checkpoint_id TEXT,
            type TEXT,
            checkpoint BLOB,
            metadata BLOB,
            PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
        );
        CREATE TABLE IF NOT EXISTS writes (
            thread_id TEXT NOT NULL,
            checkpoint_ns TEXT NOT NULL DEFAULT '',
            checkpoint_id TEXT NOT NULL,
            task_id TEXT NOT NULL,
            idx INTEGER NOT NULL,
            channel TEXT NOT NULL,
            type TEXT,
            value BLOB,
            PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
        );",
    )
}

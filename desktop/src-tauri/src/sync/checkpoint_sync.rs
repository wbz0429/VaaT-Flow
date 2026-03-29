// Checkpoint sync — reads local SQLite, pushes new checkpoints to cloud.

use super::watermark::WatermarkStore;
use super::SyncState;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use reqwest::Client;
use rusqlite::Connection;
use serde::Serialize;

#[derive(Serialize, Clone)]
struct PushRequest {
    thread_id: String,
    checkpoints: Vec<CpRow>,
    writes: Vec<WrRow>,
}

#[derive(Serialize, Clone)]
struct CpRow {
    checkpoint_id: String,
    parent_checkpoint_id: Option<String>,
    checkpoint_ns: String,
    #[serde(rename = "type")]
    type_tag: Option<String>,
    checkpoint: String,
    metadata: String,
}

#[derive(Serialize, Clone)]
struct WrRow {
    checkpoint_id: String,
    checkpoint_ns: String,
    task_id: String,
    idx: i64,
    channel: String,
    #[serde(rename = "type")]
    type_tag: Option<String>,
    value: String,
}

pub async fn sync_all_threads(
    state: &SyncState,
    token: &str,
) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    let db_path = state.checkpoint_db_path.clone();
    if !db_path.exists() {
        return Ok(0);
    }

    let wm_path = state.watermark_path.clone();

    // All SQLite work in a blocking task
    let (batches, mut watermarks) = tokio::task::spawn_blocking(move || -> Result<_, Box<dyn std::error::Error + Send + Sync>> {
        let conn = Connection::open(&db_path)?;
        let wm = WatermarkStore::load(&wm_path);

        let tids: Vec<String> = {
            let mut st = conn.prepare("SELECT DISTINCT thread_id FROM checkpoints")?;
            let rows = st.query_map([], |r| r.get(0))?;
            rows.collect::<Result<Vec<_>, _>>()?
        };

        let mut batches: Vec<(String, Vec<CpRow>, Vec<WrRow>)> = Vec::new();

        for tid in &tids {
            let last = wm.get(tid);

            let cps: Vec<CpRow> = {
                let sql = match &last {
                    Some(_) => "SELECT checkpoint_id, parent_checkpoint_id, checkpoint_ns, type, checkpoint, metadata FROM checkpoints WHERE thread_id = ?1 AND checkpoint_id > ?2 ORDER BY checkpoint_id",
                    None => "SELECT checkpoint_id, parent_checkpoint_id, checkpoint_ns, type, checkpoint, metadata FROM checkpoints WHERE thread_id = ?1 ORDER BY checkpoint_id",
                };
                let mut st = conn.prepare(sql)?;
                let rows = if let Some(ref lid) = last {
                    st.query_map(rusqlite::params![tid, lid], map_cp)?
                } else {
                    st.query_map(rusqlite::params![tid], map_cp)?
                };
                rows.collect::<Result<Vec<_>, _>>()?
            };

            if cps.is_empty() { continue; }

            let mut writes: Vec<WrRow> = Vec::new();
            for cp in &cps {
                let ws: Vec<WrRow> = {
                    let mut st = conn.prepare("SELECT checkpoint_id, checkpoint_ns, task_id, idx, channel, type, value FROM writes WHERE thread_id = ?1 AND checkpoint_id = ?2")?;
                    let rows = st.query_map(rusqlite::params![tid, &cp.checkpoint_id], map_wr)?;
                    rows.collect::<Result<Vec<_>, _>>()?
                };
                writes.extend(ws);
            }

            batches.push((tid.clone(), cps, writes));
        }

        Ok((batches, wm))
    }).await??;

    let client = Client::new();
    let mut total = 0;

    for (tid, cps, writes) in &batches {
        let latest = cps.last().map(|c| c.checkpoint_id.clone());
        let resp = client
            .post(format!("{}/sync/checkpoints/push", state.sync_url))
            .bearer_auth(token)
            .json(&PushRequest { thread_id: tid.clone(), checkpoints: cps.clone(), writes: writes.clone() })
            .send()
            .await?;

        if resp.status().is_success() {
            total += cps.len();
            if let Some(lid) = latest {
                watermarks.set(tid.clone(), lid);
            }
        }
    }

    if total > 0 {
        let _ = watermarks.save(&state.watermark_path);
    }
    Ok(total)
}

fn map_cp(row: &rusqlite::Row) -> rusqlite::Result<CpRow> {
    let cp: Vec<u8> = row.get::<_, Vec<u8>>(4).unwrap_or_default();
    let meta: Vec<u8> = row.get::<_, Vec<u8>>(5).unwrap_or_default();
    Ok(CpRow {
        checkpoint_id: row.get(0)?,
        parent_checkpoint_id: row.get(1)?,
        checkpoint_ns: row.get::<_, String>(2).unwrap_or_default(),
        type_tag: row.get(3)?,
        checkpoint: BASE64.encode(&cp),
        metadata: BASE64.encode(&meta),
    })
}

fn map_wr(row: &rusqlite::Row) -> rusqlite::Result<WrRow> {
    let val: Vec<u8> = row.get::<_, Vec<u8>>(6).unwrap_or_default();
    Ok(WrRow {
        checkpoint_id: row.get(0)?,
        checkpoint_ns: row.get::<_, String>(1).unwrap_or_default(),
        task_id: row.get(2)?,
        idx: row.get(3)?,
        channel: row.get(4)?,
        type_tag: row.get(5)?,
        value: BASE64.encode(&val),
    })
}

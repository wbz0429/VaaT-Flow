// VaaT-Flow Desktop — Tauri main entry point
// Manages Python sidecar lifecycle, auth state, and exposes commands to the WebView.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::process::Command as StdCommand;
use std::sync::{Arc, Mutex};
use tauri::Manager;

mod sidecar;
mod sync;

/// Shared state accessible from Tauri commands.
struct AppState {
    /// Python Gateway process handle
    gateway_pid: Mutex<Option<u32>>,
    /// Python LangGraph process handle
    langgraph_pid: Mutex<Option<u32>>,
    /// Next.js frontend server process handle
    nextjs_pid: Mutex<Option<u32>>,
    /// JWT token for cloud sync
    auth_token: Mutex<Option<String>>,
    /// User info
    user_id: Mutex<Option<String>>,
    /// Cloud sync service URL
    sync_url: String,
    /// Local data directory (~/.vaatflow/)
    data_dir: PathBuf,
}

// ---------------------------------------------------------------------------
// Tauri Commands — called from frontend via invoke()
// ---------------------------------------------------------------------------

/// Login to cloud sync service, store JWT
#[tauri::command]
async fn login(
    email: String,
    password: String,
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/auth/login", state.sync_url))
        .json(&serde_json::json!({
            "email": email,
            "password": password,
            "device_name": hostname(),
            "platform": std::env::consts::OS,
        }))
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Login failed ({}): {}", status, body));
    }

    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    if let Some(token) = data["token"].as_str() {
        *state.auth_token.lock().unwrap() = Some(token.to_string());
    }
    if let Some(uid) = data["user_id"].as_str() {
        *state.user_id.lock().unwrap() = Some(uid.to_string());
    }

    Ok(data)
}

/// Logout — clear stored auth
#[tauri::command]
async fn logout(state: tauri::State<'_, AppState>) -> Result<(), String> {
    *state.auth_token.lock().unwrap() = None;
    *state.user_id.lock().unwrap() = None;
    Ok(())
}

/// Get current auth state
#[tauri::command]
async fn get_auth_state(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let token = state.auth_token.lock().unwrap().clone();
    let user_id = state.user_id.lock().unwrap().clone();
    Ok(serde_json::json!({
        "logged_in": token.is_some(),
        "user_id": user_id,
    }))
}

/// Pull model configs from cloud and write local config.yaml
#[tauri::command]
async fn pull_model_configs(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let token = state
        .auth_token
        .lock()
        .unwrap()
        .clone()
        .ok_or("Not logged in")?;

    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{}/client/models", state.sync_url))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Failed to fetch models: {}", resp.status()));
    }

    let models: Vec<serde_json::Value> = resp.json().await.map_err(|e| e.to_string())?;

    // Render config.yaml
    let config_yaml = render_config_yaml(&models);
    let config_path = state.data_dir.join("config.yaml");
    std::fs::create_dir_all(&state.data_dir).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, &config_yaml).map_err(|e| e.to_string())?;

    Ok(format!(
        "Pulled {} models, config written to {}",
        models.len(),
        config_path.display()
    ))
}

/// Check if Python backend is healthy
#[tauri::command]
async fn backend_health() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    match client
        .get("http://127.0.0.1:8001/health")
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
    {
        Ok(resp) => {
            let body: serde_json::Value = resp.json().await.unwrap_or(serde_json::json!({"status": "unknown"}));
            Ok(body)
        }
        Err(e) => Err(format!("Backend not ready: {}", e)),
    }
}

/// Get the data directory path
#[tauri::command]
async fn get_data_dir(state: tauri::State<'_, AppState>) -> Result<String, String> {
    Ok(state.data_dir.to_string_lossy().to_string())
}

/// Trigger a full pull from cloud (new device onboarding)
#[tauri::command]
async fn sync_pull_all(
    sync_state: tauri::State<'_, Arc<sync::SyncState>>,
) -> Result<String, String> {
    let token = sync_state
        .token
        .read()
        .await
        .clone()
        .ok_or("Not logged in")?;

    let count = sync::pull::pull_all(&sync_state, &token)
        .await
        .map_err(|e| e.to_string())?;

    Ok(format!("Pulled {} checkpoints", count))
}

/// Get current sync status
#[tauri::command]
async fn sync_status(
    sync_state: tauri::State<'_, Arc<sync::SyncState>>,
) -> Result<serde_json::Value, String> {
    let status = sync_state.status.read().await;
    let enabled = *sync_state.enabled.read().await;
    Ok(serde_json::json!({
        "enabled": enabled,
        "status": *status,
    }))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn hostname() -> String {
    gethostname::gethostname()
        .to_string_lossy()
        .to_string()
}

/// Render a config.yaml from cloud model configs
fn render_config_yaml(models: &[serde_json::Value]) -> String {
    let mut yaml = String::from(
        "# Auto-generated by VaaT-Flow Desktop — do not edit manually\n\
         config_version: 2\n\n\
         models:\n",
    );

    for m in models {
        yaml.push_str(&format!("  - name: {}\n", m["name"].as_str().unwrap_or("unknown")));
        yaml.push_str(&format!(
            "    display_name: {}\n",
            m["display_name"].as_str().unwrap_or("")
        ));
        yaml.push_str(&format!("    use: {}\n", m["use_class"].as_str().unwrap_or("")));
        yaml.push_str(&format!("    model: {}\n", m["model"].as_str().unwrap_or("")));

        if let Some(base) = m["api_base"].as_str() {
            yaml.push_str(&format!("    api_base: {}\n", base));
        }
        if let Some(key) = m["api_key"].as_str() {
            yaml.push_str(&format!("    api_key: {}\n", key));
        }
        if m["supports_thinking"].as_bool().unwrap_or(false) {
            yaml.push_str("    supports_thinking: true\n");
        }
        if m["supports_vision"].as_bool().unwrap_or(false) {
            yaml.push_str("    supports_vision: true\n");
        }
        if m["supports_reasoning_effort"].as_bool().unwrap_or(false) {
            yaml.push_str("    supports_reasoning_effort: true\n");
        }

        // Extra config fields
        if let Some(extra) = m["extra_config"].as_object() {
            for (k, v) in extra {
                match v {
                    serde_json::Value::String(s) => yaml.push_str(&format!("    {}: {}\n", k, s)),
                    serde_json::Value::Number(n) => yaml.push_str(&format!("    {}: {}\n", k, n)),
                    serde_json::Value::Bool(b) => yaml.push_str(&format!("    {}: {}\n", k, b)),
                    _ => yaml.push_str(&format!("    {}: {}\n", k, v)),
                }
            }
        }
        yaml.push('\n');
    }

    // Append standard config sections
    yaml.push_str(
        "\ntool_groups:\n\
         \x20 - name: web\n\
         \x20 - name: file:read\n\
         \x20 - name: file:write\n\
         \x20 - name: bash\n\n\
         tools:\n\
         \x20 - name: web_search\n\
         \x20   group: web\n\
         \x20   use: deerflow.community.tavily.tools:web_search_tool\n\
         \x20   max_results: 5\n\
         \x20 - name: web_fetch\n\
         \x20   group: web\n\
         \x20   use: deerflow.community.jina_ai.tools:web_fetch_tool\n\
         \x20   timeout: 10\n\
         \x20 - name: image_search\n\
         \x20   group: web\n\
         \x20   use: deerflow.community.image_search.tools:image_search_tool\n\
         \x20   max_results: 5\n\
         \x20 - name: ls\n\
         \x20   group: file:read\n\
         \x20   use: deerflow.sandbox.tools:ls_tool\n\
         \x20 - name: read_file\n\
         \x20   group: file:read\n\
         \x20   use: deerflow.sandbox.tools:read_file_tool\n\
         \x20 - name: write_file\n\
         \x20   group: file:write\n\
         \x20   use: deerflow.sandbox.tools:write_file_tool\n\
         \x20 - name: str_replace\n\
         \x20   group: file:write\n\
         \x20   use: deerflow.sandbox.tools:str_replace_tool\n\
         \x20 - name: bash\n\
         \x20   group: bash\n\
         \x20   use: deerflow.sandbox.tools:bash_tool\n\n\
         sandbox:\n\
         \x20 use: deerflow.sandbox.local:LocalSandboxProvider\n\n\
         skills:\n\
         \x20 container_path: /mnt/skills\n\n\
         title:\n\
         \x20 enabled: true\n\
         \x20 max_words: 6\n\
         \x20 max_chars: 60\n\n\
         summarization:\n\
         \x20 enabled: true\n\
         \x20 trigger:\n\
         \x20   - type: tokens\n\
         \x20     value: 15564\n\
         \x20 keep:\n\
         \x20   type: messages\n\
         \x20   value: 10\n\n\
         memory:\n\
         \x20 enabled: true\n\
         \x20 storage_path: memory.json\n\
         \x20 debounce_seconds: 30\n\n\
         checkpointer:\n\
         \x20 type: sqlite\n\
         \x20 connection_string: checkpoints.db\n",
    );

    yaml
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

fn main() {
    let data_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("VaaT-Flow");

    let sync_url = std::env::var("VAATFLOW_SYNC_URL")
        .unwrap_or_else(|_| "https://sync.vaatflow.com".to_string());

    // Create shared sync state
    let sync_state = Arc::new(sync::SyncState::new(sync_url.clone(), &data_dir));

    let sync_state_for_setup = sync_state.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(move |app| {
            let app_state = AppState {
                gateway_pid: Mutex::new(None),
                langgraph_pid: Mutex::new(None),
                nextjs_pid: Mutex::new(None),
                auth_token: Mutex::new(None),
                user_id: Mutex::new(None),
                sync_url: sync_url.clone(),
                data_dir: data_dir.clone(),
            };

            // Restore auth from persistent store (skip for now — store API requires plugin setup)
            // TODO: restore auth from tauri-plugin-store on startup

            // Start sidecars
            let resource_dir = app
                .path()
                .resource_dir()
                .unwrap_or_else(|_| PathBuf::from("."));

            println!("[desktop] resource_dir: {:?}", resource_dir);

            // Kill leftover processes from previous crash
            kill_port_occupant(3000);
            kill_port_occupant(8001);
            kill_port_occupant(2024);

            // Start Next.js frontend server (port 3000)
            match sidecar::start_nextjs(&resource_dir) {
                Ok(pid) => {
                    *app_state.nextjs_pid.lock().unwrap() = Some(pid);
                    println!("[desktop] Next.js started: pid={}", pid);
                }
                Err(e) => {
                    eprintln!("[desktop] Failed to start Next.js: {}", e);
                }
            }

            // Start Python sidecar
            let config_path = data_dir.join("config.yaml");
            if config_path.exists() {
                match sidecar::start_backend(&resource_dir, &data_dir, &config_path) {
                    Ok((gw_pid, lg_pid)) => {
                        *app_state.gateway_pid.lock().unwrap() = Some(gw_pid);
                        *app_state.langgraph_pid.lock().unwrap() = Some(lg_pid);
                        println!("[desktop] Backend started: gateway={}, langgraph={}", gw_pid, lg_pid);
                    }
                    Err(e) => {
                        eprintln!("[desktop] Failed to start backend: {}", e);
                    }
                }
            } else {
                println!("[desktop] No config.yaml found — user needs to login first");
            }

            app.manage(app_state);
            app.manage(sync_state_for_setup.clone());

            // Start background sync loop
            let sync_handle = sync_state_for_setup.clone();
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                sync::start_sync_loop(sync_handle, app_handle).await;
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.state::<AppState>();
                let gw = state.gateway_pid.lock().unwrap().take();
                let lg = state.langgraph_pid.lock().unwrap().take();
                let nj = state.nextjs_pid.lock().unwrap().take();
                drop(state);
                if let Some(pid) = gw { let _ = kill_process(pid); }
                if let Some(pid) = lg { let _ = kill_process(pid); }
                if let Some(pid) = nj { let _ = kill_process(pid); }
            }
        })
        .invoke_handler(tauri::generate_handler![
            login,
            logout,
            get_auth_state,
            pull_model_configs,
            backend_health,
            get_data_dir,
            sync_pull_all,
            sync_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running VaaT-Flow");
}

fn kill_process(pid: u32) -> Result<(), String> {
    #[cfg(unix)]
    {
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }
        Ok(())
    }
    #[cfg(windows)]
    {
        StdCommand::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .output()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

/// Kill any process occupying a given port (cleanup from previous crash).
fn kill_port_occupant(port: u16) {
    #[cfg(unix)]
    {
        if let Ok(output) = StdCommand::new("lsof")
            .args(["-ti", &format!(":{}", port)])
            .output()
        {
            let pids = String::from_utf8_lossy(&output.stdout);
            for pid_str in pids.split_whitespace() {
                if let Ok(pid) = pid_str.parse::<i32>() {
                    unsafe { libc::kill(pid, libc::SIGKILL); }
                    println!("[desktop] killed leftover process on port {}: pid={}", port, pid);
                }
            }
        }
    }
    #[cfg(windows)]
    {
        // Windows: netstat + taskkill
        let _ = StdCommand::new("cmd")
            .args(["/C", &format!("for /f \"tokens=5\" %a in ('netstat -aon ^| findstr :{} ^| findstr LISTENING') do taskkill /PID %a /F", port)])
            .output();
    }
}

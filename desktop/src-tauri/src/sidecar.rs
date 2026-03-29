// Sidecar process management.
// Starts Python backend (Gateway + LangGraph) and Next.js frontend server.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

/// Resolve the actual resources root — handles both:
/// - Release binary: resource_dir = .../target/release/, resources at ./resources/
/// - .app bundle: resource_dir = .../Contents/Resources/, resources at ./resources/
fn resolve_resources(resource_dir: &Path) -> PathBuf {
    let candidate = resource_dir.join("resources");
    println!("[sidecar] resource_dir: {:?}", resource_dir);
    println!("[sidecar] checking: {:?} exists={}", candidate, candidate.exists());
    if candidate.exists() {
        println!("[sidecar] resolved to: {:?}", candidate);
        candidate
    } else {
        println!("[sidecar] fallback to: {:?}", resource_dir);
        resource_dir.to_path_buf()
    }
}

/// Start Python backend processes. Returns (gateway_pid, langgraph_pid).
pub fn start_backend(
    resource_dir: &Path,
    data_dir: &Path,
    config_path: &Path,
) -> Result<(u32, u32), String> {
    let res = resolve_resources(resource_dir);
    let python = find_python(&res)?;
    let backend_dir = find_backend_dir(&res)?;

    std::fs::create_dir_all(data_dir).map_err(|e| format!("Cannot create data dir: {}", e))?;

    let gateway = Command::new(&python)
        .args(["-m", "uvicorn", "app.gateway.app:create_app", "--factory", "--host", "127.0.0.1", "--port", "8001"])
        .current_dir(&backend_dir)
        .env("DEER_FLOW_CONFIG_PATH", config_path)
        .env("DEER_FLOW_HOME", data_dir)
        .env("DEERFLOW_DESKTOP_MODE", "1")
        .env("SKIP_AUTH", "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start Gateway: {}", e))?;

    let langgraph = Command::new(&python)
        .args(["-m", "langgraph_runtime_inmem", "--host", "127.0.0.1", "--port", "2024"])
        .current_dir(&backend_dir)
        .env("DEER_FLOW_CONFIG_PATH", config_path)
        .env("DEER_FLOW_HOME", data_dir)
        .env("DEERFLOW_DESKTOP_MODE", "1")
        .env("SKIP_AUTH", "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start LangGraph: {}", e))?;

    let gw_pid = gateway.id();
    let lg_pid = langgraph.id();
    std::mem::forget(gateway);
    std::mem::forget(langgraph);
    Ok((gw_pid, lg_pid))
}

/// Start the Next.js standalone server (port 3000).
pub fn start_nextjs(resource_dir: &Path) -> Result<u32, String> {
    let res = resolve_resources(resource_dir);
    let frontend_dir = find_frontend_dir(&res)?;
    let node = find_node(&res)?;
    let server_js = frontend_dir.join("server.js");

    if !server_js.exists() {
        return Err(format!("server.js not found at {}", server_js.display()));
    }

    let child = Command::new(&node)
        .arg(&server_js)
        .current_dir(&frontend_dir)
        .env("PORT", "3000")
        .env("HOSTNAME", "127.0.0.1")
        .env("NODE_ENV", "production")
        .env("SKIP_ENV_VALIDATION", "1")
        .env("BETTER_AUTH_SECRET", "desktop-local-secret")
        .env("ALLO_MODE", "desktop")
        .env("BUILD_TARGET", "desktop")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start Next.js: {}", e))?;

    let pid = child.id();
    std::mem::forget(child);
    Ok(pid)
}

fn find_python(res: &Path) -> Result<PathBuf, String> {
    #[cfg(unix)]
    for name in &["python/bin/python3", "python/bin/python"] {
        let p = res.join(name);
        if p.exists() { return Ok(p); }
    }
    #[cfg(windows)]
    {
        let p = res.join("python/python.exe");
        if p.exists() { return Ok(p); }
    }

    // System fallback
    for name in &["python3.12", "python3"] {
        if let Ok(out) = Command::new(name).arg("--version").output() {
            if out.status.success() {
                let v = String::from_utf8_lossy(&out.stdout);
                if v.contains("3.12") || v.contains("3.13") {
                    return Ok(PathBuf::from(name));
                }
            }
        }
    }
    Err("Python 3.12+ not found".to_string())
}

fn find_node(res: &Path) -> Result<PathBuf, String> {
    #[cfg(unix)]
    {
        let p = res.join("node/bin/node");
        if p.exists() { return Ok(p); }
    }
    #[cfg(windows)]
    {
        let p = res.join("node/node.exe");
        if p.exists() { return Ok(p); }
    }

    // System fallback
    if let Ok(out) = Command::new("node").arg("--version").output() {
        if out.status.success() { return Ok(PathBuf::from("node")); }
    }
    Err("Node.js not found".to_string())
}

fn find_backend_dir(res: &Path) -> Result<PathBuf, String> {
    let bundled = res.join("backend");
    if bundled.exists() && bundled.join("app").exists() { return Ok(bundled); }

    for p in &["../../backend", "../backend", "backend"] {
        let path = PathBuf::from(p);
        if path.exists() && path.join("app").exists() {
            return std::fs::canonicalize(&path).map_err(|e| e.to_string());
        }
    }
    Err("Backend directory not found".to_string())
}

fn find_frontend_dir(res: &Path) -> Result<PathBuf, String> {
    let bundled = res.join("frontend");
    if bundled.join("server.js").exists() { return Ok(bundled); }

    for p in &["../../frontend/.next/standalone", "../frontend/.next/standalone"] {
        let path = PathBuf::from(p);
        if path.join(".next").exists() {
            return std::fs::canonicalize(&path).map_err(|e| e.to_string());
        }
    }
    Err("Frontend standalone directory not found".to_string())
}

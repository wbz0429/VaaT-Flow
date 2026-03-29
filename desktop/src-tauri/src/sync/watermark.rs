// Watermark store — tracks the last synced checkpoint_id per thread.
// Persisted as a simple JSON file so sync resumes correctly after app restart.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct WatermarkStore {
    /// thread_id → last synced checkpoint_id
    watermarks: HashMap<String, String>,
}

impl WatermarkStore {
    /// Load from disk, or return empty if file doesn't exist.
    pub fn load(path: &Path) -> Self {
        if !path.exists() {
            return Self::default();
        }
        match fs::read_to_string(path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
            Err(_) => Self::default(),
        }
    }

    /// Save to disk atomically (write tmp then rename).
    pub fn save(&self, path: &Path) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let content = serde_json::to_string_pretty(self)?;
        let tmp = path.with_extension("tmp");
        fs::write(&tmp, &content)?;
        fs::rename(&tmp, path)?;
        Ok(())
    }

    /// Get the last synced checkpoint_id for a thread.
    pub fn get(&self, thread_id: &str) -> Option<String> {
        self.watermarks.get(thread_id).cloned()
    }

    /// Set the last synced checkpoint_id for a thread.
    pub fn set(&mut self, thread_id: String, checkpoint_id: String) {
        self.watermarks.insert(thread_id, checkpoint_id);
    }
}

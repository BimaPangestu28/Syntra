//! CLI Configuration
//!
//! Manages authentication tokens and API base URL stored in ~/.syntra/config.toml

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct Config {
    pub api_url: Option<String>,
    pub token: Option<String>,
    pub organization_id: Option<String>,
    pub default_org_id: Option<String>,
    pub default_project_id: Option<String>,
}

impl Config {
    /// Get the config file path (~/.syntra/config.toml)
    pub fn path() -> Result<PathBuf> {
        let home = dirs::home_dir().context("Could not determine home directory")?;
        Ok(home.join(".syntra").join("config.toml"))
    }

    /// Load config from disk
    pub fn load() -> Result<Self> {
        let path = Self::path()?;
        if !path.exists() {
            return Ok(Self::default());
        }
        let content = std::fs::read_to_string(&path)
            .with_context(|| format!("Failed to read config at {}", path.display()))?;
        let config: Config = toml::from_str(&content)?;
        Ok(config)
    }

    /// Save config to disk
    pub fn save(&self) -> Result<()> {
        let path = Self::path()?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let content = toml::to_string_pretty(self)?;
        std::fs::write(&path, content)?;
        Ok(())
    }

    /// Get API base URL
    pub fn api_url(&self) -> &str {
        self.api_url
            .as_deref()
            .unwrap_or("https://app.syntra.io")
    }

    /// Check if authenticated
    #[allow(dead_code)]
    pub fn is_authenticated(&self) -> bool {
        self.token.is_some()
    }
}

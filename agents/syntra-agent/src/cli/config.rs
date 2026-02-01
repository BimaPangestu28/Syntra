//! Configuration module
//!
//! Handles loading and validating agent configuration from TOML files.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;
use uuid::Uuid;

/// Main configuration structure for the Syntra Agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    /// Unique identifier for this agent
    #[serde(default = "default_agent_id")]
    pub agent_id: String,

    /// Server/host identifier
    #[serde(default = "default_server_id")]
    pub server_id: String,

    /// Control plane connection settings
    #[serde(default)]
    pub control_plane: ControlPlaneConfig,

    /// Runtime configuration
    #[serde(default)]
    pub runtime: RuntimeConfig,

    /// Telemetry settings
    #[serde(default)]
    pub telemetry: TelemetryConfig,

    /// Logging configuration
    #[serde(default)]
    pub logging: LoggingConfig,
}

/// Control plane connection configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControlPlaneConfig {
    /// WebSocket URL for control plane connection
    #[serde(default = "default_control_plane_url")]
    pub url: String,

    /// API key for authentication
    #[serde(default)]
    pub api_key: Option<String>,

    /// Reconnect interval in milliseconds
    #[serde(default = "default_reconnect_interval")]
    pub reconnect_interval_ms: u64,

    /// Maximum reconnect attempts (0 = infinite)
    #[serde(default)]
    pub max_reconnect_attempts: u32,

    /// Heartbeat interval in seconds
    #[serde(default = "default_heartbeat_interval")]
    pub heartbeat_interval_secs: u64,
}

/// Runtime configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeConfig {
    /// Runtime type (docker, containerd, podman)
    #[serde(default = "default_runtime_type")]
    pub runtime_type: String,

    /// Docker socket path
    #[serde(default = "default_docker_socket")]
    pub docker_socket: String,

    /// Default network for containers
    #[serde(default = "default_network")]
    pub default_network: String,

    /// Resource limits
    #[serde(default)]
    pub resource_limits: ResourceLimits,
}

/// Resource limits configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ResourceLimits {
    /// Maximum memory per container in MB
    pub max_memory_mb: Option<u64>,

    /// Maximum CPU cores per container
    pub max_cpu_cores: Option<f64>,

    /// Maximum containers
    pub max_containers: Option<u32>,
}

/// Telemetry configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryConfig {
    /// Enable telemetry
    #[serde(default = "default_true")]
    pub enabled: bool,

    /// Metrics collection interval in seconds
    #[serde(default = "default_metrics_interval")]
    pub metrics_interval_secs: u64,

    /// Enable detailed container metrics
    #[serde(default)]
    pub detailed_metrics: bool,
}

/// Logging configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoggingConfig {
    /// Log level (trace, debug, info, warn, error)
    #[serde(default = "default_log_level")]
    pub level: String,

    /// Log format (pretty, json, compact)
    #[serde(default = "default_log_format")]
    pub format: String,

    /// Log file path (optional)
    pub file: Option<String>,

    /// Enable log rotation
    #[serde(default)]
    pub rotate: bool,

    /// Maximum log file size in MB
    #[serde(default = "default_max_log_size")]
    pub max_size_mb: u64,
}

// Default value functions
fn default_agent_id() -> String {
    Uuid::new_v4().to_string()
}

fn default_server_id() -> String {
    hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown".to_string())
}

fn default_control_plane_url() -> String {
    "ws://localhost:8080".to_string()
}

fn default_reconnect_interval() -> u64 {
    5000
}

fn default_heartbeat_interval() -> u64 {
    30
}

fn default_runtime_type() -> String {
    "docker".to_string()
}

fn default_docker_socket() -> String {
    "/var/run/docker.sock".to_string()
}

fn default_network() -> String {
    "syntra-network".to_string()
}

fn default_true() -> bool {
    true
}

fn default_metrics_interval() -> u64 {
    15
}

fn default_log_level() -> String {
    "info".to_string()
}

fn default_log_format() -> String {
    "pretty".to_string()
}

fn default_max_log_size() -> u64 {
    100
}

impl Default for ControlPlaneConfig {
    fn default() -> Self {
        Self {
            url: default_control_plane_url(),
            api_key: None,
            reconnect_interval_ms: default_reconnect_interval(),
            max_reconnect_attempts: 0,
            heartbeat_interval_secs: default_heartbeat_interval(),
        }
    }
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self {
            runtime_type: default_runtime_type(),
            docker_socket: default_docker_socket(),
            default_network: default_network(),
            resource_limits: ResourceLimits::default(),
        }
    }
}

impl Default for TelemetryConfig {
    fn default() -> Self {
        Self {
            enabled: default_true(),
            metrics_interval_secs: default_metrics_interval(),
            detailed_metrics: false,
        }
    }
}

impl Default for LoggingConfig {
    fn default() -> Self {
        Self {
            level: default_log_level(),
            format: default_log_format(),
            file: None,
            rotate: false,
            max_size_mb: default_max_log_size(),
        }
    }
}

impl Config {
    /// Load configuration from a TOML file
    pub fn load<P: AsRef<Path>>(path: P) -> Result<Self> {
        let path = path.as_ref();
        let content = std::fs::read_to_string(path)
            .with_context(|| format!("Failed to read config file: {}", path.display()))?;

        let config: Config = toml::from_str(&content)
            .with_context(|| format!("Failed to parse config file: {}", path.display()))?;

        Ok(config)
    }

    /// Create a default configuration
    pub fn default_config() -> Self {
        Self {
            agent_id: default_agent_id(),
            server_id: default_server_id(),
            control_plane: ControlPlaneConfig::default(),
            runtime: RuntimeConfig::default(),
            telemetry: TelemetryConfig::default(),
            logging: LoggingConfig::default(),
        }
    }

    /// Save configuration to a TOML file
    pub fn save<P: AsRef<Path>>(&self, path: P) -> Result<()> {
        let content = toml::to_string_pretty(self)
            .context("Failed to serialize configuration")?;

        std::fs::write(path.as_ref(), content)
            .with_context(|| format!("Failed to write config file: {}", path.as_ref().display()))?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = Config::default_config();
        assert!(!config.agent_id.is_empty());
        assert_eq!(config.control_plane.url, "ws://localhost:8080");
        assert_eq!(config.runtime.runtime_type, "docker");
    }

    #[test]
    fn test_parse_minimal_config() {
        let toml_content = r#"
            agent_id = "test-agent-123"
        "#;

        let config: Config = toml::from_str(toml_content).unwrap();
        assert_eq!(config.agent_id, "test-agent-123");
        assert_eq!(config.control_plane.url, "ws://localhost:8080");
    }
}

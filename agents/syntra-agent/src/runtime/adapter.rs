//! Runtime Adapter Trait
//!
//! Defines the common interface for all container runtime adapters.

use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Container information returned by the runtime
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerInfo {
    pub id: String,
    pub name: String,
    pub image: String,
    pub status: ContainerStatus,
    pub created_at: String,
    pub ports: Vec<PortBinding>,
    pub labels: HashMap<String, String>,
}

/// Container status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ContainerStatus {
    Created,
    Running,
    Paused,
    Restarting,
    Exited,
    Dead,
    Unknown,
}

impl std::fmt::Display for ContainerStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ContainerStatus::Created => write!(f, "created"),
            ContainerStatus::Running => write!(f, "running"),
            ContainerStatus::Paused => write!(f, "paused"),
            ContainerStatus::Restarting => write!(f, "restarting"),
            ContainerStatus::Exited => write!(f, "exited"),
            ContainerStatus::Dead => write!(f, "dead"),
            ContainerStatus::Unknown => write!(f, "unknown"),
        }
    }
}

/// Port binding configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortBinding {
    pub container_port: u16,
    pub host_port: Option<u16>,
    pub host_ip: Option<String>,
    pub protocol: String,
}

/// Container creation options
#[derive(Debug, Clone, Default)]
pub struct CreateContainerOptions {
    pub name: String,
    pub image: String,
    pub command: Option<Vec<String>>,
    pub env: Vec<(String, String)>,
    pub ports: Vec<PortBinding>,
    pub volumes: Vec<VolumeBinding>,
    pub labels: HashMap<String, String>,
    pub network: Option<String>,
    pub memory_limit: Option<u64>,
    pub cpu_limit: Option<f64>,
    pub restart_policy: Option<RestartPolicy>,
}

/// Volume binding configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolumeBinding {
    pub source: String,
    pub target: String,
    pub read_only: bool,
}

/// Container restart policy
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RestartPolicy {
    No,
    Always,
    OnFailure,
    UnlessStopped,
}

/// Image information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageInfo {
    pub id: String,
    pub repo_tags: Vec<String>,
    pub size: u64,
    pub created_at: String,
}

/// Container logs options
#[derive(Debug, Clone, Default)]
pub struct LogsOptions {
    pub stdout: bool,
    pub stderr: bool,
    pub follow: bool,
    pub tail: Option<usize>,
    pub since: Option<String>,
    pub until: Option<String>,
}

/// Container stats
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerStats {
    pub cpu_usage_percent: f64,
    pub memory_usage_bytes: u64,
    pub memory_limit_bytes: u64,
    pub network_rx_bytes: u64,
    pub network_tx_bytes: u64,
    pub block_read_bytes: u64,
    pub block_write_bytes: u64,
}

/// Runtime adapter trait - common interface for all container runtimes
#[async_trait]
pub trait RuntimeAdapter: Send + Sync {
    /// Get the runtime type name
    fn runtime_type(&self) -> &str;

    /// Check if the runtime is available and healthy
    async fn health_check(&self) -> Result<bool>;

    /// Get runtime version information
    async fn version(&self) -> Result<String>;

    /// List all containers
    async fn list_containers(&self, all: bool) -> Result<Vec<ContainerInfo>>;

    /// Get container by ID or name
    async fn get_container(&self, id_or_name: &str) -> Result<Option<ContainerInfo>>;

    /// Create a new container
    async fn create_container(&self, options: CreateContainerOptions) -> Result<String>;

    /// Start a container
    async fn start_container(&self, id: &str) -> Result<()>;

    /// Stop a container
    async fn stop_container(&self, id: &str, timeout_secs: Option<u64>) -> Result<()>;

    /// Remove a container
    async fn remove_container(&self, id: &str, force: bool) -> Result<()>;

    /// Get container logs
    async fn logs(&self, id: &str, options: LogsOptions) -> Result<Vec<String>>;

    /// Get container stats
    async fn stats(&self, id: &str) -> Result<ContainerStats>;

    /// Pull an image
    async fn pull_image(&self, image: &str) -> Result<()>;

    /// List images
    async fn list_images(&self) -> Result<Vec<ImageInfo>>;

    /// Remove an image
    async fn remove_image(&self, id: &str, force: bool) -> Result<()>;

    /// Create a network
    async fn create_network(&self, name: &str) -> Result<String>;

    /// Remove a network
    async fn remove_network(&self, name: &str) -> Result<()>;

    /// Execute a command in a running container
    async fn exec(&self, id: &str, cmd: Vec<String>) -> Result<(i64, String)>;
}

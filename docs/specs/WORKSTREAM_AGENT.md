# Workstream 1: Rust Agent - Detailed Specification

**Owner:** Backend Engineer (Rust)
**Duration:** Phase 1-4 (Week 1-26)
**Repository:** `syntra-dev/agent`

---

## 1. Project Structure

```
agent/
├── Cargo.toml
├── Cargo.lock
├── .cargo/
│   └── config.toml           # Build configuration
├── src/
│   ├── main.rs               # Entry point
│   ├── lib.rs                # Library exports
│   ├── cli/
│   │   ├── mod.rs
│   │   ├── commands.rs       # CLI command definitions
│   │   └── config.rs         # CLI config parsing
│   ├── agent/
│   │   ├── mod.rs
│   │   ├── state.rs          # Agent state machine
│   │   └── manager.rs        # Agent lifecycle
│   ├── connection/
│   │   ├── mod.rs
│   │   ├── websocket.rs      # WebSocket client
│   │   ├── protocol.rs       # Message handling
│   │   ├── reconnect.rs      # Reconnection logic
│   │   └── tls.rs            # mTLS handling
│   ├── runtime/
│   │   ├── mod.rs
│   │   ├── adapter.rs        # RuntimeAdapter trait
│   │   ├── docker/
│   │   │   ├── mod.rs
│   │   │   ├── adapter.rs    # DockerAdapter implementation
│   │   │   ├── container.rs  # Container operations
│   │   │   ├── image.rs      # Image operations
│   │   │   └── logs.rs       # Log streaming
│   │   └── kubernetes/
│   │       ├── mod.rs
│   │       ├── adapter.rs    # KubernetesAdapter
│   │       ├── deployment.rs
│   │       ├── service.rs
│   │       └── ingress.rs
│   ├── networking/
│   │   ├── mod.rs
│   │   ├── traefik.rs        # Traefik config generation
│   │   └── dns.rs            # Internal DNS
│   ├── telemetry/
│   │   ├── mod.rs
│   │   ├── otlp/
│   │   │   ├── mod.rs
│   │   │   ├── grpc.rs       # gRPC receiver (tonic)
│   │   │   └── http.rs       # HTTP receiver (axum)
│   │   ├── collector/
│   │   │   ├── mod.rs
│   │   │   ├── logs.rs       # Container log collector
│   │   │   ├── metrics.rs    # Metrics scraper
│   │   │   └── system.rs     # System metrics (/proc)
│   │   ├── buffer.rs         # Ring buffer
│   │   ├── batcher.rs        # Batch + compress
│   │   └── sampler.rs        # Adaptive sampling
│   ├── health/
│   │   ├── mod.rs
│   │   ├── checker.rs        # Health check executor
│   │   └── scheduler.rs      # Health check scheduler
│   ├── update/
│   │   ├── mod.rs
│   │   └── updater.rs        # Self-update mechanism
│   └── utils/
│       ├── mod.rs
│       ├── crypto.rs         # Encryption utilities
│       ├── compression.rs    # zstd compression
│       └── system.rs         # System info collection
├── tests/
│   ├── integration/
│   │   ├── docker_test.rs
│   │   ├── websocket_test.rs
│   │   └── telemetry_test.rs
│   └── unit/
│       └── ...
├── benches/
│   └── buffer_bench.rs
├── scripts/
│   ├── install.sh            # One-liner install script
│   └── build-release.sh      # Release build script
└── config/
    └── agent.example.toml    # Example config
```

---

## 2. Dependencies (Cargo.toml)

```toml
[package]
name = "syntra-agent"
version = "0.1.0"
edition = "2024"
authors = ["Syntra <[email protected]>"]
description = "Syntra PaaS Agent"
license = "Apache-2.0"
repository = "https://github.com/syntra-dev/agent"

[[bin]]
name = "syntra-agent"
path = "src/main.rs"

[dependencies]
# Async runtime
tokio = { version = "1.35", features = ["full"] }

# CLI
clap = { version = "4.4", features = ["derive", "env"] }

# WebSocket
tokio-tungstenite = { version = "0.21", features = ["rustls-tls-native-roots"] }
futures-util = "0.3"

# Docker
bollard = "0.15"

# Kubernetes
kube = { version = "0.87", features = ["runtime", "derive"] }
k8s-openapi = { version = "0.20", features = ["v1_28"] }

# HTTP server (OTLP receiver)
axum = { version = "0.7", features = ["ws"] }
tower = "0.4"
tower-http = { version = "0.5", features = ["cors", "trace"] }

# gRPC (OTLP receiver)
tonic = "0.10"
prost = "0.12"
prost-types = "0.12"

# HTTP client
reqwest = { version = "0.11", features = ["rustls-tls", "json", "gzip"] }

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
toml = "0.8"

# Compression
zstd = "0.13"

# Crypto
rustls = "0.22"
rustls-pemfile = "2.0"
ring = "0.17"

# Logging
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }

# Utils
uuid = { version = "1.6", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
thiserror = "1.0"
anyhow = "1.0"
async-trait = "0.1"
parking_lot = "0.12"
dashmap = "5.5"
bytes = "1.5"
base64 = "0.21"
sha2 = "0.10"
hex = "0.4"

# System info
sysinfo = "0.30"
nix = { version = "0.27", features = ["process", "signal"] }

[dev-dependencies]
tokio-test = "0.4"
mockall = "0.12"
testcontainers = "0.15"
wiremock = "0.5"
criterion = "0.5"
proptest = "1.4"

[build-dependencies]
tonic-build = "0.10"

[profile.release]
opt-level = 3
lto = true
codegen-units = 1
strip = true
panic = "abort"

[profile.release.package."*"]
opt-level = 3
```

---

## 3. Core Module Implementations

### 3.1 CLI Entry Point

```rust
// src/main.rs
use clap::{Parser, Subcommand};
use syntra_agent::{Agent, Config};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Parser)]
#[command(name = "syntra-agent")]
#[command(about = "Syntra PaaS Agent", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,

    #[arg(short, long, global = true, default_value = "/etc/syntra/agent.toml")]
    config: String,

    #[arg(short, long, global = true, default_value = "info")]
    log_level: String,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the agent
    Start,
    /// Show agent status
    Status,
    /// Install agent as systemd service
    Install {
        #[arg(long)]
        token: String,
        #[arg(long, default_value = "wss://api.syntra.dev/agent/ws")]
        endpoint: String,
    },
    /// Uninstall agent
    Uninstall,
    /// Update agent to latest version
    Update,
    /// Show version
    Version,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| cli.log_level.parse().unwrap()))
        .with(tracing_subscriber::fmt::layer().json())
        .init();

    match cli.command {
        Commands::Start => {
            let config = Config::load(&cli.config)?;
            let agent = Agent::new(config).await?;
            agent.run().await?;
        }
        Commands::Status => {
            // Read status from socket/file
            todo!()
        }
        Commands::Install { token, endpoint } => {
            syntra_agent::install::install(&token, &endpoint).await?;
        }
        Commands::Uninstall => {
            syntra_agent::install::uninstall().await?;
        }
        Commands::Update => {
            syntra_agent::update::update().await?;
        }
        Commands::Version => {
            println!("syntra-agent {}", env!("CARGO_PKG_VERSION"));
        }
    }

    Ok(())
}
```

### 3.2 Agent Configuration

```rust
// src/cli/config.rs
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub agent_id: String,
    pub server_id: String,
    pub control_plane: ControlPlaneConfig,
    pub runtime: RuntimeConfig,
    pub telemetry: TelemetryConfig,
    pub tls: TlsConfig,
    pub logging: LoggingConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControlPlaneConfig {
    pub endpoint: String,           // wss://api.syntra.dev/agent/ws
    pub token: String,              // Agent token
    pub heartbeat_interval_secs: u64,
    pub reconnect_max_delay_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeConfig {
    #[serde(default = "default_runtime")]
    pub runtime_type: RuntimeType,
    pub docker_socket: Option<String>,
    pub kubernetes_config: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RuntimeType {
    Docker,
    Kubernetes,
    Auto,
}

fn default_runtime() -> RuntimeType {
    RuntimeType::Auto
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryConfig {
    pub otlp_grpc_port: u16,        // 4317
    pub otlp_http_port: u16,        // 4318
    pub buffer_max_mb: usize,       // 50
    pub batch_interval_secs: u64,   // 5
    pub batch_max_items: usize,     // 1000
    pub sampling_rate: f64,         // 0.1 = 10%
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TlsConfig {
    pub cert_path: PathBuf,
    pub key_path: PathBuf,
    pub ca_path: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoggingConfig {
    pub level: String,
    pub format: String,             // json | text
    pub file: Option<PathBuf>,
}

impl Config {
    pub fn load(path: &str) -> anyhow::Result<Self> {
        let content = std::fs::read_to_string(path)?;
        let config: Config = toml::from_str(&content)?;
        Ok(config)
    }
}

// Example config file: /etc/syntra/agent.toml
/*
agent_id = "agt_abc123"
server_id = "srv_xyz789"

[control_plane]
endpoint = "wss://api.syntra.dev/agent/ws"
token = "syn_agt_xxxx"
heartbeat_interval_secs = 30
reconnect_max_delay_secs = 60

[runtime]
runtime_type = "docker"
docker_socket = "/var/run/docker.sock"

[telemetry]
otlp_grpc_port = 4317
otlp_http_port = 4318
buffer_max_mb = 50
batch_interval_secs = 5
batch_max_items = 1000
sampling_rate = 0.1

[tls]
cert_path = "/etc/syntra/certs/agent.crt"
key_path = "/etc/syntra/certs/agent.key"
ca_path = "/etc/syntra/certs/ca.crt"

[logging]
level = "info"
format = "json"
*/
```

### 3.3 Runtime Adapter Trait

```rust
// src/runtime/adapter.rs
use async_trait::async_trait;

#[derive(Debug, Clone)]
pub struct DeploySpec {
    pub deployment_id: String,
    pub service_id: String,
    pub service_name: String,
    pub project_name: String,
    pub image: ImageSpec,
    pub config: ContainerConfig,
    pub networking: NetworkingConfig,
    pub strategy: DeployStrategy,
    pub rollback_on_failure: bool,
    pub timeout_secs: u64,
}

#[derive(Debug, Clone)]
pub struct ImageSpec {
    pub registry: String,
    pub repository: String,
    pub tag: String,
    pub digest: Option<String>,
    pub auth: RegistryAuth,
}

#[derive(Debug, Clone)]
pub struct RegistryAuth {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone)]
pub struct ContainerConfig {
    pub port: u16,
    pub replicas: u32,
    pub cpu_limit: Option<String>,
    pub memory_limit: Option<String>,
    pub env_vars: std::collections::HashMap<String, String>,
    pub labels: std::collections::HashMap<String, String>,
    pub volumes: Vec<VolumeMount>,
    pub health_check: Option<HealthCheckConfig>,
}

#[derive(Debug, Clone)]
pub struct VolumeMount {
    pub name: String,
    pub host_path: Option<String>,
    pub container_path: String,
    pub read_only: bool,
}

#[derive(Debug, Clone)]
pub struct HealthCheckConfig {
    pub check_type: HealthCheckType,
    pub path: Option<String>,
    pub port: Option<u16>,
    pub command: Option<Vec<String>>,
    pub interval_secs: u64,
    pub timeout_secs: u64,
    pub retries: u32,
    pub start_period_secs: u64,
}

#[derive(Debug, Clone)]
pub enum HealthCheckType {
    Http,
    Tcp,
    Exec,
}

#[derive(Debug, Clone)]
pub struct NetworkingConfig {
    pub domains: Vec<String>,
    pub internal_hostname: String,
    pub expose_port: bool,
}

#[derive(Debug, Clone)]
pub enum DeployStrategy {
    Rolling,
    Instant,
    BlueGreen,
}

#[derive(Debug, Clone)]
pub struct DeployResult {
    pub success: bool,
    pub container_id: Option<String>,
    pub error: Option<String>,
    pub duration_ms: u64,
}

#[derive(Debug, Clone)]
pub struct ServiceStatus {
    pub service_id: String,
    pub container_id: String,
    pub status: ContainerStatus,
    pub health: HealthStatus,
    pub cpu_percent: f64,
    pub memory_mb: u64,
    pub restart_count: u32,
    pub started_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone)]
pub enum ContainerStatus {
    Running,
    Stopped,
    Restarting,
    Error,
}

#[derive(Debug, Clone)]
pub enum HealthStatus {
    Healthy,
    Unhealthy,
    Unknown,
}

#[derive(Debug, Clone)]
pub struct LogOptions {
    pub follow: bool,
    pub tail: Option<u32>,
    pub since: Option<chrono::DateTime<chrono::Utc>>,
    pub until: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Clone)]
pub struct ExecResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

pub type LogStream = tokio::sync::mpsc::Receiver<String>;

#[async_trait]
pub trait RuntimeAdapter: Send + Sync {
    /// Deploy a service
    async fn deploy(&self, spec: DeploySpec) -> anyhow::Result<DeployResult>;

    /// Stop a service
    async fn stop(&self, service_id: &str, timeout_secs: u64) -> anyhow::Result<()>;

    /// Scale service replicas
    async fn scale(&self, service_id: &str, replicas: u32) -> anyhow::Result<()>;

    /// Stream logs from service
    async fn logs(&self, service_id: &str, opts: LogOptions) -> anyhow::Result<LogStream>;

    /// Get service status
    async fn status(&self, service_id: &str) -> anyhow::Result<ServiceStatus>;

    /// Execute command in container
    async fn exec(
        &self,
        service_id: &str,
        command: &[String],
        timeout_secs: u64,
    ) -> anyhow::Result<ExecResult>;

    /// Rollback to previous deployment
    async fn rollback(
        &self,
        service_id: &str,
        target_deployment_id: &str,
    ) -> anyhow::Result<DeployResult>;

    /// Get container metrics
    async fn metrics(&self, service_id: &str) -> anyhow::Result<ContainerMetrics>;

    /// List all managed services
    async fn list_services(&self) -> anyhow::Result<Vec<ServiceStatus>>;

    /// Restart a service
    async fn restart(&self, service_id: &str, timeout_secs: u64) -> anyhow::Result<()>;
}

#[derive(Debug, Clone)]
pub struct ContainerMetrics {
    pub cpu_percent: f64,
    pub memory_usage_bytes: u64,
    pub memory_limit_bytes: u64,
    pub network_rx_bytes: u64,
    pub network_tx_bytes: u64,
    pub block_read_bytes: u64,
    pub block_write_bytes: u64,
}
```

### 3.4 Docker Adapter Implementation

```rust
// src/runtime/docker/adapter.rs
use async_trait::async_trait;
use bollard::container::{
    Config, CreateContainerOptions, ListContainersOptions,
    LogsOptions, RemoveContainerOptions, StartContainerOptions,
    StopContainerOptions, WaitContainerOptions,
};
use bollard::exec::{CreateExecOptions, StartExecResults};
use bollard::image::CreateImageOptions;
use bollard::Docker;
use futures_util::StreamExt;
use std::collections::HashMap;
use std::sync::Arc;

use crate::runtime::adapter::*;

pub struct DockerAdapter {
    docker: Docker,
    traefik_config: Arc<TraefikConfigManager>,
}

impl DockerAdapter {
    pub async fn new(socket_path: Option<&str>) -> anyhow::Result<Self> {
        let docker = match socket_path {
            Some(path) => Docker::connect_with_unix(path, 120, bollard::API_DEFAULT_VERSION)?,
            None => Docker::connect_with_local_defaults()?,
        };

        // Verify connection
        docker.ping().await?;

        Ok(Self {
            docker,
            traefik_config: Arc::new(TraefikConfigManager::new()),
        })
    }

    fn container_name(&self, service_id: &str, deployment_id: &str) -> String {
        format!("syn-{}-{}", service_id, &deployment_id[..8])
    }

    fn build_container_config(&self, spec: &DeploySpec) -> Config<String> {
        let mut labels = spec.config.labels.clone();

        // Add Syntra labels
        labels.insert("syntra.managed".to_string(), "true".to_string());
        labels.insert("syntra.service_id".to_string(), spec.service_id.clone());
        labels.insert("syntra.deployment_id".to_string(), spec.deployment_id.clone());

        // Add Traefik labels for routing
        if !spec.networking.domains.is_empty() {
            let router_name = format!("syn-{}", spec.service_id);

            labels.insert("traefik.enable".to_string(), "true".to_string());
            labels.insert(
                format!("traefik.http.routers.{}.rule", router_name),
                spec.networking.domains.iter()
                    .map(|d| format!("Host(`{}`)", d))
                    .collect::<Vec<_>>()
                    .join(" || "),
            );
            labels.insert(
                format!("traefik.http.routers.{}.entrypoints", router_name),
                "websecure".to_string(),
            );
            labels.insert(
                format!("traefik.http.routers.{}.tls.certresolver", router_name),
                "letsencrypt".to_string(),
            );
            labels.insert(
                format!("traefik.http.services.{}.loadbalancer.server.port", router_name),
                spec.config.port.to_string(),
            );
        }

        let mut env: Vec<String> = spec.config.env_vars
            .iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect();

        // Add Syntra env vars
        env.push(format!("SYNTRA_SERVICE_ID={}", spec.service_id));
        env.push(format!("SYNTRA_DEPLOYMENT_ID={}", spec.deployment_id));
        env.push("SYNTRA_OTLP_ENDPOINT=http://localhost:4318".to_string());

        let image = format!(
            "{}/{}:{}",
            spec.image.registry,
            spec.image.repository,
            spec.image.tag
        );

        let mut host_config = bollard::service::HostConfig::default();

        // Resource limits
        if let Some(memory) = &spec.config.memory_limit {
            host_config.memory = Some(parse_memory_limit(memory));
        }
        if let Some(cpu) = &spec.config.cpu_limit {
            host_config.nano_cpus = Some(parse_cpu_limit(cpu));
        }

        // Health check
        let health_check = spec.config.health_check.as_ref().map(|hc| {
            bollard::container::HealthConfig {
                test: Some(match &hc.check_type {
                    HealthCheckType::Http => vec![
                        "CMD-SHELL".to_string(),
                        format!(
                            "curl -f http://localhost:{}{} || exit 1",
                            hc.port.unwrap_or(spec.config.port),
                            hc.path.as_deref().unwrap_or("/health")
                        ),
                    ],
                    HealthCheckType::Tcp => vec![
                        "CMD-SHELL".to_string(),
                        format!(
                            "nc -z localhost {} || exit 1",
                            hc.port.unwrap_or(spec.config.port)
                        ),
                    ],
                    HealthCheckType::Exec => hc.command.clone().unwrap_or_default(),
                }),
                interval: Some((hc.interval_secs * 1_000_000_000) as i64),
                timeout: Some((hc.timeout_secs * 1_000_000_000) as i64),
                retries: Some(hc.retries as i64),
                start_period: Some((hc.start_period_secs * 1_000_000_000) as i64),
            }
        });

        Config {
            image: Some(image),
            env: Some(env),
            labels: Some(labels),
            host_config: Some(host_config),
            healthcheck: health_check,
            ..Default::default()
        }
    }
}

#[async_trait]
impl RuntimeAdapter for DockerAdapter {
    async fn deploy(&self, spec: DeploySpec) -> anyhow::Result<DeployResult> {
        let start_time = std::time::Instant::now();

        tracing::info!(
            deployment_id = %spec.deployment_id,
            service_id = %spec.service_id,
            image = %format!("{}:{}", spec.image.repository, spec.image.tag),
            "Starting deployment"
        );

        // 1. Pull image
        let image = format!(
            "{}/{}:{}",
            spec.image.registry,
            spec.image.repository,
            spec.image.tag
        );

        let auth = bollard::auth::DockerCredentials {
            username: Some(spec.image.auth.username.clone()),
            password: Some(spec.image.auth.password.clone()),
            ..Default::default()
        };

        let mut pull_stream = self.docker.create_image(
            Some(CreateImageOptions {
                from_image: image.clone(),
                ..Default::default()
            }),
            None,
            Some(auth),
        );

        while let Some(result) = pull_stream.next().await {
            match result {
                Ok(info) => {
                    tracing::debug!(progress = ?info, "Pull progress");
                }
                Err(e) => {
                    return Ok(DeployResult {
                        success: false,
                        container_id: None,
                        error: Some(format!("Failed to pull image: {}", e)),
                        duration_ms: start_time.elapsed().as_millis() as u64,
                    });
                }
            }
        }

        // 2. Stop old container (if exists)
        let old_containers = self.find_service_containers(&spec.service_id).await?;
        for container in &old_containers {
            tracing::info!(container_id = %container, "Stopping old container");
            let _ = self.docker.stop_container(
                container,
                Some(StopContainerOptions { t: 30 }),
            ).await;
        }

        // 3. Create new container
        let container_name = self.container_name(&spec.service_id, &spec.deployment_id);
        let config = self.build_container_config(&spec);

        let container = self.docker.create_container(
            Some(CreateContainerOptions {
                name: &container_name,
                platform: None,
            }),
            config,
        ).await?;

        tracing::info!(container_id = %container.id, "Container created");

        // 4. Start container
        self.docker.start_container(
            &container.id,
            None::<StartContainerOptions<String>>,
        ).await?;

        // 5. Wait for health check
        if spec.config.health_check.is_some() {
            let healthy = self.wait_for_healthy(&container.id, spec.timeout_secs).await;
            if !healthy {
                // Rollback on failure
                if spec.rollback_on_failure && !old_containers.is_empty() {
                    tracing::warn!("Health check failed, rolling back");
                    let _ = self.docker.stop_container(&container.id, None).await;
                    let _ = self.docker.remove_container(&container.id, None).await;

                    // Restart old container
                    for old in &old_containers {
                        let _ = self.docker.start_container(old, None::<StartContainerOptions<String>>).await;
                    }
                }

                return Ok(DeployResult {
                    success: false,
                    container_id: Some(container.id),
                    error: Some("Health check failed".to_string()),
                    duration_ms: start_time.elapsed().as_millis() as u64,
                });
            }
        }

        // 6. Remove old containers
        for old in old_containers {
            let _ = self.docker.remove_container(
                &old,
                Some(RemoveContainerOptions {
                    force: true,
                    ..Default::default()
                }),
            ).await;
        }

        Ok(DeployResult {
            success: true,
            container_id: Some(container.id),
            error: None,
            duration_ms: start_time.elapsed().as_millis() as u64,
        })
    }

    async fn stop(&self, service_id: &str, timeout_secs: u64) -> anyhow::Result<()> {
        let containers = self.find_service_containers(service_id).await?;

        for container_id in containers {
            self.docker.stop_container(
                &container_id,
                Some(StopContainerOptions { t: timeout_secs as i64 }),
            ).await?;
        }

        Ok(())
    }

    async fn scale(&self, service_id: &str, replicas: u32) -> anyhow::Result<()> {
        // For Docker, scaling means running multiple containers
        // This is simplified - real implementation would need more logic
        let current = self.find_service_containers(service_id).await?;
        let current_count = current.len() as u32;

        if replicas > current_count {
            // Scale up - need original deploy spec (would be stored in state)
            todo!("Scale up not implemented - need stored deploy spec")
        } else if replicas < current_count {
            // Scale down
            let to_remove = current_count - replicas;
            for container_id in current.iter().take(to_remove as usize) {
                self.docker.stop_container(container_id, None).await?;
                self.docker.remove_container(container_id, None).await?;
            }
        }

        Ok(())
    }

    async fn logs(&self, service_id: &str, opts: LogOptions) -> anyhow::Result<LogStream> {
        let containers = self.find_service_containers(service_id).await?;
        let container_id = containers.first()
            .ok_or_else(|| anyhow::anyhow!("No container found for service"))?;

        let (tx, rx) = tokio::sync::mpsc::channel(1000);

        let log_opts = LogsOptions::<String> {
            follow: opts.follow,
            stdout: true,
            stderr: true,
            tail: opts.tail.map(|t| t.to_string()).unwrap_or_else(|| "100".to_string()),
            since: opts.since.map(|t| t.timestamp()).unwrap_or(0),
            until: opts.until.map(|t| t.timestamp()),
            ..Default::default()
        };

        let docker = self.docker.clone();
        let container_id = container_id.clone();

        tokio::spawn(async move {
            let mut stream = docker.logs(&container_id, Some(log_opts));

            while let Some(result) = stream.next().await {
                match result {
                    Ok(output) => {
                        let line = output.to_string();
                        if tx.send(line).await.is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        tracing::error!(error = %e, "Log stream error");
                        break;
                    }
                }
            }
        });

        Ok(rx)
    }

    async fn status(&self, service_id: &str) -> anyhow::Result<ServiceStatus> {
        let containers = self.find_service_containers(service_id).await?;
        let container_id = containers.first()
            .ok_or_else(|| anyhow::anyhow!("No container found for service"))?;

        let inspect = self.docker.inspect_container(container_id, None).await?;
        let state = inspect.state.unwrap_or_default();

        let status = match state.status {
            Some(bollard::container::ContainerStateStatusEnum::RUNNING) => ContainerStatus::Running,
            Some(bollard::container::ContainerStateStatusEnum::RESTARTING) => ContainerStatus::Restarting,
            _ => ContainerStatus::Stopped,
        };

        let health = match state.health.and_then(|h| h.status) {
            Some(bollard::container::HealthStatusEnum::HEALTHY) => HealthStatus::Healthy,
            Some(bollard::container::HealthStatusEnum::UNHEALTHY) => HealthStatus::Unhealthy,
            _ => HealthStatus::Unknown,
        };

        // Get metrics
        let metrics = self.metrics(service_id).await.unwrap_or_default();

        Ok(ServiceStatus {
            service_id: service_id.to_string(),
            container_id: container_id.clone(),
            status,
            health,
            cpu_percent: metrics.cpu_percent,
            memory_mb: metrics.memory_usage_bytes / (1024 * 1024),
            restart_count: inspect.restart_count.unwrap_or(0) as u32,
            started_at: chrono::Utc::now(), // Parse from state.started_at
        })
    }

    async fn exec(
        &self,
        service_id: &str,
        command: &[String],
        timeout_secs: u64,
    ) -> anyhow::Result<ExecResult> {
        let containers = self.find_service_containers(service_id).await?;
        let container_id = containers.first()
            .ok_or_else(|| anyhow::anyhow!("No container found for service"))?;

        let exec = self.docker.create_exec(
            container_id,
            CreateExecOptions {
                cmd: Some(command.to_vec()),
                attach_stdout: Some(true),
                attach_stderr: Some(true),
                ..Default::default()
            },
        ).await?;

        let output = self.docker.start_exec(&exec.id, None).await?;

        let (stdout, stderr) = match output {
            StartExecResults::Attached { mut output, .. } => {
                let mut stdout = String::new();
                let mut stderr = String::new();

                while let Some(chunk) = output.next().await {
                    match chunk? {
                        bollard::container::LogOutput::StdOut { message } => {
                            stdout.push_str(&String::from_utf8_lossy(&message));
                        }
                        bollard::container::LogOutput::StdErr { message } => {
                            stderr.push_str(&String::from_utf8_lossy(&message));
                        }
                        _ => {}
                    }
                }

                (stdout, stderr)
            }
            _ => (String::new(), String::new()),
        };

        let inspect = self.docker.inspect_exec(&exec.id).await?;
        let exit_code = inspect.exit_code.unwrap_or(-1) as i32;

        Ok(ExecResult {
            exit_code,
            stdout,
            stderr,
        })
    }

    async fn rollback(
        &self,
        service_id: &str,
        target_deployment_id: &str,
    ) -> anyhow::Result<DeployResult> {
        // Find container with target deployment ID
        // This requires storing deployment specs
        todo!("Rollback requires stored deployment specs")
    }

    async fn metrics(&self, service_id: &str) -> anyhow::Result<ContainerMetrics> {
        let containers = self.find_service_containers(service_id).await?;
        let container_id = containers.first()
            .ok_or_else(|| anyhow::anyhow!("No container found for service"))?;

        let mut stats_stream = self.docker.stats(container_id, Some(bollard::container::StatsOptions {
            stream: false,
            one_shot: true,
        }));

        if let Some(Ok(stats)) = stats_stream.next().await {
            let cpu_delta = stats.cpu_stats.cpu_usage.total_usage
                - stats.precpu_stats.cpu_usage.total_usage;
            let system_delta = stats.cpu_stats.system_cpu_usage.unwrap_or(0)
                - stats.precpu_stats.system_cpu_usage.unwrap_or(0);
            let cpu_percent = if system_delta > 0 {
                (cpu_delta as f64 / system_delta as f64) * 100.0
                    * stats.cpu_stats.online_cpus.unwrap_or(1) as f64
            } else {
                0.0
            };

            Ok(ContainerMetrics {
                cpu_percent,
                memory_usage_bytes: stats.memory_stats.usage.unwrap_or(0),
                memory_limit_bytes: stats.memory_stats.limit.unwrap_or(0),
                network_rx_bytes: stats.networks.as_ref()
                    .map(|n| n.values().map(|v| v.rx_bytes).sum())
                    .unwrap_or(0),
                network_tx_bytes: stats.networks.as_ref()
                    .map(|n| n.values().map(|v| v.tx_bytes).sum())
                    .unwrap_or(0),
                block_read_bytes: 0,
                block_write_bytes: 0,
            })
        } else {
            Ok(ContainerMetrics::default())
        }
    }

    async fn list_services(&self) -> anyhow::Result<Vec<ServiceStatus>> {
        let containers = self.docker.list_containers(Some(ListContainersOptions {
            filters: HashMap::from([
                ("label".to_string(), vec!["syntra.managed=true".to_string()]),
            ]),
            ..Default::default()
        })).await?;

        let mut services = Vec::new();

        for container in containers {
            if let Some(labels) = &container.labels {
                if let Some(service_id) = labels.get("syntra.service_id") {
                    if let Ok(status) = self.status(service_id).await {
                        services.push(status);
                    }
                }
            }
        }

        Ok(services)
    }

    async fn restart(&self, service_id: &str, timeout_secs: u64) -> anyhow::Result<()> {
        let containers = self.find_service_containers(service_id).await?;

        for container_id in containers {
            self.docker.restart_container(
                &container_id,
                Some(bollard::container::RestartContainerOptions { t: timeout_secs as i64 }),
            ).await?;
        }

        Ok(())
    }
}

impl DockerAdapter {
    async fn find_service_containers(&self, service_id: &str) -> anyhow::Result<Vec<String>> {
        let containers = self.docker.list_containers(Some(ListContainersOptions {
            all: true,
            filters: HashMap::from([
                ("label".to_string(), vec![format!("syntra.service_id={}", service_id)]),
            ]),
            ..Default::default()
        })).await?;

        Ok(containers.into_iter()
            .filter_map(|c| c.id)
            .collect())
    }

    async fn wait_for_healthy(&self, container_id: &str, timeout_secs: u64) -> bool {
        let start = std::time::Instant::now();
        let timeout = std::time::Duration::from_secs(timeout_secs);

        while start.elapsed() < timeout {
            if let Ok(inspect) = self.docker.inspect_container(container_id, None).await {
                if let Some(state) = inspect.state {
                    if let Some(health) = state.health {
                        match health.status {
                            Some(bollard::container::HealthStatusEnum::HEALTHY) => return true,
                            Some(bollard::container::HealthStatusEnum::UNHEALTHY) => return false,
                            _ => {}
                        }
                    }
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }

        false
    }
}

fn parse_memory_limit(limit: &str) -> i64 {
    let limit = limit.to_lowercase();
    if limit.ends_with("g") || limit.ends_with("gb") {
        let num: i64 = limit.trim_end_matches(char::is_alphabetic).parse().unwrap_or(512);
        num * 1024 * 1024 * 1024
    } else if limit.ends_with("m") || limit.ends_with("mb") {
        let num: i64 = limit.trim_end_matches(char::is_alphabetic).parse().unwrap_or(512);
        num * 1024 * 1024
    } else {
        512 * 1024 * 1024 // Default 512MB
    }
}

fn parse_cpu_limit(limit: &str) -> i64 {
    let num: f64 = limit.parse().unwrap_or(1.0);
    (num * 1_000_000_000.0) as i64 // Convert to nanocpus
}

impl Default for ContainerMetrics {
    fn default() -> Self {
        Self {
            cpu_percent: 0.0,
            memory_usage_bytes: 0,
            memory_limit_bytes: 0,
            network_rx_bytes: 0,
            network_tx_bytes: 0,
            block_read_bytes: 0,
            block_write_bytes: 0,
        }
    }
}
```

---

## 4. Testing Strategy

### 4.1 Unit Tests

```rust
// tests/unit/docker_adapter_test.rs
#[cfg(test)]
mod tests {
    use super::*;
    use mockall::predicate::*;

    // Mock Docker client for unit tests
    #[test]
    fn test_container_name_format() {
        let adapter = DockerAdapter::new(None).await.unwrap();
        let name = adapter.container_name("svc_123", "dep_abc12345");
        assert_eq!(name, "syn-svc_123-dep_abc1");
    }

    #[test]
    fn test_parse_memory_limit() {
        assert_eq!(parse_memory_limit("512m"), 536870912);
        assert_eq!(parse_memory_limit("1g"), 1073741824);
        assert_eq!(parse_memory_limit("256MB"), 268435456);
    }

    #[test]
    fn test_parse_cpu_limit() {
        assert_eq!(parse_cpu_limit("0.5"), 500000000);
        assert_eq!(parse_cpu_limit("2"), 2000000000);
    }
}
```

### 4.2 Integration Tests

```rust
// tests/integration/docker_test.rs
use testcontainers::{clients, images::generic::GenericImage, RunnableImage};

#[tokio::test]
async fn test_full_deploy_cycle() {
    let docker = clients::Cli::default();

    // Start a mock registry
    let registry = docker.run(
        RunnableImage::from(
            GenericImage::new("registry", "2")
        ).with_exposed_port(5000)
    );

    let adapter = DockerAdapter::new(None).await.unwrap();

    let spec = DeploySpec {
        deployment_id: "dep_test123".to_string(),
        service_id: "svc_test".to_string(),
        service_name: "test-service".to_string(),
        project_name: "test-project".to_string(),
        image: ImageSpec {
            registry: format!("localhost:{}", registry.get_host_port_ipv4(5000)),
            repository: "test/nginx".to_string(),
            tag: "latest".to_string(),
            digest: None,
            auth: RegistryAuth {
                username: "".to_string(),
                password: "".to_string(),
            },
        },
        config: ContainerConfig {
            port: 80,
            replicas: 1,
            cpu_limit: Some("0.5".to_string()),
            memory_limit: Some("256m".to_string()),
            env_vars: HashMap::new(),
            labels: HashMap::new(),
            volumes: vec![],
            health_check: None,
        },
        networking: NetworkingConfig {
            domains: vec![],
            internal_hostname: "test.internal".to_string(),
            expose_port: true,
        },
        strategy: DeployStrategy::Rolling,
        rollback_on_failure: true,
        timeout_secs: 60,
    };

    // Push test image to local registry first
    // ... (setup code)

    let result = adapter.deploy(spec).await.unwrap();
    assert!(result.success);
    assert!(result.container_id.is_some());

    // Test stop
    adapter.stop("svc_test", 10).await.unwrap();

    // Verify container is stopped
    let status = adapter.status("svc_test").await;
    assert!(status.is_err() || matches!(status.unwrap().status, ContainerStatus::Stopped));
}
```

### 4.3 Benchmarks

```rust
// benches/buffer_bench.rs
use criterion::{black_box, criterion_group, criterion_main, Criterion};
use syntra_agent::telemetry::buffer::RingBuffer;

fn benchmark_buffer_write(c: &mut Criterion) {
    let mut buffer = RingBuffer::new(50 * 1024 * 1024); // 50MB

    c.bench_function("buffer_write_1kb", |b| {
        let data = vec![0u8; 1024];
        b.iter(|| {
            buffer.write(black_box(&data));
        })
    });

    c.bench_function("buffer_write_10kb", |b| {
        let data = vec![0u8; 10240];
        b.iter(|| {
            buffer.write(black_box(&data));
        })
    });
}

criterion_group!(benches, benchmark_buffer_write);
criterion_main!(benches);
```

---

## 5. Build & Release

### 5.1 Build Script

```bash
#!/bin/bash
# scripts/build-release.sh

set -e

VERSION=${1:-$(cargo metadata --format-version 1 | jq -r '.packages[] | select(.name == "syntra-agent") | .version')}

echo "Building syntra-agent v${VERSION}"

# Build for multiple targets
TARGETS=(
    "x86_64-unknown-linux-musl"
    "aarch64-unknown-linux-musl"
)

for TARGET in "${TARGETS[@]}"; do
    echo "Building for ${TARGET}..."

    cross build --release --target "${TARGET}"

    # Strip and compress
    BINARY="target/${TARGET}/release/syntra-agent"
    strip "${BINARY}"

    # Create archive
    ARCHIVE="syntra-agent-${VERSION}-${TARGET}.tar.gz"
    tar -czvf "${ARCHIVE}" -C "target/${TARGET}/release" syntra-agent

    # Generate checksum
    sha256sum "${ARCHIVE}" > "${ARCHIVE}.sha256"

    echo "Built: ${ARCHIVE} ($(du -h ${ARCHIVE} | cut -f1))"
done

echo "Build complete!"
```

### 5.2 Install Script

```bash
#!/bin/bash
# scripts/install.sh
# Usage: curl -fsSL https://get.syntra.dev | sh -s -- --token=xxx --endpoint=wss://...

set -e

SYNTRA_VERSION="${SYNTRA_VERSION:-latest}"
SYNTRA_TOKEN=""
SYNTRA_ENDPOINT="wss://api.syntra.dev/agent/ws"
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="/etc/syntra"
DATA_DIR="/var/lib/syntra"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --token=*)
            SYNTRA_TOKEN="${1#*=}"
            shift
            ;;
        --endpoint=*)
            SYNTRA_ENDPOINT="${1#*=}"
            shift
            ;;
        --version=*)
            SYNTRA_VERSION="${1#*=}"
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

if [ -z "$SYNTRA_TOKEN" ]; then
    echo "Error: --token is required"
    exit 1
fi

# Detect architecture
ARCH=$(uname -m)
case $ARCH in
    x86_64)
        TARGET="x86_64-unknown-linux-musl"
        ;;
    aarch64|arm64)
        TARGET="aarch64-unknown-linux-musl"
        ;;
    *)
        echo "Unsupported architecture: $ARCH"
        exit 1
        ;;
esac

echo "Installing Syntra Agent..."

# Download binary
if [ "$SYNTRA_VERSION" = "latest" ]; then
    DOWNLOAD_URL="https://releases.syntra.dev/agent/latest/syntra-agent-${TARGET}.tar.gz"
else
    DOWNLOAD_URL="https://releases.syntra.dev/agent/${SYNTRA_VERSION}/syntra-agent-${TARGET}.tar.gz"
fi

echo "Downloading from ${DOWNLOAD_URL}..."
curl -fsSL "${DOWNLOAD_URL}" | tar -xzf - -C /tmp
mv /tmp/syntra-agent "${INSTALL_DIR}/syntra-agent"
chmod +x "${INSTALL_DIR}/syntra-agent"

# Create directories
mkdir -p "${CONFIG_DIR}/certs"
mkdir -p "${DATA_DIR}"

# Generate agent ID
AGENT_ID="agt_$(openssl rand -hex 8)"

# Extract server ID from token (or generate)
SERVER_ID="srv_$(openssl rand -hex 8)"

# Create config
cat > "${CONFIG_DIR}/agent.toml" <<EOF
agent_id = "${AGENT_ID}"
server_id = "${SERVER_ID}"

[control_plane]
endpoint = "${SYNTRA_ENDPOINT}"
token = "${SYNTRA_TOKEN}"
heartbeat_interval_secs = 30
reconnect_max_delay_secs = 60

[runtime]
runtime_type = "auto"

[telemetry]
otlp_grpc_port = 4317
otlp_http_port = 4318
buffer_max_mb = 50
batch_interval_secs = 5
batch_max_items = 1000
sampling_rate = 0.1

[logging]
level = "info"
format = "json"
EOF

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

# Install Traefik
if ! docker ps | grep -q traefik; then
    echo "Installing Traefik..."
    docker network create traefik-public 2>/dev/null || true
    docker run -d \
        --name traefik \
        --restart always \
        --network traefik-public \
        -p 80:80 \
        -p 443:443 \
        -v /var/run/docker.sock:/var/run/docker.sock:ro \
        -v "${DATA_DIR}/traefik:/etc/traefik" \
        traefik:v3.0 \
        --api.insecure=true \
        --providers.docker=true \
        --providers.docker.exposedbydefault=false \
        --entrypoints.web.address=:80 \
        --entrypoints.websecure.address=:443 \
        --certificatesresolvers.letsencrypt.acme.email=ssl@syntra.dev \
        --certificatesresolvers.letsencrypt.acme.storage=/etc/traefik/acme.json \
        --certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web
fi

# Create systemd service
cat > /etc/systemd/system/syntra-agent.service <<EOF
[Unit]
Description=Syntra Agent
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
ExecStart=${INSTALL_DIR}/syntra-agent start --config ${CONFIG_DIR}/agent.toml
Restart=always
RestartSec=5
WatchdogSec=60
OOMScoreAdjust=-500
Environment=RUST_LOG=info

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
systemctl daemon-reload
systemctl enable syntra-agent
systemctl start syntra-agent

echo ""
echo "Syntra Agent installed successfully!"
echo "Agent ID: ${AGENT_ID}"
echo "Server ID: ${SERVER_ID}"
echo ""
echo "Check status: systemctl status syntra-agent"
echo "View logs: journalctl -u syntra-agent -f"
```

---

## 6. Deliverables Checklist

### Phase 1 (Week 1-8)

- [ ] Project structure and dependencies
- [ ] CLI with clap (start, status, install, uninstall)
- [ ] Configuration loading (TOML)
- [ ] WebSocket client with reconnection
- [ ] Agent hello/heartbeat protocol
- [ ] Docker adapter: deploy, stop, restart
- [ ] Docker adapter: logs streaming
- [ ] Docker adapter: exec
- [ ] Docker adapter: status, metrics
- [ ] Traefik configuration generation
- [ ] Health check executor
- [ ] systemd service installation
- [ ] Install script (one-liner)
- [ ] mTLS certificate handling
- [ ] Integration tests
- [ ] Release binaries (amd64 + arm64)

### Phase 2 (Week 9-14)

- [ ] OTLP gRPC receiver (tonic)
- [ ] OTLP HTTP receiver (axum)
- [ ] Telemetry ring buffer
- [ ] Batch + compress (zstd)
- [ ] System metrics collector (/proc)
- [ ] Container metrics collector
- [ ] Prometheus endpoint scraper
- [ ] Adaptive sampling
- [ ] Auto-update mechanism

### Phase 4 (Week 21-26)

- [ ] Kubernetes adapter (kube-rs)
- [ ] K8s deployment management
- [ ] K8s service/ingress
- [ ] Runtime auto-detection

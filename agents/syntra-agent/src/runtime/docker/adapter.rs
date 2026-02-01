//! Docker Adapter
//!
//! Implementation of RuntimeAdapter for Docker using the bollard library.

use anyhow::{Context, Result};
use async_trait::async_trait;
use bollard::container::{
    Config, CreateContainerOptions as BollardCreateOptions, ListContainersOptions,
    LogsOptions as BollardLogsOptions, RemoveContainerOptions, StartContainerOptions,
    StopContainerOptions, StatsOptions,
};
use bollard::exec::{CreateExecOptions, StartExecResults};
use bollard::image::{CreateImageOptions, ListImagesOptions, RemoveImageOptions};
use bollard::network::CreateNetworkOptions;
use bollard::Docker;
use futures_util::StreamExt;
use std::collections::HashMap;
use tracing::{debug, info};

use crate::runtime::adapter::{
    ContainerInfo, ContainerStats, ContainerStatus, CreateContainerOptions, ImageInfo,
    LogsOptions, PortBinding, RuntimeAdapter,
};

/// Docker runtime adapter
pub struct DockerAdapter {
    client: Docker,
    socket_path: String,
}

impl DockerAdapter {
    /// Create a new Docker adapter connecting to the default socket
    pub fn new() -> Result<Self> {
        let client = Docker::connect_with_socket_defaults()
            .context("Failed to connect to Docker socket")?;

        Ok(Self {
            client,
            socket_path: "/var/run/docker.sock".to_string(),
        })
    }

    /// Create a new Docker adapter with a custom socket path
    pub fn with_socket(socket_path: &str) -> Result<Self> {
        let client = Docker::connect_with_socket(socket_path, 120, bollard::API_DEFAULT_VERSION)
            .context("Failed to connect to Docker socket")?;

        Ok(Self {
            client,
            socket_path: socket_path.to_string(),
        })
    }

    /// Get the Docker client reference
    pub fn client(&self) -> &Docker {
        &self.client
    }

    /// Convert bollard container state to our ContainerStatus
    fn parse_status(state: Option<&str>) -> ContainerStatus {
        match state {
            Some("created") => ContainerStatus::Created,
            Some("running") => ContainerStatus::Running,
            Some("paused") => ContainerStatus::Paused,
            Some("restarting") => ContainerStatus::Restarting,
            Some("exited") => ContainerStatus::Exited,
            Some("dead") => ContainerStatus::Dead,
            _ => ContainerStatus::Unknown,
        }
    }
}

#[async_trait]
impl RuntimeAdapter for DockerAdapter {
    fn runtime_type(&self) -> &str {
        "docker"
    }

    async fn health_check(&self) -> Result<bool> {
        match self.client.ping().await {
            Ok(_) => Ok(true),
            Err(e) => {
                debug!(error = %e, "Docker health check failed");
                Ok(false)
            }
        }
    }

    async fn version(&self) -> Result<String> {
        let version = self.client.version().await?;
        Ok(format!(
            "Docker {} (API {})",
            version.version.unwrap_or_default(),
            version.api_version.unwrap_or_default()
        ))
    }

    async fn list_containers(&self, all: bool) -> Result<Vec<ContainerInfo>> {
        let options = ListContainersOptions::<String> {
            all,
            ..Default::default()
        };

        let containers = self.client.list_containers(Some(options)).await?;

        let mut result = Vec::new();
        for container in containers {
            let ports = container
                .ports
                .unwrap_or_default()
                .iter()
                .map(|p| PortBinding {
                    container_port: p.private_port,
                    host_port: p.public_port,
                    host_ip: p.ip.clone(),
                    protocol: p.typ.as_ref().map(|t| t.to_string()).unwrap_or_else(|| "tcp".to_string()),
                })
                .collect();

            result.push(ContainerInfo {
                id: container.id.unwrap_or_default(),
                name: container
                    .names
                    .and_then(|n| n.first().cloned())
                    .unwrap_or_default()
                    .trim_start_matches('/')
                    .to_string(),
                image: container.image.unwrap_or_default(),
                status: Self::parse_status(container.state.as_deref()),
                created_at: container.created.map(|c| c.to_string()).unwrap_or_default(),
                ports,
                labels: container.labels.unwrap_or_default(),
            });
        }

        Ok(result)
    }

    async fn get_container(&self, id_or_name: &str) -> Result<Option<ContainerInfo>> {
        match self.client.inspect_container(id_or_name, None).await {
            Ok(container) => {
                let state = container.state.as_ref();
                let config = container.config.as_ref();

                let ports = container
                    .network_settings
                    .as_ref()
                    .and_then(|ns| ns.ports.as_ref())
                    .map(|ports| {
                        ports
                            .iter()
                            .filter_map(|(key, bindings)| {
                                let parts: Vec<&str> = key.split('/').collect();
                                let container_port = parts.first()?.parse().ok()?;
                                let protocol = parts.get(1).unwrap_or(&"tcp").to_string();

                                let (host_port, host_ip) = bindings
                                    .as_ref()
                                    .and_then(|b| b.first())
                                    .map(|b| {
                                        (
                                            b.host_port.as_ref().and_then(|p| p.parse().ok()),
                                            b.host_ip.clone(),
                                        )
                                    })
                                    .unwrap_or((None, None));

                                Some(PortBinding {
                                    container_port,
                                    host_port,
                                    host_ip,
                                    protocol,
                                })
                            })
                            .collect()
                    })
                    .unwrap_or_default();

                Ok(Some(ContainerInfo {
                    id: container.id.unwrap_or_default(),
                    name: container
                        .name
                        .unwrap_or_default()
                        .trim_start_matches('/')
                        .to_string(),
                    image: config
                        .and_then(|c| c.image.clone())
                        .unwrap_or_default(),
                    status: Self::parse_status(
                        state
                            .and_then(|s| s.status.as_ref())
                            .map(|s| match s {
                                bollard::service::ContainerStateStatusEnum::CREATED => "created",
                                bollard::service::ContainerStateStatusEnum::RUNNING => "running",
                                bollard::service::ContainerStateStatusEnum::PAUSED => "paused",
                                bollard::service::ContainerStateStatusEnum::RESTARTING => "restarting",
                                bollard::service::ContainerStateStatusEnum::REMOVING => "removing",
                                bollard::service::ContainerStateStatusEnum::EXITED => "exited",
                                bollard::service::ContainerStateStatusEnum::DEAD => "dead",
                                _ => "unknown",
                            })
                    ),
                    created_at: container.created.unwrap_or_default(),
                    ports,
                    labels: config
                        .and_then(|c| c.labels.clone())
                        .unwrap_or_default(),
                }))
            }
            Err(bollard::errors::Error::DockerResponseServerError {
                status_code: 404, ..
            }) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    async fn create_container(&self, options: CreateContainerOptions) -> Result<String> {
        let env: Vec<String> = options
            .env
            .iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect();

        let exposed_ports: HashMap<String, HashMap<(), ()>> = options
            .ports
            .iter()
            .map(|p| (format!("{}/{}", p.container_port, p.protocol), HashMap::new()))
            .collect();

        let port_bindings: HashMap<String, Option<Vec<bollard::service::PortBinding>>> = options
            .ports
            .iter()
            .map(|p| {
                (
                    format!("{}/{}", p.container_port, p.protocol),
                    Some(vec![bollard::service::PortBinding {
                        host_ip: p.host_ip.clone(),
                        host_port: p.host_port.map(|port| port.to_string()),
                    }]),
                )
            })
            .collect();

        let binds: Vec<String> = options
            .volumes
            .iter()
            .map(|v| {
                if v.read_only {
                    format!("{}:{}:ro", v.source, v.target)
                } else {
                    format!("{}:{}", v.source, v.target)
                }
            })
            .collect();

        let host_config = bollard::service::HostConfig {
            binds: Some(binds),
            port_bindings: Some(port_bindings),
            network_mode: options.network,
            memory: options.memory_limit.map(|m| m as i64 * 1024 * 1024),
            nano_cpus: options.cpu_limit.map(|c| (c * 1_000_000_000.0) as i64),
            restart_policy: options.restart_policy.map(|p| {
                bollard::service::RestartPolicy {
                    name: Some(match p {
                        crate::runtime::adapter::RestartPolicy::No => {
                            bollard::service::RestartPolicyNameEnum::NO
                        }
                        crate::runtime::adapter::RestartPolicy::Always => {
                            bollard::service::RestartPolicyNameEnum::ALWAYS
                        }
                        crate::runtime::adapter::RestartPolicy::OnFailure => {
                            bollard::service::RestartPolicyNameEnum::ON_FAILURE
                        }
                        crate::runtime::adapter::RestartPolicy::UnlessStopped => {
                            bollard::service::RestartPolicyNameEnum::UNLESS_STOPPED
                        }
                    }),
                    maximum_retry_count: None,
                }
            }),
            ..Default::default()
        };

        let config = Config {
            image: Some(options.image),
            cmd: options.command,
            env: Some(env),
            labels: Some(options.labels),
            exposed_ports: Some(exposed_ports),
            host_config: Some(host_config),
            ..Default::default()
        };

        let create_options = BollardCreateOptions {
            name: &options.name,
            platform: None,
        };

        let response = self.client.create_container(Some(create_options), config).await?;
        info!(container_id = %response.id, name = %options.name, "Container created");

        Ok(response.id)
    }

    async fn start_container(&self, id: &str) -> Result<()> {
        self.client
            .start_container(id, None::<StartContainerOptions<String>>)
            .await?;
        info!(container_id = %id, "Container started");
        Ok(())
    }

    async fn stop_container(&self, id: &str, timeout_secs: Option<u64>) -> Result<()> {
        let options = StopContainerOptions {
            t: timeout_secs.map(|t| t as i64).unwrap_or(10),
        };
        self.client.stop_container(id, Some(options)).await?;
        info!(container_id = %id, "Container stopped");
        Ok(())
    }

    async fn remove_container(&self, id: &str, force: bool) -> Result<()> {
        let options = RemoveContainerOptions {
            force,
            ..Default::default()
        };
        self.client.remove_container(id, Some(options)).await?;
        info!(container_id = %id, "Container removed");
        Ok(())
    }

    async fn logs(&self, id: &str, options: LogsOptions) -> Result<Vec<String>> {
        let bollard_options = BollardLogsOptions::<String> {
            stdout: options.stdout,
            stderr: options.stderr,
            follow: options.follow,
            tail: options.tail.map(|t| t.to_string()).unwrap_or_else(|| "all".to_string()),
            since: options.since.map(|s| s.parse().unwrap_or(0)).unwrap_or(0),
            until: options.until.map(|s| s.parse().unwrap_or(0)).unwrap_or(0),
            ..Default::default()
        };

        let mut logs_stream = self.client.logs(id, Some(bollard_options));
        let mut logs = Vec::new();

        while let Some(log) = logs_stream.next().await {
            match log {
                Ok(output) => {
                    logs.push(output.to_string());
                }
                Err(e) => {
                    debug!(error = %e, "Error reading log");
                    break;
                }
            }
        }

        Ok(logs)
    }

    async fn stats(&self, id: &str) -> Result<ContainerStats> {
        let options = StatsOptions {
            stream: false,
            one_shot: true,
        };

        let mut stats_stream = self.client.stats(id, Some(options));

        if let Some(stats) = stats_stream.next().await {
            let stats = stats?;

            let cpu_delta = stats.cpu_stats.cpu_usage.total_usage as f64
                - stats.precpu_stats.cpu_usage.total_usage as f64;
            let system_delta = stats.cpu_stats.system_cpu_usage.unwrap_or(0) as f64
                - stats.precpu_stats.system_cpu_usage.unwrap_or(0) as f64;
            let cpu_percent = if system_delta > 0.0 {
                (cpu_delta / system_delta) * stats.cpu_stats.online_cpus.unwrap_or(1) as f64 * 100.0
            } else {
                0.0
            };

            let memory_usage = stats.memory_stats.usage.unwrap_or(0);
            let memory_limit = stats.memory_stats.limit.unwrap_or(0);

            let (rx_bytes, tx_bytes) = stats
                .networks
                .map(|nets| {
                    nets.values().fold((0u64, 0u64), |(rx, tx), net| {
                        (rx + net.rx_bytes, tx + net.tx_bytes)
                    })
                })
                .unwrap_or((0, 0));

            let (read_bytes, write_bytes) = stats
                .blkio_stats
                .io_service_bytes_recursive
                .map(|ios| {
                    ios.iter().fold((0u64, 0u64), |(r, w), io| {
                        match io.op.as_str() {
                            "read" | "Read" => (r + io.value, w),
                            "write" | "Write" => (r, w + io.value),
                            _ => (r, w),
                        }
                    })
                })
                .unwrap_or((0, 0));

            return Ok(ContainerStats {
                cpu_usage_percent: cpu_percent,
                memory_usage_bytes: memory_usage,
                memory_limit_bytes: memory_limit,
                network_rx_bytes: rx_bytes,
                network_tx_bytes: tx_bytes,
                block_read_bytes: read_bytes,
                block_write_bytes: write_bytes,
            });
        }

        Err(anyhow::anyhow!("No stats available for container"))
    }

    async fn pull_image(&self, image: &str) -> Result<()> {
        let options = CreateImageOptions {
            from_image: image,
            ..Default::default()
        };

        let mut stream = self.client.create_image(Some(options), None, None);

        while let Some(result) = stream.next().await {
            match result {
                Ok(info) => {
                    if let Some(status) = info.status {
                        debug!(status = %status, "Pulling image");
                    }
                }
                Err(e) => {
                    return Err(e.into());
                }
            }
        }

        info!(image = %image, "Image pulled");
        Ok(())
    }

    async fn list_images(&self) -> Result<Vec<ImageInfo>> {
        let options = ListImagesOptions::<String> {
            all: false,
            ..Default::default()
        };

        let images = self.client.list_images(Some(options)).await?;

        Ok(images
            .into_iter()
            .map(|img| ImageInfo {
                id: img.id,
                repo_tags: img.repo_tags,
                size: img.size as u64,
                created_at: img.created.to_string(),
            })
            .collect())
    }

    async fn remove_image(&self, id: &str, force: bool) -> Result<()> {
        let options = RemoveImageOptions {
            force,
            ..Default::default()
        };
        self.client.remove_image(id, Some(options), None).await?;
        info!(image_id = %id, "Image removed");
        Ok(())
    }

    async fn create_network(&self, name: &str) -> Result<String> {
        let options = CreateNetworkOptions {
            name: name.to_string(),
            driver: "bridge".to_string(),
            ..Default::default()
        };

        let response = self.client.create_network(options).await?;
        let id = response.id.unwrap_or_default();
        info!(network_id = %id, name = %name, "Network created");
        Ok(id)
    }

    async fn remove_network(&self, name: &str) -> Result<()> {
        self.client.remove_network(name).await?;
        info!(network = %name, "Network removed");
        Ok(())
    }

    async fn exec(&self, id: &str, cmd: Vec<String>) -> Result<(i64, String)> {
        let exec_options = CreateExecOptions {
            cmd: Some(cmd),
            attach_stdout: Some(true),
            attach_stderr: Some(true),
            ..Default::default()
        };

        let exec = self.client.create_exec(id, exec_options).await?;

        let start_result = self.client.start_exec(&exec.id, None).await?;

        let mut output = String::new();

        if let StartExecResults::Attached { output: mut stream, .. } = start_result {
            while let Some(chunk) = stream.next().await {
                match chunk {
                    Ok(bollard::container::LogOutput::StdOut { message }) => {
                        output.push_str(&String::from_utf8_lossy(&message));
                    }
                    Ok(bollard::container::LogOutput::StdErr { message }) => {
                        output.push_str(&String::from_utf8_lossy(&message));
                    }
                    _ => {}
                }
            }
        }

        // Get exit code
        let inspect = self.client.inspect_exec(&exec.id).await?;
        let exit_code = inspect.exit_code.unwrap_or(-1);

        Ok((exit_code, output))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_status() {
        assert_eq!(DockerAdapter::parse_status(Some("running")), ContainerStatus::Running);
        assert_eq!(DockerAdapter::parse_status(Some("exited")), ContainerStatus::Exited);
        assert_eq!(DockerAdapter::parse_status(None), ContainerStatus::Unknown);
    }
}

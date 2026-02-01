//! Deploy Handler
//!
//! Handles container deployment commands from the control plane.

use anyhow::{Context, Result};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};

use crate::connection::protocol::{
    AgentMessage, ContainerStatusPayload, DeployContainerPayload, ErrorPayload,
    PortMapping, StopContainerPayload, TaskResultPayload,
};
use crate::runtime::adapter::{
    ContainerStatus, CreateContainerOptions, PortBinding, RestartPolicy, RuntimeAdapter,
    VolumeBinding,
};

/// Deploy handler for processing container deployments
pub struct DeployHandler<R: RuntimeAdapter> {
    runtime: Arc<R>,
    message_tx: mpsc::Sender<AgentMessage>,
}

impl<R: RuntimeAdapter> DeployHandler<R> {
    /// Create a new deploy handler
    pub fn new(runtime: Arc<R>, message_tx: mpsc::Sender<AgentMessage>) -> Self {
        Self { runtime, message_tx }
    }

    /// Deploy a container based on the payload from control plane
    pub async fn deploy(&self, payload: DeployContainerPayload) -> Result<String> {
        let request_id = payload.request_id.clone();
        let container_name = payload.name.clone();
        let image = payload.image.clone();

        info!(
            request_id = %request_id,
            image = %image,
            name = %container_name,
            "Starting container deployment"
        );

        // Send deployment started status
        self.send_status(&container_name, "deploying", None).await;

        // Step 1: Pull the image
        info!(request_id = %request_id, image = %image, "Pulling image");
        if let Err(e) = self.runtime.pull_image(&image).await {
            error!(request_id = %request_id, error = %e, "Failed to pull image");
            self.send_error(&request_id, "PULL_FAILED", &format!("Failed to pull image: {}", e))
                .await;
            return Err(e);
        }
        debug!(request_id = %request_id, "Image pulled successfully");

        // Step 2: Check if container with same name exists and remove it
        if let Some(existing) = self
            .runtime
            .get_container(&container_name)
            .await
            .context("Failed to check existing container")?
        {
            info!(
                request_id = %request_id,
                container_id = %existing.id,
                "Removing existing container"
            );

            // Stop if running
            if existing.status == ContainerStatus::Running {
                if let Err(e) = self.runtime.stop_container(&existing.id, Some(30)).await {
                    warn!(
                        request_id = %request_id,
                        error = %e,
                        "Failed to stop existing container, forcing removal"
                    );
                }
            }

            // Remove container
            if let Err(e) = self.runtime.remove_container(&existing.id, true).await {
                error!(request_id = %request_id, error = %e, "Failed to remove existing container");
                self.send_error(
                    &request_id,
                    "REMOVE_FAILED",
                    &format!("Failed to remove existing container: {}", e),
                )
                .await;
                return Err(e);
            }
        }

        // Step 3: Prepare container options
        let env_vars: Vec<(String, String)> = payload
            .env
            .unwrap_or_default()
            .into_iter()
            .map(|e| (e.name, e.value))
            .collect();

        let ports: Vec<PortBinding> = payload
            .ports
            .unwrap_or_default()
            .into_iter()
            .map(|p| PortBinding {
                container_port: p.container_port,
                host_port: Some(p.host_port),
                host_ip: Some("0.0.0.0".to_string()),
                protocol: p.protocol,
            })
            .collect();

        let volumes: Vec<VolumeBinding> = payload
            .volumes
            .unwrap_or_default()
            .into_iter()
            .map(|v| VolumeBinding {
                source: v.host_path,
                target: v.container_path,
                read_only: v.read_only,
            })
            .collect();

        let mut labels = HashMap::new();
        labels.insert("syntra.managed".to_string(), "true".to_string());
        labels.insert("syntra.request_id".to_string(), request_id.clone());

        let options = CreateContainerOptions {
            name: container_name.clone(),
            image: image.clone(),
            command: None,
            env: env_vars,
            ports,
            volumes,
            labels,
            network: None,
            memory_limit: payload.resources.as_ref().and_then(|r| r.memory_mb),
            cpu_limit: payload.resources.as_ref().and_then(|r| r.cpu_cores),
            restart_policy: Some(RestartPolicy::UnlessStopped),
        };

        // Step 4: Create the container
        info!(request_id = %request_id, "Creating container");
        let container_id = match self.runtime.create_container(options).await {
            Ok(id) => id,
            Err(e) => {
                error!(request_id = %request_id, error = %e, "Failed to create container");
                self.send_error(
                    &request_id,
                    "CREATE_FAILED",
                    &format!("Failed to create container: {}", e),
                )
                .await;
                return Err(e);
            }
        };
        debug!(request_id = %request_id, container_id = %container_id, "Container created");

        // Step 5: Start the container
        info!(request_id = %request_id, container_id = %container_id, "Starting container");
        if let Err(e) = self.runtime.start_container(&container_id).await {
            error!(request_id = %request_id, error = %e, "Failed to start container");
            // Clean up the created container
            let _ = self.runtime.remove_container(&container_id, true).await;
            self.send_error(
                &request_id,
                "START_FAILED",
                &format!("Failed to start container: {}", e),
            )
            .await;
            return Err(e);
        }

        // Step 6: Verify container is running
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

        let container = self
            .runtime
            .get_container(&container_id)
            .await
            .context("Failed to get container status")?
            .ok_or_else(|| anyhow::anyhow!("Container not found after start"))?;

        if container.status != ContainerStatus::Running {
            error!(
                request_id = %request_id,
                status = %container.status,
                "Container is not running after start"
            );
            self.send_error(
                &request_id,
                "NOT_RUNNING",
                &format!("Container status is {} after start", container.status),
            )
            .await;
            return Err(anyhow::anyhow!(
                "Container is not running: {}",
                container.status
            ));
        }

        // Send success status
        let port_mappings: Vec<PortMapping> = container
            .ports
            .iter()
            .filter_map(|p| {
                p.host_port.map(|hp| PortMapping {
                    container_port: p.container_port,
                    host_port: hp,
                    protocol: p.protocol.clone(),
                })
            })
            .collect();

        self.send_container_status(&container_id, &container_name, "running", port_mappings)
            .await;

        // Send task result
        self.send_task_result(&request_id, true, Some(container_id.clone()), None)
            .await;

        info!(
            request_id = %request_id,
            container_id = %container_id,
            "Container deployed successfully"
        );

        Ok(container_id)
    }

    /// Stop a container based on the payload from control plane
    pub async fn stop(&self, payload: StopContainerPayload) -> Result<()> {
        let request_id = payload.request_id.clone();
        let container_id = payload.container_id.clone();

        info!(
            request_id = %request_id,
            container_id = %container_id,
            force = payload.force,
            "Stopping container"
        );

        // Get container info first
        let container = self
            .runtime
            .get_container(&container_id)
            .await
            .context("Failed to get container")?;

        if container.is_none() {
            warn!(request_id = %request_id, "Container not found");
            self.send_error(&request_id, "NOT_FOUND", "Container not found")
                .await;
            return Err(anyhow::anyhow!("Container not found"));
        }

        let container = container.unwrap();

        // Stop the container
        if container.status == ContainerStatus::Running {
            if let Err(e) = self
                .runtime
                .stop_container(&container_id, payload.timeout_secs)
                .await
            {
                if payload.force {
                    warn!(
                        request_id = %request_id,
                        error = %e,
                        "Failed to stop gracefully, forcing"
                    );
                } else {
                    error!(request_id = %request_id, error = %e, "Failed to stop container");
                    self.send_error(
                        &request_id,
                        "STOP_FAILED",
                        &format!("Failed to stop container: {}", e),
                    )
                    .await;
                    return Err(e);
                }
            }
        }

        // Remove container if force is true
        if payload.force {
            if let Err(e) = self.runtime.remove_container(&container_id, true).await {
                error!(request_id = %request_id, error = %e, "Failed to remove container");
                self.send_error(
                    &request_id,
                    "REMOVE_FAILED",
                    &format!("Failed to remove container: {}", e),
                )
                .await;
                return Err(e);
            }
        }

        // Send status update
        self.send_status(&container.name, "stopped", None).await;
        self.send_task_result(&request_id, true, None, None).await;

        info!(
            request_id = %request_id,
            container_id = %container_id,
            "Container stopped successfully"
        );

        Ok(())
    }

    /// Send a status update message
    async fn send_status(&self, name: &str, status: &str, health: Option<String>) {
        let msg = AgentMessage::ContainerStatus(ContainerStatusPayload {
            container_id: String::new(),
            name: name.to_string(),
            status: status.to_string(),
            health,
            ports: vec![],
            timestamp: chrono::Utc::now(),
        });

        if let Err(e) = self.message_tx.send(msg).await {
            warn!(error = %e, "Failed to send status update");
        }
    }

    /// Send a container status update with full details
    async fn send_container_status(
        &self,
        container_id: &str,
        name: &str,
        status: &str,
        ports: Vec<PortMapping>,
    ) {
        let msg = AgentMessage::ContainerStatus(ContainerStatusPayload {
            container_id: container_id.to_string(),
            name: name.to_string(),
            status: status.to_string(),
            health: None,
            ports,
            timestamp: chrono::Utc::now(),
        });

        if let Err(e) = self.message_tx.send(msg).await {
            warn!(error = %e, "Failed to send container status");
        }
    }

    /// Send an error message
    async fn send_error(&self, request_id: &str, code: &str, message: &str) {
        let msg = AgentMessage::Error(ErrorPayload {
            code: code.to_string(),
            message: message.to_string(),
            details: Some(serde_json::json!({ "request_id": request_id })),
            timestamp: chrono::Utc::now(),
        });

        if let Err(e) = self.message_tx.send(msg).await {
            warn!(error = %e, "Failed to send error message");
        }
    }

    /// Send a task result message
    async fn send_task_result(
        &self,
        task_id: &str,
        success: bool,
        output: Option<String>,
        error: Option<String>,
    ) {
        let msg = AgentMessage::TaskResult(TaskResultPayload {
            task_id: task_id.to_string(),
            agent_id: String::new(), // Will be filled by WebSocket client
            success,
            output,
            error,
            duration_ms: 0,
            timestamp: chrono::Utc::now(),
        });

        if let Err(e) = self.message_tx.send(msg).await {
            warn!(error = %e, "Failed to send task result");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Tests would go here with a mock RuntimeAdapter
}

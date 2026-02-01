//! WebSocket Client
//!
//! Provides WebSocket connection to the control plane with auto-reconnect functionality.

use anyhow::{Context, Result};
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::{interval, timeout};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tracing::{debug, error, info, warn};

use crate::agent::deploy::DeployHandler;
use crate::agent::state::{AgentState, AgentStateManager};
use crate::connection::protocol::{AgentMessage, ControlPlaneMessage};
use crate::runtime::adapter::RuntimeAdapter;

/// WebSocket client for control plane communication
pub struct WebSocketClient<R: RuntimeAdapter + 'static> {
    url: String,
    reconnect_interval_ms: u64,
    heartbeat_interval_secs: u64,
    agent_id: String,
    server_id: String,
    runtime: Arc<R>,
}

impl<R: RuntimeAdapter + 'static> WebSocketClient<R> {
    /// Create a new WebSocket client
    pub fn new(
        url: &str,
        agent_id: &str,
        server_id: &str,
        reconnect_interval_ms: u64,
        runtime: Arc<R>,
    ) -> Self {
        Self {
            url: url.to_string(),
            reconnect_interval_ms,
            heartbeat_interval_secs: 30,
            agent_id: agent_id.to_string(),
            server_id: server_id.to_string(),
            runtime,
        }
    }

    /// Set the heartbeat interval
    pub fn with_heartbeat_interval(mut self, secs: u64) -> Self {
        self.heartbeat_interval_secs = secs;
        self
    }

    /// Run the WebSocket client with auto-reconnect
    pub async fn run(&mut self, state_manager: &AgentStateManager) -> Result<()> {
        loop {
            match self.connect_and_run(state_manager).await {
                Ok(()) => {
                    info!("WebSocket connection closed gracefully");
                    if state_manager.current_state() == AgentState::ShuttingDown {
                        break;
                    }
                }
                Err(e) => {
                    error!(error = %e, "WebSocket connection error");
                }
            }

            // Check if we should stop
            if state_manager.current_state() == AgentState::ShuttingDown {
                break;
            }

            // Set reconnecting state
            state_manager.set_reconnecting();

            // Wait before reconnecting
            info!(
                interval_ms = self.reconnect_interval_ms,
                "Waiting before reconnection attempt"
            );
            tokio::time::sleep(Duration::from_millis(self.reconnect_interval_ms)).await;
        }

        Ok(())
    }

    /// Connect and run the WebSocket communication loop
    async fn connect_and_run(&self, state_manager: &AgentStateManager) -> Result<()> {
        state_manager.set_connecting();

        info!(url = %self.url, "Connecting to control plane");

        // Attempt connection with timeout
        let connect_timeout = Duration::from_secs(30);
        let ws_stream = timeout(connect_timeout, connect_async(&self.url))
            .await
            .context("Connection timeout")?
            .context("Failed to connect to WebSocket")?
            .0;

        info!("WebSocket connection established");
        state_manager.set_connected();

        let (mut write, mut read) = ws_stream.split();

        // Create channel for outgoing messages
        let (message_tx, mut message_rx) = mpsc::channel::<AgentMessage>(100);

        // Create deploy handler
        let deploy_handler = Arc::new(DeployHandler::new(self.runtime.clone(), message_tx.clone()));

        // Send registration message
        let register_msg = AgentMessage::register(&self.agent_id, &self.server_id, self.runtime.runtime_type());
        let register_json = register_msg.to_json()?;
        write.send(Message::Text(register_json.into())).await?;
        debug!("Registration message sent");

        // Create heartbeat interval
        let mut heartbeat_interval = interval(Duration::from_secs(self.heartbeat_interval_secs));
        let mut uptime_secs: u64 = 0;

        // Get initial container count
        let container_count = self
            .runtime
            .list_containers(false)
            .await
            .map(|c| c.len() as u32)
            .unwrap_or(0);

        loop {
            tokio::select! {
                // Handle incoming messages
                msg = read.next() => {
                    match msg {
                        Some(Ok(Message::Text(text))) => {
                            if let Err(e) = self.handle_message(&text, deploy_handler.clone()).await {
                                warn!(error = %e, "Failed to handle message");
                            }
                        }
                        Some(Ok(Message::Ping(data))) => {
                            debug!("Received ping, sending pong");
                            write.send(Message::Pong(data)).await?;
                        }
                        Some(Ok(Message::Pong(_))) => {
                            debug!("Received pong");
                        }
                        Some(Ok(Message::Close(frame))) => {
                            info!(?frame, "Received close frame");
                            state_manager.set_disconnected(Some("Server closed connection".to_string()));
                            break;
                        }
                        Some(Ok(Message::Binary(_))) => {
                            debug!("Received binary message (ignored)");
                        }
                        Some(Ok(Message::Frame(_))) => {
                            // Raw frame, typically not used
                        }
                        Some(Err(e)) => {
                            error!(error = %e, "WebSocket error");
                            state_manager.set_disconnected(Some(format!("WebSocket error: {}", e)));
                            return Err(e.into());
                        }
                        None => {
                            info!("WebSocket stream ended");
                            state_manager.set_disconnected(Some("Stream ended".to_string()));
                            break;
                        }
                    }
                }

                // Handle outgoing messages from deploy handler
                outgoing = message_rx.recv() => {
                    if let Some(msg) = outgoing {
                        let json = msg.to_json()?;
                        debug!("Sending message to control plane");
                        write.send(Message::Text(json.into())).await?;
                    }
                }

                // Send heartbeat
                _ = heartbeat_interval.tick() => {
                    uptime_secs += self.heartbeat_interval_secs;

                    // Get current container count
                    let current_container_count = self
                        .runtime
                        .list_containers(false)
                        .await
                        .map(|c| c.len() as u32)
                        .unwrap_or(container_count);

                    let heartbeat = AgentMessage::heartbeat(
                        &self.agent_id,
                        uptime_secs,
                        current_container_count,
                    );
                    let heartbeat_json = heartbeat.to_json()?;
                    debug!("Sending heartbeat");
                    write.send(Message::Text(heartbeat_json.into())).await?;
                }
            }
        }

        Ok(())
    }

    /// Handle an incoming message from the control plane
    async fn handle_message(
        &self,
        text: &str,
        deploy_handler: Arc<DeployHandler<R>>,
    ) -> Result<()> {
        let message = ControlPlaneMessage::from_json(text)
            .context("Failed to parse control plane message")?;

        match message {
            ControlPlaneMessage::Welcome(payload) => {
                info!(
                    agent_id = %payload.agent_id,
                    session_id = %payload.session_id,
                    "Received welcome from control plane"
                );
            }
            ControlPlaneMessage::HeartbeatAck(payload) => {
                debug!(server_time = %payload.server_time, "Heartbeat acknowledged");
            }
            ControlPlaneMessage::TaskRequest(payload) => {
                info!(
                    task_id = %payload.task_id,
                    task_type = %payload.task_type,
                    "Received task request"
                );
                // TODO: Implement task execution based on task_type
            }
            ControlPlaneMessage::DeployContainer(payload) => {
                info!(
                    request_id = %payload.request_id,
                    image = %payload.image,
                    name = %payload.name,
                    "Received container deployment request"
                );

                // Clone the handler and spawn deployment task
                let handler = deploy_handler.clone();
                tokio::spawn(async move {
                    if let Err(e) = handler.deploy(payload).await {
                        error!(error = %e, "Deployment failed");
                    }
                });
            }
            ControlPlaneMessage::StopContainer(payload) => {
                info!(
                    request_id = %payload.request_id,
                    container_id = %payload.container_id,
                    "Received stop container request"
                );

                // Clone the handler and spawn stop task
                let handler = deploy_handler.clone();
                tokio::spawn(async move {
                    if let Err(e) = handler.stop(payload).await {
                        error!(error = %e, "Stop container failed");
                    }
                });
            }
            ControlPlaneMessage::ConfigUpdate(payload) => {
                info!(
                    config_version = %payload.config_version,
                    "Received configuration update"
                );
                // TODO: Apply config update
            }
            ControlPlaneMessage::StatusRequest(payload) => {
                debug!(request_id = %payload.request_id, "Received status request");
                // TODO: Send status response
            }
            ControlPlaneMessage::Ping(payload) => {
                debug!(timestamp = %payload.timestamp, "Received ping");
                // Pong is handled at the WebSocket protocol level
            }
            ControlPlaneMessage::Error(payload) => {
                error!(
                    code = %payload.code,
                    message = %payload.message,
                    "Received error from control plane"
                );
            }
        }

        Ok(())
    }
}

/// Builder for WebSocketClient
pub struct WebSocketClientBuilder<R: RuntimeAdapter + 'static> {
    url: String,
    agent_id: String,
    server_id: String,
    reconnect_interval_ms: u64,
    heartbeat_interval_secs: u64,
    runtime: Arc<R>,
}

impl<R: RuntimeAdapter + 'static> WebSocketClientBuilder<R> {
    pub fn new(url: &str, agent_id: &str, server_id: &str, runtime: Arc<R>) -> Self {
        Self {
            url: url.to_string(),
            agent_id: agent_id.to_string(),
            server_id: server_id.to_string(),
            reconnect_interval_ms: 5000,
            heartbeat_interval_secs: 30,
            runtime,
        }
    }

    pub fn reconnect_interval_ms(mut self, ms: u64) -> Self {
        self.reconnect_interval_ms = ms;
        self
    }

    pub fn heartbeat_interval_secs(mut self, secs: u64) -> Self {
        self.heartbeat_interval_secs = secs;
        self
    }

    pub fn build(self) -> WebSocketClient<R> {
        WebSocketClient {
            url: self.url,
            agent_id: self.agent_id,
            server_id: self.server_id,
            reconnect_interval_ms: self.reconnect_interval_ms,
            heartbeat_interval_secs: self.heartbeat_interval_secs,
            runtime: self.runtime,
        }
    }
}

#[cfg(test)]
mod tests {
    // Tests would use a mock RuntimeAdapter
}

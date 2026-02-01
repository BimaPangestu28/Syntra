//! Message Protocol
//!
//! Defines the message types exchanged between the agent and control plane.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Messages sent from the agent to the control plane
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum AgentMessage {
    /// Agent registration/handshake
    Register(RegisterPayload),

    /// Heartbeat message
    Heartbeat(HeartbeatPayload),

    /// Task execution result
    TaskResult(TaskResultPayload),

    /// Container status update
    ContainerStatus(ContainerStatusPayload),

    /// Metrics report
    Metrics(MetricsPayload),

    /// Log message
    Log(LogPayload),

    /// Error report
    Error(ErrorPayload),

    /// Acknowledgement of a control plane message
    Ack(AckPayload),
}

/// Messages sent from the control plane to the agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum ControlPlaneMessage {
    /// Welcome message after successful registration
    Welcome(WelcomePayload),

    /// Heartbeat acknowledgement
    HeartbeatAck(HeartbeatAckPayload),

    /// Task execution request
    TaskRequest(TaskRequestPayload),

    /// Container deployment request
    DeployContainer(DeployContainerPayload),

    /// Container stop request
    StopContainer(StopContainerPayload),

    /// Configuration update
    ConfigUpdate(ConfigUpdatePayload),

    /// Request for agent status
    StatusRequest(StatusRequestPayload),

    /// Ping message (keep-alive)
    Ping(PingPayload),

    /// Error from control plane
    Error(ErrorPayload),
}

// Agent Message Payloads

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterPayload {
    pub agent_id: String,
    pub server_id: String,
    pub version: String,
    pub capabilities: Vec<String>,
    pub runtime_type: String,
    pub hostname: String,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeartbeatPayload {
    pub agent_id: String,
    pub timestamp: DateTime<Utc>,
    pub uptime_secs: u64,
    pub container_count: u32,
    pub cpu_usage: f64,
    pub memory_usage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskResultPayload {
    pub task_id: String,
    pub agent_id: String,
    pub success: bool,
    pub output: Option<String>,
    pub error: Option<String>,
    pub duration_ms: u64,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerStatusPayload {
    pub container_id: String,
    pub name: String,
    pub status: String,
    pub health: Option<String>,
    pub ports: Vec<PortMapping>,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortMapping {
    pub container_port: u16,
    pub host_port: u16,
    pub protocol: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsPayload {
    pub agent_id: String,
    pub timestamp: DateTime<Utc>,
    pub metrics: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogPayload {
    pub level: String,
    pub message: String,
    pub context: Option<serde_json::Value>,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorPayload {
    pub code: String,
    pub message: String,
    pub details: Option<serde_json::Value>,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AckPayload {
    pub message_id: String,
    pub timestamp: DateTime<Utc>,
}

// Control Plane Message Payloads

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WelcomePayload {
    pub agent_id: String,
    pub session_id: String,
    pub server_time: DateTime<Utc>,
    pub config_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeartbeatAckPayload {
    pub timestamp: DateTime<Utc>,
    pub server_time: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskRequestPayload {
    pub task_id: String,
    pub task_type: String,
    pub params: serde_json::Value,
    pub timeout_secs: Option<u64>,
    pub priority: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeployContainerPayload {
    pub request_id: String,
    pub image: String,
    pub name: String,
    pub env: Option<Vec<EnvVar>>,
    pub ports: Option<Vec<PortMapping>>,
    pub volumes: Option<Vec<VolumeMount>>,
    pub resources: Option<ResourceSpec>,
    pub health_check: Option<HealthCheck>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvVar {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolumeMount {
    pub host_path: String,
    pub container_path: String,
    pub read_only: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceSpec {
    pub memory_mb: Option<u64>,
    pub cpu_cores: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheck {
    pub cmd: Vec<String>,
    pub interval_secs: u64,
    pub timeout_secs: u64,
    pub retries: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StopContainerPayload {
    pub request_id: String,
    pub container_id: String,
    pub force: bool,
    pub timeout_secs: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigUpdatePayload {
    pub config_version: String,
    pub changes: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusRequestPayload {
    pub request_id: String,
    pub include_containers: bool,
    pub include_metrics: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PingPayload {
    pub timestamp: DateTime<Utc>,
}

impl AgentMessage {
    /// Create a new registration message
    pub fn register(agent_id: &str, server_id: &str, runtime_type: &str) -> Self {
        AgentMessage::Register(RegisterPayload {
            agent_id: agent_id.to_string(),
            server_id: server_id.to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            capabilities: vec![
                "docker".to_string(),
                "metrics".to_string(),
                "logs".to_string(),
            ],
            runtime_type: runtime_type.to_string(),
            hostname: hostname::get()
                .map(|h| h.to_string_lossy().to_string())
                .unwrap_or_else(|_| "unknown".to_string()),
            timestamp: Utc::now(),
        })
    }

    /// Create a heartbeat message
    pub fn heartbeat(agent_id: &str, uptime_secs: u64, container_count: u32) -> Self {
        AgentMessage::Heartbeat(HeartbeatPayload {
            agent_id: agent_id.to_string(),
            timestamp: Utc::now(),
            uptime_secs,
            container_count,
            cpu_usage: 0.0,    // TODO: Implement actual metrics
            memory_usage: 0.0, // TODO: Implement actual metrics
        })
    }

    /// Serialize the message to JSON
    pub fn to_json(&self) -> serde_json::Result<String> {
        serde_json::to_string(self)
    }
}

impl ControlPlaneMessage {
    /// Deserialize a message from JSON
    pub fn from_json(json: &str) -> serde_json::Result<Self> {
        serde_json::from_str(json)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_agent_message_serialization() {
        let msg = AgentMessage::register("agent-123", "server-456", "docker");
        let json = msg.to_json().unwrap();
        assert!(json.contains("Register"));
        assert!(json.contains("agent-123"));
    }

    #[test]
    fn test_control_plane_message_deserialization() {
        let json = r#"{
            "type": "Welcome",
            "payload": {
                "agent_id": "agent-123",
                "session_id": "session-456",
                "server_time": "2024-01-01T00:00:00Z",
                "config_version": "1.0.0"
            }
        }"#;

        let msg = ControlPlaneMessage::from_json(json).unwrap();
        match msg {
            ControlPlaneMessage::Welcome(payload) => {
                assert_eq!(payload.agent_id, "agent-123");
            }
            _ => panic!("Expected Welcome message"),
        }
    }
}

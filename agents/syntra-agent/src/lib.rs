//! Syntra Agent Library
//!
//! This crate provides the core functionality for the Syntra runtime agent,
//! including WebSocket communication, container runtime management, and
//! agent state handling.

pub mod agent;
pub mod cli;
pub mod connection;
pub mod runtime;

// Re-exports for convenience
pub use agent::deploy::DeployHandler;
pub use agent::state::{AgentState, AgentStateManager};
pub use cli::config::Config;
pub use connection::protocol::{AgentMessage, ControlPlaneMessage};
pub use connection::websocket::{WebSocketClient, WebSocketClientBuilder};
pub use runtime::adapter::RuntimeAdapter;
pub use runtime::docker::adapter::DockerAdapter;

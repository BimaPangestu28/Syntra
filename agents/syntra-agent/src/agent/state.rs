//! Agent State Management
//!
//! Provides the agent state machine and state manager for tracking
//! the agent's connection and operational status.

use parking_lot::RwLock;
use std::sync::Arc;
use chrono::{DateTime, Utc};

/// Represents the possible states of the agent
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AgentState {
    /// Agent is disconnected from the control plane
    Disconnected,
    /// Agent is attempting to connect
    Connecting,
    /// Agent is connected and operational
    Connected,
    /// Agent is attempting to reconnect after a disconnection
    Reconnecting,
    /// Agent is shutting down
    ShuttingDown,
}

impl std::fmt::Display for AgentState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AgentState::Disconnected => write!(f, "Disconnected"),
            AgentState::Connecting => write!(f, "Connecting"),
            AgentState::Connected => write!(f, "Connected"),
            AgentState::Reconnecting => write!(f, "Reconnecting"),
            AgentState::ShuttingDown => write!(f, "ShuttingDown"),
        }
    }
}

/// State transition information
#[derive(Debug, Clone)]
pub struct StateTransition {
    pub from: AgentState,
    pub to: AgentState,
    pub timestamp: DateTime<Utc>,
    pub reason: Option<String>,
}

/// Internal state data
struct AgentStateInner {
    current: AgentState,
    last_connected: Option<DateTime<Utc>>,
    connection_attempts: u32,
    transitions: Vec<StateTransition>,
}

/// Thread-safe agent state manager
#[derive(Clone)]
pub struct AgentStateManager {
    inner: Arc<RwLock<AgentStateInner>>,
}

impl AgentStateManager {
    /// Create a new state manager starting in Disconnected state
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(AgentStateInner {
                current: AgentState::Disconnected,
                last_connected: None,
                connection_attempts: 0,
                transitions: Vec::new(),
            })),
        }
    }

    /// Get the current state
    pub fn current_state(&self) -> AgentState {
        self.inner.read().current
    }

    /// Get the last connected timestamp
    pub fn last_connected(&self) -> Option<DateTime<Utc>> {
        self.inner.read().last_connected
    }

    /// Get the number of connection attempts
    pub fn connection_attempts(&self) -> u32 {
        self.inner.read().connection_attempts
    }

    /// Transition to a new state
    pub fn transition_to(&self, new_state: AgentState, reason: Option<String>) -> bool {
        let mut inner = self.inner.write();

        // Validate transition
        if !self.is_valid_transition(inner.current, new_state) {
            return false;
        }

        let transition = StateTransition {
            from: inner.current,
            to: new_state,
            timestamp: Utc::now(),
            reason,
        };

        // Update state
        let old_state = inner.current;
        inner.current = new_state;

        // Update connection tracking
        match new_state {
            AgentState::Connected => {
                inner.last_connected = Some(Utc::now());
                inner.connection_attempts = 0;
            }
            AgentState::Connecting | AgentState::Reconnecting => {
                inner.connection_attempts += 1;
            }
            _ => {}
        }

        // Record transition
        inner.transitions.push(transition);

        // Keep only last 100 transitions
        if inner.transitions.len() > 100 {
            inner.transitions.remove(0);
        }

        tracing::info!(
            from = %old_state,
            to = %new_state,
            attempts = inner.connection_attempts,
            "Agent state transition"
        );

        true
    }

    /// Check if a state transition is valid
    fn is_valid_transition(&self, from: AgentState, to: AgentState) -> bool {
        // Self-transition is always allowed
        if from == to {
            return true;
        }

        matches!(
            (from, to),
            // From Disconnected
            (AgentState::Disconnected, AgentState::Connecting) |
            (AgentState::Disconnected, AgentState::ShuttingDown) |
            // From Connecting
            (AgentState::Connecting, AgentState::Connected) |
            (AgentState::Connecting, AgentState::Disconnected) |
            (AgentState::Connecting, AgentState::Reconnecting) |
            (AgentState::Connecting, AgentState::ShuttingDown) |
            // From Connected
            (AgentState::Connected, AgentState::Disconnected) |
            (AgentState::Connected, AgentState::Reconnecting) |
            (AgentState::Connected, AgentState::ShuttingDown) |
            // From Reconnecting
            (AgentState::Reconnecting, AgentState::Connected) |
            (AgentState::Reconnecting, AgentState::Disconnected) |
            (AgentState::Reconnecting, AgentState::ShuttingDown)
        )
    }

    /// Set state to connecting
    pub fn set_connecting(&self) {
        self.transition_to(AgentState::Connecting, Some("Initiating connection".to_string()));
    }

    /// Set state to connected
    pub fn set_connected(&self) {
        self.transition_to(AgentState::Connected, Some("Connection established".to_string()));
    }

    /// Set state to disconnected
    pub fn set_disconnected(&self, reason: Option<String>) {
        self.transition_to(AgentState::Disconnected, reason);
    }

    /// Set state to reconnecting
    pub fn set_reconnecting(&self) {
        self.transition_to(AgentState::Reconnecting, Some("Connection lost, reconnecting".to_string()));
    }

    /// Set state to shutting down
    pub fn set_shutting_down(&self) {
        self.transition_to(AgentState::ShuttingDown, Some("Shutdown requested".to_string()));
    }

    /// Get recent state transitions
    pub fn recent_transitions(&self, count: usize) -> Vec<StateTransition> {
        let inner = self.inner.read();
        inner.transitions.iter().rev().take(count).cloned().collect()
    }

    /// Check if agent is in a connected state
    pub fn is_connected(&self) -> bool {
        self.current_state() == AgentState::Connected
    }

    /// Check if agent is attempting to connect
    pub fn is_connecting(&self) -> bool {
        matches!(
            self.current_state(),
            AgentState::Connecting | AgentState::Reconnecting
        )
    }
}

impl Default for AgentStateManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_initial_state() {
        let manager = AgentStateManager::new();
        assert_eq!(manager.current_state(), AgentState::Disconnected);
    }

    #[test]
    fn test_valid_transitions() {
        let manager = AgentStateManager::new();

        // Disconnected -> Connecting
        assert!(manager.transition_to(AgentState::Connecting, None));
        assert_eq!(manager.current_state(), AgentState::Connecting);

        // Connecting -> Connected
        assert!(manager.transition_to(AgentState::Connected, None));
        assert_eq!(manager.current_state(), AgentState::Connected);

        // Connected -> Reconnecting
        assert!(manager.transition_to(AgentState::Reconnecting, None));
        assert_eq!(manager.current_state(), AgentState::Reconnecting);
    }

    #[test]
    fn test_connection_attempts() {
        let manager = AgentStateManager::new();

        manager.set_connecting();
        assert_eq!(manager.connection_attempts(), 1);

        manager.transition_to(AgentState::Disconnected, None);
        manager.set_connecting();
        assert_eq!(manager.connection_attempts(), 2);

        manager.set_connected();
        assert_eq!(manager.connection_attempts(), 0);
    }
}

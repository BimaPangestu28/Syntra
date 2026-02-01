//! Docker Runtime Module
//!
//! Provides Docker-specific implementation of the RuntimeAdapter trait.

pub mod adapter;

pub use adapter::DockerAdapter;

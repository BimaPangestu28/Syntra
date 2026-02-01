//! Runtime module
//!
//! This module provides abstraction over different container runtimes
//! (Docker, containerd, Podman, etc.) through a common RuntimeAdapter trait.

pub mod adapter;
pub mod docker;

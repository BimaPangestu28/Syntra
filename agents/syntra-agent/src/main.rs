//! Syntra Agent CLI Entry Point
//!
//! This is the main entry point for the Syntra Agent binary.

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use std::path::PathBuf;
use std::sync::Arc;
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

use syntra_agent::cli::config::Config;
use syntra_agent::agent::state::AgentStateManager;
use syntra_agent::connection::websocket::WebSocketClient;
use syntra_agent::runtime::docker::adapter::DockerAdapter;

#[derive(Parser)]
#[command(name = "syntra-agent")]
#[command(author, version, about = "Syntra Agent - Runtime agent for container orchestration")]
struct Cli {
    /// Path to configuration file
    #[arg(short, long, default_value = "config/dev.toml")]
    config: PathBuf,

    /// Enable verbose logging
    #[arg(short, long)]
    verbose: bool,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the agent
    Start {
        /// Run in foreground (don't daemonize)
        #[arg(short, long)]
        foreground: bool,
    },
    /// Show agent status
    Status,
    /// Install the agent as a system service
    Install {
        /// Service name
        #[arg(short, long, default_value = "syntra-agent")]
        name: String,
    },
    /// Show version information
    Version,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    // Initialize logging
    let log_level = if cli.verbose { Level::DEBUG } else { Level::INFO };
    let subscriber = FmtSubscriber::builder()
        .with_max_level(log_level)
        .with_target(true)
        .with_thread_ids(true)
        .with_file(true)
        .with_line_number(true)
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

    match cli.command {
        Commands::Start { foreground } => {
            start_agent(&cli.config, foreground).await?;
        }
        Commands::Status => {
            show_status().await?;
        }
        Commands::Install { name } => {
            install_service(&name)?;
        }
        Commands::Version => {
            show_version();
        }
    }

    Ok(())
}

async fn start_agent(config_path: &PathBuf, foreground: bool) -> Result<()> {
    info!("Starting Syntra Agent...");

    // Load configuration
    let config = Config::load(config_path)?;
    info!(agent_id = %config.agent_id, "Configuration loaded");

    if !foreground {
        info!("Running in foreground mode (daemon mode not yet implemented)");
    }

    // Initialize Docker adapter
    let docker = DockerAdapter::new()
        .context("Failed to initialize Docker adapter")?;

    // Verify Docker is accessible
    let version = docker.version().await
        .context("Failed to get Docker version")?;
    info!(docker_version = %version, "Docker runtime initialized");

    // Wrap in Arc for shared ownership
    let runtime = Arc::new(docker);

    // Initialize state manager
    let state_manager = AgentStateManager::new();
    info!(state = ?state_manager.current_state(), "Agent state initialized");

    // Connect to control plane
    let ws_url = format!("{}/ws/agent/{}", config.control_plane.url, config.agent_id);
    info!(url = %ws_url, "Connecting to control plane");

    let mut ws_client = WebSocketClient::new(
        &ws_url,
        &config.agent_id,
        &config.server_id,
        config.control_plane.reconnect_interval_ms,
        runtime,
    );

    // Start the agent main loop
    ws_client.run(&state_manager).await?;

    Ok(())
}

async fn show_status() -> Result<()> {
    println!("Agent Status: checking...");

    // Check Docker connectivity
    match DockerAdapter::new() {
        Ok(docker) => {
            match docker.version().await {
                Ok(version) => println!("  Docker: {} (connected)", version),
                Err(e) => println!("  Docker: error - {}", e),
            }

            // Get container count
            match docker.list_containers(false).await {
                Ok(containers) => println!("  Running containers: {}", containers.len()),
                Err(_) => println!("  Running containers: unknown"),
            }
        }
        Err(e) => println!("  Docker: not available - {}", e),
    }

    // TODO: Implement status check via local socket or HTTP endpoint
    println!("  Control Plane: Not connected (check agent process)");
    Ok(())
}

fn install_service(name: &str) -> Result<()> {
    println!("Installing service: {}", name);

    // Generate systemd service file
    let service_content = format!(r#"[Unit]
Description=Syntra Agent
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
ExecStart=/usr/local/bin/syntra-agent start --foreground
Restart=always
RestartSec=5
User=root
Environment=RUST_LOG=info

[Install]
WantedBy=multi-user.target
"#);

    let service_path = format!("/etc/systemd/system/{}.service", name);
    println!("Service file would be created at: {}", service_path);
    println!("\nService content:");
    println!("{}", service_content);
    println!("\nTo install manually, run:");
    println!("  sudo cp syntra-agent /usr/local/bin/");
    println!("  sudo nano {}", service_path);
    println!("  sudo systemctl daemon-reload");
    println!("  sudo systemctl enable {}", name);
    println!("  sudo systemctl start {}", name);

    Ok(())
}

fn show_version() {
    println!("syntra-agent {}", env!("CARGO_PKG_VERSION"));
    println!("Rust runtime agent for Syntra container orchestration");
    println!();
    println!("Features:");
    println!("  - Docker container management");
    println!("  - WebSocket control plane communication");
    println!("  - Auto-reconnection with exponential backoff");
    println!("  - Heartbeat and status reporting");
}

use anyhow::Result;
use clap::{Parser, Subcommand};

mod api;
mod commands;
mod config;

#[derive(Parser)]
#[command(name = "syntra", about = "Syntra CLI - Manage your Syntra deployments")]
#[command(version, propagate_version = true)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Authenticate with the Syntra control plane
    Login {
        /// API base URL (default: https://app.syntra.io)
        #[arg(long)]
        api_url: Option<String>,
    },

    /// List projects
    Projects,

    /// List services for a project
    Services {
        /// Project ID
        #[arg(short, long)]
        project_id: String,
    },

    /// Deploy a service
    Deploy {
        /// Service ID
        service_id: String,

        /// Git branch to deploy
        #[arg(short, long)]
        branch: Option<String>,

        /// Docker image to deploy
        #[arg(short, long)]
        image: Option<String>,
    },

    /// Fetch logs for a service
    Logs {
        /// Service ID
        service_id: String,

        /// Number of log lines to fetch
        #[arg(short = 'n', long, default_value = "50")]
        lines: usize,

        /// Follow log output (live stream)
        #[arg(short, long)]
        follow: bool,
    },

    /// Show server status
    Status {
        /// Filter by server ID
        #[arg(short, long)]
        server_id: Option<String>,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Login { api_url } => {
            commands::login::run(api_url).await
        }
        Commands::Projects => {
            commands::projects::list().await
        }
        Commands::Services { project_id } => {
            commands::services::list(&project_id).await
        }
        Commands::Deploy {
            service_id,
            branch,
            image,
        } => {
            commands::deploy::run(&service_id, branch, image).await
        }
        Commands::Logs {
            service_id,
            lines,
            follow,
        } => {
            commands::logs::run(&service_id, lines, follow).await
        }
        Commands::Status { server_id } => {
            commands::status::run(server_id).await
        }
    }
}

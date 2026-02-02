use anyhow::Result;
use clap::Subcommand;
use colored::Colorize;

use crate::config::Config;

#[derive(Subcommand)]
pub enum ContextCommands {
    /// Show current context
    Current,
    /// Set default organization
    SetOrg {
        /// Organization ID
        org_id: String,
    },
    /// Set default project
    SetProject {
        /// Project ID
        project_id: String,
    },
    /// Clear all context defaults
    Clear,
}

pub async fn run(cmd: ContextCommands) -> Result<()> {
    match cmd {
        ContextCommands::Current => {
            let config = Config::load()?;
            println!("{}", "Current Context:".bold());
            println!(
                "  API URL:    {}",
                config.api_url().cyan()
            );
            println!(
                "  Org ID:     {}",
                config
                    .default_org_id
                    .as_deref()
                    .unwrap_or("(not set)")
                    .cyan()
            );
            println!(
                "  Project ID: {}",
                config
                    .default_project_id
                    .as_deref()
                    .unwrap_or("(not set)")
                    .cyan()
            );
            println!(
                "  Logged in:  {}",
                if config.is_authenticated() {
                    "yes".green()
                } else {
                    "no".red()
                }
            );
        }

        ContextCommands::SetOrg { org_id } => {
            let mut config = Config::load()?;
            config.default_org_id = Some(org_id.clone());
            config.save()?;
            println!(
                "{} Default organization set to {}",
                "✓".green().bold(),
                org_id.cyan()
            );
        }

        ContextCommands::SetProject { project_id } => {
            let mut config = Config::load()?;
            config.default_project_id = Some(project_id.clone());
            config.save()?;
            println!(
                "{} Default project set to {}",
                "✓".green().bold(),
                project_id.cyan()
            );
        }

        ContextCommands::Clear => {
            let mut config = Config::load()?;
            config.default_org_id = None;
            config.default_project_id = None;
            config.save()?;
            println!("{} Context cleared", "✓".green().bold());
        }
    }

    Ok(())
}

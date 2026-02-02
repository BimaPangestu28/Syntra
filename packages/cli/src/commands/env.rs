use anyhow::Result;
use clap::Subcommand;
use colored::Colorize;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::api::ApiClient;

#[derive(Subcommand)]
pub enum EnvCommands {
    /// List environment variables
    List {
        /// Service ID
        #[arg(short, long)]
        service_id: String,
    },
    /// Set an environment variable
    Set {
        /// Service ID
        #[arg(short, long)]
        service_id: String,
        /// Variable key
        #[arg(short, long)]
        key: String,
        /// Variable value
        #[arg(short, long)]
        value: String,
    },
    /// Delete an environment variable
    Delete {
        /// Service ID
        #[arg(short, long)]
        service_id: String,
        /// Variable key
        #[arg(short, long)]
        key: String,
    },
    /// Import environment variables from a .env file
    BulkImport {
        /// Service ID
        #[arg(short, long)]
        service_id: String,
        /// Path to .env file
        #[arg(short, long)]
        file: String,
    },
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct EnvVars {
    pub env_vars: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
struct SetEnvRequest {
    key: String,
    value: String,
}

#[derive(Debug, Serialize)]
struct BulkEnvRequest {
    env_vars: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct GenericResponse {
    success: Option<bool>,
}

pub async fn run(cmd: EnvCommands) -> Result<()> {
    let api = ApiClient::from_config()?;

    match cmd {
        EnvCommands::List { service_id } => {
            let vars: EnvVars = api.get(&format!("/services/{}/env", service_id)).await?;

            if vars.env_vars.is_empty() {
                println!("{}", "No environment variables set.".dimmed());
                return Ok(());
            }

            println!("{}", "Environment Variables:".bold());
            let mut keys: Vec<_> = vars.env_vars.keys().collect();
            keys.sort();
            for key in keys {
                let value = &vars.env_vars[key];
                println!("  {}={}", key.cyan(), value);
            }
        }

        EnvCommands::Set {
            service_id,
            key,
            value,
        } => {
            let request = SetEnvRequest {
                key: key.clone(),
                value,
            };
            let _: GenericResponse = api
                .post(&format!("/services/{}/env", service_id), &request)
                .await?;
            println!("{} Set {}", "✓".green().bold(), key.cyan());
        }

        EnvCommands::Delete { service_id, key } => {
            let _: GenericResponse = api
                .delete(&format!("/services/{}/env/{}", service_id, key))
                .await?;
            println!("{} Deleted {}", "✓".green().bold(), key.cyan());
        }

        EnvCommands::BulkImport { service_id, file } => {
            let content = std::fs::read_to_string(&file)
                .map_err(|e| anyhow::anyhow!("Failed to read {}: {}", file, e))?;

            let mut env_vars = HashMap::new();
            for line in content.lines() {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') {
                    continue;
                }
                if let Some((key, value)) = line.split_once('=') {
                    let value = value.trim_matches('"').trim_matches('\'');
                    env_vars.insert(key.trim().to_string(), value.to_string());
                }
            }

            if env_vars.is_empty() {
                println!("{}", "No variables found in file.".dimmed());
                return Ok(());
            }

            let request = BulkEnvRequest { env_vars: env_vars.clone() };
            let _: GenericResponse = api
                .post(&format!("/services/{}/env/bulk", service_id), &request)
                .await?;
            println!(
                "{} Imported {} variables from {}",
                "✓".green().bold(),
                env_vars.len(),
                file.dimmed()
            );
        }
    }

    Ok(())
}

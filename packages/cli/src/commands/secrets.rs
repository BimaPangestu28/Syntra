use anyhow::Result;
use clap::Subcommand;
use colored::Colorize;
use serde::{Deserialize, Serialize};

use crate::api::ApiClient;

#[derive(Subcommand)]
pub enum SecretsCommands {
    /// List secrets (names only, values are masked)
    List {
        /// Service ID
        #[arg(short, long)]
        service_id: String,
    },
    /// Set a secret
    Set {
        /// Service ID
        #[arg(short, long)]
        service_id: String,
        /// Secret key
        #[arg(short, long)]
        key: String,
        /// Secret value
        #[arg(short, long)]
        value: String,
    },
    /// Delete a secret
    Delete {
        /// Service ID
        #[arg(short, long)]
        service_id: String,
        /// Secret key
        #[arg(short, long)]
        key: String,
    },
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct SecretItem {
    key: String,
    created_at: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct SecretsList {
    secrets: Vec<SecretItem>,
}

#[derive(Debug, Serialize)]
struct SetSecretRequest {
    key: String,
    value: String,
    is_secret: bool,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct GenericResponse {
    success: Option<bool>,
}

pub async fn run(cmd: SecretsCommands) -> Result<()> {
    let api = ApiClient::from_config()?;

    match cmd {
        SecretsCommands::List { service_id } => {
            let secrets: SecretsList = api
                .get(&format!("/services/{}/secrets", service_id))
                .await?;

            if secrets.secrets.is_empty() {
                println!("{}", "No secrets set.".dimmed());
                return Ok(());
            }

            println!("{}", "Secrets:".bold());
            for secret in &secrets.secrets {
                println!("  {} = {}", secret.key.cyan(), "••••••••".dimmed());
            }
        }

        SecretsCommands::Set {
            service_id,
            key,
            value,
        } => {
            let request = SetSecretRequest {
                key: key.clone(),
                value,
                is_secret: true,
            };
            let _: GenericResponse = api
                .post(&format!("/services/{}/env", service_id), &request)
                .await?;
            println!("{} Secret {} set", "✓".green().bold(), key.cyan());
        }

        SecretsCommands::Delete { service_id, key } => {
            let _: GenericResponse = api
                .delete(&format!("/services/{}/env/{}", service_id, key))
                .await?;
            println!("{} Secret {} deleted", "✓".green().bold(), key.cyan());
        }
    }

    Ok(())
}

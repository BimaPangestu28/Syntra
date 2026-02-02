use anyhow::Result;
use clap::Subcommand;
use colored::Colorize;
use serde::{Deserialize, Serialize};

use crate::api::ApiClient;

#[derive(Subcommand)]
pub enum DomainsCommands {
    /// List domains for a service
    List {
        /// Service ID
        #[arg(short, long)]
        service_id: String,
    },
    /// Add a domain to a service
    Add {
        /// Service ID
        #[arg(short, long)]
        service_id: String,
        /// Domain name (e.g., app.example.com)
        #[arg(short, long)]
        domain: String,
    },
    /// Delete a domain
    Delete {
        /// Domain ID
        domain_id: String,
    },
    /// Verify a domain
    Verify {
        /// Domain ID
        domain_id: String,
    },
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct Domain {
    id: String,
    domain: String,
    status: String,
    is_primary: Option<bool>,
    ssl_enabled: Option<bool>,
    ssl_status: Option<String>,
    verification_token: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct DomainList {
    domains: Vec<Domain>,
}

#[derive(Debug, Serialize)]
struct AddDomainRequest {
    service_id: String,
    domain: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct GenericResponse {
    deleted: Option<bool>,
    verified: Option<bool>,
}

pub async fn run(cmd: DomainsCommands) -> Result<()> {
    let api = ApiClient::from_config()?;

    match cmd {
        DomainsCommands::List { service_id } => {
            let result: Vec<Domain> = api
                .get(&format!("/services/{}/domains", service_id))
                .await?;

            if result.is_empty() {
                println!("{}", "No domains configured.".dimmed());
                return Ok(());
            }

            println!("{}", "Domains:".bold());
            for domain in &result {
                let status_color = match domain.status.as_str() {
                    "active" => domain.status.green(),
                    "verified" => domain.status.green(),
                    "pending_verification" => domain.status.yellow(),
                    _ => domain.status.red(),
                };

                let primary = if domain.is_primary.unwrap_or(false) {
                    " (primary)".dimmed().to_string()
                } else {
                    String::new()
                };

                let ssl = if domain.ssl_enabled.unwrap_or(false) {
                    " [SSL]".green().to_string()
                } else {
                    String::new()
                };

                println!(
                    "  {} {} [{}]{}{}",
                    domain.id.dimmed(),
                    domain.domain.cyan(),
                    status_color,
                    primary,
                    ssl
                );

                if domain.status == "pending_verification" {
                    if let Some(token) = &domain.verification_token {
                        println!(
                            "    {} Add TXT record: _syntra-verify.{} -> {}",
                            "→".blue(),
                            domain.domain,
                            token
                        );
                    }
                }
            }
        }

        DomainsCommands::Add {
            service_id,
            domain,
        } => {
            let request = AddDomainRequest {
                service_id,
                domain: domain.clone(),
            };
            let created: Domain = api.post("/domains", &request).await?;
            println!(
                "{} Domain {} added (status: {})",
                "✓".green().bold(),
                created.domain.cyan(),
                created.status
            );
            if let Some(token) = &created.verification_token {
                println!();
                println!(
                    "  {} To verify, add a DNS TXT record:",
                    "→".blue().bold()
                );
                println!(
                    "    Host: {}",
                    format!("_syntra-verify.{}", domain).cyan()
                );
                println!("    Value: {}", token.cyan());
            }
        }

        DomainsCommands::Delete { domain_id } => {
            let _: GenericResponse = api.delete(&format!("/domains/{}", domain_id)).await?;
            println!("{} Domain deleted", "✓".green().bold());
        }

        DomainsCommands::Verify { domain_id } => {
            let _: GenericResponse = api
                .post(&format!("/domains/{}/verify", domain_id), &())
                .await?;
            println!("{} Domain verification initiated", "✓".green().bold());
        }
    }

    Ok(())
}

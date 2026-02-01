use anyhow::Result;
use colored::Colorize;
use serde::Deserialize;

use crate::api::ApiClient;

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct Service {
    pub id: String,
    pub name: String,
    pub project_id: String,
    pub status: String,
    pub domain: Option<String>,
    pub created_at: String,
}

/// List services for a project
pub async fn list(project_id: &str) -> Result<()> {
    let api = ApiClient::from_config()?;
    let services: Vec<Service> = api.get(&format!("/projects/{}/services", project_id)).await?;

    if services.is_empty() {
        println!("{}", "No services found.".dimmed());
        return Ok(());
    }

    println!("{}", "Services".bold());
    println!("{}", "─".repeat(60));

    for svc in &services {
        let status_color = match svc.status.as_str() {
            "running" => svc.status.green(),
            "stopped" => svc.status.red(),
            "deploying" => svc.status.yellow(),
            _ => svc.status.dimmed(),
        };

        println!("  {} [{}]", svc.name.bold(), status_color);
        if let Some(domain) = &svc.domain {
            println!("    Domain: {}", domain.cyan());
        }
        println!("    ID: {}", svc.id.dimmed());
        println!();
    }

    println!("{} service(s)", services.len());

    Ok(())
}

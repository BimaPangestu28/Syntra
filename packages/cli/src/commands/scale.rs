use anyhow::Result;
use colored::Colorize;
use serde::{Deserialize, Serialize};

use crate::api::ApiClient;

#[derive(Debug, Serialize)]
struct ScaleRequest {
    replicas: u32,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct ScaleResponse {
    id: String,
    name: String,
    replicas: u32,
}

/// Scale a service to the specified number of replicas
pub async fn run(service_id: &str, replicas: u32) -> Result<()> {
    let api = ApiClient::from_config()?;

    println!(
        "{} Scaling service {} to {} replicas...",
        "→".blue().bold(),
        service_id.dimmed(),
        replicas
    );

    let request = ScaleRequest { replicas };
    let result: ScaleResponse = api
        .patch(&format!("/services/{}", service_id), &request)
        .await?;

    println!(
        "{} Service {} scaled to {} replicas",
        "✓".green().bold(),
        result.name.cyan(),
        result.replicas
    );

    Ok(())
}

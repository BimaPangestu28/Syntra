use anyhow::Result;
use colored::Colorize;
use serde::{Deserialize, Serialize};

use crate::api::ApiClient;

#[derive(Debug, Serialize)]
struct RollbackRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    target_deployment_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct RollbackResponse {
    id: String,
    status: String,
    rollback_from_id: Option<String>,
}

/// Rollback a service to a previous deployment
pub async fn run(service_id: &str, to_deployment: Option<String>) -> Result<()> {
    let api = ApiClient::from_config()?;

    let msg = if let Some(ref dep_id) = to_deployment {
        format!(
            "{} Rolling back service {} to deployment {}...",
            "→".blue().bold(),
            service_id.dimmed(),
            dep_id.dimmed()
        )
    } else {
        format!(
            "{} Rolling back service {} to previous deployment...",
            "→".blue().bold(),
            service_id.dimmed()
        )
    };
    println!("{}", msg);

    let request = RollbackRequest {
        target_deployment_id: to_deployment,
    };
    let result: RollbackResponse = api
        .post(&format!("/services/{}/rollback", service_id), &request)
        .await?;

    println!(
        "{} Rollback deployment {} created (status: {})",
        "✓".green().bold(),
        result.id,
        result.status
    );

    Ok(())
}

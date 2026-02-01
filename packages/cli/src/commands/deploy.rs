use anyhow::Result;
use colored::Colorize;
use indicatif::{ProgressBar, ProgressStyle};
use serde::{Deserialize, Serialize};

use crate::api::ApiClient;

#[derive(Debug, Serialize)]
struct DeployRequest {
    service_id: String,
    source: DeploySource,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type")]
enum DeploySource {
    #[serde(rename = "git")]
    Git { branch: String },
    #[serde(rename = "image")]
    Image { image: String },
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct Deployment {
    pub id: String,
    pub status: String,
    pub created_at: String,
}

/// Deploy a service
pub async fn run(service_id: &str, branch: Option<String>, image: Option<String>) -> Result<()> {
    let api = ApiClient::from_config()?;

    let source = if let Some(img) = image {
        DeploySource::Image { image: img }
    } else {
        DeploySource::Git {
            branch: branch.unwrap_or_else(|| "main".to_string()),
        }
    };

    let request = DeployRequest {
        service_id: service_id.to_string(),
        source,
    };

    println!("{} Triggering deployment...", "→".blue().bold());

    let deployment: Deployment = api
        .post(&format!("/services/{}/deployments", service_id), &request)
        .await?;

    let spinner = ProgressBar::new_spinner();
    spinner.set_style(
        ProgressStyle::default_spinner()
            .tick_strings(&["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"])
            .template("{spinner:.blue} {msg}")?,
    );
    spinner.set_message(format!("Deployment {} started", deployment.id));
    spinner.finish_with_message(format!(
        "{} Deployment {} created (status: {})",
        "✓".green().bold(),
        deployment.id,
        deployment.status
    ));

    println!();
    println!(
        "  Track progress: {} deploy status {}",
        "syntra".dimmed(),
        deployment.id
    );

    Ok(())
}

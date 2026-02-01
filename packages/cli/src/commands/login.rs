use anyhow::{bail, Result};
use colored::Colorize;
use dialoguer::Password;

use crate::config::Config;

/// Handle the login command
pub async fn run(api_url: Option<String>) -> Result<()> {
    println!("{}", "Syntra Login".bold());
    println!();

    let mut config = Config::load().unwrap_or_default();

    if let Some(url) = api_url {
        config.api_url = Some(url);
    }

    let token: String = Password::new()
        .with_prompt("API Token")
        .interact()?;

    if token.is_empty() {
        bail!("Token cannot be empty");
    }

    // Verify token by making a test request
    let client = reqwest::Client::new();
    let base = config.api_url();
    let resp = client
        .get(format!("{}/api/v1/health", base))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await?;

    if !resp.status().is_success() {
        bail!("Invalid token or cannot reach API at {}", base);
    }

    config.token = Some(token);
    config.save()?;

    println!();
    println!(
        "{} Logged in to {}",
        "✓".green().bold(),
        config.api_url()
    );
    println!(
        "  Config saved to {}",
        Config::path()?.display().to_string().dimmed()
    );

    Ok(())
}

use anyhow::Result;
use colored::Colorize;
use serde::Deserialize;

use crate::api::ApiClient;

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub message: String,
    pub source: Option<String>,
}

/// Fetch and display logs for a service
pub async fn run(service_id: &str, lines: usize, follow: bool) -> Result<()> {
    let api = ApiClient::from_config()?;

    let logs: Vec<LogEntry> = api
        .get(&format!(
            "/logs?service_id={}&limit={}",
            service_id, lines
        ))
        .await?;

    if logs.is_empty() {
        println!("{}", "No logs found.".dimmed());
        return Ok(());
    }

    for entry in &logs {
        let level_color = match entry.level.as_str() {
            "error" | "fatal" => entry.level.red().bold(),
            "warn" => entry.level.yellow(),
            "info" => entry.level.green(),
            "debug" => entry.level.dimmed(),
            _ => entry.level.normal(),
        };

        let ts = &entry.timestamp[..19]; // Trim to seconds
        println!(
            "{} {} {}",
            ts.dimmed(),
            format!("[{}]", level_color).bold(),
            entry.message
        );
    }

    if follow {
        println!();
        println!(
            "{}",
            "Live log streaming not yet implemented. Use --no-follow for now.".yellow()
        );
    }

    Ok(())
}

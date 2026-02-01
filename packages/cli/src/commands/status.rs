use anyhow::Result;
use colored::Colorize;
use serde::Deserialize;

use crate::api::ApiClient;

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct ServerStatus {
    pub id: String,
    pub hostname: String,
    pub status: String,
    pub cpu_percent: Option<f64>,
    pub memory_percent: Option<f64>,
    pub uptime_seconds: Option<u64>,
}

/// Show status of servers
pub async fn run(server_id: Option<String>) -> Result<()> {
    let api = ApiClient::from_config()?;

    let path = match &server_id {
        Some(id) => format!("/servers/{}", id),
        None => "/servers".to_string(),
    };

    let servers: Vec<ServerStatus> = api.get(&path).await?;

    if servers.is_empty() {
        println!("{}", "No servers found.".dimmed());
        return Ok(());
    }

    println!("{}", "Servers".bold());
    println!("{}", "─".repeat(70));
    println!(
        "  {:<20} {:<12} {:>8} {:>8} {:>10}",
        "HOSTNAME".dimmed(),
        "STATUS".dimmed(),
        "CPU".dimmed(),
        "MEM".dimmed(),
        "UPTIME".dimmed(),
    );
    println!("{}", "─".repeat(70));

    for server in &servers {
        let status_color = match server.status.as_str() {
            "online" => server.status.green(),
            "offline" => server.status.red(),
            "degraded" => server.status.yellow(),
            _ => server.status.dimmed(),
        };

        let cpu = server
            .cpu_percent
            .map(|v| format!("{:.1}%", v))
            .unwrap_or_else(|| "-".to_string());

        let mem = server
            .memory_percent
            .map(|v| format!("{:.1}%", v))
            .unwrap_or_else(|| "-".to_string());

        let uptime = server
            .uptime_seconds
            .map(|s| format_uptime(s))
            .unwrap_or_else(|| "-".to_string());

        println!(
            "  {:<20} {:<12} {:>8} {:>8} {:>10}",
            server.hostname, status_color, cpu, mem, uptime,
        );
    }

    println!();
    println!("{} server(s)", servers.len());

    Ok(())
}

fn format_uptime(seconds: u64) -> String {
    let days = seconds / 86400;
    let hours = (seconds % 86400) / 3600;
    let mins = (seconds % 3600) / 60;

    if days > 0 {
        format!("{}d {}h", days, hours)
    } else if hours > 0 {
        format!("{}h {}m", hours, mins)
    } else {
        format!("{}m", mins)
    }
}

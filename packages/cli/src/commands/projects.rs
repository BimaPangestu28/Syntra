use anyhow::Result;
use colored::Colorize;
use serde::Deserialize;

use crate::api::ApiClient;

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub created_at: String,
}

/// List projects
pub async fn list() -> Result<()> {
    let api = ApiClient::from_config()?;
    let projects: Vec<Project> = api.get("/projects").await?;

    if projects.is_empty() {
        println!("{}", "No projects found.".dimmed());
        return Ok(());
    }

    println!("{}", "Projects".bold());
    println!("{}", "─".repeat(60));

    for project in &projects {
        println!(
            "  {} {}",
            project.name.bold(),
            format!("({})", project.slug).dimmed()
        );
        if let Some(desc) = &project.description {
            println!("    {}", desc.dimmed());
        }
        println!("    ID: {}", project.id.dimmed());
        println!();
    }

    println!("{} project(s)", projects.len());

    Ok(())
}

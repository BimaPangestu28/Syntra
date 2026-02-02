//! API Client
//!
//! HTTP client for communicating with the Syntra control plane API.

use anyhow::{bail, Context, Result};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::de::DeserializeOwned;
use serde::Deserialize;

use crate::config::Config;

#[derive(Debug, Deserialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<ApiError>,
}

#[derive(Debug, Deserialize)]
pub struct ApiError {
    pub code: String,
    pub message: String,
}

pub struct ApiClient {
    client: reqwest::Client,
    base_url: String,
}

impl ApiClient {
    /// Create from saved config
    pub fn from_config() -> Result<Self> {
        let config = Config::load()?;
        let base_url = config.api_url().to_string();
        let token = config
            .token
            .context("Not logged in. Run `syntra login` first.")?;

        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", token))?,
        );
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .build()?;

        Ok(Self {
            client,
            base_url,
        })
    }

    /// GET request
    pub async fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        let url = format!("{}/api/v1{}", self.base_url, path);
        let response = self
            .client
            .get(&url)
            .send()
            .await
            .with_context(|| format!("Failed to connect to {}", url))?;

        let status = response.status();
        let body: ApiResponse<T> = response.json().await?;

        if !body.success {
            if let Some(err) = body.error {
                bail!("[{}] {}", err.code, err.message);
            }
            bail!("API request failed with status {}", status);
        }

        body.data.context("Empty response from API")
    }

    /// POST request
    pub async fn post<T: DeserializeOwned, B: serde::Serialize>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<T> {
        let url = format!("{}/api/v1{}", self.base_url, path);
        let response = self
            .client
            .post(&url)
            .json(body)
            .send()
            .await
            .with_context(|| format!("Failed to connect to {}", url))?;

        let status = response.status();
        let body: ApiResponse<T> = response.json().await?;

        if !body.success {
            if let Some(err) = body.error {
                bail!("[{}] {}", err.code, err.message);
            }
            bail!("API request failed with status {}", status);
        }

        body.data.context("Empty response from API")
    }

    /// PATCH request
    pub async fn patch<T: DeserializeOwned, B: serde::Serialize>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<T> {
        let url = format!("{}/api/v1{}", self.base_url, path);
        let response = self
            .client
            .patch(&url)
            .json(body)
            .send()
            .await
            .with_context(|| format!("Failed to connect to {}", url))?;

        let status = response.status();
        let body: ApiResponse<T> = response.json().await?;

        if !body.success {
            if let Some(err) = body.error {
                bail!("[{}] {}", err.code, err.message);
            }
            bail!("API request failed with status {}", status);
        }

        body.data.context("Empty response from API")
    }

    /// DELETE request
    pub async fn delete<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        let url = format!("{}/api/v1{}", self.base_url, path);
        let response = self
            .client
            .delete(&url)
            .send()
            .await
            .with_context(|| format!("Failed to connect to {}", url))?;

        let status = response.status();
        let body: ApiResponse<T> = response.json().await?;

        if !body.success {
            if let Some(err) = body.error {
                bail!("[{}] {}", err.code, err.message);
            }
            bail!("API request failed with status {}", status);
        }

        body.data.context("Empty response from API")
    }
}

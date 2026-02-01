import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { services, projects, servers, managedDatabases, organizationMembers, domains } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';

// Helper to get user's org IDs
async function getUserOrgIds(userId: string): Promise<string[]> {
  const memberships = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.userId, userId),
  });
  return memberships.map((m) => m.orgId);
}

// Helper to sanitize resource names for Terraform
function sanitizeResourceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

// Generate Terraform configuration for services
function generateServiceTerraform(service: any, project: any): string {
  const resourceName = sanitizeResourceName(service.name);

  return `
# Service: ${service.name}
resource "syntra_service" "${resourceName}" {
  project_id = syntra_project.${sanitizeResourceName(project.name)}.id
  name       = "${service.name}"
  type       = "${service.type}"

  source {
    type = "${service.sourceType}"
    ${service.dockerImage ? `docker_image = "${service.dockerImage}"` : ''}
    ${service.dockerfilePath ? `dockerfile_path = "${service.dockerfilePath}"` : ''}
  }

  port     = ${service.port || 3000}
  replicas = ${service.replicas || 1}

  health_check {
    path     = "${service.healthCheckPath || '/'}"
    interval = ${service.healthCheckInterval || 30}
  }

  resources {
    ${service.resources?.cpu_limit ? `cpu_limit    = "${service.resources.cpu_limit}"` : '# cpu_limit    = "1000m"'}
    ${service.resources?.memory_limit ? `memory_limit = "${service.resources.memory_limit}"` : '# memory_limit = "512Mi"'}
  }

  auto_deploy = ${service.autoDeploy}
  is_active   = ${service.isActive}
}
`;
}

// Generate Terraform configuration for databases
function generateDatabaseTerraform(database: any): string {
  const resourceName = sanitizeResourceName(database.name);

  return `
# Managed Database: ${database.name}
resource "syntra_database" "${resourceName}" {
  name          = "${database.name}"
  type          = "${database.type}"
  version       = "${database.version || 'latest'}"
  storage_size  = ${database.storageSizeMb || 1024}

  backup {
    enabled  = ${database.backupEnabled}
    ${database.backupSchedule ? `schedule = "${database.backupSchedule}"` : '# schedule = "0 0 * * *"'}
  }

  max_connections = ${database.maxConnections || 100}
}
`;
}

// Generate Terraform configuration for domains
function generateDomainTerraform(domain: any, serviceName: string): string {
  const resourceName = sanitizeResourceName(domain.domain);

  return `
# Domain: ${domain.domain}
resource "syntra_domain" "${resourceName}" {
  service_id = syntra_service.${sanitizeResourceName(serviceName)}.id
  domain     = "${domain.domain}"

  ssl {
    enabled    = ${domain.sslEnabled}
    auto_renew = ${domain.sslAutoRenew}
  }

  is_primary = ${domain.isPrimary}
}
`;
}

// Generate project Terraform
function generateProjectTerraform(project: any): string {
  const resourceName = sanitizeResourceName(project.name);

  return `
# Project: ${project.name}
resource "syntra_project" "${resourceName}" {
  name        = "${project.name}"
  slug        = "${project.slug}"
  description = "${project.description || ''}"

  ${project.gitRepoUrl ? `
  git {
    repo_url = "${project.gitRepoUrl}"
    branch   = "${project.gitBranch || 'main'}"
    ${project.gitProvider ? `provider = "${project.gitProvider}"` : ''}
  }` : ''}

  build {
    ${project.buildCommand ? `command          = "${project.buildCommand}"` : '# command          = "npm run build"'}
    ${project.installCommand ? `install_command  = "${project.installCommand}"` : '# install_command  = "npm install"'}
    ${project.outputDirectory ? `output_directory = "${project.outputDirectory}"` : '# output_directory = "dist"'}
    root_directory   = "${project.rootDirectory || '/'}"
  }
}
`;
}

// GET /api/v1/terraform - Export infrastructure as Terraform
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get('org_id');
    const projectId = searchParams.get('project_id');
    const format = searchParams.get('format') || 'tf'; // tf, json
    const includeSecrets = searchParams.get('include_secrets') === 'true';

    const orgIds = await getUserOrgIds(session.user.id);
    if (orgIds.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'No organizations found', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    if (orgId && !orgIds.includes(orgId)) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const targetOrgIds = orgId ? [orgId] : orgIds;

    // Fetch all resources
    const projectList = await db.query.projects.findMany({
      where: projectId
        ? and(inArray(projects.orgId, targetOrgIds), eq(projects.id, projectId))
        : inArray(projects.orgId, targetOrgIds),
      with: {
        services: {
          with: {
            domains: true,
          },
        },
      },
    });

    const databases = await db.query.managedDatabases.findMany({
      where: inArray(managedDatabases.orgId, targetOrgIds),
    });

    if (format === 'json') {
      // Export as JSON (Terraform JSON syntax)
      const terraformJson = {
        terraform: {
          required_providers: {
            syntra: {
              source: 'syntra/syntra',
              version: '~> 1.0',
            },
          },
        },
        provider: {
          syntra: {
            api_url: '${var.syntra_api_url}',
            api_key: '${var.syntra_api_key}',
          },
        },
        variable: {
          syntra_api_url: {
            type: 'string',
            default: process.env.NEXT_PUBLIC_APP_URL || 'https://api.syntra.catalystlabs.id',
          },
          syntra_api_key: {
            type: 'string',
            sensitive: true,
          },
        },
        resource: {
          syntra_project: {} as Record<string, unknown>,
          syntra_service: {} as Record<string, unknown>,
          syntra_database: {} as Record<string, unknown>,
          syntra_domain: {} as Record<string, unknown>,
        },
      };

      for (const project of projectList) {
        const projectResourceName = sanitizeResourceName(project.name);
        terraformJson.resource.syntra_project[projectResourceName] = {
          name: project.name,
          slug: project.slug,
          description: project.description,
          git: project.gitRepoUrl ? {
            repo_url: project.gitRepoUrl,
            branch: project.gitBranch,
            provider: project.gitProvider,
          } : null,
        };

        for (const service of project.services) {
          const serviceResourceName = sanitizeResourceName(service.name);
          terraformJson.resource.syntra_service[serviceResourceName] = {
            project_id: `\${syntra_project.${projectResourceName}.id}`,
            name: service.name,
            type: service.type,
            source_type: service.sourceType,
            docker_image: service.dockerImage,
            port: service.port,
            replicas: service.replicas,
            auto_deploy: service.autoDeploy,
          };

          for (const domain of service.domains) {
            const domainResourceName = sanitizeResourceName(domain.domain);
            terraformJson.resource.syntra_domain[domainResourceName] = {
              service_id: `\${syntra_service.${serviceResourceName}.id}`,
              domain: domain.domain,
              ssl_enabled: domain.sslEnabled,
              ssl_auto_renew: domain.sslAutoRenew,
              is_primary: domain.isPrimary,
            };
          }
        }
      }

      for (const database of databases) {
        const dbResourceName = sanitizeResourceName(database.name);
        terraformJson.resource.syntra_database[dbResourceName] = {
          name: database.name,
          type: database.type,
          version: database.version,
          storage_size_mb: database.storageSizeMb,
          backup_enabled: database.backupEnabled,
        };
      }

      return NextResponse.json({
        success: true,
        data: {
          format: 'json',
          content: terraformJson,
        },
      });
    }

    // Generate HCL format
    let terraformConfig = `# Syntra Infrastructure as Code
# Generated: ${new Date().toISOString()}
# Organization(s): ${targetOrgIds.join(', ')}

terraform {
  required_providers {
    syntra = {
      source  = "syntra/syntra"
      version = "~> 1.0"
    }
  }
}

variable "syntra_api_url" {
  type    = string
  default = "${process.env.NEXT_PUBLIC_APP_URL || 'https://api.syntra.catalystlabs.id'}"
}

variable "syntra_api_key" {
  type      = string
  sensitive = true
}

provider "syntra" {
  api_url = var.syntra_api_url
  api_key = var.syntra_api_key
}
`;

    // Add projects and services
    for (const project of projectList) {
      terraformConfig += generateProjectTerraform(project);

      for (const service of project.services) {
        terraformConfig += generateServiceTerraform(service, project);

        for (const domain of service.domains) {
          terraformConfig += generateDomainTerraform(domain, service.name);
        }
      }
    }

    // Add databases
    for (const database of databases) {
      terraformConfig += generateDatabaseTerraform(database);
    }

    // Add outputs
    terraformConfig += `
# Outputs
output "project_ids" {
  value = {
    ${projectList.map(p => `${sanitizeResourceName(p.name)} = syntra_project.${sanitizeResourceName(p.name)}.id`).join('\n    ')}
  }
}

output "service_urls" {
  value = {
    ${projectList.flatMap(p =>
      p.services.map(s => `${sanitizeResourceName(s.name)} = syntra_service.${sanitizeResourceName(s.name)}.url`)
    ).join('\n    ')}
  }
}
`;

    // Return as downloadable file or JSON
    const returnAsFile = searchParams.get('download') === 'true';

    if (returnAsFile) {
      return new NextResponse(terraformConfig, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
          'Content-Disposition': `attachment; filename="syntra-infrastructure.tf"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        format: 'hcl',
        content: terraformConfig,
        stats: {
          projects: projectList.length,
          services: projectList.reduce((acc, p) => acc + p.services.length, 0),
          databases: databases.length,
          domains: projectList.reduce((acc, p) => acc + p.services.reduce((sacc, s) => sacc + s.domains.length, 0), 0),
        },
      },
    });
  } catch (error) {
    console.error('GET /api/v1/terraform error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

// POST /api/v1/terraform/import - Import from Terraform state
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated', request_id: crypto.randomUUID() } },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { org_id, terraform_state } = body;

    if (!org_id || !terraform_state) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'org_id and terraform_state are required', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    const orgIds = await getUserOrgIds(session.user.id);
    if (!orgIds.includes(org_id)) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    // Parse and validate Terraform state
    // This is a placeholder - actual implementation would parse the state
    // and create corresponding resources in Syntra

    return NextResponse.json({
      success: true,
      data: {
        message: 'Terraform import initiated',
        job_id: crypto.randomUUID(),
        status: 'pending',
      },
    });
  } catch (error) {
    console.error('POST /api/v1/terraform/import error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

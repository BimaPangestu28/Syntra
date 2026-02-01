import { db } from '@/lib/db';
import { domains } from '@/lib/db/schema';
import { eq, and, lt, or } from 'drizzle-orm';
import { getAcmeClient } from './acme-client';
import { createAlert } from '@/lib/alerts';

// Configuration
const SSL_RENEWAL_DAYS_BEFORE_EXPIRY = 30;
const SSL_CHECK_INTERVAL_MS = 3600000; // 1 hour

interface DnsProvider {
  setRecord(name: string, value: string): Promise<void>;
  removeRecord(name: string): Promise<void>;
}

// Simple DNS provider interface - implement based on your DNS provider
// This is a placeholder that logs the required actions
class ManualDnsProvider implements DnsProvider {
  async setRecord(name: string, value: string): Promise<void> {
    console.log(`[DNS] Please set TXT record: ${name} = ${value}`);
    // In production, integrate with your DNS provider API
    // e.g., Cloudflare, Route53, etc.
  }

  async removeRecord(name: string): Promise<void> {
    console.log(`[DNS] Please remove TXT record: ${name}`);
  }
}

/**
 * Issue a new SSL certificate for a domain
 */
export async function issueCertificate(domainId: string): Promise<boolean> {
  const domain = await db.query.domains.findFirst({
    where: eq(domains.id, domainId),
    with: {
      service: {
        with: {
          project: true,
        },
      },
    },
  });

  if (!domain) {
    console.error(`[SSL] Domain ${domainId} not found`);
    return false;
  }

  if (domain.status !== 'verified' && domain.status !== 'active') {
    console.error(`[SSL] Domain ${domain.domain} is not verified`);
    return false;
  }

  if (!domain.sslEnabled) {
    console.log(`[SSL] SSL not enabled for ${domain.domain}`);
    return false;
  }

  console.log(`[SSL] Starting certificate issuance for ${domain.domain}`);

  // Update status to issuing
  await db
    .update(domains)
    .set({
      sslStatus: 'issuing',
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(domains.id, domainId));

  try {
    const acmeClient = getAcmeClient();
    const dnsProvider = new ManualDnsProvider();

    const result = await acmeClient.issueCertificate(
      domain.domain,
      (name, value) => dnsProvider.setRecord(name, value),
      (name) => dnsProvider.removeRecord(name)
    );

    // Store certificate in database
    await db
      .update(domains)
      .set({
        sslStatus: 'active',
        sslCertificate: result.certificate,
        sslPrivateKey: result.privateKey, // In production, encrypt this!
        sslChain: result.chain,
        sslIssuedAt: new Date(),
        sslExpiresAt: result.expiresAt,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(domains.id, domainId));

    console.log(`[SSL] Certificate issued successfully for ${domain.domain}`);

    // TODO: Deploy certificate to reverse proxy (Traefik, nginx, etc.)
    await deployCertificate(domain.domain, result);

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[SSL] Certificate issuance failed for ${domain.domain}:`, errorMessage);

    // Update status to failed
    await db
      .update(domains)
      .set({
        sslStatus: 'failed',
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(domains.id, domainId));

    // Create alert
    await createAlert({
      orgId: domain.service.project.orgId,
      type: 'ssl_issuance_failed',
      severity: 'error',
      title: `SSL certificate issuance failed for ${domain.domain}`,
      message: errorMessage,
      serviceId: domain.serviceId,
    });

    return false;
  }
}

/**
 * Deploy certificate to reverse proxy
 */
async function deployCertificate(
  domainName: string,
  cert: { certificate: string; privateKey: string; chain: string }
): Promise<void> {
  // This would integrate with your reverse proxy
  // Options include:
  // 1. Traefik - use file provider or API
  // 2. nginx - write cert files and reload
  // 3. Caddy - use admin API
  // 4. Cloud load balancer - use provider API

  console.log(`[SSL] Certificate deployment for ${domainName} - implement based on your setup`);

  // Example for Traefik with file provider:
  // await fs.writeFile(`/certs/${domainName}.crt`, cert.certificate + cert.chain);
  // await fs.writeFile(`/certs/${domainName}.key`, cert.privateKey);
}

/**
 * Check for certificates that need renewal
 */
export async function checkCertificateRenewals(): Promise<void> {
  const renewalThreshold = new Date();
  renewalThreshold.setDate(renewalThreshold.getDate() + SSL_RENEWAL_DAYS_BEFORE_EXPIRY);

  // Find certificates expiring soon
  const expiringDomains = await db.query.domains.findMany({
    where: and(
      eq(domains.sslEnabled, true),
      eq(domains.sslAutoRenew, true),
      eq(domains.sslStatus, 'active'),
      lt(domains.sslExpiresAt, renewalThreshold)
    ),
    with: {
      service: {
        with: {
          project: true,
        },
      },
    },
  });

  console.log(`[SSL] Found ${expiringDomains.length} certificates expiring within ${SSL_RENEWAL_DAYS_BEFORE_EXPIRY} days`);

  for (const domain of expiringDomains) {
    const daysUntilExpiry = domain.sslExpiresAt
      ? Math.floor((domain.sslExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : 0;

    console.log(`[SSL] Renewing certificate for ${domain.domain} (expires in ${daysUntilExpiry} days)`);

    // Create alert for expiring certificate
    if (daysUntilExpiry <= 7) {
      await createAlert({
        orgId: domain.service.project.orgId,
        type: 'ssl_expiring',
        severity: daysUntilExpiry <= 3 ? 'critical' : 'warning',
        title: `SSL certificate expiring for ${domain.domain}`,
        message: `Certificate expires in ${daysUntilExpiry} days. Auto-renewal in progress.`,
        serviceId: domain.serviceId,
        dedupeKey: `ssl_expiring_${domain.id}`,
      });
    }

    // Attempt renewal
    await issueCertificate(domain.id);
  }
}

/**
 * Find domains with pending SSL that need certificates
 */
export async function processPendingSslRequests(): Promise<void> {
  const pendingDomains = await db.query.domains.findMany({
    where: and(
      eq(domains.sslEnabled, true),
      or(
        eq(domains.sslStatus, 'pending'),
        eq(domains.status, 'verified')
      )
    ),
  });

  console.log(`[SSL] Found ${pendingDomains.length} domains with pending SSL requests`);

  for (const domain of pendingDomains) {
    // Only process if domain is verified
    if (domain.status === 'verified' || domain.status === 'active') {
      await issueCertificate(domain.id);
    }
  }
}

// Background SSL checker
let sslCheckInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Start the SSL renewal checker
 */
export function startSslChecker(): void {
  if (isRunning) {
    console.log('[SSL] SSL checker already running');
    return;
  }

  console.log('[SSL] Starting SSL renewal checker');
  isRunning = true;

  // Run immediately
  checkCertificateRenewals().catch(err => {
    console.error('[SSL] Initial renewal check failed:', err);
  });

  // Process pending requests
  processPendingSslRequests().catch(err => {
    console.error('[SSL] Initial pending SSL check failed:', err);
  });

  // Schedule periodic checks
  sslCheckInterval = setInterval(async () => {
    try {
      await checkCertificateRenewals();
      await processPendingSslRequests();
    } catch (error) {
      console.error('[SSL] Periodic check failed:', error);
    }
  }, SSL_CHECK_INTERVAL_MS);
}

/**
 * Stop the SSL renewal checker
 */
export function stopSslChecker(): void {
  if (!isRunning) {
    return;
  }

  console.log('[SSL] Stopping SSL renewal checker');

  if (sslCheckInterval) {
    clearInterval(sslCheckInterval);
    sslCheckInterval = null;
  }

  isRunning = false;
}

/**
 * Check if SSL checker is running
 */
export function isSslCheckerRunning(): boolean {
  return isRunning;
}

import crypto from 'crypto';

// ACME Directory URLs
const ACME_DIRECTORY = {
  production: 'https://acme-v02.api.letsencrypt.org/directory',
  staging: 'https://acme-staging-v02.api.letsencrypt.org/directory',
};

// Configuration
const ACME_ENV = process.env.ACME_ENV === 'production' ? 'production' : 'staging';
const ACME_EMAIL = process.env.ACME_EMAIL || 'admin@syntra.catalystlabs.id';

interface AcmeDirectory {
  newNonce: string;
  newAccount: string;
  newOrder: string;
  revokeCert: string;
  keyChange: string;
}

interface AcmeAccount {
  accountUrl: string;
  privateKey: crypto.KeyObject;
  publicKey: crypto.KeyObject;
}

interface AcmeOrder {
  orderUrl: string;
  status: string;
  identifiers: { type: string; value: string }[];
  authorizations: string[];
  finalize: string;
  certificate?: string;
}

interface AcmeChallenge {
  type: 'http-01' | 'dns-01';
  url: string;
  status: string;
  token: string;
  keyAuthorization?: string;
}

interface CertificateResult {
  certificate: string;
  privateKey: string;
  chain: string;
  expiresAt: Date;
}

/**
 * ACME Client for Let's Encrypt certificate management
 */
export class AcmeClient {
  private directory: AcmeDirectory | null = null;
  private account: AcmeAccount | null = null;
  private nonce: string | null = null;

  constructor() {}

  /**
   * Initialize the ACME client
   */
  async initialize(): Promise<void> {
    // Fetch directory
    const response = await fetch(ACME_DIRECTORY[ACME_ENV]);
    this.directory = await response.json();
    console.log(`[ACME] Initialized with ${ACME_ENV} directory`);
  }

  /**
   * Generate account key pair
   */
  private generateKeyPair(): { privateKey: crypto.KeyObject; publicKey: crypto.KeyObject } {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'P-256',
    });
    return { privateKey, publicKey };
  }

  /**
   * Get a new nonce for request signing
   */
  private async getNonce(): Promise<string> {
    if (this.nonce) {
      const nonce = this.nonce;
      this.nonce = null;
      return nonce;
    }

    const response = await fetch(this.directory!.newNonce, { method: 'HEAD' });
    return response.headers.get('replay-nonce')!;
  }

  /**
   * Update nonce from response
   */
  private updateNonce(response: Response): void {
    const nonce = response.headers.get('replay-nonce');
    if (nonce) {
      this.nonce = nonce;
    }
  }

  /**
   * Base64url encode
   */
  private base64url(data: Buffer | string): string {
    const buffer = typeof data === 'string' ? Buffer.from(data) : data;
    return buffer.toString('base64url');
  }

  /**
   * Create JWK from public key
   */
  private publicKeyToJwk(publicKey: crypto.KeyObject): object {
    const exported = publicKey.export({ format: 'jwk' });
    return {
      kty: exported.kty,
      crv: exported.crv,
      x: exported.x,
      y: exported.y,
    };
  }

  /**
   * Create JWK thumbprint
   */
  private jwkThumbprint(jwk: object): string {
    const ordered = JSON.stringify(jwk, Object.keys(jwk).sort());
    const hash = crypto.createHash('sha256').update(ordered).digest();
    return this.base64url(hash);
  }

  /**
   * Sign a request with JWS
   */
  private async signRequest(
    url: string,
    payload: object | string,
    useKid: boolean = false
  ): Promise<string> {
    const nonce = await this.getNonce();

    const header: Record<string, any> = {
      alg: 'ES256',
      nonce,
      url,
    };

    if (useKid && this.account) {
      header.kid = this.account.accountUrl;
    } else {
      header.jwk = this.publicKeyToJwk(this.account!.publicKey);
    }

    const protectedHeader = this.base64url(JSON.stringify(header));
    const payloadB64 = payload === '' ? '' : this.base64url(JSON.stringify(payload));
    const signatureInput = `${protectedHeader}.${payloadB64}`;

    const sign = crypto.createSign('SHA256');
    sign.update(signatureInput);
    const signature = sign.sign(this.account!.privateKey);

    // Convert DER signature to raw format for ES256
    const r = signature.subarray(4, 4 + signature[3]);
    const s = signature.subarray(6 + signature[3]);
    const rawSignature = Buffer.concat([
      r.length === 33 ? r.subarray(1) : r,
      s.length === 33 ? s.subarray(1) : s,
    ]);

    return JSON.stringify({
      protected: protectedHeader,
      payload: payloadB64,
      signature: this.base64url(rawSignature),
    });
  }

  /**
   * Make a signed ACME request
   */
  private async acmeRequest(
    url: string,
    payload: object | string,
    useKid: boolean = false
  ): Promise<{ status: number; headers: Headers; body: any }> {
    const body = await this.signRequest(url, payload, useKid);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/jose+json' },
      body,
    });

    this.updateNonce(response);

    let responseBody;
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json') || contentType?.includes('application/problem+json')) {
      responseBody = await response.json();
    } else {
      responseBody = await response.text();
    }

    return { status: response.status, headers: response.headers, body: responseBody };
  }

  /**
   * Create or retrieve ACME account
   */
  async createAccount(): Promise<void> {
    if (!this.directory) {
      await this.initialize();
    }

    // Generate new key pair
    const { privateKey, publicKey } = this.generateKeyPair();
    this.account = { accountUrl: '', privateKey, publicKey };

    const { status, headers, body } = await this.acmeRequest(
      this.directory!.newAccount,
      {
        termsOfServiceAgreed: true,
        contact: [`mailto:${ACME_EMAIL}`],
      }
    );

    if (status !== 200 && status !== 201) {
      throw new Error(`Failed to create account: ${JSON.stringify(body)}`);
    }

    this.account.accountUrl = headers.get('location')!;
    console.log(`[ACME] Account created: ${this.account.accountUrl}`);
  }

  /**
   * Create a new certificate order
   */
  async createOrder(domains: string[]): Promise<AcmeOrder> {
    if (!this.account) {
      await this.createAccount();
    }

    const { status, headers, body } = await this.acmeRequest(
      this.directory!.newOrder,
      {
        identifiers: domains.map(domain => ({ type: 'dns', value: domain })),
      },
      true
    );

    if (status !== 201) {
      throw new Error(`Failed to create order: ${JSON.stringify(body)}`);
    }

    return {
      orderUrl: headers.get('location')!,
      status: body.status,
      identifiers: body.identifiers,
      authorizations: body.authorizations,
      finalize: body.finalize,
      certificate: body.certificate,
    };
  }

  /**
   * Get authorization challenges
   */
  async getAuthorization(authUrl: string): Promise<{
    identifier: { type: string; value: string };
    challenges: AcmeChallenge[];
  }> {
    const { body } = await this.acmeRequest(authUrl, '', true);

    const jwk = this.publicKeyToJwk(this.account!.publicKey);
    const thumbprint = this.jwkThumbprint(jwk);

    const challenges = body.challenges.map((ch: any) => ({
      type: ch.type,
      url: ch.url,
      status: ch.status,
      token: ch.token,
      keyAuthorization: `${ch.token}.${thumbprint}`,
    }));

    return {
      identifier: body.identifier,
      challenges,
    };
  }

  /**
   * Get DNS-01 challenge record value
   */
  getDns01ChallengeValue(keyAuthorization: string): string {
    const hash = crypto.createHash('sha256').update(keyAuthorization).digest();
    return this.base64url(hash);
  }

  /**
   * Respond to a challenge
   */
  async respondToChallenge(challengeUrl: string): Promise<void> {
    const { status, body } = await this.acmeRequest(challengeUrl, {}, true);

    if (status !== 200) {
      throw new Error(`Failed to respond to challenge: ${JSON.stringify(body)}`);
    }
  }

  /**
   * Poll for order status
   */
  async pollOrderStatus(orderUrl: string, maxAttempts: number = 30): Promise<AcmeOrder> {
    for (let i = 0; i < maxAttempts; i++) {
      const { body } = await this.acmeRequest(orderUrl, '', true);

      if (body.status === 'valid') {
        return body;
      }

      if (body.status === 'invalid') {
        throw new Error(`Order failed: ${JSON.stringify(body)}`);
      }

      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error('Order polling timeout');
  }

  /**
   * Finalize the order with CSR
   */
  async finalizeOrder(finalizeUrl: string, domains: string[]): Promise<string> {
    // Generate certificate key pair
    const { privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });

    // Create CSR (simplified - in production use a proper CSR library)
    const csr = this.createCsr(privateKey, domains);

    const { status, body } = await this.acmeRequest(
      finalizeUrl,
      { csr: this.base64url(csr) },
      true
    );

    if (status !== 200) {
      throw new Error(`Failed to finalize order: ${JSON.stringify(body)}`);
    }

    return privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  }

  /**
   * Create a basic CSR (Certificate Signing Request)
   */
  private createCsr(privateKey: crypto.KeyObject, domains: string[]): Buffer {
    // This is a simplified CSR creation
    // In production, use a library like node-forge or openssl
    const subject = `/CN=${domains[0]}`;

    // For now, return a placeholder - actual implementation would use
    // proper ASN.1 encoding for CSR
    const sign = crypto.createSign('SHA256');
    sign.update(subject + domains.join(','));
    return sign.sign(privateKey);
  }

  /**
   * Download the certificate
   */
  async downloadCertificate(certificateUrl: string): Promise<string> {
    const response = await fetch(certificateUrl, {
      headers: { Accept: 'application/pem-certificate-chain' },
    });

    if (!response.ok) {
      throw new Error(`Failed to download certificate: ${response.status}`);
    }

    return response.text();
  }

  /**
   * Full certificate issuance flow using DNS-01 challenge
   */
  async issueCertificate(
    domain: string,
    setDnsRecord: (name: string, value: string) => Promise<void>,
    removeDnsRecord: (name: string) => Promise<void>
  ): Promise<CertificateResult> {
    console.log(`[ACME] Starting certificate issuance for ${domain}`);

    // Create order
    const order = await this.createOrder([domain]);
    console.log(`[ACME] Order created: ${order.orderUrl}`);

    // Get authorization
    const auth = await this.getAuthorization(order.authorizations[0]);
    const dnsChallenge = auth.challenges.find(c => c.type === 'dns-01');

    if (!dnsChallenge) {
      throw new Error('DNS-01 challenge not available');
    }

    // Set DNS record
    const recordName = `_acme-challenge.${domain}`;
    const recordValue = this.getDns01ChallengeValue(dnsChallenge.keyAuthorization!);

    console.log(`[ACME] Setting DNS record: ${recordName} = ${recordValue}`);
    await setDnsRecord(recordName, recordValue);

    // Wait for DNS propagation
    await new Promise(resolve => setTimeout(resolve, 10000));

    try {
      // Respond to challenge
      await this.respondToChallenge(dnsChallenge.url);
      console.log(`[ACME] Challenge response sent`);

      // Poll for completion
      const validOrder = await this.pollOrderStatus(order.orderUrl);
      console.log(`[ACME] Order validated`);

      // Finalize and get certificate
      const privateKey = await this.finalizeOrder(order.finalize, [domain]);

      // Poll again for certificate URL
      const finalOrder = await this.pollOrderStatus(order.orderUrl);

      if (!finalOrder.certificate) {
        throw new Error('Certificate URL not available');
      }

      // Download certificate
      const certChain = await this.downloadCertificate(finalOrder.certificate);
      console.log(`[ACME] Certificate downloaded`);

      // Parse certificate chain
      const certs = certChain.split(/(?=-----BEGIN CERTIFICATE-----)/);
      const certificate = certs[0];
      const chain = certs.slice(1).join('');

      // Calculate expiration (Let's Encrypt certs are valid for 90 days)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 90);

      return {
        certificate,
        privateKey,
        chain,
        expiresAt,
      };
    } finally {
      // Clean up DNS record
      await removeDnsRecord(recordName);
    }
  }
}

// Singleton instance
let acmeClient: AcmeClient | null = null;

export function getAcmeClient(): AcmeClient {
  if (!acmeClient) {
    acmeClient = new AcmeClient();
  }
  return acmeClient;
}

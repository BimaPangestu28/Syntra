import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { rateLimiters } from '@/lib/utils/rate-limit';
import {
  handlePingEvent,
  handlePushEvent,
  handlePullRequestEvent,
  type GitHubPingPayload,
  type GitHubPushPayload,
  type GitHubPullRequestPayload,
} from './_helpers';

// GitHub webhook event types we handle
type GitHubEvent = 'push' | 'pull_request' | 'ping';

// Verify GitHub webhook signature
function verifySignature(payload: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;

  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false;
  }
}

// POST /api/webhooks/github - Handle GitHub webhooks
export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();

  // Rate limit webhooks by IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = rateLimiters.webhook(ip);
  if (!rl.success) {
    return NextResponse.json(
      { success: false, error: 'Rate limited', request_id: requestId },
      { status: 429 }
    );
  }

  try {
    const event = req.headers.get('x-github-event') as GitHubEvent | null;
    const signature = req.headers.get('x-hub-signature-256');
    const deliveryId = req.headers.get('x-github-delivery');

    console.log(`[GitHub Webhook] Received event: ${event}, delivery: ${deliveryId}`);

    if (!event) {
      return NextResponse.json(
        { success: false, error: 'Missing x-github-event header', request_id: requestId },
        { status: 400 }
      );
    }

    const rawBody = await req.text();

    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('[GitHub Webhook] GITHUB_WEBHOOK_SECRET is not configured');
      return NextResponse.json(
        { success: false, error: 'Webhook secret not configured', request_id: requestId },
        { status: 500 }
      );
    }

    if (!verifySignature(rawBody, signature, webhookSecret)) {
      console.log('[GitHub Webhook] Invalid signature');
      return NextResponse.json(
        { success: false, error: 'Invalid signature', request_id: requestId },
        { status: 401 }
      );
    }

    const payload = JSON.parse(rawBody);

    if (event === 'ping') {
      return handlePingEvent(payload as GitHubPingPayload, requestId);
    }

    if (event === 'push') {
      return handlePushEvent(payload as GitHubPushPayload, requestId);
    }

    if (event === 'pull_request') {
      return handlePullRequestEvent(payload as GitHubPullRequestPayload, requestId);
    }

    // Unknown event
    return NextResponse.json({
      success: true,
      message: `Event ${event} not handled`,
      request_id: requestId,
    });

  } catch (error) {
    console.error('[GitHub Webhook] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        request_id: requestId
      },
      { status: 500 }
    );
  }
}

// GET /api/webhooks/github - Health check
export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'GitHub webhook endpoint is ready',
    supported_events: ['push', 'ping', 'pull_request'],
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { invoices, organizationMembers } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import crypto from 'crypto';

// Helper to check org access (owner/admin only for billing)
async function checkBillingAccess(
  userId: string,
  orgId: string
): Promise<boolean> {
  const membership = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.orgId, orgId)
    ),
  });
  return membership?.role === 'owner' || membership?.role === 'admin';
}

// GET /api/v1/billing/invoices - Get organization's invoices
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
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (!orgId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'org_id is required', request_id: crypto.randomUUID() } },
        { status: 400 }
      );
    }

    // Check access
    const hasAccess = await checkBillingAccess(session.user.id, orgId);
    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied', request_id: crypto.randomUUID() } },
        { status: 403 }
      );
    }

    const invoiceList = await db.query.invoices.findMany({
      where: eq(invoices.orgId, orgId),
      orderBy: [desc(invoices.createdAt)],
      limit: Math.min(limit, 100),
      offset,
    });

    return NextResponse.json({
      success: true,
      data: invoiceList.map(inv => ({
        id: inv.id,
        stripe_invoice_id: inv.stripeInvoiceId,
        status: inv.status,
        currency: inv.currency,
        subtotal_cents: inv.subtotal,
        tax_cents: inv.tax,
        total_cents: inv.total,
        amount_paid_cents: inv.amountPaid,
        amount_due_cents: inv.amountDue,
        period_start: inv.periodStart?.toISOString(),
        period_end: inv.periodEnd?.toISOString(),
        due_date: inv.dueDate?.toISOString(),
        paid_at: inv.paidAt?.toISOString(),
        invoice_pdf_url: inv.invoicePdfUrl,
        line_items: inv.lineItems,
        created_at: inv.createdAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error('GET /api/v1/billing/invoices error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error', request_id: crypto.randomUUID() } },
      { status: 500 }
    );
  }
}

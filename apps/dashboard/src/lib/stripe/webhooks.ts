import Stripe from 'stripe';
import { db } from '@/lib/db';
import { subscriptions, invoices, organizations } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function handleCheckoutCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  const orgId = session.metadata?.org_id;
  if (!orgId) return;

  const stripeSubscriptionId = session.subscription as string;
  const stripeCustomerId = session.customer as string;

  // Update org with stripe customer ID
  await db
    .update(organizations)
    .set({
      stripeCustomerId,
      stripeSubscriptionId,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  console.log(`[Stripe] Checkout completed for org ${orgId}`);
}

export async function handleInvoicePaid(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const orgId = invoice.subscription_details?.metadata?.org_id;
  if (!orgId) return;

  const existingInvoice = await db.query.invoices.findFirst({
    where: eq(invoices.stripeInvoiceId, invoice.id),
  });

  if (existingInvoice) {
    await db
      .update(invoices)
      .set({
        status: 'paid',
        amountPaid: invoice.amount_paid,
        amountDue: 0,
        paidAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, existingInvoice.id));
  } else {
    await db.insert(invoices).values({
      orgId,
      stripeInvoiceId: invoice.id,
      status: 'paid',
      currency: invoice.currency,
      subtotal: invoice.subtotal,
      tax: invoice.tax ?? 0,
      total: invoice.total,
      amountPaid: invoice.amount_paid,
      amountDue: 0,
      periodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : undefined,
      periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : undefined,
      paidAt: new Date(),
      invoicePdfUrl: invoice.invoice_pdf ?? undefined,
      lineItems: invoice.lines.data.map((line) => ({
        description: line.description || '',
        quantity: line.quantity || 1,
        unit_price: line.unit_amount_excluding_tax ? parseInt(line.unit_amount_excluding_tax) : line.amount,
        total: line.amount,
      })),
    });
  }

  console.log(`[Stripe] Invoice ${invoice.id} paid for org ${orgId}`);
}

export async function handleInvoicePaymentFailed(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;

  const existingInvoice = await db.query.invoices.findFirst({
    where: eq(invoices.stripeInvoiceId, invoice.id),
  });

  if (existingInvoice) {
    await db
      .update(invoices)
      .set({
        status: 'payment_failed',
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, existingInvoice.id));
  }

  console.log(`[Stripe] Invoice ${invoice.id} payment failed`);
}

export async function handleSubscriptionUpdated(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  const orgId = subscription.metadata?.org_id;
  if (!orgId) return;

  const existing = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.stripeSubscriptionId, subscription.id),
  });

  const updateData = {
    status: subscription.status,
    currentPeriodStart: new Date(subscription.current_period_start * 1000),
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    cancelledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(subscriptions)
      .set(updateData)
      .where(eq(subscriptions.id, existing.id));
  }

  console.log(`[Stripe] Subscription ${subscription.id} updated to ${subscription.status}`);
}

export async function handleSubscriptionDeleted(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  const orgId = subscription.metadata?.org_id;
  if (!orgId) return;

  const existing = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.stripeSubscriptionId, subscription.id),
  });

  if (existing) {
    await db
      .update(subscriptions)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, existing.id));
  }

  // Downgrade org to free plan
  await db
    .update(organizations)
    .set({
      plan: 'free',
      stripeSubscriptionId: null,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  console.log(`[Stripe] Subscription ${subscription.id} deleted, org ${orgId} downgraded to free`);
}

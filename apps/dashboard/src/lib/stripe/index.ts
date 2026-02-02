import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY environment variable is not set.');
    }
    _stripe = new Stripe(key, { apiVersion: '2025-02-24.acacia' });
  }
  return _stripe;
}

/**
 * Create a Stripe customer for an organization.
 */
export async function createCustomer(orgName: string, email: string, orgId: string): Promise<string> {
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    name: orgName,
    email,
    metadata: { org_id: orgId },
  });
  return customer.id;
}

/**
 * Create a Stripe Checkout session for upgrading a plan.
 */
export async function createCheckoutSession(options: {
  customerId: string;
  priceId: string;
  orgId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    customer: options.customerId,
    mode: 'subscription',
    line_items: [{ price: options.priceId, quantity: 1 }],
    success_url: options.successUrl,
    cancel_url: options.cancelUrl,
    metadata: { org_id: options.orgId },
    subscription_data: {
      metadata: { org_id: options.orgId },
    },
  });
  return session.url!;
}

/**
 * Create a Stripe Customer Portal session.
 */
export async function createCustomerPortalSession(customerId: string, returnUrl: string): Promise<string> {
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return session.url;
}

/**
 * Cancel a subscription.
 */
export async function cancelSubscription(subscriptionId: string): Promise<void> {
  const stripe = getStripe();
  await stripe.subscriptions.cancel(subscriptionId);
}

/**
 * Update a subscription's plan.
 */
export async function updateSubscription(subscriptionId: string, newPriceId: string): Promise<void> {
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await stripe.subscriptions.update(subscriptionId, {
    items: [{
      id: subscription.items.data[0].id,
      price: newPriceId,
    }],
  });
}

/**
 * Construct and verify a Stripe webhook event.
 */
export function constructWebhookEvent(payload: string | Buffer, sig: string): Stripe.Event {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not set.');
  }
  return stripe.webhooks.constructEvent(payload, sig, webhookSecret);
}

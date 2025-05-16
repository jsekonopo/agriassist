import { type NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe'; // Your initialized Stripe server-side instance
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { PlanId, SubscriptionStatus } from '@/contexts/auth-context';

const relevantEvents = new Set([
  'checkout.session.completed',
  'customer.subscription.created', // Good for initial setup if checkout.session.completed metadata is missed
  'customer.subscription.updated', // Handles upgrades, downgrades, cancellations by user in Stripe portal
  'customer.subscription.deleted', // Handles cancellations
  'invoice.paid',                  // Confirms payment for ongoing subscriptions
  'invoice.payment_failed',        // Handles failed payments
]);

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    console.error('Webhook Error: Missing signature or webhook secret.');
    return NextResponse.json({ error: 'Webhook secret not configured.' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    return NextResponse.json({ error: `Webhook error: ${err.message}` }, { status: 400 });
  }

  if (relevantEvents.has(event.type)) {
    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          if (session.mode === 'subscription' && session.subscription && session.customer) {
            const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
            const customerId = session.customer as string;
            const firebaseUID = session.metadata?.firebaseUID || subscription.metadata?.firebaseUID; // Get UID from session or subscription
            const planId = session.metadata?.planId || subscription.metadata?.planId as PlanId; // Get planId

            if (!firebaseUID) {
                console.error('Webhook Error: Firebase UID not found in session metadata for checkout.session.completed', session.id);
                break;
            }
            if (!planId) {
                console.error('Webhook Error: Plan ID not found in session metadata for checkout.session.completed', session.id);
                break;
            }

            const userDocRef = adminDb.collection('users').doc(firebaseUID);
            await userDocRef.update({
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscription.id,
              selectedPlanId: planId,
              subscriptionStatus: 'active' as SubscriptionStatus,
              subscriptionCurrentPeriodEnd: FieldValue.serverTimestamp(), // Or: Timestamp.fromDate(new Date(subscription.current_period_end * 1000)),
              updatedAt: FieldValue.serverTimestamp(),
            });
            console.log(`Updated user ${firebaseUID} for checkout.session.completed`);
          }
          break;
        }
        case 'customer.subscription.created': { // Often redundant if checkout.session.completed is handled well
          const subscription = event.data.object as Stripe.Subscription;
          const firebaseUID = subscription.metadata?.firebaseUID;
          const planId = subscription.metadata?.planId as PlanId;

          if (!firebaseUID || !planId) {
            console.error('Webhook Error: Missing firebaseUID or planId in customer.subscription.created metadata', subscription.id);
            break;
          }
          const userDocRef = adminDb.collection('users').doc(firebaseUID);
            await userDocRef.update({
              stripeSubscriptionId: subscription.id,
              stripeCustomerId: subscription.customer as string,
              selectedPlanId: planId,
              subscriptionStatus: 'active' as SubscriptionStatus,
              subscriptionCurrentPeriodEnd: FieldValue.serverTimestamp(), // Or: Timestamp.fromDate(new Date(subscription.current_period_end * 1000)),
              updatedAt: FieldValue.serverTimestamp(),
            });
          console.log(`Subscription created for user ${firebaseUID}`);
          break;
        }
        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription;
          const firebaseUID = subscription.metadata?.firebaseUID;
           // Determine new planId, might need to map from Stripe Price ID
          const newPlanId = subscription.metadata?.planId || 
                            (subscription.items.data[0]?.price.id === process.env.STRIPE_PRICE_ID_PRO ? 'pro' : 
                            (subscription.items.data[0]?.price.id === process.env.STRIPE_PRICE_ID_AGRIBUSINESS ? 'agribusiness' : 'free')) as PlanId;

          if (!firebaseUID) {
             console.error('Webhook Error: Missing firebaseUID in customer.subscription.updated metadata', subscription.id);
             break;
          }
          const userDocRef = adminDb.collection('users').doc(firebaseUID);
          await userDocRef.update({
            selectedPlanId: newPlanId,
            subscriptionStatus: subscription.status as SubscriptionStatus, // e.g. 'active', 'past_due', 'canceled'
            stripeSubscriptionId: subscription.id, // ensure it's up to date
            // subscriptionCurrentPeriodEnd: Timestamp.fromDate(new Date(subscription.current_period_end * 1000)),
            updatedAt: FieldValue.serverTimestamp(),
          });
          console.log(`Subscription updated for user ${firebaseUID} to plan ${newPlanId}, status ${subscription.status}`);
          break;
        }
        case 'customer.subscription.deleted': { // Handles cancellations
          const subscription = event.data.object as Stripe.Subscription;
          const firebaseUID = subscription.metadata?.firebaseUID;
          if (!firebaseUID) {
            console.error('Webhook Error: Missing firebaseUID in customer.subscription.deleted metadata', subscription.id);
            break;
          }
          const userDocRef = adminDb.collection('users').doc(firebaseUID);
          await userDocRef.update({
            selectedPlanId: 'free' as PlanId,
            subscriptionStatus: 'cancelled' as SubscriptionStatus,
            // stripeSubscriptionId: null, // Optional: clear the subscription ID or keep for history
            updatedAt: FieldValue.serverTimestamp(),
          });
          console.log(`Subscription deleted for user ${firebaseUID}`);
          break;
        }
        case 'invoice.paid': {
          const invoice = event.data.object as Stripe.Invoice;
          const subscriptionId = invoice.subscription as string;
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const firebaseUID = subscription.metadata?.firebaseUID;

          if (!firebaseUID) {
            console.error('Webhook Error: Missing firebaseUID in invoice.paid (via subscription metadata)', invoice.id);
            break;
          }
          const userDocRef = adminDb.collection('users').doc(firebaseUID);
          await userDocRef.update({
            subscriptionStatus: 'active' as SubscriptionStatus, // Re-activate if they were past_due
            // subscriptionCurrentPeriodEnd: Timestamp.fromDate(new Date(subscription.current_period_end * 1000)),
            updatedAt: FieldValue.serverTimestamp(),
          });
          console.log(`Invoice paid for user ${firebaseUID}`);
          break;
        }
        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          const subscriptionId = invoice.subscription as string;
          if (subscriptionId) { // Only update if related to a subscription
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            const firebaseUID = subscription.metadata?.firebaseUID;

            if (!firebaseUID) {
                console.error('Webhook Error: Missing firebaseUID in invoice.payment_failed (via subscription metadata)', invoice.id);
                break;
            }
            const userDocRef = adminDb.collection('users').doc(firebaseUID);
            await userDocRef.update({
              subscriptionStatus: 'past_due' as SubscriptionStatus, // Or 'unpaid' or 'incomplete'
              updatedAt: FieldValue.serverTimestamp(),
            });
            console.log(`Invoice payment failed for user ${firebaseUID}`);
            // You might want to send an email to the user here.
          }
          break;
        }
        default:
          console.warn(`Webhook Event: Unhandled relevant event type: ${event.type}`);
      }
    } catch (error) {
      console.error('Webhook Error processing event:', event.type, error);
      return NextResponse.json({ error: 'Webhook handler failed. View logs.' }, { status: 500 });
    }
  } else {
    console.log(`Webhook Event: Received irrelevant event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}

// Disable Next.js body parsing for this route, as Stripe needs the raw body
export const config = {
  api: {
    bodyParser: false,
  },
};

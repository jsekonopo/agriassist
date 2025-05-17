
import { type NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe'; // Your initialized Stripe server-side instance
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { PlanId, SubscriptionStatus, User } from '@/contexts/auth-context';

const relevantEvents = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
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
          
          const firebaseUID = session.client_reference_id || session.metadata?.firebaseUID; // Prefer client_reference_id for new registrations
          const planIdFromMetadata = session.metadata?.planId as PlanId; // Get planId from session metadata if present

          if (!firebaseUID) {
            console.error('Webhook Error: Firebase UID not found in session metadata or client_reference_id for checkout.session.completed', session.id);
            break;
          }
          
          if (session.mode === 'subscription' && session.subscription && session.customer) {
            const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
            const customerId = session.customer as string;
            
            const userDocRef = adminDb.collection('users').doc(firebaseUID);
            const userDocSnap = await userDocRef.get();

            if (!userDocSnap.exists()) {
                console.error(`Webhook Error: User document for UID ${firebaseUID} not found during checkout.session.completed.`);
                break;
            }
            const userDataFromDb = userDocSnap.data() as User;
            const planIdToSet = planIdFromMetadata || userDataFromDb.selectedPlanId || 'free'; // Fallback strategy for planId

            const batch = adminDb.batch();

            // Check if this is likely a new registration completion
            if (userDataFromDb.subscriptionStatus === 'pending_payment') {
              // Create farm document if it doesn't exist (idempotency for farm creation)
              const farmDocRef = adminDb.collection('farms').doc(firebaseUID); // Assuming farmId is user's UID for new owner
              const farmDocSnap = await farmDocRef.get();
              if (!farmDocSnap.exists) {
                  batch.set(farmDocRef, {
                      farmId: firebaseUID, // Farm ID is the owner's UID initially
                      farmName: userDataFromDb.farmName || `${userDataFromDb.name || 'User'}'s Farm`,
                      ownerId: firebaseUID,
                      staff: [], // Initialize with empty staff array
                      latitude: null,
                      longitude: null,
                      createdAt: FieldValue.serverTimestamp(),
                      updatedAt: FieldValue.serverTimestamp(),
                  });
              }
              // Update user document to finalize registration
              batch.update(userDocRef, {
                stripeCustomerId: customerId,
                stripeSubscriptionId: subscription.id,
                selectedPlanId: planIdToSet,
                subscriptionStatus: 'active' as SubscriptionStatus,
                farmId: firebaseUID, // User's farmId is their UID if they are the owner
                isFarmOwner: true,
                subscriptionCurrentPeriodEnd: Timestamp.fromDate(new Date(subscription.current_period_end * 1000)),
                updatedAt: FieldValue.serverTimestamp(),
              });
              console.log(`New user registration finalized for ${firebaseUID}, plan ${planIdToSet}. Farm created/confirmed.`);
            } else {
              // Existing user, likely an upgrade/change
              batch.update(userDocRef, {
                stripeCustomerId: customerId,
                stripeSubscriptionId: subscription.id,
                selectedPlanId: planIdToSet,
                subscriptionStatus: 'active' as SubscriptionStatus,
                subscriptionCurrentPeriodEnd: Timestamp.fromDate(new Date(subscription.current_period_end * 1000)),
                updatedAt: FieldValue.serverTimestamp(),
              });
              console.log(`Subscription updated for existing user ${firebaseUID} to plan ${planIdToSet}.`);
            }
            await batch.commit();
          }
          break;
        }
        case 'customer.subscription.created': {
          const subscription = event.data.object as Stripe.Subscription;
          const firebaseUID = subscription.metadata?.firebaseUID;
          const planId = subscription.metadata?.planId as PlanId;

          if (!firebaseUID || !planId) {
            console.error('Webhook Error: Missing firebaseUID or planId in customer.subscription.created metadata', subscription.id);
            break;
          }
          const userDocRef = adminDb.collection('users').doc(firebaseUID);
          // This event might be redundant if checkout.session.completed is well-handled,
          // but can serve as a fallback or for subscriptions created directly in Stripe.
          await userDocRef.update({
            stripeSubscriptionId: subscription.id,
            stripeCustomerId: subscription.customer as string,
            selectedPlanId: planId,
            subscriptionStatus: 'active' as SubscriptionStatus,
            subscriptionCurrentPeriodEnd: Timestamp.fromDate(new Date(subscription.current_period_end * 1000)),
            updatedAt: FieldValue.serverTimestamp(),
          });
          console.log(`Subscription created/confirmed for user ${firebaseUID}`);
          break;
        }
        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription;
          const firebaseUID = subscription.metadata?.firebaseUID;
          const newPlanId = subscription.metadata?.planId || 
                            (subscription.items.data[0]?.price.id === process.env.STRIPE_PRICE_ID_PRO ? 'pro' : 
                            (subscription.items.data[0]?.price.id === process.env.STRIPE_PRICE_ID_AGRIBUSINESS ? 'agribusiness' : 
                            (subscription.status === 'canceled' || subscription.status === 'incomplete_expired' ? 'free' : undefined))) as PlanId | undefined;

          if (!firebaseUID) {
             console.error('Webhook Error: Missing firebaseUID in customer.subscription.updated metadata', subscription.id);
             break;
          }
          const updateData: any = {
            subscriptionStatus: subscription.status as SubscriptionStatus,
            stripeSubscriptionId: subscription.id,
            subscriptionCurrentPeriodEnd: Timestamp.fromDate(new Date(subscription.current_period_end * 1000)),
            updatedAt: FieldValue.serverTimestamp(),
          };
          if (newPlanId) {
            updateData.selectedPlanId = newPlanId;
          }
          const userDocRef = adminDb.collection('users').doc(firebaseUID);
          await userDocRef.update(updateData);
          console.log(`Subscription updated for user ${firebaseUID}${newPlanId ? ` to plan ${newPlanId}` : ''}, status ${subscription.status}`);
          break;
        }
        case 'customer.subscription.deleted': { 
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
            // stripeSubscriptionId: null, // Keep for history or clear based on preference
            updatedAt: FieldValue.serverTimestamp(),
          });
          console.log(`Subscription deleted for user ${firebaseUID}. Plan set to free.`);
          break;
        }
        case 'invoice.paid': {
          const invoice = event.data.object as Stripe.Invoice;
          const subscriptionId = invoice.subscription as string;
          if (!subscriptionId) break; 

          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const firebaseUID = subscription.metadata?.firebaseUID;

          if (!firebaseUID) {
            console.error('Webhook Error: Missing firebaseUID in invoice.paid (via subscription metadata)', invoice.id);
            break;
          }
          const userDocRef = adminDb.collection('users').doc(firebaseUID);
          await userDocRef.update({
            subscriptionStatus: 'active' as SubscriptionStatus,
            subscriptionCurrentPeriodEnd: Timestamp.fromDate(new Date(subscription.current_period_end * 1000)),
            updatedAt: FieldValue.serverTimestamp(),
          });
          console.log(`Invoice paid for user ${firebaseUID}, subscription active.`);
          break;
        }
        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          const subscriptionId = invoice.subscription as string;
          if (subscriptionId) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            const firebaseUID = subscription.metadata?.firebaseUID;

            if (!firebaseUID) {
                console.error('Webhook Error: Missing firebaseUID in invoice.payment_failed (via subscription metadata)', invoice.id);
                break;
            }
            const userDocRef = adminDb.collection('users').doc(firebaseUID);
            await userDocRef.update({
              subscriptionStatus: 'past_due' as SubscriptionStatus,
              updatedAt: FieldValue.serverTimestamp(),
            });
            console.log(`Invoice payment failed for user ${firebaseUID}. Status set to past_due.`);
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

    
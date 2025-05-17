
import { type NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { stripe, getURL } from '@/lib/stripe';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { PlanId, SubscriptionStatus, UserSettings, NotificationPreferences, User } from '@/contexts/auth-context';


async function createStripeCheckoutSession(
    firebaseUID: string, 
    email: string | undefined, 
    name: string | undefined,
    planId: PlanId, 
    existingStripeCustomerId?: string | null
) {
    let stripeCustomerId = existingStripeCustomerId;

    if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
            email: email,
            name: name,
            metadata: { firebaseUID: firebaseUID },
        });
        stripeCustomerId = customer.id;
        // Update user document with the new Stripe Customer ID immediately
        // This is important if the user doc is already partially created
        const userDocRefForStripeId = adminDb.collection('users').doc(firebaseUID);
        // Use set with merge:true to ensure document is created if it doesn't exist yet,
        // or merged if it does (e.g. from the minimal doc creation in initiate-paid-registration)
        await userDocRefForStripeId.set({ stripeCustomerId: stripeCustomerId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }

    let stripePriceId;
    if (planId === 'pro') stripePriceId = process.env.STRIPE_PRICE_ID_PRO;
    else if (planId === 'agribusiness') stripePriceId = process.env.STRIPE_PRICE_ID_AGRIBUSINESS;
    else throw new Error('Invalid paid plan ID for Stripe session.');

    if (!stripePriceId) {
        console.error(`Stripe Price ID for plan "${planId}" is not configured.`);
        throw new Error('Pricing for this plan is not configured.');
    }

    const appBaseUrl = getURL();
    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        customer: stripeCustomerId,
        line_items: [{ price: stripePriceId, quantity: 1 }],
        mode: 'subscription',
        allow_promotion_codes: true,
        subscription_data: {
            metadata: { // Metadata for the subscription object
                firebaseUID: firebaseUID,
                planId: planId,
            }
        },
        // Metadata for the checkout session object itself
        metadata: {
            firebaseUID: firebaseUID, // Redundant but good for access in session object
            planId: planId,
        },
        client_reference_id: firebaseUID, // For linking session back to Firebase UID in webhook
        success_url: `${appBaseUrl}/pricing?payment_success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appBaseUrl}/register?payment_cancelled=true`, 
    });

    if (!session.id) throw new Error('Failed to create Stripe session ID');
    return session.id;
}


export async function POST(request: NextRequest) {
  try {
    const idToken = request.headers.get('Authorization')?.split('Bearer ')[1];
    if (!idToken) {
      return NextResponse.json({ success: false, message: 'Unauthorized: No token provided' }, { status: 401 });
    }

    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (error) {
      console.error('Error verifying ID token:', error);
      return NextResponse.json({ success: false, message: 'Unauthorized: Invalid token' }, { status: 401 });
    }
    const firebaseUID = decodedToken.uid;
    const userEmail = decodedToken.email;
    
    const { planId, name, farmName } = await request.json() as { planId: PlanId, name: string, farmName: string };

    if (!planId || (planId !== 'pro' && planId !== 'agribusiness')) {
      return NextResponse.json({ success: false, message: 'Invalid paid plan ID provided.' }, { status: 400 });
    }
    if (!name || !farmName) {
        return NextResponse.json({ success: false, message: 'Name and Farm Name are required.' }, { status: 400 });
    }

    const userDocRef = adminDb.collection('users').doc(firebaseUID);
    const defaultNotificationPreferences: NotificationPreferences = {
        taskRemindersEmail: true, weatherAlertsEmail: false, aiInsightsEmail: true, staffActivityEmail: false,
    };
    const defaultSettings: UserSettings = {
        notificationPreferences: defaultNotificationPreferences,
        preferredAreaUnit: "acres", preferredWeightUnit: "kg", theme: "system",
    };

    // Create a minimal user document. The webhook will finalize it.
    await userDocRef.set({
        uid: firebaseUID,
        email: userEmail?.toLowerCase(),
        name: name,
        farmName: farmName, // Store farm name for webhook to use when creating farm doc
        selectedPlanId: planId,
        subscriptionStatus: 'pending_payment' as SubscriptionStatus,
        isFarmOwner: false, // Will be set to true by webhook
        farmId: null,       // Will be set by webhook
        settings: defaultSettings,
        onboardingCompleted: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }); // Merge true in case Firebase Auth trigger already created a shell user doc

    // Now create the Stripe Checkout Session
    const sessionId = await createStripeCheckoutSession(firebaseUID, userEmail, name, planId, null);

    return NextResponse.json({ success: true, sessionId: sessionId });

  } catch (error) {
    console.error('Error in /api/auth/initiate-paid-registration:', error);
    const message = error instanceof Error ? error.message : 'Internal server error.';
    return NextResponse.json({ success: false, message: message }, { status: 500 });
  }
}

export { createStripeCheckoutSession };

    
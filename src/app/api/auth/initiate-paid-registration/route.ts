
import { type NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { stripe, getURL } from '@/lib/stripe'; // Assuming getURL is for constructing redirect URLs
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { PlanId, SubscriptionStatus, UserSettings, NotificationPreferences } from '@/contexts/auth-context';

// Reusable utility function to create a Stripe Checkout Session
// This can be shared between this new route and the existing upgrade route
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
            metadata: {
                firebaseUID: firebaseUID,
                planId: planId,
            }
        },
        // Using client_reference_id to pass Firebase UID for easier retrieval in webhook
        client_reference_id: firebaseUID, 
        success_url: `${appBaseUrl}/dashboard?payment_success=true&session_id={CHECKOUT_SESSION_ID}`, // Redirect to dashboard after success
        cancel_url: `${appBaseUrl}/register?payment_cancelled=true`, // Redirect back to register if cancelled
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

    // Create a minimal user document first to store initial details and pending status
    const userDocRef = adminDb.collection('users').doc(firebaseUID);
    const defaultNotificationPreferences: NotificationPreferences = {
        taskRemindersEmail: true, weatherAlertsEmail: false, aiInsightsEmail: true, staffActivityEmail: false,
    };
    const defaultSettings: UserSettings = {
        notificationPreferences: defaultNotificationPreferences,
        preferredAreaUnit: "acres", preferredWeightUnit: "kg", theme: "system",
    };

    await userDocRef.set({
        uid: firebaseUID,
        email: userEmail?.toLowerCase(),
        name: name,
        farmName: farmName, // Store farm name from registration form
        selectedPlanId: planId,
        subscriptionStatus: 'pending_payment' as SubscriptionStatus,
        isFarmOwner: false, // Will be set to true by webhook after successful payment & farm creation
        farmId: null, // Will be set by webhook after successful payment & farm creation
        settings: defaultSettings,
        onboardingCompleted: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }); // Merge true in case a very minimal auth user record exists somehow

    // Now create the Stripe Checkout Session
    const sessionId = await createStripeCheckoutSession(firebaseUID, userEmail, name, planId, null);

    return NextResponse.json({ success: true, sessionId: sessionId });

  } catch (error) {
    console.error('Error in /api/auth/initiate-paid-registration:', error);
    const message = error instanceof Error ? error.message : 'Internal server error.';
    return NextResponse.json({ success: false, message: message }, { status: 500 });
  }
}

// Export the utility function if it's also used by the other checkout session route
export { createStripeCheckoutSession };

    
import { type NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { stripe, getURL } from '@/lib/stripe';
import type { User } from '@/contexts/auth-context'; // Assuming User type is exported

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
    const userId = decodedToken.uid;

    const { planId } = await request.json(); // e.g., "pro", "agribusiness"
    if (!planId || (planId !== 'pro' && planId !== 'agribusiness')) {
      return NextResponse.json({ success: false, message: 'Invalid plan ID provided.' }, { status: 400 });
    }

    // Fetch user data from Firestore to get existing stripeCustomerId if any
    const userDocRef = adminDb.collection('users').doc(userId);
    const userDocSnap = await userDocRef.get();
    if (!userDocSnap.exists) {
      return NextResponse.json({ success: false, message: 'User not found in Firestore.' }, { status: 404 });
    }
    const userData = userDocSnap.data() as User;
    let stripeCustomerId = userData.stripeCustomerId;

    if (!stripeCustomerId) {
      // Create a new Stripe customer
      const customer = await stripe.customers.create({
        email: userData.email!,
        name: userData.name || undefined,
        metadata: {
          firebaseUID: userId,
        },
      });
      stripeCustomerId = customer.id;
      // Update user document with the new Stripe Customer ID
      await userDocRef.update({ stripeCustomerId });
    }

    let stripePriceId;
    if (planId === 'pro') {
      stripePriceId = process.env.STRIPE_PRICE_ID_PRO;
    } else if (planId === 'agribusiness') {
      stripePriceId = process.env.STRIPE_PRICE_ID_AGRIBUSINESS;
    }

    if (!stripePriceId) {
      console.error(`Stripe Price ID for plan "${planId}" is not configured.`);
      return NextResponse.json({ success: false, message: 'Pricing for this plan is not configured.' }, { status: 500 });
    }
    
    const appBaseUrl = getURL();

    // Create a Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer: stripeCustomerId,
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      allow_promotion_codes: true,
      subscription_data: {
        metadata: {
            firebaseUID: userId, // Pass Firebase UID to subscription metadata
            planId: planId,
        }
      },
      success_url: `${appBaseUrl}/profile?session_id={CHECKOUT_SESSION_ID}`, // Or a dedicated success page
      cancel_url: `${appBaseUrl}/pricing`,
    });

    if (!session.id) {
        throw new Error('Failed to create Stripe session ID');
    }

    return NextResponse.json({ success: true, sessionId: session.id });

  } catch (error) {
    console.error('Error creating Stripe Checkout session:', error);
    const message = error instanceof Error ? error.message : 'Internal server error.';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

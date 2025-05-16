import { type NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { stripe } from '@/lib/stripe';
import type { User } from '@/contexts/auth-context';

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

    const userDocRef = adminDb.collection('users').doc(userId);
    const userDocSnap = await userDocRef.get();

    if (!userDocSnap.exists) {
      return NextResponse.json({ success: false, message: 'User not found.' }, { status: 404 });
    }
    const userData = userDocSnap.data() as User;

    if (!userData.stripeSubscriptionId) {
      return NextResponse.json({ success: false, message: 'No active Stripe subscription ID found for this user.' }, { status: 400 });
    }

    // Cancel the subscription in Stripe
    // Stripe will send a 'customer.subscription.deleted' webhook event which should update Firestore.
    await stripe.subscriptions.cancel(userData.stripeSubscriptionId);
    
    // For immediate UI feedback, you might optimistically update Firestore here too,
    // but webhook is the source of truth. For now, we rely on the webhook.
    // Example optimistic update (consider if webhook is delayed):
    // await userDocRef.update({
    //   selectedPlanId: 'free',
    //   subscriptionStatus: 'cancelled',
    //   // stripeSubscriptionId: null, // Or keep it for history, let webhook clear it
    // });

    return NextResponse.json({ success: true, message: 'Subscription cancellation initiated with Stripe. Your plan will be updated shortly.' });

  } catch (error) {
    console.error('Error cancelling Stripe subscription:', error);
    const message = error instanceof Error ? error.message : 'Internal server error.';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

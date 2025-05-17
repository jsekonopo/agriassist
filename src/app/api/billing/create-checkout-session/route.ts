
import { type NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { createStripeCheckoutSession } from '@/app/api/auth/initiate-paid-registration/route'; // Import utility
import type { User, PlanId } from '@/contexts/auth-context'; 

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

    const { planId } = await request.json() as { planId: PlanId };
    if (!planId || (planId !== 'pro' && planId !== 'agribusiness')) {
      return NextResponse.json({ success: false, message: 'Invalid plan ID provided.' }, { status: 400 });
    }

    const userDocRef = adminDb.collection('users').doc(userId);
    const userDocSnap = await userDocRef.get();
    if (!userDocSnap.exists) {
      return NextResponse.json({ success: false, message: 'User not found in Firestore.' }, { status: 404 });
    }
    const userData = userDocSnap.data() as User;
    
    const sessionId = await createStripeCheckoutSession(
        userId, 
        userData.email, 
        userData.name, 
        planId, 
        userData.stripeCustomerId
    );

    return NextResponse.json({ success: true, sessionId: sessionId });

  } catch (error) {
    console.error('Error creating Stripe Checkout session (for existing user):', error);
    const message = error instanceof Error ? error.message : 'Internal server error.';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

    
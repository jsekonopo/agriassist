
import { type NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { invitationId } = body;
    const idToken = request.headers.get('Authorization')?.split('Bearer ')[1];

    if (!idToken) {
      return NextResponse.json({ success: false, message: 'Unauthorized: No token provided' }, { status: 401 });
    }
    if (!invitationId) {
      return NextResponse.json({ success: false, message: 'Missing required field: invitationId' }, { status: 400 });
    }

    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (error) {
      console.error('Error verifying ID token:', error);
      return NextResponse.json({ success: false, message: 'Unauthorized: Invalid token' }, { status: 401 });
    }

    const invitationRef = adminDb.collection('pendingInvitations').doc(invitationId);
    const invitationSnap = await invitationRef.get();

    if (!invitationSnap.exists) {
      return NextResponse.json({ success: false, message: 'Invitation not found.' }, { status: 404 });
    }
    const invitationData = invitationSnap.data()!;

    if (invitationData.invitedUserUid !== decodedToken.uid) {
      return NextResponse.json({ success: false, message: 'Unauthorized: This invitation is not for you.' }, { status: 403 });
    }
    if (invitationData.status !== 'pending') {
      return NextResponse.json({ success: false, message: `Invitation already ${invitationData.status}.` }, { status: 400 });
    }

    await invitationRef.update({ status: 'declined', declinedAt: FieldValue.serverTimestamp() });

    return NextResponse.json({ success: true, message: 'Invitation declined.' });

  } catch (error) {
    console.error('Error in /api/farm/invitations/decline:', error);
    let message = 'Internal server error while declining invitation.';
    if (error instanceof Error) message = error.message;
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

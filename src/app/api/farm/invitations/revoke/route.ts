
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

    // Verify the revoker is the owner of the farm that sent the invite
    const farmRef = adminDb.collection('farms').doc(invitationData.inviterFarmId);
    const farmSnap = await farmRef.get();
    if (!farmSnap.exists || farmSnap.data()?.ownerId !== decodedToken.uid) {
      return NextResponse.json({ success: false, message: 'Unauthorized: You are not the owner of the farm that sent this invitation.' }, { status: 403 });
    }

    if (invitationData.status !== 'pending') {
      return NextResponse.json({ success: false, message: `Cannot revoke invitation, status is already ${invitationData.status}.` }, { status: 400 });
    }

    await invitationRef.update({ status: 'revoked', revokedAt: FieldValue.serverTimestamp(), revokedBy: decodedToken.uid });
    // Alternatively, could delete the invitation: await invitationRef.delete();

    return NextResponse.json({ success: true, message: 'Invitation revoked.' });

  } catch (error) {
    console.error('Error in /api/farm/invitations/revoke:', error);
    let message = 'Internal server error while revoking invitation.';
    if (error instanceof Error) message = error.message;
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

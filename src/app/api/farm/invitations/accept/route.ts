
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

    const batch = adminDb.batch();
    const invitationRef = adminDb.collection('pendingInvitations').doc(invitationId);
    const userRef = adminDb.collection('users').doc(decodedToken.uid);

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

    const farmRef = adminDb.collection('farms').doc(invitationData.inviterFarmId);
    const farmSnap = await farmRef.get();
    if (!farmSnap.exists) {
      // This case should be rare if invite was created correctly
      batch.update(invitationRef, { status: 'error_farm_not_found', updatedAt: FieldValue.serverTimestamp() });
      await batch.commit();
      return NextResponse.json({ success: false, message: 'Farm associated with this invitation no longer exists.' }, { status: 404 });
    }
    
    // Check if user already owns a farm they are not currently associated with for this invite.
    // This is a complex case; for now, we assume if they accept, they are joining this farm.
    // If they previously owned a farm, that farm might become orphaned unless handled.
    // For simplicity, we'll overwrite their farmId and isFarmOwner status.
    // A more robust solution might prevent an active farm owner from accepting a staff invite
    // without first transferring ownership or deleting their current farm.

    // Update invitation status
    batch.update(invitationRef, { status: 'accepted', acceptedAt: FieldValue.serverTimestamp() });

    // Update user's document
    batch.update(userRef, {
      farmId: invitationData.inviterFarmId,
      isFarmOwner: false, // Staff members are not owners of the farm they join
      updatedAt: FieldValue.serverTimestamp()
    });

    // Add user to farm's staffMembers array
    batch.update(farmRef, {
      staffMembers: FieldValue.arrayUnion(decodedToken.uid),
      updatedAt: FieldValue.serverTimestamp()
    });
    
    // If the user was previously an owner of a different farm, that farm is now "orphaned"
    // or needs manual/admin intervention. A more complete system would handle this,
    // possibly by preventing an owner from accepting until their farm is dealt with,
    // or by archiving/marking the old farm.

    await batch.commit();

    return NextResponse.json({ success: true, message: `Invitation to farm ${invitationData.farmName} accepted.` });

  } catch (error) {
    console.error('Error in /api/farm/invitations/accept:', error);
    let message = 'Internal server error while accepting invitation.';
    if (error instanceof Error) message = error.message;
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

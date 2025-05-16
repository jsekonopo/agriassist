
import { type NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { UserRole, StaffMemberInFarmDoc } from '@/contexts/auth-context'; // Import UserRole

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { invitationToken } = body;
    const idToken = request.headers.get('Authorization')?.split('Bearer ')[1];

    if (!idToken) {
      return NextResponse.json({ success: false, message: 'Unauthorized: No token provided.' }, { status: 401 });
    }
    if (!invitationToken) {
      return NextResponse.json({ success: false, message: 'Missing required field: invitationToken.' }, { status: 400 });
    }

    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (error) {
      console.error('Error verifying ID token:', error);
      return NextResponse.json({ success: false, message: 'Unauthorized: Invalid user token.' }, { status: 401 });
    }
    const acceptingUserUid = decodedToken.uid;
    const acceptingUserEmail = decodedToken.email;


    const invitationsQuery = adminDb.collection('pendingInvitations')
      .where('invitationToken', '==', invitationToken)
      .where('status', '==', 'pending')
      .limit(1);

    const invitationSnapshots = await invitationsQuery.get();

    if (invitationSnapshots.empty) {
      return NextResponse.json({ success: false, message: 'Invitation not found, already processed, or invalid token.' }, { status: 404 });
    }
    const invitationDoc = invitationSnapshots.docs[0];
    const invitationData = invitationDoc.data();
    const invitationId = invitationDoc.id;

    if (invitationData.tokenExpiresAt && invitationData.tokenExpiresAt.toMillis() < Timestamp.now().toMillis()) {
      await invitationDoc.ref.update({ status: 'expired', updatedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ success: false, message: 'Invitation has expired.' }, { status: 400 });
    }

    if ( (invitationData.invitedUserUid && invitationData.invitedUserUid !== acceptingUserUid) ||
         (!invitationData.invitedUserUid && invitationData.invitedEmail.toLowerCase() !== acceptingUserEmail?.toLowerCase()) ){
        return NextResponse.json({ success: false, message: 'This invitation is intended for a different user.' }, { status: 403 });
    }

    const batch = adminDb.batch();
    const userRef = adminDb.collection('users').doc(acceptingUserUid);
    const farmRef = adminDb.collection('farms').doc(invitationData.inviterFarmId);

    const farmSnap = await farmRef.get();
    if (!farmSnap.exists) {
      batch.update(invitationDoc.ref, { status: 'error_farm_not_found', updatedAt: FieldValue.serverTimestamp() });
      await batch.commit();
      return NextResponse.json({ success: false, message: 'Farm associated with this invitation no longer exists.' }, { status: 404 });
    }
    const farmData = farmSnap.data();
    
    const acceptingUserDocSnap = await userRef.get();
    if (acceptingUserDocSnap.exists()) {
        const acceptingUserData = acceptingUserDocSnap.data();
        if (acceptingUserData?.farmId === invitationData.inviterFarmId) {
            batch.update(invitationDoc.ref, { status: 'accepted', acceptedAt: FieldValue.serverTimestamp(), acceptedByUid: acceptingUserUid });
            await batch.commit();
            return NextResponse.json({ success: true, message: `You are already a member of ${invitationData.farmName}.` });
        }
        if (acceptingUserData?.isFarmOwner && acceptingUserData?.farmId !== invitationData.inviterFarmId) {
            return NextResponse.json({ success: false, message: 'You are currently an owner of another farm. You cannot join a different farm as staff without addressing your current farm ownership.' }, { status: 400 });
        }
    }

    const invitedRole = invitationData.invitedRole as UserRole || 'viewer'; // Default to 'viewer' if not set

    batch.update(invitationDoc.ref, { 
        status: 'accepted', 
        acceptedAt: FieldValue.serverTimestamp(),
        acceptedByUid: acceptingUserUid,
        ...(invitationData.invitedUserUid === null && { invitedUserUid: acceptingUserUid })
    });

    batch.update(userRef, {
      farmId: invitationData.inviterFarmId,
      farmName: invitationData.farmName,
      isFarmOwner: false,
      roleOnCurrentFarm: invitedRole, // Set the user's role on this farm
      updatedAt: FieldValue.serverTimestamp()
    });

    // Add user to farm's staff array as an object { uid, role }
    const newStaffMember: StaffMemberInFarmDoc = { uid: acceptingUserUid, role: invitedRole };
    batch.update(farmRef, {
      staff: FieldValue.arrayUnion(newStaffMember),
      updatedAt: FieldValue.serverTimestamp()
    });
    
    await batch.commit();

    return NextResponse.json({ success: true, message: `Invitation to join farm "${invitationData.farmName}" as a ${invitedRole} accepted successfully!` });

  } catch (error) {
    console.error('Error in /api/farm/invitations/process-token:', error);
    let message = 'Internal server error while processing invitation token.';
    if (error instanceof Error) message = error.message;
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

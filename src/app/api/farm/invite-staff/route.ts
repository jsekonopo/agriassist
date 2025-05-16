
import { type NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { invitedEmail, inviterUid, inviterFarmId } = body;
    const idToken = request.headers.get('Authorization')?.split('Bearer ')[1];

    if (!idToken) {
      return NextResponse.json({ success: false, message: 'Unauthorized: No token provided' }, { status: 401 });
    }

    if (!invitedEmail || !inviterUid || !inviterFarmId) {
      return NextResponse.json({ success: false, message: 'Missing required fields: invitedEmail, inviterUid, inviterFarmId' }, { status: 400 });
    }

    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (error) {
      console.error('Error verifying ID token:', error);
      return NextResponse.json({ success: false, message: 'Unauthorized: Invalid token' }, { status: 401 });
    }

    if (decodedToken.uid !== inviterUid) {
      return NextResponse.json({ success: false, message: 'Unauthorized: Token UID does not match inviter UID' }, { status: 403 });
    }

    // Verify inviter is the owner of the farm
    const farmDocRef = adminDb.collection('farms').doc(inviterFarmId);
    const farmDocSnap = await farmDocRef.get();

    if (!farmDocSnap.exists) {
      return NextResponse.json({ success: false, message: 'Farm not found.' }, { status: 404 });
    }
    const farmData = farmDocSnap.data();
    if (farmData?.ownerId !== inviterUid) {
      return NextResponse.json({ success: false, message: 'Unauthorized: Inviter is not the owner of this farm.' }, { status: 403 });
    }
    
    if (invitedEmail.toLowerCase() === decodedToken.email?.toLowerCase()) {
        return NextResponse.json({ success: false, message: "You cannot invite yourself to your own farm." }, { status: 400 });
    }

    // Find the user to be invited by email
    let invitedUserRecord;
    try {
      invitedUserRecord = await adminAuth.getUserByEmail(invitedEmail);
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        return NextResponse.json({ success: false, message: `User with email ${invitedEmail} not found. They must have an AgriAssist account to be invited.` }, { status: 404 });
      }
      console.error('Error fetching user by email:', error);
      return NextResponse.json({ success: false, message: 'Error finding user to invite.' }, { status: 500 });
    }

    const invitedUserDocRef = adminDb.collection('users').doc(invitedUserRecord.uid);
    const invitedUserDocSnap = await invitedUserDocRef.get();

    if (!invitedUserDocSnap.exists) {
        // This case should ideally not happen if an auth record exists, but good to check.
        return NextResponse.json({ success: false, message: `User profile for ${invitedEmail} not found in database.` }, { status: 404 });
    }
    const invitedUserData = invitedUserDocSnap.data();

    if (invitedUserData?.farmId === inviterFarmId) {
        return NextResponse.json({ success: false, message: `${invitedEmail} is already a member of this farm.` }, { status: 400 });
    }
    if (invitedUserData?.isFarmOwner) {
        // Check if they are an owner of *any* farm.
        // You might allow inviting an owner if they are to be *removed* from their current farm first,
        // but that's a more complex flow. For now, prevent inviting existing owners.
        return NextResponse.json({ success: false, message: `${invitedEmail} is currently an owner of another farm and cannot be invited as staff. They would need to transfer ownership or delete their current farm first.` }, { status: 400 });
    }

    // Check for existing pending invitation for this user to this farm
    const pendingInvitesQuery = adminDb.collection('pendingInvitations')
        .where('inviterFarmId', '==', inviterFarmId)
        .where('invitedUserUid', '==', invitedUserRecord.uid)
        .where('status', '==', 'pending');
    const pendingInvitesSnap = await pendingInvitesQuery.get();
    if (!pendingInvitesSnap.empty) {
        return NextResponse.json({ success: false, message: `An invitation for ${invitedEmail} to this farm is already pending.` }, { status: 400 });
    }


    // Create a pending invitation record
    const pendingInvitationRef = adminDb.collection('pendingInvitations').doc(); // Auto-generate ID
    await pendingInvitationRef.set({
      inviterFarmId: inviterFarmId,
      inviterUid: inviterUid, // Owner who sent the invite
      inviterName: farmData?.ownerName || decodedToken.name || 'Farm Owner', // Store inviter's name for the invite
      farmName: farmData?.farmName || 'Unnamed Farm', // Store farm name for the invite
      invitedEmail: invitedEmail.toLowerCase(),
      invitedUserUid: invitedUserRecord.uid,
      status: 'pending', // 'pending', 'accepted', 'declined', 'expired'
      createdAt: FieldValue.serverTimestamp(),
      // expiresAt: FieldValue.serverTimestamp() + SOME_EXPIRATION_DURATION // Optional: for expiring invites
    });

    // In a real system, an email would be sent here.
    // For now, this API route logs the pending invite. The client shows a generic success message.

    return NextResponse.json({ 
        success: true, 
        message: `Invitation request for ${invitedEmail} to farm ${farmData?.farmName || inviterFarmId} has been logged. The user will need to accept this invitation (feature to be implemented).` 
    });

  } catch (error) {
    console.error('Error in /api/farm/invite-staff:', error);
    return NextResponse.json({ success: false, message: 'Internal server error while processing invitation.' }, { status: 500 });
  }
}

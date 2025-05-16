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
    if (farmDocSnap.data()?.ownerId !== inviterUid) {
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
        return NextResponse.json({ success: false, message: `User with email ${invitedEmail} not found. They must have an AgriAssist account.` }, { status: 404 });
      }
      console.error('Error fetching user by email:', error);
      return NextResponse.json({ success: false, message: 'Error finding user to invite.' }, { status: 500 });
    }

    const invitedUserDocRef = adminDb.collection('users').doc(invitedUserRecord.uid);
    const invitedUserDocSnap = await invitedUserDocRef.get();

    if (!invitedUserDocSnap.exists) {
        return NextResponse.json({ success: false, message: `User profile for ${invitedEmail} not found in database.` }, { status: 404 });
    }
    const invitedUserData = invitedUserDocSnap.data();
    if (invitedUserData?.farmId === inviterFarmId) {
        return NextResponse.json({ success: false, message: `${invitedEmail} is already a member of this farm.` }, { status: 400 });
    }
    if (invitedUserData?.isFarmOwner) {
        return NextResponse.json({ success: false, message: `${invitedEmail} is an owner of another farm and cannot be invited as staff.` }, { status: 400 });
    }

    // Create a pending invitation record (example structure)
    // In a real system, an email would be sent here.
    const pendingInvitationRef = adminDb.collection('pendingInvitations').doc(); // Auto-generate ID
    await pendingInvitationRef.set({
      inviterFarmId: inviterFarmId,
      inviterUid: inviterUid,
      invitedEmail: invitedEmail.toLowerCase(),
      invitedUserUid: invitedUserRecord.uid, // Store UID for easier lookup on acceptance
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      // expiresAt: // Optionally set an expiration for the invite
    });

    // For now, we'll skip the email and direct Firestore updates for the invited user
    // That would happen upon "acceptance" of the (currently unsent) email invitation.
    // This API route's job is primarily to log the pending invite.

    return NextResponse.json({ 
        success: true, 
        message: `Invitation request for ${invitedEmail} to farm ${farmDocSnap.data()?.farmName || inviterFarmId} has been logged. A real system would now send an email.` 
    });

  } catch (error) {
    console.error('Error in /api/farm/invite-staff:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}


import { type NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import StaffInvitationEmail from '@/emails/staff-invitation-email'; // Adjust path as necessary

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002'; // Define your app's base URL

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { invitedEmail } = body; // inviterFarmId will be derived from token
    const idToken = request.headers.get('Authorization')?.split('Bearer ')[1];

    if (!idToken) {
      return NextResponse.json({ success: false, message: 'Unauthorized: No token provided' }, { status: 401 });
    }
    if (!invitedEmail) {
      return NextResponse.json({ success: false, message: 'Missing required field: invitedEmail' }, { status: 400 });
    }

    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (error) {
      console.error('Error verifying ID token:', error);
      return NextResponse.json({ success: false, message: 'Unauthorized: Invalid token' }, { status: 401 });
    }
    const inviterUid = decodedToken.uid;

    // Fetch inviter's user document to get their farmId
    const inviterUserDocRef = adminDb.collection('users').doc(inviterUid);
    const inviterUserDocSnap = await inviterUserDocRef.get();

    if (!inviterUserDocSnap.exists) {
        return NextResponse.json({ success: false, message: 'Inviter user profile not found.' }, { status: 404 });
    }
    const inviterUserData = inviterUserDocSnap.data();
    if (!inviterUserData?.farmId || !inviterUserData?.isFarmOwner) {
        return NextResponse.json({ success: false, message: 'Unauthorized: Inviter is not a farm owner or not associated with a farm.' }, { status: 403 });
    }
    const inviterFarmId = inviterUserData.farmId;
    const inviterName = inviterUserData.name || 'A farm owner';


    // Verify inviter is the owner of the farm they are inviting to
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

    let invitedUserRecord;
    try {
      invitedUserRecord = await adminAuth.getUserByEmail(invitedEmail);
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        // User doesn't exist yet. Log invitation; they can sign up & then accept.
        // For now, we'll proceed to log the invite. A more robust flow might send a different email.
      } else {
        console.error('Error fetching user by email:', error);
        return NextResponse.json({ success: false, message: 'Error finding user to invite.' }, { status: 500 });
      }
    }
    
    // If user record exists, perform additional checks
    if (invitedUserRecord) {
        const invitedUserDocRef = adminDb.collection('users').doc(invitedUserRecord.uid);
        const invitedUserDocSnap = await invitedUserDocRef.get();

        if (invitedUserDocSnap.exists()) {
            const invitedUserData = invitedUserDocSnap.data();
            if (invitedUserData?.farmId === inviterFarmId) {
                return NextResponse.json({ success: false, message: `${invitedEmail} is already a member of this farm.` }, { status: 400 });
            }
            // Relaxing the "cannot invite an owner" rule for now, as accepting an invite makes them staff.
            // if (invitedUserData?.isFarmOwner) {
            //     return NextResponse.json({ success: false, message: `${invitedEmail} is currently an owner of another farm and cannot be invited as staff.` }, { status: 400 });
            // }
        }
    }

    const pendingInvitesQuery = adminDb.collection('pendingInvitations')
        .where('inviterFarmId', '==', inviterFarmId)
        .where('invitedEmail', '==', invitedEmail.toLowerCase()) // Query by invitedEmail
        .where('status', '==', 'pending');
    const pendingInvitesSnap = await pendingInvitesQuery.get();

    if (!pendingInvitesSnap.empty) {
        return NextResponse.json({ success: false, message: `An invitation for ${invitedEmail} to this farm is already pending.` }, { status: 400 });
    }

    const pendingInvitationRef = adminDb.collection('pendingInvitations').doc();
    await pendingInvitationRef.set({
      inviterFarmId: inviterFarmId,
      inviterUid: inviterUid,
      inviterName: inviterName,
      farmName: farmData?.farmName || 'Unnamed Farm',
      invitedEmail: invitedEmail.toLowerCase(),
      invitedUserUid: invitedUserRecord?.uid || null, // Store UID if user exists, null otherwise
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
    });

    // Send invitation email
    if (resend && process.env.RESEND_FROM_EMAIL) {
      try {
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL,
          to: [invitedEmail],
          subject: `You're invited to join ${farmData?.farmName || 'a farm'} on AgriAssist!`,
          react: StaffInvitationEmail({ 
            invitedUserEmail: invitedEmail,
            inviterName: inviterName,
            farmName: farmData?.farmName || 'Unnamed Farm',
            appName: 'AgriAssist',
            invitationLink: `${appBaseUrl}/profile` 
          }) as React.ReactElement,
        });
      } catch (emailError) {
        console.error('Resend API Error (invitation email):', emailError);
        // Don't fail the whole request if email fails, but log it.
        // The invitation is still logged in Firestore.
        return NextResponse.json({ 
            success: true, // Invitation logged, but email failed
            message: `Invitation request for ${invitedEmail} has been logged. However, there was an issue sending the invitation email.`,
            invitationId: pendingInvitationRef.id
        });
      }
    } else {
      console.warn('Resend API key or FROM_EMAIL not configured. Invitation email not sent.');
    }

    return NextResponse.json({ 
        success: true, 
        message: `Invitation request for ${invitedEmail} to farm ${farmData?.farmName || inviterFarmId} has been logged and an email sent.`,
        invitationId: pendingInvitationRef.id
    });

  } catch (error) {
    console.error('Error in /api/farm/invite-staff:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error while processing invitation.';
    return NextResponse.json({ success: false, message: errorMessage }, { status: 500 });
  }
}

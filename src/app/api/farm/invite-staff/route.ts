
import { type NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import StaffInvitationEmail from '@/emails/staff-invitation-email';
import crypto from 'crypto';
import type { UserRole } from '@/contexts/auth-context'; // Import UserRole

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { invitedEmail, role } = body; // Expect role from client
    const idToken = request.headers.get('Authorization')?.split('Bearer ')[1];

    if (!idToken) {
      return NextResponse.json({ success: false, message: 'Unauthorized: No token provided' }, { status: 401 });
    }
    if (!invitedEmail || !role) { // Check for role
      return NextResponse.json({ success: false, message: 'Missing required fields: invitedEmail and role' }, { status: 400 });
    }
    const validRoles: UserRole[] = ['admin', 'editor', 'viewer'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ success: false, message: 'Invalid role provided.' }, { status: 400 });
    }


    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (error) {
      console.error('Error verifying ID token:', error);
      return NextResponse.json({ success: false, message: 'Unauthorized: Invalid token' }, { status: 401 });
    }
    const inviterUid = decodedToken.uid;

    const inviterUserDocRef = adminDb.collection('users').doc(inviterUid);
    const inviterUserDocSnap = await inviterUserDocRef.get();

    if (!inviterUserDocSnap.exists()) {
      return NextResponse.json({ success: false, message: 'Inviter user profile not found.' }, { status: 404 });
    }
    const inviterUserData = inviterUserDocSnap.data();
    if (!inviterUserData?.farmId || !inviterUserData?.isFarmOwner) {
      return NextResponse.json({ success: false, message: 'Unauthorized: Inviter is not a farm owner or not associated with a farm.' }, { status: 403 });
    }
    const inviterFarmId = inviterUserData.farmId;
    const inviterName = inviterUserData.name || 'A farm owner';

    const farmDocRef = adminDb.collection('farms').doc(inviterFarmId);
    const farmDocSnap = await farmDocRef.get();

    if (!farmDocSnap.exists()) {
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
    let invitedUserUidFromAuth: string | null = null;
    try {
      invitedUserRecord = await adminAuth.getUserByEmail(invitedEmail);
      invitedUserUidFromAuth = invitedUserRecord.uid;
      const invitedUserDocRef = adminDb.collection('users').doc(invitedUserRecord.uid);
      const invitedUserDocSnap = await invitedUserDocRef.get();
      if (invitedUserDocSnap.exists()) {
        const invitedUserData = invitedUserDocSnap.data();
        // Check if user is part of the farm's staff array
        const farmStaff = (farmData?.staff || []) as {uid: string, role: string}[];
        if (farmStaff.some(staff => staff.uid === invitedUserRecord.uid)) {
           return NextResponse.json({ success: false, message: `${invitedEmail} is already a member of this farm.` }, { status: 400 });
        }
        if (invitedUserData?.isFarmOwner && invitedUserData?.farmId !== inviterFarmId) {
          return NextResponse.json({ success: false, message: `${invitedEmail} is an owner of another farm. They cannot be invited as staff.` }, { status: 400 });
        }
      }
    } catch (error: any) {
      if (error.code !== 'auth/user-not-found') {
        console.error('Error fetching user by email:', error);
        return NextResponse.json({ success: false, message: 'Error finding user to invite.' }, { status: 500 });
      }
    }
    
    const pendingInvitesQuery = adminDb.collection('pendingInvitations')
      .where('inviterFarmId', '==', inviterFarmId)
      .where('invitedEmail', '==', invitedEmail.toLowerCase())
      .where('status', '==', 'pending');
    const pendingInvitesSnap = await pendingInvitesQuery.get();

    if (!pendingInvitesSnap.empty) {
      return NextResponse.json({ success: false, message: `An invitation for ${invitedEmail} to this farm is already pending.` }, { status: 400 });
    }

    const invitationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiresAt = Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000); 

    const pendingInvitationRef = adminDb.collection('pendingInvitations').doc();
    await pendingInvitationRef.set({
      inviterFarmId: inviterFarmId,
      inviterUid: inviterUid,
      inviterName: inviterName,
      farmName: farmData?.farmName || 'Unnamed Farm',
      invitedEmail: invitedEmail.toLowerCase(),
      invitedUserUid: invitedUserUidFromAuth,
      invitedRole: role, // Store the role for the invitation
      status: 'pending',
      invitationToken: invitationToken,
      tokenExpiresAt: tokenExpiresAt,
      createdAt: FieldValue.serverTimestamp(),
    });

    const invitationLink = `${appBaseUrl}/accept-invitation?token=${invitationToken}`;

    if (resend && process.env.RESEND_FROM_EMAIL) {
      try {
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL,
          to: [invitedEmail],
          subject: `You're invited to join ${farmData?.farmName || 'a farm'} on AgriAssist as a ${role}!`,
          react: StaffInvitationEmail({ 
            invitedUserEmail: invitedEmail,
            inviterName: inviterName,
            farmName: farmData?.farmName || 'Unnamed Farm',
            appName: 'AgriAssist',
            invitationLink: invitationLink,
            role: role // Pass role to email template
          }) as React.ReactElement,
        });
      } catch (emailError) {
        console.error('Resend API Error (invitation email):', emailError);
        return NextResponse.json({ 
            success: true, 
            message: `Invitation request for ${invitedEmail} (as ${role}) has been logged. However, there was an issue sending the invitation email.`,
            invitationId: pendingInvitationRef.id
        });
      }
    } else {
      console.warn('Resend API key or FROM_EMAIL not configured. Invitation email not sent.');
    }

    return NextResponse.json({ 
        success: true, 
        message: `Invitation request for ${invitedEmail} (as ${role}) to farm ${farmData?.farmName || inviterFarmId} has been logged and an email sent.`,
        invitationId: pendingInvitationRef.id
    });

  } catch (error) {
    console.error('Error in /api/farm/invite-staff:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error while processing invitation.';
    return NextResponse.json({ success: false, message: errorMessage }, { status: 500 });
  }
}


import { type NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { UserRole, StaffMemberInFarmDoc, User, NotificationPreferences } from '@/contexts/auth-context'; // Import UserRole
import { Resend } from 'resend';
import GeneralNotificationEmail from '@/emails/general-notification-email';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const appName = 'AgriAssist';
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002'; 
const fromEmail = process.env.RESEND_FROM_EMAIL || `AgriAssist Notifications <notifications@${new URL(appUrl).hostname || 'agriassist.app'}>`;


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
        const acceptingUserData = acceptingUserDocSnap.data() as User;
        if (acceptingUserData?.farmId === invitationData.inviterFarmId) {
            // User is already part of this farm, just mark invite as accepted
            batch.update(invitationDoc.ref, { status: 'accepted', acceptedAt: FieldValue.serverTimestamp(), acceptedByUid: acceptingUserUid });
            await batch.commit();
            return NextResponse.json({ success: true, message: `You are already a member of ${farmData?.farmName || 'this farm'}.` });
        }
        if (acceptingUserData?.isFarmOwner && acceptingUserData?.farmId !== invitationData.inviterFarmId) {
            return NextResponse.json({ success: false, message: 'You are currently an owner of another farm. You cannot join a different farm as staff without addressing your current farm ownership.' }, { status: 400 });
        }
    }

    const invitedRole = invitationData.invitedRole as StaffRole || 'viewer'; 

    batch.update(invitationDoc.ref, { 
        status: 'accepted', 
        acceptedAt: FieldValue.serverTimestamp(),
        acceptedByUid: acceptingUserUid,
        ...(invitationData.invitedUserUid === null && { invitedUserUid: acceptingUserUid }) // Set invitedUserUid if it was null (email-only invite)
    });

    // Ensure user document exists before attempting to update it, or create it minimally if it doesn't
    // This scenario should be rare if user had to log in to accept, meaning their user doc was created by Firebase Auth trigger or registration.
    const userUpdateData: Partial<User> = {
        farmId: invitationData.inviterFarmId,
        farmName: farmData?.farmName || 'Unnamed Farm', 
        isFarmOwner: false,
        roleOnCurrentFarm: invitedRole, 
        updatedAt: FieldValue.serverTimestamp()
    };
    batch.set(userRef, userUpdateData, { merge: true });


    const newStaffMember: StaffMemberInFarmDoc = { uid: acceptingUserUid, role: invitedRole };
    batch.update(farmRef, {
      staff: FieldValue.arrayUnion(newStaffMember), // Use arrayUnion to add the staff member object
      updatedAt: FieldValue.serverTimestamp()
    });
    
    await batch.commit();

    // Send notification to farm owner
    const ownerId = farmData?.ownerId;
    if (ownerId) {
      try {
        const ownerDocRef = adminDb.collection('users').doc(ownerId);
        const ownerDocSnap = await ownerDocRef.get();
        if (ownerDocSnap.exists()) {
          const ownerData = ownerDocSnap.data() as User;
          const ownerEmail = ownerData.email;
          const ownerPrefs = ownerData.settings?.notificationPreferences;

          const notificationTitle = "Staff Invitation Accepted";
          const notificationMessage = `${acceptingUserEmail || 'A new user'} has accepted your invitation to join farm "${farmData?.farmName || 'your farm'}" as a ${invitedRole}.`;
          
          const newNotificationRef = adminDb.collection('notifications').doc();
          await newNotificationRef.set({
            id: newNotificationRef.id,
            userId: ownerId,
            farmId: invitationData.inviterFarmId,
            type: 'staff_invite_accepted', 
            title: notificationTitle,
            message: notificationMessage,
            link: '/profile', 
            isRead: false,
            createdAt: FieldValue.serverTimestamp(),
            readAt: null,
          });

          if (resend && fromEmail && ownerEmail && ownerPrefs?.staffActivityEmail) {
            const emailActionLink = `${appUrl}/profile`;
            await resend.emails.send({
              from: fromEmail,
              to: [ownerEmail],
              subject: `${appName} Notification: ${notificationTitle}`,
              react: GeneralNotificationEmail({
                notificationTitle: notificationTitle,
                notificationMessage: notificationMessage,
                actionLink: emailActionLink,
                actionText: "View Farm Staff",
                appName: appName,
                appUrl: appUrl,
                recipientName: ownerData.name,
              }) as React.ReactElement,
            });
            console.log(`Staff acceptance notification email sent to owner ${ownerEmail}`);
          }
        }
      } catch (notifError) {
        console.error("Error sending staff acceptance notification to owner:", notifError);
      }
    }

    return NextResponse.json({ success: true, message: `Invitation to join farm "${farmData?.farmName || 'Unnamed Farm'}" as a ${invitedRole} accepted successfully!` });

  } catch (error) {
    console.error('Error in /api/farm/invitations/process-token:', error);
    let message = 'Internal server error while processing invitation token.';
    if (error instanceof Error) message = error.message;
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}


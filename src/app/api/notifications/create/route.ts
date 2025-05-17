
import { type NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import GeneralNotificationEmail from '@/emails/general-notification-email'; // Ensure this path is correct
import type { NotificationPreferences, User } from '@/contexts/auth-context'; // Correctly import User type

interface CreateNotificationBody {
  userId: string; 
  title: string;
  message: string;
  type: string; 
  link?: string;
  farmId?: string; 
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const appName = 'AgriAssist';
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002';
const fromEmail = process.env.RESEND_FROM_EMAIL || `AgriAssist <onboarding@resend.dev>`;


export async function POST(request: NextRequest) {
  try {
    // This API route should ideally be protected, e.g., by an API key or service account auth if called by other backend services.
    // For now, if an ID token is provided by a client (e.g., an admin user triggering a notification for another user), verify it.
    // If no token, assume it's a trusted backend call for now (this part needs hardening for production).
    const idToken = request.headers.get('Authorization')?.split('Bearer ')[1];
    if (idToken) {
        try {
            await adminAuth.verifyIdToken(idToken);
            // Potentially check if the authenticated user (if any) has permissions to create notifications
        } catch (error) {
            console.error('Error verifying ID token for notification creation:', error);
            return NextResponse.json({ success: false, message: 'Unauthorized: Invalid token from caller' }, { status: 401 });
        }
    } else {
        // For now, allow calls without ID token, assuming it's from a trusted backend source.
        // In production, you'd want a more secure mechanism for backend-to-backend calls.
        console.warn("Notification creation attempt without ID token. Assuming trusted caller.");
    }
    
    const body = await request.json() as CreateNotificationBody;

    if (!body.userId || !body.title || !body.message || !body.type) {
      return NextResponse.json({ success: false, message: 'Missing required fields: userId, title, message, type.' }, { status: 400 });
    }

    const newNotificationRef = adminDb.collection('notifications').doc();
    const notificationData = {
      id: newNotificationRef.id,
      userId: body.userId,
      title: body.title,
      message: body.message,
      type: body.type,
      link: body.link || null,
      farmId: body.farmId || null,
      isRead: false,
      createdAt: FieldValue.serverTimestamp(), // Firestore server timestamp
      readAt: null,
    };

    await newNotificationRef.set(notificationData);

    // Fetch recipient user's preferences for email notification
    let shouldSendEmail = false;
    let recipientEmail: string | undefined = undefined;
    let recipientName: string | undefined = undefined;

    try {
        const userDocRef = adminDb.collection('users').doc(body.userId);
        const userDocSnap = await userDocRef.get();
        if (userDocSnap.exists) {
            const userData = userDocSnap.data() as User; // Use the imported User type
            recipientEmail = userData.email || undefined;
            recipientName = userData.name || undefined;
            const prefs = userData.settings?.notificationPreferences;

            if (prefs && recipientEmail) {
                switch (body.type.toLowerCase()) { // Standardize type checking
                    case 'task_reminder':
                        if (prefs.taskRemindersEmail) shouldSendEmail = true;
                        break;
                    case 'ai_insight':
                    case 'proactive_insight':
                        if (prefs.aiInsightsEmail) shouldSendEmail = true; // Assuming one preference for all AI insights
                        break;
                    case 'weather_alert':
                        if (prefs.weatherAlertsEmail) shouldSendEmail = true;
                        break;
                    case 'staff_activity': // Example for future staff related notifications
                    case 'staff_invite_accepted':
                         if (prefs.staffActivityEmail) shouldSendEmail = true;
                         break;
                    // Add other cases as notification types grow
                }
            }
        } else {
            console.warn(`User ${body.userId} not found for email notification. Notification created in Firestore only.`);
        }
    } catch (userFetchError) {
        console.error(`Error fetching user ${body.userId} for notification preferences:`, userFetchError);
        // Proceed with Firestore notification, email sending will be skipped
    }

    if (shouldSendEmail && resend && fromEmail && recipientEmail) {
        try {
            const emailActionLink = body.link ? (body.link.startsWith('http') ? body.link : `${appUrl}${body.link}`) : undefined;
            await resend.emails.send({
                from: fromEmail,
                to: [recipientEmail],
                subject: `${appName} Notification: ${body.title}`,
                react: GeneralNotificationEmail({
                    notificationTitle: body.title,
                    notificationMessage: body.message,
                    actionLink: emailActionLink,
                    actionText: body.link ? "View Details" : undefined,
                    appName: appName,
                    appUrl: appUrl,
                    recipientName: recipientName,
                }) as React.ReactElement,
            });
            console.log(`Email notification sent to ${recipientEmail} for type ${body.type}`);
        } catch (emailError) {
            console.error('Resend API Error sending notification email:', emailError);
            // Don't fail the whole request if email sending fails, Firestore notif is still created
        }
    } else if (shouldSendEmail) {
        console.warn(`Could not send email for notification type ${body.type} to user ${body.userId}. Resend configured: ${!!resend}, FromEmail: ${!!fromEmail}, RecipientEmail: ${!!recipientEmail}`);
    }


    return NextResponse.json({ success: true, message: 'Notification created successfully.', notificationId: newNotificationRef.id });

  } catch (error) {
    console.error('Error in /api/notifications/create:', error);
    const message = error instanceof Error ? error.message : 'Internal server error.';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

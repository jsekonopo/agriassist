
import { type NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import GeneralNotificationEmail from '@/emails/general-notification-email'; 
import type { NotificationPreferences, User } from '@/contexts/auth-context'; 

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
// Using a more generic from address if RESEND_FROM_EMAIL is not set, but still recommend setting it.
const fromEmail = process.env.RESEND_FROM_EMAIL || `AgriAssist Notifications <notifications@${new URL(appUrl).hostname || 'agriassist.app'}>`;


export async function POST(request: NextRequest) {
  try {
    const idToken = request.headers.get('Authorization')?.split('Bearer ')[1];
    let callingUid: string | null = null; // UID of the user *making* the API request
    if (idToken) {
        try {
            const decodedToken = await adminAuth.verifyIdToken(idToken);
            callingUid = decodedToken.uid;
        } catch (error) {
            // This might be a system-generated notification (e.g., from a future cron job or another backend service)
            // For now, if no token, or invalid, we proceed but log it.
            // Critical notifications should ideally have some form of auth/secret if not user-triggered.
            console.warn('Warning: Invalid or missing token for notification creation:', error instanceof Error ? error.message : String(error));
        }
    } else {
        console.warn("Notification creation attempt without ID token. Assumed to be a trusted backend call if not user-initiated.");
    }
    
    const body = await request.json() as CreateNotificationBody;

    if (!body.userId || !body.title || !body.message || !body.type) {
      return NextResponse.json({ success: false, message: 'Missing required fields: userId, title, message, type.' }, { status: 400 });
    }

    // For user-triggered notifications, ensure the callingUid matches the body.userId if it's a self-notification,
    // or that the callingUid has permissions to create notifications for body.userId (e.g. an admin for a staff member).
    // This logic can be expanded. For now, if callingUid exists, we'll log it.
    // If it's a system notification, callingUid might be null.

    const newNotificationRef = adminDb.collection('notifications').doc();
    const notificationData = {
      id: newNotificationRef.id,
      userId: body.userId, // The UID of the person who should *receive* the notification
      farmId: body.farmId || null,
      type: body.type,
      title: body.title,
      message: body.message,
      link: body.link || null,
      isRead: false,
      createdAt: FieldValue.serverTimestamp(), 
      readAt: null,
      triggeredBy: callingUid, // Optional: log who/what triggered it
    };

    await newNotificationRef.set(notificationData);

    // Email sending logic
    let shouldSendEmail = false;
    let recipientEmail: string | undefined = undefined;
    let recipientName: string | undefined = undefined;

    try {
        const userDocRef = adminDb.collection('users').doc(body.userId); // Recipient's user doc
        const userDocSnap = await userDocRef.get();
        if (userDocSnap.exists()) {
            const userData = userDocSnap.data() as User; 
            recipientEmail = userData.email || undefined;
            recipientName = userData.name || undefined;
            const prefs = userData.settings?.notificationPreferences;

            if (prefs && recipientEmail) {
                switch (body.type.toLowerCase()) { 
                    case 'task_reminder':
                        if (prefs.taskRemindersEmail) shouldSendEmail = true;
                        break;
                    case 'ai_insight':
                        if (prefs.aiInsightsEmail) shouldSendEmail = true;
                        break;
                    case 'weather_alert':
                        if (prefs.weatherAlertsEmail) shouldSendEmail = true;
                        break;
                    case 'staff_invite_accepted': // New specific type
                    case 'staff_activity': 
                         if (prefs.staffActivityEmail) shouldSendEmail = true;
                         break;
                    // Add more cases here for other notification types as needed
                }
            }
        } else {
            console.warn(`User ${body.userId} not found for email notification. Notification created in Firestore only.`);
        }
    } catch (userFetchError) {
        console.error(`Error fetching user ${body.userId} for notification preferences:`, userFetchError);
    }

    if (shouldSendEmail && resend && fromEmail && recipientEmail) {
        try {
            const emailActionLink = body.link ? (body.link.startsWith('http') ? body.link : `${appUrl}${body.link}`) : appUrl;
            await resend.emails.send({
                from: fromEmail,
                to: [recipientEmail],
                subject: `${appName} Notification: ${body.title}`,
                react: GeneralNotificationEmail({
                    notificationTitle: body.title,
                    notificationMessage: body.message,
                    actionLink: emailActionLink,
                    actionText: body.link ? "View Details" : `Go to ${appName}`,
                    appName: appName,
                    appUrl: appUrl,
                    recipientName: recipientName,
                }) as React.ReactElement,
            });
            console.log(`Email notification sent to ${recipientEmail} for type ${body.type}`);
        } catch (emailError) {
            console.error('Resend API Error sending notification email:', emailError);
            // Do not fail the entire notification creation if email fails
        }
    } else if (shouldSendEmail) {
        console.warn(`Could not send email for notification type ${body.type} to user ${body.userId}. Resend configured: ${!!resend}, FromEmail set: ${!!process.env.RESEND_FROM_EMAIL}, RecipientEmail: ${!!recipientEmail}`);
    }

    return NextResponse.json({ success: true, message: 'Notification created successfully.', notificationId: newNotificationRef.id });

  } catch (error) {
    console.error('Error in /api/notifications/create:', error);
    const message = error instanceof Error ? error.message : 'Internal server error.';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

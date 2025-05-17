
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
const fromEmail = process.env.RESEND_FROM_EMAIL || `AgriAssist <notifications@agriassist.app>`;


export async function POST(request: NextRequest) {
  try {
    const idToken = request.headers.get('Authorization')?.split('Bearer ')[1];
    let callingUid: string | null = null;
    if (idToken) {
        try {
            const decodedToken = await adminAuth.verifyIdToken(idToken);
            callingUid = decodedToken.uid;
        } catch (error) {
            console.warn('Warning: Invalid token from caller for notification creation:', error);
            // For some system-generated notifications, we might allow if the request is trusted (e.g. internal cron)
            // But generally, an authenticated user should trigger notifications related to themselves or their farm.
            // return NextResponse.json({ success: false, message: 'Unauthorized: Invalid token from caller' }, { status: 401 });
        }
    } else {
        console.warn("Notification creation attempt without ID token. This should be a trusted backend call if not user-initiated.");
    }
    
    const body = await request.json() as CreateNotificationBody;

    if (!body.userId || !body.title || !body.message || !body.type) {
      return NextResponse.json({ success: false, message: 'Missing required fields: userId, title, message, type.' }, { status: 400 });
    }

    // If a specific user is making the call, ensure they are only creating a notification for themselves
    // or related to their farm if they are an owner/admin, or if it's a system-generated notification.
    // For simplicity now, we allow `callingUid` (if present) to create for `body.userId`.
    // More complex permission checks could be added here if needed.


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
      createdAt: FieldValue.serverTimestamp(), 
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
                    case 'weather_alert': // Added case for weather alerts
                        if (prefs.weatherAlertsEmail) shouldSendEmail = true;
                        break;
                    case 'staff_invite_accepted': 
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
                    actionText: body.link ? "View Details" : "Go to AgriAssist",
                    appName: appName,
                    appUrl: appUrl,
                    recipientName: recipientName,
                }) as React.ReactElement,
            });
            console.log(`Email notification sent to ${recipientEmail} for type ${body.type}`);
        } catch (emailError) {
            console.error('Resend API Error sending notification email:', emailError);
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


import { type NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import GeneralNotificationEmail from '@/emails/general-notification-email';
import type { NotificationPreferences, User } from '@/contexts/auth-context';

interface CreateNotificationBody {
  userId: string; // Recipient User ID
  title: string;
  message: string;
  type: string; // e.g., "task_reminder", "weather_alert", "ai_insight", "staff_activity"
  link?: string;
  farmId?: string; // Optional, if notification is farm-specific
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const appName = 'AgriAssist';
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002';
const fromEmail = process.env.RESEND_FROM_EMAIL || `AgriAssist <onboarding@resend.dev>`;


export async function POST(request: NextRequest) {
  try {
    // This API route should be protected and only callable by trusted backend services or admins.
    // For simplicity, we'll check for a valid Firebase ID token from the caller,
    // but a more robust system might use service account authentication for backend-to-backend calls.
    const idToken = request.headers.get('Authorization')?.split('Bearer ')[1];
    if (!idToken) {
      // In a real scenario where only backend services call this, you might not require an ID token from a user,
      // but rather use a different authentication mechanism (e.g. API key for the service).
      // For now, this acts as a basic auth check.
      // return NextResponse.json({ success: false, message: 'Unauthorized: No token provided by caller' }, { status: 401 });
      console.warn("Notification creation attempt without ID token. Assuming trusted caller for now.");
    } else {
        try {
            await adminAuth.verifyIdToken(idToken);
        } catch (error) {
            console.error('Error verifying ID token for notification creation:', error);
            return NextResponse.json({ success: false, message: 'Unauthorized: Invalid token from caller' }, { status: 401 });
        }
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
      createdAt: FieldValue.serverTimestamp() as Timestamp,
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
                switch (body.type) {
                    case 'task_reminder':
                        if (prefs.taskRemindersEmail) shouldSendEmail = true;
                        break;
                    case 'ai_insight': // Assuming "aiSuggestionsInApp" preference also means email for important ones
                        if (prefs.aiInsightsEmail) shouldSendEmail = true;
                        break;
                    case 'weather_alert':
                        if (prefs.weatherAlertsEmail) shouldSendEmail = true;
                        break;
                    // Add other cases like 'staff_activity' etc.
                }
            }
        } else {
            console.warn(`User ${body.userId} not found for email notification.`);
        }
    } catch (userFetchError) {
        console.error(`Error fetching user ${body.userId} for notification preferences:`, userFetchError);
    }

    if (shouldSendEmail && resend && fromEmail && recipientEmail) {
        try {
            await resend.emails.send({
                from: fromEmail,
                to: [recipientEmail],
                subject: `${appName} Notification: ${body.title}`,
                react: GeneralNotificationEmail({
                    notificationTitle: body.title,
                    notificationMessage: body.message,
                    actionLink: body.link ? (body.link.startsWith('http') ? body.link : `${appUrl}${body.link}`) : undefined,
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


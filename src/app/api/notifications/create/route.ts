
import { type NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import GeneralNotificationEmail from '@/emails/general-notification-email'; 
import TaskReminderEmail from '@/emails/task-reminder-email'; // Import new template
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
const fromEmail = process.env.RESEND_FROM_EMAIL || `AgriAssist Notifications <notifications@${new URL(appUrl).hostname || 'agriassist.app'}>`;


export async function POST(request: NextRequest) {
  try {
    const idToken = request.headers.get('Authorization')?.split('Bearer ')[1];
    let callingUid: string | null = null; 
    if (idToken) {
        try {
            const decodedToken = await adminAuth.verifyIdToken(idToken);
            callingUid = decodedToken.uid;
        } catch (error) {
            console.warn('Warning: Invalid or missing token for notification creation:', error instanceof Error ? error.message : String(error));
            return NextResponse.json({ success: false, message: 'Unauthorized: Invalid token.' }, { status: 401 });
        }
    } else {
        // This should generally not happen for user-triggered notifications
        console.warn("Notification creation attempt without ID token. This endpoint requires authentication.");
        return NextResponse.json({ success: false, message: 'Unauthorized: Authentication required.' }, { status: 401 });
    }
    
    const body = await request.json() as CreateNotificationBody;

    if (!body.userId || !body.title || !body.message || !body.type) {
      return NextResponse.json({ success: false, message: 'Missing required fields: userId, title, message, type.' }, { status: 400 });
    }

    const newNotificationRef = adminDb.collection('notifications').doc();
    const notificationData = {
      id: newNotificationRef.id,
      userId: body.userId, 
      farmId: body.farmId || null,
      type: body.type,
      title: body.title,
      message: body.message,
      link: body.link || null,
      isRead: false,
      createdAt: FieldValue.serverTimestamp(), 
      readAt: null,
      triggeredBy: callingUid, 
    };

    await newNotificationRef.set(notificationData);

    // Email sending logic
    let shouldSendEmail = false;
    let recipientEmail: string | undefined = undefined;
    let recipientName: string | undefined = undefined;
    let userPreferences: NotificationPreferences | undefined = undefined;

    try {
        const userDocRef = adminDb.collection('users').doc(body.userId); 
        const userDocSnap = await userDocRef.get();
        if (userDocSnap.exists()) {
            const userData = userDocSnap.data() as User; 
            recipientEmail = userData.email || undefined;
            recipientName = userData.name || undefined;
            userPreferences = userData.settings?.notificationPreferences;

            if (userPreferences && recipientEmail) {
                switch (body.type.toLowerCase()) { 
                    case 'task_reminder':
                        if (userPreferences.taskRemindersEmail) shouldSendEmail = true;
                        break;
                    case 'ai_insight':
                        if (userPreferences.aiInsightsEmail) shouldSendEmail = true;
                        break;
                    case 'weather_alert':
                        if (userPreferences.weatherAlertsEmail) shouldSendEmail = true;
                        break;
                    case 'staff_invite_accepted': 
                         if (userPreferences.staffActivityEmail) shouldSendEmail = true;
                         break;
                    // Add other cases as needed
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
            let emailReactElement: React.ReactElement;

            if (body.type.toLowerCase() === 'task_reminder') {
                // Attempt to parse task details for the specific email template
                let taskNameFromMessage = body.title; // Default to title
                let dueDateFormattedFromMessage;
                const titleMatch = body.title.match(/Reminder: ['"]?(.*?)['"]? is due/i);
                if (titleMatch && titleMatch[1]) {
                    taskNameFromMessage = titleMatch[1];
                }
                const dateMatch = body.message.match(/due on (.*?)\./i);
                 if (dateMatch && dateMatch[1]) {
                    dueDateFormattedFromMessage = dateMatch[1];
                }

                emailReactElement = TaskReminderEmail({
                    taskName: taskNameFromMessage,
                    dueDateFormatted: dueDateFormattedFromMessage,
                    taskMessage: body.message,
                    actionLink: emailActionLink,
                    appName: appName,
                    appUrl: appUrl,
                    recipientName: recipientName,
                });
            } else {
                // Fallback to GeneralNotificationEmail for other types or if parsing fails
                emailReactElement = GeneralNotificationEmail({
                    notificationTitle: body.title,
                    notificationMessage: body.message,
                    actionLink: emailActionLink,
                    actionText: body.link ? "View Details" : `Go to ${appName}`,
                    appName: appName,
                    appUrl: appUrl,
                    recipientName: recipientName,
                });
            }
            
            await resend.emails.send({
                from: fromEmail,
                to: [recipientEmail],
                subject: `${appName} Notification: ${body.title}`,
                react: emailReactElement,
            });
            console.log(`Email notification sent to ${recipientEmail} for type ${body.type}`);
        } catch (emailError) {
            console.error('Resend API Error sending notification email for type', body.type, ':', emailError);
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

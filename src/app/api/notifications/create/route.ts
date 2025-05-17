
import { type NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

interface CreateNotificationBody {
  userId: string; // Recipient User ID
  title: string;
  message: string;
  type: string; // e.g., "task_reminder", "weather_alert", "ai_insight", "staff_activity"
  link?: string;
  farmId?: string; // Optional, if notification is farm-specific
}

export async function POST(request: NextRequest) {
  try {
    const idToken = request.headers.get('Authorization')?.split('Bearer ')[1];
    if (!idToken) {
      return NextResponse.json({ success: false, message: 'Unauthorized: No token provided' }, { status: 401 });
    }

    let decodedToken;
    try {
      // This verifies the token is from a legitimate, authenticated user (or service account if you set that up)
      // For now, we assume this API might be called by a backend service/admin user for simplicity.
      // If it's meant to be called by end-users to create notifications for themselves (less common),
      // further permission checks would be needed based on `decodedToken.uid`.
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (error) {
      console.error('Error verifying ID token for notification creation:', error);
      return NextResponse.json({ success: false, message: 'Unauthorized: Invalid token' }, { status: 401 });
    }
    
    // For now, we assume the caller (e.g., another API route, or a future scheduled function) has authority.
    // If users were to call this to create notifications for *other* users,
    // strong permission checks would be needed here based on `decodedToken.uid` and their role/permissions.

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
      createdAt: FieldValue.serverTimestamp() as Timestamp, // Ensure type for serverTimestamp
      readAt: null,
    };

    await newNotificationRef.set(notificationData);

    return NextResponse.json({ success: true, message: 'Notification created successfully.', notificationId: newNotificationRef.id });

  } catch (error) {
    console.error('Error in /api/notifications/create:', error);
    const message = error instanceof Error ? error.message : 'Internal server error.';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

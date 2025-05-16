import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const serviceAccountKeyBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

    if (!serviceAccountKeyBase64) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 environment variable is not set.');
    }

    const serviceAccountJsonString = Buffer.from(serviceAccountKeyBase64, 'base64').toString('utf-8');
    const serviceAccount = JSON.parse(serviceAccountJsonString);
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('Firebase Admin SDK initialized successfully.');
  } catch (error) {
    console.error('Firebase Admin SDK initialization error:', error);
    // Depending on your error handling strategy, you might want to:
    // - Throw the error to stop the application if Admin SDK is critical
    // - Log the error and continue if parts of the app can run without it (less likely for API routes needing admin)
  }
}

export const adminAuth = admin.auth();
export const adminDb = admin.firestore();

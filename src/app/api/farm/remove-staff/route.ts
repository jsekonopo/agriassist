import { type NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { staffUidToRemove, ownerUid, ownerFarmId } = body;
    const idToken = request.headers.get('Authorization')?.split('Bearer ')[1];

    if (!idToken) {
      return NextResponse.json({ success: false, message: 'Unauthorized: No token provided' }, { status: 401 });
    }
    if (!staffUidToRemove || !ownerUid || !ownerFarmId) {
      return NextResponse.json({ success: false, message: 'Missing required fields: staffUidToRemove, ownerUid, ownerFarmId' }, { status: 400 });
    }
    
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (error) {
      console.error('Error verifying ID token:', error);
      return NextResponse.json({ success: false, message: 'Unauthorized: Invalid token' }, { status: 401 });
    }

    if (decodedToken.uid !== ownerUid) {
      return NextResponse.json({ success: false, message: 'Unauthorized: Token UID does not match owner UID' }, { status: 403 });
    }

    if (staffUidToRemove === ownerUid) {
      return NextResponse.json({ success: false, message: "Owner cannot remove themselves as staff." }, { status: 400 });
    }

    const farmDocRef = adminDb.collection('farms').doc(ownerFarmId);
    const staffUserDocRef = adminDb.collection('users').doc(staffUidToRemove);

    const batch = adminDb.batch();

    // 1. Remove staff from the owner's farm document
    batch.update(farmDocRef, {
      staffMembers: FieldValue.arrayRemove(staffUidToRemove)
    });

    // 2. Create a new personal farm for the removed staff member
    const staffUserSnap = await staffUserDocRef.get();
    let staffNameForNewFarm = "User";
    if (staffUserSnap.exists()) {
        staffNameForNewFarm = staffUserSnap.data()?.name || "User";
    }
    
    const newPersonalFarmId = staffUidToRemove; // Use staff's UID as their new farm ID
    const newPersonalFarmDocRef = adminDb.collection('farms').doc(newPersonalFarmId);
    batch.set(newPersonalFarmDocRef, {
      farmId: newPersonalFarmId,
      farmName: `${staffNameForNewFarm}'s Personal Farm`,
      ownerId: staffUidToRemove,
      staffMembers: [],
      createdAt: FieldValue.serverTimestamp(),
    });

    // 3. Update the removed staff member's user document
    batch.update(staffUserDocRef, {
      farmId: newPersonalFarmId,
      isFarmOwner: true,
    });

    await batch.commit();

    return NextResponse.json({ success: true, message: `${staffNameForNewFarm} has been removed from your farm and assigned to their own personal farm.` });

  } catch (error) {
    console.error('Error in /api/farm/remove-staff:', error);
    // Check if it's a Firestore error with more details
    if (error instanceof Error && 'code' in error) {
        console.error('Firestore error code:', (error as any).code);
    }
    return NextResponse.json({ success: false, message: 'Internal server error while removing staff.' }, { status: 500 });
  }
}

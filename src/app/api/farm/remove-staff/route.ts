
import { type NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { StaffMemberInFarmDoc } from '@/contexts/auth-context';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // ownerUid and ownerFarmId are derived from the authenticated token on the server
    const { staffUidToRemove } = body; 
    const idToken = request.headers.get('Authorization')?.split('Bearer ')[1];

    if (!idToken) {
      return NextResponse.json({ success: false, message: 'Unauthorized: No token provided' }, { status: 401 });
    }
    if (!staffUidToRemove) {
      return NextResponse.json({ success: false, message: 'Missing required field: staffUidToRemove' }, { status: 400 });
    }
    
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (error) {
      console.error('Error verifying ID token:', error);
      return NextResponse.json({ success: false, message: 'Unauthorized: Invalid token' }, { status: 401 });
    }
    const ownerUid = decodedToken.uid;

    const ownerUserDoc = await adminDb.collection('users').doc(ownerUid).get();
    if (!ownerUserDoc.exists || !ownerUserDoc.data()?.isFarmOwner || !ownerUserDoc.data()?.farmId) {
        return NextResponse.json({ success: false, message: "Unauthorized: Requester is not a farm owner or not associated with a farm." }, { status: 403 });
    }
    const ownerFarmId = ownerUserDoc.data()?.farmId;


    if (staffUidToRemove === ownerUid) {
      return NextResponse.json({ success: false, message: "Owner cannot remove themselves as staff using this method." }, { status: 400 });
    }

    const farmDocRef = adminDb.collection('farms').doc(ownerFarmId);
    const staffUserDocRef = adminDb.collection('users').doc(staffUidToRemove);

    const batch = adminDb.batch();

    const farmDocSnap = await farmDocRef.get();
    if (!farmDocSnap.exists) {
        return NextResponse.json({ success: false, message: "Farm not found." }, { status: 404 });
    }
    if (farmDocSnap.data()?.ownerId !== ownerUid) {
        return NextResponse.json({ success: false, message: "Unauthorized: You are not the owner of this farm." }, { status: 403 });
    }
    
    const currentStaffArray = (farmDocSnap.data()?.staff || []) as StaffMemberInFarmDoc[];
    const staffMemberExists = currentStaffArray.some(staff => staff.uid === staffUidToRemove);

    if (!staffMemberExists) {
        return NextResponse.json({ success: false, message: "This user is not a staff member of this farm." }, { status: 400 });
    }
    
    // Filter out the staff member to remove
    const updatedStaffArray = currentStaffArray.filter(staff => staff.uid !== staffUidToRemove);
    batch.update(farmDocRef, {
      staff: updatedStaffArray,
      updatedAt: FieldValue.serverTimestamp()
    });

    const staffUserSnap = await staffUserDocRef.get();
    let staffNameForNewFarm = "User";
    if (staffUserSnap.exists()) {
        staffNameForNewFarm = staffUserSnap.data()?.name || "User";
    }
    
    const newPersonalFarmId = staffUidToRemove; 
    const newPersonalFarmDocRef = adminDb.collection('farms').doc(newPersonalFarmId);
    
    const existingPersonalFarmSnap = await newPersonalFarmDocRef.get();
    if (existingPersonalFarmSnap.exists()) {
         batch.update(staffUserDocRef, {
            farmId: newPersonalFarmId,
            isFarmOwner: true,
            roleOnCurrentFarm: 'owner', // They become owner of their personal farm
            updatedAt: FieldValue.serverTimestamp()
        });
    } else {
        batch.set(newPersonalFarmDocRef, {
          farmId: newPersonalFarmId,
          farmName: `${staffNameForNewFarm}'s Personal Farm`,
          ownerId: staffUidToRemove,
          staff: [], 
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });

        batch.update(staffUserDocRef, {
          farmId: newPersonalFarmId, 
          isFarmOwner: true, 
          roleOnCurrentFarm: 'owner',
          updatedAt: FieldValue.serverTimestamp()
        });
    }
    
    await batch.commit();

    return NextResponse.json({ success: true, message: `${staffNameForNewFarm} has been removed from your farm and assigned to their own personal farm.` });

  } catch (error) {
    console.error('Error in /api/farm/remove-staff:', error);
    let errorMessage = "Internal server error while removing staff.";
    if (error instanceof Error && 'message' in error) {
        errorMessage = (error as Error).message;
    }
    return NextResponse.json({ success: false, message: errorMessage }, { status: 500 });
  }
}

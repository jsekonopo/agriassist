
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
      return NextResponse.json({ success: false, message: "Owner cannot remove themselves as staff using this method." }, { status: 400 });
    }

    const farmDocRef = adminDb.collection('farms').doc(ownerFarmId);
    const staffUserDocRef = adminDb.collection('users').doc(staffUidToRemove);

    // Start a batch write for atomicity
    const batch = adminDb.batch();

    // 1. Verify owner is actually the owner of the farm
    const farmDocSnap = await farmDocRef.get();
    if (!farmDocSnap.exists) {
        return NextResponse.json({ success: false, message: "Farm not found." }, { status: 404 });
    }
    if (farmDocSnap.data()?.ownerId !== ownerUid) {
        return NextResponse.json({ success: false, message: "Unauthorized: You are not the owner of this farm." }, { status: 403 });
    }
    // Ensure the staff member is actually part of this farm's staff list
    if (!farmDocSnap.data()?.staffMembers?.includes(staffUidToRemove)) {
        return NextResponse.json({ success: false, message: "This user is not a staff member of this farm." }, { status: 400 });
    }


    // 2. Remove staff from the owner's farm document's staffMembers array
    batch.update(farmDocRef, {
      staffMembers: FieldValue.arrayRemove(staffUidToRemove)
    });

    // 3. Create a new personal farm for the removed staff member
    //    And update their user document to point to this new farm and mark them as owner.
    const staffUserSnap = await staffUserDocRef.get();
    let staffNameForNewFarm = "User"; // Default name
    if (staffUserSnap.exists()) {
        staffNameForNewFarm = staffUserSnap.data()?.name || "User";
    }
    
    const newPersonalFarmId = staffUidToRemove; // Use staff's UID as their new personal farm ID for simplicity
    const newPersonalFarmDocRef = adminDb.collection('farms').doc(newPersonalFarmId);
    
    // Check if a farm with this ID already exists (e.g., if they were an owner before being staff)
    const existingPersonalFarmSnap = await newPersonalFarmDocRef.get();
    if (existingPersonalFarmSnap.exists()) {
        // If they already have a personal farm (e.g., from a previous ownership), just update their user doc.
        // No need to create a new farm doc.
         batch.update(staffUserDocRef, {
            farmId: newPersonalFarmId, // Point back to their own farm
            isFarmOwner: true, // They become an owner of their personal farm
        });
    } else {
        // Create new personal farm document
        batch.set(newPersonalFarmDocRef, {
          farmId: newPersonalFarmId,
          farmName: `${staffNameForNewFarm}'s Personal Farm`, // e.g., "John Doe's Personal Farm"
          ownerId: staffUidToRemove,
          staffMembers: [], // Their new farm has no staff initially
          createdAt: FieldValue.serverTimestamp(),
        });

        // Update the removed staff member's user document
        batch.update(staffUserDocRef, {
          farmId: newPersonalFarmId, // Point to their new personal farm
          isFarmOwner: true, // They become an owner of this new farm
        });
    }
    
    await batch.commit();

    return NextResponse.json({ success: true, message: `${staffNameForNewFarm} has been removed from your farm and assigned to their own personal farm.` });

  } catch (error)
    {
    console.error('Error in /api/farm/remove-staff:', error);
    let errorMessage = "Internal server error while removing staff.";
    if (error instanceof Error && 'message' in error) {
        errorMessage = (error as Error).message;
    }
    return NextResponse.json({ success: false, message: errorMessage }, { status: 500 });
  }
}

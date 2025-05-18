
import { type NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { StaffMemberInFarmDoc, User } from '@/contexts/auth-context';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
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
    const requesterUid = decodedToken.uid;

    const requesterUserDocSnap = await adminDb.collection('users').doc(requesterUid).get();
    if (!requesterUserDocSnap.exists() || !requesterUserDocSnap.data()?.farmId) {
        return NextResponse.json({ success: false, message: "Requester not associated with a farm." }, { status: 403 });
    }
    const requesterUserData = requesterUserDocSnap.data() as User;
    const farmId = requesterUserData.farmId!;

    if (staffUidToRemove === requesterUid) {
      return NextResponse.json({ success: false, message: "You cannot remove yourself as staff using this method." }, { status: 400 });
    }

    const farmDocRef = adminDb.collection('farms').doc(farmId);
    const staffUserDocRef = adminDb.collection('users').doc(staffUidToRemove);

    const batch = adminDb.batch();
    const farmDocSnap = await farmDocRef.get();

    if (!farmDocSnap.exists) {
        return NextResponse.json({ success: false, message: "Farm not found." }, { status: 404 });
    }
    const farmData = farmDocSnap.data()!;

    // Permission check: Requester must be owner or admin of this farm
    if (farmData.ownerId !== requesterUid && requesterUserData.roleOnCurrentFarm !== 'admin') {
        return NextResponse.json({ success: false, message: "Unauthorized: Only farm owner or admin can remove staff." }, { status: 403 });
    }

    if (farmData.ownerId === staffUidToRemove) {
        return NextResponse.json({ success: false, message: "Cannot remove the farm owner." }, { status: 400 });
    }

    const currentStaffArray = (farmData.staff || []) as StaffMemberInFarmDoc[];
    const staffMemberToRemove = currentStaffArray.find(staff => staff.uid === staffUidToRemove);

    if (!staffMemberToRemove) {
        return NextResponse.json({ success: false, message: "This user is not currently a staff member of this farm." }, { status: 400 });
    }

    // Admin check: Admin cannot remove another admin
    if (requesterUserData.roleOnCurrentFarm === 'admin' && staffMemberToRemove.role === 'admin') {
        return NextResponse.json({ success: false, message: "Admins cannot remove other admins." }, { status: 403 });
    }

    const updatedStaffArray = currentStaffArray.filter(staff => staff.uid !== staffUidToRemove);
    batch.update(farmDocRef, {
      staff: updatedStaffArray,
      updatedAt: FieldValue.serverTimestamp()
    });

    // Assign removed staff to their own new personal farm
    const staffUserSnap = await staffUserDocRef.get();
    let staffNameForNewFarm = "User";
    if (staffUserSnap.exists()) {
        staffNameForNewFarm = staffUserSnap.data()?.name || "User";
    }

    const newPersonalFarmId = staffUidToRemove; // Use staff's UID as their new personal farm ID
    const newPersonalFarmDocRef = adminDb.collection('farms').doc(newPersonalFarmId);

    batch.set(newPersonalFarmDocRef, {
      farmId: newPersonalFarmId,
      farmName: `${staffNameForNewFarm}'s Personal Farm`,
      ownerId: staffUidToRemove,
      staff: [],
      latitude: null,
      longitude: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true }); // Merge true in case a personal farm document already exists (e.g., from a previous removal)

    // Update the removed staff member's user document
    batch.update(staffUserDocRef, {
      farmId: newPersonalFarmId,
      farmName: `${staffNameForNewFarm}'s Personal Farm`,
      isFarmOwner: true,
      roleOnCurrentFarm: 'free', // Default to 'free' plan for their new personal farm
      selectedPlanId: 'free',
      subscriptionStatus: 'active', // Assuming personal farms are active on free plan
      stripeCustomerId: null, // Clear Stripe info if they were on a paid farm
      stripeSubscriptionId: null,
      subscriptionCurrentPeriodEnd: null,
      updatedAt: FieldValue.serverTimestamp()
    });

    await batch.commit();

    return NextResponse.json({ success: true, message: `${staffNameForNewFarm} (${staffMemberToRemove.role}) has been removed from farm ${farmData.farmName} and assigned to their own personal farm.` });

  } catch (error) {
    console.error('Error in /api/farm/remove-staff:', error);
    let errorMessage = "Internal server error while removing staff.";
    if (error instanceof Error) {
        errorMessage = (error as Error).message;
    }
    return NextResponse.json({ success: false, message: errorMessage }, { status: 500 });
  }
}

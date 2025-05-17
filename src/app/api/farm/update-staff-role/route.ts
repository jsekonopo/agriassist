
import { type NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { StaffRole, StaffMemberInFarmDoc, User } from '@/contexts/auth-context';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { staffUidToUpdate: string, newRole: StaffRole };
    const { staffUidToUpdate, newRole } = body;
    const idToken = request.headers.get('Authorization')?.split('Bearer ')[1];

    if (!idToken) {
      return NextResponse.json({ success: false, message: 'Unauthorized: No token provided.' }, { status: 401 });
    }
    if (!staffUidToUpdate || !newRole) {
      return NextResponse.json({ success: false, message: 'Missing required fields: staffUidToUpdate and newRole.' }, { status: 400 });
    }
    const validRoles: StaffRole[] = ['admin', 'editor', 'viewer'];
    if (!validRoles.includes(newRole)) {
        return NextResponse.json({ success: false, message: 'Invalid role provided.' }, { status: 400 });
    }

    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (error) {
      console.error('Error verifying ID token:', error);
      return NextResponse.json({ success: false, message: 'Unauthorized: Invalid token.' }, { status: 401 });
    }
    const requesterUid = decodedToken.uid;

    const requesterUserDocSnap = await adminDb.collection('users').doc(requesterUid).get();
    if (!requesterUserDocSnap.exists || !requesterUserDocSnap.data()?.farmId) {
      return NextResponse.json({ success: false, message: 'Requester not associated with a farm.' }, { status: 403 });
    }
    const requesterUserData = requesterUserDocSnap.data() as User;
    const farmId = requesterUserData.farmId!; // farmId must exist at this point based on check
    const requesterRole = requesterUserData.roleOnCurrentFarm;
    const isRequesterOwner = requesterUserData.isFarmOwner;

    const farmDocRef = adminDb.collection('farms').doc(farmId);
    const farmDocSnap = await farmDocRef.get();

    if (!farmDocSnap.exists) {
      return NextResponse.json({ success: false, message: 'Farm not found.' }, { status: 404 });
    }
    const farmData = farmDocSnap.data()!;

    // Permission Check: Only Owner or Admin of the farm can update roles
    if (!isRequesterOwner && requesterRole !== 'admin') {
        return NextResponse.json({ success: false, message: 'Unauthorized: Only owners or admins can update staff roles.' }, { status: 403 });
    }
    // Farm owner check is also part of isRequesterOwner

    if (farmData.ownerId === staffUidToUpdate) {
        return NextResponse.json({ success: false, message: 'Cannot change the role of the farm owner.'}, { status: 400 });
    }

    const currentStaffArray = (farmData.staff || []) as StaffMemberInFarmDoc[];
    const staffIndex = currentStaffArray.findIndex(s => s.uid === staffUidToUpdate);

    if (staffIndex === -1) {
      return NextResponse.json({ success: false, message: 'Staff member not found on this farm.' }, { status: 404 });
    }
    
    const staffToUpdateCurrentRole = currentStaffArray[staffIndex].role;

    // Admin Permission Logic:
    // - An admin cannot change the role of another admin.
    // - An admin cannot promote anyone to 'admin'.
    if (requesterRole === 'admin') { // and not owner
        if (staffToUpdateCurrentRole === 'admin') {
            return NextResponse.json({ success: false, message: 'Admins cannot modify the role of other admins.' }, { status: 403 });
        }
        if (newRole === 'admin') {
            return NextResponse.json({ success: false, message: 'Admins cannot promote other staff to an admin role.' }, { status: 403 });
        }
    }
    // Owners have full permission to change any staff role on their farm.

    const updatedStaffArray = [...currentStaffArray];
    updatedStaffArray[staffIndex] = { ...updatedStaffArray[staffIndex], role: newRole };

    const batch = adminDb.batch();
    batch.update(farmDocRef, { staff: updatedStaffArray, updatedAt: FieldValue.serverTimestamp() });
    
    const staffUserDocRef = adminDb.collection('users').doc(staffUidToUpdate);
    batch.update(staffUserDocRef, { roleOnCurrentFarm: newRole, updatedAt: FieldValue.serverTimestamp() });

    await batch.commit();

    return NextResponse.json({ success: true, message: `Staff member's role updated to ${newRole}.` });

  } catch (error) {
    console.error('Error in /api/farm/update-staff-role:', error);
    const message = error instanceof Error ? error.message : 'Internal server error while updating staff role.';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

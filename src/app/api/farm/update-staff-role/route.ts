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
    if (!requesterUserDocSnap.exists() || !requesterUserDocSnap.data()?.farmId) {
      return NextResponse.json({ success: false, message: 'Requester not associated with a farm.' }, { status: 403 });
    }
    const requesterUserData = requesterUserDocSnap.data() as User;
    const farmId = requesterUserData.farmId!;
    const isRequesterOwner = requesterUserData.isFarmOwner;
    const requesterRole = requesterUserData.roleOnCurrentFarm;

    const farmDocRef = adminDb.collection('farms').doc(farmId);
    const farmDocSnap = await farmDocRef.get();

    if (!farmDocSnap.exists()) {
      return NextResponse.json({ success: false, message: 'Farm not found.' }, { status: 404 });
    }
    const farmData = farmDocSnap.data()!;

    if (farmData.ownerId === staffUidToUpdate) {
        return NextResponse.json({ success: false, message: 'Cannot change the role of the farm owner.'}, { status: 400 });
    }
    if (requesterUid === staffUidToUpdate) {
        return NextResponse.json({ success: false, message: 'Users cannot change their own role using this method.'}, { status: 400 });
    }

    const currentStaffArray = (farmData.staff || []) as StaffMemberInFarmDoc[];
    const staffIndex = currentStaffArray.findIndex(s => s.uid === staffUidToUpdate);

    if (staffIndex === -1) {
      return NextResponse.json({ success: false, message: 'Staff member not found on this farm.' }, { status: 404 });
    }
    
    const staffToUpdateCurrentRole = currentStaffArray[staffIndex].role;

    if (!isRequesterOwner) { // If requester is not owner, they must be admin
        if (requesterRole !== 'admin') {
             return NextResponse.json({ success: false, message: 'Unauthorized: Only farm owner or admin can update staff roles.' }, { status: 403 });
        }
        // Admin specific checks
        if (staffToUpdateCurrentRole === 'admin') {
            return NextResponse.json({ success: false, message: 'Admins cannot modify the role of other admins.' }, { status: 403 });
        }
        if (newRole === 'admin') {
            return NextResponse.json({ success: false, message: 'Admins cannot promote other staff to an admin role.' }, { status: 403 });
        }
    }
    // Owners have full permission to change any staff role on their farm (except owner themselves).

    const updatedStaffArray = [...currentStaffArray];
    updatedStaffArray[staffIndex] = { ...updatedStaffArray[staffIndex], role: newRole };

    const batch = adminDb.batch();
    // Pass farmId in the update object
    batch.update(farmDocRef, { staff: updatedStaffArray, updatedAt: FieldValue.serverTimestamp(), farmId: farmId }); 
    
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
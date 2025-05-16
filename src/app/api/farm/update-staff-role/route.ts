
import { type NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { StaffRole, StaffMemberInFarmDoc } from '@/contexts/auth-context';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { staffUidToUpdate, newRole } = body as { staffUidToUpdate: string, newRole: StaffRole };
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

    const requesterUserDoc = await adminDb.collection('users').doc(requesterUid).get();
    if (!requesterUserDoc.exists || !requesterUserDoc.data()?.farmId) {
      return NextResponse.json({ success: false, message: 'Requester not associated with a farm.' }, { status: 403 });
    }
    const farmId = requesterUserDoc.data()?.farmId;
    const requesterRole = requesterUserDoc.data()?.roleOnCurrentFarm;
    const isRequesterOwner = requesterUserDoc.data()?.isFarmOwner;


    const farmDocRef = adminDb.collection('farms').doc(farmId);
    const farmDocSnap = await farmDocRef.get();

    if (!farmDocSnap.exists) {
      return NextResponse.json({ success: false, message: 'Farm not found.' }, { status: 404 });
    }
    const farmData = farmDocSnap.data()!;

    // Permission checks
    if (!isRequesterOwner && requesterRole !== 'admin') {
        return NextResponse.json({ success: false, message: 'Unauthorized: Only owners or admins can update staff roles.' }, { status: 403 });
    }
    if (farmData.ownerId === staffUidToUpdate) {
        return NextResponse.json({ success: false, message: 'Cannot change the role of the farm owner.'}, { status: 400 });
    }
    if (requesterRole === 'admin' && farmData.ownerId !== requesterUid && newRole === 'admin') {
        // An admin cannot promote others to admin or change another admin's role (unless we allow it)
        // For now, let's say an admin cannot create other admins or demote/change other admins.
        const targetStaffCurrentRole = (farmData.staff as StaffMemberInFarmDoc[]).find(s => s.uid === staffUidToUpdate)?.role;
        if (targetStaffCurrentRole === 'admin') {
             return NextResponse.json({ success: false, message: 'Admins cannot modify other admins roles.' }, { status: 403 });
        }
    }


    const currentStaffArray = (farmData.staff || []) as StaffMemberInFarmDoc[];
    const staffIndex = currentStaffArray.findIndex(s => s.uid === staffUidToUpdate);

    if (staffIndex === -1) {
      return NextResponse.json({ success: false, message: 'Staff member not found on this farm.' }, { status: 404 });
    }

    const updatedStaffArray = [...currentStaffArray];
    updatedStaffArray[staffIndex] = { ...updatedStaffArray[staffIndex], role: newRole };

    const batch = adminDb.batch();
    batch.update(farmDocRef, { staff: updatedStaffArray, updatedAt: FieldValue.serverTimestamp() });
    
    const staffUserDocRef = adminDb.collection('users').doc(staffUidToUpdate);
    batch.update(staffUserDocRef, { roleOnCurrentFarm: newRole, updatedAt: FieldValue.serverTimestamp() });

    await batch.commit();

    return NextResponse.json({ success: true, message: `Staff member ${staffUidToUpdate}'s role updated to ${newRole}.` });

  } catch (error) {
    console.error('Error in /api/farm/update-staff-role:', error);
    const message = error instanceof Error ? error.message : 'Internal server error while updating staff role.';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

    
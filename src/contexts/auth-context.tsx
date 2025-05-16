
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { 
  Auth, 
  User as FirebaseUser, 
  onAuthStateChanged, 
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase'; // Import your Firebase auth instance
import { doc, setDoc, getDoc } from 'firebase/firestore';

interface User { // This can be your app-specific user type
  uid: string;
  email: string | null;
  name: string | null;
  // Add other user properties as needed from Firestore
}

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null; // Expose Firebase user if needed for specific tasks
  isAuthenticated: boolean;
  isLoading: boolean;
  loginUser: (email: string, password: string) => Promise<FirebaseUserCredential>;
  registerUser: (name: string, email: string, password: string) => Promise<FirebaseUserCredential>;
  logoutUser: () => Promise<void>;
}

interface FirebaseUserCredential { // Simplified version of UserCredential
  user: FirebaseUser;
}


const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        // Fetch additional user data from Firestore if needed
        const userDocRef = doc(db, "users", fbUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const appUser = userDocSnap.data() as User;
          setUser({
            uid: fbUser.uid,
            email: fbUser.email,
            name: appUser.name || fbUser.displayName, // Prioritize Firestore name
            ...appUser // spread other potential fields from Firestore doc
          });
        } else {
          // If no doc, use basic info from Firebase Auth (e.g., during registration)
           setUser({ uid: fbUser.uid, email: fbUser.email, name: fbUser.displayName });
        }
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginUser = async (email: string, password: string): Promise<FirebaseUserCredential> => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const registerUser = async (name: string, email: string, password: string): Promise<FirebaseUserCredential> => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const fbUser = userCredential.user;
    // Update Firebase Auth profile
    await updateProfile(fbUser, { displayName: name });
    // Create a user document in Firestore
    const userDocRef = doc(db, "users", fbUser.uid);
    await setDoc(userDocRef, {
      uid: fbUser.uid,
      email: fbUser.email,
      name: name,
      createdAt: new Date().toISOString(), // Optional: timestamp
    });
    // Refresh user state with new info
     setUser({ uid: fbUser.uid, email: fbUser.email, name: name });
    return userCredential;
  };

  const logoutUser = async () => {
    await firebaseSignOut(auth);
    router.push('/login');
  };

  const isAuthenticated = !!user && !!firebaseUser; // Ensure both user objects are present

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !['/login', '/register', '/'].includes(pathname)) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  return (
    <AuthContext.Provider value={{ user, firebaseUser, isAuthenticated, isLoading, loginUser, registerUser, logoutUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

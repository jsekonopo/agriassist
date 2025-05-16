
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
  updateProfile as firebaseUpdateProfile // Renamed to avoid conflict
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase'; // Import your Firebase auth instance
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore'; // Added updateDoc

interface User { 
  uid: string;
  email: string | null;
  name: string | null;
  farmName?: string | null; 
}

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null; 
  isAuthenticated: boolean;
  isLoading: boolean;
  loginUser: (email: string, password: string) => Promise<FirebaseUserCredential>;
  registerUser: (name: string, farmName: string, email: string, password: string) => Promise<FirebaseUserCredential>;
  logoutUser: () => Promise<void>;
  updateUserProfile: (name: string, farmName: string) => Promise<void>; // Added
}

interface FirebaseUserCredential { 
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
        const userDocRef = doc(db, "users", fbUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const appUser = userDocSnap.data() as User;
          setUser({
            uid: fbUser.uid,
            email: fbUser.email,
            name: appUser.name || fbUser.displayName,
            farmName: appUser.farmName, 
            ...appUser 
          });
        } else {
           // This case might happen if a user document wasn't created properly during registration
           // Or if user was created directly in Firebase console
           // For robustness, try to create it if it doesn't exist
            console.warn(`User document for UID ${fbUser.uid} not found. Attempting to create.`);
            const userData = {
                uid: fbUser.uid,
                email: fbUser.email,
                name: fbUser.displayName || "New User",
                farmName: "N/A",
                createdAt: new Date().toISOString(),
            };
            try {
                await setDoc(userDocRef, userData);
                setUser(userData);
            } catch (error) {
                console.error("Error creating missing user document:", error);
                setUser({ uid: fbUser.uid, email: fbUser.email, name: fbUser.displayName, farmName: null });
            }
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

  const registerUser = async (name: string, farmName: string, email: string, password: string): Promise<FirebaseUserCredential> => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const fbUser = userCredential.user;
    await firebaseUpdateProfile(fbUser, { displayName: name }); // Update Firebase Auth profile
    
    const userDocRef = doc(db, "users", fbUser.uid);
    const userData = {
      uid: fbUser.uid,
      email: fbUser.email,
      name: name,
      farmName: farmName, 
      createdAt: new Date().toISOString(),
    };
    await setDoc(userDocRef, userData);
    
    setUser(userData); // Set local user state
    return userCredential;
  };

  const updateUserProfile = async (name: string, farmName: string): Promise<void> => {
    if (!firebaseUser) throw new Error("User not authenticated");

    // Update Firebase Auth profile (displayName)
    await firebaseUpdateProfile(firebaseUser, { displayName: name });

    // Update Firestore document
    const userDocRef = doc(db, "users", firebaseUser.uid);
    await updateDoc(userDocRef, {
      name: name,
      farmName: farmName,
    });

    // Update local user state
    setUser(prevUser => prevUser ? { ...prevUser, name, farmName } : null);
  };

  const logoutUser = async () => {
    await firebaseSignOut(auth);
    router.push('/login'); 
  };

  const isAuthenticated = !!user && !!firebaseUser; 

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !['/login', '/register', '/'].includes(pathname)) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  return (
    <AuthContext.Provider value={{ user, firebaseUser, isAuthenticated, isLoading, loginUser, registerUser, logoutUser, updateUserProfile }}>
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

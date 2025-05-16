
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface User {
  email: string;
  name: string;
  // Add other user properties as needed
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (userData: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const MOCK_USER_STORAGE_KEY = 'agriassist_mock_user';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Try to load mock user from localStorage on initial load
    try {
      const storedUser = localStorage.getItem(MOCK_USER_STORAGE_KEY);
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error("Error loading mock user from localStorage:", error);
      localStorage.removeItem(MOCK_USER_STORAGE_KEY); // Clear corrupted data
    }
    setIsLoading(false);
  }, []);

  const login = (userData: User) => {
    setUser(userData);
    try {
      localStorage.setItem(MOCK_USER_STORAGE_KEY, JSON.stringify(userData));
    } catch (error) {
      console.error("Error saving mock user to localStorage:", error);
    }
  };

  const logout = () => {
    setUser(null);
    try {
      localStorage.removeItem(MOCK_USER_STORAGE_KEY);
    } catch (error) {
      console.error("Error removing mock user from localStorage:", error);
    }
    router.push('/login');
  };

  const isAuthenticated = !!user;

  // Route protection logic
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !['/login', '/register', '/'].includes(pathname)) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, pathname, router]);


  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, login, logout }}>
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

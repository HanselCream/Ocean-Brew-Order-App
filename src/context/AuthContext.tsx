'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  login: (password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// CHANGE THIS PASSWORD!
const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD!;
// Session timeout in milliseconds (30 minutes)
const SESSION_TIMEOUT = 30 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [lastActivity, setLastActivity] = useState<number>(Date.now());

  // Check for existing session on mount
  useEffect(() => {
    const session = localStorage.getItem('admin_session');
    const sessionTime = localStorage.getItem('admin_session_time');
    
    if (session === 'authenticated' && sessionTime) {
      const timeDiff = Date.now() - parseInt(sessionTime);
      if (timeDiff < SESSION_TIMEOUT) {
        setIsAuthenticated(true);
        setLastActivity(parseInt(sessionTime));
      } else {
        // Session expired
        localStorage.removeItem('admin_session');
        localStorage.removeItem('admin_session_time');
        setIsAuthenticated(false);
      }
    }
  }, []);

  // Track user activity
  useEffect(() => {
    if (!isAuthenticated) return;

    const updateActivity = () => {
      const now = Date.now();
      setLastActivity(now);
      localStorage.setItem('admin_session_time', now.toString());
    };

    // Update activity on user interactions
    window.addEventListener('click', updateActivity);
    window.addEventListener('keypress', updateActivity);
    window.addEventListener('mousemove', updateActivity);
    
    return () => {
      window.removeEventListener('click', updateActivity);
      window.removeEventListener('keypress', updateActivity);
      window.removeEventListener('mousemove', updateActivity);
    };
  }, [isAuthenticated]);

  // Check for session timeout
  useEffect(() => {
    if (!isAuthenticated) return;

    const checkTimeout = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivity;
      if (timeSinceActivity >= SESSION_TIMEOUT) {
        logout();
        alert('Session expired due to inactivity. Please login again.');
      }
    }, 10000); // Check every minute

    return () => clearInterval(checkTimeout);
  }, [isAuthenticated, lastActivity]);

  const login = (password: string): boolean => {
    if (password === ADMIN_PASSWORD) {
      const now = Date.now();
      setIsAuthenticated(true);
      setLastActivity(now);
      localStorage.setItem('admin_session', 'authenticated');
      localStorage.setItem('admin_session_time', now.toString());
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('admin_session');
    localStorage.removeItem('admin_session_time');
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
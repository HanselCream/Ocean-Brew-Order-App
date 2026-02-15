'use client';

import { useEffect, useState } from 'react';
import { initializeApp } from '@/lib/store';

export default function DatabaseInitializer({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initializeApp()
      .then(() => {
        console.log('✅ Database ready');
        setIsReady(true);
      })
      .catch(err => {
        console.error('❌ Database init failed:', err);
        setError(err.message);
        setIsReady(true); // Still show UI even if DB fails
      });
  }, []);

  if (!isReady) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 to-white">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-bounce">☕</div>
          <div className="text-2xl font-bold text-sky-800 mb-2">Ocean Brew</div>
          <div className="text-gray-600">Loading your POS system...</div>
          <div className="mt-4 w-48 h-2 bg-gray-200 rounded-full mx-auto overflow-hidden">
            <div className="w-1/2 h-full bg-sky-500 rounded-full animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    console.warn('Database error but continuing:', error);
  }

  return <>{children}</>;
}
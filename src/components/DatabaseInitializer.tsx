// components/DatabaseInitializer.tsx
'use client';

import { useEffect } from 'react';
import { initializeApp } from '@/lib/store';

export default function DatabaseInitializer() {
  useEffect(() => {
    // Initialize IndexedDB when app starts
    initializeApp().catch(error => {
      console.error('Failed to initialize database:', error);
    });
  }, []);

  return null; // This component doesn't render anything
}
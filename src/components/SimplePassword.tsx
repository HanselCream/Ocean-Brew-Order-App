'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';

const PASSWORD = 'brew123';
const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export default function SimplePassword({ children }: { children: React.ReactNode }) {
  const [password, setPassword] = useState('');
  const [access, setAccess] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Restore session on refresh
  useEffect(() => {
    const saved = sessionStorage.getItem('pos_access');
    if (saved === 'true') setAccess(true);
  }, []);

  // Auto-logout on inactivity
  useEffect(() => {
    if (!access) return;

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        sessionStorage.removeItem('pos_access');
        setAccess(false);
      }, TIMEOUT_MS);
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'click'];
    events.forEach(e => window.addEventListener(e, resetTimer));
    resetTimer();

    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [access]);

  if (access) return <>{children}</>;

  return (
    <div className="h-screen flex items-center justify-center bg-black">
      <div className="bg-black border border-white/20 rounded-2xl p-8 w-96 shadow-2xl">
        <div className="text-center">
          <div className="flex items-center justify-center mx-auto mb-4">
            <Image
              src="/logo.jpg"
              alt="Ocean Brew Logo"
              width={120}
              height={120}
              className="rounded-full object-cover"
              priority
            />
          </div>
          <h1 className="text-2xl font-bold text-white mb-6">Ocean Brew POS</h1>
        </div>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && document.getElementById('login-btn')?.click()}
          placeholder="Enter password"
          className="w-full border border-white/20 rounded-xl px-4 py-3 bg-black text-white placeholder-gray-500 focus:border-white/50 focus:outline-none transition-colors mb-2"
        />

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <button
          id="login-btn"
          onClick={() => {
            if (password === PASSWORD) {
              sessionStorage.setItem('pos_access', 'true');
              setAccess(true);
            } else {
              setError('Wrong password');
              setPassword('');
            }
          }}
          className="w-full bg-white text-black py-3 rounded-xl font-bold hover:bg-gray-200 transition-colors"
        >
          Enter POS
        </button>

        <p className="text-gray-500 text-xs text-center mt-4">
          Contact administrator if you forgot password
        </p>
      </div>
    </div>
  );
}
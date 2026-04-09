'use client';

import { useState } from 'react';
import Image from 'next/image';

export default function SimplePassword({ children }: { children: React.ReactNode }) {
  const [password, setPassword] = useState('');
  const [access, setAccess] = useState(false);
  const [error, setError] = useState('');

  if (access) return <>{children}</>;

  return (
    <div className="h-screen flex items-center justify-center bg-black">
      <div className="bg-black border border-white/20 rounded-2xl p-8 w-96 shadow-2xl">
        <div className="text-center">
          {/* Larger logo container */}
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
          placeholder="Enter password"
          className="w-full border border-white/20 rounded-xl px-4 py-3 bg-black text-white placeholder-gray-500 focus:border-white/50 focus:outline-none transition-colors mb-2"
        />
        
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        
        <button
          onClick={() => {
            if (password === 'brew123') { // CHANGE THIS to your password
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
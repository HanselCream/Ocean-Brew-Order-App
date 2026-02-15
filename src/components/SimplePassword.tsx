'use client';

import { useState } from 'react';

export default function SimplePassword({ children }: { children: React.ReactNode }) {
  const [password, setPassword] = useState('');
  const [access, setAccess] = useState(false);
  const [error, setError] = useState('');

  if (access) return <>{children}</>;

  return (
    <div className="h-screen flex items-center justify-center bg-sky-600">
      <div className="bg-white p-8 rounded-2xl w-96">
        <h1 className="text-2xl font-bold text-center mb-6">☕ Ocean Brew POS</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter password"
          className="w-full border-2 p-3 rounded-lg mb-2"
        />
        {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
        <button
          onClick={() => {
            if (password === 'brew123') { // CHANGE THIS
              setAccess(true);
            } else {
              setError('Wrong password');
              setPassword('');
            }
          }}
          className="w-full bg-sky-600 text-white py-3 rounded-lg font-bold"
        >
          Enter POS
        </button>
      </div>
    </div>
  );
}
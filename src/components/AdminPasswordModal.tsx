// components/AdminPasswordModal.tsx
'use client';

import React, { useState } from 'react';

interface AdminPasswordModalProps {
  isOpen: boolean;
  onSuccess: () => void;
  onCancel: () => void;
}

// Simple password - change this to whatever you want
const ADMIN_PASSWORD = 'owner123';

export default function AdminPasswordModal({ isOpen, onSuccess, onCancel }: AdminPasswordModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setError('');
      setPassword('');
      onSuccess();
    } else {
      setError('Incorrect password');
      setPassword('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4">
      <div className="bg-black border border-white/20 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
              <span className="text-2xl">🔒</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Admin Access</h2>
              <p className="text-sm text-gray-400">Enter password to continue</p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-white/20 rounded-xl px-4 py-3 text-lg bg-black text-white focus:border-white focus:outline-none"
                placeholder="Enter password"
                autoFocus
              />
              {error && (
                <p className="text-red-400 text-sm mt-2">❌ {error}</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 py-3 rounded-xl bg-white/10 font-semibold text-white hover:bg-white/20"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-3 rounded-xl bg-white font-semibold text-black hover:bg-gray-200"
              >
                Unlock
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
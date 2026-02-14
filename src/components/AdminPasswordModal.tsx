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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center">
              <span className="text-2xl">🔒</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">Admin Access</h2>
              <p className="text-sm text-gray-500">Enter password to continue</p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-lg focus:border-sky-500 focus:outline-none"
                placeholder="Enter password"
                autoFocus
              />
              {error && (
                <p className="text-red-500 text-sm mt-2 flex items-center gap-1">
                  <span>❌</span> {error}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 py-3 rounded-xl bg-gray-200 font-semibold text-gray-700 hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-3 rounded-xl bg-sky-600 font-semibold text-white hover:bg-sky-700"
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
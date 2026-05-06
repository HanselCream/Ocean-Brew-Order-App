'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';

interface AdminPasswordModalProps {
  isOpen: boolean;
  onSuccess: (password: string) => void;
  onCancel: () => void;
}

export default function AdminPasswordModal({ isOpen, onSuccess, onCancel }: AdminPasswordModalProps) {
  const { login } = useAuth();  // <-- ADD THIS
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const success = login(password);  // <-- USE login from context
    if (success) {
      setPassword('');
      setError('');
    } else {
      setError('Incorrect password');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-black border border-white/20 rounded-2xl w-full max-w-md">
        <div className="p-6 border-b border-white/20">
          <h2 className="text-xl font-bold text-white">Admin Access</h2>
          <p className="text-sm text-gray-400 mt-1">Enter password to continue</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-white/20 rounded-xl px-4 py-2 bg-black text-white focus:outline-none focus:border-white"
              autoFocus
            />
            {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 rounded-xl bg-white text-black font-semibold hover:bg-gray-200"
            >
              Login
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
'use client';

import { useState, useCallback } from 'react';
import OrderScreen from '@/screens/OrderScreen';
import QueueScreen from '@/screens/QueueScreen';
import AdminScreen from '@/screens/AdminScreen';
import DashboardScreen from '@/screens/DashboardScreen';
import ReportsScreen from '@/screens/ReportsScreen';

type Screen = 'order' | 'queue' | 'admin' | 'dashboard' | 'reports';

function NavBar({ screen, setScreen }: { screen: Screen; setScreen: (s: Screen) => void }) {
  const tabs: { key: Screen; label: string }[] = [
    { key: 'order', label: 'Order' },
    { key: 'queue', label: 'Queue' },
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'reports', label: 'Reports' },
    { key: 'admin', label: 'Admin' },
  ];
  return (
    <nav className="flex items-center bg-black text-white border-b border-white/20 px-4 h-14 shrink-0">
      <span className="font-bold text-lg mr-8 tracking-wide">Ocean Brew</span>
      <div className="flex gap-1">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setScreen(t.key)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${screen === t.key ? 'bg-white text-black' : 'hover:bg-white/10'}`}>
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

export default function OceanBrewApp() {
  const [screen, setScreen] = useState<Screen>('order');
  const [refreshKey, setRefreshKey] = useState(0);
  const handleOrderPlaced = useCallback(() => setRefreshKey(k => k + 1), []);

  return (
    <div className="h-screen flex flex-col bg-black overflow-hidden">
      <NavBar screen={screen} setScreen={setScreen} />
      {screen === 'order' && <OrderScreen onOrderPlaced={handleOrderPlaced} />}
      {screen === 'queue' && <QueueScreen refreshKey={refreshKey} />}
      {screen === 'admin' && <AdminScreen />}
      {screen === 'dashboard' && <DashboardScreen />}
      {screen === 'reports' && <ReportsScreen />}
    </div>
  );
}
'use client';

import { useState, useCallback, useEffect } from 'react';  // ← ADD useEffect
import OrderScreen from '@/screens/OrderScreen';
import QueueScreen from '@/screens/QueueScreen';
import AdminScreen from '@/screens/AdminScreen';
import DashboardScreen from '@/screens/DashboardScreen';
import ReportsScreen from '@/screens/ReportsScreen';
import InventoryScreen from '@/screens/InventoryScreen';

type Screen = 'order' | 'queue' | 'admin' | 'dashboard' | 'reports' | 'inventory';

function NavBar({ screen, setScreen }: { screen: Screen; setScreen: (s: Screen) => void }) {
  const tabs: { key: Screen; label: string }[] = [
    { key: 'order', label: 'Order' },
    { key: 'queue', label: 'Queue' },
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'reports', label: 'Reports' },
    { key: 'inventory', label: 'Inventory' }, 
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

  // Load saved tab from localStorage on mount
  useEffect(() => {
    const savedTab = localStorage.getItem('selectedTab') as Screen;
    if (savedTab && ['order', 'queue', 'admin', 'dashboard', 'reports', 'inventory'].includes(savedTab)) {
      setScreen(savedTab);
    }
  }, []);

  // Save tab to localStorage whenever it changes
  const handleSetScreen = (newScreen: Screen) => {
    setScreen(newScreen);
    localStorage.setItem('selectedTab', newScreen);
  };

  return (
    <div className="h-screen flex flex-col bg-black overflow-hidden">
      <NavBar screen={screen} setScreen={handleSetScreen} />
      {screen === 'order' && <OrderScreen onOrderPlaced={handleOrderPlaced} />}
      {screen === 'queue' && <QueueScreen refreshKey={refreshKey} />}
      {screen === 'admin' && <AdminScreen />}
      {screen === 'dashboard' && <DashboardScreen />}
      {screen === 'reports' && <ReportsScreen onSwitchToAdmin={() => handleSetScreen('admin')} />}
      {screen === 'inventory' && <InventoryScreen />}
    </div>
  );
}
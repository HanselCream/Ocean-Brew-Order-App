'use client';

import { useState, useEffect, useMemo } from 'react';
import DateRangePicker from '@/components/DateRangePicker';
import ExcelExport from '@/lib/excelExport';
import { Order } from '@/lib/types';
import {
  getOrders, getDatabaseStats, getOrdersByDateRange, getDailySales,
} from '@/lib/supabaseStore';

// Get YYYY-MM-DD using LOCAL calendar date, not UTC (avoids timezone shift)
const toLocalDateStr = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export default function ReportsScreen() {
  const [dailySales, setDailySales] = useState<{ date: string; total: number; orderCount: number }[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
   const [exportSuccess, setExportSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAllItems, setShowAllItems] = useState(false);

  useEffect(() => {
    loadOrders();
    getDailySales().then(setDailySales);
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const allOrders = await getOrders();
      setOrders(allOrders);
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (startDate: Date, endDate: Date, type: 'csv' | 'json') => {
    const ordersInRange = await getOrdersByDateRange(startDate, endDate);
    if (ordersInRange.length === 0) {
      alert(`No orders found from ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`);
      return;
    }
    const filename = `ocean-brew-orders_${startDate.toISOString().split('T')[0]}_to_${endDate.toISOString().split('T')[0]}`;
    if (type === 'csv') ExcelExport.exportToCSV(ordersInRange, filename);
    else ExcelExport.exportToJSON(ordersInRange, filename);
    setExportSuccess(`✅ Exported ${ordersInRange.length} orders`);
    setTimeout(() => setExportSuccess(''), 5000);
    setShowDatePicker(false);
  };
// ─── WEEK NAVIGATION STATE ──────────────────────────────────────────────
const [weekOffset, setWeekOffset] = useState(0); // 0 = current week, -1 = last week, 1 = next week

// ─── HELPER: Get Monday of week by offset ──────────────────────────────
const getStartOfWeek = (date: Date, offset: number = 0): Date => {
  const d = new Date(date);
  // Add offset weeks
  d.setDate(d.getDate() + (offset * 7));
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getEndOfWeek = (startOfWeek: Date): Date => {
  const d = new Date(startOfWeek);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
};

// ─── FILTER: Orders from selected week ──────────────────────────────────
const currentWeekOrders = useMemo(() => {
  const now = new Date();
  const start = getStartOfWeek(now, weekOffset);
  const end = getEndOfWeek(start);
  
  return orders.filter(o => {
    const orderDate = new Date(o.createdAt);
    return o.status === 'done' && orderDate >= start && orderDate <= end;
  });
}, [orders, weekOffset]);

  // ─── WEEKLY SALES DATA ──────────────────────────────────────────────────
const weekDays = useMemo(() => {
  const start = getStartOfWeek(new Date(), weekOffset);
    const days = [];
for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dateStr = toLocalDateStr(d);
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const dayNum = d.getDate();
      const month = d.toLocaleDateString('en-US', { month: 'short' });
      
      // Find sales for this day
      const daySales = dailySales.find(s => s.date === dateStr);
      const total = daySales?.total || 0;
      const count = daySales?.orderCount || 0;
      
      // Also count from currentWeekOrders directly (compare using LOCAL date)
      const orderCount = currentWeekOrders.filter(o => 
        toLocalDateStr(new Date(o.createdAt)) === dateStr
      ).length;
      
      days.push({
        date: dateStr,
        display: `${dayName} ${dayNum}`,
        fullDisplay: `${dayName} ${month} ${dayNum}`,
        total,
        orderCount: orderCount || count,
        isToday: dateStr === toLocalDateStr(new Date()),
      });
    }
    return days;
  }, [dailySales, currentWeekOrders]);

  const weekTotal = weekDays.reduce((sum, d) => sum + d.total, 0);
  const weekOrderCount = weekDays.reduce((sum, d) => sum + d.orderCount, 0);
  const maxDayRevenue = weekDays.length > 0 ? Math.max(...weekDays.map(d => d.total)) : 1;

// ─── STAFF PERFORMANCE (Current Week Only) ────────────────────────────
  const NON_DRINK_CATEGORIES = ['Add Ons', 'Appetizers', 'Merchandise', 'Pasalubong', 'Routine', 'Supplies'];
  const staffPunched: Record<string, number> = {};
  const staffMade: Record<string, number> = {};
  currentWeekOrders.forEach(o => {
    const p = o.punchedBy?.trim() || 'Unattributed';
    const m = o.madeBy?.trim() || 'Unattributed';
    const drinkCount = o.items
      .filter(i => !NON_DRINK_CATEGORIES.includes(i.category))
      .reduce((s, i) => s + i.quantity, 0);
    staffPunched[p] = (staffPunched[p] || 0) + 1;
    staffMade[m] = (staffMade[m] || 0) + drinkCount;
  });
const sortedPunched = Object.entries(staffPunched).filter(([name]) => name !== 'Unattributed').sort((a, b) => b[1] - a[1]);
  const sortedMade = Object.entries(staffMade).filter(([name]) => name !== 'Unattributed').sort((a, b) => b[1] - a[1]);

  // ─── SALES BY ITEM (Current Week Only) ────────────────────────────────
  const salesByItem: Record<string, { name: string; qty: number; revenue: number }> = {};
  currentWeekOrders.forEach(o => {
    o.items.forEach(i => {
      if (!salesByItem[i.menuItemId]) salesByItem[i.menuItemId] = { name: i.name, qty: 0, revenue: 0 };
      salesByItem[i.menuItemId].qty += i.quantity;
      salesByItem[i.menuItemId].revenue += i.lineTotal;
    });
  });
  const sortedItems = Object.values(salesByItem).sort((a, b) => b.revenue - a.revenue);
  const maxItemRevenue = sortedItems.length > 0 ? Math.max(...sortedItems.map(i => i.revenue)) : 1;

  // ─── SALES BY CATEGORY (Current Week Only) ────────────────────────────
  const salesByCat: Record<string, number> = {};
  currentWeekOrders.forEach(o => {
    o.items.forEach(i => { salesByCat[i.category] = (salesByCat[i.category] || 0) + i.lineTotal; });
  });
const sortedCats = Object.entries(salesByCat).sort((a, b) => b[1] - a[1]);
  const maxCatRevenue = sortedCats.length > 0 ? Math.max(...sortedCats.map(c => c[1])) : 1;

  // ─── SALES BY PAYMENT METHOD (Current Week Only) ───────────────────────
const salesByPaymentMethod = useMemo(() => {
    const totals: Record<string, { total: number; count: number }> = { Cash: { total: 0, count: 0 }, QR: { total: 0, count: 0 } };
    currentWeekOrders.forEach(o => {
      const method = (o.paymentMethod || 'Cash').split('|')[0] || 'Cash';
      if (!totals[method]) totals[method] = { total: 0, count: 0 };
      totals[method].total += o.total;
      totals[method].count += 1;
    });
    return totals;
  }, [currentWeekOrders]);
  const totalRevenueAllMethods = (salesByPaymentMethod.Cash?.total || 0) + (salesByPaymentMethod.QR?.total || 0);
  const totalOrdersAllMethods = (salesByPaymentMethod.Cash?.count || 0) + (salesByPaymentMethod.QR?.count || 0);

  // ─── WEEK RANGE DISPLAY ─────────────────────────────────────────────────
const weekStart = getStartOfWeek(new Date(), weekOffset);
const weekEnd = getEndOfWeek(weekStart);
  const weekRangeStr = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  if (loading) return (
    <div className="flex-1 p-6 overflow-y-auto bg-black">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="h-8 w-56 bg-white/10 rounded-lg animate-pulse mb-2" />
          <div className="h-4 w-32 bg-white/10 rounded animate-pulse" />
        </div>
        <div className="h-9 w-40 bg-white/10 rounded-xl animate-pulse" />
      </div>
      <div className="h-20 bg-white/5 border border-white/10 rounded-xl animate-pulse mb-6" />
      <div className="flex gap-2 mb-6">
        {[1,2,3].map(i => <div key={i} className="h-10 w-32 bg-white/10 rounded-lg animate-pulse" />)}
      </div>
      <div className="bg-black border border-white/10 rounded-xl overflow-hidden">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="flex gap-4 px-4 py-3 border-b border-white/10">
            <div className="h-4 w-32 bg-white/10 rounded animate-pulse" />
            <div className="h-4 w-40 bg-white/10 rounded animate-pulse" />
            <div className="h-4 w-20 bg-white/10 rounded animate-pulse ml-auto" />
            <div className="h-4 w-16 bg-white/10 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex-1 p-6 overflow-y-auto bg-black">
<div className="flex items-start justify-between mb-6">
  <div>
    <h1 className="text-2xl font-bold text-white">Sales Reports</h1>
    <div className="flex items-center gap-3 mt-1">
      <button onClick={() => setWeekOffset(prev => prev - 1)}
        className="px-3 py-1 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20">← Prev</button>
      <p className="text-sm text-gray-400">
        {weekOffset === 0 ? 'This Week' : weekOffset === -1 ? 'Last Week' : `${Math.abs(weekOffset)} weeks ago`} · {weekRangeStr}
      </p>
      <button onClick={() => setWeekOffset(prev => Math.min(0, prev + 1))}
        disabled={weekOffset === 0}
        className="px-3 py-1 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 disabled:opacity-30">Next →</button>
    </div>
  </div>
  <div className="flex gap-3">
          <button
            onClick={async () => {
              const stats = await getDatabaseStats();
              alert(`📊 Database Stats\n\nTotal Orders: ${stats.totalOrders}\nOldest: ${stats.dateRange.oldest.toLocaleDateString()}\nNewest: ${stats.dateRange.newest.toLocaleDateString()}`);
            }}
            className="px-4 py-2 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors flex items-center gap-2 border border-white/20"
          >
           DB Stats
          </button>
          <button onClick={() => setShowDatePicker(true)} className="px-4 py-2 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors flex items-center gap-2 border border-white/20">
            Export Orders
          </button>
        </div>
      </div>

      {exportSuccess && <div className="mb-4 p-3 bg-green-900/30 border border-green-800 text-green-400 rounded-lg">{exportSuccess}</div>}

      {/* ─── WEEK SUMMARY CARDS ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-gray-800 to-black rounded-2xl border border-white/20 p-5 text-white">
          <p className="text-sm opacity-80 mb-1">Week Total</p>
          <p className="text-3xl font-bold">₱{weekTotal.toFixed(2)}</p>
          <p className="text-sm text-gray-400 mt-1">{weekOrderCount} orders</p>
        </div>
<div className="bg-black border border-white/20 rounded-2xl p-5 text-white">
          <p className="text-sm text-gray-400 mb-1">Top Performing Day</p>
          {weekDays.length > 0 && (() => {
            const best = weekDays.reduce((a, b) => a.total > b.total ? a : b);
            return (
              <>
                <p className="text-xl font-bold">{best.fullDisplay}</p>
                <p className="text-lg font-semibold text-green-400">₱{best.total.toFixed(2)}</p>
                <p className="text-xs text-gray-500">{best.orderCount} orders</p>
              </>
            );
          })()}
        </div>
        <div className="bg-black border border-white/20 rounded-2xl p-5 text-white">
          <p className="text-sm text-gray-400 mb-1">Average Daily</p>
          <p className="text-2xl font-bold">₱{(weekTotal / 7).toFixed(2)}</p>
          <p className="text-xs text-gray-500">{Math.round(weekOrderCount / 7)} orders/day</p>
        </div>
<div className="bg-black border border-white/20 rounded-2xl p-5 text-white">
          <p className="text-sm text-gray-400 mb-1">Best Selling Item</p>
          {sortedItems.length > 0 ? (
            <>
              <p className="text-lg font-bold truncate">{sortedItems[0].name}</p>
              <p className="text-sm text-gray-400">₱{sortedItems[0].revenue.toFixed(2)}</p>
            </>
          ) : (
            <p className="text-gray-500">—</p>
          )}
        </div>
      </div>

{/* ─── PAYMENT METHOD BREAKDOWN ────────────────────────────────── */}
<div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          <div className="bg-black border border-white/20 rounded-lg px-3 py-1 text-white flex items-center justify-between">
            <p className="text-xs text-gray-400">Cash</p>
            <p className="text-sm font-bold">₱{(salesByPaymentMethod.Cash?.total || 0).toFixed(0)}</p>
          </div>
          <div className="bg-black border border-white/20 rounded-lg px-3 py-1 text-white flex items-center justify-between">
            <p className="text-xs text-gray-400">GCash / Maya</p>
            <p className="text-sm font-bold">₱{(salesByPaymentMethod.QR?.total || 0).toFixed(0)}</p>
          </div>
        </div>

       {/* ─── STAFF PERFORMANCE ────────────────────────────────────────── */}
<div className="bg-black border border-white/20 rounded-2xl p-6 mb-6">
        <h2 className="font-bold text-lg text-white mb-5">Staff Performance</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div>
            <h3 className="text-sm font-semibold text-gray-400 mb-4">Orders Punched</h3>
            {sortedPunched.length === 0 && <p className="text-gray-500 text-sm">No data yet</p>}
            <div className="space-y-4">
              {sortedPunched.map(([name, count], i) => (
                <div key={name}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-500 w-4">{i + 1}</span>
                    <span className="text-sm font-semibold text-white flex-1">{name}</span>
                    <span className="text-xs font-bold text-white">{count} orders</span>
                  </div>
                  <div className="ml-6 bg-white/10 rounded-full h-2 overflow-hidden">
                    <div className="bg-white h-full rounded-full"
                      style={{ width: `${(count / (sortedPunched[0]?.[1] || 1)) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-400 mb-4">Drinks Made</h3>
            {sortedMade.length === 0 && <p className="text-gray-500 text-sm">No data yet</p>}
            <div className="space-y-4">
              {sortedMade.map(([name, count], i) => (
                <div key={name}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-500 w-4">{i + 1}</span>
                    <span className="text-sm font-semibold text-white flex-1">{name}</span>
                    <span className="text-xs font-bold text-white">{count} drinks</span>
                  </div>
                  <div className="ml-6 bg-white/10 rounded-full h-2 overflow-hidden">
                    <div className="bg-amber-500 h-full rounded-full"
                      style={{ width: `${(count / (sortedMade[0]?.[1] || 1)) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─── DAILY SALES (7 Days) ────────────────────────────────────── */}
      <div className="bg-black border border-white/20 rounded-2xl p-5 mb-6">
        <h2 className="font-bold text-lg text-white mb-4">
          This Week <span className="text-sm font-normal text-gray-400">(Mon - Sun)</span>
        </h2>
        <div className="space-y-2">
          {weekDays.map((day) => (
            <div key={day.date} className={`flex items-center gap-3 ${day.isToday ? 'bg-white/5 rounded-lg px-3 py-1 -mx-3' : ''}`}>
              <span className={`w-28 text-sm font-medium shrink-0 ${day.isToday ? 'text-white font-bold' : 'text-gray-400'}`}>
                {day.fullDisplay} {day.isToday && <span className="text-xs text-green-400">(Today)</span>}
              </span>
              <div className="flex-1 bg-white/10 rounded-full h-6 overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all ${day.total > 0 ? 'bg-white' : 'bg-white/20'}`} 
                  style={{ width: `${maxDayRevenue > 0 ? (day.total / maxDayRevenue) * 100 : 0}%` }} 
                />
              </div>
              <span className="w-24 text-right text-sm font-bold text-white">₱{day.total.toFixed(0)}</span>
              <span className="w-12 text-right text-xs text-gray-500">{day.orderCount}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-white/10 flex justify-between text-sm">
          <span className="text-gray-400">Total: {weekOrderCount} punched</span>
          <span className="font-bold text-white">₱{weekTotal.toFixed(2)}</span>
        </div>
      </div>

      {/* ─── SALES BY ITEM ────────────────────────────────────────────── */}
     {sortedItems.length > 0 && (
        <div className="bg-black border border-white/20 rounded-2xl p-5 mb-6">
          <h2 className="font-bold text-lg text-white mb-4">Sales by Item</h2>
          <div className="space-y-2">
            {(showAllItems ? sortedItems : sortedItems.slice(0, 15)).map((item, index) => (
              <div key={`${item.name}-${index}`} className="flex items-center gap-3">
                <span className="w-44 text-sm font-medium text-gray-400 shrink-0 truncate">{item.name}</span>
                <div className="flex-1 bg-white/10 rounded-full h-6 overflow-hidden">
                  <div className="bg-green-500 h-full rounded-full transition-all" style={{ width: `${(item.revenue / maxItemRevenue) * 100}%` }} />
                </div>
                <span className="w-16 text-right text-xs text-gray-500">{item.qty} sold</span>
                <span className="w-24 text-right text-sm font-bold text-white">₱{item.revenue.toFixed(0)}</span>
              </div>
            ))}
          </div>
          {sortedItems.length > 15 && (
            <button
              onClick={() => setShowAllItems(prev => !prev)}
              className="mt-3 w-full py-2 rounded-lg text-xs font-semibold text-gray-400 hover:text-white hover:bg-white/5 border border-white/10 transition-colors"
            >
              {showAllItems ? '▲ Show Less' : `▼ Show More (${sortedItems.length - 15} more)`}
            </button>
          )}
        </div>
      )}

      {/* ─── SALES BY CATEGORY ────────────────────────────────────────── */}
      {sortedCats.length > 0 && (
        <div className="bg-black border border-white/20 rounded-2xl p-5 mb-6">
          <h2 className="font-bold text-lg text-white mb-4">Sales by Category</h2>
          <div className="space-y-2">
            {sortedCats.map(([cat, total]) => (
              <div key={cat} className="flex items-center gap-3">
                <span className="w-44 text-sm font-medium text-gray-400 shrink-0">{cat}</span>
                <div className="flex-1 bg-white/10 rounded-full h-6 overflow-hidden">
                  <div className="bg-amber-600 h-full rounded-full transition-all" style={{ width: `${(total / maxCatRevenue) * 100}%` }} />
                </div>
                <span className="w-24 text-right text-sm font-bold text-white">₱{total.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showDatePicker && <DateRangePicker onExport={handleExport} onClose={() => setShowDatePicker(false)} />}
    </div>
  );
}
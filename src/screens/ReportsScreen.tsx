'use client';

import { useState, useEffect } from 'react';
import DateRangePicker from '@/components/DateRangePicker';
import ExcelExport from '@/lib/excelExport';
import { Order } from '@/lib/types';
import {
  getOrders, getDatabaseStats, getOrdersByDateRange, getDailySales,
} from '@/lib/supabaseStore';

export default function ReportsScreen() {
  const [dailySales, setDailySales] = useState<{ date: string; total: number; orderCount: number }[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [exportSuccess, setExportSuccess] = useState('');
  const [loading, setLoading] = useState(true);

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

  // ── All derived data AFTER hooks ──
  const doneOrders = orders.filter(o => o.status === 'done');

  const staffPunched: Record<string, number> = {};
  const staffMade: Record<string, number> = {};
  doneOrders.forEach(o => {
    const p = (o as any).punchedBy;
    const m = (o as any).madeBy;
    const drinkCount = o.items.reduce((s, i) => s + i.quantity, 0);
    if (p) staffPunched[p] = (staffPunched[p] || 0) + 1;
    if (m) staffMade[m] = (staffMade[m] || 0) + drinkCount;
  });
  const sortedPunched = Object.entries(staffPunched).sort((a, b) => b[1] - a[1]);
  const sortedMade = Object.entries(staffMade).sort((a, b) => b[1] - a[1]);

  const sortedDays = dailySales.map(d => [d.date, d.total] as [string, number]);
  const maxDayRevenue = dailySales.length > 0 ? Math.max(...dailySales.map(d => d.total)) : 1;

  const salesByMonth: Record<string, number> = {};
  doneOrders.forEach(o => {
    const month = o.createdAt.slice(0, 7);
    salesByMonth[month] = (salesByMonth[month] || 0) + o.total;
  });
  const sortedMonths = Object.entries(salesByMonth).sort((a, b) => b[0].localeCompare(a[0]));

  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentMonthTotal = salesByMonth[currentMonth] || 0;
  const prevDate = new Date();
  prevDate.setMonth(prevDate.getMonth() - 1);
  const prevMonth = prevDate.toISOString().slice(0, 7);
  const prevMonthTotal = salesByMonth[prevMonth] || 0;
  const monthOverMonthChange = prevMonthTotal > 0 ? ((currentMonthTotal - prevMonthTotal) / prevMonthTotal * 100).toFixed(1) : '0';

  const salesByItem: Record<string, { name: string; qty: number; revenue: number }> = {};
  doneOrders.forEach(o => {
    o.items.forEach(i => {
      if (!salesByItem[i.menuItemId]) salesByItem[i.menuItemId] = { name: i.name, qty: 0, revenue: 0 };
      salesByItem[i.menuItemId].qty += i.quantity;
      salesByItem[i.menuItemId].revenue += i.lineTotal;
    });
  });
  const sortedItems = Object.values(salesByItem).sort((a, b) => b.revenue - a.revenue);

  const salesByCat: Record<string, number> = {};
  doneOrders.forEach(o => {
    o.items.forEach(i => { salesByCat[i.category] = (salesByCat[i.category] || 0) + i.lineTotal; });
  });
  const sortedCats = Object.entries(salesByCat).sort((a, b) => b[1] - a[1]);

  const maxItemRevenue = sortedItems.length > 0 ? Math.max(...sortedItems.map(i => i.revenue)) : 1;

  const PIE_COLORS = ['#ffffff', '#a3a3a3', '#525252', '#d4a574', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'];
  const totalCatRevenue = sortedCats.reduce((s, [, v]) => s + v, 0);
  let cumulativeAngle = 0;
  const pieSlices = sortedCats.map(([cat, total], i) => {
    const pct = total / totalCatRevenue;
    const angle = pct * 360;
    const startAngle = cumulativeAngle;
    cumulativeAngle += angle;
    const start = startAngle * (Math.PI / 180);
    const end = (startAngle + angle) * (Math.PI / 180);
    const r = 80;
    const cx = 100, cy = 100;
    const x1 = cx + r * Math.sin(start);
    const y1 = cy - r * Math.cos(start);
    const x2 = cx + r * Math.sin(end);
    const y2 = cy - r * Math.cos(end);
    const largeArc = angle > 180 ? 1 : 0;
    const path = `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} Z`;
    return { cat, total, pct, path, color: PIE_COLORS[i % PIE_COLORS.length] };
  });

  if (loading) return <div className="flex-1 p-6 bg-black text-white">Loading reports...</div>;

  return (
    <div className="flex-1 p-6 overflow-y-auto bg-black">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Sales Reports</h1>
          <p className="text-sm text-gray-400 mt-1">Last 30 days • {orders.length} total orders</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={async () => {
              const stats = await getDatabaseStats();
              alert(`📊 Database Stats\n\nTotal Orders: ${stats.totalOrders}\nOldest: ${stats.dateRange.oldest.toLocaleDateString()}\nNewest: ${stats.dateRange.newest.toLocaleDateString()}`);
            }}
            className="px-4 py-2 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors flex items-center gap-2 border border-white/20"
          >
            <span>📊</span> DB Stats
          </button>
          <button onClick={() => setShowDatePicker(true)} className="px-4 py-2 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors flex items-center gap-2 border border-white/20">
            <span>⬇️</span> Export Orders
          </button>
        </div>
      </div>

      {exportSuccess && <div className="mb-4 p-3 bg-green-900/30 border border-green-800 text-green-400 rounded-lg">{exportSuccess}</div>}

      {orders.length === 0 && (
        <div className="bg-black border border-white/20 rounded-2xl p-12 text-center">
          <p className="text-gray-500 text-lg">No orders to report</p>
          <p className="text-gray-600 text-sm mt-2">Orders will appear here after you generate them</p>
        </div>
      )}

      {sortedMonths.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-br from-gray-800 to-black rounded-2xl border border-white/20 p-5 text-white">
            <p className="text-sm opacity-80 mb-1">Current Month</p>
            <p className="text-3xl font-bold">{currentMonth}</p>
            <p className="text-2xl font-bold mt-2">₱{currentMonthTotal.toFixed(2)}</p>
            <div className="flex items-center mt-2 text-sm">
              <span className={monthOverMonthChange >= '0' ? 'text-green-400' : 'text-red-400'}>{monthOverMonthChange}% vs last month</span>
            </div>
          </div>
          <div className="bg-black border border-white/20 rounded-2xl p-5 col-span-2">
            <h3 className="font-semibold text-gray-300 mb-3">Monthly Totals</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
              {sortedMonths.map(([month, total]) => {
                const [year, mon] = month.split('-');
                const monthName = new Date(parseInt(year), parseInt(mon) - 1).toLocaleString('default', { month: 'short' });
                return (
                  <div key={month} className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">{monthName} {year}</span>
                    <span className="font-semibold text-white">₱{total.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {sortedDays.length > 0 && (
        <div className="bg-black border border-white/20 rounded-2xl p-5 mb-6">
          <h2 className="font-bold text-lg text-white mb-4">Daily Sales</h2>
          <div className="flex items-end gap-2 h-48 overflow-x-auto pb-2">
            {sortedDays.map(([day, total]) => {
              const heightPct = Math.max(4, (total / maxDayRevenue) * 100);
              const shortDay = day.slice(5);
              return (
                <div key={day} className="flex flex-col items-center gap-1 min-w-[48px] flex-1">
                  <span className="text-xs font-bold text-white">₱{(total / 1000).toFixed(1)}k</span>
                  <div className="w-full rounded-t-lg bg-white transition-all" style={{ height: `${heightPct}%` }} />
                  <span className="text-xs text-gray-500 whitespace-nowrap">{shortDay}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {sortedItems.length > 0 && (
        <div className="bg-black border border-white/20 rounded-2xl p-5 mb-6">
          <h2 className="font-bold text-lg text-white mb-4">Sales by Item</h2>
          <div className="space-y-2">
            {sortedItems.slice(0, 20).map((item, index) => (
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
        </div>
      )}

      {sortedCats.length > 0 && (
        <div className="bg-black border border-white/20 rounded-2xl p-5 mb-6">
          <h2 className="font-bold text-lg text-white mb-4">Sales by Category</h2>
          <div className="flex flex-col md:flex-row items-center gap-8">
            <svg viewBox="0 0 200 200" className="w-48 h-48 shrink-0">
              {pieSlices.map((slice, i) => (
                <path key={i} d={slice.path} fill={slice.color} stroke="#000" strokeWidth="1" />
              ))}
              <circle cx="100" cy="100" r="40" fill="#000" />
              <text x="100" y="96" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">TOTAL</text>
              <text x="100" y="108" textAnchor="middle" fill="white" fontSize="9" fontWeight="bold">₱{(totalCatRevenue / 1000).toFixed(1)}k</text>
            </svg>
            <div className="flex-1 space-y-2 w-full">
              {pieSlices.map((slice, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: slice.color }} />
                  <span className="text-sm text-gray-400 flex-1">{slice.cat}</span>
                  <span className="text-xs text-gray-500">{(slice.pct * 100).toFixed(1)}%</span>
                  <span className="text-sm font-bold text-white w-24 text-right">₱{slice.total.toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {(sortedPunched.length > 0 || sortedMade.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-black border border-white/20 rounded-2xl p-5">
            <h2 className="font-bold text-lg text-white mb-4">🖊️ Most Orders Punched</h2>
            <div className="space-y-3">
              {sortedPunched.map(([name, count], i) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="text-lg font-bold text-gray-500 w-6">{i + 1}</span>
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-semibold text-white">{name}</span>
                      <span className="text-sm font-bold text-white">{count} orders</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-2">
                      <div className="bg-white h-2 rounded-full" style={{ width: `${(count / (sortedPunched[0]?.[1] || 1)) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
              {sortedPunched.length === 0 && <p className="text-gray-500 text-sm">No data yet</p>}
            </div>
          </div>
          <div className="bg-black border border-white/20 rounded-2xl p-5">
            <h2 className="font-bold text-lg text-white mb-4">☕ Most Drinks Made</h2>
            <div className="space-y-3">
              {sortedMade.map(([name, count], i) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="text-lg font-bold text-gray-500 w-6">{i + 1}</span>
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-semibold text-white">{name}</span>
                      <span className="text-sm font-bold text-white">{count} drinks</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-2">
                      <div className="bg-amber-500 h-2 rounded-full" style={{ width: `${(count / (sortedMade[0]?.[1] || 1)) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
              {sortedMade.length === 0 && <p className="text-gray-500 text-sm">No data yet</p>}
            </div>
          </div>
        </div>
      )}

      {showDatePicker && <DateRangePicker onExport={handleExport} onClose={() => setShowDatePicker(false)} />}
    </div>
  );
}
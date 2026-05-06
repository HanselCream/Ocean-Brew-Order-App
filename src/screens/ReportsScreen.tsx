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
  const [activeReport, setActiveReport] = useState<'overview' | 'items' | 'category' | 'staff'>('overview');

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

  const doneOrders = orders.filter(o => o.status === 'done');

  const staffPunched: Record<string, number> = {};
  const staffMade: Record<string, number> = {};
  doneOrders.forEach(o => {
    const p = o.punchedBy;
    const m = o.madeBy;
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
  const monthOverMonthChange = prevMonthTotal > 0
    ? ((currentMonthTotal - prevMonthTotal) / prevMonthTotal * 100).toFixed(1)
    : '0';

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
  const maxCatRevenue = sortedCats.length > 0 ? Math.max(...sortedCats.map(c => c[1])) : 1;

  const totalRevenue = doneOrders.reduce((s, o) => s + o.total, 0);
  const totalQty = doneOrders.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0);
  const avgOrder = doneOrders.length > 0 ? totalRevenue / doneOrders.length : 0;

  const PIE_COLORS = ['#a78bfa', '#34d399', '#fb923c', '#60a5fa', '#f472b6', '#facc15', '#4ade80', '#e879f9'];
  const totalCatRevenue = sortedCats.reduce((s, [, v]) => s + v, 0);
  let cumulativeAngle = 0;
  const pieSlices = sortedCats.map(([cat, total], i) => {
    const pct = total / totalCatRevenue;
    const angle = pct * 360;
    const startAngle = cumulativeAngle;
    cumulativeAngle += angle;
    const start = startAngle * (Math.PI / 180);
    const end = (startAngle + angle) * (Math.PI / 180);
    const r = 80; const cx = 100; const cy = 100;
    const x1 = cx + r * Math.sin(start); const y1 = cy - r * Math.cos(start);
    const x2 = cx + r * Math.sin(end); const y2 = cy - r * Math.cos(end);
    const largeArc = angle > 180 ? 1 : 0;
    const path = `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} Z`;
    return { cat, total, pct, path, color: PIE_COLORS[i % PIE_COLORS.length] };
  });

  const MOM = parseFloat(monthOverMonthChange);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center bg-black">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-500 text-sm">Loading reports...</p>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-black">

      {/* ── TOP HEADER ── */}
      <div className="px-5 pt-4 pb-3 border-b border-white/10 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">Sales Reports</h1>
            <p className="text-xs text-gray-500 mt-0.5">{doneOrders.length} completed orders · Ocean Brew</p>
          </div>
          <button onClick={() => setShowDatePicker(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs font-semibold hover:bg-white/20 border border-white/20 transition-colors">
            ⬇️ Export
          </button>
        </div>

        {/* KPI CARDS */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { label: 'Total Revenue', value: `₱${totalRevenue.toLocaleString()}`, sub: `${doneOrders.length} orders`, color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20' },
            { label: 'This Month', value: `₱${currentMonthTotal.toLocaleString()}`, sub: `${MOM >= 0 ? '+' : ''}${monthOverMonthChange}% vs last mo.`, color: MOM >= 0 ? 'text-emerald-400' : 'text-red-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
            { label: 'Avg. Order', value: `₱${avgOrder.toFixed(0)}`, sub: 'per transaction', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
            { label: 'Items Sold', value: totalQty.toLocaleString(), sub: 'total quantity', color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/20' },
          ].map(card => (
            <div key={card.label} className={`rounded-xl p-3 border ${card.bg}`}>
              <p className="text-xs text-gray-400 mb-1">{card.label}</p>
              <p className={`text-base font-bold ${card.color}`}>{card.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* TABS */}
        <div className="flex gap-1">
          {(['overview', 'items', 'category', 'staff'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveReport(tab)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${activeReport === tab
                ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20'
                : 'text-gray-400 hover:text-white hover:bg-white/10'}`}>
              {tab === 'overview' ? '📊 Overview' : tab === 'items' ? '🏆 Items' : tab === 'category' ? '🍩 Category' : '👥 Staff'}
            </button>
          ))}
        </div>
      </div>

      {exportSuccess && (
        <div className="mx-5 mt-3 p-2 bg-emerald-900/30 border border-emerald-800 text-emerald-400 rounded-lg text-xs">{exportSuccess}</div>
      )}

      {/* ── TAB CONTENT ── */}
      <div className="flex-1 overflow-y-auto p-5 pt-4 space-y-4">

        {/* OVERVIEW */}
        {activeReport === 'overview' && (
          <>
            {/* Daily Bar Chart */}
            {sortedDays.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-white">Sales Trend</h3>
                  <span className="text-xs text-gray-500">Last {Math.min(sortedDays.length, 14)} days</span>
                </div>
                <div className="flex items-end gap-1.5 h-36">
                  {sortedDays.slice(-14).map(([day, total]) => {
                    const heightPct = Math.max(4, (total / maxDayRevenue) * 100);
                    const isToday = day === new Date().toISOString().slice(0, 10);
                    return (
                      <div key={day} className="flex flex-col items-center gap-1 flex-1 min-w-0 group">
                        <span className="text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" style={{ fontSize: '9px' }}>
                          ₱{(total / 1000).toFixed(1)}k
                        </span>
                        <div className="w-full relative">
                          <div
                            className={`w-full rounded-t-md transition-all ${isToday ? 'bg-violet-500' : 'bg-white/30 hover:bg-white/50'}`}
                            style={{ height: `${heightPct * 0.9}px` }}
                          />
                        </div>
                        <span className="text-gray-600 whitespace-nowrap truncate w-full text-center" style={{ fontSize: '9px' }}>{day.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Monthly breakdown */}
            {sortedMonths.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-white mb-4">Monthly Breakdown</h3>
                <div className="space-y-3">
                  {sortedMonths.map(([month, total]) => {
                    const [year, mon] = month.split('-');
                    const monthName = new Date(parseInt(year), parseInt(mon) - 1).toLocaleString('default', { month: 'long' });
                    const maxMonth = Math.max(...sortedMonths.map(([, v]) => v));
                    const pct = (total / maxMonth) * 100;
                    const isCurrent = month === currentMonth;
                    return (
                      <div key={month} className="flex items-center gap-3">
                        <div className="w-20 shrink-0">
                          <span className={`text-xs font-semibold ${isCurrent ? 'text-violet-400' : 'text-gray-400'}`}>{monthName.slice(0, 3)} {year.slice(2)}</span>
                        </div>
                        <div className="flex-1 bg-white/5 rounded-full h-5 overflow-hidden relative">
                          <div
                            className={`h-full rounded-full transition-all ${isCurrent ? 'bg-violet-500/70' : 'bg-white/20'}`}
                            style={{ width: `${pct}%` }}
                          />
                          <span className="absolute inset-0 flex items-center px-2" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                        <span className={`text-xs font-bold w-24 text-right ${isCurrent ? 'text-violet-400' : 'text-white'}`}>
                          ₱{total.toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* ITEMS */}
        {activeReport === 'items' && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">Top Items by Revenue</h3>
              <span className="text-xs text-gray-500">{sortedItems.length} items</span>
            </div>
            {sortedItems.length === 0 && <p className="text-gray-500 text-sm py-8 text-center">No data yet</p>}
            <div className="space-y-2.5">
              {sortedItems.slice(0, 20).map((item, index) => {
                const pct = (item.revenue / maxItemRevenue) * 100;
                const medals = ['🥇', '🥈', '🥉'];
                return (
                  <div key={`${item.name}-${index}`} className="group">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs w-5 shrink-0 text-center">
                        {index < 3 ? medals[index] : <span className="text-gray-600">{index + 1}</span>}
                      </span>
                      <span className="text-xs font-medium text-gray-200 flex-1 truncate">{item.name}</span>
                      <span className="text-xs text-gray-500">{item.qty}x</span>
                      <span className="text-xs font-bold text-white w-20 text-right">₱{item.revenue.toLocaleString()}</span>
                    </div>
                    <div className="ml-7 bg-white/5 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${index === 0 ? 'bg-amber-400' : index === 1 ? 'bg-gray-300' : index === 2 ? 'bg-amber-700' : 'bg-violet-500/60'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* CATEGORY */}
        {activeReport === 'category' && (
          <div className="space-y-4">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-white mb-4">Revenue by Category</h3>
              {sortedCats.length === 0 && <p className="text-gray-500 text-sm">No data yet</p>}
              <div className="flex gap-6 items-start">
                {/* Donut */}
                <div className="shrink-0">
                  <svg viewBox="0 0 200 200" className="w-36 h-36">
                    {pieSlices.map((slice, i) => (
                      <path key={i} d={slice.path} fill={slice.color} stroke="#000" strokeWidth="2" />
                    ))}
                    <circle cx="100" cy="100" r="50" fill="#000" />
                    <text x="100" y="94" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="8">TOTAL</text>
                    <text x="100" y="108" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">₱{(totalCatRevenue / 1000).toFixed(1)}k</text>
                  </svg>
                </div>
                {/* Legend + bars */}
                <div className="flex-1 space-y-2.5 min-w-0">
                  {pieSlices.map((slice, i) => (
                    <div key={i}>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: slice.color }} />
                        <span className="text-xs text-gray-300 flex-1 truncate">{slice.cat}</span>
                        <span className="text-xs text-gray-500">{(slice.pct * 100).toFixed(1)}%</span>
                        <span className="text-xs font-bold text-white w-20 text-right">₱{slice.total.toLocaleString()}</span>
                      </div>
                      <div className="ml-4 bg-white/5 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${slice.pct * 100}%`, backgroundColor: slice.color, opacity: 0.7 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Category bar chart */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-white mb-4">Category Comparison</h3>
              <div className="space-y-2">
                {sortedCats.map(([cat, total], i) => (
                  <div key={cat} className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-28 shrink-0 truncate">{cat}</span>
                    <div className="flex-1 bg-white/5 rounded-full h-6 overflow-hidden relative">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${(total / maxCatRevenue) * 100}%`, backgroundColor: PIE_COLORS[i % PIE_COLORS.length], opacity: 0.8 }}
                      />
                      <span className="absolute inset-0 flex items-center px-2 text-white" style={{ fontSize: '10px' }}>
                        ₱{total.toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STAFF */}
        {activeReport === 'staff' && (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4 text-center">
                <p className="text-xs text-gray-400 mb-1">Top Cashier</p>
                <p className="text-base font-bold text-violet-400">{sortedPunched[0]?.[0] || '—'}</p>
                <p className="text-xs text-gray-500">{sortedPunched[0]?.[1] || 0} orders punched</p>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center">
                <p className="text-xs text-gray-400 mb-1">Top Barista</p>
                <p className="text-base font-bold text-amber-400">{sortedMade[0]?.[0] || '—'}</p>
                <p className="text-xs text-gray-500">{sortedMade[0]?.[1] || 0} drinks made</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Punched */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-white mb-4">👤 Orders Punched</h3>
                {sortedPunched.length === 0 && (
                  <p className="text-gray-500 text-sm py-6 text-center">No data yet — select a cashier when generating orders</p>
                )}
                <div className="space-y-3">
                  {sortedPunched.map(([name, count], i) => (
                    <div key={name}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? 'bg-violet-500 text-white' : 'bg-white/10 text-gray-400'}`}>
                          {i + 1}
                        </div>
                        <span className="text-sm font-semibold text-white flex-1">{name}</span>
                        <span className="text-xs font-bold text-violet-400">{count}</span>
                      </div>
                      <div className="ml-7 bg-white/5 rounded-full h-2 overflow-hidden">
                        <div className="bg-violet-500 h-full rounded-full"
                          style={{ width: `${(count / (sortedPunched[0]?.[1] || 1)) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Made */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-white mb-4">☕ Drinks Made</h3>
                {sortedMade.length === 0 && (
                  <p className="text-gray-500 text-sm py-6 text-center">No data yet — select a barista when generating orders</p>
                )}
                <div className="space-y-3">
                  {sortedMade.map(([name, count], i) => (
                    <div key={name}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? 'bg-amber-500 text-black' : 'bg-white/10 text-gray-400'}`}>
                          {i + 1}
                        </div>
                        <span className="text-sm font-semibold text-white flex-1">{name}</span>
                        <span className="text-xs font-bold text-amber-400">{count}</span>
                      </div>
                      <div className="ml-7 bg-white/5 rounded-full h-2 overflow-hidden">
                        <div className="bg-amber-500 h-full rounded-full"
                          style={{ width: `${(count / (sortedMade[0]?.[1] || 1)) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {showDatePicker && <DateRangePicker onExport={handleExport} onClose={() => setShowDatePicker(false)} />}
    </div>
  );
}
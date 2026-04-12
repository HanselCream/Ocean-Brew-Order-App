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

  const doneOrders = orders.filter(o => o.status === 'done');
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
  const maxCatRevenue = sortedCats.length > 0 ? Math.max(...sortedCats.map(c => c[1])) : 1;

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
          <div className="space-y-2">
            {sortedDays.map(([day, total]) => (
              <div key={day} className="flex items-center gap-3">
                <span className="w-28 text-sm font-medium text-gray-400 shrink-0">{day}</span>
                <div className="flex-1 bg-white/10 rounded-full h-6 overflow-hidden">
                  <div className="bg-white h-full rounded-full transition-all" style={{ width: `${(total / maxDayRevenue) * 100}%` }} />
                </div>
                <span className="w-24 text-right text-sm font-bold text-white">₱{total.toFixed(0)}</span>
              </div>
            ))}
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
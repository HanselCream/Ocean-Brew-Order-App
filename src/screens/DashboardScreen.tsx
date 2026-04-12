'use client';

import { useState, useEffect } from 'react';
import PrinterSettingsModal from '@/components/PrinterSettingsModal';
import { Order } from '@/lib/types';
import { getOrders, getStoreSettings } from '@/lib/supabaseStore';

export default function DashboardScreen() {
  const [completedOrders, setCompletedOrders] = useState<Order[]>([]);
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reprinting, setReprinting] = useState<string | null>(null);

  useEffect(() => { loadCompletedOrders(); }, []);

  const loadCompletedOrders = async () => {
    setLoading(true);
    try {
      const all = await getOrders();
      const today = new Date().toISOString().slice(0, 10);
      setCompletedOrders(all.filter((o: Order) => o.createdAt.slice(0, 10) === today && o.status === 'done'));
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalSales = completedOrders.reduce((s, o) => s + o.total, 0);
  const totalOrders = completedOrders.length;
  const itemCounts: Record<string, { name: string; count: number }> = {};
  completedOrders.forEach(o => {
    o.items.forEach(i => {
      if (!itemCounts[i.menuItemId]) itemCounts[i.menuItemId] = { name: i.name, count: 0 };
      itemCounts[i.menuItemId].count += i.quantity;
    });
  });
  const bestSelling = Object.values(itemCounts).sort((a, b) => b.count - a.count)[0];

  const handleReprint = async (order: Order) => {
    setReprinting(order.id);
    try {
      const settings = await getStoreSettings();
      const date = new Date(order.createdAt).toLocaleString();
      let receiptText = '';
      const LINE_WIDTH = 32;
      const SEPARATOR = '-'.repeat(LINE_WIDTH);
      const rightAlign = (label: string, value: string): string => {
        const spaces = LINE_WIDTH - label.length - value.length;
        return label + ' '.repeat(Math.max(1, spaces)) + value;
      };
      const formatItemLine = (qty: number, name: string, amt: number): string => {
        const qtyStr = qty.toString().padStart(2);
        const amtStr = amt.toFixed(0).padStart(3);
        const nameWidth = LINE_WIDTH - qtyStr.length - 1 - 1 - amtStr.length;
        return `${qtyStr} ${name.substring(0, nameWidth).padEnd(nameWidth)} ${amtStr}`;
      };

      receiptText += `${settings.storeName}\n${SEPARATOR}\n`;
      receiptText += `${settings.storeAddress || 'Lopez Jaena St. Brgy. 9 Dapa, Siargao Island'}\n`;
      receiptText += `Tel: ${settings.storePhone}\n`;
      if (settings.storeEmail) receiptText += `${settings.storeEmail}\n`;
      receiptText += `${SEPARATOR}\n\nOrder #: ${order.orderNumber}\nDate: ${date}\n${SEPARATOR}\n`;

      const qtyH = 'QTY', amtH = 'AMT';
      const nameWidth = LINE_WIDTH - qtyH.length - 1 - 1 - amtH.length;
      receiptText += `${qtyH} ${'ITEM'.padEnd(nameWidth)} ${amtH}\n${SEPARATOR}\n`;

      order.items.forEach(item => {
        const qty = item.quantity || 1;
        const price = item.lineTotal > 0 ? item.lineTotal : (item.basePrice || 0) * qty;
        receiptText += formatItemLine(qty, item.name || 'Item', price) + '\n';
        const c = item.customization;
        const details: string[] = [];
        if (c?.size) details.push(c.size === 'R' ? 'Regular' : 'Large');
        if (c?.temperature) details.push(c.temperature);
        if (c?.sugar && c.sugar !== '100%') details.push(`${c.sugar} sugar`);
        if (c?.ice && c.ice !== 'Normal Ice') details.push(c.ice);
        if (details.length > 0) receiptText += `   [${details.join(', ')}]\n`;
        if (c?.discount) receiptText += `   Discount: ${c.discount.type === 'percent' ? `-${c.discount.value}%` : `-P${c.discount.value}`}\n`;
        if (c?.addOns?.length > 0) c.addOns.forEach(ao => { receiptText += `   + ${ao.name} +P${ao.price}\n`; });
      });

      receiptText += `${SEPARATOR}\n`;
      receiptText += rightAlign('Subtotal', order.subtotal.toFixed(0)) + '\n';
      if (order.discount > 0) receiptText += rightAlign('Discount', `-${order.discount.toFixed(0)}`) + '\n';
      receiptText += rightAlign('TOTAL', `P${order.total.toFixed(0)}`) + '\n';

      let paidAmt = 0, changeAmt = 0;
      if (order.paymentMethod?.startsWith('Cash|')) {
        const parts = order.paymentMethod.split('|');
        paidAmt = parseFloat(parts[1]) || 0;
        changeAmt = parseFloat(parts[2]) || 0;
      }
      if (paidAmt > 0) {
        receiptText += rightAlign('Cash', `P${paidAmt.toFixed(0)}`) + '\n';
        receiptText += rightAlign('Change', `P${changeAmt.toFixed(0)}`) + '\n';
      }
      receiptText += `${SEPARATOR}\n\n`;
      if (settings.wifiSSID && settings.wifiPassword) receiptText += `WiFi: ${settings.wifiSSID}\nPass: ${settings.wifiPassword}\n\n`;
      receiptText += `Thank you for choosing\n${settings.storeName}!\nVisit us again!\n\n`;

      console.log('🧾 RECEIPT PREVIEW\n' + receiptText);
      alert('🧾 RECEIPT PREVIEW\n\n' + receiptText);
      // Uncomment when printer ready: await printerService.printRawText(receiptText);
    } catch (error) {
      alert('Failed to reprint: ' + error);
    } finally {
      setReprinting(null);
    }
  };

  if (loading) return <div className="flex-1 p-6 bg-black text-white">Loading dashboard...</div>;

  return (
    <div className="flex-1 p-6 overflow-y-auto bg-black">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Today's Dashboard</h1>
        <button onClick={() => setShowPrinterSettings(true)} className="px-4 py-2 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors flex items-center gap-2 border border-white/20">
          <span>🖨️</span> Printer Settings
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-black border border-white/20 rounded-2xl p-6 text-center">
          <p className="text-gray-400 text-sm mb-1">Total Sales Today</p>
          <p className="text-4xl font-bold text-white">₱{totalSales.toFixed(2)}</p>
        </div>
        <div className="bg-black border border-white/20 rounded-2xl p-6 text-center">
          <p className="text-gray-400 text-sm mb-1">Total Orders Completed</p>
          <p className="text-4xl font-bold text-white">{totalOrders}</p>
        </div>
        <div className="bg-black border border-white/20 rounded-2xl p-6 text-center">
          <p className="text-gray-400 text-sm mb-1">Best Selling Item</p>
          <p className="text-2xl font-bold text-white">{bestSelling ? `${bestSelling.name} (${bestSelling.count})` : '—'}</p>
        </div>
      </div>

      <div className="bg-black border border-white/20 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 bg-white/5">
          <h2 className="font-bold text-lg text-white">Completed Orders</h2>
          <p className="text-sm text-gray-400">Orders marked as DONE today</p>
        </div>
        {completedOrders.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No completed orders yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-gray-300 border-b border-white/10">
                <tr>
                  <th className="px-4 py-3 text-left">Order #</th>
                  <th className="px-4 py-3 text-left">Time</th>
                  <th className="px-4 py-3 text-left">Items</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {completedOrders.map(order => (
                  <tr key={order.id} className="border-t border-white/10 hover:bg-white/5">
                    <td className="px-4 py-3 font-medium text-white">#{order.orderNumber}</td>
                    <td className="px-4 py-3 text-gray-400">{new Date(order.createdAt).toLocaleTimeString()}</td>
                    <td className="px-4 py-3">
                      {order.items.map((item, idx) => {
                        const c = item.customization;
                        return (
                          <div key={idx} className="text-sm text-gray-300 mb-2 last:mb-0">
                            <div className="font-semibold text-white">{item.quantity}x {item.name} — ₱{item.lineTotal.toFixed(0)}</div>
                            <div className="flex flex-wrap gap-1 mt-1 ml-2">
                              {c?.size && <span className="bg-white/10 px-1.5 py-0.5 rounded text-xs">{c.size === 'R' ? 'Regular' : 'Large'}</span>}
                              {c?.temperature && <span className="bg-white/10 px-1.5 py-0.5 rounded text-xs">{c.temperature === 'Hot' ? '🔥 Hot' : '❄️ Cold'}</span>}
                              {c?.sugar && c.sugar !== '100%' && <span className="bg-white/10 px-1.5 py-0.5 rounded text-xs">{c.sugar} sugar</span>}
                              {c?.ice && c.ice !== 'Normal Ice' && <span className="bg-white/10 px-1.5 py-0.5 rounded text-xs">{c.ice}</span>}
                              {c?.addOns?.length > 0 && c.addOns.map(ao => <span key={ao.id} className="bg-green-900 text-green-300 px-1.5 py-0.5 rounded text-xs">+{ao.name} ₱{ao.price}</span>)}
                              {c?.discount && <span className="bg-red-900 text-red-300 px-1.5 py-0.5 rounded text-xs">-{c.discount.type === 'percent' ? `${c.discount.value}%` : `₱${c.discount.value}`}</span>}
                            </div>
                          </div>
                        );
                      })}
                      {order.discount > 0 && (
                        <div className="mt-2 pt-2 border-t border-white/10 flex justify-between text-sm">
                          <span className="text-red-400">Order Discount:</span>
                          <span className="text-red-400 font-semibold">-₱{order.discount.toFixed(2)}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-white">₱{order.total.toFixed(2)}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => handleReprint(order)} disabled={reprinting === order.id} className="px-3 py-1 rounded-lg bg-white/10 text-white text-xs font-semibold hover:bg-white/20 transition-colors disabled:opacity-50 flex items-center gap-1 mx-auto">
                        {reprinting === order.id ? 'Reprinting...' : '🖨️ Reprint'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showPrinterSettings && (
        <PrinterSettingsModal isOpen={showPrinterSettings} onClose={() => setShowPrinterSettings(false)} onSave={() => alert('Printer settings saved successfully!')} />
      )}
    </div>
  );
}
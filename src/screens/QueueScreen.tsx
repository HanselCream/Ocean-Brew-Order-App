'use client';

import { useState, useEffect } from 'react';
import PrinterSettingsModal from '@/components/PrinterSettingsModal';
import printerService from '@/lib/printerService';
import { Order } from '@/lib/types';
import { getOrders, updateOrder, getStoreSettings } from '@/lib/supabaseStore';
import { supabase } from '@/lib/supabaseClient';

export default function QueueScreen({ refreshKey }: { refreshKey: number }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);
  const [loading, setLoading] = useState(true);

  const deleteTestOrder = async (id: string) => {
    if (confirm('Remove this test order? It will not affect sales totals.')) {
      try {
        await updateOrder(id, { status: 'cancelled' });
        loadPendingOrders();
      } catch (error) {
        console.error('Failed to delete test order:', error);
      }
    }
  };

  useEffect(() => {
    loadPendingOrders();
    const subscription = supabase
      .channel('orders_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        loadPendingOrders();
      })
      .subscribe();
    return () => { subscription.unsubscribe(); };
  }, [refreshKey]);

  const loadPendingOrders = async () => {
    setLoading(true);
    try {
      const all = await getOrders();
      const pending = all.filter(o => o.status === 'pending');
      setOrders(pending);
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const printReceipt = async (order: Order) => {
    console.log('🧾 Printing order:', order.orderNumber);
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
      const truncatedName = name.substring(0, nameWidth).padEnd(nameWidth);
      return `${qtyStr} ${truncatedName} ${amtStr}`;
    };

    receiptText += `${settings.storeName}\n`;
    receiptText += SEPARATOR + '\n';
    receiptText += `${settings.storeAddress || 'Lopez Jaena St. Brgy. 9 Dapa, Siargao Island'}\n`;
    receiptText += `Tel: ${settings.storePhone}\n`;
    if (settings.storeEmail) receiptText += `${settings.storeEmail}\n`;
    receiptText += SEPARATOR + '\n\n';
    receiptText += `Order #: ${order.orderNumber}\nDate: ${date}\n`;
    receiptText += SEPARATOR + '\n';

    const qtyH = 'QTY';
    const amtH = 'AMT';
    const nameWidth = LINE_WIDTH - qtyH.length - 1 - 1 - amtH.length;
    receiptText += `${qtyH} ${'ITEM'.padEnd(nameWidth)} ${amtH}\n`;
    receiptText += SEPARATOR + '\n';

    order.items.forEach(item => {
      const qty = item.quantity || 1;
      const name = item.name || 'Item';
      const price = item.lineTotal && item.lineTotal > 0 ? item.lineTotal : (item.basePrice || 0) * qty;
      receiptText += formatItemLine(qty, name, price) + '\n';

      const c = item.customization;
      const details: string[] = [];
      if (c?.size) details.push(c.size === 'R' ? 'Regular' : 'Large');
      if (c?.temperature) details.push(c.temperature);
      if (c?.sugar && c.sugar !== '100%') details.push(`${c.sugar} sugar`);
      if (c?.ice && c.ice !== 'Normal Ice') details.push(c.ice);
      if (details.length > 0) receiptText += `   [${details.join(', ')}]\n`;

      if (c?.discount) {
        const d = c.discount;
        receiptText += `   Discount: ${d.type === 'percent' ? `-${d.value}%` : `-P${d.value}`}\n`;
      }

      if (c?.addOns?.length > 0) {
        c.addOns.forEach(ao => { receiptText += `   + ${ao.name} +P${ao.price}\n`; });
      }
    });

    receiptText += SEPARATOR + '\n';
    receiptText += rightAlign('Subtotal', order.subtotal.toFixed(0)) + '\n';
    if (order.discount > 0) receiptText += rightAlign('Discount', `-${order.discount.toFixed(0)}`) + '\n';
    receiptText += rightAlign('TOTAL', `P${order.total.toFixed(0)}`) + '\n';

    let paidAmt = 0;
    let changeAmt = 0;
    if (order.paymentMethod?.startsWith('Cash|')) {
      const parts = order.paymentMethod.split('|');
      paidAmt = parseFloat(parts[1]) || 0;
      changeAmt = parseFloat(parts[2]) || 0;
    }
    if (paidAmt > 0) {
      receiptText += rightAlign('Cash', `P${paidAmt.toFixed(0)}`) + '\n';
      receiptText += rightAlign('Change', `P${changeAmt.toFixed(0)}`) + '\n';
    }
    receiptText += SEPARATOR + '\n\n';

    if (settings.wifiSSID && settings.wifiPassword) {
      receiptText += `WiFi: ${settings.wifiSSID}\nPass: ${settings.wifiPassword}\n\n`;
    }
    receiptText += `Thank you for choosing\n${settings.storeName}!\nVisit us again!\n\n`;

    // Uncomment when printer is ready:
    // try {
    //   await printerService.printRawText(receiptText);
    //   alert(`Receipt #${order.orderNumber} printed!`);
    // } catch (error) {
    //   alert('Failed to print: ' + error);
    // }
    console.log('🧾 RECEIPT PREVIEW\n' + receiptText);
    alert('🧾 RECEIPT PREVIEW\n\n' + receiptText);
  };

  const markDone = async (id: string) => {
    try {
      await updateOrder(id, { status: 'done', completedAt: new Date().toISOString() });
      setOrders(prev => prev.filter(o => o.id !== id));
    } catch (error) {
      console.error('Failed to mark order as done:', error);
    }
  };

  if (loading) {
    return <div className="flex-1 p-4 bg-black text-white">Loading orders...</div>;
  }

  return (
    <div className="flex-1 p-4 overflow-y-auto bg-black">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">Barista Queue</h1>
        <button
          onClick={() => setShowPrinterSettings(true)}
          className="px-4 py-2 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors flex items-center gap-2 border border-white/20"
        >
          <span>🖨️</span> Printer Settings
        </button>
      </div>

      {orders.length === 0 && (
        <p className="text-gray-500 text-center py-12 text-lg">No pending orders</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {orders.map(order => (
          <div key={order.id} className="bg-black border border-white/20 rounded-2xl p-4">
            <div className="mb-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-white">#{order.orderNumber}</span>
                <button
                  onClick={() => deleteTestOrder(order.id)}
                  className="text-red-400 hover:text-red-300 font-bold text-xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10"
                >×</button>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-500">{new Date(order.createdAt).toLocaleDateString()}</span>
                <span className="text-xs text-gray-600">{new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
            <div className="space-y-2 mb-4">
              {order.items.map(item => (
                <div key={item.id} className="text-sm">
                  <span className="font-semibold text-white">{item.quantity}x {item.name}</span>
                  <div className="text-xs text-gray-400 ml-4">
                    {item.customization.size}
                    {item.customization.temperature && ` | ${item.customization.temperature}`}
                    {item.customization.sugar !== '100%' && ` | ${item.customization.sugar} sugar`}
                    {item.customization.ice !== 'Normal Ice' && ` | ${item.customization.ice}`}
                    {item.customization.addOns.length > 0 && ` | +${item.customization.addOns.map(a => a.name).join(', ')}`}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => printReceipt(order)}
                className="flex-1 py-2 rounded-xl bg-white/10 text-white font-semibold text-sm hover:bg-white/20 transition-colors flex items-center justify-center gap-1"
              >
                🖨️ Print
              </button>
              <button
                onClick={() => markDone(order.id)}
                className="flex-1 py-2 rounded-xl bg-white text-black font-bold text-sm hover:bg-gray-200 transition-colors"
              >
                DONE
              </button>
            </div>
          </div>
        ))}
      </div>

      {showPrinterSettings && (
        <PrinterSettingsModal
          isOpen={showPrinterSettings}
          onClose={() => setShowPrinterSettings(false)}
          onSave={() => alert('Printer settings saved successfully!')}
        />
      )}
    </div>
  );
}
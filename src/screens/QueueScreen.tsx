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
    if (confirm('Remove this order? Stock will be restored.')) {
      try {
        // Get the order first before cancelling
        const order = orders.find(o => o.id === id);
        if (!order) return;

        await updateOrder(id, { status: 'cancelled' });

        // Restore stock for auto_deduct items
        const menuItemIds = order.items.map(i => i.menuItemId);
        const { data: menuFlags } = await supabase
          .from('menu_items')
          .select('id, auto_deduct')
          .in('id', menuItemIds);
        const autoDeductIds = new Set((menuFlags || []).filter(m => m.auto_deduct).map(m => m.id));

        // Aggregate qty per ingredient name
        const totals: Record<string, number> = {};
        for (const item of order.items) {
          if (autoDeductIds.has(item.menuItemId)) {
            totals[item.name] = (totals[item.name] || 0) + (item.quantity || 1);
          }
        }

        // Restore each ingredient
// Restore each ingredient
        for (const [name, qty] of Object.entries(totals)) {
          const { data: ing } = await supabase
            .from('ingredients')
            .select('id')
            .eq('name', name)
            .maybeSingle();
          if (!ing) continue;

          // Re-fetch fresh stock to avoid stale values
          const { data: fresh } = await supabase
            .from('ingredients')
            .select('*')
            .eq('id', ing.id)
            .single();
          if (!fresh) continue;

          const newStock = fresh.current_stock + qty;
          await supabase.from('ingredients')
            .update({ current_stock: newStock, updated_at: new Date().toISOString() })
            .eq('id', fresh.id);

          await supabase.from('stock_logs').insert([{
            ingredient_id: fresh.id,
            previous_stock: fresh.current_stock,
            new_stock: newStock,
            quantity_change: qty,
            reason: 'cancelled_order',
            reference_id: id,
          }]);
        }

        // Restore drink ingredients via window bridge
        const drinkItems = order.items.filter(i => !autoDeductIds.has(i.menuItemId) && !['Add Ons'].includes(i.category ?? ''));
        if (drinkItems.length > 0 && typeof window !== 'undefined' && (window as any).restoreStockForOrder) {
          await (window as any).restoreStockForOrder(drinkItems, id);
        }

        loadPendingOrders();
      } catch (error) {
        console.error('Failed to cancel order:', error);
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
    const date = new Date(order.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
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
receiptText += `Order #: ${order.orderNumber}\nType: ${(order as any).orderType || 'Dine In'}\nDate: ${date}\n${SEPARATOR}\n`;
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
try {
  await printerService.printRawText(receiptText);
} catch (error) {
  console.error('Print failed:', error);
}

    console.log('🧾 RECEIPT PREVIEW\n' + receiptText);
    alert('🧾 RECEIPT PREVIEW\n\n' + receiptText);
  };
  
const deductStock = async (orderItems: any[], orderId: string) => {
  const deductionMap: Record<string, number> = {};

  for (const orderItem of orderItems) {
    const temperature = orderItem.customization?.temperature;
    const menuItemId = orderItem.menuItemId;
    const qty = orderItem.quantity || 1;

    const { data: menuData } = await supabase
      .from('menu_items').select('category, auto_deduct').eq('id', menuItemId).single();

      // AFTER — route correctly
if (menuData?.auto_deduct) continue;

      const isEspresso = menuData?.category === 'Espresso';
    const sizeToQuery = isEspresso ? 'R' : (orderItem.customization?.size || 'R');

    const { data: recipeData, error } = await supabase
      .from('recipes')
      .select(`*, ingredients:ingredient_id (*)`)
      .eq('menu_item_id', menuItemId)
      .eq('size', sizeToQuery);

if (error) { console.error('Recipe fetch error:', error); continue; }

    let espressoCupHandled = false;
    for (const recipe of recipeData || []) {
      const ingredient = recipe.ingredients;
      if (!ingredient || ingredient.current_stock == null) continue;

      const isCup = ingredient.name?.toLowerCase().includes('cup');

      // Espresso: skip recipe cup, add temperature-correct cup instead
if (isEspresso && isCup) {
  if (!espressoCupHandled) {
    espressoCupHandled = true;
    const cupName = temperature === 'Hot' ? 'Hot Coffee Cups 12oz' : 'Dabba Cups 16oz';
    const { data: cupIng } = await supabase
      .from('ingredients').select('*').eq('name', cupName).single();
    if (cupIng) {
      deductionMap[cupIng.id] = (deductionMap[cupIng.id] || 0) + qty;
    }
  }
  continue;  // ← this must be OUTSIDE the inner if, INSIDE the outer if
}

      // Espresso Hot: skip straw deduction
      const isStraw = ingredient.name?.toLowerCase().includes('straw');
      if (isEspresso && isStraw && temperature === 'Hot') continue;

      const quantityNeeded = recipe.quantity * qty;
      deductionMap[ingredient.id] = (deductionMap[ingredient.id] || 0) + quantityNeeded;
    }

// Deduct add-ons via ingredient name match
    for (const addOn of orderItem.customization?.addOns || []) {
      const { data: addOnMenu } = await supabase
        .from('menu_items')
        .select('auto_deduct')
        .eq('name', addOn.name)
        .maybeSingle();

      if (!addOnMenu?.auto_deduct) continue;

      const { data: ing } = await supabase
        .from('ingredients')
        .select('id')
        .eq('name', addOn.name)
        .maybeSingle();

      if (!ing) {
        console.warn(`⚠️ No ingredient found for add-on: ${addOn.name}`);
        continue;
      }

      deductionMap[ing.id] = (deductionMap[ing.id] || 0) + (orderItem.quantity || 1);
    }
  }
console.log('📦 deductionMap:', JSON.stringify(deductionMap));
  for (const [ingredientId, totalDeduction] of Object.entries(deductionMap)) {
    const { data: fresh } = await supabase
      .from('ingredients').select('*').eq('id', ingredientId).single();
    if (!fresh) continue;

    const newStock = Math.max(0, fresh.current_stock - totalDeduction);

    await supabase.from('ingredients')
      .update({ current_stock: newStock, updated_at: new Date().toISOString() })
      .eq('id', ingredientId);

    await supabase.from('stock_logs').insert([{
      ingredient_id: ingredientId,
      previous_stock: fresh.current_stock,
      new_stock: newStock,
      quantity_change: -totalDeduction,
      reason: 'order',
      reference_id: orderId
    }]);
  }
};

const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
const [errorIds, setErrorIds] = useState<Set<string>>(new Set());

const markDone = async (id: string, orderItems?: any[]) => {
  if (processingIds.has(id)) return;
  setProcessingIds(prev => new Set(prev).add(id));
  setErrorIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  try {
    if (orderItems && orderItems.length > 0) {
      await deductStock(orderItems, id);
    }
    await updateOrder(id, { status: 'done', completedAt: new Date().toISOString() });
    setOrders(prev => prev.filter(o => o.id !== id));
  } catch (error) {
    console.error('Failed to mark order as done:', error);
    setErrorIds(prev => new Set(prev).add(id));
  } finally {
    setProcessingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  }
};

// AFTER
  if (loading) {
    return (
      <div className="flex-1 p-4 overflow-y-auto bg-black">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-white">Barista Queue</h1>
          <div className="px-4 py-2 rounded-xl bg-white/10 border border-white/20 w-40 h-9 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-black border border-white/10 rounded-2xl p-4 animate-pulse">
              <div className="flex items-center justify-between mb-3">
                <div className="h-8 w-16 bg-white/10 rounded-lg" />
                <div className="h-6 w-6 bg-white/10 rounded-full" />
              </div>
              <div className="space-y-2 mb-4">
                <div className="h-4 bg-white/10 rounded w-3/4" />
                <div className="h-3 bg-white/10 rounded w-1/2 ml-4" />
                <div className="h-4 bg-white/10 rounded w-2/3" />
                <div className="h-3 bg-white/10 rounded w-1/3 ml-4" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1 h-9 bg-white/10 rounded-xl" />
                <div className="flex-1 h-9 bg-white/10 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
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
             <span className="text-xs text-gray-500">{new Date(order.createdAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}</span>
<span className="text-xs text-gray-600">{new Date(order.createdAt).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
            <div className="space-y-2 mb-4">
              {order.items.map(item => (
                <div key={item.id} className="text-sm">
                  <span className="font-semibold text-white">{item.quantity}x {item.name}</span>
                  <div className="text-xs text-gray-400 ml-4">
                    {item.customization.size}
                    {item.customization.temperature && ` | ${item.customization.temperature}`}
{item.customization.sugar && item.customization.sugar !== '100%' && ` | ${item.customization.sugar} sugar`}                    {item.customization.ice !== 'Normal Ice' && ` | ${item.customization.ice}`}
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
              {errorIds.has(order.id) ? (
                <button
                  onClick={() => markDone(order.id, order.items)}
                  className="flex-1 py-2 rounded-xl bg-red-700 text-white font-bold text-sm hover:bg-red-600 transition-colors flex items-center justify-center gap-1"
                >
                  🔄 Retry
                </button>
              ) : (
                <button
                  onClick={() => markDone(order.id, order.items)}
                  disabled={processingIds.has(order.id)}
                  className="flex-1 py-2 rounded-xl bg-white text-black font-bold text-sm hover:bg-gray-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                >
                  {processingIds.has(order.id) ? (
                    <><span className="animate-spin">⏳</span> Processing...</>
                  ) : 'DONE'}
                </button>
              )}
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
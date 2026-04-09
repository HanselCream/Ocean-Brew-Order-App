'use client';

import React, { useState, useEffect, useCallback } from 'react';
import PrinterSettingsModal from '@/components/PrinterSettingsModal';
import DateRangePicker from '@/components/DateRangePicker';
import AdminPasswordModal from '@/components/AdminPasswordModal';
import ExcelExport from '@/lib/excelExport';
import printerService from '@/lib/printerService';

export const addOnsRefreshEvent = new EventTarget();

import {
  MenuItem,
  Order,
  OrderItem,
  OrderItemCustomization,
  Size,
  SugarLevel,
  IceLevel,
  CATEGORIES,
} from '@/lib/types';
import {
  getMenu,
  saveMenu,
  saveMenuItemWithAddons,
  getOrders,
  saveOrder,
  updateOrder,
  getNextOrderNumber,
  getAddOnItems,
  getDatabaseStats,
  getOrdersByDateRange,
  getStoreSettings,
} from '@/lib/supabaseStore';
import { supabase } from '@/lib/supabaseClient';

type Screen = 'order' | 'queue' | 'admin' | 'dashboard' | 'reports';

// ─────────────────────────────────────────────
// NAV BAR - BLACK & WHITE
// ─────────────────────────────────────────────
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
          <button
            key={t.key}
            onClick={() => setScreen(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              screen === t.key ? 'bg-white text-black' : 'hover:bg-white/10'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

// ─────────────────────────────────────────────
// CUSTOMIZATION MODAL - BLACK & WHITE
// ─────────────────────────────────────────────
const SUGAR_LEVELS: SugarLevel[] = ['0%', '25%', '50%', '75%', '100%'];
const ICE_LEVELS: IceLevel[] = ['No Ice', 'Less Ice', 'Normal Ice'];

const ESPRESSO_ADDONS = [
  { id: 'es-addon-1', name: 'Whipped Cream', price: 25 },
  { id: 'es-addon-2', name: 'Extra Syrup', price: 25 },
  { id: 'es-addon-3', name: 'Extra Sauce', price: 25 },
  { id: 'es-addon-4', name: 'Espresso Shot', price: 55 },
  { id: 'es-addon-5', name: 'Cold Foam', price: 30 },
];

function CustomizationModal({
  item,
  addOnItems,
  onConfirm,
  onCancel,
}: {
  item: MenuItem;
  addOnItems: MenuItem[];
  onConfirm: (orderItem: OrderItem) => void;
  onCancel: () => void;
}) {
  const [size, setSize] = useState<Size>('R');
  const [temperature, setTemperature] = useState<'Hot' | 'Cold'>('Hot');
  const [sugar, setSugar] = useState<SugarLevel>('100%');
  const [ice, setIce] = useState<IceLevel>('Normal Ice');
  const [selectedAddOns, setSelectedAddOns] = useState<Set<string>>(new Set());
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [quantity, setQuantity] = useState(1);

  const basePrice = size === 'L' && item.priceL ? item.priceL : item.priceR;
  
  const addOnsTotal = (() => {
    const isEspresso = item.category === 'Espresso';
    if (isEspresso) {
      return ESPRESSO_ADDONS
        .filter(a => selectedAddOns.has(a.id))
        .reduce((s, a) => s + a.price, 0);
    } else {
      return addOnItems
        .filter(a => selectedAddOns.has(a.id))
        .reduce((s, a) => s + a.priceR, 0);
    }
  })();

  const subtotal = (basePrice + addOnsTotal) * quantity;
  const dv = parseFloat(discountValue) || 0;
  const discountAmt = discountType === 'percent' ? subtotal * (dv / 100) : dv;
  const lineTotal = Math.max(0, subtotal - discountAmt);

  const toggleAddOn = (id: string) => {
    setSelectedAddOns(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    const isEspresso = item.category === 'Espresso';
    
    const addOnsArray = isEspresso
      ? ESPRESSO_ADDONS
          .filter(a => selectedAddOns.has(a.id))
          .map(a => ({ id: a.id, name: a.name, price: a.price }))
      : addOnItems
          .filter(a => selectedAddOns.has(a.id))
          .map(a => ({ id: a.id, name: a.name, price: a.priceR }));

    const cust: OrderItemCustomization = {
      size,
      temperature: isEspresso ? temperature : undefined,
      sugar: isEspresso ? undefined : sugar,
      ice: isEspresso ? 'Normal Ice' : ice,
      addOns: addOnsArray,
      discount: dv > 0 ? { type: discountType, value: dv } : null,
    };
    
    const oi: OrderItem = {
      id: crypto.randomUUID(),
      menuItemId: item.id,
      name: item.name,
      category: item.category,
      basePrice,
      customization: cust,
      quantity,
      lineTotal: lineTotal
    };
    onConfirm(oi);
  };

  const isDrink = item.category !== 'Appetizers' && 
                  item.category !== 'Cheesecake' && 
                  item.category !== 'Merchandise' && 
                  item.category !== 'Supplies' && 
                  item.category !== 'Add Ons';
  
  const isEspresso = item.category === 'Espresso';

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="bg-black border border-white/20 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-white/20">
          <h2 className="text-xl font-bold text-white">{item.name}</h2>
          <p className="text-gray-400">₱{item.priceR}{item.priceL ? ` / ₱${item.priceL}` : ''}</p>
        </div>

        <div className="p-5 space-y-5">
          {item.hasSizeOption && (
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">Size</label>
              <div className="flex gap-3">
                {(['R', 'L'] as Size[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setSize(s)}
                    className={`flex-1 py-3 rounded-xl text-lg font-bold border-2 transition-colors ${
                      size === s
                        ? 'border-white bg-white text-black'
                        : 'border-white/30 text-gray-300 hover:border-white/50'
                    }`}
                  >
                    {s === 'R' ? 'Regular' : 'Large'} — ₱{s === 'R' ? item.priceR : item.priceL}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isEspresso && (
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">Temperature</label>
              <div className="flex gap-3">
                {(['Hot', 'Cold'] as const).map(temp => (
                  <button
                    key={temp}
                    onClick={() => setTemperature(temp)}
                    className={`flex-1 py-3 rounded-xl text-lg font-bold border-2 transition-colors ${
                      temperature === temp
                        ? 'border-white bg-white text-black'
                        : 'border-white/30 text-gray-300 hover:border-white/50'
                    }`}
                  >
                    {temp}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isDrink && !isEspresso && (
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">Sugar Level</label>
              <div className="flex flex-wrap gap-2">
                {SUGAR_LEVELS.map(sl => (
                  <button
                    key={sl}
                    onClick={() => setSugar(sl)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                      sugar === sl
                        ? 'border-white bg-white text-black'
                        : 'border-white/30 text-gray-300 hover:border-white/50'
                    }`}
                  >
                    {sl}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {isDrink && !isEspresso && (
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">Ice Level</label>
              <div className="flex flex-wrap gap-2">
                {ICE_LEVELS.map(il => (
                  <button
                    key={il}
                    onClick={() => setIce(il)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                      ice === il
                        ? 'border-white bg-white text-black'
                        : 'border-white/30 text-gray-300 hover:border-white/50'
                    }`}
                  >
                    {il}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isDrink && (
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                {isEspresso ? 'Espresso Add-ons' : 'Add-ons (select multiple)'}
              </label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1">
                {isEspresso ? (
                  ESPRESSO_ADDONS.map(a => (
                    <button
                      key={a.id}
                      onClick={() => toggleAddOn(a.id)}
                      className={`px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                        selectedAddOns.has(a.id)
                          ? 'border-white bg-white text-black'
                          : 'border-white/30 text-gray-300 hover:border-white/50'
                      }`}
                    >
                      {a.name} +₱{a.price}
                    </button>
                  ))
                ) : (
                  addOnItems
                    .filter(addOn => item.addOnIds?.includes(addOn.id))
                    .map(a => (
                      <button
                        key={a.id}
                        onClick={() => toggleAddOn(a.id)}
                        className={`px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                          selectedAddOns.has(a.id)
                            ? 'border-white bg-white text-black'
                            : 'border-white/30 text-gray-300 hover:border-white/50'
                        }`}
                      >
                        {a.name} +₱{a.priceR}
                      </button>
                    ))
                )}
              </div>
              {!isEspresso && (!item.addOnIds || item.addOnIds.length === 0) && (
                <p className="text-xs text-gray-500 mt-1">
                  No add-ons available for this item. Edit this item in Admin to add add-ons.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Quantity</label>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                className="w-12 h-12 rounded-xl bg-white/10 text-xl font-bold text-white hover:bg-white/20"
              >
                -
              </button>
              <span className="text-2xl font-bold w-8 text-center text-white">{quantity}</span>
              <button
                onClick={() => setQuantity(q => q + 1)}
                className="w-12 h-12 rounded-xl bg-white/10 text-xl font-bold text-white hover:bg-white/20"
              >
                +
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Discount</label>
            <div className="flex gap-2 items-center">
              <select
                value={discountType}
                onChange={e => setDiscountType(e.target.value as 'percent' | 'fixed')}
                className="border border-white/20 rounded-xl px-3 py-2 text-sm bg-black text-white"
              >
                <option value="percent">%</option>
                <option value="fixed">₱ Fixed</option>
              </select>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={discountValue}
                onChange={e => setDiscountValue(e.target.value)}
                className="border border-white/20 rounded-xl px-3 py-2 text-sm flex-1 bg-black text-white"
              />
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-white/20 bg-white/5 rounded-b-2xl flex items-center justify-between">
          <div>
            <span className="text-sm text-gray-400">Total:</span>
            <span className="text-2xl font-bold text-white ml-2">₱{lineTotal.toFixed(2)}</span>
          </div>
          <div className="flex gap-3">
            <button onClick={onCancel} className="px-5 py-3 rounded-xl text-white font-semibold bg-white/10 hover:bg-white/20">
              Cancel
            </button>
            <button onClick={handleConfirm} className="px-5 py-3 rounded-xl text-black font-semibold bg-white hover:bg-gray-200">
              Add to Order
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PRINTER STATUS BAR - BLACK & WHITE
// ─────────────────────────────────────────────
function PrinterStatusBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [isConnected, setIsConnected] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [connectionType, setConnectionType] = useState<'thermal' | 'test' | 'none'>('none');

  useEffect(() => {
    const interval = setInterval(() => {
      setIsConnected(printerService.isConnected());
      setDeviceName(printerService.getDeviceName());
      setConnectionType(printerService.getConnectionType());
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const getStatusText = () => {
    if (!isConnected) return 'No Device Connected';
    if (connectionType === 'thermal') return `🖨️ ${deviceName}`;
    if (connectionType === 'test') return `📱 ${deviceName} (Test Mode)`;
    return `📱 ${deviceName}`;
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-lg border border-white/20">
      <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
      <span className="text-xs font-medium text-gray-300">
        {getStatusText()}
      </span>
      <button
        onClick={onOpenSettings}
        className="ml-1 px-2 py-1 text-xs bg-white/20 text-white rounded-md hover:bg-white/30"
      >
        🖨️ Settings
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// ORDER SCREEN - BLACK & WHITE (NO PRINTER)
// ─────────────────────────────────────────────
function OrderScreen({ onOrderPlaced }: { onOrderPlaced: () => void }) {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('Classic');
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [modalItem, setModalItem] = useState<MenuItem | null>(null);
  const [addOnItems, setAddOnItems] = useState<MenuItem[]>([]);
  
  // Confirmation modals state
  const [showAmountModal, setShowAmountModal] = useState(false);
  const [showFinalConfirmModal, setShowFinalConfirmModal] = useState(false);
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [changeAmount, setChangeAmount] = useState<number>(0);

  useEffect(() => {
    const loadMenu = async () => {
      try {
        const menuData = await getMenu();
        setMenu(Array.isArray(menuData) ? menuData : []);
        const addOnsData = await getAddOnItems();
        setAddOnItems(Array.isArray(addOnsData) ? addOnsData : []);
      } catch (error) {
        console.error('Failed to load menu:', error);
        setMenu([]);
        setAddOnItems([]);
      }
    };
    loadMenu();
  }, []);

  const categories = Array.from(new Set(menu.map(m => m.category)))
    .sort((a, b) => {
      const indexA = CATEGORIES.indexOf(a as any);
      const indexB = CATEGORIES.indexOf(b as any);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
    
  const filteredItems = menu.filter(m => m.category === activeCategory && m.available);

  const addToCart = (orderItem: OrderItem) => {
    setCart(prev => [...prev, orderItem]);
    setModalItem(null);
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(i => i.id !== id));
  };

  const subtotal = cart.reduce((s, i) => s + (i.basePrice + i.customization.addOns.reduce((a, ao) => a + ao.price, 0)) * i.quantity, 0);
  const totalDiscount = cart.reduce((s, i) => {
    const itemSub = (i.basePrice + i.customization.addOns.reduce((a, ao) => a + ao.price, 0)) * i.quantity;
    if (!i.customization.discount) return s;
    return s + (i.customization.discount.type === 'percent' ? itemSub * (i.customization.discount.value / 100) : i.customization.discount.value);
  }, 0);
  const total = cart.reduce((s, i) => s + i.lineTotal, 0);

  const cancelOrder = () => setCart([]);

  // Step 1: Show amount paid modal
  const handleGenerateClick = () => {
    if (cart.length === 0) return;
    setAmountPaid(0);
    setChangeAmount(0);
    setShowAmountModal(true);
  };

  // Step 2: After amount entered, show final confirmation
  const handleAmountConfirm = () => {
    if (amountPaid < total) {
      alert(`Amount paid (₱${amountPaid.toFixed(2)}) is less than total (₱${total.toFixed(2)})`);
      return;
    }
    setChangeAmount(amountPaid - total);
    setShowAmountModal(false);
    setShowFinalConfirmModal(true);
  };

  // Step 3: Final confirm - save order
  const handleFinalConfirm = async () => {
    try {
      const nextOrderNumberStr = await getNextOrderNumber();
      const nextOrderNumber = parseInt(nextOrderNumberStr);
      console.log('💾 Saving order to Supabase:', nextOrderNumber); // ← ADD
      const order: Order = {
        id: '',
        orderNumber: nextOrderNumber,
        items: cart,
        subtotal,
        discount: totalDiscount,
        total,
        createdAt: new Date().toISOString(),
        status: 'pending',
        amountPaid,        // ← ADD
        change: changeAmount, // ← ADD
      };
      await saveOrder(order);
      console.log('✅ Order saved:', nextOrderNumber); // ← ADD

      // Clear cart and close modals
      setCart([]);
      setShowFinalConfirmModal(false);
      
      // Optional: show success message
      alert(`Order #${nextOrderNumber} completed! Change: ₱${changeAmount.toFixed(2)}`);
      
      onOrderPlaced();
    } catch (error: any) {
      console.error('Failed to save order:', JSON.stringify(error), error?.message, error?.code);
      alert('Failed to save order: ' + (error?.message || JSON.stringify(error)));
    }
  };

  useEffect(() => {
    const handleRefresh = async () => {
      const addOnsData = await getAddOnItems();
      setAddOnItems(Array.isArray(addOnsData) ? addOnsData : []);
    };
    
    addOnsRefreshEvent.addEventListener('refresh', handleRefresh);
    return () => addOnsRefreshEvent.removeEventListener('refresh', handleRefresh);
  }, []);

  return (
    <div className="flex flex-1 overflow-hidden relative">
      {/* Left: Categories */}
      <div className="w-40 bg-black border-r border-white/10 overflow-y-auto shrink-0">
        {categories.map((cat, index) => (
          <button
            key={`${cat}-${index}`}
            onClick={() => setActiveCategory(cat)}
            className={`w-full text-left px-3 py-3 text-sm font-semibold border-b border-white/10 transition-colors ${
              activeCategory === cat
                ? 'bg-white text-black'
                : 'text-gray-300 hover:bg-white/10'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Center: Item Grid */}
      <div className="flex-1 p-4 overflow-y-auto bg-black">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredItems.map(item => (
            <button
              key={item.id}
              onClick={() => setModalItem(item)}
              className="bg-black border border-white/20 rounded-xl p-4 flex flex-col items-center justify-center text-center active:scale-95 transition-transform min-h-[100px] hover:border-white/50"
            >
              <span className="font-bold text-white text-sm leading-tight">{item.name}</span>
              <span className="text-gray-400 font-bold mt-1 text-base">
                ₱{item.priceR}
                {item.priceL ? <span className="text-gray-500 text-xs"> / ₱{item.priceL}</span> : ''}
              </span>
            </button>
          ))}
          {filteredItems.length === 0 && (
            <p className="col-span-full text-center text-gray-500 py-12">No items in this category</p>
          )}
        </div>
      </div>

      {/* Right: Order Summary - NO PRINTER CONTROLS */}
      <div className="w-80 bg-black border-l border-white/10 flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-white/10 bg-white/5 text-white">
          <h2 className="font-bold text-base">Current Order</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-8">Tap an item to start</p>
          )}
          {cart.map(item => (
            <div key={item.id} className="bg-white/5 rounded-lg p-3 border border-white/10 text-sm hover:bg-white/10 transition-colors">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{item.quantity}x {item.name}</span>
                    <button 
                      onClick={() => removeFromCart(item.id)} 
                      className="text-white bg-red-700 hover:bg-red-800 text-xs px-2 py-0.5 rounded-full transition-colors"
                      title="Remove item"
                    >
                      ×
                    </button>
                  </div>
                  <div className="text-xs text-gray-400 mt-1.5 pl-1">
                    <div className="flex flex-wrap gap-1">
                      <span className="bg-white/10 px-1.5 py-0.5 rounded">{item.customization.size}</span>
                      {item.customization.temperature && (
                        <span className="bg-white/10 px-1.5 py-0.5 rounded">{item.customization.temperature}</span>
                      )}
                      {item.customization.sugar !== '100%' && (
                        <span className="bg-white/10 px-1.5 py-0.5 rounded">{item.customization.sugar} sugar</span>
                      )}
                      {item.customization.ice !== 'Normal Ice' && (
                        <span className="bg-white/10 px-1.5 py-0.5 rounded">{item.customization.ice}</span>
                      )}
                      {item.customization.addOns.length > 0 && (
                        <span className="bg-green-900 text-green-300 px-1.5 py-0.5 rounded">
                          +{item.customization.addOns.map(a => a.name).join(', ')}
                        </span>
                      )}
                      {item.customization.discount && (
                        <span className="bg-red-900 text-red-300 px-1.5 py-0.5 rounded">
                          -{item.customization.discount.type === 'percent' ? `${item.customization.discount.value}%` : `₱${item.customization.discount.value}`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="ml-2">
                  <span className="font-bold text-white text-base">₱{item.lineTotal.toFixed(0)}</span>
                </div>
              </div>
            </div>
          ))}
          {cart.length > 0 && (
            <div className="p-3 border-t border-white/10">
              <button
                onClick={() => setCart([])}
                className="w-full py-2.5 rounded-lg bg-red-900/30 text-red-300 font-semibold text-sm hover:bg-red-900/50 transition-colors border border-red-800"
              >
                🗑️ Clear All Items
              </button>
            </div>
          )}
        </div>
        <div className="p-3 border-t border-white/10 space-y-1 text-sm">
          <div className="flex justify-between text-gray-400">
            <span>Subtotal</span><span>₱{subtotal.toFixed(2)}</span>
          </div>
          {totalDiscount > 0 && (
            <div className="flex justify-between text-red-400">
              <span>Discount</span><span>-₱{totalDiscount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold text-white pt-1 border-t border-white/10">
            <span>Total</span><span>₱{total.toFixed(2)}</span>
          </div>
        </div>
        <div className="p-3 border-t border-white/10">
          <button
            onClick={handleGenerateClick}
            disabled={cart.length === 0}
            className="w-full py-3 rounded-xl bg-white text-black font-semibold text-sm hover:bg-gray-200 disabled:opacity-40 transition-colors"
          >
            Generate Order
          </button>
          <button
            onClick={cancelOrder}
            disabled={cart.length === 0}
            className="w-full mt-2 py-2 rounded-lg text-gray-400 font-semibold text-sm hover:text-white disabled:opacity-40 transition-colors"
          >
            Cancel Order
          </button>
        </div>
      </div>

      {modalItem && (
        <CustomizationModal
          item={modalItem}
          addOnItems={addOnItems}
          onConfirm={addToCart}
          onCancel={() => setModalItem(null)}
        />
      )}

      {/* MODAL 1: Amount Paid + Change */}
      {showAmountModal && (
        <AmountPaidModal
          cart={cart}
          subtotal={total}
          onConfirm={(discountAmount: number, amountPaid: number) => {
            setAmountPaid(amountPaid);
            setChangeAmount(amountPaid - (total - discountAmount));
            setShowAmountModal(false);
            setShowFinalConfirmModal(true);
          }}
          onCancel={() => setShowAmountModal(false)}
        />
      )}

      {/* MODAL 2: Final Confirmation */}
      {showFinalConfirmModal && (
        <FinalConfirmModal
          cart={cart}
          total={total}
          amountPaid={amountPaid}
          changeAmount={changeAmount}
          onConfirm={handleFinalConfirm}
          onCancel={() => setShowFinalConfirmModal(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// AMOUNT PAID MODAL (with Discounts & Order Details)
// ─────────────────────────────────────────────
function AmountPaidModal({
  cart,
  subtotal,
  onConfirm,
  onCancel,
}: {
  cart: OrderItem[];
  subtotal: number;
  onConfirm: (discountAmount: number, amountPaid: number) => void;
  onCancel: () => void;
}) {
  const [discountType, setDiscountType] = useState<'none' | 'pwd' | 'student' | 'store'>('none');
  const [storeDiscountValue, setStoreDiscountValue] = useState<number>(0);
  const [storeDiscountIsPercent, setStoreDiscountIsPercent] = useState<boolean>(true);
  const [amountPaid, setAmountPaid] = useState<number>(0);

  // Calculate discount amount
  const getDiscountAmount = (): number => {
    switch (discountType) {
      case 'pwd':
        return subtotal * 0.20; // 20% for PWD
      case 'student':
        return subtotal * 0.20; // 20% for Student
      case 'store':
        if (storeDiscountIsPercent) {
          return subtotal * (storeDiscountValue / 100);
        }
        return storeDiscountValue;
      default:
        return 0;
    }
  };

  const discountAmount = getDiscountAmount();
  const totalAfterDiscount = subtotal - discountAmount;
  const change = amountPaid - totalAfterDiscount;

  const handleConfirm = () => {
    if (amountPaid < totalAfterDiscount) {
      alert(`Amount paid (₱${amountPaid.toFixed(2)}) is less than total (₱${totalAfterDiscount.toFixed(2)})`);
      return;
    }
    onConfirm(discountAmount, amountPaid);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4 overflow-y-auto">
      <div className="bg-black border border-white/20 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <h2 className="text-xl font-bold text-white mb-4">Payment & Discount</h2>

          {/* Order Items with Details */}
          <div className="bg-white/5 rounded-xl p-4 mb-4">
            <h3 className="text-sm font-semibold text-gray-400 mb-2">Order Summary</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {cart.map((item, idx) => (
                <div key={idx} className="border-b border-white/10 pb-2 last:border-0">
                  <div className="flex justify-between">
                    <span className="text-white font-semibold">{item.quantity}x {item.name}</span>
                    <span className="text-white">₱{item.lineTotal.toFixed(2)}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1 pl-2">
                    <div className="flex flex-wrap gap-1">
                      <span className="bg-white/10 px-1.5 py-0.5 rounded">{item.customization.size}</span>
                      {item.customization.temperature && (
                        <span className="bg-white/10 px-1.5 py-0.5 rounded">
                          {item.customization.temperature === 'Hot' ? '🔥 Hot' : '❄️ Cold'}
                        </span>
                      )}
                      {item.customization.sugar !== '100%' && (
                        <span className="bg-white/10 px-1.5 py-0.5 rounded">{item.customization.sugar} sugar</span>
                      )}
                      {item.customization.ice !== 'Normal Ice' && (
                        <span className="bg-white/10 px-1.5 py-0.5 rounded">{item.customization.ice}</span>
                      )}
                      {item.customization.addOns.length > 0 && (
                        <span className="bg-green-900 text-green-300 px-1.5 py-0.5 rounded">
                          +{item.customization.addOns.map(a => a.name).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Discount Options */}
          <div className="bg-white/5 rounded-xl p-4 mb-4">
            <h3 className="text-sm font-semibold text-gray-400 mb-3">Discount Type</h3>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <button
                onClick={() => setDiscountType('none')}
                className={`py-2 rounded-lg font-semibold text-sm transition-colors ${
                  discountType === 'none'
                    ? 'bg-white text-black'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                None
              </button>
              <button
                onClick={() => setDiscountType('pwd')}
                className={`py-2 rounded-lg font-semibold text-sm transition-colors ${
                  discountType === 'pwd'
                    ? 'bg-white text-black'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                PWD (20%)
              </button>
              <button
                onClick={() => setDiscountType('student')}
                className={`py-2 rounded-lg font-semibold text-sm transition-colors ${
                  discountType === 'student'
                    ? 'bg-white text-black'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                Student (20%)
              </button>
            </div>

            {/* Store Discount Section */}
            <div className="border-t border-white/10 pt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-300">Store Discount</span>
                <button
                  onClick={() => {
                    setDiscountType(discountType === 'store' ? 'none' : 'store');
                    setStoreDiscountValue(0);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                    discountType === 'store'
                      ? 'bg-white text-black'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  {discountType === 'store' ? 'Disable' : 'Enable'}
                </button>
              </div>

              {discountType === 'store' && (
                <div className="flex gap-2 mt-2">
                  <select
                    value={storeDiscountIsPercent ? 'percent' : 'fixed'}
                    onChange={(e) => setStoreDiscountIsPercent(e.target.value === 'percent')}
                    className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm"
                  >
                    <option value="percent">% Percent</option>
                    <option value="fixed">₱ Fixed</option>
                  </select>
                  <input
                    type="number"
                    value={storeDiscountValue === 0 ? '' : storeDiscountValue}
                    onChange={(e) => setStoreDiscountValue(parseFloat(e.target.value) || 0)}
                    placeholder={storeDiscountIsPercent ? 'Discount %' : 'Discount ₱'}
                    className="flex-1 border border-white/20 rounded-lg px-3 py-2 bg-black text-white focus:border-white/50 focus:outline-none"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Totals */}
          <div className="bg-white/5 rounded-xl p-4 mb-4">
            <div className="flex justify-between mb-2">
              <span className="text-gray-400">Subtotal</span>
              <span className="text-white">₱{subtotal.toFixed(2)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between mb-2 text-red-400">
                <span>Discount</span>
                <span>-₱{discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-white/20">
              <span className="text-white font-bold">Total</span>
              <span className="text-white font-bold text-lg">₱{totalAfterDiscount.toFixed(2)}</span>
            </div>
          </div>

          {/* Amount Paid */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Amount Paid
            </label>
            <input
              type="number"
              value={amountPaid === 0 ? '' : amountPaid}
              onChange={(e) => {
                const value = e.target.value === '' ? 0 : parseFloat(e.target.value);
                setAmountPaid(value);
              }}
              className="w-full border border-white/20 rounded-xl px-4 py-3 bg-black text-white text-lg focus:border-white/50 focus:outline-none"
              placeholder="Enter amount received"
              autoFocus
            />
          </div>

          {/* Change */}
          {amountPaid >= totalAfterDiscount && amountPaid > 0 && (
            <div className="bg-green-900/30 border border-green-800 rounded-xl p-4 mb-4">
              <p className="text-gray-300 text-sm mb-1">Change</p>
              <p className="text-2xl font-bold text-green-400">₱{change.toFixed(2)}</p>
            </div>
          )}

          {amountPaid > 0 && amountPaid < totalAfterDiscount && (
            <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 mb-4">
              <p className="text-red-400 text-sm">Amount paid is less than total</p>
              <p className="text-red-300">Short: ₱{(totalAfterDiscount - amountPaid).toFixed(2)}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-3 rounded-xl bg-white/10 font-semibold text-white hover:bg-white/20 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={amountPaid < totalAfterDiscount}
              className="flex-1 py-3 rounded-xl bg-white font-semibold text-black hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue to Confirmation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// FINAL CONFIRMATION MODAL
// ─────────────────────────────────────────────
function FinalConfirmModal({
  cart,
  total,
  amountPaid,
  changeAmount,
  onConfirm,
  onCancel,
}: {
  cart: OrderItem[];
  total: number;
  amountPaid: number;
  changeAmount: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
      <div className="bg-black border border-white/20 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="text-center mb-4">
            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-3">
              <span className="text-3xl">✅</span>
            </div>
            <h2 className="text-xl font-bold text-white">Confirm Order</h2>
          </div>

          {/* Order items summary */}
          <div className="bg-white/5 rounded-xl p-3 mb-3 max-h-48 overflow-y-auto">
            {cart.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm py-1 border-b border-white/10 last:border-0">
                <span className="text-gray-300">{item.quantity}x {item.name}</span>
                <span className="text-white font-semibold">₱{item.lineTotal.toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className="bg-white/5 rounded-xl p-4 mb-4">
            <div className="flex justify-between mb-2">
              <span className="text-gray-400">Total:</span>
              <span className="text-white font-bold">₱{total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-gray-400">Amount Paid:</span>
              <span className="text-white font-bold">₱{amountPaid.toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-white/20">
              <span className="text-green-400">Change:</span>
              <span className="text-green-400 font-bold text-lg">₱{changeAmount.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-3 rounded-xl bg-white/10 font-semibold text-white hover:bg-white/20 transition-colors"
            >
              No, Go Back
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-3 rounded-xl bg-white font-semibold text-black hover:bg-gray-200 transition-colors"
            >
              Yes, Generate Order
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PRINT CONFIRMATION MODAL - BLACK & WHITE
// ─────────────────────────────────────────────
function PrintConfirmationModal({
  order,
  onConfirm,
  onCancel,
  onSkip,
  onOpenPrinterSettings,
}: {
  order: Order;
  onConfirm: () => void;
  onCancel: () => void;
  onSkip: () => void;
  onOpenPrinterSettings: () => void;
}) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [printError, setPrintError] = useState('');
  const [isPrinterConnected, setIsPrinterConnected] = useState(printerService.isConnected());

  useEffect(() => {
    setIsPrinterConnected(printerService.isConnected());
  }, []);

  const handlePrint = async () => {
    if (!printerService.isConnected()) {
      setPrintError('Printer not connected. Please connect printer first.');
      return;
    }

    setIsPrinting(true);
    setPrintError('');

    try {
      const settings = await getStoreSettings();
      await printerService.printReceipt(order, settings);
      const newPrintCount = (order.printedCount || 0) + 1;
      await updateOrder(order.id, { 
        printedCount: newPrintCount,
        lastPrintedAt: new Date().toISOString()
      });
      onConfirm();
    } catch (error) {
      setPrintError('Failed to print: ' + error);
    } finally {
      setIsPrinting(false);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
      <div className="bg-black border border-white/20 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
              <span className="text-2xl">🖨️</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Print Receipt</h2>
              <p className="text-gray-400">Order #{order.orderNumber}</p>
            </div>
          </div>

          <div className="bg-white/5 rounded-xl p-4 mb-4 border border-white/10">
            <p className="text-sm text-gray-400 mb-2">Total Amount:</p>
            <p className="text-3xl font-bold text-white">₱{order.total.toFixed(2)}</p>
            <p className="text-xs text-gray-500 mt-2">
              {new Date(order.createdAt).toLocaleString()}
            </p>
          </div>

          {!isPrinterConnected && (
            <div className="bg-yellow-900/30 border border-yellow-800 rounded-xl p-4 mb-4">
              <div className="flex items-start gap-2">
                <span className="text-yellow-500 text-lg">⚠️</span>
                <div>
                  <p className="text-sm font-semibold text-yellow-400">Printer Not Connected</p>
                  <p className="text-xs text-yellow-500 mt-1">
                    Please click the <span className="font-bold">"Printer Settings"</span> button below to connect your Bluetooth printer.
                  </p>
                </div>
              </div>
            </div>
          )}

          {printError && (
            <div className="bg-red-900/30 border border-red-800 text-red-400 px-4 py-3 rounded-xl mb-4 text-sm">
              {printError}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {!isPrinterConnected && (
              <button
                onClick={onOpenPrinterSettings}
                className="w-full py-3 rounded-xl bg-yellow-700 font-semibold text-white hover:bg-yellow-600 transition-colors flex items-center justify-center gap-2"
              >
                🖨️ Printer Settings
              </button>
            )}
            
            <div className="flex gap-3">
              <button
                onClick={onSkip}
                className="flex-1 py-3 rounded-xl bg-white/10 font-semibold text-white hover:bg-white/20 transition-colors"
              >
                Skip
              </button>
              <button
                onClick={handlePrint}
                disabled={isPrinting || !isPrinterConnected}
                className="flex-1 py-3 rounded-xl bg-white font-semibold text-black hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isPrinting ? (
                  <>Printing...</>
                ) : (
                  <>🖨️ Print Receipt</>
                )}
              </button>
            </div>
            
            <button
              onClick={onCancel}
              className="w-full mt-1 py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// QUEUE SCREEN - BLACK & WHITE (simplified)
// ─────────────────────────────────────────────
function QueueScreen({ refreshKey }: { refreshKey: number }) {
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
    return () => subscription.unsubscribe();
  }, [refreshKey]);

  const loadPendingOrders = async () => {
    setLoading(true);
    try {
      const all = await getOrders();
      console.log('📦 All orders fetched:', all.length, all.map(o => ({ num: o.orderNumber, status: o.status })));
      const pending = all.filter(o => o.status === 'pending');
      console.log('⏳ Pending orders:', pending.length);
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
    receiptText += `Lopez Jaena St. Brgy. 9 Dapa,\nSiargao Island\n`;
    receiptText += `Tel: ${settings.storePhone}\n`;
    receiptText += `${settings.storeName}\n`;
    receiptText += `oceanbrew.siargao@gmail.com`;
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

      // Size + Temperature/Sugar/Ice details
      const c = item.customization;
      const details: string[] = [];
      if (c?.size) details.push(c.size === 'R' ? 'Regular' : 'Large');
      if (c?.temperature) details.push(c.temperature);
      if (c?.sugar && c.sugar !== '100%') details.push(`${c.sugar} sugar`);
      if (c?.ice && c.ice !== 'Normal Ice') details.push(c.ice);
      if (details.length > 0) {
          receiptText += `   [${details.join(', ')}]\n`;
        }

        // Per-item discount
        if (c?.discount) {
          const d = c.discount;
          const label = d.type === 'percent' ? `-${d.value}%` : `-P${d.value}`;
          receiptText += `   Discount: ${label}\n`;
        }

      // Add-ons
      if (c?.addOns?.length > 0) {
        c.addOns.forEach(ao => {
          receiptText += `   + ${ao.name} +P${ao.price}\n`;
        });
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
                  title="Remove test order"
                >
                  ×
                </button>
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

// ─────────────────────────────────────────────
// ADMIN SCREEN - WITH ADD-ON MANAGEMENT
// ─────────────────────────────────────────────
function AdminScreen() {
  const [menu, setMenuState] = useState<MenuItem[]>([]);
  const [addOns, setAddOns] = useState<MenuItem[]>([]);
  const [activeTab, setActiveTab] = useState<'menu' | 'addons'>('menu');
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { 
    const loadData = async () => {
      setLoading(true);
      try {
        const menuData = await getMenu();
        setMenuState(Array.isArray(menuData) ? menuData : []);
        const addOnsData = await getAddOnItems();
        setAddOns(Array.isArray(addOnsData) ? addOnsData : []);
      } catch (error) {
        console.error('Failed to load data:', error);
        setMenuState([]);
        setAddOns([]);
      } finally {
        setLoading(false);
      }
    };
    loadData();
    setShowPasswordModal(true);
  }, []);

  const handlePasswordSuccess = () => {
    setShowPasswordModal(false);
    setIsLocked(false);
  };

  const handlePasswordCancel = () => {
    setShowPasswordModal(false);
    setIsLocked(true);
  };

const saveMenuItem = async (item: MenuItem) => {
  try {
    await saveMenuItemWithAddons(item);
    
    // Refresh the menu list
    const menuData = await getMenu();
    setMenuState(menuData);
    
    // Refresh add-ons
    const addOnsData = await getAddOnItems();
    setAddOns(addOnsData);
    
    // Notify other components
    addOnsRefreshEvent.dispatchEvent(new Event('refresh'));
    
    // Close modal
    setEditing(null);
    setIsNew(false);
    
  } catch (error) {
    console.error('Error saving:', error);
    alert('Failed to save: ' + error.message);
  }
};

  const deleteMenuItem = async (id: string) => {
    try {
      const { error } = await supabase.from('menu_items').delete().eq('id', id);
      if (error) throw error;
      const updated = menu.filter(m => m.id !== id);
      setMenuState(updated);
    } catch (err) {
      console.error('Error in deleteMenuItem:', err);
    }
  };

  const toggleAvailability = (id: string) => {
    const updated = menu.map(m => m.id === id ? { ...m, available: !m.available } : m);
    saveMenu(updated);
    setMenuState(updated);
  };

  // Add-On functions
  const saveAddOn = async (addOn: MenuItem) => {
    try {
      if (isNew) {
        const { data, error } = await supabase
          .from('menu_items')
          .insert([{ ...addOn, category: 'Add Ons' }])
          .select();
        if (error) throw error;
        addOnsRefreshEvent.dispatchEvent(new Event('refresh'));
        if (data) setAddOns([...addOns, data[0]]);
      } else {
        const { error } = await supabase
          .from('menu_items')
          .update({ name: addOn.name, priceR: addOn.priceR, available: addOn.available })
          .eq('id', addOn.id);
        if (error) throw error;
        addOnsRefreshEvent.dispatchEvent(new Event('refresh'));
        setAddOns(addOns.map(a => a.id === addOn.id ? addOn : a));
      }
      setEditing(null);
      setIsNew(false);
    } catch (err) {
      console.error('Error saving add-on:', err);
      alert('Failed to save add-on');
    }
  };

  const deleteAddOn = async (id: string) => {
    try {
      const { error } = await supabase.from('menu_items').delete().eq('id', id);
      if (error) throw error;
      setAddOns(addOns.filter(a => a.id !== id));
    } catch (err) {
      console.error('Error deleting add-on:', err);
      alert('Failed to delete add-on');
    }
  };

  const toggleAddOnAvailability = async (id: string) => {
    const addOn = addOns.find(a => a.id === id);
    if (!addOn) return;
    const updated = { ...addOn, available: !addOn.available };
    try {
      const { error } = await supabase
        .from('menu_items')
        .update({ available: updated.available })
        .eq('id', id);
      if (error) throw error;
      setAddOns(addOns.map(a => a.id === id ? updated : a));
    } catch (err) {
      console.error('Error toggling add-on:', err);
    }
  };

  const startNewMenuItem = () => {
    setEditing({
      id: crypto.randomUUID(),
      name: '',
      category: CATEGORIES[0],
      priceR: 0,
      priceL: null,
      available: true,
      hasSizeOption: false,
      addOnIds: [],
    });
    setIsNew(true);
  };

  const startNewAddOn = () => {
    setEditing({
      id: crypto.randomUUID(),
      name: '',
      category: 'Add Ons',
      priceR: 0,
      priceL: null,
      available: true,
      hasSizeOption: false,
    });
    setIsNew(true);
  };

  if (loading) {
    return <div className="flex-1 p-4 bg-black text-white">Loading...</div>;
  }

  if (isLocked) {
    return (
      <>
        <div className="flex-1 p-4 bg-black flex items-center justify-center">
          <div className="bg-black border border-white/20 rounded-2xl p-8 text-center max-w-md">
            <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">🔒</span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Admin Area Locked</h2>
            <p className="text-gray-400 mb-6">Enter password to access management</p>
            <button
              onClick={() => setShowPasswordModal(true)}
              className="px-6 py-3 rounded-xl bg-white text-black font-semibold hover:bg-gray-200"
            >
              Enter Password
            </button>
          </div>
        </div>
        <AdminPasswordModal
          isOpen={showPasswordModal}
          onSuccess={handlePasswordSuccess}
          onCancel={handlePasswordCancel}
        />
      </>
    );
  }

  return (
    <div className="flex-1 p-4 overflow-y-auto bg-black">
      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-white/10">
        <button
          onClick={() => setActiveTab('menu')}
          className={`px-6 py-3 font-semibold transition-colors ${
            activeTab === 'menu'
              ? 'text-white border-b-2 border-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Menu Items
        </button>
        <button
          onClick={() => setActiveTab('addons')}
          className={`px-6 py-3 font-semibold transition-colors ${
            activeTab === 'addons'
              ? 'text-white border-b-2 border-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Add-Ons
        </button>
      </div>

      {/* Menu Items Tab */}
      {activeTab === 'menu' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-white">Menu Manager</h1>
            <button onClick={startNewMenuItem} className="px-5 py-2 rounded-xl bg-white text-black font-semibold hover:bg-gray-200">
              + Add Item
            </button>
          </div>

          <div className="bg-black border border-white/20 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-gray-300 border-b border-white/10">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-right">Price (R)</th>
                  <th className="px-4 py-3 text-right">Price (L)</th>
                  <th className="px-4 py-3 text-center">Available</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {menu.map(item => (
                  <tr key={item.id} className="border-t border-white/10 hover:bg-white/5">
                    <td className="px-4 py-2 font-medium text-white">{item.name}</td>
                    <td className="px-4 py-2 text-gray-400">{item.category}</td>
                    <td className="px-4 py-2 text-right text-white">₱{item.priceR}</td>
                    <td className="px-4 py-2 text-right text-white">{item.priceL ? `₱${item.priceL}` : '—'}</td>
                    <td className="px-4 py-2 text-center">
                      <button
                        onClick={() => toggleAvailability(item.id)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          item.available ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                        }`}
                      >
                        {item.available ? 'Yes' : 'No'}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => { setEditing(item); setIsNew(false); }} className="text-gray-300 hover:text-white text-xs mr-2">
                        Edit
                      </button>
                      <button onClick={() => deleteMenuItem(item.id)} className="text-red-400 hover:text-red-300 text-xs">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Add-Ons Tab */}
      {activeTab === 'addons' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-white">Add-Ons Manager</h1>
            <button onClick={startNewAddOn} className="px-5 py-2 rounded-xl bg-white text-black font-semibold hover:bg-gray-200">
              + Add Add-On
            </button>
          </div>

          <div className="bg-black border border-white/20 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-gray-300 border-b border-white/10">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-center">Available</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {addOns.map(addOn => (
                  <tr key={addOn.id} className="border-t border-white/10 hover:bg-white/5">
                    <td className="px-4 py-2 font-medium text-white">{addOn.name}</td>
                    <td className="px-4 py-2 text-right">
                      <input
                        type="number"
                        defaultValue={addOn.priceR}
                        onBlur={async (e) => {
                          const newPrice = parseFloat(e.target.value);
                          if (isNaN(newPrice) || newPrice === addOn.priceR) return;
                          const { error } = await supabase
                            .from('menu_items')
                            .update({ pricer: newPrice })
                            .eq('id', addOn.id);
                          if (!error) {
                            setAddOns(addOns.map(a => a.id === addOn.id ? { ...a, priceR: newPrice } : a));
                            addOnsRefreshEvent.dispatchEvent(new Event('refresh'));
                          }
                        }}
                        className="w-20 text-right bg-transparent border border-white/20 rounded-lg px-2 py-1 text-white focus:border-white focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button
                        onClick={() => toggleAddOnAvailability(addOn.id)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          addOn.available ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                        }`}
                      >
                        {addOn.available ? 'Yes' : 'No'}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => { setEditing(addOn); setIsNew(false); }} className="text-gray-300 hover:text-white text-xs mr-2">
                        Edit
                      </button>
                      <button onClick={() => deleteAddOn(addOn.id)} className="text-red-400 hover:text-red-300 text-xs">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Edit Modal */}
      {editing && (
        <AdminEditModal
          item={editing}
          isAddOn={activeTab === 'addons'}
          addOnsList={addOns}
          onSave={activeTab === 'addons' ? saveAddOn : saveMenuItem}
          onCancel={() => { setEditing(null); setIsNew(false); }}
        />
      )}
    </div>
  );
}

// AdminEditModal - works for both Menu Items and Add-Ons
function AdminEditModal({
  item,
  isAddOn,
  addOnsList,
  onSave,
  onCancel,
}: {
  item: MenuItem;
  isAddOn: boolean;
  addOnsList: MenuItem[];
  onSave: (item: MenuItem) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(item.category);
  const [priceR, setPriceR] = useState(item.priceR.toString());
  const [available, setAvailable] = useState(item.available);
  const [selectedAddOnIds, setSelectedAddOnIds] = useState<Set<string>>(
    new Set(item.addOnIds || [])
  );

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      ...item,
      name: name.trim(),
      category: isAddOn ? 'Add Ons' : category,
      priceR: parseFloat(priceR) || 0,
      priceL: null,
      hasSizeOption: false,
      available,
      addOnIds: isAddOn ? undefined : Array.from(selectedAddOnIds),
    });
  };

  const toggleAddOn = (addOnId: string) => {
    setSelectedAddOnIds(prev => {
      const next = new Set(prev);
      next.has(addOnId) ? next.delete(addOnId) : next.add(addOnId);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={onCancel}>
      <div className="bg-black border border-white/20 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-white/20">
          <h2 className="text-lg font-bold text-white">
            {isAddOn ? (item.name ? 'Edit Add-On' : 'New Add-On') : (item.name ? 'Edit Menu Item' : 'New Menu Item')}
          </h2>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white" />
          </div>
          
          {!isAddOn && (
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-1">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
          
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">Price (₱)</label>
            <input type="number" value={priceR} onChange={e => setPriceR(e.target.value)} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white" />
          </div>

          {/* Add-Ons selection - only for menu items */}
          {!isAddOn && addOnsList.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Available Add-Ons for this item
              </label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-white/5 rounded-xl">
                {addOnsList.map(addOn => (
                  <div key={addOn.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleAddOn(addOn.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        selectedAddOnIds.has(addOn.id)
                          ? 'bg-white text-black'
                          : 'bg-white/10 text-gray-300 hover:bg-white/20'
                      }`}
                    >
                      {addOn.name}
                    </button>
                    <input
                      type="number"
                      defaultValue={addOn.priceR}
                      onBlur={async (e) => {
                        const newPrice = parseFloat(e.target.value);
                        if (isNaN(newPrice) || newPrice === addOn.priceR) return;
                        await supabase
                          .from('menu_items')
                          .update({ pricer: newPrice })
                          .eq('id', addOn.id);
                        addOn.priceR = newPrice; // update local ref
                      }}
                      className="w-14 text-xs text-center bg-white/5 border border-white/20 rounded-lg px-1 py-1 text-white focus:border-white focus:outline-none"
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">Select add-ons that can be added to this item</p>
            </div>
          )}
          
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={available} onChange={e => setAvailable(e.target.checked)} className="w-5 h-5" />
            <span className="text-sm font-semibold text-gray-300">Available</span>
          </label>
        </div>
        <div className="p-5 border-t border-white/20 flex justify-end gap-3">
          <button onClick={onCancel} className="px-5 py-2 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20">Cancel</button>
          <button onClick={handleSave} className="px-5 py-2 rounded-xl bg-white text-black font-semibold hover:bg-gray-200">Save</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// DASHBOARD SCREEN - BLACK & WHITE (simplified)
// ─────────────────────────────────────────────
function DashboardScreen() {
  const [completedOrders, setCompletedOrders] = useState<Order[]>([]);
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reprinting, setReprinting] = useState<string | null>(null);

  useEffect(() => {
    loadCompletedOrders();
  }, []);

  const loadCompletedOrders = async () => {
    setLoading(true);
    try {
      const all = await getOrders();
      const today = new Date().toISOString().slice(0, 10);
      const todayCompleted = all.filter((o: Order) => o.createdAt.slice(0, 10) === today && o.status === 'done');
      setCompletedOrders(todayCompleted);
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
    if (!printerService.isConnected()) {
      alert('Printer not connected. Please connect printer first.');
      return;
    }
    setReprinting(order.id);
    try {
      const settings = await getStoreSettings();
      await printerService.printReceipt(order, settings);
      alert(`Receipt #${order.orderNumber} reprinted successfully!`);
    } catch (error) {
      alert('Failed to reprint: ' + error);
    } finally {
      setReprinting(null);
    }
  };

  if (loading) {
    return <div className="flex-1 p-6 bg-black text-white">Loading dashboard...</div>;
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto bg-black">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Today's Dashboard</h1>
        <button
          onClick={() => setShowPrinterSettings(true)}
          className="px-4 py-2 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors flex items-center gap-2 border border-white/20"
        >
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
                      {order.items.map((item, idx) => (
                        <div key={idx} className="text-sm text-gray-300">
                          {item.quantity}x {item.name}
                          {item.customization?.size && ` (${item.customization.size})`}
                        </div>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-white">₱{order.total.toFixed(2)}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleReprint(order)}
                        disabled={reprinting === order.id}
                        className="px-3 py-1 rounded-lg bg-white/10 text-white text-xs font-semibold hover:bg-white/20 transition-colors disabled:opacity-50 flex items-center gap-1 mx-auto"
                      >
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
        <PrinterSettingsModal 
          isOpen={showPrinterSettings}
          onClose={() => setShowPrinterSettings(false)}
          onSave={() => alert('Printer settings saved successfully!')}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// REPORTS SCREEN - BLACK & WHITE (simplified)
// ─────────────────────────────────────────────
function ReportsScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [exportSuccess, setExportSuccess] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrders();
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
    if (type === 'csv') {
      ExcelExport.exportToCSV(ordersInRange, filename);
    } else {
      ExcelExport.exportToJSON(ordersInRange, filename);
    }
    setExportSuccess(`✅ Exported ${ordersInRange.length} orders`);
    setTimeout(() => setExportSuccess(''), 5000);
    setShowDatePicker(false);
  };

  const salesByDay: Record<string, number> = {};
  orders.forEach(o => {
    const day = o.createdAt.slice(0, 10);
    salesByDay[day] = (salesByDay[day] || 0) + o.total;
  });
  const sortedDays = Object.entries(salesByDay).sort((a, b) => b[0].localeCompare(a[0]));

  const salesByMonth: Record<string, number> = {};
  orders.forEach(o => {
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
  orders.forEach(o => {
    o.items.forEach(i => {
      if (!salesByItem[i.menuItemId]) salesByItem[i.menuItemId] = { name: i.name, qty: 0, revenue: 0 };
      salesByItem[i.menuItemId].qty += i.quantity;
      salesByItem[i.menuItemId].revenue += i.lineTotal;
    });
  });
  const sortedItems = Object.values(salesByItem).sort((a, b) => b.revenue - a.revenue);

  const salesByCat: Record<string, number> = {};
  orders.forEach(o => {
    o.items.forEach(i => {
      salesByCat[i.category] = (salesByCat[i.category] || 0) + i.lineTotal;
    });
  });
  const sortedCats = Object.entries(salesByCat).sort((a, b) => b[1] - a[1]);

  const maxDayRevenue = sortedDays.length > 0 ? Math.max(...sortedDays.map(d => d[1])) : 1;
  const maxItemRevenue = sortedItems.length > 0 ? Math.max(...sortedItems.map(i => i.revenue)) : 1;
  const maxCatRevenue = sortedCats.length > 0 ? Math.max(...sortedCats.map(c => c[1])) : 1;

  if (loading) {
    return <div className="flex-1 p-6 bg-black text-white">Loading reports...</div>;
  }

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
          <button
            onClick={() => setShowDatePicker(true)}
            className="px-4 py-2 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors flex items-center gap-2 border border-white/20"
          >
            <span>⬇️</span> Export Orders
          </button>
        </div>
      </div>

      {exportSuccess && (
        <div className="mb-4 p-3 bg-green-900/30 border border-green-800 text-green-400 rounded-lg">
          {exportSuccess}
        </div>
      )}

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
              <span className={monthOverMonthChange >= '0' ? 'text-green-400' : 'text-red-400'}>
                {monthOverMonthChange}% vs last month
              </span>
            </div>
          </div>

          <div className="bg-black border border-white/20 rounded-2xl p-5 col-span-2">
            <h3 className="font-semibold text-gray-300 mb-3">Monthly Totals</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
              {sortedMonths.map(([month, total]) => {
                const [year, mon] = month.split('-');
                const monthName = new Date(parseInt(year), parseInt(mon)-1).toLocaleString('default', { month: 'short' });
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

      {showDatePicker && (
        <DateRangePicker onExport={handleExport} onClose={() => setShowDatePicker(false)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────
export default function OceanBrewApp() {
  const [screen, setScreen] = useState<Screen>('order');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleOrderPlaced = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

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
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import PrinterService from '@/lib/printerService';
import { getStoreSettings } from '@/lib/store';
import PrinterSettingsModal from '@/components/PrinterSettingsModal';
import DateRangePicker from '@/components/DateRangePicker';
import AdminPasswordModal from '@/components/AdminPasswordModal';

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
  getOrders,
  saveOrder,
  updateOrder,
  getNextOrderNumber,
  getAddOnItems,
} from '@/lib/store';

// ─────────────────────────────────────────────
// NAV BAR
// ─────────────────────────────────────────────
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
    <nav className="flex items-center bg-sky-700 text-white px-4 h-14 shrink-0">
      <span className="font-bold text-lg mr-8 tracking-wide">Ocean Brew</span>
      <div className="flex gap-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setScreen(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              screen === t.key ? 'bg-white text-sky-700' : 'hover:bg-sky-600'
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
// CUSTOMIZATION MODAL - WITH FIX FOR ESPRESSO (NO SUGAR, SPECIAL ADD-ONS)
// ─────────────────────────────────────────────
const SUGAR_LEVELS: SugarLevel[] = ['0%', '25%', '50%', '75%', '100%'];
const ICE_LEVELS: IceLevel[] = ['No Ice', 'Less Ice', 'Normal Ice'];

// Espresso-specific add-ons
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
  
  // Calculate add-ons total based on item type
  const addOnsTotal = (() => {
    const isEspresso = item.category === 'Espresso';
    if (isEspresso) {
      // Use espresso-specific add-ons
      return ESPRESSO_ADDONS
        .filter(a => selectedAddOns.has(a.id))
        .reduce((s, a) => s + a.price, 0);
    } else {
      // Use regular add-ons from store
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
    
    // Build add-ons array based on item type
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
      // For Espresso: no sugar level
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
      lineTotal,
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b">
          <h2 className="text-xl font-bold text-gray-800">{item.name}</h2>
          <p className="text-gray-500">₱{item.priceR}{item.priceL ? ` / ₱${item.priceL}` : ''}</p>
        </div>

        <div className="p-5 space-y-5">
          {/* Size */}
          {item.hasSizeOption && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Size</label>
              <div className="flex gap-3">
                {(['R', 'L'] as Size[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setSize(s)}
                    className={`flex-1 py-3 rounded-xl text-lg font-bold border-2 transition-colors ${
                      size === s
                        ? 'border-sky-600 bg-sky-50 text-sky-700'
                        : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    {s === 'R' ? 'Regular' : 'Large'} — ₱{s === 'R' ? item.priceR : item.priceL}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Hot/Cold toggle - ONLY for Espresso */}
          {isEspresso && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Temperature</label>
              <div className="flex gap-3">
                {(['Hot', 'Cold'] as const).map(temp => (
                  <button
                    key={temp}
                    onClick={() => setTemperature(temp)}
                    className={`flex-1 py-3 rounded-xl text-lg font-bold border-2 transition-colors ${
                      temperature === temp
                        ? 'border-sky-600 bg-sky-50 text-sky-700'
                        : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    {temp}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sugar - NOT for Espresso! */}
          {isDrink && !isEspresso && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Sugar Level</label>
              <div className="flex flex-wrap gap-2">
                {SUGAR_LEVELS.map(sl => (
                  <button
                    key={sl}
                    onClick={() => setSugar(sl)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                      sugar === sl
                        ? 'border-sky-600 bg-sky-50 text-sky-700'
                        : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    {sl}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Ice - NOT for Espresso! */}
          {isDrink && !isEspresso && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Ice Level</label>
              <div className="flex flex-wrap gap-2">
                {ICE_LEVELS.map(il => (
                  <button
                    key={il}
                    onClick={() => setIce(il)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                      ice === il
                        ? 'border-sky-600 bg-sky-50 text-sky-700'
                        : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    {il}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Add-ons - Different for Espresso vs Regular */}
          {isDrink && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                {isEspresso ? 'Espresso Add-ons' : 'Add-ons'}
              </label>
              <div className="flex flex-wrap gap-2">
                {isEspresso ? (
                  // Espresso-specific add-ons
                  ESPRESSO_ADDONS.map(a => (
                    <button
                      key={a.id}
                      onClick={() => toggleAddOn(a.id)}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                        selectedAddOns.has(a.id)
                          ? 'border-sky-600 bg-sky-50 text-sky-700'
                          : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      {a.name} +₱{a.price}
                    </button>
                  ))
                ) : (
                  // Regular add-ons
                  addOnItems.map(a => (
                    <button
                      key={a.id}
                      onClick={() => toggleAddOn(a.id)}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                        selectedAddOns.has(a.id)
                          ? 'border-sky-600 bg-sky-50 text-sky-700'
                          : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      {a.name} +₱{a.priceR}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Quantity */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Quantity</label>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                className="w-12 h-12 rounded-xl bg-gray-100 text-xl font-bold text-gray-700 active:bg-gray-200"
              >
                -
              </button>
              <span className="text-2xl font-bold w-8 text-center">{quantity}</span>
              <button
                onClick={() => setQuantity(q => q + 1)}
                className="w-12 h-12 rounded-xl bg-gray-100 text-xl font-bold text-gray-700 active:bg-gray-200"
              >
                +
              </button>
            </div>
          </div>

          {/* Discount */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Discount</label>
            <div className="flex gap-2 items-center">
              <select
                value={discountType}
                onChange={e => setDiscountType(e.target.value as 'percent' | 'fixed')}
                className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm"
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
                className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm flex-1"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t bg-gray-50 rounded-b-2xl flex items-center justify-between">
          <div>
            <span className="text-sm text-gray-500">Total:</span>
            <span className="text-2xl font-bold text-sky-700 ml-2">₱{lineTotal.toFixed(2)}</span>
          </div>
          <div className="flex gap-3">
            <button onClick={onCancel} className="px-5 py-3 rounded-xl text-gray-600 font-semibold bg-gray-200 active:bg-gray-300">
              Cancel
            </button>
            <button onClick={handleConfirm} className="px-5 py-3 rounded-xl text-white font-semibold bg-sky-600 active:bg-sky-700">
              Add to Order
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PRINTER SETTINGS BUTTON (for Order Screen)
// ─────────────────────────────────────────────
function PrinterStatusBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [isConnected, setIsConnected] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [connectionType, setConnectionType] = useState<'thermal' | 'test' | 'none'>('none');

  useEffect(() => {
    const interval = setInterval(() => {
      setIsConnected(PrinterService.isConnected());
      setDeviceName(PrinterService.getDeviceName());
      setConnectionType(PrinterService.getConnectionType());
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
    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200">
      <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
      <span className="text-xs font-medium text-gray-600">
        {getStatusText()}
      </span>
      <button
        onClick={onOpenSettings}
        className="ml-1 px-2 py-1 text-xs bg-sky-100 text-sky-700 rounded-md hover:bg-sky-200"
      >
        🖨️ Settings
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// PRINT CONFIRMATION MODAL
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
  const [isPrinterConnected, setIsPrinterConnected] = useState(PrinterService.isConnected());

  useEffect(() => {
    setIsPrinterConnected(PrinterService.isConnected());
  }, []);

  const handlePrint = async () => {
    if (!PrinterService.isConnected()) {
      setPrintError('Printer not connected. Please connect printer first.');
      return;
    }

    setIsPrinting(true);
    setPrintError('');

    try {
      const settings = getStoreSettings();
      await PrinterService.printReceipt(order, settings);
      onConfirm();
    } catch (error) {
      setPrintError('Failed to print: ' + error);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center">
              <span className="text-2xl">🖨️</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">Print Receipt</h2>
              <p className="text-gray-500">Order #{order.orderNumber}</p>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <p className="text-sm text-gray-600 mb-2">Total Amount:</p>
            <p className="text-3xl font-bold text-sky-700">₱{order.total.toFixed(2)}</p>
            <p className="text-xs text-gray-500 mt-2">
              {new Date(order.createdAt).toLocaleString()}
            </p>
          </div>

          {!isPrinterConnected && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
              <div className="flex items-start gap-2">
                <span className="text-amber-600 text-lg">⚠️</span>
                <div>
                  <p className="text-sm font-semibold text-amber-800">Printer Not Connected</p>
                  <p className="text-xs text-amber-700 mt-1">
                    Please click the <span className="font-bold">"Printer Settings"</span> button below to connect your Bluetooth printer.
                  </p>
                </div>
              </div>
            </div>
          )}

          {printError && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl mb-4 text-sm">
              {printError}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {!isPrinterConnected && (
              <button
                onClick={onOpenPrinterSettings}
                className="w-full py-3 rounded-xl bg-amber-500 font-semibold text-white hover:bg-amber-600 transition-colors flex items-center justify-center gap-2"
              >
                🖨️ Printer Settings
              </button>
            )}
            
            <div className="flex gap-3">
              <button
                onClick={onSkip}
                className="flex-1 py-3 rounded-xl bg-gray-200 font-semibold text-gray-700 hover:bg-gray-300 transition-colors"
              >
                Skip
              </button>
              <button
                onClick={handlePrint}
                disabled={isPrinting || !isPrinterConnected}
                className="flex-1 py-3 rounded-xl bg-sky-600 font-semibold text-white hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
              className="w-full mt-1 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
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
// SCREEN 1: ORDER TAKING
// ─────────────────────────────────────────────
function OrderScreen({ onOrderPlaced }: { onOrderPlaced: () => void }) {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('Classic');
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [modalItem, setModalItem] = useState<MenuItem | null>(null);
  const [addOnItems, setAddOnItems] = useState<MenuItem[]>([]);
  const [showPrintSuccess, setShowPrintSuccess] = useState(false);
  const [printError, setPrintError] = useState('');
  const [pendingOrder, setPendingOrder] = useState<Order | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);

  useEffect(() => {
    setMenu(getMenu());
    setAddOnItems(getAddOnItems());
  }, []);

  const categories = Array.from(new Set(menu.map(m => m.category)));
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

  const generateOrder = async () => {
    if (cart.length === 0) return;
    
    const order: Order = {
      id: crypto.randomUUID(),
      orderNumber: getNextOrderNumber(),
      items: cart,
      subtotal,
      discount: totalDiscount,
      total,
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    
    await saveOrder(order);
    setPendingOrder(order);
    setShowPrintModal(true);
  };

  const handlePrintConfirm = async () => {
    if (!pendingOrder) return;
    
    try {
      const settings = getStoreSettings();
      await PrinterService.printReceipt(pendingOrder, settings);
      setShowPrintSuccess(true);
      setTimeout(() => setShowPrintSuccess(false), 3000);
    } catch (error) {
      setPrintError('Failed to print: ' + error);
      setTimeout(() => setPrintError(''), 3000);
    }
    
    setShowPrintModal(false);
    setPendingOrder(null);
    setCart([]);
    onOrderPlaced();
  };

  const handlePrintSkip = () => {
    setShowPrintModal(false);
    setPendingOrder(null);
    setCart([]);
    onOrderPlaced();
  };

  const handlePrintCancel = () => {
    setShowPrintModal(false);
  };

  const testPrint = async () => {
    if (!PrinterService.isConnected()) {
      setPrintError('Printer not connected. Please connect printer first.');
      setTimeout(() => setPrintError(''), 3000);
      return;
    }

    try {
      const settings = getStoreSettings();
      const testOrder = {
        orderNumber: 'TEST',
        items: [{ 
          name: 'TEST PRINT', 
          quantity: 1, 
          lineTotal: 0,
          customization: { 
            size: 'R', 
            addOns: [],
            temperature: undefined,
            sugar: '100%',
            ice: 'Normal Ice',
            discount: null
          }
        }],
        subtotal: 0,
        discount: 0,
        total: 0,
        createdAt: new Date().toISOString(),
        id: 'test',
        status: 'pending'
      };
      await PrinterService.printReceipt(testOrder, settings);
      setShowPrintSuccess(true);
      setTimeout(() => setShowPrintSuccess(false), 3000);
    } catch (error) {
      setPrintError('Failed to print: ' + error);
      setTimeout(() => setPrintError(''), 3000);
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden relative">
      {/* Print Status Messages */}
      {showPrintSuccess && (
        <div className="absolute top-4 right-4 bg-green-100 border border-green-400 text-green-700 px-4 py-2 rounded-lg z-50 shadow-lg">
          ✓ Receipt printed successfully!
        </div>
      )}
      {printError && (
        <div className="absolute top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded-lg z-50 shadow-lg">
          {printError}
        </div>
      )}

      {/* Left: Categories */}
      <div className="w-40 bg-gray-50 border-r overflow-y-auto shrink-0">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`w-full text-left px-3 py-3 text-sm font-semibold border-b transition-colors ${
              activeCategory === cat
                ? 'bg-sky-600 text-white'
                : 'text-gray-700 hover:bg-gray-100 active:bg-gray-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Center: Item Grid */}
      <div className="flex-1 p-4 overflow-y-auto bg-gray-100">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredItems.map(item => (
            <button
              key={item.id}
              onClick={() => setModalItem(item)}
              className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 flex flex-col items-center justify-center text-center active:scale-95 transition-transform min-h-[100px]"
            >
              <span className="font-bold text-gray-800 text-sm leading-tight">{item.name}</span>
              <span className="text-sky-600 font-bold mt-1 text-base">
                ₱{item.priceR}
                {item.priceL ? <span className="text-gray-400 text-xs"> / ₱{item.priceL}</span> : ''}
              </span>
            </button>
          ))}
          {filteredItems.length === 0 && (
            <p className="col-span-full text-center text-gray-400 py-12">No items in this category</p>
          )}
        </div>
      </div>

      {/* Right: Order Summary */}
      <div className="w-80 bg-white border-l flex flex-col shrink-0">
        <div className="px-4 py-3 border-b bg-sky-600 text-white flex justify-between items-center">
          <h2 className="font-bold text-base">Current Order</h2>
          <div className="flex items-center gap-2">
            {PrinterService.isConnected() && (
              <button
                onClick={testPrint}
                className="px-2 py-1 bg-purple-500 rounded-lg text-xs font-semibold hover:bg-purple-600 transition-colors"
                title="Test Printer"
              >
                🖨️ Test
              </button>
            )}
            <PrinterStatusBar onOpenSettings={() => setShowPrinterSettings(true)} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-8">Tap an item to start</p>
          )}
          {cart.map(item => (
            <div key={item.id} className="bg-white rounded-lg p-3 border border-gray-200 text-sm hover:bg-gray-50 transition-colors">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-800">{item.quantity}x {item.name}</span>
                    <button 
                      onClick={() => removeFromCart(item.id)} 
                      className="text-white bg-red-500 hover:bg-red-600 text-xs px-2 py-0.5 rounded-full transition-colors"
                      title="Remove item"
                    >
                      ×
                    </button>
                  </div>
                  <div className="text-xs text-gray-500 mt-1.5 pl-1">
                    <div className="flex flex-wrap gap-1">
                      <span className="bg-gray-100 px-1.5 py-0.5 rounded">{item.customization.size}</span>
                      {item.customization.temperature && (
                        <span className="bg-gray-100 px-1.5 py-0.5 rounded">{item.customization.temperature}</span>
                      )}
                      {item.customization.sugar !== '100%' && (
                        <span className="bg-gray-100 px-1.5 py-0.5 rounded">{item.customization.sugar} sugar</span>
                      )}
                      {item.customization.ice !== 'Normal Ice' && (
                        <span className="bg-gray-100 px-1.5 py-0.5 rounded">{item.customization.ice}</span>
                      )}
                      {item.customization.addOns.length > 0 && (
                        <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                          +{item.customization.addOns.map(a => a.name).join(', ')}
                        </span>
                      )}
                      {item.customization.discount && (
                        <span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded">
                          -{item.customization.discount.type === 'percent' ? `${item.customization.discount.value}%` : `₱${item.customization.discount.value}`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="ml-2">
                  <span className="font-bold text-sky-700 text-base">₱{item.lineTotal.toFixed(0)}</span>
                </div>
              </div>
            </div>
          ))}
          {cart.length > 0 && (
            <div className="p-3 border-t border-gray-200">
              <button
                onClick={() => setCart([])}
                className="w-full py-2.5 rounded-lg bg-red-50 text-red-600 font-semibold text-sm hover:bg-red-100 active:bg-red-200 transition-colors border border-red-200"
              >
                🗑️ Clear All Items
              </button>
            </div>
          )}
        </div>
        <div className="p-3 border-t space-y-1 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span><span>₱{subtotal.toFixed(2)}</span>
          </div>
          {totalDiscount > 0 && (
            <div className="flex justify-between text-red-500">
              <span>Discount</span><span>-₱{totalDiscount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold text-gray-800 pt-1 border-t">
            <span>Total</span><span>₱{total.toFixed(2)}</span>
          </div>
        </div>
        <div className="p-3 border-t">
          <button
            onClick={generateOrder}
            disabled={cart.length === 0}
            className="w-full py-3 rounded-xl bg-sky-600 font-semibold text-white text-sm active:bg-sky-700 disabled:opacity-40 transition-colors"
          >
            Generate Order
          </button>
          <button
            onClick={cancelOrder}
            disabled={cart.length === 0}
            className="w-full mt-2 py-2 rounded-lg text-gray-500 font-semibold text-sm hover:text-gray-700 disabled:opacity-40 transition-colors"
          >
            Cancel Order
          </button>
        </div>
      </div>

      {/* Customization Modal */}
      {modalItem && (
        <CustomizationModal
          item={modalItem}
          addOnItems={addOnItems}
          onConfirm={addToCart}
          onCancel={() => setModalItem(null)}
        />
      )}

      {/* Print Confirmation Modal */}
      {showPrintModal && pendingOrder && (
        <PrintConfirmationModal
          order={pendingOrder}
          onConfirm={handlePrintConfirm}
          onCancel={handlePrintCancel}
          onSkip={handlePrintSkip}
          onOpenPrinterSettings={() => {
            setShowPrintModal(false);
            setShowPrinterSettings(true);
          }}
        />
      )}

      {/* Printer Settings Modal */}
      {showPrinterSettings && (
        <PrinterSettingsModal 
          isOpen={showPrinterSettings}
          onClose={() => setShowPrinterSettings(false)}
          onSave={() => {
            alert('Printer settings saved successfully!');
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// SCREEN 2: BARISTA QUEUE - FIXED WITH ASYNC/AWAIT
// ─────────────────────────────────────────────
function QueueScreen({ refreshKey }: { refreshKey: number }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPendingOrders();
  }, [refreshKey]);

  const loadPendingOrders = async () => {
    setLoading(true);
    try {
      const all = await getOrders();
      setOrders(all.filter(o => o.status === 'pending'));
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const printReceipt = async (order: Order) => {
    if (!PrinterService.isConnected()) {
      alert('Printer not connected. Please click the Printer Settings button to connect.');
      return;
    }

    try {
      const settings = getStoreSettings();
      await PrinterService.printReceipt(order, settings);
      alert(`Receipt #${order.orderNumber} sent to printer!`);
    } catch (error) {
      alert('Failed to print: ' + error);
    }
  };

  const markDone = async (id: string) => {
    await updateOrder(id, { status: 'done' });
    setOrders(prev => prev.filter(o => o.id !== id));
  };

  if (loading) {
    return (
      <div className="flex-1 p-4 overflow-y-auto bg-gray-100">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading queue...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 overflow-y-auto bg-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">Barista Queue</h1>
        <button
          onClick={() => setShowPrinterSettings(true)}
          className="px-4 py-2 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors flex items-center gap-2"
        >
          <span>🖨️</span> Printer Settings
        </button>
      </div>

      {orders.length === 0 && (
        <p className="text-gray-400 text-center py-12 text-lg">No pending orders</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {orders.map(order => (
          <div key={order.id} className="bg-white rounded-2xl shadow-sm border p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl font-bold text-sky-700">#{order.orderNumber}</span>
              <span className="text-sm text-gray-400">
                {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="space-y-2 mb-4">
              {order.items.map(item => (
                <div key={item.id} className="text-sm">
                  <span className="font-semibold">{item.quantity}x {item.name}</span>
                  <div className="text-xs text-gray-500 ml-4">
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
                className="flex-1 py-2 rounded-xl bg-blue-500 text-white font-semibold text-sm hover:bg-blue-600 transition-colors flex items-center justify-center gap-1"
              >
                🖨️ Print
              </button>
              <button
                onClick={() => markDone(order.id)}
                className="flex-1 py-2 rounded-xl bg-green-500 text-white font-bold text-sm hover:bg-green-600 transition-colors"
              >
                DONE
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Printer Settings Modal */}
      {showPrinterSettings && (
        <PrinterSettingsModal 
          isOpen={showPrinterSettings}
          onClose={() => setShowPrinterSettings(false)}
          onSave={() => {
            alert('Printer settings saved successfully!');
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// SCREEN 3: ADMIN MENU (Password Protected)
// ─────────────────────────────────────────────
function AdminScreen() {
  const [menu, setMenuState] = useState<MenuItem[]>([]);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  useEffect(() => { 
    setMenuState(getMenu());
    // Show password modal when admin screen loads
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

  const save = (item: MenuItem) => {
    let updated: MenuItem[];
    if (isNew) {
      updated = [...menu, item];
    } else {
      updated = menu.map(m => (m.id === item.id ? item : m));
    }
    saveMenu(updated);
    setMenuState(updated);
    setEditing(null);
    setIsNew(false);
  };

  const deleteItem = (id: string) => {
    const updated = menu.filter(m => m.id !== id);
    saveMenu(updated);
    setMenuState(updated);
  };

  const toggleAvailability = (id: string) => {
    const updated = menu.map(m => m.id === id ? { ...m, available: !m.available } : m);
    saveMenu(updated);
    setMenuState(updated);
  };

  const startNew = () => {
    setEditing({
      id: crypto.randomUUID(),
      name: '',
      category: CATEGORIES[0],
      priceR: 0,
      priceL: null,
      available: true,
      hasSizeOption: false,
    });
    setIsNew(true);
  };

  // If locked, show password modal
  if (isLocked) {
    return (
      <>
        <div className="flex-1 p-4 overflow-y-auto bg-gray-100 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-sm border p-8 text-center max-w-md">
            <div className="w-20 h-20 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">🔒</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Admin Area Locked</h2>
            <p className="text-gray-500 mb-6">Enter password to access menu management</p>
            <button
              onClick={() => setShowPasswordModal(true)}
              className="px-6 py-3 rounded-xl bg-sky-600 text-white font-semibold hover:bg-sky-700"
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
    <div className="flex-1 p-4 overflow-y-auto bg-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">Menu Manager (Admin)</h1>
        <button onClick={startNew} className="px-5 py-2 rounded-xl bg-sky-600 text-white font-semibold active:bg-sky-700">
          + Add Item
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
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
              <tr key={item.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2 font-medium">{item.name}</td>
                <td className="px-4 py-2 text-gray-500">{item.category}</td>
                <td className="px-4 py-2 text-right">₱{item.priceR}</td>
                <td className="px-4 py-2 text-right">{item.priceL ? `₱${item.priceL}` : '—'}</td>
                <td className="px-4 py-2 text-center">
                  <button
                    onClick={() => toggleAvailability(item.id)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      item.available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {item.available ? 'Yes' : 'No'}
                  </button>
                </td>
                <td className="px-4 py-2 text-center">
                  <button onClick={() => { setEditing(item); setIsNew(false); }} className="text-sky-600 hover:underline text-xs mr-2">
                    Edit
                  </button>
                  <button onClick={() => deleteItem(item.id)} className="text-red-500 hover:underline text-xs">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editing && (
        <AdminEditModal item={editing} onSave={save} onCancel={() => { setEditing(null); setIsNew(false); }} />
      )}
    </div>
  );
}

function AdminEditModal({
  item,
  onSave,
  onCancel,
}: {
  item: MenuItem;
  onSave: (item: MenuItem) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(item.category);
  const [priceR, setPriceR] = useState(item.priceR.toString());
  const [priceL, setPriceL] = useState(item.priceL?.toString() ?? '');
  const [hasSizeOption, setHasSizeOption] = useState(item.hasSizeOption);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      ...item,
      name: name.trim(),
      category,
      priceR: parseFloat(priceR) || 0,
      priceL: hasSizeOption && priceL ? parseFloat(priceL) : null,
      hasSizeOption,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b">
          <h2 className="text-lg font-bold">{item.name ? 'Edit Item' : 'New Item'}</h2>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full border-2 rounded-xl px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className="w-full border-2 rounded-xl px-3 py-2">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-semibold mb-1">Price (Regular)</label>
              <input type="number" value={priceR} onChange={e => setPriceR(e.target.value)} className="w-full border-2 rounded-xl px-3 py-2" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-semibold mb-1">Price (Large)</label>
              <input
                type="number"
                value={priceL}
                onChange={e => setPriceL(e.target.value)}
                disabled={!hasSizeOption}
                placeholder={hasSizeOption ? '' : 'N/A'}
                className="w-full border-2 rounded-xl px-3 py-2 disabled:bg-gray-100"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={hasSizeOption} onChange={e => setHasSizeOption(e.target.checked)} className="w-5 h-5" />
            <span className="text-sm font-semibold">Has R/L size option</span>
          </label>
        </div>
        <div className="p-5 border-t flex justify-end gap-3">
          <button onClick={onCancel} className="px-5 py-2 rounded-xl bg-gray-200 font-semibold">Cancel</button>
          <button onClick={handleSave} className="px-5 py-2 rounded-xl bg-sky-600 text-white font-semibold">Save</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SCREEN 4: TODAY'S DASHBOARD - FIXED WITH ASYNC/AWAIT
// ─────────────────────────────────────────────
function DashboardScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTodayOrders();
  }, []);

  const loadTodayOrders = async () => {
    setLoading(true);
    try {
      const all = await getOrders();
      const today = new Date().toISOString().slice(0, 10);
      const todayOrders = all.filter((o: Order) => o.createdAt.slice(0, 10) === today);
      setOrders(todayOrders);
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalSales = orders.filter(o => o.status === 'done').reduce((s, o) => s + o.total, 0);
  const totalOrders = orders.length;

  const itemCounts: Record<string, { name: string; count: number }> = {};
  orders.forEach(o => {
    o.items.forEach(i => {
      if (!itemCounts[i.menuItemId]) itemCounts[i.menuItemId] = { name: i.name, count: 0 };
      itemCounts[i.menuItemId].count += i.quantity;
    });
  });
  const bestSelling = Object.values(itemCounts).sort((a, b) => b.count - a.count)[0];

  if (loading) {
    return (
      <div className="flex-1 p-6 overflow-y-auto bg-gray-100">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto bg-gray-100">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Today&apos;s Dashboard</h1>
        <button
          onClick={() => setShowPrinterSettings(true)}
          className="px-4 py-2 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors flex items-center gap-2"
        >
          <span>🖨️</span> Printer Settings
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl shadow-sm border p-6 text-center">
          <p className="text-gray-500 text-sm mb-1">Total Sales Today</p>
          <p className="text-4xl font-bold text-sky-700">₱{totalSales.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border p-6 text-center">
          <p className="text-gray-500 text-sm mb-1">Total Orders Today</p>
          <p className="text-4xl font-bold text-sky-700">{totalOrders}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border p-6 text-center">
          <p className="text-gray-500 text-sm mb-1">Best Selling Item</p>
          <p className="text-2xl font-bold text-sky-700">{bestSelling ? `${bestSelling.name} (${bestSelling.count})` : '—'}</p>
        </div>
      </div>

      {/* Printer Settings Modal */}
      {showPrinterSettings && (
        <PrinterSettingsModal 
          isOpen={showPrinterSettings}
          onClose={() => setShowPrinterSettings(false)}
          onSave={() => {
            alert('Printer settings saved successfully!');
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// SCREEN 5: REPORTS WITH EXPORT - WITH MONTHLY TOTAL
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
      console.log('📦 Loaded orders:', allOrders.length);
      setOrders(allOrders);
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (startDate: Date, endDate: Date, type: 'csv' | 'json') => {
    const { getOrdersByDateRange } = await import('@/lib/store');
    const ExcelExport = (await import('@/lib/excelExport')).default;
    
    // Get ALL orders
    const allOrders = await getOrders();
    
    // Convert dates to YYYY-MM-DD for comparison
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    
    console.log('🔍 Searching from', startStr, 'to', endStr);
    
    // Filter by date (compare just the date part)
    const ordersInRange = allOrders.filter(order => {
      const orderDate = order.createdAt.split('T')[0]; // Gets "2026-02-13"
      return orderDate >= startStr && orderDate <= endStr;
    });
    
    console.log('📊 Found orders:', ordersInRange.length);
    
    if (ordersInRange.length === 0) {
      alert(`❌ No orders found from ${startStr} to ${endStr}`);
      return;
    }

    const filename = `ocean-brew-orders_${startStr}_to_${endStr}`;
    
    if (type === 'csv') {
      ExcelExport.exportToCSV(ordersInRange, filename);
    } else {
      ExcelExport.exportToJSON(ordersInRange, filename);
    }

    setExportSuccess(`✅ Exported ${ordersInRange.length} orders from ${startStr} to ${endStr}`);
    setTimeout(() => setExportSuccess(''), 5000);
    setShowDatePicker(false);
  };

  // Sales calculations
  const salesByDay: Record<string, number> = {};
  orders.forEach(o => {
    const day = o.createdAt.slice(0, 10);
    salesByDay[day] = (salesByDay[day] || 0) + o.total;
  });
  const sortedDays = Object.entries(salesByDay).sort((a, b) => b[0].localeCompare(a[0]));

  // Calculate monthly totals
  const salesByMonth: Record<string, number> = {};
  orders.forEach(o => {
    const month = o.createdAt.slice(0, 7); // Gets "2026-02"
    salesByMonth[month] = (salesByMonth[month] || 0) + o.total;
  });
  const sortedMonths = Object.entries(salesByMonth).sort((a, b) => b[0].localeCompare(a[0]));

  // Calculate current month total
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentMonthTotal = salesByMonth[currentMonth] || 0;

  // Previous month total (for comparison)
  const prevDate = new Date();
  prevDate.setMonth(prevDate.getMonth() - 1);
  const prevMonth = prevDate.toISOString().slice(0, 7);
  const prevMonthTotal = salesByMonth[prevMonth] || 0;
  const monthOverMonthChange = prevMonthTotal > 0 
    ? ((currentMonthTotal - prevMonthTotal) / prevMonthTotal * 100).toFixed(1)
    : '0';

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
    return (
      <div className="flex-1 p-6 overflow-y-auto bg-gray-100">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading reports...</div>
        </div>
      </div>
    );
 }

  return (
    <div className="flex-1 p-6 overflow-y-auto bg-gray-100">
      {/* HEADER WITH EXPORT BUTTONS */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Sales Reports</h1>
          <p className="text-sm text-gray-500 mt-1">Last 30 days • {orders.length} total orders</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={async () => {
              const { getDatabaseStats } = await import('@/lib/store');
              const stats = await getDatabaseStats();
              alert(`📊 Database Stats\n\nTotal Orders: ${stats.totalOrders}\nOldest: ${stats.dateRange.oldest.toLocaleDateString()}\nNewest: ${stats.dateRange.newest.toLocaleDateString()}`);
            }}
            className="px-4 py-2 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-colors flex items-center gap-2"
          >
            <span>📊</span> DB Stats
          </button>
          <button
            onClick={() => setShowDatePicker(true)}
            className="px-4 py-2 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            <span>⬇️</span> Export Orders
          </button>
        </div>
      </div>

      {/* EXPORT SUCCESS MESSAGE */}
      {exportSuccess && (
        <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded-lg">
          {exportSuccess}
        </div>
      )}

      {/* NO ORDERS MESSAGE */}
      {orders.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm border p-12 text-center">
          <p className="text-gray-400 text-lg">No orders to report</p>
          <p className="text-gray-400 text-sm mt-2">Orders will appear here after you generate them</p>
        </div>
      )}

      {/* MONTHLY SUMMARY CARDS */}
      {sortedMonths.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Current Month Card */}
          <div className="bg-gradient-to-br from-sky-500 to-sky-600 rounded-2xl shadow-sm p-5 text-white">
            <p className="text-sm opacity-90 mb-1">Current Month</p>
            <p className="text-3xl font-bold">{currentMonth}</p>
            <p className="text-2xl font-bold mt-2">₱{currentMonthTotal.toFixed(2)}</p>
            <div className="flex items-center mt-2 text-sm">
              <span className={`${monthOverMonthChange >= '0' ? 'text-green-200' : 'text-red-200'}`}>
                {monthOverMonthChange}% vs last month
              </span>
            </div>
          </div>

          {/* Monthly Breakdown */}
          <div className="bg-white rounded-2xl shadow-sm border p-5 col-span-2">
            <h3 className="font-semibold text-gray-700 mb-3">Monthly Totals</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
              {sortedMonths.map(([month, total]) => {
                const [year, mon] = month.split('-');
                const monthName = new Date(parseInt(year), parseInt(mon)-1).toLocaleString('default', { month: 'short' });
                return (
                  <div key={month} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{monthName} {year}</span>
                    <span className="font-semibold text-gray-800">₱{total.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Sales by Day */}
      {sortedDays.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border p-5 mb-6">
          <h2 className="font-bold text-lg text-gray-800 mb-4">Daily Sales</h2>
          <div className="space-y-2">
            {sortedDays.map(([day, total]) => (
              <div key={day} className="flex items-center gap-3">
                <span className="w-28 text-sm font-medium text-gray-600 shrink-0">{day}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                  <div
                    className="bg-sky-500 h-full rounded-full transition-all"
                    style={{ width: `${(total / maxDayRevenue) * 100}%` }}
                  />
                </div>
                <span className="w-24 text-right text-sm font-bold text-gray-700">₱{total.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sales by Item */}
      {sortedItems.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border p-5 mb-6">
          <h2 className="font-bold text-lg text-gray-800 mb-4">Sales by Item</h2>
          <div className="space-y-2">
            {sortedItems.slice(0, 20).map(item => (
              <div key={item.name} className="flex items-center gap-3">
                <span className="w-44 text-sm font-medium text-gray-600 shrink-0 truncate">{item.name}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all"
                    style={{ width: `${(item.revenue / maxItemRevenue) * 100}%` }}
                  />
                </div>
                <span className="w-16 text-right text-xs text-gray-500">{item.qty} sold</span>
                <span className="w-24 text-right text-sm font-bold text-gray-700">₱{item.revenue.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sales by Category */}
      {sortedCats.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border p-5 mb-6">
          <h2 className="font-bold text-lg text-gray-800 mb-4">Sales by Category</h2>
          <div className="space-y-2">
            {sortedCats.map(([cat, total]) => (
              <div key={cat} className="flex items-center gap-3">
                <span className="w-44 text-sm font-medium text-gray-600 shrink-0">{cat}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                  <div
                    className="bg-amber-500 h-full rounded-full transition-all"
                    style={{ width: `${(total / maxCatRevenue) * 100}%` }}
                  />
                </div>
                <span className="w-24 text-right text-sm font-bold text-gray-700">₱{total.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DATE RANGE PICKER MODAL */}
      {showDatePicker && (
        <DateRangePicker
          onExport={handleExport}
          onClose={() => setShowDatePicker(false)}
        />
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
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      <NavBar screen={screen} setScreen={setScreen} />
      {screen === 'order' && <OrderScreen onOrderPlaced={handleOrderPlaced} />}
      {screen === 'queue' && <QueueScreen refreshKey={refreshKey} />}
      {screen === 'admin' && <AdminScreen />}
      {screen === 'dashboard' && <DashboardScreen />}
      {screen === 'reports' && <ReportsScreen />}
    </div>
  );
}
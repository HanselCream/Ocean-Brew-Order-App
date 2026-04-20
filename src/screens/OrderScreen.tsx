'use client';

import { useState, useEffect } from 'react';
import { addOnsRefreshEvent } from '@/lib/events';
import {
  MenuItem, Order, OrderItem, OrderItemCustomization,
  Size, SugarLevel, IceLevel, CATEGORIES,
} from '@/lib/types';
import {
  getMenu, getAddOnItems, saveOrder, getNextOrderNumber, getStoreSettings,
} from '@/lib/supabaseStore';
import PrinterService from '@/lib/printerService';

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

// ─────────────────────────────────────────────
// CUSTOMIZATION MODAL
// ─────────────────────────────────────────────
function CustomizationModal({
  item, addOnItems, onConfirm, onCancel,
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
  const [activeDiscount, setActiveDiscount] = useState<'none' | 'pwd' | 'student' | 'store'>('none');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [quantity, setQuantity] = useState(1);

  const basePrice = size === 'L' && item.priceL ? item.priceL : item.priceR;
  const isEspresso = item.category === 'Espresso';
  const isDrink = !['Appetizers', 'Merchandise', 'Supplies', 'Add Ons'].includes(item.category);

  const addOnsTotal = (() => {
    if (isEspresso) return ESPRESSO_ADDONS.filter(a => selectedAddOns.has(a.id)).reduce((s, a) => s + a.price, 0);
    return addOnItems.filter(a => selectedAddOns.has(a.id)).reduce((s, a) => s + a.priceR, 0);
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
    const addOnsArray = isEspresso
      ? ESPRESSO_ADDONS.filter(a => selectedAddOns.has(a.id)).map(a => ({ id: a.id, name: a.name, price: a.price }))
      : addOnItems.filter(a => selectedAddOns.has(a.id)).map(a => ({ id: a.id, name: a.name, price: a.priceR }));

    const cust: OrderItemCustomization = {
      size,
      temperature: isEspresso ? temperature : undefined,
      sugar: isEspresso ? undefined : sugar,
      ice: isEspresso ? 'Normal Ice' : ice,
      addOns: addOnsArray,
      discount: dv > 0 ? { type: discountType, value: dv } : null,
    };
    onConfirm({ id: crypto.randomUUID(), menuItemId: item.id, name: item.name, category: item.category, basePrice, customization: cust, quantity, lineTotal });
  };

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
                  <button key={s} onClick={() => setSize(s)} className={`flex-1 py-3 rounded-xl text-lg font-bold border-2 transition-colors ${size === s ? 'border-white bg-white text-black' : 'border-white/30 text-gray-300 hover:border-white/50'}`}>
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
                  <button key={temp} onClick={() => setTemperature(temp)} className={`flex-1 py-3 rounded-xl text-lg font-bold border-2 transition-colors ${temperature === temp ? 'border-white bg-white text-black' : 'border-white/30 text-gray-300 hover:border-white/50'}`}>
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
                  <button key={sl} onClick={() => setSugar(sl)} className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${sugar === sl ? 'border-white bg-white text-black' : 'border-white/30 text-gray-300 hover:border-white/50'}`}>{sl}</button>
                ))}
              </div>
            </div>
          )}
          {isDrink && !isEspresso && (
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">Ice Level</label>
              <div className="flex flex-wrap gap-2">
                {ICE_LEVELS.map(il => (
                  <button key={il} onClick={() => setIce(il)} className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${ice === il ? 'border-white bg-white text-black' : 'border-white/30 text-gray-300 hover:border-white/50'}`}>{il}</button>
                ))}
              </div>
            </div>
          )}
          {isDrink && (
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">{isEspresso ? 'Espresso Add-ons' : 'Add-ons (select multiple)'}</label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1">
                {isEspresso ? (
                  ESPRESSO_ADDONS.map(a => (
                    <button key={a.id} onClick={() => toggleAddOn(a.id)} className={`px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${selectedAddOns.has(a.id) ? 'border-white bg-white text-black' : 'border-white/30 text-gray-300 hover:border-white/50'}`}>
                      {a.name} +₱{a.price}
                    </button>
                  ))
                ) : (
                  addOnItems.filter(addOn => item.addOnIds?.includes(addOn.id)).map(a => (
                    <button key={a.id} onClick={() => toggleAddOn(a.id)} className={`px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${selectedAddOns.has(a.id) ? 'border-white bg-white text-black' : 'border-white/30 text-gray-300 hover:border-white/50'}`}>
                      {a.name} +₱{a.priceR}
                    </button>
                  ))
                )}
              </div>
              {!isEspresso && (!item.addOnIds || item.addOnIds.length === 0) && (
                <p className="text-xs text-gray-500 mt-1">No add-ons available for this item. Edit this item in Admin to add add-ons.</p>
              )}
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Quantity</label>
            <div className="flex items-center gap-4">
              <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="w-12 h-12 rounded-xl bg-white/10 text-xl font-bold text-white hover:bg-white/20">-</button>
              <span className="text-2xl font-bold w-8 text-center text-white">{quantity}</span>
              <button onClick={() => setQuantity(q => q + 1)} className="w-12 h-12 rounded-xl bg-white/10 text-xl font-bold text-white hover:bg-white/20">+</button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Discount</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { type: 'none', label: 'NONE', sub: 'No discount' },
                { type: 'store', label: 'STORE', sub: 'Adjustable' },
              ].map(opt => (
                <button key={opt.type} onClick={() => {
                  setDiscountType('percent');
                  if (opt.type === 'none') setDiscountValue('');
                  else if (opt.type === 'pwd') setDiscountValue('15');
                  else if (opt.type === 'student') setDiscountValue('10');
                  else setDiscountValue('');
                  setActiveDiscount(opt.type as any);
                }} className={`py-3 rounded-xl border-2 flex flex-col items-center gap-0.5 transition-colors ${activeDiscount === opt.type ? 'border-white bg-white text-black' : 'border-white/30 text-gray-300 hover:border-white/50'}`}>
                  <span className="text-sm font-bold">{opt.label}</span>
                  <span className="text-xs opacity-60">{opt.sub}</span>
                </button>
              ))}
            </div>
{activeDiscount === 'store' && (
  <div className="mt-3">
    <p className="text-xs text-gray-500 mb-2">Select store discount (₱)</p>
    <div className="flex gap-2">
      {[5, 10, 15, 20].map(amt => (
        <button key={amt} onClick={() => { setDiscountType('fixed'); setDiscountValue(amt.toString()); }} className={`flex-1 py-2 rounded-xl text-sm font-bold border-2 transition-colors ${discountValue === amt.toString() ? 'border-white bg-white text-black' : 'border-white/30 text-gray-300 hover:border-white/50'}`}>
          ₱{amt}
        </button>
      ))}
    </div>
  </div>
)}
          </div>
        </div>
        <div className="p-5 border-t border-white/20 bg-white/5 rounded-b-2xl flex items-center justify-between">
          <div>
            <span className="text-sm text-gray-400">Total:</span>
            <span className="text-2xl font-bold text-white ml-2">₱{lineTotal.toFixed(2)}</span>
          </div>
          <div className="flex gap-3">
            <button onClick={onCancel} className="px-5 py-3 rounded-xl text-white font-semibold bg-white/10 hover:bg-white/20">Cancel</button>
            <button onClick={handleConfirm} className="px-5 py-3 rounded-xl text-black font-semibold bg-white hover:bg-gray-200">Add to Order</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// AMOUNT PAID MODAL
// ─────────────────────────────────────────────
function AmountPaidModal({
  cart, subtotal, onConfirm, onCancel,
}: {
  cart: OrderItem[];
  subtotal: number;
  onConfirm: (amountPaid: number) => void;
  onCancel: () => void;
}) {
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const change = amountPaid - subtotal;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4 overflow-y-auto">
      <div className="bg-black border border-white/20 rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <h2 className="text-xl font-bold text-white mb-4">Payment</h2>
          <div className="bg-white/5 rounded-xl p-4 mb-4">
            <h3 className="text-sm font-semibold text-gray-400 mb-2">Order Summary</h3>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {cart.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-gray-300">{item.quantity}x {item.name}
                    {item.customization.discount && (
                      <span className="text-red-400 ml-1">(-{item.customization.discount.type === 'percent' ? `${item.customization.discount.value}%` : `₱${item.customization.discount.value}`})</span>
                    )}
                  </span>
                  <span className="text-white">₱{item.lineTotal.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white/5 rounded-xl p-4 mb-4">
            <div className="flex justify-between font-bold text-white text-lg">
              <span>Total</span><span>₱{subtotal.toFixed(2)}</span>
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">Amount Paid</label>
            <input type="number" value={amountPaid === 0 ? '' : amountPaid} onChange={(e) => setAmountPaid(e.target.value === '' ? 0 : parseFloat(e.target.value))} className="w-full border border-white/20 rounded-xl px-4 py-3 bg-black text-white text-lg focus:border-white/50 focus:outline-none" placeholder="Enter amount received" autoFocus />
          </div>
          {amountPaid >= subtotal && amountPaid > 0 && (
            <div className="bg-green-900/30 border border-green-800 rounded-xl p-4 mb-4">
              <p className="text-gray-300 text-sm mb-1">Change</p>
              <p className="text-2xl font-bold text-green-400">₱{change.toFixed(2)}</p>
            </div>
          )}
          {amountPaid > 0 && amountPaid < subtotal && (
            <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 mb-4">
              <p className="text-red-400 text-sm">Short: ₱{(subtotal - amountPaid).toFixed(2)}</p>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={onCancel} className="flex-1 py-3 rounded-xl bg-white/10 font-semibold text-white hover:bg-white/20">Cancel</button>
            <button onClick={() => onConfirm(amountPaid)} disabled={amountPaid < subtotal} className="flex-1 py-3 rounded-xl bg-white font-semibold text-black hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed">Continue</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// FINAL CONFIRM MODAL
// ─────────────────────────────────────────────
function FinalConfirmModal({
  cart, total, amountPaid, changeAmount, onConfirm, onCancel,
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
            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-3"><span className="text-3xl">✅</span></div>
            <h2 className="text-xl font-bold text-white">Confirm Order</h2>
          </div>
          <div className="bg-white/5 rounded-xl p-3 mb-3 max-h-48 overflow-y-auto">
            {cart.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm py-1 border-b border-white/10 last:border-0">
                <span className="text-gray-300">{item.quantity}x {item.name}</span>
                <span className="text-white font-semibold">₱{item.lineTotal.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="bg-white/5 rounded-xl p-4 mb-4">
            <div className="flex justify-between mb-2"><span className="text-gray-400">Total:</span><span className="text-white font-bold">₱{total.toFixed(2)}</span></div>
            <div className="flex justify-between mb-2"><span className="text-gray-400">Amount Paid:</span><span className="text-white font-bold">₱{(amountPaid || 0).toFixed(2)}</span></div>
            <div className="flex justify-between pt-2 border-t border-white/20"><span className="text-green-400">Change:</span><span className="text-green-400 font-bold text-lg">₱{(changeAmount || 0).toFixed(2)}</span></div>
          </div>
          <div className="flex gap-3">
            <button onClick={onCancel} className="flex-1 py-3 rounded-xl bg-white/10 font-semibold text-white hover:bg-white/20 transition-colors">No, Go Back</button>
            <button onClick={onConfirm} className="flex-1 py-3 rounded-xl bg-white font-semibold text-black hover:bg-gray-200 transition-colors">Yes, Generate Order</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ORDER SCREEN
// ─────────────────────────────────────────────
export default function OrderScreen({ onOrderPlaced }: { onOrderPlaced: () => void }) {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('Classic');
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [modalItem, setModalItem] = useState<MenuItem | null>(null);
  const [addOnItems, setAddOnItems] = useState<MenuItem[]>([]);
  const [showAmountModal, setShowAmountModal] = useState(false);
  const [showFinalConfirmModal, setShowFinalConfirmModal] = useState(false);
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [changeAmount, setChangeAmount] = useState<number>(0);
  const [orderLevelDiscount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>('');

  useEffect(() => {
    const loadMenu = async () => {
      try {
        const menuData = await getMenu();
        setMenu(Array.isArray(menuData) ? menuData : []);
        const addOnsData = await getAddOnItems();
        setAddOnItems(Array.isArray(addOnsData) ? addOnsData : []);
      } catch (error) {
        console.error('Failed to load menu:', error);
        setMenu([]); setAddOnItems([]);
      }
    };
    loadMenu();
  }, []);

  useEffect(() => {
    const handleRefresh = async () => {
      const addOnsData = await getAddOnItems();
      setAddOnItems(Array.isArray(addOnsData) ? addOnsData : []);
    };
    addOnsRefreshEvent.addEventListener('refresh', handleRefresh);
    return () => addOnsRefreshEvent.removeEventListener('refresh', handleRefresh);
  }, []);

  const categories = Array.from(new Set(menu.map(m => m.category))).sort((a, b) => {
    const indexA = CATEGORIES.indexOf(a as any);
    const indexB = CATEGORIES.indexOf(b as any);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  const filteredItems = menu.filter(m => m.category === activeCategory && m.available);
  const addToCart = (orderItem: OrderItem) => { setCart(prev => [...prev, orderItem]); setModalItem(null); };
  const removeFromCart = (id: string) => setCart(prev => prev.filter(i => i.id !== id));

  const subtotal = cart.reduce((s, i) => s + (i.basePrice + i.customization.addOns.reduce((a, ao) => a + ao.price, 0)) * i.quantity, 0);
  const totalDiscount = cart.reduce((s, i) => {
    const itemSub = (i.basePrice + i.customization.addOns.reduce((a, ao) => a + ao.price, 0)) * i.quantity;
    if (!i.customization.discount) return s;
    return s + (i.customization.discount.type === 'percent' ? itemSub * (i.customization.discount.value / 100) : i.customization.discount.value);
  }, 0);
  const total = cart.reduce((s, i) => s + i.lineTotal, 0);

  const handleFinalConfirm = async () => {
    try {
      const nextOrderNumberStr = await getNextOrderNumber();
      const nextOrderNumber = parseInt(nextOrderNumberStr);
      const order: Order = {
        id: '', orderNumber: nextOrderNumber, items: cart, subtotal,
        discount: totalDiscount + orderLevelDiscount, total,
        createdAt: new Date().toISOString(), status: 'pending',
        amountPaid, change: changeAmount, paymentMethod,
      };
await saveOrder(order);

// Auto-print
getStoreSettings().then(settings => {
  PrinterService.printReceipt(order, settings).catch(e => console.error('Print failed:', e));
}).catch(() => {});

setCart([]);
setShowFinalConfirmModal(false);
alert(`Order #${nextOrderNumber} completed! Change: ₱${changeAmount.toFixed(2)}`);
onOrderPlaced();
    } catch (error: any) {
      alert('Failed to save order: ' + (error?.message || JSON.stringify(error)));
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden relative">
      <div className="w-40 bg-black border-r border-white/10 overflow-y-auto shrink-0">
        {categories.map((cat, index) => (
          <button key={`${cat}-${index}`} onClick={() => setActiveCategory(cat)} className={`w-full text-left px-3 py-3 text-sm font-semibold border-b border-white/10 transition-colors ${activeCategory === cat ? 'bg-white text-black' : 'text-gray-300 hover:bg-white/10'}`}>
            {cat}
          </button>
        ))}
      </div>
      <div className="flex-1 p-4 overflow-y-auto bg-black">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredItems.map(item => (
            <button key={item.id} onClick={() => setModalItem(item)} className="bg-black border border-white/20 rounded-xl p-4 flex flex-col items-center justify-center text-center active:scale-95 transition-transform min-h-[100px] hover:border-white/50">
              <span className="font-bold text-white text-sm leading-tight">{item.name}</span>
              <span className="text-gray-400 font-bold mt-1 text-base">₱{item.priceR}{item.priceL ? <span className="text-gray-500 text-xs"> / ₱{item.priceL}</span> : ''}</span>
            </button>
          ))}
          {filteredItems.length === 0 && <p className="col-span-full text-center text-gray-500 py-12">No items in this category</p>}
        </div>
      </div>
      <div className="w-80 bg-black border-l border-white/10 flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-white/10 bg-white/5 text-white"><h2 className="font-bold text-base">Current Order</h2></div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 && <p className="text-gray-500 text-sm text-center py-8">Tap an item to start</p>}
          {cart.map(item => (
            <div key={item.id} className="bg-white/5 rounded-lg p-3 border border-white/10 text-sm">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{item.quantity}x {item.name}</span>
                    <button onClick={() => removeFromCart(item.id)} className="text-white bg-red-700 hover:bg-red-800 text-xs px-2 py-0.5 rounded-full">×</button>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5 pl-1">
                    <span className="bg-white/10 px-1.5 py-0.5 rounded text-xs">{item.customization.size}</span>
                    {item.customization.temperature && <span className="bg-white/10 px-1.5 py-0.5 rounded text-xs">{item.customization.temperature}</span>}
                    {item.customization.sugar !== '100%' && <span className="bg-white/10 px-1.5 py-0.5 rounded text-xs">{item.customization.sugar} sugar</span>}
                    {item.customization.ice !== 'Normal Ice' && <span className="bg-white/10 px-1.5 py-0.5 rounded text-xs">{item.customization.ice}</span>}
                    {item.customization.addOns.length > 0 && <span className="bg-green-900 text-green-300 px-1.5 py-0.5 rounded text-xs">+{item.customization.addOns.map(a => a.name).join(', ')}</span>}
                    {item.customization.discount && <span className="bg-red-900 text-red-300 px-1.5 py-0.5 rounded text-xs">-{item.customization.discount.type === 'percent' ? `${item.customization.discount.value}%` : `₱${item.customization.discount.value}`}</span>}
                  </div>
                </div>
                <span className="font-bold text-white text-base ml-2">₱{item.lineTotal.toFixed(0)}</span>
              </div>
            </div>
          ))}
          {cart.length > 0 && (
            <div className="p-3 border-t border-white/10">
              <button onClick={() => setCart([])} className="w-full py-2.5 rounded-lg bg-red-900/30 text-red-300 font-semibold text-sm hover:bg-red-900/50 transition-colors border border-red-800">🗑️ Clear All Items</button>
            </div>
          )}
        </div>
        <div className="p-3 border-t border-white/10 space-y-1 text-sm">
          <div className="flex justify-between text-gray-400"><span>Subtotal</span><span>₱{subtotal.toFixed(2)}</span></div>
          {totalDiscount > 0 && <div className="flex justify-between text-red-400"><span>Discount</span><span>-₱{totalDiscount.toFixed(2)}</span></div>}
          <div className="flex justify-between text-lg font-bold text-white pt-1 border-t border-white/10"><span>Total</span><span>₱{total.toFixed(2)}</span></div>
        </div>
        <div className="p-3 border-t border-white/10">
          <button onClick={() => { if (cart.length === 0) return; setAmountPaid(0); setChangeAmount(0); setShowAmountModal(true); }} disabled={cart.length === 0} className="w-full py-3 rounded-xl bg-white text-black font-semibold text-sm hover:bg-gray-200 disabled:opacity-40 transition-colors">Generate Order</button>
          <button onClick={() => setCart([])} disabled={cart.length === 0} className="w-full mt-2 py-2 rounded-lg text-gray-400 font-semibold text-sm hover:text-white disabled:opacity-40 transition-colors">Cancel Order</button>
        </div>
      </div>

      {modalItem && <CustomizationModal item={modalItem} addOnItems={addOnItems} onConfirm={addToCart} onCancel={() => setModalItem(null)} />}

      {showAmountModal && (
        <AmountPaidModal cart={cart} subtotal={total} onConfirm={(paid) => {
          setAmountPaid(paid);
          setChangeAmount(paid - total);
          setPaymentMethod(`Cash|${paid}|${paid - total}`);
          setShowAmountModal(false);
          setShowFinalConfirmModal(true);
        }} onCancel={() => setShowAmountModal(false)} />
      )}

      {showFinalConfirmModal && (
        <FinalConfirmModal cart={cart} total={total} amountPaid={amountPaid} changeAmount={changeAmount} onConfirm={handleFinalConfirm} onCancel={() => setShowFinalConfirmModal(false)} />
      )}
    </div>
  );
}
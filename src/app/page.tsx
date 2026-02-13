'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
// CUSTOMIZATION MODAL
// ─────────────────────────────────────────────
const SUGAR_LEVELS: SugarLevel[] = ['0%', '25%', '50%', '75%', '100%'];
const ICE_LEVELS: IceLevel[] = ['No Ice', 'Less Ice', 'Normal Ice'];

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
  const [temperature, setTemperature] = useState<'Hot' | 'Cold'>('Hot'); // NEW: Hot/Cold state
  const [sugar, setSugar] = useState<SugarLevel>('100%');
  const [ice, setIce] = useState<IceLevel>('Normal Ice');
  const [selectedAddOns, setSelectedAddOns] = useState<Set<string>>(new Set());
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [quantity, setQuantity] = useState(1);

  const basePrice = size === 'L' && item.priceL ? item.priceL : item.priceR;
  const addOnsTotal = addOnItems
    .filter(a => selectedAddOns.has(a.id))
    .reduce((s, a) => s + a.priceR, 0);
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
    const cust: OrderItemCustomization = {
      size,
      temperature: item.category === 'Espresso' ? temperature : undefined, // NEW: Only for Espresso
      sugar,
      ice,
      addOns: addOnItems
        .filter(a => selectedAddOns.has(a.id))
        .map(a => ({ id: a.id, name: a.name, price: a.priceR })),
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

  // Determine if drink customizations apply
  const isDrink = item.category !== 'Appetizers' && item.category !== 'Cheesecake' && item.category !== 'Merchandise' && item.category !== 'Supplies' && item.category !== 'Add Ons';
  
  // NEW: Check if item is from Espresso category
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

          {/* NEW: Hot/Cold toggle - ONLY for Espresso */}
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

          {/* Sugar */}
          {isDrink && (
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

          {/* Ice */}
          {isDrink && (
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

          {/* Add-ons */}
          {isDrink && addOnItems.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Add-ons</label>
              <div className="flex flex-wrap gap-2">
                {addOnItems.map(a => (
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
                ))}
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
// SCREEN 1: ORDER TAKING
// ─────────────────────────────────────────────
function OrderScreen({ onOrderPlaced }: { onOrderPlaced: () => void }) {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('Classic');
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [modalItem, setModalItem] = useState<MenuItem | null>(null);
  const [addOnItems, setAddOnItems] = useState<MenuItem[]>([]);

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

  const generateOrder = () => {
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
    saveOrder(order);
    setCart([]);
    onOrderPlaced();
  };

  return (
    <div className="flex flex-1 overflow-hidden">
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
      <div className="w-72 bg-white border-l flex flex-col shrink-0">
        <div className="px-4 py-3 border-b bg-sky-600 text-white">
          <h2 className="font-bold text-base">Current Order</h2>
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
            {/* ADD THIS LINE HERE - Temperature display */}
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
{/* Add this after the cart items and before the subtotal section */}
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
        <div className="p-3 border-t flex gap-2">
          <button
            onClick={cancelOrder}
            className="flex-1 py-3 rounded-xl bg-gray-200 font-semibold text-gray-700 text-sm active:bg-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={generateOrder}
            disabled={cart.length === 0}
            className="flex-1 py-3 rounded-xl bg-sky-600 font-semibold text-white text-sm active:bg-sky-700 disabled:opacity-40"
          >
            Generate Order
          </button>
        </div>
      </div>

      {/* Modal */}
      {modalItem && (
        <CustomizationModal
          item={modalItem}
          addOnItems={addOnItems}
          onConfirm={addToCart}
          onCancel={() => setModalItem(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// SCREEN 2: BARISTA QUEUE
// ─────────────────────────────────────────────
function QueueScreen({ refreshKey }: { refreshKey: number }) {
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    setOrders(getOrders().filter(o => o.status === 'pending'));
  }, [refreshKey]);

  const markDone = (id: string) => {
    updateOrder(id, { status: 'done' });
    setOrders(prev => prev.filter(o => o.id !== id));
  };

  return (
    <div className="flex-1 p-4 overflow-y-auto bg-gray-100">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">Barista Queue</h1>
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
                    {/* ADD THIS LINE HERE - Temperature display */}
                    {item.customization.temperature && ` | ${item.customization.temperature}`}
                    {item.customization.sugar !== '100%' && ` | ${item.customization.sugar} sugar`}
                    {item.customization.ice !== 'Normal Ice' && ` | ${item.customization.ice}`}
                    {item.customization.addOns.length > 0 && ` | +${item.customization.addOns.map(a => a.name).join(', ')}`}
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => markDone(order.id)}
              className="w-full py-3 rounded-xl bg-green-500 text-white font-bold text-lg active:bg-green-600"
            >
              MARK AS DONE
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SCREEN 3: ADMIN MENU
// ─────────────────────────────────────────────
function AdminScreen() {
  const [menu, setMenuState] = useState<MenuItem[]>([]);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => { setMenuState(getMenu()); }, []);

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

  return (
    <div className="flex-1 p-4 overflow-y-auto bg-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">Menu Manager</h1>
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
// SCREEN 4: TODAY'S DASHBOARD
// ─────────────────────────────────────────────
function DashboardScreen() {
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    const all = getOrders();
    const today = new Date().toISOString().slice(0, 10);
    setOrders(all.filter(o => o.createdAt.slice(0, 10) === today));
  }, []);

  const totalSales = orders.filter(o => o.status === 'done').reduce((s, o) => s + o.total, 0);
  const totalOrders = orders.length;

  // Best selling item
  const itemCounts: Record<string, { name: string; count: number }> = {};
  orders.forEach(o => {
    o.items.forEach(i => {
      if (!itemCounts[i.menuItemId]) itemCounts[i.menuItemId] = { name: i.name, count: 0 };
      itemCounts[i.menuItemId].count += i.quantity;
    });
  });
  const bestSelling = Object.values(itemCounts).sort((a, b) => b.count - a.count)[0];

  return (
    <div className="flex-1 p-6 overflow-y-auto bg-gray-100">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Today&apos;s Dashboard</h1>
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
    </div>
  );
}

// ─────────────────────────────────────────────
// SCREEN 5: REPORTS (30 DAYS)
// ─────────────────────────────────────────────
function ReportsScreen() {
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    setOrders(getOrders().filter(o => o.status === 'done'));
  }, []);

  // Sales by day
  const salesByDay: Record<string, number> = {};
  orders.forEach(o => {
    const day = o.createdAt.slice(0, 10);
    salesByDay[day] = (salesByDay[day] || 0) + o.total;
  });
  const sortedDays = Object.entries(salesByDay).sort((a, b) => b[0].localeCompare(a[0]));

  // Sales by item
  const salesByItem: Record<string, { name: string; qty: number; revenue: number }> = {};
  orders.forEach(o => {
    o.items.forEach(i => {
      if (!salesByItem[i.menuItemId]) salesByItem[i.menuItemId] = { name: i.name, qty: 0, revenue: 0 };
      salesByItem[i.menuItemId].qty += i.quantity;
      salesByItem[i.menuItemId].revenue += i.lineTotal;
    });
  });
  const sortedItems = Object.values(salesByItem).sort((a, b) => b.revenue - a.revenue);

  // Sales by category
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

  return (
    <div className="flex-1 p-6 overflow-y-auto bg-gray-100">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Reports (Last 30 Days)</h1>

      {orders.length === 0 && (
        <p className="text-gray-400 text-center py-12 text-lg">No completed orders to report</p>
      )}

      {/* Sales by Day */}
      {sortedDays.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border p-5 mb-6">
          <h2 className="font-bold text-lg text-gray-800 mb-4">Sales Summary by Day</h2>
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

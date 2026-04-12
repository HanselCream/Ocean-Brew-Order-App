'use client';

import { useState, useEffect } from 'react';
import AdminPasswordModal from '@/components/AdminPasswordModal';
import { addOnsRefreshEvent } from '@/lib/events';
import { MenuItem, CATEGORIES } from '@/lib/types';
import {
  getMenu, saveMenu, saveMenuItemWithAddons, getAddOnItems,
} from '@/lib/supabaseStore';
import { supabase } from '@/lib/supabaseClient';

// ─────────────────────────────────────────────
// ADMIN EDIT MODAL
// ─────────────────────────────────────────────
function AdminEditModal({
  item, isAddOn, addOnsList, onSave, onCancel,
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
  const [selectedAddOnIds, setSelectedAddOnIds] = useState<Set<string>>(new Set(item.addOnIds || []));

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
          {!isAddOn && addOnsList.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">Available Add-Ons for this item</label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-white/5 rounded-xl">
                {addOnsList.map(addOn => (
                  <div key={addOn.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleAddOn(addOn.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${selectedAddOnIds.has(addOn.id) ? 'bg-white text-black' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
                    >
                      {addOn.name}
                    </button>
                    <input
                      type="number"
                      defaultValue={addOn.priceR}
                      onBlur={async (e) => {
                        const newPrice = parseFloat(e.target.value);
                        if (isNaN(newPrice) || newPrice === addOn.priceR) return;
                        await supabase.from('menu_items').update({ pricer: newPrice }).eq('id', addOn.id);
                        addOn.priceR = newPrice;
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
// ADMIN SCREEN
// ─────────────────────────────────────────────
export default function AdminScreen() {
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
        setMenuState([]); setAddOns([]);
      } finally {
        setLoading(false);
      }
    };
    loadData();
    setShowPasswordModal(true);
  }, []);

  const handlePasswordSuccess = () => { setShowPasswordModal(false); setIsLocked(false); };
  const handlePasswordCancel = () => { setShowPasswordModal(false); setIsLocked(true); };

  const saveMenuItem = async (item: MenuItem) => {
    try {
      await saveMenuItemWithAddons(item);
      const menuData = await getMenu();
      setMenuState(menuData);
      const addOnsData = await getAddOnItems();
      setAddOns(addOnsData);
      addOnsRefreshEvent.dispatchEvent(new Event('refresh'));
      setEditing(null); setIsNew(false);
    } catch (error: any) {
      console.error('Error saving:', error);
      alert('Failed to save: ' + error.message);
    }
  };

  const deleteMenuItem = async (id: string) => {
    try {
      const { error } = await supabase.from('menu_items').delete().eq('id', id);
      if (error) throw error;
      setMenuState(menu.filter(m => m.id !== id));
    } catch (err) {
      console.error('Error in deleteMenuItem:', err);
    }
  };

  const toggleAvailability = (id: string) => {
    const updated = menu.map(m => m.id === id ? { ...m, available: !m.available } : m);
    saveMenu(updated);
    setMenuState(updated);
  };

  const saveAddOn = async (addOn: MenuItem) => {
    try {
      if (isNew) {
        const { data, error } = await supabase.from('menu_items').insert([{ ...addOn, category: 'Add Ons' }]).select();
        if (error) throw error;
        addOnsRefreshEvent.dispatchEvent(new Event('refresh'));
        if (data) setAddOns([...addOns, data[0]]);
      } else {
        const { error } = await supabase.from('menu_items').update({ name: addOn.name, pricer: addOn.priceR, available: addOn.available }).eq('id', addOn.id);
        if (error) throw error;
        addOnsRefreshEvent.dispatchEvent(new Event('refresh'));
        setAddOns(addOns.map(a => a.id === addOn.id ? addOn : a));
      }
      setEditing(null); setIsNew(false);
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
    }
  };

  const toggleAddOnAvailability = async (id: string) => {
    const addOn = addOns.find(a => a.id === id);
    if (!addOn) return;
    const updated = { ...addOn, available: !addOn.available };
    try {
      const { error } = await supabase.from('menu_items').update({ available: updated.available }).eq('id', id);
      if (error) throw error;
      setAddOns(addOns.map(a => a.id === id ? updated : a));
    } catch (err) {
      console.error('Error toggling add-on:', err);
    }
  };

  const startNewMenuItem = () => {
    setEditing({ id: crypto.randomUUID(), name: '', category: CATEGORIES[0], priceR: 0, priceL: null, available: true, hasSizeOption: false, addOnIds: [] });
    setIsNew(true);
  };

  const startNewAddOn = () => {
    setEditing({ id: crypto.randomUUID(), name: '', category: 'Add Ons', priceR: 0, priceL: null, available: true, hasSizeOption: false });
    setIsNew(true);
  };

  if (loading) return <div className="flex-1 p-4 bg-black text-white">Loading...</div>;

  if (isLocked) {
    return (
      <>
        <div className="flex-1 p-4 bg-black flex items-center justify-center">
          <div className="bg-black border border-white/20 rounded-2xl p-8 text-center max-w-md">
            <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4"><span className="text-4xl">🔒</span></div>
            <h2 className="text-2xl font-bold text-white mb-2">Admin Area Locked</h2>
            <p className="text-gray-400 mb-6">Enter password to access management</p>
            <button onClick={() => setShowPasswordModal(true)} className="px-6 py-3 rounded-xl bg-white text-black font-semibold hover:bg-gray-200">Enter Password</button>
          </div>
        </div>
        <AdminPasswordModal isOpen={showPasswordModal} onSuccess={handlePasswordSuccess} onCancel={handlePasswordCancel} />
      </>
    );
  }

  return (
    <div className="flex-1 p-4 overflow-y-auto bg-black">
      <div className="flex gap-2 mb-6 border-b border-white/10">
        <button onClick={() => setActiveTab('menu')} className={`px-6 py-3 font-semibold transition-colors ${activeTab === 'menu' ? 'text-white border-b-2 border-white' : 'text-gray-400 hover:text-white'}`}>Menu Items</button>
        <button onClick={() => setActiveTab('addons')} className={`px-6 py-3 font-semibold transition-colors ${activeTab === 'addons' ? 'text-white border-b-2 border-white' : 'text-gray-400 hover:text-white'}`}>Add-Ons</button>
      </div>

      {activeTab === 'menu' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-white">Menu Manager</h1>
            <button onClick={startNewMenuItem} className="px-5 py-2 rounded-xl bg-white text-black font-semibold hover:bg-gray-200">+ Add Item</button>
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
                    <td className="px-4 py-2 text-right">
                      <input type="number" defaultValue={item.priceR} onBlur={async (e) => {
                        const newPrice = parseFloat(e.target.value);
                        if (isNaN(newPrice) || newPrice === item.priceR) return;
                        const { error } = await supabase.from('menu_items').update({ pricer: newPrice }).eq('id', item.id);
                        if (!error) setMenuState(menu.map(m => m.id === item.id ? { ...m, priceR: newPrice } : m));
                      }} className="w-20 text-right bg-transparent border border-white/20 rounded-lg px-2 py-1 text-white focus:border-white focus:outline-none" />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input type="number" defaultValue={item.priceL ?? ''} placeholder="—" onBlur={async (e) => {
                        const newPrice = e.target.value === '' ? null : parseFloat(e.target.value);
                        if (newPrice === item.priceL) return;
                        const { error } = await supabase.from('menu_items').update({ pricel: newPrice }).eq('id', item.id);
                        if (!error) setMenuState(menu.map(m => m.id === item.id ? { ...m, priceL: newPrice } : m));
                      }} className="w-20 text-right bg-transparent border border-white/20 rounded-lg px-2 py-1 text-white focus:border-white focus:outline-none" />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => toggleAvailability(item.id)} className={`px-3 py-1 rounded-full text-xs font-semibold ${item.available ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                        {item.available ? 'Yes' : 'No'}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => { setEditing(item); setIsNew(false); }} className="text-gray-300 hover:text-white text-xs mr-2">Edit</button>
                      <button onClick={() => deleteMenuItem(item.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === 'addons' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-white">Add-Ons Manager</h1>
            <button onClick={startNewAddOn} className="px-5 py-2 rounded-xl bg-white text-black font-semibold hover:bg-gray-200">+ Add Add-On</button>
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
                      <input type="number" defaultValue={addOn.priceR} onBlur={async (e) => {
                        const newPrice = parseFloat(e.target.value);
                        if (isNaN(newPrice) || newPrice === addOn.priceR) return;
                        const { error } = await supabase.from('menu_items').update({ pricer: newPrice }).eq('id', addOn.id);
                        if (!error) {
                          setAddOns(addOns.map(a => a.id === addOn.id ? { ...a, priceR: newPrice } : a));
                          addOnsRefreshEvent.dispatchEvent(new Event('refresh'));
                        }
                      }} className="w-20 text-right bg-transparent border border-white/20 rounded-lg px-2 py-1 text-white focus:border-white focus:outline-none" />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => toggleAddOnAvailability(addOn.id)} className={`px-3 py-1 rounded-full text-xs font-semibold ${addOn.available ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                        {addOn.available ? 'Yes' : 'No'}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => { setEditing(addOn); setIsNew(false); }} className="text-gray-300 hover:text-white text-xs mr-2">Edit</button>
                      <button onClick={() => deleteAddOn(addOn.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

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
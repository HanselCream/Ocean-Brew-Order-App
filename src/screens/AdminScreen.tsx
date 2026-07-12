'use client';

import { useAuth } from '@/context/AuthContext';
import { useState, useEffect } from 'react';
import AdminPasswordModal from '@/components/AdminPasswordModal';
import { addOnsRefreshEvent } from '@/lib/events';
import { MenuItem, CATEGORIES } from '@/lib/types';
import { getMenu, saveMenu, saveMenuItemWithAddons, getAddOnItems, getCategories, addCategory, deleteCategory } from '@/lib/supabaseStore';
import { supabase } from '@/lib/supabaseClient';


// ─────────────────────────────────────────────
// ADMIN EDIT MODAL
// ─────────────────────────────────────────────
function AdminEditModal({
  item, isAddOn, isSupply, addOnsList, categories, onSave, onCancel, onCategoryAdded,
}: {
  item: MenuItem;
  isAddOn: boolean;
  isSupply: boolean;
  addOnsList: MenuItem[];
  categories: string[];
  onSave: (item: MenuItem) => void;
  onCancel: () => void;
  onCategoryAdded: () => void;  // ← NEW
}) {
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(item.category);
const [priceR, setPriceR] = useState(item.priceR.toString());
const [priceL, setPriceL] = useState(item.priceL?.toString() ?? '');
  const [available, setAvailable] = useState(item.available);
  const [selectedAddOnIds, setSelectedAddOnIds] = useState<Set<string>>(new Set(item.addOnIds || []));
  const [autoDeduct, setAutoDeduct] = useState(item.autoDeduct ?? false);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
const [newCategoryInput, setNewCategoryInput] = useState('');
const [showDeleteCategoryConfirm, setShowDeleteCategoryConfirm] = useState(false);
const [deletingCategory, setDeletingCategory] = useState(false);


  const handleSave = () => {
    if (!name.trim()) return;
onSave({
  ...item,
  name: name.trim(),
  category: isAddOn ? 'Add Ons' : category,
  priceR: parseFloat(priceR) || 0,
  priceL: priceL !== '' ? parseFloat(priceL) : null,
  hasSizeOption: priceL !== '',
      available,
      autoDeduct,
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
    <div className="flex gap-2">
<select value={category} onChange={e => setCategory(e.target.value)} className="flex-1 border border-white/20 rounded-xl px-3 py-2 bg-black text-white focus:outline-none focus:border-white/50">
  {(categories.length > 0 ? [...categories].sort() : [...CATEGORIES].sort()).map((c: string) => (
    <option key={c} value={c}>{c}</option>
  ))}
</select>
      <button
        type="button"
        onClick={() => setShowNewCategoryInput(true)}
        className="px-4 py-2 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors border border-white/20 whitespace-nowrap"
      >
        +
      </button>
        <button
      type="button"
       onClick={() => setShowDeleteCategoryConfirm(true)}
      className="px-4 py-2 rounded-xl bg-red-500/10 text-red-400 font-semibold hover:bg-red-500/20 transition-colors border border-red-500/20 whitespace-nowrap"
      title={`Delete "${category}"`}
     >
       🗑️
     </button>
    </div>

   {/* ── DELETE CATEGORY CONFIRMATION ── */}
   {showDeleteCategoryConfirm && (
     <div className="mt-3 p-4 bg-red-500/5 rounded-xl border border-red-500/20">
       <p className="text-sm text-gray-300 mb-1">
         Delete category <span className="text-white font-semibold">"{category}"</span>?
       </p>
       <p className="text-xs text-gray-500 mb-3">
         Items already assigned to this category won't be deleted — you'll need to reassign them after.
       </p>
       <div className="flex gap-2">
         <button
           onClick={async () => {
             setDeletingCategory(true);
             try {
               await deleteCategory(category);
               await onCategoryAdded();
               setShowDeleteCategoryConfirm(false);
             } catch (err) {
               alert('Failed to delete category: ' + (err as any).message);
             } finally {
               setDeletingCategory(false);
             }
           }}
           disabled={deletingCategory}
           className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-50"
         >
           {deletingCategory ? 'Deleting...' : 'Confirm Delete'}
         </button>
         <button
           onClick={() => setShowDeleteCategoryConfirm(false)}
           className="px-4 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20"
         >
           Cancel
         </button>
       </div>
     </div>
   )}

    
    {/* ── NEW CATEGORY INPUT POPUP ── */}
    {showNewCategoryInput && (
      <div className="mt-3 p-4 bg-white/5 rounded-xl border border-white/20">
        <p className="text-sm text-gray-300 mb-2">Enter new category name:</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newCategoryInput}
            onChange={e => setNewCategoryInput(e.target.value)}
            placeholder="e.g., Frappes, Smoothies"
            className="flex-1 border border-white/20 rounded-lg px-3 py-2 bg-black text-white text-sm focus:outline-none focus:border-white/50"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                document.getElementById('save-category-btn')?.click();
              }
              if (e.key === 'Escape') {
                setShowNewCategoryInput(false);
                setNewCategoryInput('');
              }
            }}
          />
          <button
            id="save-category-btn"
            onClick={async () => {
              if (newCategoryInput.trim()) {
                try {
                  await addCategory(newCategoryInput.trim());
                  await onCategoryAdded();
                  setNewCategoryInput('');
                  setShowNewCategoryInput(false);
                } catch (err) {
                  alert('Failed to add category: ' + (err as any).message);
                }
              }
            }}
            className="px-4 py-2 rounded-lg bg-white text-black text-sm font-semibold hover:bg-gray-200"
          >
            Save
          </button>
          <button
            onClick={() => {
              setShowNewCategoryInput(false);
              setNewCategoryInput('');
            }}
            className="px-4 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20"
          >
            Cancel
          </button>
        </div>
      </div>
    )}
    
    <p className="text-xs text-gray-500 mt-1">Click <span className="text-white">+</span> to add a new category</p>
  </div>
)}
<div>
  <label className="block text-sm font-semibold text-gray-300 mb-1">Price Regular (₱)</label>
  <input type="number" value={priceR} onChange={e => setPriceR(e.target.value)} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white" />
</div>
<div>
  <label className="block text-sm font-semibold text-gray-300 mb-1">Price Large (₱) <span className="text-gray-500 font-normal">— leave blank if none</span></label>
  <input type="number" value={priceL} onChange={e => setPriceL(e.target.value)} placeholder="—" className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white" />
</div>
      {!isAddOn && !isSupply && addOnsList.length > 0 && (

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
          {(isAddOn || isSupply) && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoDeduct}
                onChange={e => setAutoDeduct(e.target.checked)}
                className="w-5 h-5"
              />
              <span className="text-sm font-semibold text-gray-300">Auto Deduct Stock</span>
            </label>
          )}
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
  const { isAuthenticated, login } = useAuth();  // ← ADD login
  const [menu, setMenuState] = useState<MenuItem[]>([]);

  const [addOns, setAddOns] = useState<MenuItem[]>([]);
  const [activeTab, setActiveTab] = useState<'menu' | 'addons'>('menu');
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [isNew, setIsNew] = useState(false);
const [showPasswordModal, setShowPasswordModal] = useState(false);
const [loading, setLoading] = useState(true);
const [menuSearch, setMenuSearch] = useState('');
const [menuCategoryFilter, setMenuCategoryFilter] = useState('All');
const [categories, setCategories] = useState<string[]>([]);

// Move loadData OUTSIDE the useEffect, at component level
const loadData = async () => {
  setLoading(true);
  try {
    const menuData = await getMenu();
    setMenuState(Array.isArray(menuData) ? menuData : []);
    const addOnsData = await getAddOnItems();
    setAddOns(Array.isArray(addOnsData) ? addOnsData : []);
    const cats = await getCategories();
    setCategories(cats);
  } catch (error) {
    console.error('Failed to load data:', error);
    setMenuState([]); setAddOns([]);
  } finally {
    setLoading(false);
  }
};

// Refreshes categories (and menu, since deleted categories can orphan items)
// without touching the page-level loading flag.
const refreshCategories = async () => {
  try {
    const cats = await getCategories();
    setCategories(cats);
    const menuData = await getMenu();
    setMenuState(Array.isArray(menuData) ? menuData : []);
  } catch (error) {
    console.error('Failed to refresh categories:', error);
  }
};

useEffect(() => {
  if (isAuthenticated) {
    loadData();
  }
}, [isAuthenticated]);

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
      const { data, error } = await supabase.from('menu_items').insert([{
        id: addOn.id,
        name: addOn.name,
        category: 'Add Ons',
        pricer: addOn.priceR,
        pricel: null,
        available: addOn.available,
        hassizeoption: false,
        auto_deduct: addOn.autoDeduct ?? false,
      }]).select();
      if (error) throw error;
      addOnsRefreshEvent.dispatchEvent(new Event('refresh'));
      if (data) setAddOns([...addOns, { ...addOn, id: data[0].id }]);
    } else {
      const { error } = await supabase.from('menu_items').update({
        name: addOn.name,
        pricer: addOn.priceR,
        available: addOn.available,
        auto_deduct: addOn.autoDeduct ?? false,
      }).eq('id', addOn.id);
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
    setEditing({ id: crypto.randomUUID(), name: '', category: 'Classic', priceR: 0, priceL: null, available: true, hasSizeOption: false, addOnIds: [] });
    setIsNew(true);
  };


  const startNewAddOn = () => {
    setEditing({ id: crypto.randomUUID(), name: '', category: 'Add Ons', priceR: 0, priceL: null, available: true, hasSizeOption: false });
    setIsNew(true);
  };

// FIRST: Check if NOT authenticated - show password modal immediately
if (!isAuthenticated) {
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
      <AdminPasswordModal 
        isOpen={showPasswordModal} 
        onSuccess={(enteredPassword) => {
          const success = login(enteredPassword);
          if (success) setShowPasswordModal(false);
        }} 
        onCancel={() => setShowPasswordModal(false)} 
      />
    </>
  );
}

// SECOND: Then check loading (only after authenticated)
if (loading) return (
  <div className="flex-1 p-4 overflow-y-auto bg-black">
    <div className="flex gap-2 mb-6 border-b border-white/10">
      {[1,2].map(i => <div key={i} className="h-10 w-28 bg-white/10 rounded-lg animate-pulse mb-1" />)}
    </div>
    <div className="flex items-center justify-between mb-4">
      <div className="h-8 w-44 bg-white/10 rounded-lg animate-pulse" />
      <div className="h-9 w-24 bg-white/10 rounded-xl animate-pulse" />
    </div>
    <div className="bg-black border border-white/10 rounded-xl overflow-hidden">
      <div className="flex gap-4 px-4 py-3 bg-white/5 border-b border-white/10">
        {[1,2,3,4,5].map(i => <div key={i} className="h-4 w-20 bg-white/10 rounded animate-pulse" />)}
      </div>
      {[1,2,3,4,5,6].map(i => (
        <div key={i} className="flex gap-4 px-4 py-3 border-b border-white/10">
          <div className="h-4 w-36 bg-white/10 rounded animate-pulse" />
          <div className="h-4 w-24 bg-white/10 rounded animate-pulse" />
          <div className="h-4 w-16 bg-white/10 rounded animate-pulse ml-auto" />
          <div className="h-4 w-16 bg-white/10 rounded animate-pulse" />
          <div className="h-4 w-12 bg-white/10 rounded animate-pulse" />
        </div>
      ))}
    </div>
  </div>
);
  return (
    <div className="flex-1 p-4 overflow-y-auto bg-black">
      <div className="flex gap-2 mb-6 border-b border-white/10">

        <button onClick={() => setActiveTab('menu')} className={`px-6 py-3 font-semibold transition-colors ${activeTab === 'menu' ? 'text-white border-b-2 border-white' : 'text-gray-400 hover:text-white'}`}>Menu Items</button>
<button onClick={() => setActiveTab('addons')} className={`px-6 py-3 font-semibold transition-colors ${activeTab === 'addons' ? 'text-white border-b-2 border-white' : 'text-gray-400 hover:text-white'}`}>Add-Ons</button>
      </div>

      {activeTab === 'menu' && (
  <>
<div className="flex items-center gap-3 mb-4 flex-wrap">
  {/* Search */}
  <div className="relative flex-1 min-w-[180px] max-w-xs">
    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
    <input
      type="text"
      placeholder="Search menu items..."
      value={menuSearch}
      onChange={e => setMenuSearch(e.target.value)}
      className="w-full pl-9 pr-8 py-2 rounded-xl bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-white/50 text-sm"
    />
    {menuSearch && (
      <button onClick={() => setMenuSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-sm">✕</button>
    )}
  </div>

  {/* Category Dropdown - Inline with search */}
  <div className="flex items-center gap-2 shrink-0">
    <label className="text-sm text-gray-400 hidden sm:block">Category:</label>
    <div className="relative">
      <select
        value={menuCategoryFilter}
        onChange={e => setMenuCategoryFilter(e.target.value)}
        className="px-3 py-2 pr-8 rounded-xl bg-black border border-white/20 text-white text-sm focus:outline-none focus:border-white/50 appearance-none cursor-pointer min-w-[120px]"
      >
        <option value="All" className="bg-black text-white">All</option>
        {Array.from(new Set(menu.map(m => m.category))).sort().map(cat => (
          <option key={cat} value={cat} className="bg-black text-white">{cat}</option>
        ))}
      </select>
      <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  </div>

  {/* Add Button - Align right */}
  <button onClick={startNewMenuItem} className="px-5 py-2 rounded-xl bg-white text-black font-semibold hover:bg-gray-200 ml-auto shrink-0">
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
            <th className="px-4 py-3 text-center">Auto Deduct</th>
            <th className="px-4 py-3 text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          {menu
            .filter(m => menuCategoryFilter === 'All' || m.category === menuCategoryFilter)
            .filter(m => m.name.toLowerCase().includes(menuSearch.toLowerCase()))
            .map(item => (

                  <tr key={item.id} className="border-t border-white/10 hover:bg-white/5">
                    <td className="px-4 py-2 font-medium text-white">{item.name}</td>
                    <td className="px-4 py-2 text-gray-400">{item.category}</td>
                    <td className="px-4 py-2 text-right">
                      <input key={item.priceR} type="number" defaultValue={item.priceR} onBlur={async (e) => {
                        const newPrice = parseFloat(e.target.value);
                        if (isNaN(newPrice) || newPrice === item.priceR) return;
                        const { error } = await supabase.from('menu_items').update({ pricer: newPrice }).eq('id', item.id);
                        if (!error) setMenuState(menu.map(m => m.id === item.id ? { ...m, priceR: newPrice } : m));
                      }} className="w-20 text-right bg-transparent border border-white/20 rounded-lg px-2 py-1 text-white focus:border-white focus:outline-none" />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input key={item.priceL ?? 'null'} type="number" defaultValue={item.priceL ?? ''} placeholder="—" onBlur={async (e) => {
// AFTER
const newPrice = e.target.value === '' ? null : parseFloat(e.target.value);
if (newPrice === item.priceL) return;
const { error } = await supabase.from('menu_items').update({ 
  pricel: newPrice,
  hassizeoption: newPrice !== null,
}).eq('id', item.id);
if (!error) setMenuState(menu.map(m => m.id === item.id ? { ...m, priceL: newPrice, hasSizeOption: newPrice !== null } : m));
                      }} className="w-20 text-right bg-transparent border border-white/20 rounded-lg px-2 py-1 text-white focus:border-white focus:outline-none" />
                    </td>
                   <td className="px-4 py-3 text-center">
  <button onClick={() => toggleAvailability(item.id)} className={`px-3 py-1 rounded-full text-xs font-semibold ${item.available ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
    {item.available ? 'Yes' : 'No'}
  </button>
</td>
<td className="px-4 py-2 text-center">
  <button
    onClick={async () => {
      const updated = { ...item, autoDeduct: !item.autoDeduct };
      const { error } = await supabase.from('menu_items').update({ auto_deduct: updated.autoDeduct }).eq('id', item.id);
      if (!error) setMenuState(menu.map(m => m.id === item.id ? updated : m));
    }}
    className={`px-3 py-1 rounded-full text-xs font-semibold ${item.autoDeduct ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}
  >
    {item.autoDeduct ? 'Yes' : 'No'}
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
    isSupply={false}
    addOnsList={addOns}
    categories={categories}
    onCategoryAdded={refreshCategories}
    onSave={activeTab === 'addons' ? saveAddOn : saveMenuItem}
    onCancel={() => { setEditing(null); setIsNew(false); }}
  />
)}
    </div>
  );
}


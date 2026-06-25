'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import * as XLSX from 'xlsx';

// Types
interface Ingredient {
  id: string;
  name: string;
  unit: string;
  unit_size: number | null;
  container_unit: string | null;
  current_stock: number;
  min_stock_threshold: number;
  category: string;
}

interface Recipe {
  id: string;
  menu_item_id: string;
  ingredient_id: string;
  quantity: number;
  size: string;
  slot: string | null;  
  menu_item_name?: string;
  ingredient_name?: string;
}

interface StockLog {
  id: string;
  ingredient_id: string;
  previous_stock: number;
  new_stock: number;
  quantity_change: number;
  reason: string;
  reference_id: string;
  created_at: string;
  ingredient_name?: string;
}

// Editable row in the Edit Recipe modal
interface EditableRecipeRow {
  id: string | null;
  ingredient_id: string;
  quantity: number;
  size: string;
  slot?: number; // 1, 2, 3 for ingredients; 4=Cup R, 5=Cup L, 6=Straw R, 7=Straw L
  _deleted?: boolean;
  _isNew?: boolean;
}

const INGREDIENT_CATEGORIES = [
  'Milktea Ingredients',
  'Syrups and Fruit Bases',
  'Coffee Ingredients',
  'Food Ingredients',
  'Packaging Supplies',
  'Other Supplies',
  'Merchandise',
];

const UNIT_OPTIONS = [
  { value: 'pieces', label: 'Pieces (pc)', example: 'cups, straws, bags' },
  { value: 'grams', label: 'Grams (g)', example: 'powder, creamer' },
  { value: 'ml', label: 'Milliliters (ml)', example: 'syrup, fructose' },
  { value: 'kg', label: 'Kilograms (kg)', example: 'bulk ingredients' },
  { value: 'L', label: 'Liters (L)', example: 'milk, sauce' },
];

type DateRange = '7days' | '30days' | 'month' | 'all';
const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: '7days', label: 'Last 7 days' },
  { value: '30days', label: 'Last 30 days' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
];

export default function InventoryScreen() {
  const [activeTab, setActiveTab] = useState<'ingredients' | 'recipes' | 'logs'>('ingredients');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [stockLogs, setStockLogs] = useState<StockLog[]>([]);
const [menuItems, setMenuItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddIngredient, setShowAddIngredient] = useState(false);
  const [showAdjustStock, setShowAdjustStock] = useState<string | null>(null);
  const [showAddRecipe, setShowAddRecipe] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [usedDateRange, setUsedDateRange] = useState<DateRange>('30days');
// const [recipeCategories, setRecipeCategories] = useState<string[]>([]);

const [sortByStatus, setSortByStatus] = useState<'off' | 'asc' | 'desc'>('off');
const [sortByUsed, setSortByUsed] = useState<'off' | 'asc' | 'desc'>('off');  // ← ADD THIS


  // ── NEW: full-row edit state ──────────────────────────────────────────────
  // editingRecipeGroup holds the pivot row context (menuItemId + size + menuItem name)
  const [editingRecipeGroup, setEditingRecipeGroup] = useState<{
    menuItemId: string;
    menuItemName: string;
    size: string;
  } | null>(null);
  // editableRows = working copy of all recipe rows for the selected group
  const [editableRows, setEditableRows] = useState<EditableRecipeRow[]>([]);
  const [savingRecipes, setSavingRecipes] = useState(false);
  // ─────────────────────────────────────────────────────────────────────────

  const [newIngredient, setNewIngredient] = useState({
    name: '', unit: 'pieces', unit_size: null as number | null,
    container_unit: '', current_stock: 0, min_stock_threshold: 10, category: 'General',
  });
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [adjustReason, setAdjustReason] = useState('manual_adjustment');
  const [newRecipe, setNewRecipe] = useState({ menu_item_id: '', ingredient_id: '', quantity: 0, size: 'R' });
  const [recipeSearchTerm, setRecipeSearchTerm] = useState('');
  const [recipeCategoryFilter, setRecipeCategoryFilter] = useState('All');

  // ── kept for back-compat (single-row edit removed — replaced above) ──────
  const [showEditRecipe] = useState<Recipe | null>(null);
  // ─────────────────────────────────────────────────────────────────────────

  // ============================================
  // LOAD FUNCTIONS
  // ============================================
  const loadIngredients = async () => {
    const { data, error } = await supabase.from('ingredients').select('*')
      .order('category').order('name');
    if (error) throw error;
    setIngredients(data || []);
  };

const loadRecipes = async () => {
  const { data, error } = await supabase.from('recipes').select(`
    *, slot, menu_items:menu_item_id (name, category), ingredients:ingredient_id (name)
  `);
  if (error) throw error;
  setRecipes((data || []).map((r: any) => ({
    ...r,
    slot: r.slot ?? null,
    menu_item_name: r.menu_items?.name,
    ingredient_name: r.ingredients?.name,
  })));
};

const loadStockLogs = async () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 40);

    // Delete logs older than 40 days
    await supabase.from('stock_logs')
      .delete()
      .lt('created_at', cutoff.toISOString());

    const { data, error } = await supabase.from('stock_logs')
      .select(`*, ingredients:ingredient_id (name)`)
.order('created_at', { ascending: false }).limit(500);
    if (error) throw error;
    setStockLogs((data || []).map((l: any) => ({ ...l, ingredient_name: l.ingredients?.name })));
  };


//   const deductStockForOrder = async (orderItems: any[], orderId: string) => {
//     for (const orderItem of orderItems) {
// const size = orderItem.customization?.size || 'R';
// const { data: recipeData } = await supabase.from('recipes')
//   .select(`*, ingredients:ingredient_id (*)`)
//   .eq('menu_item_id', orderItem.menuItemId)
//   .eq('size', size);
//       for (const recipe of recipeData || []) {
//         const ingredient = recipe.ingredients;
//         const quantityNeeded = recipe.quantity * orderItem.quantity;
//         const newStock = ingredient.current_stock - quantityNeeded;
//         await supabase.from('ingredients')
//           .update({ current_stock: Math.max(0, newStock), updated_at: new Date().toISOString() })
//           .eq('id', ingredient.id);
//         await supabase.from('stock_logs').insert([{
//           ingredient_id: ingredient.id, previous_stock: ingredient.current_stock,
//           new_stock: Math.max(0, newStock), quantity_change: -quantityNeeded,
//           reason: 'order', reference_id: orderId,
//         }]);
//       }
//     }
//     await loadIngredients(); await loadStockLogs(); await calculateDrinksLeft();
//   };

const loadAllData = async () => {
  setLoading(true);
  try {
    await loadIngredients();
    await loadRecipes();
    await loadStockLogs();
    
    // Load menu items for the dropdown
    const { data: menuData } = await supabase
      .from('menu_items')
      .select('id, name, category')
      .order('name');
    setMenuItems(menuData || []);
  } catch (error) {
    console.error('Error loading inventory data:', error);
    alert('Failed to load inventory data');
  } finally {
    setLoading(false);
  }
};

  // ============================================
  // CRUD
  // ============================================
  const addIngredient = async () => {
    if (!newIngredient.name.trim()) { alert('Please enter ingredient name'); return; }
    const { error } = await supabase.from('ingredients').insert([newIngredient]);
    if (error) { alert('Error adding ingredient: ' + error.message); return; }
    setShowAddIngredient(false);
    setNewIngredient({ name: '', unit: 'pieces', unit_size: null, container_unit: '', current_stock: 0, min_stock_threshold: 10, category: 'General' });
    await loadIngredients();
  };

  const updateIngredient = async () => {
    if (!editingIngredient) return;
    const { error } = await supabase.from('ingredients').update({
      name: editingIngredient.name, unit: editingIngredient.unit,
      unit_size: editingIngredient.unit_size, container_unit: editingIngredient.container_unit || null,
      min_stock_threshold: editingIngredient.min_stock_threshold,
      category: editingIngredient.category, updated_at: new Date().toISOString(),
    }).eq('id', editingIngredient.id);
    if (error) { alert('Error updating ingredient: ' + error.message); return; }
    setEditingIngredient(null); await loadIngredients();
  };

  const adjustStock = async (ingredientId: string) => {
    if (adjustAmount === 0 || isNaN(adjustAmount)) { alert('Please enter a valid amount'); return; }
    const ingredient = ingredients.find(i => i.id === ingredientId);
    if (!ingredient) return;
    const rawAdjust = ingredient.unit_size ? adjustAmount * ingredient.unit_size : adjustAmount;
    const newStock = ingredient.current_stock + rawAdjust;
    if (newStock < 0) { alert('Stock cannot be negative!'); return; }
    const { error: updateError } = await supabase.from('ingredients')
      .update({ current_stock: newStock, updated_at: new Date().toISOString() }).eq('id', ingredientId);
    if (updateError) { alert('Error updating stock: ' + updateError.message); return; }
    await supabase.from('stock_logs').insert([{
      ingredient_id: ingredientId, previous_stock: ingredient.current_stock,
      new_stock: newStock, quantity_change: rawAdjust,
      reason: adjustReason, reference_id: 'manual_' + Date.now(),
    }]);
    setShowAdjustStock(null); setAdjustAmount(0);
    await loadIngredients();
    await loadStockLogs();
  };

  const addRecipe = async () => {
    if (!newRecipe.menu_item_id || !newRecipe.ingredient_id || newRecipe.quantity <= 0) {
      alert('Please fill all recipe fields'); return;
    }
    const { error } = await supabase.from('recipes').insert([{
      menu_item_id: newRecipe.menu_item_id, ingredient_id: newRecipe.ingredient_id,
      quantity: newRecipe.quantity, size: newRecipe.size,
    }]);
    if (error) { alert('Error adding recipe: ' + error.message); return; }
    setShowAddRecipe(false);
    setNewRecipe({ menu_item_id: '', ingredient_id: '', quantity: 0, size: 'R' });
    loadAllData();
  };

  const deleteRecipe = async (recipeId: string) => {
    if (!confirm('Remove this recipe?')) return;
    const { error } = await supabase.from('recipes').delete().eq('id', recipeId);
    if (error) { alert('Error deleting recipe: ' + error.message); return; }
    loadAllData();
  };

  const deleteIngredient = async (ingredientId: string) => {
    const isUsed = recipes.some(r => r.ingredient_id === ingredientId);
    if (isUsed) { alert('Cannot delete ingredient that is used in recipes. Remove from recipes first.'); return; }
    if (!confirm('Delete this ingredient?')) return;
    const { error } = await supabase.from('ingredients').delete().eq('id', ingredientId);
    if (error) { alert('Error deleting ingredient: ' + error.message); return; }
    loadAllData();
  };

  const duplicateSizeVariant = async (menuItemId: string, sourceSize: string, targetSize: 'R' | 'L') => {
    const sourceRecipes = recipes.filter(r => r.menu_item_id === menuItemId && r.size === sourceSize);
    if (sourceRecipes.length === 0) { alert('No recipes found to duplicate'); return; }
    for (const recipe of sourceRecipes) {
      const { error } = await supabase.from('recipes').insert([{
        menu_item_id: recipe.menu_item_id, ingredient_id: recipe.ingredient_id,
        quantity: recipe.quantity, size: targetSize,
      }]);
      if (error) { alert('Error duplicating: ' + error.message); return; }
    }
    await loadAllData();
  };

const deleteRecipeByMenuItem = async (menuItemId: string, size: string) => {
  const recipesToDelete = size
    ? recipes.filter(r => r.menu_item_id === menuItemId && r.size === size)
    : recipes.filter(r => r.menu_item_id === menuItemId);
  if (recipesToDelete.length === 0) return;
  for (const recipe of recipesToDelete) {
    await supabase.from('recipes').delete().eq('id', recipe.id);
  }
  await loadRecipes();
};

  // ============================================
  // EDIT RECIPE GROUP — open modal with all rows
  // ============================================
const openEditRecipeGroup = (menuItemId: string, menuItemName: string, size: string) => {
  const groupRows = recipes.filter(r => r.menu_item_id === menuItemId);
  setEditableRows(groupRows.map(r => {
    const ing = ingredients.find(i => i.id === r.ingredient_id);
const isPacking = ing?.category === 'Packaging Supplies';
const dbSlot = (r as any).slot as string | null;
// Map DB slot string to numeric slot for the dropdown
const slotNumMap: Record<string, number> = {
  // new
  regular: 4, large: 5, cold: 6, hot: 7, straw: 8, others: 9,
  // legacy compat
  cup_r: 4, cup_l: 5, cup_cold_r: 6, cup_cold_l: 6,
  cup_hot_r: 7, cup_hot_l: 7, straw_r: 8, straw_l: 8,
};
const ingName = ing?.name?.toLowerCase() || '';
const isOtherSupply = ingName.includes('straw') || ingName.includes('stirrer');
const defaultSlot = isOtherSupply ? 9 : 4;
const slot = isPacking
  ? (isOtherSupply ? 9 : (dbSlot ? slotNumMap[dbSlot] ?? defaultSlot : defaultSlot))
  : 1;
    return {
      id: r.id, ingredient_id: r.ingredient_id,
      quantity: r.quantity, size: r.size,
      slot, _deleted: false, _isNew: false,
    };
  }));
  setEditingRecipeGroup({ menuItemId, menuItemName, size: 'edit' });
};

const addEditableRow = () => {
  setEditableRows(prev => [...prev, {
    id: null,
    ingredient_id: ingredients[0]?.id || '',
    quantity: 1,
    size: 'R',
    _isNew: true,
    _deleted: false,
  }]);
};

  const updateEditableRow = (idx: number, field: keyof EditableRecipeRow, value: any) => {
    setEditableRows(prev => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  };

  const markRowDeleted = (idx: number) => {
    setEditableRows(prev => prev.map((row, i) => i === idx ? { ...row, _deleted: true } : row));
  };

const getSlotString = (slotNum: number | undefined): string | null => {
  const map: Record<number, string> = {
    4: 'regular', 5: 'large', 6: 'cold', 7: 'hot', 8: 'straw', 9: 'others',
  };
  return slotNum ? map[slotNum] ?? null : null;
};

  const saveRecipeGroup = async () => {
    if (!editingRecipeGroup) return;
    setSavingRecipes(true);
    try {
      for (const row of editableRows) {
        if (row._deleted && row.id) {
          // Delete existing row
          const { error } = await supabase.from('recipes').delete().eq('id', row.id);
          if (error) throw error;
        } else if (row._deleted && !row.id) {
          // New row marked deleted — skip
          continue;
        } else if (row._isNew && !row._deleted) {
          // Insert new row
          if (!row.ingredient_id || row.quantity <= 0) continue;
          const { error } = await supabase.from('recipes').insert([{
            menu_item_id: editingRecipeGroup.menuItemId,
            ingredient_id: row.ingredient_id,
            quantity: row.quantity,
            slot: getSlotString(row.slot),
            size: row.size,
          }]);
          if (error) throw error;
        } else if (!row._deleted && row.id) {
          // Update existing row
          const { error } = await supabase.from('recipes').update({
            ingredient_id: row.ingredient_id,
            quantity: row.quantity,
            size: row.size,
            slot: getSlotString(row.slot),  // ← ADD
          }).eq('id', row.id);
          if (error) throw error;
        }
      }
setEditingRecipeGroup(null);
      setEditableRows([]);
      await Promise.all([loadRecipes(), loadIngredients()]);
    } catch (err: any) {
      alert('Error saving recipes: ' + err.message);
    } finally {
      setSavingRecipes(false);
    }
  };

  // ============================================
  // EXPORT / IMPORT
  // ============================================
  const exportIngredients = () => {
    const exportData = ingredients.map(ing => ({
      'Ingredient Name': ing.name, 'Unit': ing.unit, 'Current Stock': ing.current_stock,
      'Min Threshold': ing.min_stock_threshold, 'Category': ing.category,
      'Status': (() => {
        const pc = ing.unit_size ? Math.floor(ing.current_stock / ing.unit_size) : null;
        const low = pc !== null ? pc <= ing.min_stock_threshold : ing.current_stock <= ing.min_stock_threshold;
        return ing.current_stock === 0 ? 'NO STOCK' : low ? 'LOW STOCK' : 'OK';
      })(),
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ingredients');
    XLSX.writeFile(wb, `inventory_export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportRecipes = () => {
    const exportData = recipes.map(recipe => ({
      'Menu Item': recipe.menu_item_name, 'Ingredient': recipe.ingredient_name,
      'Quantity': recipe.quantity, 'Unit': ingredients.find(i => i.id === recipe.ingredient_id)?.unit || '',
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Recipes');
    XLSX.writeFile(wb, `recipes_export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const importIngredients = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet);
      for (const row of rows) {
        const ingredient = {
          name: (row as any)['Ingredient Name'] || (row as any)['name'],
          unit: (row as any)['Unit'] || (row as any)['unit'] || 'pieces',
          current_stock: parseFloat((row as any)['Current Stock'] || (row as any)['current_stock'] || 0),
          min_stock_threshold: parseFloat((row as any)['Min Threshold'] || (row as any)['min_stock_threshold'] || 10),
          category: (row as any)['Category'] || (row as any)['category'] || 'General',
        };
        if (ingredient.name) await supabase.from('ingredients').upsert([ingredient], { onConflict: 'name' });
      }
      alert('Import completed!'); loadAllData();
    };
    reader.readAsArrayBuffer(file);
  };

  // useEffect(() => {
  //   (window as any).deductStockForOrder = deductStockForOrder;
  //   return () => { delete (window as any).deductStockForOrder; };
  // }, [ingredients]);

  // After the deductStockForOrder useEffect:
useEffect(() => {
  (window as any).restoreStockForOrder = async (orderItems: any[], orderId: string) => {
    // Aggregate per ingredient
    const totals: Record<string, { ingredientId: string; qty: number; currentStock: number }> = {};

    for (const orderItem of orderItems) {
      const size = orderItem.customization?.size || 'R';
      const { data: recipeData } = await supabase.from('recipes')
        .select(`*, ingredients:ingredient_id (*)`)
        .eq('menu_item_id', orderItem.menuItemId)
        .eq('size', size);

      for (const recipe of recipeData || []) {
        const ingredient = recipe.ingredients;
        const qty = recipe.quantity * (orderItem.quantity || 1);
        if (!totals[ingredient.id]) {
          totals[ingredient.id] = { ingredientId: ingredient.id, qty: 0, currentStock: ingredient.current_stock };
        }
        totals[ingredient.id].qty += qty;
      }
    }

    for (const { ingredientId, qty, currentStock } of Object.values(totals)) {
      const { data: fresh } = await supabase.from('ingredients').select('*').eq('id', ingredientId).single();
      if (!fresh) continue;

      const newStock = fresh.current_stock + qty;
      await supabase.from('ingredients')
        .update({ current_stock: newStock, updated_at: new Date().toISOString() })
        .eq('id', ingredientId);

      await supabase.from('stock_logs').insert([{
        ingredient_id: ingredientId,
        previous_stock: fresh.current_stock,
        new_stock: newStock,
        quantity_change: qty,
        reason: 'cancelled_order',
        reference_id: orderId,
      }]);
    }

    await loadIngredients();
    await loadStockLogs();
  };
  return () => { delete (window as any).restoreStockForOrder; };
}, [ingredients]);

// AFTER
useEffect(() => { loadAllData(); }, []);

useEffect(() => {
  const channel = supabase
    .channel('stock_logs_realtime')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'stock_logs',
    }, () => {
      loadStockLogs();
      loadIngredients();
    })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}, []);


  // ============================================
  // COMPUTED
  // ============================================
  const getDateFilter = (range: DateRange): Date | null => {
    const now = new Date();
    if (range === '7days') { const d = new Date(); d.setDate(now.getDate() - 7); return d; }
    if (range === '30days') { const d = new Date(); d.setDate(now.getDate() - 30); return d; }
    if (range === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
    return null;
  };

const usedStockFiltered = useMemo(() => {
  const map: Record<string, number> = {};
  stockLogs.forEach(log => {
    // Remove the date filter to show ALL TIME
    if ((log.reason === 'order' || log.reason === 'order_queue') && log.quantity_change < 0) {
      map[log.ingredient_id] = (map[log.ingredient_id] || 0) + Math.abs(log.quantity_change);
    }
  });
  return map;
}, [stockLogs]);

const filteredIngredients = useMemo(() => {
const getStatusOrder = (ing: Ingredient) => {
    if (ing.current_stock === 0) return 3;
    const pc = ing.unit_size ? Math.floor(ing.current_stock / ing.unit_size) : null;
    const isLow = pc !== null ? pc <= ing.min_stock_threshold : ing.current_stock <= ing.min_stock_threshold;
    return isLow ? 2 : 1;
  };

  let list = ingredients.filter(ing => {
    const matchesSearch = ing.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || ing.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

if (sortByStatus !== 'off') {
    list = [...list].sort((a, b) => 
      sortByStatus === 'asc' 
        ? getStatusOrder(a) - getStatusOrder(b)
        : getStatusOrder(b) - getStatusOrder(a)
    );
  }

    // ─── SORT BY USED ──────────────────────────────────
  if (sortByUsed !== 'off') {
    list = [...list].sort((a, b) => {
      const usedA = usedStockFiltered[a.id] || 0;
      const usedB = usedStockFiltered[b.id] || 0;
      return sortByUsed === 'asc' ? usedA - usedB : usedB - usedA;
    });
  }

  return list;
}, [ingredients, searchTerm, categoryFilter, sortByStatus, sortByUsed, usedStockFiltered]);  // ← ADD sortByUsed

  const allCategories = Array.from(new Set([
    ...INGREDIENT_CATEGORIES, ...ingredients.map(i => i.category).filter(Boolean),
  ])).sort();

const pivotedRecipes = useMemo(() => {
const getIngName = (r: Recipe) => ingredients.find(i => i.id === r.ingredient_id)?.name || r.ingredient_name || '';
  const IS_CUP = (n: string) => /cup/i.test(n);
 const IS_STRAW = (n: string) => /\bstraw\b/i.test(n);
  const IS_PACKING_ROW = (r: Recipe) => {
  const ing = ingredients.find(i => i.id === r.ingredient_id);
  return ing?.category === 'Packaging Supplies';
};

  // group all recipe rows by menu_item_id
  const grouped: Record<string, Recipe[]> = {};
  recipes.forEach(r => {
    if (!grouped[r.menu_item_id]) grouped[r.menu_item_id] = [];
    grouped[r.menu_item_id].push(r);
  });

  const result: any[] = [];

  Object.entries(grouped).forEach(([menuItemId, rows]) => {
    const menuItemName = rows[0]?.menu_item_name || '';
    const category = (rows[0] as any)?.menu_items?.category || '';

    // separate packing vs non-packing
    const packingRows = rows.filter(r => IS_PACKING_ROW(r));
    const ingRows = rows.filter(r => !IS_PACKING_ROW(r));

    // build ingredient slots — merge R and L by ingredient_id
    const ingMap: Record<string, { name: string; qty_r: number | null; qty_l: number | null; unit: string }> = {};
    ingRows.forEach(r => {
      const ing = ingredients.find(i => i.id === r.ingredient_id);
      if (!ingMap[r.ingredient_id]) ingMap[r.ingredient_id] = { name: r.ingredient_name || '', qty_r: null, qty_l: null, unit: ing?.unit || '' };
      if (r.size === 'R') ingMap[r.ingredient_id].qty_r = r.quantity;
      if (r.size === 'L') ingMap[r.ingredient_id].qty_l = r.quantity;
    });
    const SLOT_ORDER = ['milktea ingredients', 'syrups & fruit bases', 'coffee ingredients'];
const getIngOrder = (ingredient_id: string, name: string) => {
  const ing = ingredients.find(i => i.id === ingredient_id);
  const cat = ing?.category?.toLowerCase() || '';
  const n = name.toLowerCase();
  if (cat === 'milktea ingredients' || cat === 'coffee ingredients') return 1;
  if (n.includes('creamer') || n.includes('milk') || n.includes('condensed')) return 2;
  if (n.includes('fructose') || n.includes('sugar')) return 3;
  if (cat === 'syrups & fruit bases') return 4;
  return 5;
};

const ingSlots = Object.entries(ingMap)
  .map(([id, v]) => ({ ingredient_id: id, ...v }))
  .sort((a, b) => getIngOrder(a.ingredient_id, a.name) - getIngOrder(b.ingredient_id, b.name));

    // packing
const CUP_SLOTS = new Set(['regular','large','cold','hot','cup_r','cup_l','cup_cold_r','cup_cold_l','cup_hot_r','cup_hot_l']);
const OTHER_SLOTS = new Set(['straw','straw_r','straw_l','others']);

const isCupRow = (r: Recipe) => {
  const n = getIngName(r).toLowerCase();
  // name always wins — stirrers and straws always go to Other Supplies
  if (n.includes('straw') || n.includes('stirrer')) return false;
  if (n.includes('cup')) return true;
  // fallback to slot
  const slotStr = (r as any).slot as string | null;
  if (slotStr && OTHER_SLOTS.has(slotStr)) return false;
  if (slotStr && CUP_SLOTS.has(slotStr)) return true;
  return false;
};

const packing_supplies = packingRows
  .filter(r => isCupRow(r))
  .map(r => getIngName(r)).join('\n');
const other_supplies = packingRows
  .filter(r => !isCupRow(r))
  .map(r => getIngName(r)).join('\n');
result.push({ menuItemId, menuItemName, category, ingSlots, packing_supplies, other_supplies });
  });

  return result.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.menuItemName.localeCompare(b.menuItemName);
  });
}, [recipes, ingredients]);

const recipeCategories = useMemo(() => {
  const cats = new Set(pivotedRecipes.map(r => r.category));
  return Array.from(cats).sort();
}, [pivotedRecipes]);

const filteredPivotedRecipes = useMemo(() => {
  let filtered = pivotedRecipes;
  if (recipeSearchTerm) filtered = filtered.filter(row => row.menuItemName.toLowerCase().includes(recipeSearchTerm.toLowerCase()));
  if (recipeCategoryFilter !== 'All') filtered = filtered.filter(row => row.category === recipeCategoryFilter);
  return filtered;
}, [pivotedRecipes, recipeSearchTerm, recipeCategoryFilter]);

const maxIngSlots = useMemo(() => {
  return Math.max(1, ...filteredPivotedRecipes.map(r => r.ingSlots.length));
}, [filteredPivotedRecipes]);

if (loading) return (
  <div className="flex-1 p-6 overflow-y-auto bg-black">
    <div className="flex items-center justify-between mb-6">
      <div>
        <div className="h-8 w-56 bg-white/10 rounded-lg animate-pulse mb-2" />
        <div className="h-4 w-32 bg-white/10 rounded animate-pulse" />
      </div>
      <div className="h-9 w-40 bg-white/10 rounded-xl animate-pulse" />
    </div>
    <div className="h-20 bg-white/5 border border-white/10 rounded-xl animate-pulse mb-6" />
    <div className="flex gap-2 mb-6">
      {[1,2,3].map(i => <div key={i} className="h-10 w-32 bg-white/10 rounded-lg animate-pulse" />)}
    </div>
    <div className="bg-black border border-white/10 rounded-xl overflow-hidden">
      {[1,2,3,4,5].map(i => (
        <div key={i} className="flex gap-4 px-4 py-3 border-b border-white/10">
          <div className="h-4 w-32 bg-white/10 rounded animate-pulse" />
          <div className="h-4 w-40 bg-white/10 rounded animate-pulse" />
          <div className="h-4 w-20 bg-white/10 rounded animate-pulse ml-auto" />
          <div className="h-4 w-16 bg-white/10 rounded animate-pulse" />
        </div>
      ))}
    </div>
  </div>
);
  return (
    <div className="flex-1 p-6 overflow-y-auto bg-black">
      {/* Header */}
<div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventory Management</h1>
<p className="text-sm text-gray-400 mt-1">{ingredients.length} total ingredients</p>

        </div>
        <div className="flex gap-3">
          {activeTab === 'ingredients' && (
            <>
              <button onClick={exportIngredients} className="px-4 py-2 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors flex items-center gap-2">
                📥 Export Ingredients
              </button>
              <label className="px-4 py-2 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors cursor-pointer flex items-center gap-2">
                📂 Import Ingredients
                <input type="file" accept=".xlsx,.xls" onChange={importIngredients} className="hidden" />
              </label>
            </>
          )}
          {activeTab === 'recipes' && (
            <>
              <button onClick={exportRecipes} className="px-4 py-2 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors flex items-center gap-2">
                📥 Export Recipes
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-white/10">
        {(['ingredients','recipes','logs'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 font-semibold transition-colors capitalize ${activeTab === tab ? 'text-white border-b-2 border-white' : 'text-gray-400 hover:text-white'}`}>
            {tab === 'ingredients' ? `📦 Supplies (${ingredients.length})` : tab === 'recipes' ? `📋 Recipes (${recipes.length})` : '📜 Stock Logs'}
          </button>
        ))}
      </div>

      {/* ── INGREDIENTS TAB ── */}
      {activeTab === 'ingredients' && (
        <>
{/* Search + Category Dropdown + Add Button - Inline */}
<div className="flex items-center gap-3 mb-4 flex-wrap">
  {/* Search */}
  <div className="relative flex-1 min-w-[180px] max-w-xs">
    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
    <input 
      type="text" 
      placeholder="Search ingredients..." 
      value={searchTerm} 
      onChange={e => setSearchTerm(e.target.value)}
      className="w-full pl-9 pr-8 py-2 rounded-xl bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-white/50 text-sm"
    />
    {searchTerm && (
      <button 
        onClick={() => setSearchTerm('')}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-sm"
      >
        ✕
      </button>
    )}
  </div>

  {/* Category Dropdown */}
  <div className="flex items-center gap-2 shrink-0">
    <label className="text-sm text-gray-400 hidden sm:block">Category:</label>
    <div className="relative">
      <select
        value={categoryFilter}
        onChange={e => setCategoryFilter(e.target.value)}
        className="px-3 py-2 pr-8 rounded-xl bg-black border border-white/20 text-white text-sm focus:outline-none focus:border-white/50 appearance-none cursor-pointer min-w-[140px]"
      >
        <option value="All" className="bg-black text-white">All</option>
        {INGREDIENT_CATEGORIES.map(cat => (
          <option key={cat} value={cat} className="bg-black text-white">{cat}</option>
        ))}
      </select>
      <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  </div>

  {/* Add Button */}
  <button 
    onClick={() => setShowAddIngredient(true)} 
    className="px-4 py-2 rounded-xl bg-white text-black font-semibold hover:bg-gray-200 flex items-center gap-1 text-sm whitespace-nowrap ml-auto shrink-0"
  >
    <span className="text-lg leading-none">+</span> Add
  </button>
</div>
          <div className="bg-black border border-white/20 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-white/5 text-gray-300 border-b border-white/10">
                <tr>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-left">Item</th>
                  <th className="px-4 py-3 text-right">In Stock</th>
                  <th className="px-4 py-3 text-right">Total Measurement</th>
<th 
  className="px-4 py-3 text-right cursor-pointer select-none hover:text-white transition-colors" 
  onClick={() => setSortByUsed(prev => prev === 'off' ? 'asc' : prev === 'asc' ? 'desc' : 'off')}
>
  Used {sortByUsed === 'asc' ? '↑' : sortByUsed === 'desc' ? '↓' : '⇅'}
</th>
 <th className="px-4 py-3 text-center cursor-pointer select-none" onClick={() => setSortByStatus(prev => prev === 'off' ? 'asc' : prev === 'asc' ? 'desc' : 'off')}>
  Status {sortByStatus === 'asc' ? '↑' : sortByStatus === 'desc' ? '↓' : '⇅'}
</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredIngredients.map(ing => {
                  const packCount = ing.unit_size ? Math.floor(ing.current_stock / ing.unit_size) : null;
const displayStock = (() => {
  if (ing.unit === 'L' || ing.unit === 'kg') {
    const val = ing.current_stock;
    // If whole number, show no decimals
    if (Number.isInteger(val)) return val + ' ' + ing.unit;
    // Otherwise show 2 decimal places
    return val.toFixed(2) + ' ' + ing.unit;
  }
  if (packCount !== null) return `${packCount}${ing.container_unit ? ' ' + ing.container_unit : ''}`;
  return ing.current_stock.toLocaleString() + ' ' + ing.unit;
})();
                  const isLowStock = packCount !== null ? packCount <= ing.min_stock_threshold : ing.current_stock <= ing.min_stock_threshold;
const usedAmount = usedStockFiltered[ing.id] || 0;

const usedDisplay = (() => {
  if (usedAmount === 0) return '—';
  const amount = ing.unit === 'L' || ing.unit === 'kg' ? usedAmount / 1000 : usedAmount;
  const unit = ing.unit;
  if (unit === 'L' || unit === 'kg') {
    if (Number.isInteger(amount)) return amount + ' ' + unit;
    return amount.toFixed(2) + ' ' + unit;
  }
  if (unit === 'ml' || unit === 'g') return amount.toFixed(0) + ' ' + unit;
  return amount.toLocaleString() + ' ' + unit;
})();
const thresholdDisplay = packCount !== null 
  ? `${ing.min_stock_threshold} ${ing.container_unit ? ing.container_unit + 's' : ing.unit}` 
  : `${ing.min_stock_threshold} ${ing.unit}`;                  return (
                    <tr key={ing.id} className="border-t border-white/10 hover:bg-white/5">
                      <td className="px-4 py-3 text-gray-400 text-sm">{ing.category}</td>
                      <td className="px-4 py-3 font-medium text-white">{ing.name}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-semibold ${isLowStock ? 'text-red-400' : 'text-white'}`}>{displayStock}</span>
                      </td>
<td className="px-4 py-3 text-right text-gray-300">
  {(() => {
    if (ing.unit === 'L') return (ing.current_stock * 1000).toLocaleString() + ' ml';
    if (ing.unit === 'kg') return (ing.current_stock * 1000).toLocaleString() + ' g';
    if (ing.unit === 'pieces') return ing.current_stock.toLocaleString() + ' pieces';
    return ing.current_stock.toLocaleString() + ' ' + ing.unit;
  })()}
</td>
<td className="px-4 py-3 text-right">
  <input
    type="text"
    defaultValue={usedDisplay || ''}
    onFocus={(e) => e.target.select()}
    onBlur={async (e) => {
      const val = e.target.value.trim();
      if (val === '—' || val === usedDisplay) return;
      
      // Parse: "0.040 kg" or "0.040 kg (1)" → extract number
      const match = val.match(/^([\d.]+)/);
      if (!match) return;
      
      const amount = parseFloat(match[1]);
      if (isNaN(amount) || amount <= 0) return;
      
      // Convert to grams if unit is kg (stock logs store in grams)
      const convertToGrams = ing.unit === 'kg' ? amount * 1000 : amount;
      
      // Create manual usage log
      const { error } = await supabase.from('stock_logs').insert([{
        ingredient_id: ing.id,
        previous_stock: ing.current_stock,
        new_stock: Math.max(0, ing.current_stock - convertToGrams),
        quantity_change: -convertToGrams,
        reason: 'manual_usage',
        reference_id: 'manual_' + Date.now(),
      }]);
      
      if (error) {
        alert('Failed to update: ' + error.message);
        return;
      }
      
      // Update current stock
      await supabase.from('ingredients')
        .update({ current_stock: Math.max(0, ing.current_stock - convertToGrams) })
        .eq('id', ing.id);
      
      // Reload data
      await loadAllData();
    }}
    className="w-24 bg-transparent text-white text-right text-sm focus:outline-none focus:ring-1 focus:ring-white/30 rounded px-1 py-0.5"
    placeholder="—"
  />
</td>
                      <td className="px-4 py-3 text-center">
                        {ing.current_stock === 0 ? <span className="px-2 py-1 rounded-full bg-red-900/60 text-red-300 text-xs font-semibold">NO STOCK</span>
                          : isLowStock ? <span className="px-2 py-1 rounded-full bg-yellow-900/60 text-yellow-300 text-xs font-semibold">LOW STOCK</span>
                          : <span className="px-2 py-1 rounded-full bg-green-900/50 text-green-300 text-xs font-semibold">IN STOCK</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex gap-2 justify-center">
                          <button onClick={() => setEditingIngredient(ing)} className="text-gray-300 hover:text-white text-xs">Edit</button>
                          <button onClick={() => { setShowAdjustStock(ing.id); setAdjustAmount(0); }} className="text-blue-400 hover:text-blue-300 text-xs">Adjust</button>
                          <button onClick={() => deleteIngredient(ing.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

{/* ── RECIPES TAB ── */}
{activeTab === 'recipes' && (
  <>

{/* Search + Category Dropdown + Add Button - Inline */}
<div className="flex items-center gap-3 mb-4 flex-wrap">
  {/* Search */}
  <div className="relative flex-1 min-w-[180px] max-w-xs">
    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
    <input 
      type="text" 
      placeholder="Search recipes..." 
      value={recipeSearchTerm} 
      onChange={e => setRecipeSearchTerm(e.target.value)}
      className="w-full pl-9 pr-8 py-2 rounded-xl bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-white/50 text-sm"
    />
    {recipeSearchTerm && (
      <button 
        onClick={() => setRecipeSearchTerm('')}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-sm"
      >
        ✕
      </button>
    )}
  </div>

  {/* Category Dropdown */}
  <div className="flex items-center gap-2 shrink-0">
    <label className="text-sm text-gray-400 hidden sm:block">Category:</label>
    <div className="relative">
      <select
        value={recipeCategoryFilter}
        onChange={e => setRecipeCategoryFilter(e.target.value)}
        className="px-3 py-2 pr-8 rounded-xl bg-black border border-white/20 text-white text-sm focus:outline-none focus:border-white/50 appearance-none cursor-pointer min-w-[140px]"
      >
        <option value="All" className="bg-black text-white">All</option>
        {recipeCategories.map(cat => (
          <option key={cat} value={cat} className="bg-black text-white">{cat}</option>
        ))}
      </select>
      <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  </div>

  {/* Add Button */}
  <button 
    onClick={() => { setShowAddRecipe(true); setEditableRows([{ id: null, ingredient_id: ingredients[0]?.id || '', quantity: 1, size: 'R', _isNew: true, _deleted: false }]); }}
    className="px-4 py-2 rounded-xl bg-white text-black font-semibold hover:bg-gray-200 flex items-center gap-1 text-sm whitespace-nowrap ml-auto shrink-0"
  >
    <span className="text-lg leading-none">+</span> Add
  </button>
</div>

    <div className="bg-black border border-white/20 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[1000px]">
<thead className="bg-white/5 text-gray-300 border-b border-white/10 sticky top-0">
  <tr>
<th className="px-3 py-3 text-left">Category</th>
<th className="px-3 py-3 text-left">Menu Item</th>
<th className="px-3 py-3 text-left">Ingredients</th>
<th className="px-3 py-3 text-left text-yellow-300">Packing Supplies</th>
<th className="px-3 py-3 text-left text-yellow-300">Other Supplies</th>
<th className="px-3 py-3 text-center whitespace-nowrap">Actions</th>
  </tr>
</thead>
<tbody>
  {filteredPivotedRecipes.map(row => (
    <tr key={row.menuItemId} className="border-t border-white/10 hover:bg-white/5">
<td className="px-3 py-3 text-gray-400 text-xs">{row.category}</td>
<td className="px-3 py-3 font-medium text-white">{row.menuItemName}</td>
<td className="px-3 py-3 text-xs align-top">
  {row.ingSlots.length > 0 && (
    <div className="space-y-0.5">
{row.ingSlots.map((slot: any, i: number) => {
  const formatQty = (qty: number, unit: string) => {
    if (unit === 'kg') return (qty * 1000) + 'g';
    if (unit === 'L') return (qty * 1000) + 'ml';
    return qty + unit;
  };
  return (
    <div key={i} className="whitespace-nowrap">
      <span className="text-gray-300">{slot.name}</span>
      {slot.qty_r != null && <span className="text-white ml-1">{formatQty(slot.qty_r, slot.unit)}</span>}
      {slot.qty_l != null && <span className="text-gray-400 ml-1">/ {formatQty(slot.qty_l, slot.unit)}</span>}
    </div>
  );
})}
    </div>
  )}
</td>

<td className="px-3 py-3 text-gray-300 text-xs align-top">
  {row.packing_supplies && (
    <div className="whitespace-pre-line">{row.packing_supplies}</div>
  )}
</td>
<td className="px-3 py-3 text-gray-300 text-xs align-top">
  {row.other_supplies && (
    <div className="whitespace-pre-line">{row.other_supplies}</div>
  )}
</td>
<td className="px-3 py-3 text-center">
        <div className="flex gap-2 justify-center">
          <button onClick={() => openEditRecipeGroup(row.menuItemId, row.menuItemName, '')}
            className="text-green-400 hover:text-green-300 text-xs font-semibold">✏️ Edit</button>
          <button onClick={() => { if (confirm(`Delete all recipes for "${row.menuItemName}"?`)) deleteRecipeByMenuItem(row.menuItemId, '') }}
            className="text-red-400 hover:text-red-300 text-xs">🗑️ Delete</button>
        </div>
      </td>
    </tr>
  ))}
</tbody>
            </table>
            {filteredPivotedRecipes.length === 0 && (
              <div className="text-center py-12 text-gray-500">No recipes found matching "{recipeSearchTerm}"</div>
            )}
          </div>
        </>
      )}

      {/* ── STOCK LOGS TAB ── */}
      {activeTab === 'logs' && (
        <div className="bg-black border border-white/20 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-gray-300 border-b border-white/10">
              <tr>
                <th className="px-4 py-3 text-left">Date & Time</th>
                <th className="px-4 py-3 text-left">Ingredient</th>
                <th className="px-4 py-3 text-right">Change</th>
                <th className="px-4 py-3 text-right">Previous → New</th>
                <th className="px-4 py-3 text-left">Reason</th>
              </tr>
            </thead>
            <tbody>
              {stockLogs.map(log => (
<tr key={log.id} className="border-t border-white/10 hover:bg-white/5">
  <td className="px-4 py-3 text-gray-400">{new Date(log.created_at + 'Z').toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</td>
  <td className="px-4 py-3 font-medium text-white">{log.ingredient_name || <span className="text-gray-500 italic">Unknown item</span>}</td>
  <td className="px-4 py-3 text-right"><span className={log.quantity_change < 0 ? 'text-red-400' : 'text-green-400'}>{log.quantity_change > 0 ? '+' : ''}{log.quantity_change}</span></td>
  <td className="px-4 py-3 text-right text-gray-400">{log.previous_stock} → {log.new_stock}</td>
  <td className="px-4 py-3 text-gray-300">{log.reason}</td>
</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ════════════════════════════════════════════
          EDIT RECIPE GROUP MODAL — full ingredient rows
          ════════════════════════════════════════════ */}
      {editingRecipeGroup && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4" onClick={() => setEditingRecipeGroup(null)}>
          <div className="bg-[#111] border border-white/20 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="p-5 border-b border-white/20 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Edit Recipe</h2>
                <p className="text-sm text-gray-400 mt-0.5">
                  <span className="text-white font-semibold">{editingRecipeGroup.menuItemName}</span>
                  {editingRecipeGroup.size && (
<span className="ml-2 px-2 py-0.5 rounded text-xs font-bold bg-white/10 text-gray-300">
  All Sizes
</span>
                  )}
                </p>
              </div>
              <button onClick={() => setEditingRecipeGroup(null)} className="text-gray-500 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10">✕</button>
            </div>

            {/* Body — scrollable */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {/* Column headers */}
{/* ── INGREDIENTS SECTION ── */}
<div className="mb-2">
  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Ingredients</p>
<div className="grid grid-cols-[1fr_55px_75px_45px_32px] gap-2 px-1 mb-1">
  <span className="text-xs text-gray-600 uppercase">Name</span>
  <span className="text-xs text-gray-600 uppercase text-center">Size</span>
  <span className="text-xs text-gray-600 uppercase text-center">Qty</span>
  <span className="text-xs text-gray-600 uppercase text-center">Unit</span>
  <span></span>
</div>
{editableRows.filter(row => !row._deleted && ingredients.find(i => i.id === row.ingredient_id)?.category !== 'Packaging Supplies').map((row) => {
  const actualIdx = editableRows.indexOf(row);
  const selectedIngredient = ingredients.find(i => i.id === row.ingredient_id);
  return (
<div key={actualIdx} className="grid grid-cols-[1fr_50px_70px_40px_28px] gap-2 items-center bg-white/5 rounded-xl px-3 py-2 border border-white/10 mb-2">
  <select value={row.ingredient_id} onChange={e => updateEditableRow(actualIdx, 'ingredient_id', e.target.value)}
    className="w-full bg-black border border-white/20 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-white/50">
    {ingredients.filter(i => i.category !== 'Packaging Supplies').map(ing => (
      <option key={ing.id} value={ing.id} className="bg-black">{ing.name} ({ing.unit})</option>
    ))}
  </select>
  <select value={row.size} onChange={e => updateEditableRow(actualIdx, 'size', e.target.value)}
    className="w-full bg-black border border-white/20 rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-white/50">
    <option value="R" className="bg-black">R</option>
    <option value="L" className="bg-black">L</option>
  </select>
 <input type="number" min="0" step="any" value={parseFloat(row.quantity.toFixed(6))}

    onChange={e => updateEditableRow(actualIdx, 'quantity', parseFloat(e.target.value) || 0)}
    className="w-full bg-black border border-white/20 rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-white/50" />
  <span className="text-xs text-gray-400 text-center font-mono">{selectedIngredient?.unit || '—'}</span>
  <button onClick={() => markRowDeleted(actualIdx)}
    className="w-8 h-8 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-900/30 hover:text-red-400 transition-colors">×</button>
</div>
  );
})}
  {editableRows.filter(r => !r._deleted && ingredients.find(i => i.id === r.ingredient_id)?.category !== 'Packaging Supplies').length === 0 && (
    <p className="text-center text-gray-600 text-sm py-2">No ingredients.</p>
  )}
  <button onClick={() => setEditableRows(prev => [...prev, {
    id: null, ingredient_id: ingredients.find(i => i.category !== 'Packaging Supplies')?.id || '', quantity: 1, size: 'R', _isNew: true, _deleted: false,
  }])} className="w-full py-2 rounded-xl border border-dashed border-white/20 text-gray-400 hover:text-white text-sm font-semibold transition-colors">
    + Add Ingredient
  </button>
</div>

{/* ── PACKAGING SUPPLIES SECTION ── */}
<div className="mt-4 pt-4 border-t border-white/10">
  <p className="text-xs font-semibold text-yellow-400 uppercase tracking-wide mb-2">📦 Packaging Supplies</p>
<div className="grid grid-cols-[1fr_50px_70px_40px_28px] gap-2 px-1 mb-1">
  <span className="text-xs text-gray-600 uppercase">Name</span>
  <span className="text-xs text-gray-600 uppercase text-center">Size</span>
  <span className="text-xs text-gray-600 uppercase text-center">Qty</span>
  <span className="text-xs text-gray-600 uppercase text-center">Unit</span>
  <span></span>
</div>
{editableRows.filter(row => !row._deleted && ingredients.find(i => i.id === row.ingredient_id)?.category === 'Packaging Supplies').map((row) => {
  const actualIdx = editableRows.indexOf(row);
  const selectedIngredient = ingredients.find(i => i.id === row.ingredient_id);
  return (
<div key={actualIdx} className="grid grid-cols-[100px_1fr_70px_40px_28px] gap-2 items-center bg-yellow-900/10 rounded-xl px-3 py-2 border border-yellow-900/30 mb-2">      <select value={row.slot || 4} onChange={e => {
  const newSlot = parseInt(e.target.value);
  updateEditableRow(actualIdx, 'slot', newSlot);
  // auto-select the correct ingredient for this slot
  const defaults: Record<number, string[]> = {
4: ['u cup', 'regular u cup'],
5: ['hard cup'],
6: ['dabba cup'],
7: ['hot coffee cup'],
8: ['boba straw 21', 'thin straw'],
9: ['bag', 'takeout', 'stirrer'],
  };
  const keywords = defaults[newSlot] || [];
  const match = ingredients.find(i =>
    i.category === 'Packaging Supplies' &&
    keywords.some(kw => i.name.toLowerCase().includes(kw))
  );
  if (match) updateEditableRow(actualIdx, 'ingredient_id', match.id);
}}
  className="w-full bg-black border border-yellow-900/50 rounded-lg px-2 py-1.5 text-xs text-yellow-300 focus:outline-none">
<option value={4} className="bg-black">Regular</option>
<option value={5} className="bg-black">Large</option>
<option value={6} className="bg-black">Cold</option>
<option value={7} className="bg-black">Hot</option>
<option value={9} className="bg-black">Others</option>
</select>
<select value={row.ingredient_id} onChange={e => updateEditableRow(actualIdx, 'ingredient_id', e.target.value)}
  className="w-full bg-black border border-white/20 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-white/50">
  {ingredients
    .filter(i => i.category === 'Packaging Supplies')
.filter(i => {
  const n = i.name.toLowerCase();
if (row.slot === 4) return n.includes('u cup');
if (row.slot === 5) return n.includes('hard cup');
if (row.slot === 6) return n.includes('dabba');
if (row.slot === 7) return n.includes('hot coffee cup');
if (row.slot === 9) return n.includes('straw') || n.includes('stirrer') || n.includes('bag') || n.includes('takeout') || n.includes('paper') || n.includes('film');
return true;
})
.map(ing => (
  <option key={ing.id} value={ing.id} className="bg-black">{ing.name} ({ing.unit === 'pieces' ? 'pc' : ing.unit})</option>
))}
</select>
      <input type="number" min="0" step="any" value={row.quantity}
        onChange={e => updateEditableRow(actualIdx, 'quantity', parseFloat(e.target.value) || 0)}
        className="w-full bg-black border border-white/20 rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-white/50" />
<span className="text-xs text-gray-400 text-center font-mono">{selectedIngredient?.unit === 'pieces' ? 'pc' : selectedIngredient?.unit || '—'}</span>      <button onClick={() => markRowDeleted(actualIdx)}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-900/30 hover:text-red-400 transition-colors">×</button>
    </div>
    );
  })}
  {editableRows.filter(r => !r._deleted && ingredients.find(i => i.id === r.ingredient_id)?.category === 'Packaging Supplies').length === 0 && (
    <p className="text-center text-gray-600 text-sm py-2">No packaging supplies.</p>
  )}
  <button onClick={() => setEditableRows(prev => [...prev, {
    id: null, ingredient_id: ingredients.find(i => i.category === 'Packaging Supplies')?.id || '', quantity: 1, size: 'R', slot: 4, _isNew: true, _deleted: false,
  }])} className="w-full py-2 rounded-xl border border-dashed border-yellow-900/40 text-yellow-600 hover:text-yellow-400 text-sm font-semibold transition-colors">
    + Add Packaging Supply
  </button>
</div>
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-white/20 flex justify-between items-center">
              <p className="text-xs text-gray-500">
                {editableRows.filter(r => !r._deleted).length} ingredient{editableRows.filter(r => !r._deleted).length !== 1 ? 's' : ''} · {editableRows.filter(r => r._deleted && r.id).length > 0 ? `${editableRows.filter(r => r._deleted && r.id).length} to delete` : ''}
              </p>
              <div className="flex gap-3">
                <button onClick={() => setEditingRecipeGroup(null)} className="px-5 py-2 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20">
                  Cancel
                </button>
                <button
                  onClick={saveRecipeGroup}
                  disabled={savingRecipes}
                  className="px-5 py-2 rounded-xl bg-white text-black font-semibold hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {savingRecipes ? <><span className="animate-spin inline-block">⏳</span> Saving...</> : '✓ Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Ingredient Modal ── */}
      {showAddIngredient && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowAddIngredient(false)}>
          <div className="bg-black border border-white/20 rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/20"><h2 className="text-lg font-bold text-white">Add New Ingredient</h2></div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1">Ingredient Name *</label>
                <input value={newIngredient.name} onChange={e => setNewIngredient({...newIngredient, name: e.target.value})} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white" placeholder="e.g., Okinawa, Creamer" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1">Unit of Measurement *</label>
                <select value={newIngredient.unit} onChange={e => setNewIngredient({...newIngredient, unit: e.target.value})} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white">
                  {UNIT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
<div>
  <label className="block text-sm font-semibold text-gray-300 mb-1">Initial Stock</label>
  <input
    type="number"
    value={newIngredient.current_stock}
    onChange={e => setNewIngredient({...newIngredient, current_stock: parseFloat(e.target.value) || 0})}
    className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white"
  />
</div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1">Low Stock Alert Threshold</label>
                <input type="number" value={newIngredient.min_stock_threshold} onChange={e => setNewIngredient({...newIngredient, min_stock_threshold: parseFloat(e.target.value) || 0})} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1">Category</label>
                <select value={newIngredient.category} onChange={e => setNewIngredient({...newIngredient, category: e.target.value})} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white">
  {allCategories.map(cat => <option key={cat} value={cat} className="bg-black">{cat}</option>)}
</select>
              </div>
            </div>
            <div className="p-5 border-t border-white/20 flex justify-end gap-3">
              <button onClick={() => setShowAddIngredient(false)} className="px-5 py-2 rounded-xl bg-white/10 text-white font-semibold">Cancel</button>
              <button onClick={addIngredient} className="px-5 py-2 rounded-xl bg-white text-black font-semibold">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Adjust Stock Modal ── */}
      {showAdjustStock && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowAdjustStock(null)}>
          <div className="bg-black border border-white/20 rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/20">
              <h2 className="text-lg font-bold text-white">Adjust Stock</h2>
              <p className="text-sm text-gray-400">{ingredients.find(i => i.id === showAdjustStock)?.name}</p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1">
                  {(() => { const ing = ingredients.find(i => i.id === showAdjustStock); return ing?.unit_size ? `Number of ${ing.container_unit ? ing.container_unit + 's' : 'containers'} to Add/Remove` : `Amount (+/-) in ${ing?.unit || 'units'}`; })()}
                </label>
                <input type="number" value={adjustAmount === 0 ? '' : adjustAmount} onChange={e => setAdjustAmount(e.target.value === '' ? 0 : parseFloat(e.target.value))} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white" placeholder="Positive to add, negative to remove" />
                {(() => {
                  const ing = ingredients.find(i => i.id === showAdjustStock);
                  if (!ing || !ing.unit_size || adjustAmount === 0 || isNaN(adjustAmount)) return null;
                  const raw = adjustAmount * ing.unit_size;
                  const currentPacks = Math.floor((ing.current_stock ?? 0) / ing.unit_size);
                  return (
                    <div className="text-xs text-gray-400 mt-2 p-2 bg-white/5 rounded">
                      <div>📦 Current: {currentPacks} packs ({ing.current_stock} {ing.unit})</div>
                      <div>➕ Adding: {adjustAmount} packs ({raw} {ing.unit})</div>
                      <div>✨ New total: <span className="text-white font-semibold">{currentPacks + adjustAmount} packs ({ing.current_stock + raw} {ing.unit})</span></div>
                    </div>
                  );
                })()}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1">Reason</label>
                <select value={adjustReason} onChange={e => setAdjustReason(e.target.value)} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white">
                  <option value="manual_adjustment">Manual Adjustment</option>
                  <option value="restock">Restock</option>
                  <option value="wastage">Wastage</option>
                  <option value="damage">Damaged Goods</option>
                </select>
              </div>
            </div>
            <div className="p-5 border-t border-white/20 flex justify-end gap-3">
              <button onClick={() => { setShowAdjustStock(null); setAdjustAmount(0); }} className="px-5 py-2 rounded-xl bg-white/10 text-white font-semibold">Cancel</button>
              <button onClick={() => adjustStock(showAdjustStock)} className="px-5 py-2 rounded-xl bg-white text-black font-semibold">Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Recipe Modal ── */}
{showAddRecipe && (
  <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowAddRecipe(false)}>
    <div className="bg-black border border-white/20 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
      <div className="p-5 border-b border-white/20">
        <h2 className="text-lg font-bold text-white">Add Recipe</h2>
        <p className="text-xs text-gray-400 mt-1">Select a menu item then add all ingredients at once</p>
      </div>
      <div className="p-5 space-y-4 overflow-y-auto flex-1">
        {/* Menu Item + Size */}
<div>
          <label className="block text-sm font-semibold text-gray-300 mb-1">Menu Item</label>
<select 
  value={newRecipe.menu_item_id} 
  onChange={e => setNewRecipe({...newRecipe, menu_item_id: e.target.value})}
  className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white"
>
  <option value="">Select a menu item...</option>
  {menuItems.map(item => (
    <option key={item.id} value={item.id} className="bg-black">
      {item.name} ({item.category})
    </option>
  ))}
</select>
        </div>

        {/* Ingredient rows */}
        <div>

<div className="grid grid-cols-[1fr_55px_75px_45px_32px] gap-2 px-1 mb-1">
  <span className="text-xs text-gray-600 uppercase">Name</span>
  <span className="text-xs text-gray-600 uppercase text-center">Size</span>
  <span className="text-xs text-gray-600 uppercase text-center">Qty</span>
  <span className="text-xs text-gray-600 uppercase text-center">Unit</span>
  <span></span>
</div>

{editableRows.map((row, idx) => {
  const isPacking = ingredients.find(i => i.id === row.ingredient_id)?.category === 'Packaging Supplies';
  return !row._deleted && (
  <div key={idx} className={`flex gap-2 items-center rounded-xl px-3 py-2 border mb-2 ${isPacking ? 'bg-yellow-900/10 border-yellow-900/30' : 'bg-white/5 border-white/10'}`}>

{isPacking && (
<select value={row.slot || 4} onChange={e => {
  const newSlot = parseInt(e.target.value);
  updateEditableRow(idx, 'slot', newSlot);
const defaults: Record<number, string[]> = {
  4: ['u cup', 'regular u cup'],
  5: ['hard cup'],
  6: ['dabba cup'],
7: ['hot coffee cup'],
  8: ['boba straw 21', 'thin straw', 'thin coffee straw'],
9: ['bag', 'takeout', 'stirrer'],
};
  const keywords = defaults[newSlot] || [];
  const match = ingredients.find(i =>
    i.category === 'Packaging Supplies' &&
    keywords.some(kw => i.name.toLowerCase().includes(kw))
  );
  if (match) updateEditableRow(idx, 'ingredient_id', match.id);
}}
  className="w-20 shrink-0 bg-black border border-yellow-900/50 rounded-lg px-2 py-1.5 text-xs text-yellow-300 focus:outline-none">
<option value={4} className="bg-black">Regular</option>
<option value={5} className="bg-black">Large</option>
<option value={6} className="bg-black">Cold</option>
<option value={7} className="bg-black">Hot</option>
<option value={9} className="bg-black">Others</option>
</select>
)}
<select value={row.ingredient_id} onChange={e => updateEditableRow(idx, 'ingredient_id', e.target.value)}
  className="flex-1 min-w-[160px] bg-black border border-white/20 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none">
  {(isPacking
? ingredients
    .filter(i => i.category === 'Packaging Supplies')
.filter(i => {
  const n = i.name.toLowerCase();
if (row.slot === 4) return n.includes('u cup');
if (row.slot === 5) return n.includes('hard cup');
if (row.slot === 6) return n.includes('dabba');
if (row.slot === 7) return n.includes('hot coffee cup');
if (row.slot === 9) return n.includes('straw') || n.includes('bag') || n.includes('takeout') || n.includes('paper') || n.includes('film');
return true;
})
    : ingredients.filter(i => i.category !== 'Packaging Supplies')
  ).map(ing => <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit === 'pieces' ? 'pc' : ing.unit})</option>)}
</select>
{!isPacking && (
  <select value={row.size} onChange={e => updateEditableRow(idx, 'size', e.target.value)}
    className="w-16 shrink-0 bg-black border border-white/20 rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none">
    <option value="R" className="bg-black">R</option>
    <option value="L" className="bg-black">L</option>
  </select>
)}
                <input type="number" min="0" step="any" value={row.quantity}
  onChange={e => updateEditableRow(idx, 'quantity', parseFloat(e.target.value) || 0)}
  className="w-20 shrink-0 bg-black border border-white/20 rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none" />
<span className="text-xs text-gray-400 text-center font-mono w-12 shrink-0">
  {(() => { const u = ingredients.find(i => i.id === row.ingredient_id)?.unit || '—'; return u === 'pieces' ? 'pc' : u; })()}
</span>
<button onClick={() => markRowDeleted(idx)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-900/30">×</button>
              </div>
            )
          })}
        <div className="flex gap-2">
          <button onClick={() => setEditableRows(prev => [...prev, {
            id: null, ingredient_id: ingredients.find(i => i.category !== 'Packaging Supplies')?.id || '', quantity: 1, size: 'R', _isNew: true, _deleted: false,
          }])} className="flex-1 py-2 rounded-xl border border-dashed border-white/20 text-gray-400 hover:text-white text-sm font-semibold transition-colors">
            + Add Ingredient
          </button>
          <button onClick={() => setEditableRows(prev => [...prev, {
            id: null, ingredient_id: ingredients.find(i => i.category === 'Packaging Supplies')?.id || '', quantity: 1, size: 'R', slot: 4, _isNew: true, _deleted: false,
          }])} className="flex-1 py-2 rounded-xl border border-dashed border-yellow-900/40 text-yellow-600 hover:text-yellow-400 text-sm font-semibold transition-colors">
            + Add Packaging
          </button>
        </div>
        </div>
      </div>

      <div className="p-5 border-t border-white/20 flex justify-between items-center">
        <span className="text-xs text-gray-500">{editableRows.filter(r => !r._deleted).length} ingredient(s)</span>
        <div className="flex gap-3">
          <button onClick={() => { setShowAddRecipe(false); setEditableRows([]); }}
            className="px-5 py-2 rounded-xl bg-white/10 text-white font-semibold">Cancel</button>
          <button
            disabled={!newRecipe.menu_item_id || editableRows.filter(r => !r._deleted).length === 0}
            onClick={async () => {
              if (!newRecipe.menu_item_id) { alert('Select a menu item'); return; }
              const rows = editableRows.filter(r => !r._deleted && r.ingredient_id && r.quantity > 0);
              if (rows.length === 0) { alert('Add at least one ingredient'); return; }
for (const row of rows) {
  const { error } = await supabase.from('recipes').insert([{
    menu_item_id: newRecipe.menu_item_id,
    ingredient_id: row.ingredient_id,
    quantity: row.quantity,
    size: row.size,  // ← use each row's own size
    slot: getSlotString(row.slot),
  }]);
                if (error) { alert('Error: ' + error.message); return; }
              }
setShowAddRecipe(false);
              setEditableRows([]);
              setNewRecipe({ menu_item_id: '', ingredient_id: '', quantity: 0, size: 'R' });
              await Promise.all([loadRecipes(), loadIngredients()]);
            }}
            className="px-5 py-2 rounded-xl bg-white text-black font-semibold hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed">
            Save All
          </button>
        </div>
      </div>
    </div>
  </div>
)}

      {/* ── Edit Ingredient Modal ── */}
      {editingIngredient && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setEditingIngredient(null)}>
          <div className="bg-black border border-white/20 rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/20"><h2 className="text-lg font-bold text-white">Edit Ingredient</h2></div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1">Ingredient Name</label>
                <input value={editingIngredient.name} onChange={e => setEditingIngredient({...editingIngredient, name: e.target.value})} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1">Unit of Measurement</label>
                <select value={editingIngredient.unit} onChange={e => setEditingIngredient({...editingIngredient, unit: e.target.value})} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white">
                  {UNIT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1">Low Stock Alert Threshold</label>
                <input type="number" value={editingIngredient.min_stock_threshold ?? ''} onChange={e => setEditingIngredient({...editingIngredient, min_stock_threshold: parseFloat(e.target.value)})} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1">Category</label>
                <input list="cat-list-edit" value={editingIngredient.category} onChange={e => setEditingIngredient({...editingIngredient, category: e.target.value})} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white" />
                <datalist id="cat-list-edit">{allCategories.map(cat => <option key={cat} value={cat} />)}</datalist>
              </div>
            </div>
            <div className="p-5 border-t border-white/20 flex justify-end gap-3">
              <button onClick={() => setEditingIngredient(null)} className="px-5 py-2 rounded-xl bg-white/10 text-white font-semibold">Cancel</button>
              <button onClick={updateIngredient} className="px-5 py-2 rounded-xl bg-white text-black font-semibold">Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
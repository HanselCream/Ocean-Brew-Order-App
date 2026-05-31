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
  'Syrups & Fruit Bases',
  'Coffee Ingredients',
  'Packaging Supplies',
  'Food Supplies',
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
  const [drinksLeft, setDrinksLeft] = useState<Record<string, number>>({});
  const [usedDateRange, setUsedDateRange] = useState<DateRange>('30days');

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
    *, slot, menu_items:menu_item_id (name), ingredients:ingredient_id (name)
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
      .order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    setStockLogs((data || []).map((l: any) => ({ ...l, ingredient_name: l.ingredients?.name })));
  };

  const loadMenuItems = async () => {
    const { data, error } = await supabase.from('menu_items')
      .select('id, name, category').neq('category', 'Add Ons').order('name');
    if (error) throw error;
    setMenuItems(data || []);
  };

  const calculateDrinksLeft = async () => {
    const drinks: Record<string, number> = {};
    for (const menuItem of menuItems) {
const { data: recipeData, error } = await supabase.from('recipes')
  .select(`quantity, ingredient_id, ingredients (current_stock)`)
  .eq('menu_item_id', menuItem.id)
  .eq('size', 'R');  // use Regular as default for drinks-left estimate
      if (error) continue;
      if (!recipeData || recipeData.length === 0) { drinks[menuItem.id] = 999; continue; }
      let maxDrinks = Infinity;
      for (const recipe of recipeData) {
        const stock = (recipe.ingredients as any)?.current_stock || 0;
        const possible = Math.floor(stock / recipe.quantity);
        maxDrinks = Math.min(maxDrinks, possible);
      }
      drinks[menuItem.id] = maxDrinks === Infinity ? 999 : maxDrinks;
    }
    setDrinksLeft(drinks);
  };

  const deductStockForOrder = async (orderItems: any[], orderId: string) => {
    for (const orderItem of orderItems) {
const size = orderItem.customization?.size || 'R';
const { data: recipeData } = await supabase.from('recipes')
  .select(`*, ingredients:ingredient_id (*)`)
  .eq('menu_item_id', orderItem.menuItemId)
  .eq('size', size);
      for (const recipe of recipeData || []) {
        const ingredient = recipe.ingredients;
        const quantityNeeded = recipe.quantity * orderItem.quantity;
        const newStock = ingredient.current_stock - quantityNeeded;
        await supabase.from('ingredients')
          .update({ current_stock: Math.max(0, newStock), updated_at: new Date().toISOString() })
          .eq('id', ingredient.id);
        await supabase.from('stock_logs').insert([{
          ingredient_id: ingredient.id, previous_stock: ingredient.current_stock,
          new_stock: Math.max(0, newStock), quantity_change: -quantityNeeded,
          reason: 'order', reference_id: orderId,
        }]);
      }
    }
    await loadIngredients(); await loadStockLogs(); await calculateDrinksLeft();
  };

  const loadAllData = async () => {
    setLoading(true);
    try {
      await loadIngredients(); await loadRecipes();
      await loadStockLogs(); await loadMenuItems();
      await calculateDrinksLeft();
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
    await loadIngredients(); await loadStockLogs();
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
  cup_r: 4, cup_l: 5, straw_r: 6, straw_l: 7, others: 8,
};
const slot = isPacking
  ? (dbSlot ? slotNumMap[dbSlot] ?? 4 : 4)
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
            4: 'cup_r', 5: 'cup_l', 6: 'straw_r', 7: 'straw_l', 8: 'others',
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

  useEffect(() => {
    (window as any).deductStockForOrder = deductStockForOrder;
    return () => { delete (window as any).deductStockForOrder; };
  }, [ingredients]);

useEffect(() => { loadAllData(); }, []);

  useEffect(() => {
    if (menuItems.length > 0) calculateDrinksLeft();
  }, [menuItems]);

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
    const sinceDate = getDateFilter(usedDateRange);
    stockLogs.forEach(log => {
      if (log.reason === 'order' && log.quantity_change < 0) {
        if (sinceDate && new Date(log.created_at) < sinceDate) return;
        map[log.ingredient_id] = (map[log.ingredient_id] || 0) + Math.abs(log.quantity_change);
      }
    });
    return map;
  }, [stockLogs, usedDateRange]);

  const lowStockIngredients = ingredients.filter(ing => {
    const pc = ing.unit_size ? Math.floor(ing.current_stock / ing.unit_size) : null;
    return pc !== null ? pc <= ing.min_stock_threshold : ing.current_stock <= ing.min_stock_threshold;
  });

  const filteredIngredients = ingredients.filter(ing => {
    const matchesSearch = ing.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || ing.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const menuCategories = useMemo(() => {
    const cats = new Set(menuItems.map(item => item.category).filter(Boolean));
    return ['All', ...Array.from(cats).sort()];
  }, [menuItems]);

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
    const menuItemObj = menuItems.find(m => m.id === menuItemId);
    const category = menuItemObj?.category || '';

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
const packing_supplies = packingRows
  .filter(r => r.slot === 'cup_r' || r.slot === 'cup_l')
  .map(r => getIngName(r)).join('\n');
const other_supplies = packingRows
  .filter(r => r.slot === 'straw_r' || r.slot === 'straw_l' || r.slot === 'others' || !r.slot)
  .map(r => getIngName(r)).join('\n');
result.push({ menuItemId, menuItemName, category, ingSlots, packing_supplies, other_supplies });
  });

  return result.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.menuItemName.localeCompare(b.menuItemName);
  });
}, [recipes, ingredients, menuItems]);

const filteredPivotedRecipes = useMemo(() => {
  let filtered = pivotedRecipes;
  if (recipeSearchTerm) filtered = filtered.filter(row => row.menuItemName.toLowerCase().includes(recipeSearchTerm.toLowerCase()));
  if (recipeCategoryFilter !== 'All') filtered = filtered.filter(row => row.category === recipeCategoryFilter);
  return filtered;
}, [pivotedRecipes, recipeSearchTerm, recipeCategoryFilter]);

const maxIngSlots = useMemo(() => {
  return Math.max(1, ...filteredPivotedRecipes.map(r => r.ingSlots.length));
}, [filteredPivotedRecipes]);

  if (loading) return <div className="flex-1 p-8 bg-black text-white">Loading inventory...</div>;

  return (
    <div className="flex-1 p-6 overflow-y-auto bg-black">
      {/* Header */}
<div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventory Management</h1>
          <p className="text-sm text-gray-400 mt-1">{lowStockIngredients.length} items low on stock</p>
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
      {/* Low Stock Alert */}
      {lowStockIngredients.length > 0 && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-red-400 text-lg">⚠️</span>
            <span className="font-semibold text-red-400">Low Stock Alert</span>
          </div>
          <div className="flex flex-wrap gap-2">
           {lowStockIngredients.map(ing => (
              <span key={ing.id} className="px-3 py-1 bg-red-900/50 rounded-lg text-sm text-red-300">
                {ing.name}: {(() => {
                  const pc = ing.unit_size ? Math.floor(ing.current_stock / ing.unit_size) : null;
                  return pc !== null ? `${pc}${ing.container_unit ? ' ' + ing.container_unit : ''}` : `${ing.current_stock} ${ing.unit}`;
                })()} left
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Drinks Left */}
      <div className="mb-6 p-4 bg-white/5 border border-white/10 rounded-xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-white">🍹 Drinks Left (based on current stock)</h3>
          <button onClick={calculateDrinksLeft} className="text-xs text-gray-400 hover:text-white">🔄 Refresh</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-48 overflow-y-auto">
          {Object.entries(drinksLeft).filter(([,count]) => count < 50).slice(0, 12).map(([itemId, count]) => {
            const menuItem = menuItems.find(m => m.id === itemId);
            if (!menuItem) return null;
            return (
              <div key={itemId} className={`px-3 py-2 rounded-lg text-center ${count < 10 ? 'bg-red-900/30 border border-red-800' : 'bg-white/5'}`}>
                <div className="text-xs text-gray-400 truncate">{menuItem.name}</div>
                <div className={`text-lg font-bold ${count < 10 ? 'text-red-400' : 'text-white'}`}>{count === 999 ? '∞' : count}</div>
                <div className="text-xs text-gray-500">left</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-white/10">
        {(['ingredients','recipes','logs'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 font-semibold transition-colors capitalize ${activeTab === tab ? 'text-white border-b-2 border-white' : 'text-gray-400 hover:text-white'}`}>
            {tab === 'ingredients' ? `📦 Ingredients (${ingredients.length})` : tab === 'recipes' ? `📋 Recipes (${recipes.length})` : '📜 Stock Logs'}
          </button>
        ))}
      </div>

      {/* ── INGREDIENTS TAB ── */}
      {activeTab === 'ingredients' && (
        <>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <input type="text" placeholder="Search ingredients..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-white/50 w-56" />
<div className="flex flex-wrap gap-2">
              {['All', ...INGREDIENT_CATEGORIES].map(cat => (
                <button key={cat} onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    categoryFilter === cat
                      ? 'bg-white text-black'
                      : 'bg-white/10 text-gray-300 hover:bg-white/20'
                  }`}>
                  {cat === 'All' ? 'All' : cat}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm text-gray-400">Used period:</span>
              <select value={usedDateRange} onChange={e => setUsedDateRange(e.target.value as DateRange)}
                className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-sm focus:outline-none">
                {DATE_RANGE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
            <button onClick={() => setShowAddIngredient(true)} className="px-5 py-2 rounded-xl bg-white text-black font-semibold hover:bg-gray-200">
              + Add Ingredient
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
                  <th className="px-4 py-3 text-right">Used ({DATE_RANGE_OPTIONS.find(o => o.value === usedDateRange)?.label})</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredIngredients.map(ing => {
                  const packCount = ing.unit_size ? Math.floor(ing.current_stock / ing.unit_size) : null;
                  const displayStock = packCount !== null ? `${packCount}${ing.container_unit ? ' ' + ing.container_unit : ''}` : `${ing.current_stock.toLocaleString()} ${ing.unit}`;
                  const isLowStock = packCount !== null ? packCount <= ing.min_stock_threshold : ing.current_stock <= ing.min_stock_threshold;
                  const usedAmount = usedStockFiltered[ing.id] || 0;
const usedDisplay = usedAmount > 0
  ? (packCount !== null 
    ? `${Math.floor(usedAmount / ing.unit_size!)} ${ing.container_unit ? ing.container_unit + 's' : ing.unit}` 
    : `${usedAmount.toLocaleString()} ${ing.unit}`) 
  : '—';
const thresholdDisplay = packCount !== null 
  ? `${ing.min_stock_threshold} ${ing.container_unit ? ing.container_unit + 's' : ing.unit}` 
  : `${ing.min_stock_threshold} ${ing.unit}`;                  return (
                    <tr key={ing.id} className="border-t border-white/10 hover:bg-white/5">
                      <td className="px-4 py-3 text-gray-400 text-sm">{ing.category}</td>
                      <td className="px-4 py-3 font-medium text-white">{ing.name}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-semibold ${isLowStock ? 'text-red-400' : 'text-white'}`}>{displayStock}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-300">{ing.current_stock.toLocaleString()} {ing.unit}</td>
                      <td className="px-4 py-3 text-right text-gray-400">{usedDisplay}</td>
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
<div className="flex flex-col gap-3 mb-4">
  {/* Row 1: Search + category buttons */}
  <div className="flex items-center gap-3 flex-wrap">
    <input
      type="text"
      placeholder="Search recipes..."
      value={recipeSearchTerm}
      onChange={e => setRecipeSearchTerm(e.target.value)}
      className="px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-white/50 w-56"
    />
    <div className="flex flex-wrap gap-2">
      {menuCategories.map(cat => (
        <button key={cat} onClick={() => setRecipeCategoryFilter(cat)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
            recipeCategoryFilter === cat
              ? 'bg-white text-black'
              : 'bg-white/10 text-gray-300 hover:bg-white/20'
          }`}>
          {cat === 'All' ? 'All' : cat}
        </button>
      ))}
    </div>
  </div>
  {/* Row 2: count + Add button */}
  <div className="flex items-center justify-between">
    <span className="text-xs text-gray-500">
      {filteredPivotedRecipes.length} recipes
      {recipeCategoryFilter !== 'All' && ` in ${recipeCategoryFilter}`}
    </span>
    <button onClick={() => { setShowAddRecipe(true); setEditableRows([{ id: null, ingredient_id: ingredients[0]?.id || '', quantity: 1, size: 'R', _isNew: true, _deleted: false }]); }}
      className="px-5 py-2 rounded-xl bg-white text-black font-semibold hover:bg-gray-200">
      + Add Recipe
    </button>
  </div>
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
      {row.ingSlots.map((slot: any, i: number) => (
        <div key={i} className="whitespace-nowrap">
          <span className="text-gray-300">{slot.name}</span>
          {slot.qty_r != null && <span className="text-white ml-1">{slot.qty_r}{slot.unit}</span>}
          {slot.qty_l != null && <span className="text-gray-400 ml-1">/ {slot.qty_l}{slot.unit}</span>}
        </div>
      ))}
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
  <td className="px-4 py-3 font-medium text-white">{log.ingredient_name}</td>
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
  <input type="number" min="0" step="any" value={row.quantity}
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
<div key={actualIdx} className="grid grid-cols-[70px_1fr_75px_45px_32px] gap-2 items-center bg-yellow-900/10 rounded-xl px-3 py-2 border border-yellow-900/30 mb-2">
      <select value={row.slot || 4} onChange={e => {
        const newSlot = parseInt(e.target.value);
        updateEditableRow(actualIdx, 'slot', newSlot);
        updateEditableRow(actualIdx, 'size', (newSlot === 5 || newSlot === 7) ? 'L' : 'R');
      }}
        className="w-full bg-black border border-yellow-900/50 rounded-lg px-2 py-1.5 text-xs text-yellow-300 focus:outline-none">
<option value={4} className="bg-black">Packaging Supplies</option>
<option value={8} className="bg-black">Other Supplies</option>
      </select>
<select value={row.ingredient_id} onChange={e => updateEditableRow(actualIdx, 'ingredient_id', e.target.value)}
  className="w-full bg-black border border-white/20 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-white/50">
  {ingredients
    .filter(i => i.category === 'Packaging Supplies')
.filter(() => true)
    .map(ing => (
      <option key={ing.id} value={ing.id} className="bg-black">{ing.name} ({ing.unit})</option>
    ))}
</select>
      <input type="number" min="0" step="any" value={row.quantity}
        onChange={e => updateEditableRow(actualIdx, 'quantity', parseFloat(e.target.value) || 0)}
        className="w-full bg-black border border-white/20 rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-white/50" />
      <span className="text-xs text-gray-400 text-center font-mono">{selectedIngredient?.unit || '—'}</span>
      <button onClick={() => markRowDeleted(actualIdx)}
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
              <div className="bg-white/5 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-2">📦 Optional: If this item comes in packs/bottles</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1">Size per pack</label>
                    <input type="number" value={newIngredient.unit_size || ''} onChange={e => setNewIngredient({...newIngredient, unit_size: e.target.value ? parseFloat(e.target.value) : null})} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white" placeholder="e.g., 500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1">Pack name</label>
                    <input value={newIngredient.container_unit || ''} onChange={e => setNewIngredient({...newIngredient, container_unit: e.target.value})} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white" placeholder="bottle, pack, sachet" />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1">Initial Stock</label>
                <input type="number" value={newIngredient.current_stock} onChange={e => setNewIngredient({...newIngredient, current_stock: parseFloat(e.target.value)})} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1">Low Stock Alert Threshold</label>
                <input type="number" value={newIngredient.min_stock_threshold} onChange={e => setNewIngredient({...newIngredient, min_stock_threshold: parseFloat(e.target.value)})} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1">Category</label>
                <input list="cat-list-add" value={newIngredient.category} onChange={e => setNewIngredient({...newIngredient, category: e.target.value})} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white" />
                <datalist id="cat-list-add">{allCategories.map(cat => <option key={cat} value={cat} />)}</datalist>
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
          <select value={newRecipe.menu_item_id} onChange={e => setNewRecipe({...newRecipe, menu_item_id: e.target.value})}
            className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white">
            <option value="">Select menu item...</option>
            {menuItems
              .filter(item => !['Supplies','Merchandise','Add Ons'].includes(item.category))
              .map(item => <option key={item.id} value={item.id}>{item.name} ({item.category})</option>)}
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
  <select value={row.slot || 8} onChange={e => {
    const newSlot = parseInt(e.target.value);
    updateEditableRow(idx, 'slot', newSlot);
    updateEditableRow(idx, 'size', (newSlot === 5 || newSlot === 7) ? 'L' : 'R');
  }}
    className="w-20 shrink-0 bg-black border border-yellow-900/50 rounded-lg px-2 py-1.5 text-xs text-yellow-300 focus:outline-none">
<option value={4} className="bg-black">Packaging Supplies</option>
<option value={8} className="bg-black">Other Supplies</option>
  </select>
)}
<select value={row.ingredient_id} onChange={e => updateEditableRow(idx, 'ingredient_id', e.target.value)}
  className="flex-1 min-w-[160px] bg-black border border-white/20 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none">
  {(isPacking
    ? ingredients
        .filter(i => i.category === 'Packaging Supplies')
.filter(() => true)
    : ingredients.filter(i => i.category !== 'Packaging Supplies')
  ).map(ing => <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>)}
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
  {ingredients.find(i => i.id === row.ingredient_id)?.unit || '—'}
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
              <div className="bg-white/5 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-2">📦 If this item comes in packs/bottles</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1">Size per pack</label>
                    <input type="number" value={editingIngredient.unit_size ?? ''} onChange={e => setEditingIngredient({...editingIngredient, unit_size: e.target.value ? parseFloat(e.target.value) : null})} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1">Pack name</label>
                    <input value={editingIngredient.container_unit ?? ''} onChange={e => setEditingIngredient({...editingIngredient, container_unit: e.target.value})} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white" />
                  </div>
                </div>
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
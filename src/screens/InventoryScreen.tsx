'use client';

import { useState, useEffect, useMemo } from 'react';
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
  size: string;  // ← ADD THIS
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

const INGREDIENT_CATEGORIES = [
  'Milktea Ingredients',
  'Syrups & Fruit Bases',
  'Coffee Ingredients',
  'Packaging Supplies',
  'Food Supplies',
];

// Simplified unit options (removed shots, cups)
const UNIT_OPTIONS = [
  { value: 'pieces', label: 'Pieces (pc)', example: 'cups, straws, bags' },
  { value: 'grams', label: 'Grams (g)', example: 'powder, creamer' },
  { value: 'ml', label: 'Milliliters (ml)', example: 'syrup, fructose' },
  { value: 'kg', label: 'Kilograms (kg)', example: 'bulk ingredients' },
  { value: 'L', label: 'Liters (L)', example: 'milk, sauce' },
];

// Date filter options
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
  
  // New ingredient form
  const [newIngredient, setNewIngredient] = useState({
    name: '',
    unit: 'pieces',
    unit_size: null as number | null,
    container_unit: '',
    current_stock: 0,
    min_stock_threshold: 10,
    category: 'General'
  });
  
  // Stock adjustment
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [adjustReason, setAdjustReason] = useState('manual_adjustment');
  
  // New recipe form
  const [newRecipe, setNewRecipe] = useState({
    menu_item_id: '',
    ingredient_id: '',
    quantity: 0,
    size: 'R'
  });

  // Recipe search and edit states
  const [recipeSearchTerm, setRecipeSearchTerm] = useState('');
  const [recipeCategoryFilter, setRecipeCategoryFilter] = useState('All');
  const [showEditRecipe, setShowEditRecipe] = useState<Recipe | null>(null);
  const [editRecipeData, setEditRecipeData] = useState({ quantity: 0, size: 'R' });

  // ============================================
  // LOAD FUNCTIONS
  // ============================================

  const loadIngredients = async () => {
    const { data, error } = await supabase
      .from('ingredients')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw error;
    setIngredients(data || []);
  };

  const loadRecipes = async () => {
    const { data, error } = await supabase
      .from('recipes')
      .select(`
        *,
        menu_items:menu_item_id (name),
        ingredients:ingredient_id (name)
      `);
    
    if (error) throw error;
    
    const formattedRecipes = (data || []).map((recipe: any) => ({
      ...recipe,
      menu_item_name: recipe.menu_items?.name,
      ingredient_name: recipe.ingredients?.name
    }));
    setRecipes(formattedRecipes);
  };

  const loadStockLogs = async () => {
    const { data, error } = await supabase
      .from('stock_logs')
      .select(`
        *,
        ingredients:ingredient_id (name)
      `)
      .order('created_at', { ascending: false })
      .limit(200);
    
    if (error) throw error;
    
    const formattedLogs = (data || []).map((log: any) => ({
      ...log,
      ingredient_name: log.ingredients?.name
    }));
    setStockLogs(formattedLogs);
  };

  const loadMenuItems = async () => {
    const { data, error } = await supabase
      .from('menu_items')
      .select('id, name, category')
      .neq('category', 'Add Ons')
      .order('name');
    
    if (error) throw error;
    setMenuItems(data || []);
  };

  // ============================================
  // CALCULATE DRINKS LEFT
  // ============================================
  const calculateDrinksLeft = async () => {
    console.log('📊 Calculating drinks left...');
    const drinks: Record<string, number> = {};
    
    for (const menuItem of menuItems) {
      const { data: recipeData, error } = await supabase
        .from('recipes')
        .select(`
          quantity,
          ingredient_id,
          ingredients (current_stock)
        `)
        .eq('menu_item_id', menuItem.id);
      
      if (error) {
        console.error('Error fetching recipe for', menuItem.name, error);
        continue;
      }
      
      if (!recipeData || recipeData.length === 0) {
        drinks[menuItem.id] = 999;
        continue;
      }
      
      let maxDrinks = Infinity;
      for (const recipe of recipeData) {
        const stock = (recipe.ingredients as any)?.current_stock || 0;
        const needed = recipe.quantity;
        const possible = Math.floor(stock / needed);
        maxDrinks = Math.min(maxDrinks, possible);
      }
      
      drinks[menuItem.id] = maxDrinks === Infinity ? 999 : maxDrinks;
    }
    
    setDrinksLeft(drinks);
  };

  // ============================================
  // AUTO-DEDUCT STOCK (exposed for order screen)
  // ============================================
  const deductStockForOrder = async (orderItems: any[], orderId: string) => {
    console.log('🔍 Deducting stock for order:', orderId);
    
    for (const orderItem of orderItems) {
      const { data: recipeData } = await supabase
        .from('recipes')
        .select(`*, ingredients:ingredient_id (*)`)
        .eq('menu_item_id', orderItem.menuItemId);
      
      for (const recipe of recipeData || []) {
        const ingredient = recipe.ingredients;
        const quantityNeeded = recipe.quantity * orderItem.quantity;
        const newStock = ingredient.current_stock - quantityNeeded;
        
        await supabase
          .from('ingredients')
          .update({ current_stock: Math.max(0, newStock), updated_at: new Date().toISOString() })
          .eq('id', ingredient.id);
        
        await supabase.from('stock_logs').insert([{
          ingredient_id: ingredient.id,
          previous_stock: ingredient.current_stock,
          new_stock: Math.max(0, newStock),
          quantity_change: -quantityNeeded,
          reason: 'order',
          reference_id: orderId
        }]);
      }
    }
    await loadIngredients();
    await loadStockLogs();
    await calculateDrinksLeft();
  };

  // ============================================
  // MAIN LOAD FUNCTION
  // ============================================
  const loadAllData = async () => {
    setLoading(true);
    try {
      await loadIngredients();
      await loadRecipes();
      await loadStockLogs();
      await loadMenuItems();
      await calculateDrinksLeft();
    } catch (error) {
      console.error('Error loading inventory data:', error);
      alert('Failed to load inventory data');
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // CRUD OPERATIONS
  // ============================================

  const addIngredient = async () => {
    if (!newIngredient.name.trim()) {
      alert('Please enter ingredient name');
      return;
    }
    
    const { error } = await supabase
      .from('ingredients')
      .insert([newIngredient]);
    
    if (error) {
      alert('Error adding ingredient: ' + error.message);
      return;
    }
    
    setShowAddIngredient(false);
    setNewIngredient({
      name: '',
      unit: 'pieces',
      unit_size: null,
      container_unit: '',
      current_stock: 0,
      min_stock_threshold: 10,
      category: 'General'
    });
    await loadIngredients();
  };

  const updateIngredient = async () => {
    if (!editingIngredient) return;
    
    const { error } = await supabase
      .from('ingredients')
      .update({
        name: editingIngredient.name,
        unit: editingIngredient.unit,
        unit_size: editingIngredient.unit_size,
        container_unit: editingIngredient.container_unit || null,
        min_stock_threshold: editingIngredient.min_stock_threshold,
        category: editingIngredient.category,
        updated_at: new Date().toISOString()
      })
      .eq('id', editingIngredient.id);
    
    if (error) {
      alert('Error updating ingredient: ' + error.message);
      return;
    }
    setEditingIngredient(null);
    await loadIngredients();
  };

  const adjustStock = async (ingredientId: string) => {
    if (adjustAmount === 0 || isNaN(adjustAmount)) {
      alert('Please enter a valid amount');
      return;
    }
    
    const ingredient = ingredients.find(i => i.id === ingredientId);
    if (!ingredient) return;

    const rawAdjust = ingredient.unit_size ? adjustAmount * ingredient.unit_size : adjustAmount;
    const newStock = ingredient.current_stock + rawAdjust;

    if (newStock < 0) {
      alert('Stock cannot be negative!');
      return;
    }
      
    const { error: updateError } = await supabase
      .from('ingredients')
      .update({ 
        current_stock: newStock,
        updated_at: new Date().toISOString()
      })
      .eq('id', ingredientId);
      
    if (updateError) {
      alert('Error updating stock: ' + updateError.message);
      return;
    }
      
    await supabase.from('stock_logs').insert([{
      ingredient_id: ingredientId,
      previous_stock: ingredient.current_stock,
      new_stock: newStock,
      quantity_change: rawAdjust,
      reason: adjustReason,
      reference_id: 'manual_' + Date.now()
    }]);
      
    setShowAdjustStock(null);
    setAdjustAmount(0);
    await loadIngredients();
    await loadStockLogs();
  };

  const addRecipe = async () => {
    if (!newRecipe.menu_item_id || !newRecipe.ingredient_id || newRecipe.quantity <= 0) {
      alert('Please fill all recipe fields');
      return;
    }
    
    const { error } = await supabase
      .from('recipes')
      .insert([{
        menu_item_id: newRecipe.menu_item_id,
        ingredient_id: newRecipe.ingredient_id,
        quantity: newRecipe.quantity,
        size: newRecipe.size
      }]);
    
    if (error) {
      alert('Error adding recipe: ' + error.message);
      return;
    }
    
    setShowAddRecipe(false);
    setNewRecipe({
      menu_item_id: '',
      ingredient_id: '',
      quantity: 0,
      size: 'R'
    });
    loadAllData();
  };

  const deleteRecipe = async (recipeId: string) => {
    if (!confirm('Remove this recipe?')) return;
    
    const { error } = await supabase
      .from('recipes')
      .delete()
      .eq('id', recipeId);
    
    if (error) {
      alert('Error deleting recipe: ' + error.message);
      return;
    }
    
    loadAllData();
  };

  const deleteIngredient = async (ingredientId: string) => {
    const isUsed = recipes.some(r => r.ingredient_id === ingredientId);
    if (isUsed) {
      alert('Cannot delete ingredient that is used in recipes. Remove from recipes first.');
      return;
    }
    
    if (!confirm('Delete this ingredient?')) return;
    
    const { error } = await supabase
      .from('ingredients')
      .delete()
      .eq('id', ingredientId);
    
    if (error) {
      alert('Error deleting ingredient: ' + error.message);
      return;
    }
    
    loadAllData();
  };

  // ============================================
  // ADD THESE NEW FUNCTIONS HERE
  // ============================================

  // Duplicate recipe size variant (R to L or L to R)
  const duplicateSizeVariant = async (menuItemId: string, sourceSize: string, targetSize: 'R' | 'L') => {
    const sourceRecipes = recipes.filter(r => r.menu_item_id === menuItemId && r.size === sourceSize);
    
    if (sourceRecipes.length === 0) {
      alert('No recipes found to duplicate');
      return;
    }
    
    for (const recipe of sourceRecipes) {
      const { error } = await supabase
        .from('recipes')
        .insert([{
          menu_item_id: recipe.menu_item_id,
          ingredient_id: recipe.ingredient_id,
          quantity: recipe.quantity,
          size: targetSize
        }]);
      
      if (error) {
        alert('Error duplicating: ' + error.message);
        return;
      }
    }
    await loadAllData();
  };

  // Update existing recipe
  const updateRecipe = async () => {
    if (!showEditRecipe) return;
    
    const { error } = await supabase
      .from('recipes')
      .update({
        quantity: editRecipeData.quantity,
        size: editRecipeData.size
      })
      .eq('id', showEditRecipe.id);
    
    if (error) {
      alert('Error updating recipe: ' + error.message);
      return;
    }
    
    setShowEditRecipe(null);
    loadAllData();
  };

  // Delete all recipes for a specific menu item + size
  const deleteRecipeByMenuItem = async (menuItemId: string, size: string) => {
    const recipesToDelete = recipes.filter(r => r.menu_item_id === menuItemId && r.size === size);
    if (recipesToDelete.length === 0) return;
    
    if (!confirm(`Delete all recipes for "${recipesToDelete[0]?.menu_item_name} (${size})"?`)) return;
    
    for (const recipe of recipesToDelete) {
      await deleteRecipe(recipe.id);
    }
  };
  // ============================================
  // EXPORT/IMPORT
  // ============================================

  const exportIngredients = () => {
    const exportData = ingredients.map(ing => ({
      'Ingredient Name': ing.name,
      'Unit': ing.unit,
      'Current Stock': ing.current_stock,
      'Min Threshold': ing.min_stock_threshold,
      'Category': ing.category,
      'Status': (() => {
        const pc = ing.unit_size ? Math.floor(ing.current_stock / ing.unit_size) : null;
        const low = pc !== null ? pc <= ing.min_stock_threshold : ing.current_stock <= ing.min_stock_threshold;
        return ing.current_stock === 0 ? 'NO STOCK' : low ? 'LOW STOCK' : 'OK';
      })()
    }));
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ingredients');
    XLSX.writeFile(wb, `inventory_export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportRecipes = () => {
    const exportData = recipes.map(recipe => ({
      'Menu Item': recipe.menu_item_name,
      'Ingredient': recipe.ingredient_name,
      'Quantity': recipe.quantity,
      'Unit': ingredients.find(i => i.id === recipe.ingredient_id)?.unit || ''
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
          category: (row as any)['Category'] || (row as any)['category'] || 'General'
        };
        
        if (ingredient.name) {
          await supabase
            .from('ingredients')
            .upsert([ingredient], { onConflict: 'name' });
        }
      }
      
      alert('Import completed!');
      loadAllData();
    };
    reader.readAsArrayBuffer(file);
  };

  // Expose function for queue screen
  useEffect(() => {
    (window as any).deductStockForOrder = deductStockForOrder;
    return () => { delete (window as any).deductStockForOrder; };
  }, [ingredients]);

  useEffect(() => {
    loadAllData();
  }, []);

  // ============================================
  // USED STOCK CALCULATION WITH DATE FILTER
  // ============================================
  const getDateFilter = (range: DateRange): Date | null => {
    const now = new Date();
    switch (range) {
      case '7days':
        const d7 = new Date();
        d7.setDate(now.getDate() - 7);
        return d7;
      case '30days':
        const d30 = new Date();
        d30.setDate(now.getDate() - 30);
        return d30;
      case 'month':
        return new Date(now.getFullYear(), now.getMonth(), 1);
      case 'all':
        return null;
      default:
        return null;
    }
  };

  const usedStockFiltered = useMemo(() => {
    const map: Record<string, number> = {};
    const sinceDate = getDateFilter(usedDateRange);
    
    stockLogs.forEach(log => {
      if (log.reason === 'order' && log.quantity_change < 0) {
        const logDate = new Date(log.created_at);
        if (sinceDate && logDate < sinceDate) return;
        map[log.ingredient_id] = (map[log.ingredient_id] || 0) + Math.abs(log.quantity_change);
      }
    });
    return map;
  }, [stockLogs, usedDateRange]);

  // Low stock ingredients
  const lowStockIngredients = ingredients.filter(ing => {
    const pc = ing.unit_size ? Math.floor(ing.current_stock / ing.unit_size) : null;
    return pc !== null ? pc <= ing.min_stock_threshold : ing.current_stock <= ing.min_stock_threshold;
  });
  
  const filteredIngredients = ingredients.filter(ing => {
    const matchesSearch = ing.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || ing.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });
  

  // Get unique menu categories from menuItems
  const menuCategories = useMemo(() => {
    const cats = new Set(menuItems.map(item => item.category).filter(Boolean));
    return ['All', ...Array.from(cats).sort()];
  }, [menuItems]);

    // Get all unique categories for datalist (for Add/Edit Ingredient modals)
  const allCategories = Array.from(new Set([
    ...INGREDIENT_CATEGORIES,
    ...ingredients.map(i => i.category).filter(Boolean)
  ])).sort();
  
  // Pivoted recipes (unchanged)
  const pivotedRecipes = useMemo(() => {
    const POWDER_NAMES = new Set([
      'okinawa', 'hokkaido', 'uji matcha', 'taro', 'dark choco',
      'oreo', 'wintermelon', 'rock salt & cheese', 'cheesecake', 'powder',
    ]);
    const CREAMER_NAMES = new Set(['creamer']);
    const FRUCTOSE_NAMES = new Set(['fructose']);
    const CUP_NAMES = new Set([
      'hard cups 22oz', 'regular u cups 16oz', 'dabba cups 16oz',
      'hot coffee cups 12oz',
    ]);
    const STRAW_NAMES = new Set([
      'boba straw 21cm', 'boba straw 23cm',
      'thin coffee straws', 'boba straws 21cm', 'boba straws 23cm',
    ]);
    const SAUCE_NAMES = new Set([
      'condensed milk', 'caramel sauce monin',
      'dark chocolate sauce monin',
    ]);

    const classify = (name: string): 'powder' | 'creamer' | 'fructose' | 'cup' | 'straw' | 'sauce' | 'syrup' => {
      const n = name.toLowerCase().trim();
      if (POWDER_NAMES.has(n))   return 'powder';
      if (CREAMER_NAMES.has(n))  return 'creamer';
      if (FRUCTOSE_NAMES.has(n)) return 'fructose';
      if (CUP_NAMES.has(n))      return 'cup';
      if (STRAW_NAMES.has(n))    return 'straw';
      if (SAUCE_NAMES.has(n))    return 'sauce';
      return 'syrup';
    };

    const fmt = (r: Recipe) => {
      const unit = ingredients.find(i => i.id === r.ingredient_id)?.unit || '';
      return `${r.quantity} ${unit}`.trim();
    };

    const grouped: Record<string, Recipe[]> = {};
    recipes.forEach(r => {
      if (!grouped[r.menu_item_id]) grouped[r.menu_item_id] = [];
      grouped[r.menu_item_id].push(r);
    });

    const result: any[] = [];

    Object.entries(grouped).forEach(([menuItemId, rows]) => {
      const menuItem = rows[0]?.menu_item_name || '';
      const cupRows = rows.filter(r => classify(r.ingredient_name || '') === 'cup');

      if (cupRows.length === 0) {
        const pivot = buildPivotRow(menuItemId, menuItem, '', rows);
        result.push(pivot);
        return;
      }

      const sizeGroups: Record<string, string> = {};
      cupRows.forEach(c => {
        const cupName = (c.ingredient_name || '').toLowerCase();
        if (cupName.includes('hard cups')) sizeGroups[c.ingredient_id] = 'L';
        else if (cupName.includes('regular') || cupName.includes('dabba') || cupName.includes('hot coffee')) sizeGroups[c.ingredient_id] = 'R';
      });

      const uniqueSizes = Array.from(new Set(Object.values(sizeGroups)));

      if (uniqueSizes.length <= 1) {
        const size = uniqueSizes[0] || '';
        const pivot = buildPivotRow(menuItemId, menuItem, size, rows);
        result.push(pivot);
      } else {
        const rCupIds = new Set(Object.entries(sizeGroups).filter(([, s]) => s === 'R').map(([id]) => id));
        const lCupIds = new Set(Object.entries(sizeGroups).filter(([, s]) => s === 'L').map(([id]) => id));
        const rRows: Recipe[] = [];
        const lRows: Recipe[] = [];

        rows.forEach(r => {
          const type = classify(r.ingredient_name || '');
          if (type === 'cup') {
            if (rCupIds.has(r.ingredient_id)) rRows.push(r);
            else if (lCupIds.has(r.ingredient_id)) lRows.push(r);
          }
        });

        const nonCupRows = rows.filter(r => classify(r.ingredient_name || '') !== 'cup');
        const byIngredient: Record<string, Recipe[]> = {};
        nonCupRows.forEach(r => {
          if (!byIngredient[r.ingredient_id]) byIngredient[r.ingredient_id] = [];
          byIngredient[r.ingredient_id].push(r);
        });

        Object.values(byIngredient).forEach(ingRows => {
          if (ingRows.length === 1) {
            rRows.push(ingRows[0]);
            lRows.push(ingRows[0]);
          } else {
            const sorted = [...ingRows].sort((a, b) => a.quantity - b.quantity);
            rRows.push(sorted[0]);
            lRows.push(sorted[sorted.length - 1]);
          }
        });

        result.push(buildPivotRow(menuItemId, menuItem, 'R', rRows));
        result.push(buildPivotRow(menuItemId, menuItem, 'L', lRows));
      }
    });

    return result.sort((a, b) => a.menuItem.localeCompare(b.menuItem));

    function buildPivotRow(menuItemId: string, menuItem: string, size: string, rows: Recipe[]) {
      const find = (type: ReturnType<typeof classify>) =>
        rows.find(r => classify(r.ingredient_name || '') === type);
      const findAll = (type: ReturnType<typeof classify>) =>
        rows.filter(r => classify(r.ingredient_name || '') === type);

      const powderRow   = find('powder');
      const creamerRow  = find('creamer');
      const fructoseRow = find('fructose');
      const cupRow      = find('cup');
      const strawRow    = find('straw');
      const syrupRows   = findAll('syrup');
      const sauceRows   = findAll('sauce');

      return {
        menuItemId,
        menuItem,
        size,
        powder:   powderRow  ? fmt(powderRow)  : '',
        creamer:  creamerRow ? fmt(creamerRow) : '',
        fructose: fructoseRow ? fmt(fructoseRow) : '',
        syrup:    syrupRows.map(r => `${fmt(r)} ${r.ingredient_name}`).join(', '),
        sauce:    sauceRows.map(r => `${fmt(r)} ${r.ingredient_name}`).join(', '),
        cups:     cupRow?.ingredient_name || '',
        straws:   strawRow?.ingredient_name || '',
        allIds:   rows.map(r => r.id),
      };
    }
  }, [recipes, ingredients]);

  // Filtered recipes for search + category
  const filteredPivotedRecipes = useMemo(() => {
    let filtered = pivotedRecipes;
    
    // Filter by search term
    if (recipeSearchTerm) {
      filtered = filtered.filter(row => 
        row.menuItem.toLowerCase().includes(recipeSearchTerm.toLowerCase())
      );
    }
    
    // Filter by category
    if (recipeCategoryFilter !== 'All') {
      const menuItemsInCategory = menuItems
        .filter(item => item.category === recipeCategoryFilter)
        .map(item => item.id);
      filtered = filtered.filter(row => 
        menuItemsInCategory.includes(row.menuItemId)
      );
    }
    
    return filtered;
  }, [pivotedRecipes, recipeSearchTerm, recipeCategoryFilter, menuItems]);

  if (loading) {
    return <div className="flex-1 p-8 bg-black text-white">Loading inventory...</div>;
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto bg-black">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventory Management</h1>
          <p className="text-sm text-gray-400 mt-1">
            {lowStockIngredients.length} items low on stock
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={exportIngredients}
            className="px-4 py-2 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors flex items-center gap-2"
          >
            📥 Export Inventory
          </button>
          <label className="px-4 py-2 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors cursor-pointer flex items-center gap-2">
            📂 Import Excel
            <input type="file" accept=".xlsx,.xls" onChange={importIngredients} className="hidden" />
          </label>
        </div>
      </div>

      {/* Low Stock Alert Banner */}
      {lowStockIngredients.length > 0 && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-red-400 text-lg">⚠️</span>
            <span className="font-semibold text-red-400">Low Stock Alert</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStockIngredients.slice(0, 5).map(ing => (
              <span key={ing.id} className="px-3 py-1 bg-red-900/50 rounded-lg text-sm text-red-300">
                {ing.name}: {(() => {
                  const pc = ing.unit_size ? Math.floor(ing.current_stock / ing.unit_size) : null;
                  return pc !== null
                    ? `${pc}${ing.container_unit ? ' ' + ing.container_unit : ''}`
                    : `${ing.current_stock} ${ing.unit}`;
                })()} left
              </span>
            ))}
            {lowStockIngredients.length > 5 && (
              <span className="px-3 py-1 bg-red-900/50 rounded-lg text-sm text-red-300">
                +{lowStockIngredients.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Drinks Left Card */}
      <div className="mb-6 p-4 bg-white/5 border border-white/10 rounded-xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-white">🍹 Drinks Left (based on current stock)</h3>
          <button onClick={calculateDrinksLeft} className="text-xs text-gray-400 hover:text-white">🔄 Refresh</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-48 overflow-y-auto">
          {Object.entries(drinksLeft)
            .filter(([, count]) => count < 50)
            .slice(0, 12)
            .map(([itemId, count]) => {
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
        <button
          onClick={() => setActiveTab('ingredients')}
          className={`px-6 py-3 font-semibold transition-colors ${
            activeTab === 'ingredients'
              ? 'text-white border-b-2 border-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          📦 Ingredients ({ingredients.length})
        </button>
        <button
          onClick={() => setActiveTab('recipes')}
          className={`px-6 py-3 font-semibold transition-colors ${
            activeTab === 'recipes'
              ? 'text-white border-b-2 border-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          📋 Recipes ({recipes.length})
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`px-6 py-3 font-semibold transition-colors ${
            activeTab === 'logs'
              ? 'text-white border-b-2 border-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          📜 Stock Logs
        </button>
      </div>

      {/* INGREDIENTS TAB - Simplified, with date filter for Used */}
      {activeTab === 'ingredients' && (
        <>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <input
              type="text"
              placeholder="Search ingredients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-white/50 w-56"
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white focus:outline-none"
            >
              <option value="All" className="bg-black">All Categories</option>
              {INGREDIENT_CATEGORIES.map(cat => (
                <option key={cat} value={cat} className="bg-black">{cat}</option>
              ))}
            </select>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm text-gray-400">Used period:</span>
              <select
                value={usedDateRange}
                onChange={(e) => setUsedDateRange(e.target.value as DateRange)}
                className="px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-sm focus:outline-none"
              >
                {DATE_RANGE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setShowAddIngredient(true)}
              className="px-5 py-2 rounded-xl bg-white text-black font-semibold hover:bg-gray-200"
            >
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
                  <th className="px-4 py-3 text-right">Reorder at</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredIngredients.map(ing => {
                  const packCount = ing.unit_size ? Math.floor(ing.current_stock / ing.unit_size) : null;
                  const displayStock = packCount !== null
                    ? `${packCount}${ing.container_unit ? ' ' + ing.container_unit : ''}`
                    : `${ing.current_stock.toLocaleString()} ${ing.unit}`;
                  const isLowStock = packCount !== null
                    ? packCount <= ing.min_stock_threshold
                    : ing.current_stock <= ing.min_stock_threshold;
                  const usedAmount = usedStockFiltered[ing.id];
                  const usedDisplay = usedAmount
                    ? packCount !== null
                      ? `${Math.floor(usedAmount / ing.unit_size!)} ${ing.container_unit || 'containers'}`
                      : `${usedAmount.toLocaleString()} ${ing.unit}`
                    : '—';
                  const thresholdDisplay = packCount !== null
                    ? `${ing.min_stock_threshold} ${ing.container_unit || 'containers'}`
                    : `${ing.min_stock_threshold} ${ing.unit}`;

                  return (
                    <tr key={ing.id} className="border-t border-white/10 hover:bg-white/5">
                      <td className="px-4 py-3 text-gray-400 text-sm">{ing.category}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{ing.name}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-semibold ${isLowStock ? 'text-red-400' : 'text-white'}`}>
                          {displayStock}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-300">
                        {ing.current_stock.toLocaleString()} {ing.unit}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400">
                        {usedDisplay}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400">
                        {thresholdDisplay}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {ing.current_stock === 0 ? (
                          <span className="px-2 py-1 rounded-full bg-red-900/60 text-red-300 text-xs font-semibold">NO STOCK</span>
                        ) : isLowStock ? (
                          <span className="px-2 py-1 rounded-full bg-yellow-900/60 text-yellow-300 text-xs font-semibold">LOW STOCK</span>
                        ) : (
                          <span className="px-2 py-1 rounded-full bg-green-900/50 text-green-300 text-xs font-semibold">IN STOCK</span>
                        )}
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

      {/* RECIPES TAB - IMPROVED with Search + Category Filter + Edit Modal */}
      {activeTab === 'recipes' && (
        <>
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex gap-2">
              <button onClick={exportRecipes} className="px-4 py-2 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20">
                📥 Export Recipes
              </button>
              <button onClick={() => setShowAddRecipe(true)} className="px-5 py-2 rounded-xl bg-white text-black font-semibold hover:bg-gray-200">
                + Add Recipe
              </button>
            </div>
            
            {/* Category Filter Dropdown */}
            <select
              value={recipeCategoryFilter}
              onChange={(e) => setRecipeCategoryFilter(e.target.value)}
              className="px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white focus:outline-none"
            >
              {menuCategories.map(cat => (
                <option key={cat} value={cat} className="bg-black">
                  {cat === 'All' ? '📋 All Categories' : `📁 ${cat}`}
                </option>
              ))}
            </select>
            
            {/* Search input for recipes */}
            <div className="relative">
              <input
                type="text"
                placeholder="🔍 Search by name..."
                value={recipeSearchTerm}
                onChange={(e) => setRecipeSearchTerm(e.target.value)}
                className="px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:border-white/50 w-64"
              />
              {recipeSearchTerm && (
                <button
                  onClick={() => setRecipeSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>
            
            <div className="text-xs text-gray-500">
              {filteredPivotedRecipes.length} of {pivotedRecipes.length} recipes
              {recipeCategoryFilter !== 'All' && ` in ${recipeCategoryFilter}`}
            </div>
          </div>

          <div className="bg-black border border-white/20 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[1000px]">
              <thead className="bg-white/5 text-gray-300 border-b border-white/10 sticky top-0">
                <tr>
                  <th className="px-3 py-3 text-left">Menu Item</th>
                  <th className="px-3 py-3 text-center">Size</th>
                  <th className="px-3 py-3 text-right">Powder</th>
                  <th className="px-3 py-3 text-right">Creamer</th>
                  <th className="px-3 py-3 text-right">Fructose</th>
                  <th className="px-3 py-3 text-left">Syrup</th>
                  <th className="px-3 py-3 text-left">Sauce</th>
                  <th className="px-3 py-3 text-left">Cups</th>
                  <th className="px-3 py-3 text-left">Straws</th>
                  <th className="px-3 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPivotedRecipes.map((row) => (
                  <tr key={`${row.menuItemId}-${row.size || 'no-size'}`} className="border-t border-white/10 hover:bg-white/5">
                    <td className="px-3 py-3 font-medium text-white whitespace-nowrap">{row.menuItem}</td>
                    <td className="px-3 py-3 text-center">
                      {row.size ? (
                        <div className="flex items-center justify-center gap-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                            row.size === 'R'
                              ? 'bg-blue-900/50 text-blue-300'
                              : 'bg-purple-900/50 text-purple-300'
                          }`}>{row.size}</span>
                          {/* Quick duplicate button for size variants */}
                          <button
                            onClick={() => {
                              const newSize = row.size === 'R' ? 'L' : 'R';
                              if (confirm(`Duplicate ${row.menuItem} (${row.size}) to (${newSize})? This will copy all ingredients.`)) {
                                duplicateSizeVariant(row.menuItemId, row.size, newSize);
                              }
                            }}
                            className="text-xs text-gray-500 hover:text-green-400"
                            title={`Duplicate as ${row.size === 'R' ? 'Large' : 'Regular'}`}
                          >
                            📋
                          </button>
                        </div>
                      ) : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-3 py-3 text-right text-gray-300">{row.powder || '—'}</td>
                    <td className="px-3 py-3 text-right text-gray-300">{row.creamer || '—'}</td>
                    <td className="px-3 py-3 text-right text-gray-300">{row.fructose || '—'}</td>
                    <td className="px-3 py-3 text-gray-300 text-xs">{row.syrup || '—'}</td>
                    <td className="px-3 py-3 text-gray-300 text-xs">{row.sauce || '—'}</td>
                    <td className="px-3 py-3 text-gray-300 text-xs whitespace-nowrap">{row.cups || '—'}</td>
                    <td className="px-3 py-3 text-gray-300 text-xs whitespace-nowrap">{row.straws || '—'}</td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => {
                            const recipeToEdit = recipes.find(r => 
                              r.menu_item_id === row.menuItemId && 
                              r.size === row.size
                            );
                            if (recipeToEdit) {
                              setEditRecipeData({ quantity: recipeToEdit.quantity, size: recipeToEdit.size });
                              setShowEditRecipe(recipeToEdit);
                            }
                          }}
                          className="text-green-400 hover:text-green-300 text-xs"
                          title="Edit recipe quantities"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => deleteRecipeByMenuItem(row.menuItemId, row.size)}
                          className="text-red-400 hover:text-red-300 text-xs"
                          title="Delete all recipes for this size"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {/* Empty state */}
            {filteredPivotedRecipes.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                No recipes found matching "{recipeSearchTerm}"
              </div>
            )}
          </div>
        </>
      )}

      {/* STOCK LOGS TAB (unchanged) */}
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
                  <td className="px-4 py-3 text-gray-400">{new Date(log.created_at).toLocaleString()}</td>
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

      {/* MODALS - same as before (simplified, no shots/cups) */}
      {/* Add Ingredient Modal */}
      {showAddIngredient && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowAddIngredient(false)}>
          <div className="bg-black border border-white/20 rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/20">
              <h2 className="text-lg font-bold text-white">Add New Ingredient</h2>
              <p className="text-sm text-gray-400 mt-1">Fill in the details below</p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1">Ingredient Name *</label>
                <input 
                  value={newIngredient.name} 
                  onChange={(e) => setNewIngredient({ ...newIngredient, name: e.target.value })} 
                  className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white placeholder-gray-500"
                  placeholder="e.g., Okinawa, Creamer, Boba Straw"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1">Unit of Measurement *</label>
                <select 
                  value={newIngredient.unit} 
                  onChange={(e) => setNewIngredient({ ...newIngredient, unit: e.target.value })} 
                  className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white"
                >
                  {UNIT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Example: {UNIT_OPTIONS.find(o => o.value === newIngredient.unit)?.example}
                </p>
              </div>
              <div className="bg-white/5 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-2">📦 Optional: If this item comes in packs/bottles</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1">Size per pack</label>
                    <input 
                      type="number" 
                      value={newIngredient.unit_size || ''} 
                      onChange={(e) => setNewIngredient({ ...newIngredient, unit_size: e.target.value ? parseFloat(e.target.value) : null })} 
                      className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white"
                      placeholder="e.g., 500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1">Pack name</label>
                    <input 
                      value={newIngredient.container_unit || ''} 
                      onChange={(e) => setNewIngredient({ ...newIngredient, container_unit: e.target.value })} 
                      className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white"
                      placeholder="bottle, pack, sachet"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1">Initial Stock</label>
                <input 
                  type="number" 
                  value={newIngredient.current_stock} 
                  onChange={(e) => setNewIngredient({ ...newIngredient, current_stock: parseFloat(e.target.value) })} 
                  className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1">Low Stock Alert Threshold</label>
                <input 
                  type="number" 
                  value={newIngredient.min_stock_threshold} 
                  onChange={(e) => setNewIngredient({ ...newIngredient, min_stock_threshold: parseFloat(e.target.value) })} 
                  className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white"
                  placeholder="10"
                />
                <p className="text-xs text-gray-500 mt-1">Alert when stock falls below this number</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1">Category</label>
                <input 
                  list="cat-list-add" 
                  value={newIngredient.category} 
                  onChange={(e) => setNewIngredient({ ...newIngredient, category: e.target.value })} 
                  className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white" 
                  placeholder="Select or type category"
                />
                <datalist id="cat-list-add">
                  {allCategories.map(cat => <option key={cat} value={cat} />)}
                </datalist>
              </div>
            </div>
            <div className="p-5 border-t border-white/20 flex justify-end gap-3">
              <button onClick={() => setShowAddIngredient(false)} className="px-5 py-2 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20">Cancel</button>
              <button onClick={addIngredient} className="px-5 py-2 rounded-xl bg-white text-black font-semibold hover:bg-gray-200">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Stock Modal (unchanged) */}
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
                  {(() => {
                    const ing = ingredients.find(i => i.id === showAdjustStock);
                    if (ing?.unit_size) {
                      return `Number of ${ing.container_unit ? ing.container_unit + 's' : 'containers'} to Add/Remove`;
                    }
                    return `Amount (+/-) in ${ing?.unit || 'units'}`;
                  })()}
                </label>
                <input
                  type="number"
                  value={adjustAmount === 0 ? '' : adjustAmount}
                  onChange={(e) => {
                    const value = e.target.value;
                    setAdjustAmount(value === '' ? 0 : parseFloat(value));
                  }}
                  className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white"
                  placeholder="Positive to add, negative to remove"
                />
                {(() => {
                  const ing = ingredients.find(i => i.id === showAdjustStock);
                  if (!ing) return null;
                  if (ing.unit_size && adjustAmount !== 0 && !isNaN(adjustAmount)) {
                    const raw = adjustAmount * ing.unit_size;
                    const currentStock = ing.current_stock ?? 0;
                    const currentPacks = Math.floor(currentStock / ing.unit_size);
                    const newPacks = currentPacks + adjustAmount;
                    const newStockAmount = newPacks * ing.unit_size;
                    return (
                      <div className="text-xs text-gray-400 mt-2 p-2 bg-white/5 rounded">
                        <div>📦 Current: {currentPacks} packs ({currentStock} {ing.unit})</div>
                        <div>➕ Adding: {adjustAmount} packs ({raw} {ing.unit})</div>
                        <div>✨ New total: <span className="text-white font-semibold">{newPacks} packs ({newStockAmount} {ing.unit})</span></div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1">Reason</label>
                <select
                  value={adjustReason} 
                  onChange={(e) => setAdjustReason(e.target.value)} 
                  className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white"
                >
                  <option value="manual_adjustment">Manual Adjustment</option>
                  <option value="restock">Restock</option>
                  <option value="wastage">Wastage</option>
                  <option value="damage">Damaged Goods</option>
                </select>
              </div>
            </div>
            <div className="p-5 border-t border-white/20 flex justify-end gap-3">
              <button onClick={() => { setShowAdjustStock(null); setAdjustAmount(0); }} className="px-5 py-2 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20">Cancel</button>
              <button onClick={() => adjustStock(showAdjustStock)} className="px-5 py-2 rounded-xl bg-white text-black font-semibold hover:bg-gray-200">Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Recipe Modal (unchanged) */}
      {showAddRecipe && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowAddRecipe(false)}>
          <div className="bg-black border border-white/20 rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/20"><h2 className="text-lg font-bold text-white">Add Recipe</h2><p className="text-sm text-gray-400">Define ingredients for a menu item</p></div>
            <div className="p-5 space-y-4">
              <div><label className="block text-sm font-semibold text-gray-300 mb-1">Menu Item</label><select value={newRecipe.menu_item_id} onChange={(e) => setNewRecipe({ ...newRecipe, menu_item_id: e.target.value })} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white"><option value="">Select menu item...</option>{menuItems.map(item => (<option key={item.id} value={item.id}>{item.name} ({item.category})</option>))}</select></div>
              <div><label className="block text-sm font-semibold text-gray-300 mb-1">Size</label><select value={(newRecipe as any).size || 'R'} onChange={(e) => setNewRecipe({ ...newRecipe, size: e.target.value })} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white"><option value="R">Regular (R)</option><option value="L">Large (L)</option></select></div>
              <div><label className="block text-sm font-semibold text-gray-300 mb-1">Ingredient</label><select value={newRecipe.ingredient_id} onChange={(e) => setNewRecipe({ ...newRecipe, ingredient_id: e.target.value })} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white"><option value="">Select ingredient...</option>{ingredients.map(ing => (<option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>))}</select></div>
              <div><label className="block text-sm font-semibold text-gray-300 mb-1">Quantity Needed</label><input type="number" value={newRecipe.quantity} onChange={(e) => setNewRecipe({ ...newRecipe, quantity: parseFloat(e.target.value) })} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white" placeholder="e.g., 20, 30, 40" /></div>
            </div>
            <div className="p-5 border-t border-white/20 flex justify-end gap-3"><button onClick={() => setShowAddRecipe(false)} className="px-5 py-2 rounded-xl bg-white/10 text-white font-semibold">Cancel</button><button onClick={addRecipe} className="px-5 py-2 rounded-xl bg-white text-black font-semibold">Save</button></div>
          </div>
        </div>
      )}

            {/* Edit Recipe Modal */}
      {showEditRecipe && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowEditRecipe(null)}>
          <div className="bg-black border border-white/20 rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/20">
              <h2 className="text-lg font-bold text-white">Edit Recipe</h2>
              <p className="text-sm text-gray-400">
                {showEditRecipe.menu_item_name} - {showEditRecipe.ingredient_name}
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1">Size</label>
                <select 
                  value={editRecipeData.size} 
                  onChange={(e) => setEditRecipeData({ ...editRecipeData, size: e.target.value })} 
                  className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white"
                >
                  <option value="R">Regular (R)</option>
                  <option value="L">Large (L)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1">Quantity Needed</label>
                <input 
                  type="number" 
                  value={editRecipeData.quantity} 
                  onChange={(e) => setEditRecipeData({ ...editRecipeData, quantity: parseFloat(e.target.value) })} 
                  className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white" 
                  placeholder="e.g., 20, 30, 40"
                />
              </div>
            </div>
            <div className="p-5 border-t border-white/20 flex justify-end gap-3">
              <button onClick={() => setShowEditRecipe(null)} className="px-5 py-2 rounded-xl bg-white/10 text-white font-semibold">Cancel</button>
              <button onClick={updateRecipe} className="px-5 py-2 rounded-xl bg-white text-black font-semibold">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Ingredient Modal - Simplified */}
      {editingIngredient && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setEditingIngredient(null)}
        >
          <div
            className="bg-black border border-white/20 rounded-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-white/20">
              <h2 className="text-lg font-bold text-white">Edit Ingredient</h2>
              <p className="text-sm text-gray-400 mt-1">Update the ingredient details below</p>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1">Ingredient Name</label>
                <input
                  value={editingIngredient.name}
                  onChange={(e) => setEditingIngredient({ ...editingIngredient, name: e.target.value })}
                  className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1">Unit of Measurement</label>
                <select
                  value={editingIngredient.unit}
                  onChange={(e) => setEditingIngredient({ ...editingIngredient, unit: e.target.value })}
                  className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white"
                >
                  {UNIT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Example: {UNIT_OPTIONS.find(o => o.value === editingIngredient.unit)?.example}
                </p>
              </div>

              <div className="bg-white/5 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-2">📦 If this item comes in packs/bottles (optional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1">Size per pack</label>
                    <input
                      type="number"
                      value={editingIngredient.unit_size ?? ''}
                      onChange={(e) => setEditingIngredient({ ...editingIngredient, unit_size: e.target.value ? parseFloat(e.target.value) : null })}
                      className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white"
                      placeholder="e.g., 500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1">Pack name</label>
                    <input
                      value={editingIngredient.container_unit ?? ''}
                      onChange={(e) => setEditingIngredient({ ...editingIngredient, container_unit: e.target.value })}
                      className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white"
                      placeholder="bottle, pack, sachet"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1">
                  Low Stock Alert Threshold
                  <span className="text-gray-500 font-normal ml-1">
                    {editingIngredient.unit_size
                      ? `(in ${editingIngredient.container_unit || 'containers'})`
                      : `(in ${editingIngredient.unit})`}
                  </span>
                </label>
                <input
                  type="number"
                  value={editingIngredient.min_stock_threshold ?? ''}
                  onChange={(e) => setEditingIngredient({
                    ...editingIngredient,
                    min_stock_threshold: parseFloat(e.target.value),
                  })}
                  className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white"
                />
                <p className="text-xs text-gray-500 mt-1">Alert when stock falls below this number</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1">Category</label>
                <input
                  list="cat-list-edit"
                  value={editingIngredient.category}
                  onChange={(e) => setEditingIngredient({ ...editingIngredient, category: e.target.value })}
                  className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white"
                  placeholder="Select or type category"
                />
                <datalist id="cat-list-edit">
                  {allCategories.map(cat => <option key={cat} value={cat} />)}
                </datalist>
              </div>
            </div>

            <div className="p-5 border-t border-white/20 flex justify-end gap-3">
              <button onClick={() => setEditingIngredient(null)} className="px-5 py-2 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20">Cancel</button>
              <button onClick={updateIngredient} className="px-5 py-2 rounded-xl bg-white text-black font-semibold hover:bg-gray-200">Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
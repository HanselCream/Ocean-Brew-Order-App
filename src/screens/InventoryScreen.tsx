'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import * as XLSX from 'xlsx';

// Types
interface Ingredient {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  min_stock_threshold: number;
  category: string;
}

interface Recipe {
  id: string;
  menu_item_id: string;
  ingredient_id: string;
  quantity: number;
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
  
  // New ingredient form
  const [newIngredient, setNewIngredient] = useState({
    name: '',
    unit: 'pieces',
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
    quantity: 0
  });

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
      .limit(100);
    
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
    // Get recipe ingredients for this menu item
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
      console.log(`${menuItem.name}: ${recipe.ingredient_id} - stock: ${stock}, needed: ${needed}, possible: ${possible}`);
      maxDrinks = Math.min(maxDrinks, possible);
    }
    
    drinks[menuItem.id] = maxDrinks === Infinity ? 999 : maxDrinks;
    console.log(`${menuItem.name} can make: ${drinks[menuItem.id]} drinks`);
  }
  
  setDrinksLeft(drinks);
};

  // ============================================
  // AUTO-DEDUCT STOCK
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
    await calculateDrinksLeft();  // ← Make sure this is AFTER loadMenuItems
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
      current_stock: 0,
      min_stock_threshold: 10,
      category: 'General'
    });
    loadAllData();
  };

  const updateIngredient = async () => {
    if (!editingIngredient) return;
    
    const { error } = await supabase
      .from('ingredients')
      .update({
        name: editingIngredient.name,
        unit: editingIngredient.unit,
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
    loadAllData();
  };

  const adjustStock = async (ingredientId: string) => {
    if (adjustAmount === 0) {
      alert('Please enter an amount');
      return;
    }
    
    const ingredient = ingredients.find(i => i.id === ingredientId);
    if (!ingredient) return;
    
    const newStock = ingredient.current_stock + adjustAmount;
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
      quantity_change: adjustAmount,
      reason: adjustReason,
      reference_id: 'manual_' + Date.now()
    }]);
    
    setShowAdjustStock(null);
    setAdjustAmount(0);
    loadAllData();
  };

  const addRecipe = async () => {
    if (!newRecipe.menu_item_id || !newRecipe.ingredient_id || newRecipe.quantity <= 0) {
      alert('Please fill all recipe fields');
      return;
    }
    
    const { error } = await supabase
      .from('recipes')
      .insert([newRecipe]);
    
    if (error) {
      alert('Error adding recipe: ' + error.message);
      return;
    }
    
    setShowAddRecipe(false);
    setNewRecipe({
      menu_item_id: '',
      ingredient_id: '',
      quantity: 0
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
  // EXPORT/IMPORT
  // ============================================

  const exportIngredients = () => {
    const exportData = ingredients.map(ing => ({
      'Ingredient Name': ing.name,
      'Unit': ing.unit,
      'Current Stock': ing.current_stock,
      'Min Threshold': ing.min_stock_threshold,
      'Category': ing.category,
      'Status': ing.current_stock <= ing.min_stock_threshold ? 'LOW STOCK' : 'OK'
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

  // ============================================
  // EXPOSE FUNCTION FOR QUEUE SCREEN
  // ============================================
  useEffect(() => {
    (window as any).deductStockForOrder = deductStockForOrder;
    return () => { delete (window as any).deductStockForOrder; };
  }, [ingredients]);

  // ============================================
  // INITIAL LOAD
  // ============================================
  useEffect(() => {
    loadAllData();
  }, []);

  // Get low stock ingredients
  const lowStockIngredients = ingredients.filter(ing => ing.current_stock <= ing.min_stock_threshold);
const filteredIngredients = ingredients.filter(ing => {
  const matchesSearch = ing.name.toLowerCase().includes(searchTerm.toLowerCase());
  const matchesCategory = categoryFilter === 'All' || ing.category === categoryFilter;
  return matchesSearch && matchesCategory;
});

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
                {ing.name}: {ing.current_stock} {ing.unit} left
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

      {/* INGREDIENTS TAB */}
      {activeTab === 'ingredients' && (
        <>
<div className="flex items-center gap-3 mb-4">
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
  <button
    onClick={() => setShowAddIngredient(true)}
    className="ml-auto px-5 py-2 rounded-xl bg-white text-black font-semibold hover:bg-gray-200"
  >
    + Add Ingredient
  </button>
</div>

          <div className="bg-black border border-white/20 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-gray-300 border-b border-white/10">
                <tr>
                  <th className="px-4 py-3 text-left">Ingredient</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3 text-right">Threshold</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredIngredients.map(ing => {
                  const isLowStock = ing.current_stock <= ing.min_stock_threshold;
                  return (
                    <tr key={ing.id} className="border-t border-white/10 hover:bg-white/5">
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{ing.name}</div>
                        <div className="text-xs text-gray-500">{ing.unit}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-400">{ing.category}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-semibold ${isLowStock ? 'text-red-400' : 'text-white'}`}>
                          {ing.current_stock}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400">{ing.min_stock_threshold}</td>
                      <td className="px-4 py-3 text-center">
                        {isLowStock ? (
                          <span className="px-2 py-1 rounded-full bg-red-900/50 text-red-300 text-xs font-semibold">LOW STOCK</span>
                        ) : (
                          <span className="px-2 py-1 rounded-full bg-green-900/50 text-green-300 text-xs font-semibold">OK</span>
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

      {/* RECIPES TAB */}
      {activeTab === 'recipes' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <button onClick={exportRecipes} className="px-4 py-2 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20">📥 Export Recipes</button>
            <button onClick={() => setShowAddRecipe(true)} className="px-5 py-2 rounded-xl bg-white text-black font-semibold hover:bg-gray-200">+ Add Recipe</button>
          </div>

          <div className="bg-black border border-white/20 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-gray-300 border-b border-white/10">
                <tr><th className="px-4 py-3 text-left">Menu Item</th><th className="px-4 py-3 text-left">Ingredient</th><th className="px-4 py-3 text-right">Quantity</th><th className="px-4 py-3 text-center">Actions</th></tr>
              </thead>
              <tbody>
                {recipes.map(recipe => (
                  <tr key={recipe.id} className="border-t border-white/10 hover:bg-white/5">
                    <td className="px-4 py-3 font-medium text-white">{recipe.menu_item_name}</td>
                    <td className="px-4 py-3 text-gray-300">{recipe.ingredient_name}</td>
                    <td className="px-4 py-3 text-right text-white">{recipe.quantity} {ingredients.find(i => i.id === recipe.ingredient_id)?.unit}</td>
                    <td className="px-4 py-3 text-center"><button onClick={() => deleteRecipe(recipe.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* STOCK LOGS TAB */}
      {activeTab === 'logs' && (
        <div className="bg-black border border-white/20 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-gray-300 border-b border-white/10">
              <tr><th className="px-4 py-3 text-left">Date & Time</th><th className="px-4 py-3 text-left">Ingredient</th><th className="px-4 py-3 text-right">Change</th><th className="px-4 py-3 text-right">Previous → New</th><th className="px-4 py-3 text-left">Reason</th></tr>
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

      {/* MODALS - same as before, keeping them short */}
      {showAddIngredient && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowAddIngredient(false)}>
          <div className="bg-black border border-white/20 rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/20"><h2 className="text-lg font-bold text-white">Add New Ingredient</h2></div>
            <div className="p-5 space-y-4">
              <div><label className="block text-sm font-semibold text-gray-300 mb-1">Name</label><input value={newIngredient.name} onChange={(e) => setNewIngredient({ ...newIngredient, name: e.target.value })} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white" /></div>
              <div><label className="block text-sm font-semibold text-gray-300 mb-1">Unit</label><select value={newIngredient.unit} onChange={(e) => setNewIngredient({ ...newIngredient, unit: e.target.value })} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white"><option value="pieces">pieces</option><option value="ml">ml</option><option value="grams">grams</option><option value="shots">shots</option><option value="cups">cups</option></select></div>
              <div><label className="block text-sm font-semibold text-gray-300 mb-1">Initial Stock</label><input type="number" value={newIngredient.current_stock} onChange={(e) => setNewIngredient({ ...newIngredient, current_stock: parseFloat(e.target.value) })} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white" /></div>
              <div><label className="block text-sm font-semibold text-gray-300 mb-1">Low Stock Threshold</label><input type="number" value={newIngredient.min_stock_threshold} onChange={(e) => setNewIngredient({ ...newIngredient, min_stock_threshold: parseFloat(e.target.value) })} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white" /></div>
              <div><label className="block text-sm font-semibold text-gray-300 mb-1">Category</label><select value={newIngredient.category} onChange={(e) => setNewIngredient({ ...newIngredient, category: e.target.value })} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white">{INGREDIENT_CATEGORIES.map(cat => <option key={cat} value={cat} className="bg-black">{cat}</option>)}</select></div>
            </div>
            <div className="p-5 border-t border-white/20 flex justify-end gap-3"><button onClick={() => setShowAddIngredient(false)} className="px-5 py-2 rounded-xl bg-white/10 text-white font-semibold">Cancel</button><button onClick={addIngredient} className="px-5 py-2 rounded-xl bg-white text-black font-semibold">Save</button></div>
          </div>
        </div>
      )}

      {editingIngredient && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setEditingIngredient(null)}>
          <div className="bg-black border border-white/20 rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/20"><h2 className="text-lg font-bold text-white">Edit Ingredient</h2></div>
            <div className="p-5 space-y-4">
              <div><label className="block text-sm font-semibold text-gray-300 mb-1">Name</label><input value={editingIngredient.name} onChange={(e) => setEditingIngredient({ ...editingIngredient, name: e.target.value })} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white" /></div>
              <div><label className="block text-sm font-semibold text-gray-300 mb-1">Unit</label><select value={editingIngredient.unit} onChange={(e) => setEditingIngredient({ ...editingIngredient, unit: e.target.value })} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white"><option value="pieces">pieces</option><option value="ml">ml</option><option value="grams">grams</option><option value="shots">shots</option><option value="cups">cups</option></select></div>
              <div><label className="block text-sm font-semibold text-gray-300 mb-1">Low Stock Threshold</label><input type="number" value={editingIngredient.min_stock_threshold} onChange={(e) => setEditingIngredient({ ...editingIngredient, min_stock_threshold: parseFloat(e.target.value) })} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white" /></div>
              <div><label className="block text-sm font-semibold text-gray-300 mb-1">Category</label><select value={editingIngredient.category} onChange={(e) => setEditingIngredient({ ...editingIngredient, category: e.target.value })} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white">{INGREDIENT_CATEGORIES.map(cat => <option key={cat} value={cat} className="bg-black">{cat}</option>)}</select></div>
            </div>
            <div className="p-5 border-t border-white/20 flex justify-end gap-3"><button onClick={() => setEditingIngredient(null)} className="px-5 py-2 rounded-xl bg-white/10 text-white font-semibold">Cancel</button><button onClick={updateIngredient} className="px-5 py-2 rounded-xl bg-white text-black font-semibold">Save</button></div>
          </div>
        </div>
      )}

      {showAdjustStock && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowAdjustStock(null)}>
          <div className="bg-black border border-white/20 rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/20"><h2 className="text-lg font-bold text-white">Adjust Stock</h2><p className="text-sm text-gray-400">{ingredients.find(i => i.id === showAdjustStock)?.name}</p></div>
            <div className="p-5 space-y-4">
              <div><label className="block text-sm font-semibold text-gray-300 mb-1">Amount (+/-)</label><input type="number" value={adjustAmount} onChange={(e) => setAdjustAmount(parseFloat(e.target.value))} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white" placeholder="Positive to add, negative to remove" /></div>
              <div><label className="block text-sm font-semibold text-gray-300 mb-1">Reason</label><select value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white"><option value="manual_adjustment">Manual Adjustment</option><option value="restock">Restock</option><option value="wastage">Wastage</option><option value="damage">Damaged Goods</option></select></div>
            </div>
            <div className="p-5 border-t border-white/20 flex justify-end gap-3"><button onClick={() => setShowAdjustStock(null)} className="px-5 py-2 rounded-xl bg-white/10 text-white font-semibold">Cancel</button><button onClick={() => adjustStock(showAdjustStock)} className="px-5 py-2 rounded-xl bg-white text-black font-semibold">Apply</button></div>
          </div>
        </div>
      )}

      {showAddRecipe && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowAddRecipe(false)}>
          <div className="bg-black border border-white/20 rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/20"><h2 className="text-lg font-bold text-white">Add Recipe</h2><p className="text-sm text-gray-400">Define ingredients for a menu item</p></div>
            <div className="p-5 space-y-4">
              <div><label className="block text-sm font-semibold text-gray-300 mb-1">Menu Item</label><select value={newRecipe.menu_item_id} onChange={(e) => setNewRecipe({ ...newRecipe, menu_item_id: e.target.value })} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white"><option value="">Select menu item...</option>{menuItems.map(item => (<option key={item.id} value={item.id}>{item.name} ({item.category})</option>))}</select></div>
              <div><label className="block text-sm font-semibold text-gray-300 mb-1">Ingredient</label><select value={newRecipe.ingredient_id} onChange={(e) => setNewRecipe({ ...newRecipe, ingredient_id: e.target.value })} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white"><option value="">Select ingredient...</option>{ingredients.map(ing => (<option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>))}</select></div>
              <div><label className="block text-sm font-semibold text-gray-300 mb-1">Quantity Needed</label><input type="number" value={newRecipe.quantity} onChange={(e) => setNewRecipe({ ...newRecipe, quantity: parseFloat(e.target.value) })} className="w-full border border-white/20 rounded-xl px-3 py-2 bg-black text-white" placeholder="e.g., 2, 150, 30" /></div>
            </div>
            <div className="p-5 border-t border-white/20 flex justify-end gap-3"><button onClick={() => setShowAddRecipe(false)} className="px-5 py-2 rounded-xl bg-white/10 text-white font-semibold">Cancel</button><button onClick={addRecipe} className="px-5 py-2 rounded-xl bg-white text-black font-semibold">Save</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
import { supabase } from './supabaseClient';
import { MenuItem, Order, OrderItem } from './types';

// ─────────────────────────────────────────────
// MENU FUNCTIONS
// ─────────────────────────────────────────────
export async function getMenu(): Promise<MenuItem[]> {
  try {
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .neq('category', 'Add Ons')
      .order('name');
    
    if (error) {
      console.error('Error fetching menu:', error);
      return [];
    }

    if (!data) return [];
    
    // Fetch addon relationships for all menu items
    const { data: relationships } = await supabase
      .from('item_addon_relationships')
      .select('menu_item_id, addon_item_id');

    const addonMap: Record<string, string[]> = {};
    (relationships || []).forEach(r => {
      if (!addonMap[r.menu_item_id]) addonMap[r.menu_item_id] = [];
      addonMap[r.menu_item_id].push(r.addon_item_id);
    });

    return data.map(item => ({
      id: item.id,
      name: item.name,
      category: item.category,
      priceR: parseFloat(item.pricer) || 0,
      priceL: item.pricel ? parseFloat(item.pricel) : null,
      available: item.available,
      hasSizeOption: !!(item.pricel && parseFloat(item.pricel) > 0),
      addOnIds: addonMap[item.id] || [],
      autoDeduct: item.auto_deduct ?? false,  // ← ADD
    }));
    } catch (err) {
      console.error('Unexpected error in getMenu:', err);
      return [];
    }
}

export async function saveMenu(menu: MenuItem[]) {
  console.log('📤 Attempting to save menu items:', menu.length);
  
  for (const item of menu) {
    try {
const itemData = {
  id: item.id || crypto.randomUUID(),
  name: item.name,
  category: item.category,
  pricer: item.priceR,
  pricel: item.priceL,
  available: item.available,
  hassizeoption: item.hasSizeOption,
  auto_deduct: item.autoDeduct ?? false,  // ← ADD THIS
  updated_at: new Date().toISOString()
};
          
      const { data, error } = await supabase
        .from('menu_items')
        .upsert(itemData)
        .select();
      
      if (error) {
        console.error('❌ Error saving item:', item.name, error);
        continue;
      }
      
      if (item.category !== 'Add Ons' && item.addOnIds && data && data[0]) {
        const menuItemId = data[0].id;
        
        await supabase
          .from('item_addon_relationships')
          .delete()
          .eq('menu_item_id', menuItemId);
        
        if (item.addOnIds.length > 0) {
          const relationships = item.addOnIds.map(addonId => ({
            menu_item_id: menuItemId,
            addon_item_id: addonId
          }));
          
          await supabase
            .from('item_addon_relationships')
            .insert(relationships);
        }
      }
    } catch (err) {
      console.error('❌ Error in saveMenu:', err);
    }
  }
}

// 🔥 ADD THIS MISSING FUNCTION 🔥
export async function saveMenuItemWithAddons(item: MenuItem): Promise<void> {
  try {
    console.log('💾 Saving menu item with add-ons:', item.name);
    console.log('Add-on IDs to save:', item.addOnIds);
    
    // 1. Save the menu item
const itemData = {
  id: item.id || crypto.randomUUID(),
  name: item.name,
  category: item.category,
  pricer: item.priceR,
  pricel: item.priceL,
  available: item.available,
  hassizeoption: item.hasSizeOption,
  auto_deduct: item.autoDeduct ?? false,  // ← ADD THIS
  updated_at: new Date().toISOString()
};
    
const { data, error } = await supabase
      .from('menu_items')
      .upsert(itemData)
      .select();
    
    if (error) throw error;
    
    const menuItemId = data?.[0]?.id || item.id;
    console.log('Menu item ID:', menuItemId);

    // Auto-create ingredient + recipe for Merchandise items
// Auto-create ingredient for auto_deduct items (no recipe — supplies tab only)
    if (item.autoDeduct === true) {
const { data: existingIng } = await supabase
  .from('ingredients')
  .select('id')
  .ilike('name', item.name)  // ← case-insensitive, catches near-duplicates
  .maybeSingle();

      if (!existingIng) {
        const ingCategory =
          item.category === 'Merchandise' ? 'Merchandise' :
          item.category === 'Supplies' ? 'Packaging Supplies' :
          item.category === 'Food Supplies' ? 'Food Supplies' :
          item.category === 'Food' ? 'Food Supplies' :
          item.category;

        await supabase.from('ingredients').insert([{
          name: item.name,
          unit: 'pieces',
          current_stock: 0,
          min_stock_threshold: 2,
          category: ingCategory,
        }]);
      }
    }

    // 2. Handle add-on relationships
    if (item.category !== 'Add Ons' && item.addOnIds) {
      // Delete existing
      const { error: deleteError } = await supabase
        .from('item_addon_relationships')
        .delete()
        .eq('menu_item_id', menuItemId);
      
      if (deleteError) throw deleteError;
      
      // Insert new
      if (item.addOnIds.length > 0) {
        const relationships = item.addOnIds.map(addonId => ({
          menu_item_id: menuItemId,
          addon_item_id: addonId
        }));
        
        console.log('Inserting relationships:', relationships);
        
        const { error: insertError } = await supabase
          .from('item_addon_relationships')
          .insert(relationships);
        
        if (insertError) throw insertError;
        
        console.log(`✅ Saved ${relationships.length} add-on relationships for ${item.name}`);
      }
    }
    
  } catch (err) {
    console.error('Error in saveMenuItemWithAddons:', err);
    throw err;
  }
}

// ─────────────────────────────────────────────
// ADD-ONS FUNCTIONS
// ─────────────────────────────────────────────
export async function getAddOnItems(): Promise<MenuItem[]> {
  try {
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('category', 'Add Ons')
      .order('name');
    
    if (error) {
      console.error('Error fetching add-ons:', error);
      return [];
    }
    
return (data || []).map(item => ({
  id: item.id,
  name: item.name,
  category: item.category,
  priceR: parseFloat(item.pricer) || 0,
  priceL: item.pricel ? parseFloat(item.pricel) : null,
  available: item.available,
  hasSizeOption: !!(item.pricel && parseFloat(item.pricel) > 0),
  autoDeduct: item.auto_deduct ?? false,  // ← ADD THIS
}));
  } catch (err) {
    console.error('Error in getAddOnItems:', err);
    return [];
  }
}

// ─────────────────────────────────────────────
// ORDER FUNCTIONS
// ─────────────────────────────────────────────
export async function getOrders(): Promise<Order[]> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching orders:', error);
      return [];
    }
    
    if (!data) return [];
    
return data.map(order => ({
  id: order.id,
  orderNumber: order.order_number,
  items: order.items as OrderItem[],
  subtotal: parseFloat(order.subtotal) || calculateSubtotal(order.items),
  discount: parseFloat(order.discount) || 0,
  total: parseFloat(order.total),
  status: order.status || 'pending',
  createdAt: order.created_at,
  printedCount: order.printed_count || 0,
  lastPrintedAt: order.last_printed_at,
  completedAt: order.completed_at,
  paymentMethod: order.payment_method,
  punchedBy: order.punched_by || '',
  madeBy: order.made_by || '',
  orderType: order.order_type || 'Dine In',
}));
  } catch (err) {
    console.error('Error in getOrders:', err);
    return [];
  }
}

function calculateSubtotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => {
    const addOnsTotal = item.customization?.addOns?.reduce((a, ao) => a + ao.price, 0) || 0;
    return sum + (item.basePrice + addOnsTotal) * (item.quantity || 1);
  }, 0);
}

export async function saveOrder(order: Order) {
  try {
const orderData = {
  order_number: order.orderNumber.toString(),
  items: order.items,
  subtotal: order.subtotal,
  discount: order.discount || 0,
  total: order.total,
  status: order.status,
  created_at: order.createdAt,
  printed_count: order.printedCount || 0,
  last_printed_at: order.lastPrintedAt ?? null,
  completed_at: order.completedAt ?? null,
payment_method: order.paymentMethod || null,
  punched_by: (order as any).punchedBy ?? null,
  made_by: (order as any).madeBy ?? null,
  order_type: (order as any).orderType ?? null,
};

console.log('📤 Inserting to Supabase:', orderData.order_number);

    const { data, error } = await supabase
      .from('orders')
      .insert([orderData])
      .select();

    if (error) {
      console.error('❌ Supabase insert error:', JSON.stringify(error));
      throw error;
    }

    console.log('✅ Supabase confirmed insert:', data);

    // Deduct stock for Merchandise items immediately on order
const orderId = data?.[0]?.id || '';

    const menuItemIds = order.items.map(i => i.menuItemId);
    const { data: menuFlags } = await supabase
      .from('menu_items')
      .select('id, auto_deduct')
      .in('id', menuItemIds);
    const autoDeductIds = new Set((menuFlags || []).filter(m => m.auto_deduct).map(m => m.id));

    const directDeductItems = order.items.filter(i => autoDeductIds.has(i.menuItemId));
    const drinkItems = order.items.filter(i =>
      !autoDeductIds.has(i.menuItemId) &&
      !['Add Ons'].includes(i.category ?? '')
    );

    console.log('🛍️ Auto-deduct items:', directDeductItems.length, '| Drink items:', drinkItems.length);

    if (directDeductItems.length > 0) {
      await deductMerchStock(directDeductItems, orderId);
    }
    // if (drinkItems.length > 0 && typeof window !== 'undefined' && (window as any).deductStockForOrder) {
    //   await (window as any).deductStockForOrder(drinkItems, orderId);
    // }
  } catch (err: any) {
    console.error('❌ Error in saveOrder:', JSON.stringify(err), err?.message);
    throw err;
  }
}

async function deductMerchStock(items: OrderItem[], orderId: string) {
  // Aggregate total qty per ingredient name first — avoid race conditions
  const totals: Record<string, number> = {};
  for (const item of items) {
    totals[item.name] = (totals[item.name] || 0) + (item.quantity || 1);

    // Also aggregate add-ons
    for (const addOn of item.customization?.addOns || []) {
      totals[addOn.name] = (totals[addOn.name] || 0) + (item.quantity || 1);
    }
  }
  for (const [name, totalQty] of Object.entries(totals)) {
    const { data: fresh } = await supabase
      .from('ingredients')
      .select('*')
      .eq('name', name)
      .maybeSingle();

    if (!fresh) {
      console.warn('⚠️ No ingredient found for auto_deduct item:', name);
      continue;
    }

    const newStock = Math.max(0, fresh.current_stock - totalQty);
    console.log(`📦 Deducting ${totalQty} from ${fresh.name}: ${fresh.current_stock} → ${newStock}`);

    await supabase.from('ingredients')
      .update({ current_stock: newStock, updated_at: new Date().toISOString() })
      .eq('id', fresh.id);

    await supabase.from('stock_logs').insert([{
      ingredient_id: fresh.id,
      previous_stock: fresh.current_stock,
      new_stock: newStock,
      quantity_change: -totalQty,
      reason: 'order',
      reference_id: orderId,
    }]);
  }
}

export async function updateOrder(id: string, updates: Partial<Order>) {
  try {
    const dbUpdates: any = {};
    if (updates.status) dbUpdates.status = updates.status;
    if (updates.paymentMethod) dbUpdates.payment_method = updates.paymentMethod;
    if (updates.printedCount !== undefined) dbUpdates.printed_count = updates.printedCount;
    if (updates.lastPrintedAt) dbUpdates.last_printed_at = updates.lastPrintedAt;
    if (updates.completedAt) dbUpdates.completed_at = updates.completedAt;
    
    const { error } = await supabase
      .from('orders')
      .update(dbUpdates)
      .eq('id', id);
    
    if (error) throw error;
  } catch (err) {
    console.error('Error in updateOrder:', err);
    throw err;
  }
}

export async function getNextOrderNumber(): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('order_number')
      .order('order_number', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) return '1001';

    const last = parseInt(data[0].order_number);
    if (isNaN(last)) return '1001';

    return (last + 1).toString();
  } catch (err) {
    return Date.now().toString().slice(-6);
  }
}

export async function getOrdersByDateRange(startDate: Date, endDate: Date): Promise<Order[]> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching orders by date:', error);
      return [];
    }
    
    return (data || []).map(order => ({
      id: order.id,
      orderNumber: order.order_number,
      items: order.items as OrderItem[],
      subtotal: parseFloat(order.subtotal) || calculateSubtotal(order.items),
      discount: parseFloat(order.discount) || 0,
      total: parseFloat(order.total),
      status: order.status || 'pending',
      createdAt: order.created_at,
      paymentMethod: order.payment_method,
    }));
  } catch (err) {
    console.error('Error in getOrdersByDateRange:', err);
    return [];
  }
}

export async function getDatabaseStats() {
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('created_at')
      .order('created_at', { ascending: true });
    
    if (error || !orders || orders.length === 0) {
      return {
        totalOrders: 0,
        dateRange: {
          oldest: new Date(),
          newest: new Date()
        }
      };
    }
    
    return {
      totalOrders: orders.length,
      dateRange: {
        oldest: new Date(orders[0].created_at),
        newest: new Date(orders[orders.length - 1].created_at)
      }
    };
  } catch (err) {
    console.error('Error in getDatabaseStats:', err);
    return {
      totalOrders: 0,
      dateRange: {
        oldest: new Date(),
        newest: new Date()
      }
    };
  }
}

export async function getStoreSettings() {
  try {
    const { data, error } = await supabase
      .from('store_settings')
      .select('*')
      .eq('id', 1)
      .single();
    
    if (error || !data) {
      return { 
        storeName: 'Ocean Brew Siargao',
        storeAddress: 'Lopez Jaena St. Brgy. 9 Dapa, Siargao Island',
        storePhone: '0963-927-1591',
        storeEmail: 'hello@oceanbrew.com',
        wifiSSID: 'Ocean Brew WiFi',
        wifiPassword: 'oceanbrew123',
        receiptFooter: 'Thank you for visiting!',
      };
    }
    
    return {
      storeName: data?.store_name || 'Ocean Brew Siargao',
      storeAddress: data?.address || '',
      storePhone: data?.phone || '',
      storeEmail: data?.email || '',
      wifiSSID: data?.wifi_ssid || '',
      wifiPassword: data?.wifi_password || '',
      receiptFooter: data?.receipt_footer || '',
    };
  } catch (err) {
    console.error('Error in getStoreSettings:', err);
    return { 
      storeName: 'Ocean Brew Siargao',
      storeAddress: 'Lopez Jaena St. Brgy. 9 Dapa, Siargao Island',
      storePhone: '0963-927-1591',
      storeEmail: 'hello@oceanbrew.com',
      wifiSSID: 'Ocean Brew WiFi',
      wifiPassword: 'oceanbrew123',
      receiptFooter: 'Thank you for visiting!',
    };
  }
}

export async function saveStoreSettings(settings: any) {
  try {
    const { error } = await supabase
      .from('store_settings')
      .upsert([{
        id: 1,
        store_name: settings.storeName,
        address: settings.storeAddress,
        phone: settings.storePhone,
        email: settings.storeEmail,
        wifi_ssid: settings.wifiSSID,
        wifi_password: settings.wifiPassword,
        receipt_footer: settings.receiptFooter,
        updated_at: new Date().toISOString()
      }]);
    
    if (error) {
      console.error('Error saving settings:', error);
    } else {
      console.log('✅ Settings saved successfully');
    }
  } catch (err) {
    console.error('Error in saveStoreSettings:', err);
  }
}

export async function getDailySales(): Promise<{ date: string; total: number; orderCount: number }[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('created_at, total')
    .eq('status', 'done')
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  const byDay: Record<string, { total: number; count: number }> = {};
  data.forEach(row => {
    // Convert UTC timestamp to Manila-local calendar date (YYYY-MM-DD)
    // so orders placed before 8AM Manila time aren't miscounted on the previous day.
    const date = new Date(row.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    if (!byDay[date]) byDay[date] = { total: 0, count: 0 };
    byDay[date].total += parseFloat(row.total) || 0;
    byDay[date].count += 1;
  });

  return Object.entries(byDay)
    .map(([date, val]) => ({ date, total: val.total, orderCount: val.count }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ─────────────────────────────────────────────
// CATEGORY FUNCTIONS
// ─────────────────────────────────────────────
export const getCategories = async (): Promise<string[]> => {
  const { data, error } = await supabase
    .from('categories')
    .select('name')
    .order('name');
  if (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
  return data.map(c => c.name);
};

export const addCategory = async (name: string): Promise<void> => {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Category name is required');
  const { error } = await supabase
    .from('categories')
    .insert([{ name: trimmed }]);
  if (error) throw error;
};

export const deleteCategory = async (name: string): Promise<void> => {
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('name', name);
  if (error) throw error;
};

export const isCategoryUsed = async (name: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('menu_items')
    .select('id')
    .eq('category', name)
    .limit(1);
  if (error) {
    console.error('Error checking category usage:', error);
    return false;
  }
  return data && data.length > 0;
};
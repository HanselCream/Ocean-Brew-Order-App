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
      .order('name');
    
    if (error) {
      console.error('Error fetching menu:', error);
      return [];
    }

    if (!data) return [];
    
    console.log('📦 Raw menu data:', data);
    
    // Map database fields to your MenuItem type with proper number conversion
    return data.map(item => ({
      id: item.id,
      name: item.name,
      category: item.category,
      // FIX: Use correct column names from database (pricer, not priceR)
      priceR: parseFloat(item.pricer) || 0,
      priceL: item.pricel ? parseFloat(item.pricel) : null,
      available: item.available,
      // FIX: Use correct column name (hassizeoption, not hasSizeOption)
      hasSizeOption: item.hassizeoption || false,
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
      console.log('Saving item:', item.name);
      
      // Check if item exists (has valid id)
      const itemData = {
        id: item.id || crypto.randomUUID(), // Generate ID if new item
        name: item.name,
        category: item.category,
        pricer: item.priceR,
        pricel: item.priceL,
        available: item.available,
        hassizeoption: item.hasSizeOption,
        updated_at: new Date().toISOString()
      };
      
      const { data, error } = await supabase
        .from('menu_items')
        .upsert(itemData)
        .select();
      
      if (error) {
        console.error('❌ Error saving item:', item.name, error);
      } else {
        console.log('✅ Saved item:', item.name, data);
      }
    } catch (err) {
      console.error('❌ Error in saveMenu:', err);
    }
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
    
    // Map database fields to your Order type
    return data.map(order => ({
      id: order.id,
      orderNumber: order.order_number,
      items: order.items as OrderItem[],
      subtotal: parseFloat(order.subtotal) || calculateSubtotal(order.items),
      discount: parseFloat(order.discount) || 0,
      total: parseFloat(order.total),
      status: order.status || 'pending',
      createdAt: order.created_at,
      //paymentMethod: order.payment_method,
    }));
  } catch (err) {
    console.error('Error in getOrders:', err);
    return [];
  }
}

// Helper to calculate subtotal if not stored
function calculateSubtotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => {
    const addOnsTotal = item.customization?.addOns?.reduce((a, ao) => a + ao.price, 0) || 0;
    return sum + (item.basePrice + addOnsTotal) * (item.quantity || 1);
  }, 0);
}

export async function saveOrder(order: Order) {
  try {
    console.log('📤 Attempting to save order:', order);
    
    // Validate required fields
    if (!order.orderNumber) throw new Error('Order missing orderNumber');
    if (!order.items) throw new Error('Order missing items');
    
    // Remove 'id' from the insert - let the database auto-generate it
    const orderData = {
      order_number: order.orderNumber.toString(),
      items: order.items,
      subtotal: order.subtotal,
      discount: order.discount || 0,
      total: order.total,
      status: order.status,
      created_at: order.createdAt,
      // payment_method: order.paymentMethod || null, // Uncomment if you add paymentMethod
    };
    
    console.log('📦 Order data being sent:', JSON.stringify(orderData, null, 2));
    
    const { data, error } = await supabase
      .from('orders')
      .insert([orderData])
      .select();
    
    if (error) {
      console.error('❌ Supabase error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      throw error;
    }
    
    console.log('✅ Order saved successfully:', data);
    
  } catch (err) {
    console.error('❌ Error in saveOrder:', err);
    throw err;
  }
}

export async function updateOrder(id: string, updates: Partial<Order>) {
  try {
    // Convert to database field names
    const dbUpdates: any = {};
    if (updates.status) dbUpdates.status = updates.status;
    if (updates.paymentMethod) dbUpdates.payment_method = updates.paymentMethod;
    
    const { error } = await supabase
      .from('orders')
      .update(dbUpdates)
      .eq('id', id);
    
    if (error) {
      console.error('Error updating order:', error);
      throw error;
    }
  } catch (err) {
    console.error('Error in updateOrder:', err);
    throw err;
  }
}

// ─────────────────────────────────────────────
// ADD-ONS FUNCTIONS
// ─────────────────────────────────────────────
export async function getAddOnItems(): Promise<MenuItem[]> {
  try {
    // First try from add_ons table
    const { data: addOnsData, error: addOnsError } = await supabase
      .from('add_ons')
      .select('*')
      .eq('available', true);
    
    if (!addOnsError && addOnsData && addOnsData.length > 0) {
      return addOnsData.map(item => ({
        id: item.id,
        name: item.name,
        category: 'Add Ons',
        priceR: parseFloat(item.price) || 0,
        priceL: null,
        available: item.available,
        hasSizeOption: false,
      }));
    }
    
    // Fallback to menu_items with category 'Add Ons'
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('category', 'Add Ons')
      .eq('available', true);
    
    if (error) {
      console.error('Error fetching add-ons:', error);
      return [];
    }
    
    return (data || []).map(item => ({
      id: item.id,
      name: item.name,
      category: item.category,
      // FIX: Use correct column names
      priceR: parseFloat(item.pricer) || 0,
      priceL: item.pricel ? parseFloat(item.pricel) : null,
      available: item.available,
      hasSizeOption: item.hassizeoption || false,
    }));
  } catch (err) {
    console.error('Error in getAddOnItems:', err);
    return [];
  }
}

// ─────────────────────────────────────────────
// ORDER NUMBER GENERATION
// ─────────────────────────────────────────────
export async function getNextOrderNumber(): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('order_number')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (error || !data || data.length === 0) {
      return '1001'; // Returns STRING
    }
    
    const lastNum = parseInt(data[0].order_number);
    return (lastNum + 1).toString(); // Returns STRING
  } catch (err) {
    console.error('Error in getNextOrderNumber:', err);
    return '1001'; // Returns STRING
  }
}

// ─────────────────────────────────────────────
// ORDERS BY DATE RANGE
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// DATABASE STATS
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// STORE SETTINGS
// ─────────────────────────────────────────────
export async function getStoreSettings() {
  try {
    const { data, error } = await supabase
      .from('store_settings')
      .select('*')
      .eq('id', 1)
      .single();
    
    if (error) {
      console.error('Error fetching settings:', error);
      return { 
        storeName: 'Ocean Brew', 
        address: '',
        phone: '',
        receiptHeader: '',
        receiptFooter: '' 
      };
    }
    
    return {
      storeName: data?.store_name || 'Ocean Brew',
      address: data?.address || '',
      phone: data?.phone || '',
      receiptHeader: data?.receipt_header || '',
      receiptFooter: data?.receipt_footer || '',
    };
  } catch (err) {
    console.error('Error in getStoreSettings:', err);
    return { 
      storeName: 'Ocean Brew', 
      address: '',
      phone: '',
      receiptHeader: '',
      receiptFooter: '' 
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
        address: settings.address,
        phone: settings.phone,
        receipt_header: settings.receiptHeader,
        receipt_footer: settings.receiptFooter,
        updated_at: new Date().toISOString()
      }]);
    
    if (error) console.error('Error saving settings:', error);
  } catch (err) {
    console.error('Error in saveStoreSettings:', err);
  }
}
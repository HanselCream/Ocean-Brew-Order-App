import { MenuItem, Order } from './types';
import { DEFAULT_MENU } from './pricelist';

const MENU_KEY = 'ocean-brew-menu';
const ORDERS_KEY = 'ocean-brew-orders';
const ORDER_COUNTER_KEY = 'ocean-brew-order-counter';

// ── Menu ──
export function getMenu(): MenuItem[] {
  if (typeof window === 'undefined') return DEFAULT_MENU;
  const raw = localStorage.getItem(MENU_KEY);
  if (!raw) {
    localStorage.setItem(MENU_KEY, JSON.stringify(DEFAULT_MENU));
    return DEFAULT_MENU;
  }
  return JSON.parse(raw);
}

export function saveMenu(menu: MenuItem[]) {
  localStorage.setItem(MENU_KEY, JSON.stringify(menu));
}

// ── Orders ──
export function getOrders(): Order[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(ORDERS_KEY);
  if (!raw) return [];
  const orders: Order[] = JSON.parse(raw);
  // Auto-delete orders older than 30 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const filtered = orders.filter(o => new Date(o.createdAt) >= cutoff);
  if (filtered.length !== orders.length) {
    localStorage.setItem(ORDERS_KEY, JSON.stringify(filtered));
  }
  return filtered;
}

export function saveOrder(order: Order) {
  const orders = getOrders();
  orders.push(order);
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
}

export function updateOrder(orderId: string, updates: Partial<Order>) {
  const orders = getOrders();
  const idx = orders.findIndex(o => o.id === orderId);
  if (idx !== -1) {
    orders[idx] = { ...orders[idx], ...updates };
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  }
}

// ── Order Counter ──
export function getNextOrderNumber(): number {
  if (typeof window === 'undefined') return 1;
  const todayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const raw = localStorage.getItem(ORDER_COUNTER_KEY);
  let data: { date: string; counter: number } = raw ? JSON.parse(raw) : null;
  if (!data || data.date !== todayKey) {
    data = { date: todayKey, counter: 1 };
  } else {
    data.counter += 1;
  }
  localStorage.setItem(ORDER_COUNTER_KEY, JSON.stringify(data));
  return data.counter;
}

// ── Add-Ons helper ──
export function getAddOnItems(): MenuItem[] {
  return getMenu().filter(m => m.category === 'Add Ons' && m.available);
}

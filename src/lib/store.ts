import { MenuItem, Order } from './types';
import { DEFAULT_MENU } from './pricelist';
import DatabaseService from './database';

const MENU_KEY = 'ocean-brew-menu';
const ORDER_COUNTER_KEY = 'ocean-brew-order-counter';
const STORE_SETTINGS_KEY = 'ocean-brew-store-settings';

// ── Menu (LocalStorage - small data) ──
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

// ── Orders (IndexedDB - large data, 30 days retention) ──
export async function getOrders(): Promise<Order[]> {
  return DatabaseService.getAllOrders();
}

export async function saveOrder(order: Order) {
  await DatabaseService.saveOrder(order);
  // Auto-clean orders older than 30 days
  await DatabaseService.cleanOldOrders();
}

export async function updateOrder(orderId: string, updates: Partial<Order>) {
  const orders = await DatabaseService.getAllOrders();
  const order = orders.find(o => o.id === orderId);
  if (order) {
    const updatedOrder = { ...order, ...updates };
    await DatabaseService.saveOrder(updatedOrder);
  }
}

export async function deleteOrder(orderId: string) {
  // Not implemented - we keep orders for 30 days
  console.log('Orders are automatically deleted after 30 days');
}

// ── Store Settings (LocalStorage) ──
const DEFAULT_STORE_SETTINGS = {
  storeName: 'Ocean Brew',
  storeAddress: '123 Coffee Street, Barista City',
  storePhone: '+63 912 345 6789',
  storeEmail: 'hello@oceanbrew.com',
  taxNumber: '',
  wifiSSID: 'Ocean Brew WiFi',
  wifiPassword: 'oceanbrew123',
  receiptFooter: 'Thank you for choosing Ocean Brew!',
  printerSettings: []
};

export function getStoreSettings() {
  if (typeof window === 'undefined') return DEFAULT_STORE_SETTINGS;
  const raw = localStorage.getItem(STORE_SETTINGS_KEY);
  if (!raw) {
    localStorage.setItem(STORE_SETTINGS_KEY, JSON.stringify(DEFAULT_STORE_SETTINGS));
    return DEFAULT_STORE_SETTINGS;
  }
  return JSON.parse(raw);
}

export function saveStoreSettings(settings: any) {
  localStorage.setItem(STORE_SETTINGS_KEY, JSON.stringify(settings));
}

// ── Order Counter (LocalStorage - resets daily) ──
export function getNextOrderNumber(): number {
  if (typeof window === 'undefined') return 1;
  const todayKey = new Date().toISOString().slice(0, 10);
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

// ── Initialize database on app start ──
export async function initializeApp() {
  await DatabaseService.init();
  console.log('✅ Ocean Brew Database ready');
}

// ── Export functions for ReportsScreen ──
export async function getOrdersByDateRange(startDate: Date, endDate: Date): Promise<Order[]> {
  return DatabaseService.getOrdersByDateRange(startDate, endDate);
}

export async function getOrdersByMonth(year: number, month: number): Promise<Order[]> {
  return DatabaseService.getOrdersByMonth(year, month);
}

export async function getDatabaseStats() {
  return DatabaseService.getStats();
}
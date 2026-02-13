// src/lib/types.ts
export interface MenuItem {
  id: string;
  name: string;
  category: string;
  priceR: number;
  priceL: number | null;
  available: boolean;
  hasSizeOption: boolean;
}

export interface AddOn {
  id: string;
  name: string;
  price: number;
}

export type SugarLevel = '0%' | '25%' | '50%' | '75%' | '100%';
export type IceLevel = 'No Ice' | 'Less Ice' | 'Normal Ice';
export type Size = 'R' | 'L';

export interface OrderItemCustomization {
  size: Size;
  temperature?: 'Hot' | 'Cold'; // NEW: Optional, only for Espresso
  sugar: SugarLevel;
  ice: IceLevel;
  addOns: { id: string; name: string; price: number }[];
  discount: { type: 'percent' | 'fixed'; value: number } | null;
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  category: string;
  basePrice: number;
  customization: OrderItemCustomization;
  quantity: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  orderNumber: number;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  total: number;
  createdAt: string;
  status: 'pending' | 'done';
}

export const CATEGORIES = [
  'Add Ons',
  'Add Ons (Espresso)',
  'Appetizers',
  'Barako Coffee',
  'Cheesecake',
  'Classic',
  'Cream Soda',
  'Espresso',
  'Iced Tea',
  'Island Pop',
  'Refreshers',
  'Rock Salt and Cheese',
  'Merchandise',
  'Supplies',
] as const;

export type Category = typeof CATEGORIES[number];
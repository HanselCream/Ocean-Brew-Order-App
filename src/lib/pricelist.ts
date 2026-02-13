import { MenuItem } from './types';

// Default pricelist for Ocean Brew
// hasSizeOption: true means R/L sizes available
// priceR = Regular (or single price), priceL = Large
export const DEFAULT_MENU: MenuItem[] = [
  // ── Add Ons ──
  { id: 'ao-1', name: 'Rock Salt and Cheese', category: 'Add Ons', priceR: 35, priceL: null, available: true, hasSizeOption: false },
  { id: 'ao-2', name: 'Nata de Coco', category: 'Add Ons', priceR: 10, priceL: null, available: true, hasSizeOption: false },
  { id: 'ao-3', name: 'Crushed Oreos', category: 'Add Ons', priceR: 10, priceL: null, available: true, hasSizeOption: false },
  { id: 'ao-4', name: 'Cheesecake', category: 'Add Ons', priceR: 55, priceL: null, available: true, hasSizeOption: false },
  { id: 'ao-5', name: 'Black Pearls', category: 'Add Ons', priceR: 10, priceL: null, available: true, hasSizeOption: false },

  // ── Add Ons (Espresso) ──
  { id: 'aoe-1', name: 'Whipped Cream', category: 'Add Ons (Espresso)', priceR: 25, priceL: null, available: true, hasSizeOption: false },
  { id: 'aoe-2', name: 'Extra Syrup', category: 'Add Ons (Espresso)', priceR: 25, priceL: null, available: true, hasSizeOption: false },
  { id: 'aoe-3', name: 'Extra Sauce', category: 'Add Ons (Espresso)', priceR: 25, priceL: null, available: true, hasSizeOption: false },
  { id: 'aoe-4', name: 'Espresso Shot', category: 'Add Ons (Espresso)', priceR: 55, priceL: null, available: true, hasSizeOption: false },
  { id: 'aoe-5', name: 'Cold Foam', category: 'Add Ons (Espresso)', priceR: 30, priceL: null, available: true, hasSizeOption: false },

  // ── Appetizers ──
  { id: 'ap-1', name: 'Hotdog Roll (1)', category: 'Appetizers', priceR: 30, priceL: null, available: true, hasSizeOption: false },
  { id: 'ap-2', name: 'Hotdog Rolls (3)', category: 'Appetizers', priceR: 90, priceL: null, available: true, hasSizeOption: false },
  { id: 'ap-3', name: 'Hotdog Rolls (6)', category: 'Appetizers', priceR: 180, priceL: null, available: true, hasSizeOption: false },
  { id: 'ap-4', name: 'Hotdog Rolls (1 Dozen)', category: 'Appetizers', priceR: 360, priceL: null, available: true, hasSizeOption: false },
  { id: 'ap-5', name: 'Nachos', category: 'Appetizers', priceR: 100, priceL: null, available: true, hasSizeOption: false },
  { id: 'ap-6', name: 'Quesadillas', category: 'Appetizers', priceR: 75, priceL: null, available: true, hasSizeOption: false },

  // ── Barako Coffee ──
  { id: 'bc-1', name: 'Iced Coffee Latte', category: 'Barako Coffee', priceR: 75, priceL: 95, available: true, hasSizeOption: true },
  { id: 'bc-2', name: 'Cold Brew', category: 'Barako Coffee', priceR: 65, priceL: 85, available: true, hasSizeOption: true },
  { id: 'bc-3', name: 'Brewed Coffee', category: 'Barako Coffee', priceR: 65, priceL: null, available: true, hasSizeOption: false },

  // ── Cheesecake ──
  { id: 'ck-1', name: 'Wintermelon CC', category: 'Cheesecake', priceR: 130, priceL: 150, available: true, hasSizeOption: true },
  { id: 'ck-2', name: 'Taro CC', category: 'Cheesecake', priceR: 130, priceL: 150, available: true, hasSizeOption: true },
  { id: 'ck-3', name: 'Oreo CC', category: 'Cheesecake', priceR: 130, priceL: 150, available: true, hasSizeOption: true },
  { id: 'ck-4', name: 'Okinawa CC', category: 'Cheesecake', priceR: 130, priceL: 150, available: true, hasSizeOption: true },
  { id: 'ck-5', name: 'Matcha CC', category: 'Cheesecake', priceR: 130, priceL: 150, available: true, hasSizeOption: true },
  { id: 'ck-6', name: 'Hokkaido CC', category: 'Cheesecake', priceR: 130, priceL: 150, available: true, hasSizeOption: true },
  { id: 'ck-7', name: 'Dark Choco CC', category: 'Cheesecake', priceR: 130, priceL: 150, available: true, hasSizeOption: true },

  // ── Classic ──
  { id: 'cl-1', name: 'Wintermelon', category: 'Classic', priceR: 75, priceL: 95, available: true, hasSizeOption: true },
  { id: 'cl-2', name: 'Taro', category: 'Classic', priceR: 75, priceL: 95, available: true, hasSizeOption: true },
  { id: 'cl-3', name: 'Oreo', category: 'Classic', priceR: 75, priceL: 95, available: true, hasSizeOption: true },
  { id: 'cl-4', name: 'Okinawa', category: 'Classic', priceR: 75, priceL: 95, available: true, hasSizeOption: true },
  { id: 'cl-5', name: 'Matcha', category: 'Classic', priceR: 75, priceL: 95, available: true, hasSizeOption: true },
  { id: 'cl-6', name: 'Hokkaido', category: 'Classic', priceR: 75, priceL: 95, available: true, hasSizeOption: true },
  { id: 'cl-7', name: 'Dark Choco', category: 'Classic', priceR: 75, priceL: 95, available: true, hasSizeOption: true },

  // ── Cream Soda ──
  { id: 'cs-1', name: 'Blue Eclipse', category: 'Cream Soda', priceR: 130, priceL: null, available: true, hasSizeOption: false },
  { id: 'cs-2', name: 'Red Bloom', category: 'Cream Soda', priceR: 130, priceL: null, available: true, hasSizeOption: false },

  // ── Espresso ──
  { id: 'es-1', name: 'Americano', category: 'Espresso', priceR: 130, priceL: null, available: true, hasSizeOption: false },
  { id: 'es-2', name: 'Cappuccino', category: 'Espresso', priceR: 130, priceL: null, available: true, hasSizeOption: false },
  { id: 'es-3', name: 'Caramel Machiatto', category: 'Espresso', priceR: 170, priceL: null, available: true, hasSizeOption: false },
  { id: 'es-4', name: 'French Vanilla', category: 'Espresso', priceR: 170, priceL: null, available: true, hasSizeOption: false },
  { id: 'es-5', name: 'Mocha', category: 'Espresso', priceR: 170, priceL: null, available: true, hasSizeOption: false },
  { id: 'es-6', name: 'Sea Salt Latte', category: 'Espresso', priceR: 150, priceL: null, available: true, hasSizeOption: false },
  { id: 'es-7', name: 'Spanish Latte', category: 'Espresso', priceR: 150, priceL: null, available: true, hasSizeOption: false },
  { id: 'es-8', name: 'White Chocolate Mocha', category: 'Espresso', priceR: 170, priceL: null, available: true, hasSizeOption: false },

  // ── Iced Tea ──
  { id: 'it-1', name: 'Yuzu Calamansi Iced Tea', category: 'Iced Tea', priceR: 110, priceL: null, available: true, hasSizeOption: false },

  // ── Island Pop ──
  { id: 'ip-1', name: 'Daku', category: 'Island Pop', priceR: 110, priceL: null, available: true, hasSizeOption: false },
  { id: 'ip-2', name: 'Guyam', category: 'Island Pop', priceR: 110, priceL: null, available: true, hasSizeOption: false },
  { id: 'ip-3', name: 'Naked Island', category: 'Island Pop', priceR: 110, priceL: null, available: true, hasSizeOption: false },

  // ── Refreshers ──
  { id: 'rf-1', name: 'Lychee', category: 'Refreshers', priceR: 60, priceL: 80, available: true, hasSizeOption: true },
  { id: 'rf-2', name: 'Passion Fruit', category: 'Refreshers', priceR: 60, priceL: 80, available: true, hasSizeOption: true },
  { id: 'rf-3', name: 'Strawberry', category: 'Refreshers', priceR: 60, priceL: 80, available: true, hasSizeOption: true },

  // ── Rock Salt and Cheese ──
  { id: 'rs-1', name: 'Wintermelon RSC', category: 'Rock Salt and Cheese', priceR: 110, priceL: 130, available: true, hasSizeOption: true },
  { id: 'rs-2', name: 'Taro RSC', category: 'Rock Salt and Cheese', priceR: 110, priceL: 130, available: true, hasSizeOption: true },
  { id: 'rs-3', name: 'Oreo RSC', category: 'Rock Salt and Cheese', priceR: 110, priceL: 130, available: true, hasSizeOption: true },
  { id: 'rs-4', name: 'Okinawa RSC', category: 'Rock Salt and Cheese', priceR: 110, priceL: 130, available: true, hasSizeOption: true },
  { id: 'rs-5', name: 'Matcha RSC', category: 'Rock Salt and Cheese', priceR: 110, priceL: 130, available: true, hasSizeOption: true },
  { id: 'rs-6', name: 'Hokkaido RSC', category: 'Rock Salt and Cheese', priceR: 110, priceL: 130, available: true, hasSizeOption: true },
  { id: 'rs-7', name: 'Dark Choco RSC', category: 'Rock Salt and Cheese', priceR: 110, priceL: 130, available: true, hasSizeOption: true },

  // ── Merchandise ──
  { id: 'mc-1', name: 'Ocean Brew Tshirt (White)', category: 'Merchandise', priceR: 650, priceL: null, available: true, hasSizeOption: false },
  { id: 'mc-2', name: 'Ocean Brew Tshirt (Black)', category: 'Merchandise', priceR: 650, priceL: null, available: true, hasSizeOption: false },
  { id: 'mc-3', name: "Ocean Brew Fisherman's Hat (White)", category: 'Merchandise', priceR: 350, priceL: null, available: true, hasSizeOption: false },
  { id: 'mc-4', name: "Ocean Brew Fisherman's Hat (Black)", category: 'Merchandise', priceR: 350, priceL: null, available: true, hasSizeOption: false },
  { id: 'mc-5', name: 'Ocean Brew Bucket Hat (White)', category: 'Merchandise', priceR: 350, priceL: null, available: true, hasSizeOption: false },
  { id: 'mc-6', name: 'Ocean Brew Bucket Hat (Black)', category: 'Merchandise', priceR: 350, priceL: null, available: true, hasSizeOption: false },
  { id: 'mc-7', name: 'Ocean Brew Mug (White)', category: 'Merchandise', priceR: 150, priceL: null, available: true, hasSizeOption: false },
  { id: 'mc-8', name: 'Ocean Brew Mug (Black)', category: 'Merchandise', priceR: 150, priceL: null, available: true, hasSizeOption: false },
  { id: 'mc-9', name: 'Ocean Brew Umbrella (White)', category: 'Merchandise', priceR: 350, priceL: null, available: true, hasSizeOption: false },
  { id: 'mc-10', name: 'Ocean Brew Umbrella (Black)', category: 'Merchandise', priceR: 350, priceL: null, available: true, hasSizeOption: false },

  // ── Supplies ──
  { id: 'sp-1', name: 'Dabba Cup', category: 'Supplies', priceR: 20, priceL: null, available: true, hasSizeOption: false },
  { id: 'sp-2', name: 'Dabba Cup (Ice)', category: 'Supplies', priceR: 35, priceL: null, available: true, hasSizeOption: false },
  { id: 'sp-3', name: 'Loyalty Card', category: 'Supplies', priceR: 20, priceL: null, available: true, hasSizeOption: false },
];

// lib/database.ts
import { Order } from './types';

const DB_NAME = 'OceanBrewDB';
const DB_VERSION = 1;
const STORE_NAME = 'orders';

class DatabaseService {
  private static instance: DatabaseService;
  private db: IDBDatabase | null = null;

  private constructor() {}

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  // Initialize database
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('❌ Database error:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        console.log('✅ IndexedDB connected');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create orders store
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          store.createIndex('orderNumber', 'orderNumber', { unique: true });
          store.createIndex('status', 'status', { unique: false });
          console.log('✅ Database schema created');
        }
      };
    });
  }

  // Save order
  async saveOrder(order: Order): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(order);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        console.log(`✅ Order #${order.orderNumber} saved`);
        resolve();
      };
    });
  }

  // Get all orders
  async getAllOrders(): Promise<Order[]> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const orders = request.result || [];
        resolve(orders.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ));
      };
    });
  }

  // Get orders by date range
  async getOrdersByDateRange(startDate: Date, endDate: Date): Promise<Order[]> {
    const orders = await this.getAllOrders();
    
    return orders.filter(order => {
      const orderDate = new Date(order.createdAt);
      return orderDate >= startDate && orderDate <= endDate;
    });
  }

  // Get orders by status
  async getOrdersByStatus(status: 'pending' | 'done'): Promise<Order[]> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('status');
      const request = index.getAll(status);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  // Get orders by month/year
  async getOrdersByMonth(year: number, month: number): Promise<Order[]> {
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0, 23, 59, 59);
    return this.getOrdersByDateRange(startDate, endDate);
  }

  // Update order status
  async updateOrderStatus(orderId: string, status: 'pending' | 'done'): Promise<void> {
    const orders = await this.getAllOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order) throw new Error('Order not found');
    
    order.status = status;
    await this.saveOrder(order);
  }

  // Delete old orders (keep 30 days)
  async cleanOldOrders(): Promise<void> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const orders = await this.getAllOrders();
    const oldOrders = orders.filter(order => 
      new Date(order.createdAt) < thirtyDaysAgo
    );

    if (oldOrders.length === 0) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      transaction.oncomplete = () => {
        console.log(`✅ Auto-deleted ${oldOrders.length} orders older than 30 days`);
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);

      oldOrders.forEach(order => {
        store.delete(order.id);
      });
    });
  }

  // Get database stats
  async getStats(): Promise<{ totalOrders: number; dateRange: { oldest: Date; newest: Date } }> {
    const orders = await this.getAllOrders();
    
    if (orders.length === 0) {
      return {
        totalOrders: 0,
        dateRange: { oldest: new Date(), newest: new Date() }
      };
    }

    const dates = orders.map(o => new Date(o.createdAt));
    return {
      totalOrders: orders.length,
      dateRange: {
        oldest: new Date(Math.min(...dates.map(d => d.getTime()))),
        newest: new Date(Math.max(...dates.map(d => d.getTime())))
      }
    };
  }

  // Clear all orders (admin only)
  async clearAllOrders(): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        console.log('✅ All orders cleared');
        resolve();
      };
    });
  }
}

export default DatabaseService.getInstance();
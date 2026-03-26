// lib/printerService.ts

declare global {
  interface Navigator {
    bluetooth: Bluetooth;
  }
}

interface Bluetooth {
  requestDevice(options: {
    acceptAllDevices?: boolean;
    filters?: Array<{
      services?: string[];
      name?: string;
      namePrefix?: string;
      manufacturerData?: Array<{
        companyIdentifier: number;
        dataPrefix?: BufferSource;
        mask?: BufferSource;
      }>;
      serviceData?: Array<{
        service: string;
        dataPrefix?: BufferSource;
        mask?: BufferSource;
      }>;
    }>;
    optionalServices?: string[];
  }): Promise<BluetoothDevice>;
}
interface BluetoothDevice {
  id: string;
  name?: string;
  gatt?: BluetoothRemoteGATTServer;
}

interface BluetoothRemoteGATTServer {
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(characteristic: string): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTCharacteristic {
  writeValue(value: BufferSource): Promise<void>;
}

class PrinterService {
  private static instance: PrinterService;
  private bluetoothDevice: BluetoothDevice | null = null;
  private printerCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  
  // Standard ESC/POS printer service UUIDs
  private readonly PRINTER_SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
  private readonly PRINTER_CHARACTERISTIC_UUID = '00002af1-0000-1000-8000-00805f9b34fb';
  
  // Alternative common printer UUIDs
  private readonly ALTERNATIVE_SERVICE_UUIDS = [
    '000018f0-0000-1000-8000-00805f9b34fb', // Standard
    '0000ae30-0000-1000-8000-00805f9b34fb', // BLE Printer
    '0000ff00-0000-1000-8000-00805f9b34fb', // Generic
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Star Micronics
    '00002356-0000-1000-8000-00805f9b34fb'  // BLE UART
  ];

  private constructor() {}

  static getInstance(): PrinterService {
    if (!PrinterService.instance) {
      PrinterService.instance = new PrinterService();
    }
    return PrinterService.instance;
  }

  /**
   * REQUEST PRINTER - Works with ANY Bluetooth device
   */
  async requestPrinter(): Promise<{ id: string; name: string }> {
    try {
      if (!navigator.bluetooth) {
        throw new Error('Bluetooth not supported in this browser');
      }

      console.log('🔵 Requesting Bluetooth device...');

      this.bluetoothDevice = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: this.ALTERNATIVE_SERVICE_UUIDS
      });

      const deviceName = this.bluetoothDevice.name || 'Unknown Device';
      console.log(`✅ Found device: ${deviceName} (${this.bluetoothDevice.id})`);
      
      return {
        id: this.bluetoothDevice.id,
        name: deviceName
      };
    } catch (error) {
      console.error('❌ Failed to request printer:', error);
      throw error;
    }
  }
  
  /**
   * CONNECT TO PRINTER - Works with thermal printers AND phones
   */
  async connectToPrinter(): Promise<boolean> {
    try {
      if (!this.bluetoothDevice) {
        await this.requestPrinter();
      }

      if (!this.bluetoothDevice) {
        throw new Error('No printer selected');
      }

      console.log(`🔌 Connecting to ${this.bluetoothDevice.name}...`);
      
      const server = await this.bluetoothDevice.gatt?.connect();
      if (!server) throw new Error('Failed to connect to GATT server');
      
      console.log(`✅ Connected to ${this.bluetoothDevice.name}`);
      
      // TRY to find printer service (for real thermal printers)
      for (const serviceUuid of this.ALTERNATIVE_SERVICE_UUIDS) {
        try {
          console.log(`🔍 Looking for service: ${serviceUuid}`);
          const service = await server.getPrimaryService(serviceUuid);
          
          // Try to find characteristic
          try {
            this.printerCharacteristic = await service.getCharacteristic(this.PRINTER_CHARACTERISTIC_UUID);
            console.log(`✅ Found ESC/POS printer service!`);
            break;
          } catch (e) {
            console.log(`⚠️ No characteristic found for service: ${serviceUuid}`);
          }
        } catch (e) {
          // Service not found, try next one
          continue;
        }
      }
      
      // If no printer service found, device is in TEST MODE
      if (!this.printerCharacteristic) {
        console.log('📱 TEST MODE - Connected to:', this.bluetoothDevice.name);
        console.log('🖨️ Real thermal printer not detected - using alert mode');
      }
      
      return true;
    } catch (error) {
      console.error('❌ Failed to connect to printer:', error);
      throw error;
    }
  }

  /**
   * DISCONNECT PRINTER
   */
  async disconnectPrinter(): Promise<void> {
    try {
      if (this.bluetoothDevice?.gatt?.connected) {
        await this.bluetoothDevice.gatt.disconnect();
        console.log(`🔌 Disconnected from ${this.bluetoothDevice.name}`);
      }
    } catch (error) {
      console.error('Failed to disconnect printer:', error);
    } finally {
      this.printerCharacteristic = null;
      this.bluetoothDevice = null;
    }
  }

  /**
   * PRINT RAW TEXT - Send plain text directly to printer
   */
  async printRawText(text: string): Promise<void> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text + '\n\n\n');
    
    if (this.printerCharacteristic) {
      // Write in chunks to avoid Bluetooth buffer issues
      const chunkSize = 256;
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        await this.printerCharacteristic.writeValue(chunk);
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      console.log('✅ Raw text printed successfully');
    } else {
      // Test mode: show alert with the text
      alert(`PRINT PREVIEW (no printer):\n${text}`);
    }
  }

  /**
   * PRINT RECEIPT - Works with BOTH:
   * - Real thermal printer → Sends ESC/POS commands
   * - Phone/Tablet → Shows alert with receipt
   */
async printReceipt(order: any, settings: any): Promise<void> {
  // FIX: Hardcoded defaults as ultimate backup
  console.log('🟢🟢🟢 PRINTER SERVICE DEBUG START 🟢🟢🟢');
  console.log('Order received in printer service:', order);
  console.log('Order number:', order.orderNumber);
  console.log('Order items:', order.items);
  console.log('Order items length:', order.items?.length);
  console.log('First item:', order.items?.[0]);
  console.log('🟢🟢🟢 PRINTER SERVICE DEBUG END 🟢🟢🟢');
  
  const DEFAULT_SETTINGS = {
    storeName: 'Ocean Brew Siargao',
    storeAddress: 'Lopez Jaena St. Brgy. 9 Dapa,    Siargao Island',
    storePhone: '0963-927-1591',
    storeEmail: 'oceanbrew.siargao@gmail.com',
    wifiSSID: 'Ocean Brew WiFi',
    wifiPassword: 'AGBOB2024',
    receiptFooter: 'Thank you for visiting!'
  };

  // Merge settings with defaults (settings overrides defaults)
  const safeSettings = {
    ...DEFAULT_SETTINGS,
    ...(settings || {})
  };

  console.log('🖨️ Printing with settings:', safeSettings); // Debug

  const receipt = this.generateReceiptText(order, safeSettings);

  console.log('🧾 RECEIPT PREVIEW START');
  console.log('----------------------------');
  console.log(receipt);
  console.log('----------------------------');
  console.log('🧾 RECEIPT PREVIEW END');
  // CASE 1: REAL THERMAL PRINTER CONNECTED
  if (this.printerCharacteristic) {
    try {
      console.log('🖨️ Printing to thermal printer...');
      const commands = this.createESCPOSCommands(receipt);
      
      const chunkSize = 512;
      for (let i = 0; i < commands.length; i += chunkSize) {
        const chunk = commands.slice(i, i + chunkSize);
        await this.printerCharacteristic.writeValue(chunk);
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      
      console.log('✅ Receipt printed successfully!');
      return;
    } catch (error) {
      console.error('❌ Thermal printer error:', error);
    }
  }
  
  // CASE 2: TEST MODE
  this.showTestReceipt(order, safeSettings, receipt);
}
  /**
   * SHOW TEST RECEIPT - For phone testing
   */
  private showTestReceipt(order: any, settings: any, receipt: string): void {
    const deviceName = this.bluetoothDevice?.name || 'Test Mode';
    
    // Show in ALERT
    alert(`🖨️ RECEIPT PRINTED TO: ${deviceName}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Order #: ${order.orderNumber}
Total: ₱${order.total}
WiFi: ${settings.wifiSSID}
Pass: ${settings.wifiPassword}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Full receipt in console`);

    // Show in CONSOLE
    console.log('%c🖨️ RECEIPT', 'font-size: 16px; color: green; font-weight: bold');
    console.log('='.repeat(50));
    console.log(`Device: ${deviceName}`);
    console.log('='.repeat(50));
    console.log(receipt);
    console.log('='.repeat(50));
  }

  /**
   * GENERATE RECEIPT TEXT
   */
  
private generateReceiptText(order: any, settings: any): string {
  const date = new Date(order.createdAt).toLocaleString();
  let receipt = '';

  // Header
  receipt += `${settings.storeName}\n`;
  receipt += '='.repeat(32) + '\n';
  receipt += `${settings.storeAddress}\n`;
  receipt += `Tel: ${settings.storePhone}\n`;
  if (settings.storeEmail) receipt += `${settings.storeEmail}\n`;
  receipt += '='.repeat(32) + '\n\n';

  // Order info
  receipt += `Order #: ${order.orderNumber}\n`;
  receipt += `Date: ${date}\n`;
  receipt += '-'.repeat(32) + '\n\n';

  // Items – NO PESO SYMBOL, NO DASHES
  receipt += 'ITEMS\n';
  receipt += '-'.repeat(32) + '\n';

  if (order.items && order.items.length > 0) {
    for (const item of order.items) {
      const qty = item.quantity || 1;
      const name = (item.name || 'Item').substring(0, 24);
      const price = (item.lineTotal || (item.basePrice * qty)).toFixed(2);
      receipt += `${qty}x ${name}  PHP ${price}\n`;
    }
  } else {
    receipt += '*** NO ITEMS ***\n';
  }

  receipt += '-'.repeat(32) + '\n';
  receipt += `Subtotal: PHP ${(order.subtotal || 0).toFixed(2)}\n`;

  if (order.discount && order.discount > 0) {
    receipt += `Discount: - PHP ${order.discount.toFixed(2)}\n`;
  }

  receipt += `TOTAL: PHP ${(order.total || 0).toFixed(2)}\n`;
  receipt += '='.repeat(32) + '\n\n';

  // WiFi (plain ASCII)
  if (settings.wifiSSID && settings.wifiPassword) {
    receipt += `WiFi: ${settings.wifiSSID}\n`;
    receipt += `Pass: ${settings.wifiPassword}\n\n`;
  }

  // Footer
  receipt += `${settings.receiptFooter || 'Thank you!'}\n`;
  receipt += 'Visit us again!\n\n\n';

  console.log('🔴 FINAL ASCII RECEIPT:\n', receipt);
  return receipt;
}

/**
 * CREATE ESC/POS COMMANDS - Simplified for generic 58mm thermal printers
 */
private createESCPOSCommands(text: string): Uint8Array {
  // Convert to simple ASCII, ensure line feeds
  const clean = text.replace(/[^\x20-\x7E\n]/g, '');
  const encoder = new TextEncoder();
  return encoder.encode(clean + '\n\n\n');
}

  /**
   * CHECK CONNECTION STATUS
   */
  isConnected(): boolean {
    return !!(this.bluetoothDevice?.gatt?.connected);
  }

  /**
   * GET DEVICE NAME
   */
  getDeviceName(): string {
    return this.bluetoothDevice?.name || 'No Device';
  }

  /**
   * GET CONNECTION TYPE
   */
  getConnectionType(): 'thermal' | 'test' | 'none' {
    if (!this.bluetoothDevice?.gatt?.connected) return 'none';
    if (this.printerCharacteristic) return 'thermal';
    return 'test';
  }
}

// Export singleton instance
const printerService = PrinterService.getInstance();
export default printerService;
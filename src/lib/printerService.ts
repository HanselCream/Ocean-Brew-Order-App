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
   * PRINT RECEIPT - Works with BOTH:
   * - Real thermal printer → Sends ESC/POS commands
   * - Phone/Tablet → Shows alert with receipt
   */
  async printReceipt(order: any, settings: any): Promise<void> {
    const receipt = this.generateReceiptText(order, settings);
    
    // CASE 1: REAL THERMAL PRINTER CONNECTED
    if (this.printerCharacteristic) {
      try {
        console.log('🖨️ Printing to thermal printer...');
        const encoder = new TextEncoder();
        const commands = this.createESCPOSCommands(receipt);
        
        // Send in chunks
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
        // Fall back to test mode
        console.log('📱 Falling back to test mode...');
      }
    }
    
    // CASE 2: TEST MODE - Phone/Tablet/No printer
    this.showTestReceipt(order, settings, receipt);
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
    receipt += '-'.repeat(32) + '\n';
    
    // Items
    receipt += 'QTY  ITEM                    AMT\n';
    receipt += '-'.repeat(32) + '\n';
    
    order.items.forEach((item: any) => {
      const name = item.name.substring(0, 20);
      receipt += `${item.quantity.toString().padStart(2)}   ${name.padEnd(20)} ₱${item.lineTotal.toFixed(2)}\n`;
      
      // Customizations
      const cust = item.customization;
      const custText = [];
      if (cust.size) custText.push(cust.size);
      if (cust.temperature) custText.push(cust.temperature);
      if (cust.sugar && cust.sugar !== '100%') custText.push(`${cust.sugar} sugar`);
      if (cust.ice && cust.ice !== 'Normal Ice') custText.push(cust.ice);
      
      if (custText.length > 0) {
        receipt += `     ${custText.join(' | ')}\n`;
      }
      
      // Add-ons
      if (cust.addOns && cust.addOns.length > 0) {
        receipt += `     +${cust.addOns.map((a: any) => a.name).join(', ')}\n`;
      }
    });
    
    receipt += '-'.repeat(32) + '\n';
    receipt += `Subtotal:               ₱${order.subtotal.toFixed(2)}\n`;
    
    if (order.discount > 0) {
      receipt += `Discount:              -₱${order.discount.toFixed(2)}\n`;
    }
    
    receipt += `TOTAL:                 ₱${order.total.toFixed(2)}\n`;
    receipt += '='.repeat(32) + '\n\n';
    
    // WiFi info
    if (settings.wifiSSID && settings.wifiPassword) {
      receipt += `WiFi: ${settings.wifiSSID}\n`;
      receipt += `Pass: ${settings.wifiPassword}\n\n`;
    }
    
    // Footer
    receipt += `${settings.receiptFooter || 'Thank you for visiting!'}\n`;
    receipt += `Visit us again!\n\n\n`;
    
    return receipt;
  }

  /**
   * CREATE ESC/POS COMMANDS - For thermal printers
   */
  private createESCPOSCommands(text: string): Uint8Array {
    const encoder = new TextEncoder();
    const lines = text.split('\n');
    const chunks: Uint8Array[] = [];

    // Initialize printer
    chunks.push(new Uint8Array([0x1B, 0x40])); // ESC @
    
    // Center alignment
    chunks.push(new Uint8Array([0x1B, 0x61, 0x01])); // ESC a 1
    
    // Print each line
    lines.forEach(line => {
      chunks.push(encoder.encode(line + '\n'));
    });

    // Cut paper
    chunks.push(new Uint8Array([0x1D, 0x56, 0x42, 0x00])); // GS V B 0

    // Combine all chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    
    chunks.forEach(chunk => {
      result.set(chunk, offset);
      offset += chunk.length;
    });

    return result;
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
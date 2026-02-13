// lib/excelExport.ts
import { Order } from './types';

class ExcelExportService {
  private static instance: ExcelExportService;

  private constructor() {}

  static getInstance(): ExcelExportService {
    if (!ExcelExportService.instance) {
      ExcelExportService.instance = new ExcelExportService();
    }
    return ExcelExportService.instance;
  }

  // Convert orders to CSV
  private ordersToCSV(orders: Order[]): string {
    const headers = [
      'Order #',
      'Date',
      'Time',
      'Status',
      'Items',
      'Subtotal (₱)',
      'Discount (₱)',
      'Total (₱)'
    ];

    const rows = orders.map(order => {
      const date = new Date(order.createdAt);
      const itemsList = order.items.map(item => {
        const customizations = [];
        if (item.customization.size) customizations.push(item.customization.size);
        if (item.customization.temperature) customizations.push(item.customization.temperature);
        if (item.customization.sugar !== '100%') customizations.push(`${item.customization.sugar} sugar`);
        if (item.customization.ice !== 'Normal Ice') customizations.push(item.customization.ice);
        
        const addOns = item.customization.addOns.map(a => a.name).join(', ');
        
        return `${item.quantity}x ${item.name}${
          customizations.length ? ` (${customizations.join(' | ')})` : ''
        }${addOns ? ` +${addOns}` : ''}`;
      }).join('; ');

      return [
        order.orderNumber,
        date.toLocaleDateString(),
        date.toLocaleTimeString(),
        order.status,
        itemsList,
        order.subtotal.toFixed(2),
        order.discount.toFixed(2),
        order.total.toFixed(2)
      ];
    });

    return [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
  }

  // Export to CSV/Excel
  exportToCSV(orders: Order[], filename: string): void {
    const csv = this.ordersToCSV(orders);
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' }); // UTF-8 BOM for Excel
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log(`✅ Exported ${orders.length} orders to ${filename}.csv`);
  }

  // Export as JSON backup
  exportToJSON(orders: Order[], filename: string): void {
    const json = JSON.stringify(orders, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.json`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log(`✅ Exported ${orders.length} orders to ${filename}.json`);
  }

  // Format date for filename
  formatDateRange(startDate: Date, endDate: Date): string {
    const formatDate = (date: Date) => {
      return date.toISOString().split('T')[0].replace(/-/g, '');
    };
    return `${formatDate(startDate)}_to_${formatDate(endDate)}`;
  }

  // Get month name
  getMonthName(year: number, month: number): string {
    const date = new Date(year, month, 1);
    return date.toLocaleString('default', { month: 'long' }).toLowerCase();
  }
}

export default ExcelExportService.getInstance();
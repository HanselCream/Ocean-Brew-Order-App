// components/PrinterSettingsModal.tsx - Create this entire new file

'use client';

import React, { useState, useEffect } from 'react';
import PrinterService from '@/lib/printerService';
import { getStoreSettings, saveStoreSettings } from '@/lib/store';

export default function PrinterSettingsModal({ isOpen, onClose, onSave }: { 
  isOpen: boolean; 
  onClose: () => void;
  onSave: () => void;
}) {
  const [settings, setSettings] = useState<any>(null);
  const [printerConnected, setPrinterConnected] = useState(false);
  const [printerName, setPrinterName] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSettings(getStoreSettings());
    }
  }, [isOpen]);

  const handleConnectPrinter = async () => {
    try {
      const printer = await PrinterService.requestPrinter();
      await PrinterService.connectToPrinter();
      setPrinterConnected(true);
      setPrinterName(printer.name);
      
      // Update settings with printer info
      const updated = { ...settings };
      updated.printerSettings = [{
        id: printer.id,
        name: printer.name,
        address: printer.id,
        isDefault: true
      }];
      setSettings(updated);
    } catch (error) {
      alert('Failed to connect to printer: ' + error);
    }
  };

  const handleDisconnectPrinter = async () => {
    await PrinterService.disconnectPrinter();
    setPrinterConnected(false);
    setPrinterName('');
    
    // Remove printer from settings
    const updated = { ...settings };
    updated.printerSettings = [];
    setSettings(updated);
  };

  const handleSave = () => {
    saveStoreSettings(settings);
    onSave();
    onClose();
  };

  const handleChange = (field: string, value: string) => {
    setSettings({ ...settings, [field]: value });
  };

  if (!isOpen || !settings) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b">
          <h2 className="text-xl font-bold text-gray-800">Store & Printer Settings</h2>
        </div>

        <div className="p-5 space-y-6">
          {/* Store Information */}
          <div>
            <h3 className="text-lg font-semibold text-gray-700 mb-4">Store Information</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1">Store Name</label>
                <input
                  type="text"
                  value={settings.storeName}
                  onChange={(e) => handleChange('storeName', e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1">Store Address</label>
                <input
                  type="text"
                  value={settings.storeAddress}
                  onChange={(e) => handleChange('storeAddress', e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={settings.storePhone}
                    onChange={(e) => handleChange('storePhone', e.target.value)}
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={settings.storeEmail}
                    onChange={(e) => handleChange('storeEmail', e.target.value)}
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-2"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* WiFi Settings - EDITABLE */}
          <div className="border-t pt-4">
            <h3 className="text-lg font-semibold text-gray-700 mb-4">Customer WiFi</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1">WiFi Name (SSID)</label>
                <input
                  type="text"
                  value={settings.wifiSSID}
                  onChange={(e) => handleChange('wifiSSID', e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-2"
                  placeholder="Enter WiFi name"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1">WiFi Password</label>
                <input
                  type="text"
                  value={settings.wifiPassword}
                  onChange={(e) => handleChange('wifiPassword', e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-2"
                  placeholder="Enter WiFi password"
                />
              </div>
            </div>
          </div>

          {/* Printer Settings */}
          <div className="border-t pt-4">
            <h3 className="text-lg font-semibold text-gray-700 mb-4">Bluetooth Printer</h3>
            <div className="bg-gray-50 p-4 rounded-xl">
              {printerConnected ? (
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-green-600 font-semibold">✓ Connected to:</span>
                    <p className="font-mono mt-1">{printerName}</p>
                  </div>
                  <button
                    onClick={handleDisconnectPrinter}
                    className="px-4 py-2 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleConnectPrinter}
                  className="w-full py-3 rounded-xl bg-sky-600 text-white font-semibold hover:bg-sky-700"
                >
                  🔵 Connect Bluetooth Printer
                </button>
              )}
            </div>
          </div>

          {/* Receipt Footer */}
          <div className="border-t pt-4">
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Receipt Footer</h3>
            <textarea
              value={settings.receiptFooter}
              onChange={(e) => handleChange('receiptFooter', e.target.value)}
              rows={2}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-2"
              placeholder="Thank you message for receipt"
            />
          </div>
        </div>

        <div className="p-5 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-gray-200 font-semibold text-gray-700 hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 rounded-xl bg-sky-600 font-semibold text-white hover:bg-sky-700"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
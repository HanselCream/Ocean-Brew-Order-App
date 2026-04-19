'use client';

import React, { useState, useEffect } from 'react';
import PrinterService from '@/lib/printerService';
import { getStoreSettings, saveStoreSettings } from '@/lib/supabaseStore';

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
      const loadSettings = async () => {
        const data = await getStoreSettings();
        setSettings(data);
      };
      loadSettings();
    }
  }, [isOpen]);

  const handleConnectPrinter = async () => {
    try {
      const printer = await PrinterService.requestPrinter();
      await PrinterService.connectToPrinter();
      setPrinterConnected(true);
      setPrinterName(printer.name);
      const updated = { ...settings };
      updated.printerSettings = [{ id: printer.id, name: printer.name, address: printer.id, isDefault: true }];
      setSettings(updated);
    } catch (error) {
      alert('Failed to connect to printer: ' + error);
    }
  };

  const handleDisconnectPrinter = async () => {
    await PrinterService.disconnectPrinter();
    setPrinterConnected(false);
    setPrinterName('');
    const updated = { ...settings };
    updated.printerSettings = [];
    setSettings(updated);
  };

  const handleSave = () => {
    const settingsToSave = {
      storeName: settings.storeName,
      storeAddress: settings.storeAddress,
      storePhone: settings.storePhone,
      storeEmail: settings.storeEmail,
      wifiSSID: settings.wifiSSID,
      wifiPassword: settings.wifiPassword,
      receiptFooter: settings.receiptFooter,
    };
    saveStoreSettings(settingsToSave);
    onSave();
    onClose();
  };

  const handleChange = (field: string, value: string) => {
    setSettings({ ...settings, [field]: value });
  };

  const inputClass = "w-full border border-white/20 rounded-xl px-4 py-2 bg-black text-white placeholder:text-gray-600 focus:border-white focus:outline-none";

  if (!isOpen || !settings) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-black border border-white/20 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="p-5 border-b border-white/20">
          <h2 className="text-xl font-bold text-white">Store & Printer Settings</h2>
        </div>

        <div className="p-5 space-y-6">

          {/* Store Information */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Store Information</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-1">Store Name</label>
                <input
                  type="text"
                  value={settings.storeName}
                  onChange={(e) => handleChange('storeName', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-1">Store Address</label>
                <input
                  type="text"
                  value={settings.storeAddress}
                  onChange={(e) => handleChange('storeAddress', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-400 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={settings.storePhone}
                    onChange={(e) => handleChange('storePhone', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-400 mb-1">Email</label>
                  <input
                    type="email"
                    value={settings.storeEmail}
                    onChange={(e) => handleChange('storeEmail', e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Customer WiFi */}
          <div className="border-t border-white/20 pt-4">
            <h3 className="text-lg font-semibold text-white mb-4">Customer WiFi</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-1">WiFi Name (SSID)</label>
                <input
                  type="text"
                  value={settings.wifiSSID}
                  onChange={(e) => handleChange('wifiSSID', e.target.value)}
                  className={inputClass}
                  placeholder="Enter WiFi name"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-1">WiFi Password</label>
                <input
                  type="text"
                  value={settings.wifiPassword}
                  onChange={(e) => handleChange('wifiPassword', e.target.value)}
                  className={inputClass}
                  placeholder="Enter WiFi password"
                />
              </div>
            </div>
          </div>

          {/* Bluetooth Printer */}
          <div className="border-t border-white/20 pt-4">
            <h3 className="text-lg font-semibold text-white mb-4">Bluetooth Printer</h3>
            <div className="bg-white/5 border border-white/10 p-4 rounded-xl">
              {printerConnected ? (
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-green-400 font-semibold">✓ Connected to:</span>
                    <p className="font-mono text-white mt-1">{printerName}</p>
                  </div>
                  <button
                    onClick={handleDisconnectPrinter}
                    className="px-4 py-2 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 font-semibold hover:bg-red-500/30"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleConnectPrinter}
                  className="w-full py-3 rounded-xl bg-white text-black font-semibold hover:bg-gray-200"
                >
                  🔵 Connect Bluetooth Printer
                </button>
              )}
            </div>
          </div>

          {/* Receipt Footer */}
          <div className="border-t border-white/20 pt-4">
            <h3 className="text-lg font-semibold text-white mb-2">Receipt Footer</h3>
            <textarea
              value={settings.receiptFooter}
              onChange={(e) => handleChange('receiptFooter', e.target.value)}
              rows={2}
              className={inputClass}
              placeholder="Thank you message for receipt"
            />
          </div>

        </div>

        {/* Footer */}
        <div className="p-5 border-t border-white/20 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-white/10 font-semibold text-white hover:bg-white/20"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 rounded-xl bg-white font-semibold text-black hover:bg-gray-200"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
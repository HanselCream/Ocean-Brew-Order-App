'use client';

import React, { useState } from 'react';

interface DateRangePickerProps {
  onExport: (startDate: Date, endDate: Date, type: 'csv' | 'json') => void;
  onClose: () => void;
}

export default function DateRangePicker({ onExport, onClose }: DateRangePickerProps) {
  const [startDate, setStartDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [exportType, setExportType] = useState<'csv' | 'json'>('csv');

  const presetRanges = [
    { label: 'Today', days: 0 },
    { label: 'Last 3 Days', days: 3 },
    { label: 'Last 7 Days', days: 7 },
    { label: 'Last 15 Days', days: 15 },
    { label: 'Last 30 Days', days: 30 },
    { label: 'This Month', days: 'month' },
    { label: 'Last Month', days: 'lastMonth' }
  ];

  const handlePreset = (preset: { label: string; days: number | 'month' | 'lastMonth' }) => {
    const end = new Date();
    let start = new Date();
    
    if (preset.days === 'month') {
      start = new Date(end.getFullYear(), end.getMonth(), 1);
    } else if (preset.days === 'lastMonth') {
      start = new Date(end.getFullYear(), end.getMonth() - 1, 1);
      end.setDate(0); // Last day of previous month
    } else {
      start.setDate(end.getDate() - (preset.days as number));
    }
    
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  const handleExport = () => {
    onExport(new Date(startDate), new Date(endDate), exportType);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b">
          <h2 className="text-xl font-bold text-gray-800">📊 Export Orders</h2>
          <p className="text-sm text-gray-500 mt-1">Choose date range and format</p>
        </div>

        <div className="p-5 space-y-4">
          {/* Preset Ranges */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Quick Select
            </label>
            <div className="flex flex-wrap gap-2">
              {presetRanges.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handlePreset(preset)}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-semibold text-gray-700 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Export Format */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Export Format
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={exportType === 'csv'}
                  onChange={() => setExportType('csv')}
                  className="w-4 h-4 text-sky-600"
                />
                <span className="text-sm">📊 Excel (CSV)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={exportType === 'json'}
                  onChange={() => setExportType('json')}
                  className="w-4 h-4 text-sky-600"
                />
                <span className="text-sm">📦 JSON Backup</span>
              </label>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 rounded-xl p-3 text-sm">
            <p className="font-semibold text-blue-800 flex items-center gap-1">
              <span>ℹ️</span> Export Information
            </p>
            <p className="text-blue-600 text-xs mt-1">
              File will include all completed orders from {startDate} to {endDate}
            </p>
            <p className="text-blue-600 text-xs mt-1">
              CSV files open in Excel, JSON for backup/restore
            </p>
          </div>
        </div>

        <div className="p-5 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-gray-200 font-semibold text-gray-700 hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            className="px-5 py-2 rounded-xl bg-green-600 font-semibold text-white hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            <span>⬇️</span> Export {exportType === 'csv' ? 'Excel' : 'JSON'}
          </button>
        </div>
      </div>
    </div>
  );
}
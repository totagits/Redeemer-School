import React, { useState } from 'react';
import { 
  Package, 
  ArrowDownLeft, 
  ArrowUpRight, 
  AlertTriangle, 
  Plus, 
  Search, 
  CheckCircle2, 
  RefreshCw, 
  Layers, 
  ShieldCheck 
} from 'lucide-react';
import { 
  InventoryItem, 
  StockMovement, 
  MovementType, 
  calculateInventoryValuation 
} from '../logic/erpInventory.ts';

interface InventoryModuleProps {
  inventory: InventoryItem[];
  stockMovements: StockMovement[];
  onRecordMovement: (movement: {
    itemId: string;
    type: MovementType;
    quantity: number;
    referenceNumber: string;
    reason: string;
    performedBy: string;
  }) => void;
  onQuickReorder: (itemId: string, qty: number) => void;
}

export const InventoryModule: React.FC<InventoryModuleProps> = ({
  inventory,
  stockMovements,
  onRecordMovement,
  onQuickReorder
}) => {
  const [activeTab, setActiveTab] = useState<'catalog' | 'movements' | 'alerts'>('catalog');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Modal State
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string>(inventory[0]?.id || '');
  const [movementType, setMovementType] = useState<MovementType>('STOCK_IN');
  const [movementQty, setMovementQty] = useState('');
  const [movementRef, setMovementRef] = useState('');
  const [movementReason, setMovementReason] = useState('');

  // Valuation metrics
  const valuation = calculateInventoryValuation(inventory);

  const filteredItems = inventory.filter((item) => {
    const matchesSearch = 
      item.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.warehouseLocation.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'ALL' || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const lowStockItems = inventory.filter(i => i.currentStock <= i.reorderLevel);

  const handleMovementSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(movementQty);
    if (!selectedItemId || qty <= 0) return;

    onRecordMovement({
      itemId: selectedItemId,
      type: movementType,
      quantity: qty,
      referenceNumber: movementRef || (movementType === 'STOCK_IN' ? 'PO-RESTOCK' : 'SO-FULFILL'),
      reason: movementReason || `${movementType} processed via warehouse console`,
      performedBy: 'Warehouse Manager'
    });

    setShowMovementModal(false);
    setMovementQty('');
    setMovementRef('');
    setMovementReason('');
  };

  return (
    <div className="space-y-6">
      {/* Module Title & Tab Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Package className="w-5 h-5 text-slate-800" />
            The Redeemer School — Campus Store & Educational Supplies
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Curriculum textbooks, science laboratory glassware & reagents, uniform apparel, and backup generator fuel reserves
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'catalog' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Item Catalog & Stock ({inventory.length})
          </button>
          <button
            onClick={() => setActiveTab('movements')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'movements' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Movement Audit Log ({stockMovements.length})
          </button>
          <button
            onClick={() => setActiveTab('alerts')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'alerts' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Reorder Alerts ({lowStockItems.length})
          </button>
        </div>
      </div>

      {/* Top Valuation Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Inventory Valuation (Cost)
          </span>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-2">
            ${valuation.totalValuationCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Carried on Balance Sheet Account 1030
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Potential Retail Value
          </span>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-2">
            ${valuation.totalRetailValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            Based on standard selling catalog pricing
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Safety Stock Reorder Status
          </span>
          <div className="text-2xl font-bold font-mono tabular-nums mt-2 flex items-center gap-2">
            {valuation.lowStockItemsCount > 0 ? (
              <span className="text-amber-700 flex items-center gap-1.5 text-xl font-bold font-mono">
                <AlertTriangle className="w-5 h-5 inline text-amber-600 shrink-0" />
                {valuation.lowStockItemsCount} {valuation.lowStockItemsCount === 1 ? 'SKU' : 'SKUs'} Below Reorder Level
              </span>
            ) : (
              <span className="text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-5 h-5 inline text-emerald-600" />
                All Levels Optimal
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            {valuation.outOfStockItemsCount} items currently out of stock
          </span>
        </div>
      </div>

      {/* TAB 1: Item Master Catalog */}
      {activeTab === 'catalog' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search SKU, item name, bay..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-400"
                />
              </div>

              {/* Category Filter */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Filter by Category"
                className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-hidden cursor-pointer"
              >
                <option value="ALL">All Categories</option>
                <option value="Hardware">Hardware</option>
                <option value="Finished Goods">Finished Goods</option>
                <option value="Raw Materials">Raw Materials</option>
              </select>
            </div>

            <button
              onClick={() => setShowMovementModal(true)}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1.5 shadow-xs whitespace-nowrap cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Record Stock Movement
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-4">SKU Code</th>
                    <th className="py-2.5 px-4">Item Name & Category</th>
                    <th className="py-2.5 px-4">Location</th>
                    <th className="py-2.5 px-4 text-right">Unit Cost ($)</th>
                    <th className="py-2.5 px-4 text-right">Retail ($)</th>
                    <th className="py-2.5 px-4 text-right">On Hand</th>
                    <th className="py-2.5 px-4 text-center">Safety Reorder</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {item.sku}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-bold text-slate-900">{item.name}</div>
                        <div className="text-[10px] text-slate-400">{item.category} · UOM: {item.unitOfMeasure}</div>
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 text-[11px] font-mono">
                        {item.warehouseLocation}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-right text-slate-700">
                        ${item.unitCost.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-right text-slate-700">
                        ${item.sellingPrice.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-right font-bold text-slate-900">
                        {item.currentStock} {item.unitOfMeasure}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-center text-slate-500">
                        {item.reorderLevel}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm ${
                          item.status === 'IN_STOCK' ? 'bg-emerald-50 text-emerald-700' :
                          item.status === 'LOW_STOCK' ? 'bg-amber-50 text-amber-700' :
                          'bg-rose-50 text-rose-700'
                        }`}>
                          {item.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <button
                          onClick={() => {
                            setSelectedItemId(item.id);
                            setShowMovementModal(true);
                          }}
                          className="px-2 py-1 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                        >
                          Adjust
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Stock Movements Audit Log */}
      {activeTab === 'movements' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              Immutable Stock Movement & Transaction Log
            </h2>
            <span className="text-xs text-slate-500">
              Tracks Stock Receipts (In), Sales Fulfillments (Out), and Cycle Adjustments
            </span>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-4">Timestamp</th>
                    <th className="py-2.5 px-4">SKU & Item</th>
                    <th className="py-2.5 px-4">Type</th>
                    <th className="py-2.5 px-4 text-right">Qty Delta</th>
                    <th className="py-2.5 px-4 text-right">Previous → New</th>
                    <th className="py-2.5 px-4">Reference & Reason</th>
                    <th className="py-2.5 px-4">Authorized By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {stockMovements.map((sm) => (
                    <tr key={sm.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {sm.timestamp.replace('T', ' ').slice(0, 16)}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-mono font-bold text-slate-900">{sm.sku}</div>
                        <div className="text-[11px] text-slate-600">{sm.itemName}</div>
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm ${
                          sm.movementType === 'STOCK_IN' ? 'bg-emerald-50 text-emerald-700' :
                          sm.movementType === 'STOCK_OUT' ? 'bg-blue-50 text-blue-700' :
                          'bg-purple-50 text-purple-700'
                        }`}>
                          {sm.movementType.replace('_', ' ')}
                        </span>
                      </td>
                      <td className={`py-2.5 px-4 font-mono font-bold tabular-nums text-right ${
                        sm.movementType === 'STOCK_IN' ? 'text-emerald-700' : 'text-slate-900'
                      }`}>
                        {sm.movementType === 'STOCK_IN' ? `+${sm.quantity}` : `-${sm.quantity}`}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-right text-slate-600">
                        {sm.previousStock} → <strong className="text-slate-900">{sm.newStock}</strong>
                      </td>
                      <td className="py-2.5 px-4 max-w-xs">
                        <div className="font-mono text-slate-800 font-semibold">{sm.referenceNumber}</div>
                        <div className="text-[11px] text-slate-500 truncate">{sm.reason}</div>
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">
                        {sm.performedBy}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Low Stock Alerts & Automated Reorder Suggestions */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              Automated Reorder Threshold Alerts
            </h2>
            <span className="text-xs text-slate-500">
              Safety stock fallen below minimum operational threshold
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {lowStockItems.map((item) => (
              <div key={item.id} className="bg-white p-5 rounded-xl border border-amber-200 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="font-mono text-xs font-bold text-slate-900">
                        {item.sku}
                      </span>
                      <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                        {item.name}
                      </h3>
                      <span className="text-xs text-slate-500">
                        Location: {item.warehouseLocation}
                      </span>
                    </div>

                    <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded-sm">
                      {item.currentStock === 0 ? 'CRITICAL: OUT OF STOCK' : 'LOW STOCK ALERT'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-4 p-3 bg-slate-50 rounded-lg text-xs">
                    <div>
                      <span className="text-slate-500 block">Current Stock:</span>
                      <span className="font-mono font-bold text-slate-900 text-sm">
                        {item.currentStock} {item.unitOfMeasure}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Minimum Reorder Level:</span>
                      <span className="font-mono font-bold text-amber-700 text-sm">
                        {item.reorderLevel} {item.unitOfMeasure}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    Est. Unit Cost: <strong>${item.unitCost.toFixed(2)}</strong>
                  </span>
                  <button
                    onClick={() => onQuickReorder(item.id, item.reorderLevel * 2)}
                    className="px-3 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  >
                    Generate Reorder PO (+{item.reorderLevel * 2} {item.unitOfMeasure})
                  </button>
                </div>
              </div>
            ))}

            {lowStockItems.length === 0 && (
              <div className="col-span-2 bg-white p-8 rounded-xl border border-slate-200 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-slate-900">All Inventory Levels Are Healthy</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Every catalog SKU is safely above its configured reorder safety stock threshold.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Record Stock Movement */}
      {showMovementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200 p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              Record Physical Stock Movement
            </h3>
            
            <form onSubmit={handleMovementSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Item SKU</label>
                <select
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg p-2"
                >
                  {inventory.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.sku} - {item.name} (Current: {item.currentStock} {item.unitOfMeasure})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Movement Type</label>
                <select
                  value={movementType}
                  onChange={(e) => setMovementType(e.target.value as MovementType)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2"
                >
                  <option value="STOCK_IN">STOCK IN (PO Receipt / Supplier Delivery)</option>
                  <option value="STOCK_OUT">STOCK OUT (Order Fulfillment / Customer Shipment)</option>
                  <option value="ADJUSTMENT">ADJUSTMENT (Cycle Count Reconciliation)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {movementType === 'ADJUSTMENT' ? 'New Count Total' : 'Quantity Units'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="e.g. 50"
                    value={movementQty}
                    onChange={(e) => setMovementQty(e.target.value)}
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Ref Document #</label>
                  <input
                    type="text"
                    placeholder="e.g. PO-8821 / SO-104"
                    value={movementRef}
                    onChange={(e) => setMovementRef(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Operational Reason / Memo</label>
                <input
                  type="text"
                  placeholder="e.g. Monthly scheduled inventory reconciliation"
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowMovementModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Confirm Movement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

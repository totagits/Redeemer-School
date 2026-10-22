/**
 * ERP Inventory Management Logic: Stock Tracking, Reorder Thresholds, and Valuations.
 */

export interface InventoryItem {
  id: string;
  sku: string;             // e.g. "SKU-HW-081"
  name: string;
  category: 'Hardware' | 'Office Supplies' | 'Raw Materials' | 'Packaging' | 'Finished Goods';
  unitOfMeasure: 'PCS' | 'BOX' | 'KG' | 'SET' | 'METERS';
  unitCost: number;        // Purchase / valuation cost
  sellingPrice: number;    // Retail / selling price
  currentStock: number;
  reorderLevel: number;    // Minimum safety stock
  warehouseLocation: string; // e.g. "Bay 3 - Aisle 12"
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}

export type MovementType = 'STOCK_IN' | 'STOCK_OUT' | 'ADJUSTMENT' | 'TRANSFER';

export interface StockMovement {
  id: string;
  itemId: string;
  sku: string;
  itemName: string;
  movementType: MovementType;
  quantity: number;        // positive number
  previousStock: number;
  newStock: number;
  unitCostAtMovement: number;
  referenceNumber: string; // e.g. "PO-8812" or "SO-1092" or "CYC-COUNT"
  reason: string;
  performedBy: string;
  timestamp: string;
}

export function evaluateStockStatus(currentStock: number, reorderLevel: number): 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' {
  if (currentStock <= 0) return 'OUT_OF_STOCK';
  if (currentStock <= reorderLevel) return 'LOW_STOCK';
  return 'IN_STOCK';
}

export function processStockMovement(
  item: InventoryItem,
  type: MovementType,
  qty: number,
  referenceNumber: string,
  reason: string,
  performedBy: string
): { updatedItem: InventoryItem; movement: StockMovement } {
  let newStock = item.currentStock;
  const previousStock = item.currentStock;

  if (type === 'STOCK_IN') {
    newStock = previousStock + Math.abs(qty);
  } else if (type === 'STOCK_OUT') {
    newStock = Math.max(0, previousStock - Math.abs(qty));
  } else if (type === 'ADJUSTMENT') {
    // Direct set or delta
    newStock = Math.max(0, qty);
  } else if (type === 'TRANSFER') {
    newStock = previousStock; // location change
  }

  const status = evaluateStockStatus(newStock, item.reorderLevel);

  const updatedItem: InventoryItem = {
    ...item,
    currentStock: newStock,
    status
  };

  const movement: StockMovement = {
    id: `sm-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    itemId: item.id,
    sku: item.sku,
    itemName: item.name,
    movementType: type,
    quantity: Math.abs(newStock - previousStock),
    previousStock,
    newStock,
    unitCostAtMovement: item.unitCost,
    referenceNumber,
    reason,
    performedBy,
    timestamp: new Date().toISOString()
  };

  return { updatedItem, movement };
}

export function calculateInventoryValuation(items: InventoryItem[]): {
  totalItemsCount: number;
  totalValuationCost: number;
  totalRetailValue: number;
  lowStockItemsCount: number;
  outOfStockItemsCount: number;
} {
  let totalValuationCost = 0;
  let totalRetailValue = 0;
  let lowStockItemsCount = 0;
  let outOfStockItemsCount = 0;

  for (const item of items) {
    totalValuationCost += item.currentStock * item.unitCost;
    totalRetailValue += item.currentStock * item.sellingPrice;
    if (item.currentStock === 0) {
      outOfStockItemsCount++;
    } else if (item.currentStock <= item.reorderLevel) {
      lowStockItemsCount++;
    }
  }

  return {
    totalItemsCount: items.length,
    totalValuationCost: Math.round(totalValuationCost * 100) / 100,
    totalRetailValue: Math.round(totalRetailValue * 100) / 100,
    lowStockItemsCount,
    outOfStockItemsCount
  };
}

/**
 * Item Classification Service
 * Classifies items into Main/Flower (M) and Food & Beverage (F&B) categories
 * based on unit price thresholds and special case mappings
 */

// Special case mappings for items that should be classified regardless of price
// NOTE: Grape Soda is explicitly classified as 'main' (Flower) even though it may have low price
const SPECIAL_CASE_MAPPINGS = {
  'grape soda': 'main',      // Flower/Main category
  'emergen c': 'main',
  'moonbow': 'main',
  'crystal candy': 'main',
  'jealousy mintz': 'main',
  'tea time': 'main',
  'silver shadow': 'main',
  'truffaloha': 'main',
  'water': 'fb',
  'soda': 'fb',
  'cocacola': 'fb',
  'coke': 'fb',
  'sprite': 'fb',
  'fanta': 'fb',
};

// Unit price threshold: items with unit price > 50 THB are Main/Flower
// Items with unit price <= 50 THB are F&B (unless in special mappings)
const UNIT_PRICE_THRESHOLD = 50;

/**
 * Classify a single item
 * @param {string} itemName - Name of the item
 * @param {number} unitPrice - Unit price in THB
 * @returns {string} Category: 'main' or 'fb'
 */
function classifyItem(itemName, unitPrice) {
  if (!itemName) return 'fb'; // Default to F&B if no name
  
  const normalizedName = itemName.toLowerCase().trim();
  
  // Check special case mappings first (highest priority)
  // This ensures items like "Grape Soda" are always classified as 'main' regardless of price
  for (const [key, category] of Object.entries(SPECIAL_CASE_MAPPINGS)) {
    if (normalizedName.includes(key)) {
      return category;
    }
  }
  
  // Apply unit price threshold only if no special case mapping found
  const price = parseFloat(unitPrice) || 0;
  return price > UNIT_PRICE_THRESHOLD ? 'main' : 'fb';
}

/**
 * Classify multiple items
 * @param {Array} items - Array of items with name and unitPrice
 * @returns {Array} Items with added category field
 */
function classifyItems(receipts) {
  const allItems = [];
  receipts.forEach(receipt => {
    const lineItems = receipt.line_items || receipt.items || [];
    lineItems.forEach(item => {
      const itemName = item.item_name || item.name || 'Unknown';
      const unitPrice = parseFloat(item.unit_price || item.price || 0);
      const quantity = parseFloat(item.quantity || item.qty || 0);
      
      allItems.push({
        ...item,
        itemName,
        unitPrice,
        quantity,
        category: classifyItem(itemName, unitPrice)
      });
    });
  });
  return allItems;
}

/**
 * Get classification statistics
 * @param {Array} items - Classified items
 * @returns {Object} Statistics with counts and totals
 */
function getClassificationStats(items) {
  const mainItems = items.filter(i => i.category === 'main');
  const fbItems = items.filter(i => i.category === 'fb');
  
  let mainTotal = 0;
  let fbTotal = 0;
  
  mainItems.forEach(item => {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.unitPrice) || 0;
    mainTotal += qty * price;
  });
  
  fbItems.forEach(item => {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.unitPrice) || 0;
    fbTotal += qty * price;
  });
  
  return {
    mainCount: mainItems.length,
    fbCount: fbItems.length,
    mainTotal: mainTotal.toFixed(2),
    fbTotal: fbTotal.toFixed(2),
    totalAmount: (mainTotal + fbTotal).toFixed(2),
  };
}

/**
 * Add or update special case mapping
 * @param {string} itemName - Item name to map
 * @param {string} category - Category: 'main' or 'fb'
 */
function addSpecialCaseMapping(itemName, category) {
  const normalizedName = itemName.toLowerCase().trim();
  if (category === 'main' || category === 'fb') {
    SPECIAL_CASE_MAPPINGS[normalizedName] = category;
  }
}

/**
 * Get all special case mappings
 * @returns {Object} All special case mappings
 */
function getSpecialCaseMappings() {
  return { ...SPECIAL_CASE_MAPPINGS };
}

module.exports = {
  classifyItem,
  classifyItems,
  getClassificationStats,
  addSpecialCaseMapping,
  getSpecialCaseMappings,
  UNIT_PRICE_THRESHOLD,
};

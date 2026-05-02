/**
 * Item Classification Service
 * Classifies items into 'Main' (Flower/Accessories) or 'F&B' (Food & Beverage)
 * based on item names and categories.
 */

const MAIN_KEYWORDS = [
  'grape soda', 'blue pave', 'devil driver', 'lemon cherry gelato', 
  'moonbow', 'emergen c', 'tea time', 'silver shadow', 
  'rozay cake', 'truffaloha', 'the planet of grape', 'crunch berriez',
  'big foot', 'honey bee', 'jealousy mintz', 'crystal candy',
  'alien mint', 'rocket fuel', 'gold dust', 'darth vader',
  'cherry pop tarts', 'white cherry gelato', 'dosidos', 'obama runtz',
  'free pina colada', 'free kanobi sunset', 'fakescotti', 'pina colada', 'thc gummy', 'flower', 
  'bud', 'pre-roll', 'joint', 'cheese candy', 'vino tinto', 'mac stormper', 
  'r2d2 fluid', 'planet of the grape'
];

const FB_KEYWORDS = [
  'water', 'soda', 'beer', 'drink', 'beverage', 'alcohol', 'wine', 
  'cider', 'spirit', 'cocktail', 'milk', 'coffee', 'tea', 'juice', 
  'corona', 'sato', 'budweiser', 'singha', 'asahi', 'chang', 'leo', 
  'cocacola', 'coke', 'sprite', 'tonic water', 'soda water',
  'cookie', 'brownie', 'cake', 'soju', 'snack', 'food', 'bakery'
];

const ACCESSORY_KEYWORDS = [
  'accessories', 'merchandise', 'bong', 'paper', 'tip', 'grinder',
  'shirt', 'hat', 'lighter', 'the lobby', 'merch', 'ashtray', 'ash tray',
  'pipe', 'small pipe', 'best buds grinder', 'best buds shirt',
  'nf best buds shirt', 'sw best buds shirt', 'balm 10g'
];

/**
 * Classifies an item based on its name and category.
 * @param {string} itemName - The name of the item.
 * @param {string} categoryName - The name of the category.
 * @param {number} unitPrice - The unit price of the item (optional fallback).
 * @returns {string} - 'main', 'fb', or 'accessory'
 */
function classifyItem(itemName, categoryName = '', unitPrice = 0) {
  const name = String(itemName || '').toLowerCase();
  const cat = String(categoryName || '').toLowerCase();

  // 1. Check for Accessories first so items like "Best buds hat" don't get caught by "bud"
  if (ACCESSORY_KEYWORDS.some(keyword => name.includes(keyword)) ||
      cat.includes('accessories') ||
      cat.includes('merchandise')) {
    return 'accessory';
  }

  // 2. Check for F&B keywords BEFORE Main keywords
  // This is critical to ensure beverages like "Budweiser" aren't caught by the "bud" keyword in MAIN_KEYWORDS
  const isFB = FB_KEYWORDS.some(keyword => name.includes(keyword)) || 
      cat.includes('soft drink') || 
      cat.includes('alcohol') ||
      cat.includes('snacks') || 
      cat.includes('beverage') ||
      cat.includes('drink') ||
      cat.includes('food') ||
      cat.includes('bakery');
  
  if (isFB) {
    // Exception: 'tea time' and 'gummy' should not be F&B
    if (name.includes('tea time') || name.includes('gummy')) return 'main';
    return 'fb';
  }

  // 3. Check for Main/Flower keywords
  if (MAIN_KEYWORDS.some(keyword => {
    if (keyword === 'grape soda') {
      return name === 'grape soda' || name.includes('grape soda');
    }
    return name.includes(keyword);
  })) {
    return 'main';
  }

  // 4. Fallback to price if name doesn't match anything
  if (unitPrice > 50) {
    return 'main';
  } else if (unitPrice > 0) {
    return 'fb';
  }

  // Default fallback
  return 'main';
}

/**
 * Bulk classify items from a list of receipts.
 * @param {Array} receipts - List of Loyverse receipts.
 * @returns {Array} - List of classified items.
 */
function classifyItems(receipts) {
  const classifiedItems = [];
  if (!Array.isArray(receipts)) return classifiedItems;

  receipts.forEach(receipt => {
    const items = receipt.line_items || receipt.items || [];
    items.forEach(item => {
      const itemName = item.name || item.item_name || '';
      const categoryName = item.category_name || '';
      const qty = Number(item.quantity || item.qty || 0);
      
      // Extract prices and discounts
      const grossPrice = Number(item.gross_total_money?.amount || item.subtotal_money?.amount || 0);
      const totalDiscount = Number(item.total_discount_money?.amount || item.discount_money?.amount || 0);
      const netPrice = Number(item.total_money?.amount || item.total_price_money?.amount || (grossPrice - totalDiscount));
      
      // Calculate discount percentage
      const discountPercent = grossPrice > 0 ? (totalDiscount / grossPrice * 100) : 0;
      
      // RULE: Exclude items with 100% discount or price 0
      if (netPrice <= 0.01 || discountPercent >= 99.99) {
        return;
      }

      const unitPrice = qty > 0 ? netPrice / qty : 0;

      const type = classifyItem(itemName, categoryName, unitPrice);
      classifiedItems.push({
        ...item,
        classification: type,
        category: type, // Ensure compatibility with services using .category
        unitPrice: unitPrice,
        netPrice: netPrice
      });
    });
  });

  return classifiedItems;
}

/**
 * Get classification statistics for a list of classified items.
 * @param {Array} classifiedItems - List of classified items.
 * @returns {Object} - Statistics object.
 */
function getClassificationStats(classifiedItems) {
  const stats = {
    main: { count: 0, total: 0 },
    fb: { count: 0, total: 0 },
    accessory: { count: 0, total: 0 },
    total: { count: 0, total: 0 }
  };

  classifiedItems.forEach(item => {
    const type = item.classification || 'main';
    const qty = Number(item.quantity || item.qty || 0);
    const price = Number(item.netPrice || 0);
    
    if (stats[type]) {
      stats[type].count += 1;
      stats[type].total += price;
    }
    
    stats.total.count += 1;
    stats.total.total += price;
  });

  return stats;
}

module.exports = {
  classifyItem,
  classifyItems,
  getClassificationStats,
  MAIN_KEYWORDS,
  FB_KEYWORDS,
  ACCESSORY_KEYWORDS
};

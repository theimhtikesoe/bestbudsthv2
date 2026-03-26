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
  'free pina colada', 'thc gummy', 'flower', 'bud', 'pre-roll', 'joint'
];

const FB_KEYWORDS = [
  'water', 'soda', 'beer', 'drink', 'beverage', 'alcohol', 'wine', 
  'cider', 'spirit', 'cocktail', 'milk', 'coffee', 'tea', 'juice',
  'cookie', 'brownie', 'cake', 'soju', 'gummy', 'snack', 'food', 'bakery'
];

const ACCESSORY_KEYWORDS = [
  'accessories', 'merchandise', 'bong', 'paper', 'tip', 'grinder',
  'shirt', 'hat', 'lighter', 'the lobby', 'merch', 'ashtray', 'ash tray',
  'pipe', 'small pipe', 'best buds grinder', 'best buds shirt',
  'nf best buds shirt', 'sw best buds shirt'
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

  // 2. Check for Main/Flower keywords
  if (MAIN_KEYWORDS.some(keyword => name.includes(keyword))) {
    return 'main';
  }

  // 3. Check for F&B keywords
  if (FB_KEYWORDS.some(keyword => name.includes(keyword)) || 
      cat.includes('soft drink') || 
      cat.includes('snacks') || 
      cat.includes('beverage') ||
      cat.includes('drink') ||
      cat.includes('food') ||
      cat.includes('bakery')) {
    
    // Exception: 'tea time' should not be F&B
    if (name.includes('tea time')) return 'main';
    
    return 'fb';
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

module.exports = {
  classifyItem,
  MAIN_KEYWORDS,
  FB_KEYWORDS,
  ACCESSORY_KEYWORDS
};

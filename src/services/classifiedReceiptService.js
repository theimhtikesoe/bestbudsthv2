/**
 * Classified Receipt Service
 * Integrates Loyverse receipt fetching with item classification
 */

const { fetchReceiptsByDate } = require('./loyverseService');
const { classifyItems, getClassificationStats } = require('./itemClassifier');

/**
 * Fetch and classify receipts for a given date
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Object>} Classified receipts and statistics
 */
async function fetchAndClassifyReceipts(date) {
  try {
    // Fetch receipts from Loyverse
    const receipts = await fetchReceiptsByDate(date);

    // Classify items
    const classifiedReceipts = classifyItems(receipts);

    // Get statistics
    const stats = getClassificationStats(classifiedReceipts);

    return {
      success: true,
      date,
      receipts: classifiedReceipts,
      stats,
      totalReceipts: classifiedReceipts.length
    };
  } catch (error) {
    console.error('Error fetching and classifying receipts:', error);
    throw error;
  }
}

/**
 * Get receipt breakdown by category
 * @param {Array} classifiedReceipts - Classified receipt items
 * @returns {Object} Breakdown by category
 */
function getReceiptBreakdown(classifiedReceipts) {
  const mainItems = classifiedReceipts.filter(r => r.category === 'main');
  const fbItems = classifiedReceipts.filter(r => r.category === 'fb');

  const calculateTotal = (items) => {
    return items.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.unitPrice) || 0;
      return sum + (qty * price);
    }, 0);
  };

  return {
    main: {
      items: mainItems,
      count: mainItems.length,
      total: calculateTotal(mainItems)
    },
    fb: {
      items: fbItems,
      count: fbItems.length,
      total: calculateTotal(fbItems)
    },
    combined: {
      count: classifiedReceipts.length,
      total: calculateTotal(classifiedReceipts)
    }
  };
}

/**
 * Generate receipt summary report
 * @param {Array} classifiedReceipts - Classified receipt items
 * @returns {Object} Summary report
 */
function generateReceiptSummary(classifiedReceipts) {
  const breakdown = getReceiptBreakdown(classifiedReceipts);

  return {
    mainFlower: {
      count: breakdown.main.count,
      total: breakdown.main.total.toFixed(2),
      percentage: breakdown.combined.total > 0 
        ? ((breakdown.main.total / breakdown.combined.total) * 100).toFixed(2)
        : '0.00'
    },
    fb: {
      count: breakdown.fb.count,
      total: breakdown.fb.total.toFixed(2),
      percentage: breakdown.combined.total > 0 
        ? ((breakdown.fb.total / breakdown.combined.total) * 100).toFixed(2)
        : '0.00'
    },
    total: {
      count: breakdown.combined.count,
      total: breakdown.combined.total.toFixed(2)
    }
  };
}

/**
 * Get items by category
 * @param {Array} classifiedReceipts - Classified receipt items
 * @param {string} category - Category to filter ('main' or 'fb')
 * @returns {Array} Filtered items
 */
function getItemsByCategory(classifiedReceipts, category) {
  return classifiedReceipts.filter(item => item.category === category);
}

module.exports = {
  fetchAndClassifyReceipts,
  getReceiptBreakdown,
  generateReceiptSummary,
  getItemsByCategory
};

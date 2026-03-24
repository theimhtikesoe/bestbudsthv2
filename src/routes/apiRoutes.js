const express = require('express');
const {
  syncFromLoyverse,
  getReportByDate,
  upsertReport,
  listReports,
  getLast7DayNetSales,
  getReportsSummary,
  exportToExcel,
  addExpense,
  removeExpense,
  listExpenses
} = require('../controllers/reportController');

const router = express.Router();

router.get('/loyverse/sync', syncFromLoyverse);

router.get('/loyverse/debug-items', async (req, res) => {
  try {
    const axios = require('axios');
    const token = process.env.LOYVERSE_API_TOKEN;
    const headers = { Authorization: `Bearer ${token}` };

    const [itemsResp, catsResp] = await Promise.all([
      axios.get('https://api.loyverse.com/v1.0/items', { headers, params: { limit: 3 } }),
      axios.get('https://api.loyverse.com/v1.0/categories', { headers })
    ]);

    const items = itemsResp.data?.items || [];
    const categories = catsResp.data?.categories || catsResp.data?.data || [];
    res.json({
      items_count: items.length,
      items_sample: items.slice(0, 2),
      categories_count: categories.length,
      categories_sample: categories.slice(0, 5)
    });
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

router.get('/reports/last-7/net-sales', getLast7DayNetSales);
router.get('/reports/summary', getReportsSummary);
router.get('/reports', listReports);
router.get('/reports/:date', getReportByDate);
router.post('/reports', upsertReport);

// Excel export
router.get('/reports/:date/export', exportToExcel);

// Expense management
router.post('/expenses', addExpense);
router.delete('/expenses/:id', removeExpense);
router.get('/expenses/:date', listExpenses);

module.exports = router;

# Daily POS Closing & Report System - Enhancements

This document outlines the enhancements made to the Daily Reports system to provide comprehensive item classification, expense tracking, and Excel export functionality.

## New Features

### 1. Advanced Item Classification

The system now automatically classifies items into two categories based on intelligent rules:

**Main/Flower (M)** - Premium items typically sold individually
- Unit price > 50 THB
- Special items: Grape Soda, Emergen C, Moonbow, Crystal Candy, Jealousy Mintz, Tea Time, Silver Shadow, Truffaloha

**Food & Beverage (F&B)** - Consumables and lower-priced items
- Unit price ≤ 50 THB
- Special items: Water, Soda, Cocacola, Coke, Sprite, Fanta

**Location:** `src/services/itemClassifier.js`

```javascript
// Example usage
const { classifyItem, classifyItems } = require('./src/services/itemClassifier');

// Classify single item
const category = classifyItem('Grape Soda', 1500); // Returns 'main'

// Classify multiple items
const classified = classifyItems(receipts);
```

### 2. Comprehensive Expense Tracking

Track daily expenses with categorized entries:

**Expense Categories:**
- Taxi
- Ice
- Deli
- Supplies
- Maintenance
- Utilities
- Other

**API Endpoints:**
- `POST /api/expenses` - Add new expense
- `GET /api/expenses/:date` - List expenses for a date
- `DELETE /api/expenses/:id` - Remove expense

**Database Table:** `daily_expenses`
- id (Primary Key)
- date (Foreign Key to daily_reports)
- category (VARCHAR 50)
- description (VARCHAR 255)
- amount (DECIMAL 12,2)
- created_at, updated_at (Timestamps)

### 3. Enhanced Excel Export

Generate professional Excel reports with separate sheets for different categories:

**Export Endpoint:** `GET /api/reports/:date/export`

**Excel Sheets:**
1. **Main/Flower (M)** - Main/Flower items with quantities and totals
2. **F&B** - Food & Beverage items with quantities and totals
3. **Expenses** - Daily expenses by category
4. **Summary** - Overall report summary with totals and payment breakdown

**Features:**
- Color-coded headers (Blue for Main, Red for F&B, Green for Expenses)
- Automatic calculations and totals
- Formatted currency columns
- Professional styling and borders

**Location:** `src/services/excelExportService.js`

### 4. Receipt Classification Service

Integrated service that combines Loyverse receipt fetching with automatic item classification:

**Location:** `src/services/classifiedReceiptService.js`

```javascript
const { fetchAndClassifyReceipts, generateReceiptSummary } = require('./src/services/classifiedReceiptService');

// Fetch and classify receipts
const result = await fetchAndClassifyReceipts('2026-03-24');
// Returns: { success, date, receipts, stats, totalReceipts }

// Get summary report
const summary = generateReceiptSummary(classifiedReceipts);
// Returns: { mainFlower, fb, total } with counts, totals, and percentages
```

### 5. Enhanced Frontend UI

New frontend enhancements script provides:

**Features:**
- Expense form with category selector
- Expense list with delete functionality
- Classification statistics display
- Improved Excel export button
- Real-time expense management

**Location:** `public/enhancements.js`

**Usage:**
```javascript
// Add expense
addExpenseToReport();

// Load expenses for a date
loadExpenses('2026-03-24');

// Export report to Excel
exportReportToExcel();

// Display classification stats
displayClassificationStats(stats);
```

## Database Schema Updates

### New Tables

**daily_expenses** (MySQL)
```sql
CREATE TABLE daily_expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date DATE NOT NULL,
  category VARCHAR(50) NOT NULL,
  description VARCHAR(255),
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_daily_expenses_date (date),
  FOREIGN KEY (date) REFERENCES daily_reports(date) ON DELETE CASCADE
);
```

**item_classifications** (MySQL)
```sql
CREATE TABLE item_classifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  item_name VARCHAR(255) NOT NULL UNIQUE,
  category ENUM('main', 'fb') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_item_classifications_name (item_name)
);
```

## API Endpoints

### Existing Endpoints (Enhanced)
- `GET /api/loyverse/sync?date=YYYY-MM-DD` - Now includes item classification
- `GET /api/reports/:date` - Report with classification data
- `POST /api/reports` - Save/update report

### New Endpoints
- `GET /api/reports/:date/export` - Export report to Excel
- `POST /api/expenses` - Add expense
- `GET /api/expenses/:date` - List expenses
- `DELETE /api/expenses/:id` - Remove expense

## Configuration

### Environment Variables

Add to `.env`:

```bash
# Item Classification
CLASSIFICATION_UNIT_PRICE_THRESHOLD=50

# Expense Categories (comma-separated)
EXPENSE_CATEGORIES=Taxi,Ice,Deli,Supplies,Maintenance,Utilities,Other
```

## Installation & Setup

1. **Install dependencies:**
   ```bash
   npm install exceljs
   ```

2. **Update database schema:**
   
   For MySQL:
   ```bash
   mysql -u root -p daily_pos_reports < sql/schema.sql
   ```
   
   For PostgreSQL:
   ```bash
   psql "$DATABASE_URL" -f sql/schema.postgres.sql
   ```

3. **Update HTML:**
   The `enhancements.js` script is already included in `public/index.html`

4. **Start the server:**
   ```bash
   npm run dev
   ```

## Usage Examples

### Frontend - Add Expense
```javascript
// User fills in expense form and clicks "Add Expense"
// JavaScript automatically:
// 1. Validates inputs
// 2. Sends POST request to /api/expenses
// 3. Refreshes expense list
// 4. Shows success message
```

### Frontend - Export Report
```javascript
// User selects date and clicks "Export to Excel"
// JavaScript automatically:
// 1. Fetches report data
// 2. Downloads Excel file
// 3. Shows success message
```

### Backend - Classify Receipts
```javascript
const { classifyItems } = require('./src/services/itemClassifier');
const receipts = await fetchReceiptsByDate('2026-03-24');
const classified = classifyItems(receipts);
// classified[0] = { itemName, quantity, unitPrice, category: 'main' or 'fb' }
```

## Testing

### Test Item Classification
```bash
node -e "
const classifier = require('./src/services/itemClassifier');
console.log(classifier.classifyItem('Grape Soda', 1500)); // 'main'
console.log(classifier.classifyItem('Water', 30)); // 'fb'
"
```

### Test Excel Export
1. Navigate to http://localhost:4000
2. Select a date
3. Click "Sync From Loyverse"
4. Click "Export to Excel"
5. Verify downloaded file has 4 sheets

### Test Expense Tracking
1. Navigate to http://localhost:4000
2. Select a date
3. Fill in expense form (Category, Description, Amount)
4. Click "Add Expense"
5. Verify expense appears in list

## Vercel Deployment

### Prerequisites
- Vercel account
- GitHub repository with code pushed
- PostgreSQL database (Vercel managed or external)
- Loyverse API token

### Environment Variables for Vercel
```
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
LOYVERSE_API_TOKEN=your_token_here
LOYVERSE_TIMEZONE=Asia/Bangkok
DB_AUTO_INIT=true
DB_REQUIRE_ON_STARTUP=false
AUTO_SYNC_ENABLED=false
```

### Deploy Steps
1. Push code to GitHub
2. Connect repository to Vercel
3. Add environment variables in Vercel project settings
4. Deploy

## Troubleshooting

### Excel Export Fails
- Ensure `exceljs` is installed: `npm install exceljs`
- Check that receipts are being fetched correctly
- Verify date format is YYYY-MM-DD

### Expenses Not Saving
- Check database connection
- Verify `daily_expenses` table exists
- Check browser console for errors

### Classification Not Working
- Verify item names match special case mappings
- Check unit price threshold (default: 50 THB)
- Ensure `itemClassifier.js` is properly imported

## Future Enhancements

- [ ] Custom classification rules per item
- [ ] Bulk expense import
- [ ] Advanced reporting with charts
- [ ] Email report delivery
- [ ] Multi-user support with roles
- [ ] Expense budget tracking
- [ ] Automated expense categorization using AI
- [ ] PDF export option

## Support

For issues or questions, please refer to the main README.md or contact the development team.

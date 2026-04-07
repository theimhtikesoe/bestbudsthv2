require('dotenv').config();
const { fetchClosedReceiptsByDate } = require('./src/services/loyverseService');
const itemClassifier = require('./src/services/itemClassifier');

async function audit() {
  const date = '2026-04-01';
  console.log(`Auditing F&B items for ${date}...`);
  try {
    const receipts = await fetchClosedReceiptsByDate(date);
    let auditLog = [];
    let fbTotal = 0;

    receipts.forEach(receipt => {
      const items = receipt.line_items || receipt.items || [];
      const receiptNumber = receipt.receipt_number || receipt.number;
      
      items.forEach(item => {
        const itemName = String(item.name || item.item_name || "").toLowerCase();
        const category = String(item.category_name || "").toLowerCase();
        
        const gross = Number(item.gross_total_money?.amount || item.gross_total_money || (item.price * item.quantity) || 0);
        const net = Number(item.total_money?.amount || item.total_money || 0);
        const discount = Math.max(0, gross - net);
        const discountPercent = gross > 0 ? (discount / gross * 100) : 0;
        
        const unitPrice = item.quantity > 0 ? (net / item.quantity) : net;
        const classification = itemClassifier.classifyItem(itemName, category, unitPrice);
        const isFB = classification === 'fb';

        if (isFB) {
          // Current Logic in Code:
          const isCounted = (net > 0.01 && discountPercent < 99.99);
          if (isCounted) {
            fbTotal += net;
          }
          
          auditLog.push({
            receipt: receiptNumber,
            name: item.name || item.item_name,
            net: net.toFixed(2),
            discount: discountPercent.toFixed(1) + '%',
            counted: isCounted ? 'YES' : 'NO'
          });
        }
      });
    });

    console.log('\n--- F&B Audit Log ---');
    console.table(auditLog);
    console.log(`\nFinal Calculated F&B Total: ${fbTotal.toFixed(2)}`);
    
  } catch (error) {
    console.error('Audit Error:', error);
  }
}

audit();

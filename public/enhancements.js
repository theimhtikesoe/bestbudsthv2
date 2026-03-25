/**
 * Enhanced Daily Reports - Item Classification & Expense Tracking
 * Performs full client-side Excel export using ExcelJS
 */

let currentEditingExpenseId = null;

/**
 * Get expenses from LocalStorage
 */
function getLocalExpenses(date) {
  const allExpenses = JSON.parse(localStorage.getItem('daily_expenses') || '{}');
  return allExpenses[date] || [];
}

/**
 * Save expenses to LocalStorage
 */
function saveLocalExpenses(date, expenses) {
  const allExpenses = JSON.parse(localStorage.getItem('daily_expenses') || '{}');
  allExpenses[date] = expenses;
  localStorage.setItem('daily_expenses', JSON.stringify(allExpenses));
}

/**
 * Get Closing Staff from LocalStorage
 */
function getClosingStaff(date) {
  const allStaff = JSON.parse(localStorage.getItem('closing_staff') || '{}');
  return allStaff[date] || '';
}

/**
 * Save Closing Staff to LocalStorage
 */
function saveClosingStaff(date, name) {
  const allStaff = JSON.parse(localStorage.getItem('closing_staff') || '{}');
  allStaff[date] = name;
  localStorage.setItem('closing_staff', JSON.stringify(allStaff));
}

/**
 * Add or Update expense (LocalStorage Version)
 */
async function addExpenseToReport() {
  const dateInput = document.getElementById('reportDate');
  const categorySelect = document.getElementById('expenseCategory');
  const descriptionInput = document.getElementById('expenseDescription');
  const amountInput = document.getElementById('expenseAmount');
  const submitBtn = document.querySelector('#expenseSection button');

  const date = dateInput?.value;
  const category = categorySelect?.value;
  const description = descriptionInput?.value || '';
  const amount = parseFloat(amountInput?.value) || 0;

  if (!date || !category || amount <= 0) {
    showMessage('Please fill in all expense fields', 'warning');
    return;
  }

  try {
    let expenses = getLocalExpenses(date);

    if (currentEditingExpenseId) {
      // Update existing
      expenses = expenses.map(exp => {
        if (exp.id === currentEditingExpenseId) {
          return { ...exp, category, description, amount };
        }
        return exp;
      });
      showMessage('Expense updated successfully', 'success');
      currentEditingExpenseId = null;
      if (submitBtn) submitBtn.textContent = 'Add Expense';
    } else {
      // Add new
      const newExpense = {
        id: Date.now(),
        date,
        category,
        description,
        amount,
        created_at: new Date().toISOString()
      };
      expenses.push(newExpense);
      showMessage('Expense added successfully', 'success');
    }
    
    saveLocalExpenses(date, expenses);

    // Clear form
    categorySelect.value = '';
    descriptionInput.value = '';
    amountInput.value = '';
    
    renderExpensesList(expenses, date);
  } catch (error) {
    showMessage(`Error: ${error.message}`, 'danger');
  }
}

/**
 * Edit an expense (Load into form)
 */
function editExpense(id, date) {
  const expenses = getLocalExpenses(date);
  const expense = expenses.find(e => e.id === id);
  
  if (!expense) return;

  document.getElementById('expenseCategory').value = expense.category;
  document.getElementById('expenseDescription').value = expense.description || '';
  document.getElementById('expenseAmount').value = expense.amount;
  
  currentEditingExpenseId = id;
  const submitBtn = document.querySelector('#expenseSection button');
  if (submitBtn) submitBtn.textContent = 'Update Expense';
  
  // Scroll to form
  document.getElementById('expenseSection').scrollIntoView({ behavior: 'smooth' });
}

/**
 * Cancel editing
 */
function cancelEdit() {
  currentEditingExpenseId = null;
  document.getElementById('expenseCategory').value = '';
  document.getElementById('expenseDescription').value = '';
  document.getElementById('expenseAmount').value = '';
  const submitBtn = document.querySelector('#expenseSection button');
  if (submitBtn) submitBtn.textContent = 'Add Expense';
}

/**
 * Load report data for a specific date (Staff + Expenses)
 */
async function loadReportData(date) {
  const expenses = getLocalExpenses(date);
  renderExpensesList(expenses, date);
  
  const staffName = getClosingStaff(date);
  const staffInput = document.getElementById('closingStaff');
  if (staffInput) staffInput.value = staffName;
}

/**
 * Alias for exportReportToExcel to match HTML onclick
 */
function exportToExcel() {
  return exportReportToExcel();
}

/**
 * Render expenses list in the UI
 */
function renderExpensesList(expenses, date) {
  const container = document.getElementById('expensesList');
  if (!container) return;

  if (expenses.length === 0) {
    container.innerHTML = '<p class="text-muted">No expenses recorded</p>';
    return;
  }

  let html = `
    <div class="table-responsive">
      <table class="table table-sm table-hover align-middle">
        <thead class="table-dark">
          <tr>
            <th>Category</th>
            <th>Description</th>
            <th>Amount</th>
            <th class="text-end">Actions</th>
          </tr>
        </thead>
        <tbody>
  `;

  let total = 0;
  expenses.forEach(expense => {
    const amount = parseFloat(expense.amount) || 0;
    total += amount;
    html += `
      <tr>
        <td><span class="badge bg-secondary">${expense.category}</span></td>
        <td>${expense.description || '-'}</td>
        <td class="fw-bold">${amount.toLocaleString()} THB</td>
        <td class="text-end">
          <button class="btn btn-xs btn-outline-info me-1" onclick="editExpense(${expense.id}, '${date}')">Edit</button>
          <button class="btn btn-xs btn-outline-danger" onclick="deleteExpense(${expense.id}, '${date}')">Delete</button>
        </td>
      </tr>
    `;
  });

  html += `
        </tbody>
        <tfoot class="table-light">
          <tr class="fw-bold">
            <td colspan="2">Total Expenses</td>
            <td colspan="2" class="text-primary">${total.toLocaleString()} THB</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  container.innerHTML = html;
}

/**
 * Delete expense (LocalStorage Version)
 */
async function deleteExpense(id, date) {
  if (!confirm('Are you sure you want to delete this expense?')) return;

  try {
    let expenses = getLocalExpenses(date);
    expenses = expenses.filter(e => e.id !== id);
    saveLocalExpenses(date, expenses);

    showMessage('Expense deleted', 'success');
    renderExpensesList(expenses, date);
    
    if (currentEditingExpenseId === id) {
      cancelEdit();
    }
  } catch (error) {
    showMessage(`Error: ${error.message}`, 'danger');
  }
}

/**
 * Full Client-Side Excel Export using ExcelJS
 */
async function exportReportToExcel() {
  const dateInput = document.getElementById('reportDate');
  const staffInput = document.getElementById('closingStaff');
  const date = dateInput?.value;
  const staffName = staffInput?.value || 'N/A';

  if (!date) {
    showMessage('Please select a date first', 'warning');
    return;
  }

  // Save current staff name before exporting
  saveClosingStaff(date, staffName);

  try {
    showMessage('Generating Excel file...', 'info');

    // 1. Gather Data from UI and Global Variables
    const rawData = window.lastSyncedData;
    const expenses = getLocalExpenses(date);

    if (!rawData || !rawData.receipts) {
      showMessage('No synced data available for this date. Please sync first.', 'danger');
      return;
    }

    const receipts = rawData.receipts;
    const cashTotal = Number(rawData.cash_total || 0);
    const cardTotal = Number(rawData.card_total || 0);
    const transferTotal = Number(rawData.transfer_total || 0);
    const totalGrams = Number(rawData.total_gram_qty || 0);
    const netSale = Number(rawData.net_sale || 0);

    const flowerItems = [];
    const fbItems = [];

    if (Array.isArray(receipts)) {
      receipts.forEach(receipt => {
        const items = receipt.line_items || receipt.items || [];
        const paymentMethod = (receipt.payments && receipt.payments[0]?.payment_type?.name) || 
                               (receipt.payments && receipt.payments[0]?.name) || 'N/A';
        const receiptNumber = receipt.receipt_number || receipt.number || 'N/A';
        
        const orderDiscount = parseFloat(receipt.total_discount_money?.amount || 0);
        const orderTotal = parseFloat(receipt.total_money?.amount || 0);
        const hasOrderDiscount = orderDiscount > 0;

        items.forEach(item => {
          let itemName = String(item.name || item.item_name || "").toLowerCase();
          let category = String(item.category_name || "").toLowerCase();
          let qty = Number(item.quantity || item.qty || 0);
          
          let grossPrice = Number(item.gross_total_money?.amount ?? item.total_money?.amount ?? 0);
          const lineItemDiscount = parseFloat(item.total_discount_money?.amount || item.discount_money?.amount || item.discount_amount || 0);
          
          // Final net for this line item (before order-level discount)
          let itemNetPrice = item.total_money?.amount !== undefined ? parseFloat(item.total_money.amount) : (grossPrice - lineItemDiscount);
          
          // Apply order-level discount prorated
          let allocatedOrderDiscount = 0;
          if (hasOrderDiscount && orderTotal > 0 && itemNetPrice > 0) {
            allocatedOrderDiscount = (itemNetPrice / (orderTotal + orderDiscount)) * orderDiscount;
            itemNetPrice = Math.max(0, itemNetPrice - allocatedOrderDiscount);
          }

          const totalItemDiscount = lineItemDiscount + allocatedOrderDiscount;
          const discountPercent = grossPrice > 0 ? (totalItemDiscount / grossPrice * 100) : 0;
          const discountStr = totalItemDiscount > 0 ? `${discountPercent.toFixed(0)}% (${totalItemDiscount.toFixed(2)} THB)` : '-';

          let isAcc = ['accessories', 'merchandise', 'bong', 'paper', 'tip', 'grinder', 'shirt', 'hat', 'lighter', 'the lobby', 'merch']
                      .some(keyword => itemName.includes(keyword) || category.includes(keyword));
          
          const flowerStrains = [
            'grape soda', 'blue pave', 'devil driver', 'lemon cherry gelato', 
            'moonbow', 'emergen c', 'tea time', 'silver shadow', 
            'rozay cake', 'truffaloha', 'the planet of grape', 'crunch berriez',
            'big foot', 'honey bee', 'jealousy mintz', 'crystal candy',
            'alien mint', 'rocket fuel', 'gold dust', 'darth vader',
            'cherry pop tarts', 'white cherry gelato', 'dosidos', 'obama runtz',
            'free pina colada',
            'thc gummy'
          ];

          let isFlowerStrain = flowerStrains.some(strain => itemName.includes(strain));
          
          let fbKeywords = ['soft drink', 'snacks', 'gummy', 'water', 'soda', 'milk', 'beer', 'drink', 'beverage', 'alcohol', 'wine', 'cider', 'spirit', 'cocktail', 'food', 'coffee', 'juice', 'bakery', 'cookie', 'brownie', 'cake', 'soju'];
          let hasFBKeyword = fbKeywords.some(keyword => itemName.includes(keyword) || category.includes(keyword)) ||
                             (['tea'].some(keyword => itemName.includes(keyword) || category.includes(keyword)) && !itemName.includes('tea time'));

          let isFB = !isFlowerStrain && (hasFBKeyword || (grossPrice / (qty || 1)) <= 50);

          // Only add items with net price > 0.01 to the export list (filter out free items)
          if (itemNetPrice > 0.01) {
            const exportItem = {
              name: item.name || item.item_name,
              qty: isFlowerStrain ? '-' : qty,
              gram: isFlowerStrain ? `${qty.toFixed(3)} G` : '-',
              unitPrice: grossPrice / (qty || 1),
              totalPrice: itemNetPrice,
              discount: discountStr,
              payment: paymentMethod,
              note: receiptNumber
            };

            if (isFB) fbItems.push(exportItem);
            else flowerItems.push(exportItem);
          }
        });
      });
    }

    // 2. Create Workbook
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Daily Report');

    const setHeaderStyle = (cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } };
      cell.font = { bold: true };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    };

    const setBorder = (cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    };

    // Set Header
    sheet.getCell('A1').value = `Daily Report: ${date}`;
    sheet.getCell('A1').font = { size: 16, bold: true };
    sheet.getCell('A2').value = `Staff: ${staffName}`;
    sheet.mergeCells('A1:I1');
    sheet.mergeCells('A2:I2');

    let currRow = 4;

    // --- SECTION 1: FLOWERS & ACCESSORIES ---
    const flowerHeaders = ['Type', 'Item Name', 'Discount', 'Qty', 'Gram', 'Unit Price', 'Total Price', 'Payment', 'Note'];
    flowerHeaders.forEach((h, i) => {
      const cell = sheet.getCell(`${String.fromCharCode(65 + i)}${currRow}`);
      cell.value = h;
      setHeaderStyle(cell);
    });
    currRow++;

    flowerItems.forEach(item => {
      sheet.getCell(`A${currRow}`).value = 'Flower / Acc';
      sheet.getCell(`B${currRow}`).value = item.name;
      sheet.getCell(`C${currRow}`).value = item.discount;
      sheet.getCell(`D${currRow}`).value = item.qty;
      sheet.getCell(`E${currRow}`).value = item.gram;
      sheet.getCell(`F${currRow}`).value = item.unitPrice;
      sheet.getCell(`G${currRow}`).value = item.totalPrice;
      sheet.getCell(`H${currRow}`).value = item.payment;
      sheet.getCell(`I${currRow}`).value = item.note;
      ['A','B','C','D','E','F','G','H','I'].forEach(col => setBorder(sheet.getCell(`${col}${currRow}`)));
      currRow++;
    });
    currRow += 2;

    // --- SECTION 2: EXPENSES ---
    sheet.getCell(`A${currRow}`).value = 'Expenses';
    sheet.getCell(`A${currRow}`).font = { bold: true, size: 12 };
    currRow++;
    
    const expHeaders = ['Category', 'Description', 'Amount'];
    expHeaders.forEach((h, i) => {
      const cell = sheet.getCell(`${String.fromCharCode(65 + i)}${currRow}`);
      cell.value = h;
      setHeaderStyle(cell);
    });
    currRow++;

    let totalExp = 0;
    expenses.forEach(exp => {
      totalExp += exp.amount;
      sheet.getCell(`A${currRow}`).value = exp.category;
      sheet.getCell(`B${currRow}`).value = exp.description;
      sheet.getCell(`C${currRow}`).value = exp.amount;
      ['A','B','C'].forEach(col => setBorder(sheet.getCell(`${col}${currRow}`)));
      currRow++;
    });

    sheet.getCell(`B${currRow}`).value = 'Total Expenses';
    sheet.getCell(`C${currRow}`).value = totalExp;
    sheet.getCell(`C${currRow}`).font = { bold: true };
    currRow += 2;

    // --- SECTION 3: FOOD & DRINKS ---
    sheet.getCell(`A${currRow}`).value = 'Food & Drinks';
    sheet.getCell(`A${currRow}`).font = { bold: true, size: 12 };
    currRow++;

    const fbHeaders = ['Type', 'Item Name', 'Discount', 'Qty', 'Gram', 'Unit Price', 'Total Price', 'Payment', 'Note'];
    fbHeaders.forEach((h, i) => {
      const cell = sheet.getCell(`${String.fromCharCode(65 + i)}${currRow}`);
      cell.value = h;
      setHeaderStyle(cell);
    });
    currRow++;

    fbItems.forEach(item => {
      sheet.getCell(`A${currRow}`).value = 'F&B';
      sheet.getCell(`B${currRow}`).value = item.name;
      sheet.getCell(`C${currRow}`).value = item.discount;
      sheet.getCell(`D${currRow}`).value = item.qty;
      sheet.getCell(`E${currRow}`).value = item.gram;
      sheet.getCell(`F${currRow}`).value = item.unitPrice;
      sheet.getCell(`G${currRow}`).value = item.totalPrice;
      sheet.getCell(`H${currRow}`).value = item.payment;
      sheet.getCell(`I${currRow}`).value = item.note;
      ['A','B','C','D','E','F','G','H','I'].forEach(col => setBorder(sheet.getCell(`${col}${currRow}`)));
      currRow++;
    });
    currRow += 2;

    // --- SECTION 4: DAILY SUMMARY DASHBOARD ---
    sheet.getCell(`A${currRow}`).value = 'Daily Summary Dashboard';
    sheet.getCell(`A${currRow}`).font = { bold: true, size: 12 };
    currRow++;

    const fbTotal = fbItems.reduce((acc, item) => acc + item.totalPrice, 0);
    const summaryData = [
      ['Total Grams Sold', totalGrams, 'G'],
      ['Cash In', cashTotal, 'THB'],
      ['Card In', cardTotal, 'THB'],
      ['Transfer In', transferTotal, 'THB'],
      ['F&B Total Price', fbTotal, 'THB'],
      ['Total Expenses', totalExp, 'THB'],
      ['Net Sales (Total)', netSale, 'THB'],
      ['Net Profit (After Expenses)', netSale - totalExp, 'THB']
    ];

    summaryData.forEach(row => {
      sheet.getCell(`A${currRow}`).value = row[0];
      sheet.getCell(`B${currRow}`).value = row[1];
      sheet.getCell(`C${currRow}`).value = row[2];
      ['A','B','C'].forEach(col => setBorder(sheet.getCell(`${col}${currRow}`)));
      currRow++;
    });

    // Finalize
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Daily_Report_${date}.xlsx`;
    anchor.click();
    window.URL.revokeObjectURL(url);

    showMessage('Excel report exported successfully', 'success');
  } catch (error) {
    console.error('Excel Export Error:', error);
    showMessage(`Error: ${error.message}`, 'danger');
  }
}

/**
 * Enhanced Daily Reports - Item Classification & Expense Tracking
 * Performs full client-side Excel export using ExcelJS
 * Matches User Template: BestBuds_Report_2026-03-187.xlsx
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
    categorySelect.value = '';
    descriptionInput.value = '';
    amountInput.value = '';
    renderExpensesList(expenses, date);
  } catch (error) {
    showMessage(`Error: ${error.message}`, 'danger');
  }
}

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
  document.getElementById('expenseSection').scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() {
  currentEditingExpenseId = null;
  document.getElementById('expenseCategory').value = '';
  document.getElementById('expenseDescription').value = '';
  document.getElementById('expenseAmount').value = '';
  const submitBtn = document.querySelector('#expenseSection button');
  if (submitBtn) submitBtn.textContent = 'Add Expense';
}

async function loadReportData(date) {
  const expenses = getLocalExpenses(date);
  renderExpensesList(expenses, date);
  const staffName = getClosingStaff(date);
  const staffInput = document.getElementById('closingStaff');
  if (staffInput) staffInput.value = staffName;
}

function exportToExcel() {
  return exportReportToExcel();
}

function renderExpensesList(expenses, date) {
  const container = document.getElementById('expensesList');
  if (!container) return;
  if (expenses.length === 0) {
    container.innerHTML = '<p class="text-muted">No expenses recorded</p>';
    return;
  }
  let html = `<div class="table-responsive"><table class="table table-sm table-hover align-middle"><thead class="table-dark"><tr><th>Category</th><th>Description</th><th>Amount</th><th class="text-end">Actions</th></tr></thead><tbody>`;
  let total = 0;
  expenses.forEach(expense => {
    const amount = parseFloat(expense.amount) || 0;
    total += amount;
    html += `<tr><td><span class="badge bg-secondary">${expense.category}</span></td><td>${expense.description || '-'}</td><td class="fw-bold">${amount.toLocaleString()} THB</td><td class="text-end"><button class="btn btn-xs btn-outline-info me-1" onclick="editExpense(${expense.id}, '${date}')">Edit</button><button class="btn btn-xs btn-outline-danger" onclick="deleteExpense(${expense.id}, '${date}')">Delete</button></td></tr>`;
  });
  html += `</tbody><tfoot class="table-light"><tr class="fw-bold"><td colspan="2">Total Expenses</td><td colspan="2" class="text-primary">${total.toLocaleString()} THB</td></tr></tfoot></table></div>`;
  container.innerHTML = html;
}

async function deleteExpense(id, date) {
  if (!confirm('Are you sure you want to delete this expense?')) return;
  try {
    let expenses = getLocalExpenses(date);
    expenses = expenses.filter(e => e.id !== id);
    saveLocalExpenses(date, expenses);
    showMessage('Expense deleted', 'success');
    renderExpensesList(expenses, date);
    if (currentEditingExpenseId === id) cancelEdit();
  } catch (error) {
    showMessage(`Error: ${error.message}`, 'danger');
  }
}

/**
 * Full Client-Side Excel Export - Template Matching Version
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

  saveClosingStaff(date, staffName);

  try {
    showMessage('Generating Excel file...', 'info');
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
    const netSale = Number(rawData.net_sale || 0);

    const flowerItems = [];
    const fbItems = [];
    let totalFlowerGrams = 0;

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
          let itemNetPrice = item.total_money?.amount !== undefined ? parseFloat(item.total_money.amount) : (grossPrice - lineItemDiscount);
          
          if (hasOrderDiscount && orderTotal > 0 && itemNetPrice > 0) {
            let allocatedOrderDiscount = (itemNetPrice / (orderTotal + orderDiscount)) * orderDiscount;
            itemNetPrice = Math.max(0, itemNetPrice - allocatedOrderDiscount);
          }

          // Rule: Skip Price 0 items entirely
          if (itemNetPrice <= 0.01) return;

          const totalItemDiscount = grossPrice - itemNetPrice;
          const discountPercent = grossPrice > 0 ? (totalItemDiscount / grossPrice * 100) : 0;
          const discountStr = totalItemDiscount > 0.01 ? `${discountPercent.toFixed(0)}% (${totalItemDiscount.toFixed(2)} THB)` : '-';

          const flowerStrains = [
            'grape soda', 'blue pave', 'devil driver', 'lemon cherry gelato', 
            'moonbow', 'emergen c', 'tea time', 'silver shadow', 
            'rozay cake', 'truffaloha', 'the planet of grape', 'crunch berriez',
            'big foot', 'honey bee', 'jealousy mintz', 'crystal candy',
            'alien mint', 'rocket fuel', 'gold dust', 'darth vader',
            'cherry pop tarts', 'white cherry gelato', 'dosidos', 'obama runtz',
            'free pina colada', 'thc gummy'
          ];

          let isFlowerStrain = flowerStrains.some(strain => itemName.includes(strain));
          let isThcGummy = itemName.includes('thc gummy');
          let isLobbyShirt = itemName.includes('the lobby shirt');

          let fbKeywords = ['soft drink', 'snacks', 'gummy', 'water', 'soda', 'milk', 'beer', 'drink', 'beverage', 'alcohol', 'wine', 'cider', 'spirit', 'cocktail', 'food', 'coffee', 'juice', 'bakery', 'cookie', 'brownie', 'cake', 'soju'];
          let hasFBKeyword = fbKeywords.some(keyword => itemName.includes(keyword) || category.includes(keyword)) ||
                             (['tea'].some(keyword => itemName.includes(keyword) || category.includes(keyword)) && !itemName.includes('tea time'));

          let isFB = !isFlowerStrain && (hasFBKeyword || (grossPrice / (qty || 1)) <= 50);

          const exportItem = {
            type: isFB ? 'F&B' : 'Flower/Main',
            name: item.name || item.item_name,
            qty: qty,
            unitPrice: grossPrice / (qty || 1),
            discount: discountStr,
            netPrice: itemNetPrice,
            payment: paymentMethod,
            note: receiptNumber
          };

          if (isFB) {
            fbItems.push(exportItem);
          } else {
            flowerItems.push(exportItem);
            // Gram Calculation: Exclude THC Gummy and Lobby Shirt
            if (!isThcGummy && !isLobbyShirt) {
              totalFlowerGrams += qty;
            }
          }
        });
      });
    }

    // 2. Create Workbook Matching Template
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Daily Report');

    // Styling
    const border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    const boldFont = { bold: true };
    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } };

    // Row 1: Title
    sheet.getCell('A1').value = `Daily Report - ${date}`;
    sheet.getCell('A1').font = { size: 14, bold: true };

    // Row 3: Section Title
    sheet.getCell('A3').value = 'Flower / Main / Accessories';
    sheet.getCell('A3').font = boldFont;

    // Row 4: Headers
    const headers = ['Item Type', 'Item Name', 'Qty', 'Unit Price', 'Discount', 'Net Price', 'Payment', 'Note'];
    headers.forEach((h, i) => {
      const cell = sheet.getCell(4, i + 1);
      cell.value = h;
      cell.font = boldFont;
      cell.fill = headerFill;
      cell.border = border;
    });

    let currRow = 5;
    flowerItems.forEach(item => {
      const row = sheet.getRow(currRow);
      row.values = [item.type, item.name, item.qty, item.unitPrice, item.discount, item.netPrice, item.payment, item.note];
      row.eachCell(cell => cell.border = border);
      currRow++;
    });

    currRow += 2;
    // Expenses Section
    sheet.getCell(`A${currRow}`).value = 'Expenses';
    sheet.getCell(`A${currRow}`).font = boldFont;
    currRow++;
    const expHeaders = ['Category', 'Description', 'Amount'];
    expHeaders.forEach((h, i) => {
      const cell = sheet.getCell(currRow, i + 1);
      cell.value = h;
      cell.font = boldFont;
      cell.border = border;
    });
    currRow++;
    let totalExp = 0;
    expenses.forEach(exp => {
      totalExp += exp.amount;
      const row = sheet.getRow(currRow);
      row.values = [exp.category, exp.description || '-', exp.amount];
      row.eachCell(cell => cell.border = border);
      currRow++;
    });
    currRow += 2;

    // F&B Section
    sheet.getCell(`A${currRow}`).value = 'Food & Drinks';
    sheet.getCell(`A${currRow}`).font = boldFont;
    currRow++;
    headers.forEach((h, i) => {
      const cell = sheet.getCell(currRow, i + 1);
      cell.value = h;
      cell.font = boldFont;
      cell.fill = headerFill;
      cell.border = border;
    });
    currRow++;
    fbItems.forEach(item => {
      const row = sheet.getRow(currRow);
      row.values = [item.type, item.name, item.qty, item.unitPrice, item.discount, item.netPrice, item.payment, item.note];
      row.eachCell(cell => cell.border = border);
      currRow++;
    });
    currRow += 2;

    // Dashboard Section
    sheet.getCell(`A${currRow}`).value = 'Daily Summary Dashboard';
    sheet.getCell(`A${currRow}`).font = boldFont;
    currRow++;

    const dashboard = [
      ['Total Grams Sold', totalFlowerGrams, 'G'],
      ['Cash In', cashTotal, 'THB'],
      ['Card In', cardTotal, 'THB'],
      ['Transfer In', transferTotal, 'THB'],
      ['Total Expenses', totalExp, 'THB'],
      ['Net Sales (Total)', netSale, 'THB'],
      ['Net Profit (After Expenses)', netSale - totalExp, 'THB']
    ];

    dashboard.forEach(d => {
      sheet.getCell(`A${currRow}`).value = d[0];
      sheet.getCell(`B${currRow}`).value = d[1];
      sheet.getCell(`C${currRow}`).value = d[2];
      ['A','B','C'].forEach(col => sheet.getCell(`${col}${currRow}`).border = border);
      currRow++;
    });

    // Finalize
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `BestBuds_Report_${date}.xlsx`;
    anchor.click();
    window.URL.revokeObjectURL(url);

    showMessage('Excel report exported successfully', 'success');
  } catch (error) {
    console.error('Excel Export Error:', error);
    showMessage(`Error: ${error.message}`, 'danger');
  }
}

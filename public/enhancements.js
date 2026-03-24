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
    
    const cashTotal = parseFloat(document.getElementById('cashTotal')?.value) || 0;
    const cardTotal = parseFloat(document.getElementById('cardTotal')?.value) || 0;
    const transferTotal = parseFloat(document.getElementById('transferTotal')?.value) || 0;
    const netSale = parseFloat(document.getElementById('netSale')?.value) || 0;
    const totalGramsStr = document.getElementById('totalGramsSold')?.textContent || '0.000 G';
    const totalGrams = parseFloat(totalGramsStr.replace(/[^\d.]/g, '')) || 0;

    const flowerItems = [];
    const fbItems = [];
    
    if (rawData && rawData.orders) {
      rawData.orders.forEach(order => {
        const paymentMethod = order.payments && order.payments.length > 0 ? order.payments[0].name : 'Unknown';
        const receiptNumber = order.receipt_number || 'N/A';
        const orderTotal = Number(order.total_money || 0);
        const orderDiscount = Number(order.total_discount || 0);
        const hasOrderDiscount = orderDiscount > 0;

        const items = order.line_items || order.items || [];
        items.forEach(item => {
          let itemName = String(item.name || item.item_name || "").toLowerCase();
          let category = String(item.category_name || "").toLowerCase();
          let qty = Number(item.quantity || item.qty || 0);
          
          let grossPrice = Number(item.gross_total_money ?? item.total_money ?? (Number(item.price ?? 0) * qty));
          let lineItemDiscount = Number(item.total_discount_money ?? item.discount_money ?? 0);
          let lineItemNetPrice = grossPrice - lineItemDiscount;

          let itemNetPrice = lineItemNetPrice;
          let allocatedOrderDiscount = 0;
          if (hasOrderDiscount && orderTotal > 0) {
            allocatedOrderDiscount = lineItemNetPrice / (orderTotal + orderDiscount) * orderDiscount;
            itemNetPrice = lineItemNetPrice - allocatedOrderDiscount;
          }

          const totalItemDiscount = lineItemDiscount + allocatedOrderDiscount;
          const discountPercent = grossPrice > 0 ? (totalItemDiscount / grossPrice * 100) : 0;
          const discountStr = totalItemDiscount > 0 ? `${discountPercent.toFixed(0)}% (${totalItemDiscount.toFixed(2)} THB)` : '-';

          let isAcc = ['accessories', 'merchandise', 'bong', 'paper', 'tip', 'grinder', 'shirt', 'hat', 'lighter', 'the lobby', 'merch']
                      .some(keyword => itemName.includes(keyword) || category.includes(keyword));
          let isGrapeSoda = itemName.includes('grape soda');
          let fbKeywords = ['soft drink', 'snacks', 'gummy', 'water', 'soda', 'milk', 'beer', 'drink', 'beverage', 'alcohol', 'wine', 'cider', 'spirit', 'cocktail', 'food', 'coffee', 'juice', 'bakery', 'cookie', 'brownie', 'cake'];
          let hasFBKeyword = fbKeywords.some(keyword => itemName.includes(keyword) || category.includes(keyword)) ||
                             (['tea'].some(keyword => itemName.includes(keyword) || category.includes(keyword)) && !itemName.includes('tea time'));

          let isFB = !isGrapeSoda && !itemName.includes('rozay cake') && 
                     (hasFBKeyword || ((grossPrice / (qty || 1)) <= 50 && !isAcc && !itemName.includes('free')));

          const exportItem = {
            name: item.name || item.item_name,
            qty: qty,
            unitPrice: grossPrice / (qty || 1),
            totalPrice: itemNetPrice, // This is already net price (after discount)
            discount: discountStr,
            payment: paymentMethod,
            note: receiptNumber
          };

          if (isFB) fbItems.push(exportItem);
          else flowerItems.push(exportItem);
        });
      });
    }

    // 2. Create Workbook
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Daily Report');

    const setHeaderStyle = (cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } };
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    };

    const setBorder = (cell) => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    };

    // --- HEADER: Date & Staff ---
    sheet.mergeCells('A1:H1');
    sheet.getCell('A1').value = `Daily Report - ${date}`;
    sheet.getCell('A1').font = { size: 14, bold: true };
    sheet.getCell('A1').alignment = { horizontal: 'center' };

    sheet.mergeCells('A2:H2');
    sheet.getCell('A2').value = `Closing Staff: ${staffName}`;
    sheet.getCell('A2').font = { size: 12, bold: true, color: { argb: 'FF555555' } };
    sheet.getCell('A2').alignment = { horizontal: 'center' };

    let currRow = 4;
    sheet.getCell(`A${currRow}`).value = 'Flower / Main / Accessories';
    sheet.getCell(`A${currRow}`).font = { bold: true, color: { argb: 'FF0000FF' } };
    currRow++;

    const headers = ['Item Type', 'Item Name', 'Qty', 'Unit Price', 'Discount', 'Net Price', 'Payment', 'Note'];
    headers.forEach((h, i) => {
      const cell = sheet.getCell(currRow, i + 1);
      cell.value = h;
      setHeaderStyle(cell);
    });
    currRow++;

    flowerItems.forEach(item => {
      sheet.getCell(`A${currRow}`).value = 'Flower/Main';
      sheet.getCell(`B${currRow}`).value = item.name;
      sheet.getCell(`C${currRow}`).value = item.qty;
      sheet.getCell(`D${currRow}`).value = item.unitPrice;
      sheet.getCell(`E${currRow}`).value = item.discount;
      sheet.getCell(`F${currRow}`).value = item.totalPrice;
      sheet.getCell(`G${currRow}`).value = item.payment;
      sheet.getCell(`H${currRow}`).value = item.note;
      ['A','B','C','D','E','F','G','H'].forEach(col => setBorder(sheet.getCell(`${col}${currRow}`)));
      currRow++;
    });
    currRow += 2;

    // --- SECTION 2: EXPENSES ---
    sheet.getCell(`A${currRow}`).value = 'Expenses';
    sheet.getCell(`A${currRow}`).font = { bold: true, color: { argb: 'FFFF0000' } };
    currRow++;

    const expenseHeaders = ['Category', 'Description', 'Amount'];
    expenseHeaders.forEach((h, i) => {
      const cell = sheet.getCell(currRow, i + 1);
      cell.value = h;
      setHeaderStyle(cell);
    });
    currRow++;

    let totalExp = 0;
    expenses.forEach(exp => {
      sheet.getCell(`A${currRow}`).value = exp.category;
      sheet.getCell(`B${currRow}`).value = exp.description || '-';
      sheet.getCell(`C${currRow}`).value = exp.amount;
      totalExp += exp.amount;
      ['A','B','C'].forEach(col => setBorder(sheet.getCell(`${col}${currRow}`)));
      currRow++;
    });
    currRow += 2;

    // --- SECTION 3: FOOD & DRINKS ---
    sheet.getCell(`A${currRow}`).value = 'Food & Drinks';
    sheet.getCell(`A${currRow}`).font = { bold: true, color: { argb: 'FF008000' } };
    currRow++;

    headers.forEach((h, i) => {
      const cell = sheet.getCell(currRow, i + 1);
      cell.value = h;
      setHeaderStyle(cell);
    });
    currRow++;

    fbItems.forEach(item => {
      sheet.getCell(`A${currRow}`).value = 'F&B';
      sheet.getCell(`B${currRow}`).value = item.name;
      sheet.getCell(`C${currRow}`).value = item.qty;
      sheet.getCell(`D${currRow}`).value = item.unitPrice;
      sheet.getCell(`E${currRow}`).value = item.discount;
      sheet.getCell(`F${currRow}`).value = item.totalPrice;
      sheet.getCell(`G${currRow}`).value = item.payment;
      sheet.getCell(`H${currRow}`).value = item.note;
      ['A','B','C','D','E','F','G','H'].forEach(col => setBorder(sheet.getCell(`${col}${currRow}`)));
      currRow++;
    });
    currRow += 2;

    // --- SECTION 4: DAILY SUMMARY DASHBOARD ---
    sheet.getCell(`A${currRow}`).value = 'Daily Summary Dashboard';
    sheet.getCell(`A${currRow}`).font = { bold: true, size: 12 };
    currRow++;

    const summaryData = [
      ['Total Grams Sold', totalGrams, 'G'],
      ['Cash In', cashTotal, 'THB'],
      ['Card In', cardTotal, 'THB'],
      ['Transfer In', transferTotal, 'THB'],
      ['Total Expenses', totalExp, 'THB'],
      ['Net Sales (Total)', netSale, 'THB'],
      ['Net Profit (After Expenses)', netSale - totalExp, 'THB']
    ];

    summaryData.forEach(data => {
      sheet.getCell(`A${currRow}`).value = data[0];
      sheet.getCell(`B${currRow}`).value = data[1];
      sheet.getCell(`C${currRow}`).value = data[2];
      sheet.getCell(`A${currRow}`).font = { bold: true };
      setBorder(sheet.getCell(`A${currRow}`));
      setBorder(sheet.getCell(`B${currRow}`));
      setBorder(sheet.getCell(`C${currRow}`));
      currRow++;
    });

    // Column Widths
    sheet.getColumn(1).width = 20;
    sheet.getColumn(2).width = 35;
    sheet.getColumn(3).width = 10;
    sheet.getColumn(4).width = 12;
    sheet.getColumn(5).width = 20;
    sheet.getColumn(6).width = 12;
    sheet.getColumn(7).width = 15;
    sheet.getColumn(8).width = 20;

    // 3. Save File
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BestBuds_Report_${date}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    showMessage('Excel exported successfully!', 'success');
  } catch (error) {
    console.error('Export Error:', error);
    showMessage(`Export failed: ${error.message}`, 'danger');
  }
}

/**
 * Show message to user
 */
function showMessage(text, type = 'info') {
  const messageEl = document.getElementById('message');
  if (!messageEl) return;

  messageEl.className = `alert alert-${type}`;
  messageEl.textContent = text;
  messageEl.classList.remove('d-none');

  setTimeout(() => {
    messageEl.classList.add('d-none');
  }, 5000);
}

/**
 * Initialize enhancements
 */
function initializeEnhancements() {
  console.log('Initializing Enhancements...');
  
  const exportBtn = document.getElementById('exportCsvBtn');
  if (exportBtn) {
    exportBtn.onclick = function(e) {
      e.preventDefault();
      exportReportToExcel();
    };
  }

  const dateInput = document.getElementById('reportDate');
  if (dateInput) {
    dateInput.addEventListener('change', (e) => {
      if (e.target.value) {
        loadReportData(e.target.value);
      }
    });
    if (dateInput.value) {
      loadReportData(dateInput.value);
    }
  }

  const staffInput = document.getElementById('closingStaff');
  if (staffInput) {
    staffInput.addEventListener('change', (e) => {
      const date = document.getElementById('reportDate')?.value;
      if (date) {
        saveClosingStaff(date, e.target.value);
      }
    });
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeEnhancements);
} else {
  initializeEnhancements();
}

/**
 * Enhanced Daily Reports - Item Classification & Expense Tracking
 * Integrates with the existing app.js
 */

// Expense categories
const EXPENSE_CATEGORIES = [
  'Taxi',
  'Ice',
  'Deli',
  'Supplies',
  'Maintenance',
  'Utilities',
  'Other'
];

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
 * Add expense to the daily report (LocalStorage Version)
 */
async function addExpenseToReport() {
  const dateInput = document.getElementById('reportDate');
  const categorySelect = document.getElementById('expenseCategory');
  const descriptionInput = document.getElementById('expenseDescription');
  const amountInput = document.getElementById('expenseAmount');

  const date = dateInput?.value;
  const category = categorySelect?.value;
  const description = descriptionInput?.value || '';
  const amount = parseFloat(amountInput?.value) || 0;

  if (!date || !category || amount <= 0) {
    showMessage('Please fill in all expense fields', 'warning');
    return;
  }

  try {
    const expenses = getLocalExpenses(date);
    const newExpense = {
      id: Date.now(),
      date,
      category,
      description,
      amount,
      created_at: new Date().toISOString()
    };
    
    expenses.push(newExpense);
    saveLocalExpenses(date, expenses);

    showMessage('Expense added successfully (Local)', 'success');
    descriptionInput.value = '';
    amountInput.value = '';
    renderExpensesList(expenses, date);
  } catch (error) {
    showMessage(`Error: ${error.message}`, 'danger');
  }
}

/**
 * Load expenses for a specific date
 */
async function loadExpenses(date) {
  const expenses = getLocalExpenses(date);
  renderExpensesList(expenses, date);
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

  let html = '<table class="table table-sm"><thead><tr><th>Category</th><th>Description</th><th>Amount</th><th>Action</th></tr></thead><tbody>';

  let total = 0;
  expenses.forEach(expense => {
    const amount = parseFloat(expense.amount) || 0;
    total += amount;
    html += `
      <tr>
        <td>${expense.category}</td>
        <td>${expense.description || '-'}</td>
        <td>${amount.toFixed(2)} THB</td>
        <td>
          <button class="btn btn-sm btn-danger" onclick="deleteExpense(${expense.id}, '${date}')">Delete</button>
        </td>
      </tr>
    `;
  });

  html += `
    <tr class="table-active fw-bold">
      <td colspan="2">Total Expenses</td>
      <td>${total.toFixed(2)} THB</td>
      <td></td>
    </tr>
  </tbody></table>`;

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
  } catch (error) {
    showMessage(`Error: ${error.message}`, 'danger');
  }
/**
 * Export report to Excel with classification
 */
async function exportReportToExcel() {
  const dateInput = document.getElementById('reportDate');
  const date = dateInput?.value;

  if (!date) {
    showMessage('Please select a date first', 'warning');
    return;
  }

  try {
    const expenses = getLocalExpenses(date);
    const expensesParam = encodeURIComponent(JSON.stringify(expenses));
    
    const response = await fetch(`/api/reports/${date}/export?expenses=${expensesParam}`);
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.message || 'Failed to export report');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BestBuds_Report_${date}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    showMessage(`Export failed: ${error.message}`, 'danger');
  }
}

/**
 * Display item classification statistics
 */
function displayClassificationStats(stats) {
  const container = document.getElementById('classificationStats');
  if (!container) return;

  const html = `
    <div class="row g-3">
      <div class="col-md-3">
        <div class="card">
          <div class="card-body">
            <h6 class="card-title">Main/Flower Items</h6>
            <p class="card-text h4">${stats.mainCount}</p>
            <small class="text-muted">${stats.mainTotal} THB</small>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card">
          <div class="card-body">
            <h6 class="card-title">F&B Items</h6>
            <p class="card-text h4">${stats.fbCount}</p>
            <small class="text-muted">${stats.fbTotal} THB</small>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card">
          <div class="card-body">
            <h6 class="card-title">Total Items</h6>
            <p class="card-text h4">${stats.mainCount + stats.fbCount}</p>
            <small class="text-muted">${stats.totalAmount} THB</small>
          </div>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
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
  const reportSection = document.getElementById('reportSection');
  
  // 1. Restore Expense Section
  if (reportSection && !document.getElementById('expenseSection')) {
    console.log('Creating Expense Section...');
    const expenseHTML = `
      <div id="expenseSection" class="mt-4">
        <h2 class="h5 mb-3">Daily Expenses</h2>
        <div class="detail-box p-3">
          <div class="row g-3 mb-3">
            <div class="col-md-3">
              <label for="expenseCategory" class="form-label small text-muted">Category</label>
              <select id="expenseCategory" class="form-select form-select-sm">
                <option value="">Select Category</option>
                ${EXPENSE_CATEGORIES.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
              </select>
            </div>
            <div class="col-md-4">
              <label for="expenseDescription" class="form-label small text-muted">Description</label>
              <input id="expenseDescription" type="text" class="form-control form-control-sm" placeholder="Optional" />
            </div>
            <div class="col-md-2">
              <label for="expenseAmount" class="form-label small text-muted">Amount (THB)</label>
              <input id="expenseAmount" type="number" min="0" step="0.01" class="form-control form-control-sm" />
            </div>
            <div class="col-md-3 d-flex align-items-end">
              <button onclick="addExpenseToReport()" class="btn btn-sm btn-success w-100 fw-bold">Add Expense</button>
            </div>
          </div>
          <div id="expensesList" class="mt-3"></div>
        </div>
      </div>
    `;
    
    // Position it after the Net Sale row
    const netSaleInput = document.getElementById('netSale');
    if (netSaleInput) {
      const row = netSaleInput.closest('.row');
      if (row) {
        row.insertAdjacentHTML('afterend', expenseHTML);
      } else {
        reportSection.querySelector('.card-body').insertAdjacentHTML('beforeend', expenseHTML);
      }
    } else {
      reportSection.querySelector('.card-body').insertAdjacentHTML('beforeend', expenseHTML);
    }
  }

  // 2. Setup Export Button
  const exportBtn = document.getElementById('exportCsvBtn');
  if (exportBtn) {
    console.log('Binding Export Button...');
    exportBtn.onclick = function(e) {
      e.preventDefault();
      exportReportToExcel();
    };
  }

  // 3. Date Change Listener
  const dateInput = document.getElementById('reportDate');
  if (dateInput) {
    dateInput.addEventListener('change', (e) => {
      if (e.target.value) {
        loadExpenses(e.target.value);
      }
    });
    // Initial load if date is already set
    if (dateInput.value) {
      loadExpenses(dateInput.value);
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeEnhancements);
} else {
  initializeEnhancements();
}

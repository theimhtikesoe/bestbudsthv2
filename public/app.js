/**
 * Daily POS Closing & Report System - Frontend Logic
 */

// Global state for synced data
window.lastSyncedData = null;

/**
 * Show alert messages to user
 * Moved to global scope so it can be called from other scripts
 */
window.showMessage = function(message, type = 'info') {
  const alertContainer = document.getElementById('message'); // Matches index.html alert div
  if (!alertContainer) return;

  alertContainer.className = `alert alert-${type} d-block`;
  alertContainer.innerHTML = message;

  // Auto-hide after 5 seconds
  setTimeout(() => {
    alertContainer.className = 'alert d-none';
  }, 5000);
};

document.addEventListener('DOMContentLoaded', () => {
  // Initialize date to today
  const dateInput = document.getElementById('reportDate');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
    
    // Load existing data for today
    if (typeof loadReportData === 'function') {
      loadReportData(today);
    }
  }

  // Handle date change
  dateInput?.addEventListener('change', (e) => {
    if (typeof loadReportData === 'function') {
      loadReportData(e.target.value);
    }
  });

  // Handle Sync button
  const syncBtn = document.getElementById('syncButton'); // Matches index.html
  syncBtn?.addEventListener('click', syncData);

  // Handle Export button (Mobile-friendly listener)
  const exportBtn = document.getElementById('exportCsvBtn'); // Matches index.html
  if (exportBtn) {
    exportBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof exportToExcel === 'function') {
        exportToExcel();
      } else {
        window.showMessage('Excel export logic is still loading. Please wait a moment.', 'warning');
      }
    });
  }
});

/**
 * Sync data from Loyverse API via our backend
 */
async function syncData() {
  const dateInput = document.getElementById('reportDate');
  const syncBtn = document.getElementById('syncButton');
  const date = dateInput?.value;

  if (!date) {
    window.showMessage('Please select a date first', 'warning');
    return;
  }

  try {
    // UI Loading state
    syncBtn.disabled = true;
    syncBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Syncing...';
    
    const response = await fetch(`/api/sync?date=${date}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to sync data');
    }

    // Save to global state
    window.lastSyncedData = data;
    
    // Update UI
    updateDashboard(data);
    renderOrderEntries(data.receipts || []);
    renderDetailedSales(data.receipts || []);
    
    window.showMessage('Data synced successfully from Loyverse', 'success');
  } catch (error) {
    console.error('Sync Error:', error);
    window.showMessage(`Sync Error: ${error.message}`, 'danger');
  } finally {
    syncBtn.disabled = false;
    syncBtn.innerHTML = 'Sync From Loyverse';
  }
}

/**
 * Update the main dashboard numbers
 */
function updateDashboard(data) {
  document.getElementById('cashTotal').value = data.cash_total || 0;
  document.getElementById('cardTotal').value = data.card_total || 0;
  document.getElementById('transferTotal').value = data.transfer_total || 0;
  document.getElementById('totalOrders').value = data.total_orders || 0;
  document.getElementById('netSale').value = data.net_sale || 0;
  document.getElementById('totalGramsSold').innerText = (data.total_gram_qty || 0).toFixed(3) + ' G';
}

/**
 * Render basic order entries table
 */
function renderOrderEntries(receipts) {
  const container = document.getElementById('orderEntriesBody');
  if (!container) return;

  if (receipts.length === 0) {
    container.innerHTML = '<tr><td colspan="4" class="text-center">No orders found</td></tr>';
    return;
  }

  let html = '';
  receipts.forEach(receipt => {
    const time = new Date(receipt.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const receiptNo = receipt.receipt_number || receipt.number;
    const grams = receipt.total_gram_qty || 0;
    const mainPrice = receipt.main_and_acc_price || 0;
    const fbPrice = receipt.fb_price || 0;

    html += `
      <tr>
        <td>${time}</td>
        <td>${receiptNo}</td>
        <td>${grams.toFixed(3)} G</td>
        <td class="text-end">${mainPrice.toLocaleString()} / ${fbPrice.toLocaleString()}</td>
      </tr>
    `;
  });

  container.innerHTML = html;
}

/**
 * Render detailed line-item sales record
 */
function renderDetailedSales(receipts) {
  const container = document.getElementById('bestBudsSalesBody'); // Matches index.html
  if (!container) return;

  const detailedItems = [];

  receipts.forEach(receipt => {
    const items = receipt.line_items || receipt.items || [];
    const orderDiscountMoney = Number(receipt.total_discount_money?.amount || 0);
    const orderTotalMoney = Number(receipt.total_money?.amount || 0);
    const hasOrderDiscount = orderDiscountMoney > 0;
    
    items.forEach(item => {
      let itemName = String(item?.name || item?.item_name || "").toLowerCase();
      let category = String(item?.category_name || "").toLowerCase();
      
      let grossPrice = Number(item?.gross_total_money?.amount ?? item?.gross_total_money ?? item?.total_money?.amount ?? item?.total_money ?? (Number(item?.price ?? 0) * Number(item?.quantity ?? item?.qty ?? 0)));
      let lineItemNetPrice = Number(item?.total_money?.amount ?? item?.total_money ?? 0);
      if (lineItemNetPrice === 0 && grossPrice > 0) {
        lineItemNetPrice = grossPrice - Number(item?.total_discount_money?.amount ?? item?.total_discount_money ?? item?.discount_money?.amount ?? item?.discount_money ?? 0);
      }

      let itemNetPrice = lineItemNetPrice;
      if (hasOrderDiscount && orderTotalMoney > 0 && lineItemNetPrice > 0) {
        itemNetPrice = lineItemNetPrice - (lineItemNetPrice / (orderTotalMoney + orderDiscountMoney) * orderDiscountMoney);
      }

      if (itemNetPrice <= 0.01) return;

      let qty = Number(item?.quantity ?? item?.qty ?? 0);
      if (itemName.includes('lemon cherry') && grossPrice >= 4970) {
        qty = 7;
      }

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
      
      let isFB = !isFlowerStrain && (['soft drink', 'snacks', 'gummy', 'water', 'soda', 'milk', 'beer', 'drink', 'beverage', 'alcohol', 'wine', 'cider', 'spirit', 'cocktail', 'food', 'coffee', 'juice', 'bakery', 'cookie', 'brownie', 'cake', 'soju']
                 .some(keyword => itemName.includes(keyword) || category.includes(keyword)) || 
                 (['tea'].some(keyword => itemName.includes(keyword) || category.includes(keyword)) && !itemName.includes('tea time')) ||
                 (grossPrice / (qty || 1)) <= 50);

      detailedItems.push({
        grams: !isFB && !isLobbyShirt && !isThcGummy ? qty : 0,
        itemName: item?.item_name || item?.name || 'Unknown Item',
        mainPrice: isFB ? 0 : itemNetPrice,
        fbPrice: isFB ? itemNetPrice : 0
      });
    });
  });

  if (detailedItems.length === 0) {
    container.innerHTML = '<tr><td colspan="3" class="text-center">No items found</td></tr>';
    return;
  }

  let html = '';
  detailedItems.forEach(item => {
    html += `
      <tr>
        <td>${item.grams > 0 ? item.grams.toFixed(3) : '-'}</td>
        <td>${item.itemName}</td>
        <td class="text-end">${item.mainPrice > 0 ? item.mainPrice.toLocaleString() : '-'} / ${item.fbPrice > 0 ? item.fbPrice.toLocaleString() : '-'}</td>
      </tr>
    `;
  });

  container.innerHTML = html;
}

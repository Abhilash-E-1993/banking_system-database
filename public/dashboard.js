// dashboard.js — improved, robust, modal-fixed version
// IMPORTANT: set API_BASE to match your backend origin if different.
// Example: const API_BASE = "http://localhost:5000";
const API_BASE = ' http://localhost:3000'; // same-origin by default

// Routes (adjust if your backend mounts differently)
const AUTH_ME = `${API_BASE}/api/auth/me`;
const AUTH_LOGOUT = `${API_BASE}/api/auth/logout`;
const ACCOUNTS_BASE = `${API_BASE}/api/accounts`; // use e.g. /api/accounts/:id/...

/* --------- DOM elements (assigned after DOMContentLoaded) --------- */
let currentAccountId = null;
let currentAccountNumber = null;
let user = null;

let userNameEl, userEmailEl, accNumberEl, balanceEl, createdAtEl, transactionsList;
let logoutBtn, refreshBtn, cashAmount, cashType, cashSubmit, transferForm, toAccountId, transferAmount, transferSubmit;
let modal, modalBody, modalConfirm, modalCancel, toast;

/* Simple toast */
function showToast(msg, timeout = 2500) {
  if (!toast) return alert(msg);
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (toast.hidden = true), timeout);
}

/* Wrapper that sends credentials and handles 401 redirect */
async function requireAuthFetch(url, opts = {}) {
  opts.credentials = 'include';
  opts.headers = opts.headers || {};
  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(url, opts);
  if (res.status === 401) {
    // session expired or unauthorized — redirect to login
    window.location.href = 'login.html';
    throw new Error('Unauthorized');
  }
  return res;
}

/* ----- Modal helpers (use boolean hidden attribute) ----- */
function hideModal() {
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  // restore focus to main container
  const main = document.getElementById('mainContainer');
  if (main) main.focus();
  document.removeEventListener('keydown', onModalKeydown);
}

function onModalKeydown(e) {
  if (e.key === 'Escape') hideModal();
  // optional: trap tab between modalConfirm and modalCancel
  if (e.key === 'Tab') {
    const focusables = [modalCancel, modalConfirm].filter(Boolean);
    if (focusables.length === 0) return;
    const idx = focusables.indexOf(document.activeElement);
    if (e.shiftKey) {
      // move backward
      const prev = focusables[(idx - 1 + focusables.length) % focusables.length];
      prev.focus();
      e.preventDefault();
    } else {
      const next = focusables[(idx + 1) % focusables.length];
      next.focus();
      e.preventDefault();
    }
  }
}

/**
 * showModal(html, onConfirm)
 * - html: innerHTML to put inside modal body
 * - onConfirm: async function executed when Confirm clicked
 */
function showModal(html, onConfirm) {
  if (!modal || !modalBody) {
    console.error('Modal elements not available');
    return;
  }

  // set content
  modalBody.innerHTML = html;

  // show
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');

  // clear previous handlers
  modalConfirm.onclick = null;
  modalCancel.onclick = null;

  // handlers
  modalConfirm.onclick = async () => {
    hideModal();
    try {
      await onConfirm();
    } catch (err) {
      console.error('Modal onConfirm error:', err);
      showToast(err?.message || 'Operation failed');
    }
  };
  modalCancel.onclick = () => hideModal();

  // keyboard and focus
  document.addEventListener('keydown', onModalKeydown);
  // focus confirm for quick keyboard confirm
  setTimeout(() => {
    if (modalConfirm) modalConfirm.focus();
  }, 0);
}

/* ----- UX: Tabs ----- */
function wireTabs() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      const el = document.getElementById('tab-' + tab);
      if (el) el.classList.add('active');
    });
  });

  // Quick action buttons
  document.querySelectorAll('.action-card').forEach(b => {
    b.addEventListener('click', () => {
      const action = b.dataset.action;
      if (action === 'deposit') {
        document.querySelector('.nav-item[data-tab="actions"]').click();
        cashType.value = 'deposit';
        cashAmount.focus();
      } else if (action === 'withdraw') {
        document.querySelector('.nav-item[data-tab="actions"]').click();
        cashType.value = 'withdraw';
        cashAmount.focus();
      } else if (action === 'transfer') {
        document.querySelector('.nav-item[data-tab="actions"]').click();
        toAccountId.focus();
      }
    });
  });
}

/* ----- Data loading ----- */
async function loadMe() {
  try {
    const res = await requireAuthFetch(AUTH_ME);
    const data = await res.json();
    if (!res.ok) {
      console.error('me failed', data);
      window.location.href = 'login.html';
      return;
    }
    user = data.user;
    const account = data.account;
    if (!user) { window.location.href = 'login.html'; return; }

    userNameEl.textContent = user.name || '—';
    userEmailEl.textContent = user.email || '—';

    if (account) {
      currentAccountId = account.account_id;
      currentAccountNumber = account.account_number;
      accNumberEl.textContent = account.account_number || '—';
      balanceEl.textContent = formatCurrency(account.balance);
      createdAtEl.textContent = account.created_at ? `Created: ${formatDate(account.created_at)}` : '';
      await loadTransactions(); // update tx and authoritative balance
    } else {
      accNumberEl.textContent = 'No account';
      balanceEl.textContent = formatCurrency(0);
      transactionsList.innerHTML = '<div class="muted">No account exists. Create one in backend or via API.</div>';
    }
  } catch (err) {
    console.error(err);
    // If fetch threw (network issue), show friendly message
    showToast('Could not load profile (network).');
  }
}

async function loadTransactions() {
  if (!currentAccountId) return;
  transactionsList.textContent = 'Loading...';
  try {
    const res = await requireAuthFetch(`${ACCOUNTS_BASE}/${currentAccountId}/history`);
    const data = await res.json();
    if (!res.ok) {
      transactionsList.innerHTML = `<div class="muted">Failed to load transactions</div>`;
      return;
    }
    renderTransactions(data.transactions || []);
    // also refresh balance from server
    const balRes = await requireAuthFetch(`${ACCOUNTS_BASE}/${currentAccountId}/balance`);
    if (balRes.ok) {
      const balData = await balRes.json();
      balanceEl.textContent = formatCurrency(balData.balance);
    }
  } catch (err) {
    console.error(err);
    transactionsList.innerHTML = `<div class="muted">Network error</div>`;
  }
}

function renderTransactions(list) {
  if (!list || list.length === 0) {
    transactionsList.innerHTML = '<div class="muted">No transactions yet</div>';
    return;
  }
  transactionsList.innerHTML = '';
  list.forEach(tx => {
    const el = document.createElement('div');
    el.className = 'tx';
    const left = document.createElement('div');
    left.innerHTML = `<div><strong>${(tx.type || '').toUpperCase()}</strong></div><div class="meta">${tx.description || ''}</div>`;
    const right = document.createElement('div');
    right.innerHTML = `<div><strong>${formatCurrency(tx.amount)}</strong></div><div class="meta">${formatDate(tx.created_at)}</div>`;
    el.appendChild(left); el.appendChild(right);
    transactionsList.appendChild(el);
  });
}

/* ----- Format helpers ----- */
function formatCurrency(value) {
  const n = Number(value || 0);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);
}
function formatDate(s) {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

/* ----- Actions: logout, refresh, cash, transfer ----- */
async function doLogout() {
  try {
    await requireAuthFetch(AUTH_LOGOUT, { method: 'POST' });
  } catch (e) { /* ignore */ }
  window.location.href = 'login.html';
}

async function handleCashSubmit() {
  const amt = Number(cashAmount.value);
  const type = cashType.value;
  if (!amt || amt <= 0) { showToast('Enter valid amount'); return; }
  if (!currentAccountId) { showToast('No account selected'); return; }

  showModal(`<p>Confirm ${type} of <strong>${formatCurrency(amt)}</strong> to account <strong>${currentAccountNumber || currentAccountId}</strong>?</p>`, async () => {
    const url = `${ACCOUNTS_BASE}/${currentAccountId}/${type}`;
    try {
      const res = await requireAuthFetch(url, { method: 'POST', body: { amount: amt } });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Operation failed');
      }
      balanceEl.textContent = formatCurrency(data.balance);
      await loadTransactions();
      cashAmount.value = '';
      showToast('Success');
    } catch (err) {
      console.error(err);
      showToast(err?.message || 'Operation failed');
    }
  });
}

async function handleTransferSubmit() {
  const toId = Number(toAccountId.value);
  const amt = Number(transferAmount.value);
  if (!toId || toId <= 0) { showToast('Enter valid recipient account id'); return; }
  if (!amt || amt <= 0) { showToast('Enter valid amount'); return; }
  if (!currentAccountId) { showToast('No account selected'); return; }
  if (toId === Number(currentAccountId)) { showToast('Cannot transfer to same account'); return; }

  showModal(`<p>Transfer <strong>${formatCurrency(amt)}</strong> to account ID <strong>${toId}</strong>?</p>`, async () => {
    try {
      const res = await requireAuthFetch(`${ACCOUNTS_BASE}/${currentAccountId}/transfer/${toId}`, { method: 'POST', body: { amount: amt } });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Transfer failed');
      }
      balanceEl.textContent = formatCurrency(data.from?.balance ?? 0);
      await loadTransactions();
      toAccountId.value = '';
      transferAmount.value = '';
      showToast('Transfer completed');
    } catch (err) {
      console.error(err);
      showToast(err?.message || 'Transfer failed');
    }
  });
}

/* ----- Initialization ----- */
document.addEventListener('DOMContentLoaded', () => {
  // assign elements
  userNameEl = document.getElementById('userName');
  userEmailEl = document.getElementById('userEmail');
  accNumberEl = document.getElementById('accNumber');
  balanceEl = document.getElementById('balance');
  createdAtEl = document.getElementById('createdAt');
  transactionsList = document.getElementById('transactionsList');

  logoutBtn = document.getElementById('logoutBtn');
  refreshBtn = document.getElementById('refreshBtn');

  cashAmount = document.getElementById('cashAmount');
  cashType = document.getElementById('cashType');
  cashSubmit = document.getElementById('cashSubmit');

  transferForm = document.getElementById('transferForm');
  toAccountId = document.getElementById('toAccountId');
  transferAmount = document.getElementById('transferAmount');
  transferSubmit = document.getElementById('transferSubmit');

  // modal elements
  modal = document.getElementById('modal');
  modalBody = document.getElementById('modalBody');
  modalConfirm = document.getElementById('modalConfirm');
  modalCancel = document.getElementById('modalCancel');

  toast = document.getElementById('toast');

  // sanity check
  if (!modal || !modalBody || !modalConfirm || !modalCancel) {
    console.error('Modal DOM elements are missing - ensure modal HTML is present in the page');
  }

  // wire actions
  logoutBtn.addEventListener('click', doLogout);
  refreshBtn.addEventListener('click', async () => { await loadMe(); showToast('Refreshed'); });

  cashSubmit.addEventListener('click', handleCashSubmit);
  transferSubmit.addEventListener('click', handleTransferSubmit);

  wireTabs();
  loadMe();
});

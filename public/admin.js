/**
 * ORICAN Printify Admin Command Center
 * Client Application Logic
 */

(function () {
  'use strict';

  // State
  const state = {
    key: localStorage.getItem('orican_admin_key') || new URLSearchParams(window.location.search).get('key') || '',
    theme: localStorage.getItem('orican_theme') || 'dark',
    activeTab: 'status',
    autoRefreshTimer: null,
    blanksData: null,
    statusData: null,
    catalogData: null
  };

  // DOM Elements
  const el = {
    themeToggle: document.getElementById('themeToggle'),
    lockBtn: document.getElementById('lockBtn'),
    authModal: document.getElementById('authModal'),
    authForm: document.getElementById('authForm'),
    authKeyInput: document.getElementById('authKeyInput'),
    authError: document.getElementById('authError'),
    navTabs: document.querySelectorAll('.tab-btn'),
    tabPanes: document.querySelectorAll('.tab-pane'),
    jsonModal: document.getElementById('jsonModal'),
    jsonModalTitle: document.getElementById('jsonModalTitle'),
    jsonModalCode: document.getElementById('jsonModalCode'),
    closeJsonModal: document.getElementById('closeJsonModal'),
    copyJsonBtn: document.getElementById('copyJsonBtn'),
    toastContainer: document.getElementById('toastContainer'),

    // Status Tab Elements
    refreshStatusBtn: document.getElementById('refreshStatusBtn'),
    runDiagBtn: document.getElementById('runDiagBtn'),
    autoRefreshToggle: document.getElementById('autoRefreshToggle'),
    envContainer: document.getElementById('envContainer'),
    runsTableBody: document.getElementById('runsTableBody'),
    lastRefreshedAt: document.getElementById('lastRefreshedAt'),

    // Orders Tab Elements
    runTestOrderBtn: document.getElementById('runTestOrderBtn'),
    keepTestOrderCheck: document.getElementById('keepTestOrderCheck'),
    testOrderResultBox: document.getElementById('testOrderResultBox'),
    testOrderResultCode: document.getElementById('testOrderResultCode'),
    cancelTestOrderId: document.getElementById('cancelTestOrderId'),
    cancelTestOrderBtn: document.getElementById('cancelTestOrderBtn'),

    // Blanks Tab Elements
    refreshBlanksBtn: document.getElementById('refreshBlanksBtn'),
    syncTemplatesBtn: document.getElementById('syncTemplatesBtn'),
    syncBlankModeCheck: document.getElementById('syncBlankModeCheck'),
    blanksContainer: document.getElementById('blanksContainer'),
    browseCatalogBtn: document.getElementById('browseCatalogBtn'),

    // Theme Tab Elements
    themeSrcUrl: document.getElementById('themeSrcUrl'),
    themeModeSelect: document.getElementById('themeModeSelect'),
    buildThemeBtn: document.getElementById('buildThemeBtn'),
    themeBuildResultBox: document.getElementById('themeBuildResultBox'),
    themeBuildUrl: document.getElementById('themeBuildUrl'),
    themeBuildSha: document.getElementById('themeBuildSha'),
    themeBuildDetails: document.getElementById('themeBuildDetails'),
    copyThemeUrlBtn: document.getElementById('copyThemeUrlBtn')
  };

  // Initialize
  function init() {
    applyTheme(state.theme);
    setupEvents();

    if (!state.key) {
      showAuthModal();
    } else {
      verifyKeyAndLoad();
    }
  }

  // Theme Management
  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('orican_theme', theme);
    if (el.themeToggle) {
      el.themeToggle.innerHTML = theme === 'light'
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
    }
  }

  function toggleTheme() {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  }

  // Authentication & API Client
  function showAuthModal() {
    el.authModal.classList.add('open');
    el.authKeyInput.value = state.key;
    el.authKeyInput.focus();
  }

  function hideAuthModal() {
    el.authModal.classList.remove('open');
    el.authError.style.display = 'none';
  }

  async function apiFetch(endpoint, options = {}) {
    if (!state.key) {
      showAuthModal();
      throw new Error('Admin key required');
    }

    const headers = {
      'x-admin-key': state.key,
      ...(options.headers || {})
    };

    if (options.body && typeof options.body === 'object') {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    const res = await fetch(endpoint, { ...options, headers });
    if (res.status === 401) {
      showToast('Authentication failed: Invalid Admin Key', 'error');
      showAuthModal();
      throw new Error('Unauthorized');
    }

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = (data && (data.error || data.message)) || `HTTP ${res.status}`;
      throw new Error(err);
    }

    return data;
  }

  async function verifyKeyAndLoad() {
    try {
      const data = await apiFetch('/api/status');
      hideAuthModal();
      localStorage.setItem('orican_admin_key', state.key);
      showToast('Authenticated successfully', 'success');
      renderStatus(data);
    } catch (err) {
      el.authError.textContent = err.message || 'Invalid admin key';
      el.authError.style.display = 'block';
      showAuthModal();
    }
  }

  // Tab Navigation
  function switchTab(tabId) {
    state.activeTab = tabId;
    el.navTabs.forEach(btn => {
      const active = btn.dataset.tab === tabId;
      btn.classList.toggle('active', active);
    });

    el.tabPanes.forEach(pane => {
      pane.classList.toggle('active', pane.id === `tab-${tabId}`);
    });

    // Auto-load data for the active tab if empty
    if (tabId === 'status' && !state.statusData) {
      loadStatus();
    } else if (tabId === 'blanks' && !state.blanksData) {
      loadBlanks();
    }
  }

  // --- Module 1: Status & Webhook Activity ---
  async function loadStatus(diag = false) {
    try {
      el.refreshStatusBtn.disabled = true;
      const url = diag ? '/api/status?diag=1' : '/api/status';
      const data = await apiFetch(url);
      renderStatus(data);
      if (diag) {
        if (data.blobWrite && data.blobWrite.ok) {
          showToast('Blob Diagnostic PASSED: Store is public and read/write active', 'success');
        } else {
          showToast(`Blob Diagnostic FAILED: ${data.blobWrite?.error || 'Unknown error'}`, 'error');
        }
      }
    } catch (err) {
      showToast(`Status check failed: ${err.message}`, 'error');
    } finally {
      el.refreshStatusBtn.disabled = false;
    }
  }

  function renderStatus(data) {
    state.statusData = data;
    if (el.lastRefreshedAt) {
      el.lastRefreshedAt.textContent = new Date().toLocaleTimeString();
    }

    // Render Env Checklist
    const env = data.env || {};
    const envEntries = [
      { key: 'PRINTIFY_TOKEN', label: 'Printify Token', ok: !!env.PRINTIFY_TOKEN },
      { key: 'SHOPIFY_WEBHOOK_SECRET', label: 'Shopify Webhook Secret', ok: !!env.SHOPIFY_WEBHOOK_SECRET },
      { key: 'BLOB_READ_WRITE_TOKEN', label: 'Blob Storage Token', ok: !!env.BLOB_READ_WRITE_TOKEN },
      { key: 'ALLOWED_ORIGINS', label: 'CORS Origins', ok: !!env.ALLOWED_ORIGINS, value: env.ALLOWED_ORIGINS },
      { key: 'AUTO_PRODUCTION', label: 'Auto Production', ok: env.AUTO_PRODUCTION === true, value: env.AUTO_PRODUCTION ? 'TRUE' : 'FALSE' }
    ];

    el.envContainer.innerHTML = envEntries.map(e => `
      <div class="env-card">
        <div class="env-info">
          <span class="env-name">${e.label}</span>
          <span class="env-status-label">${e.value || (e.ok ? 'Configured' : 'Missing')}</span>
        </div>
        <span class="env-badge ${e.ok ? 'ok' : 'missing'}">
          ${e.ok ? 'OK' : 'MISSING'}
        </span>
      </div>
    `).join('');

    // Render Webhook Runs Table
    const runs = data.runs || [];
    if (!runs.length) {
      el.runsTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; padding: 28px; color: var(--text-muted);">
            No order webhook executions logged in Blob storage yet.
          </td>
        </tr>
      `;
      return;
    }

    el.runsTableBody.innerHTML = runs.map((run, idx) => {
      const hasError = !!run.error;
      const skipped = !!run.skipped;
      const badgeClass = hasError ? 'badge-danger' : skipped ? 'badge-warning' : 'badge-success';
      const statusText = hasError ? run.error : skipped ? `Skipped: ${run.skipped}` : 'Fulfillment Sent';
      const timeStr = run.at ? new Date(run.at).toLocaleString() : 'Recent';

      return `
        <tr>
          <td><span class="mono-pill">${timeStr}</span></td>
          <td><strong>${run.order || '#TEST'}</strong></td>
          <td><span class="badge ${badgeClass}">${statusText}</span></td>
          <td>${run.items || run.line_items || 0}</td>
          <td>
            <button class="btn btn-secondary btn-sm inspect-run-btn" data-run-index="${idx}">
              Inspect Payload
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Attach inspect buttons
    document.querySelectorAll('.inspect-run-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = btn.dataset.runIndex;
        openJsonModal(`Webhook Log: ${runs[idx].order || 'Execution'}`, runs[idx]);
      });
    });
  }

  // --- Module 2: Orders & Simulation ---
  async function runTestOrder() {
    try {
      el.runTestOrderBtn.disabled = true;
      el.runTestOrderBtn.textContent = 'Executing…';
      const keep = el.keepTestOrderCheck.checked ? '?keep=1' : '';
      const result = await apiFetch(`/api/test-order${keep}`, { method: 'POST' });

      el.testOrderResultBox.style.display = 'block';
      el.testOrderResultCode.textContent = JSON.stringify(result, null, 2);

      if (result.cancelled && !result.cancelled.error) {
        showToast('Test order placed and auto-cancelled successfully in Printify', 'success');
      } else if (result.result && result.result.printify_order_id) {
        showToast(`Test order created: ID ${result.result.printify_order_id}`, 'info');
      } else {
        showToast('Test completed', 'info');
      }
    } catch (err) {
      showToast(`Test order failed: ${err.message}`, 'error');
    } finally {
      el.runTestOrderBtn.disabled = false;
      el.runTestOrderBtn.textContent = 'Trigger Test Order';
    }
  }

  async function cancelTestOrder() {
    const id = el.cancelTestOrderId.value.trim();
    if (!id || !/^[a-f0-9]{24}$/.test(id)) {
      showToast('Please enter a valid 24-character hexadecimal Printify order ID', 'error');
      return;
    }

    try {
      el.cancelTestOrderBtn.disabled = true;
      el.cancelTestOrderBtn.textContent = 'Cancelling…';
      const result = await apiFetch(`/api/test-order?cancel=${encodeURIComponent(id)}`, { method: 'POST' });
      showToast(`Order ${id} cancelled (Status: ${result.status})`, 'success');
      el.cancelTestOrderId.value = '';
    } catch (err) {
      showToast(`Cancel failed: ${err.message}`, 'error');
    } finally {
      el.cancelTestOrderBtn.disabled = false;
      el.cancelTestOrderBtn.textContent = 'Cancel Order';
    }
  }

  // --- Module 3: Blanks & Catalog Explorer ---
  async function loadBlanks() {
    try {
      el.refreshBlanksBtn.disabled = true;
      const data = await apiFetch('/api/setup');
      state.blanksData = data;
      renderBlanks(data);
    } catch (err) {
      showToast(`Failed to load blanks: ${err.message}`, 'error');
    } finally {
      el.refreshBlanksBtn.disabled = false;
    }
  }

  function renderBlanks(data) {
    const blanks = data.blanks || [];
    el.blanksContainer.innerHTML = blanks.map((b, bIdx) => {
      const colors = Object.keys(b.colors || {});
      const firstColor = colors[0] || '';
      const initialMockup = (b.mockups && b.mockups[firstColor]) || '/orican-placeholder.png';

      // Calculate cost range
      const costs = (b.variants || []).map(v => v.cost_cents).filter(Boolean);
      const minCost = costs.length ? (Math.min(...costs) / 100).toFixed(2) : '14.00';
      const maxCost = costs.length ? (Math.max(...costs) / 100).toFixed(2) : '15.00';
      const costRange = minCost === maxCost ? `$${minCost}` : `$${minCost} - $${maxCost}`;

      return `
        <div class="blank-card" data-blank-index="${bIdx}">
          <div class="blank-preview-stage">
            <span class="blank-mockup-badge">${b.key} • ID ${b.blueprint_id}</span>
            <img class="blank-mockup-img" id="mockup-${bIdx}" src="${initialMockup}" alt="${b.name}" />
          </div>

          <div class="blank-content">
            <div class="blank-title-row">
              <h3 class="blank-title">${b.name}</h3>
              <span class="blank-blueprint">Provider 30 (OPT OnDemand)</span>
            </div>

            <div class="swatch-group">
              <div class="swatch-label">
                <span>Color Swatches</span>
                <span id="selected-color-name-${bIdx}">${firstColor}</span>
              </div>
              <div class="swatch-list">
                ${colors.map((cName, cIdx) => `
                  <button 
                    class="swatch-btn ${cIdx === 0 ? 'active' : ''}" 
                    style="background-color: ${b.colors[cName]};" 
                    title="${cName}"
                    data-blank-idx="${bIdx}"
                    data-color="${cName}"
                    data-mockup="${(b.mockups && b.mockups[cName]) || ''}"
                  ></button>
                `).join('')}
              </div>
            </div>

            <div class="swatch-group">
              <span class="swatch-label">Available Sizes (${(b.sizes || []).length})</span>
              <div class="size-pill-group">
                ${(b.sizes || []).map(s => `<span class="size-pill">${s}</span>`).join('')}
              </div>
            </div>

            <div class="blank-meta-row">
              <div>
                <div style="font-size:0.68rem; color:var(--text-muted); text-transform:uppercase; font-family:var(--font-mono);">Printify Cost</div>
                <div class="blank-cost-range">${costRange} USD</div>
              </div>
              <button class="btn btn-secondary btn-sm view-variants-btn" data-blank-idx="${bIdx}">
                View Variants (${(b.variants || []).length})
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach Color Swatch click handlers
    document.querySelectorAll('.swatch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const bIdx = btn.dataset.blankIdx;
        const colorName = btn.dataset.color;
        const mockupUrl = btn.dataset.mockup;

        // Update active class
        const parentCard = btn.closest('.blank-card');
        parentCard.querySelectorAll('.swatch-btn').forEach(s => s.classList.remove('active'));
        btn.classList.add('active');

        // Update color label
        const label = document.getElementById(`selected-color-name-${bIdx}`);
        if (label) label.textContent = colorName;

        // Update mockup image
        const img = document.getElementById(`mockup-${bIdx}`);
        if (img && mockupUrl) {
          img.style.opacity = '0.4';
          img.src = mockupUrl;
          img.onload = () => { img.style.opacity = '1'; };
        }
      });
    });

    // Attach View Variants modal buttons
    document.querySelectorAll('.view-variants-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const bIdx = btn.dataset.blankIdx;
        const blank = blanks[bIdx];
        openJsonModal(`Variant Matrix: ${blank.name}`, blank.variants || []);
      });
    });
  }

  async function syncTemplates() {
    const isBlank = el.syncBlankModeCheck.checked;
    const msg = isBlank 
      ? "Sync Printify templates in BLANK mode (transparent mockups for customer design compositing)?"
      : "Sync Printify templates with placeholder mark in Shop 7881083?";

    if (!confirm(msg)) return;

    try {
      el.syncTemplatesBtn.disabled = true;
      el.syncTemplatesBtn.textContent = 'Syncing…';
      const endpoint = isBlank ? '/api/setup?blank=1' : '/api/setup';
      const res = await apiFetch(endpoint, { method: 'POST' });
      showToast('Printify template drafts synchronized successfully', 'success');
      state.blanksData = res;
      renderBlanks(res);
    } catch (err) {
      showToast(`Sync failed: ${err.message}`, 'error');
    } finally {
      el.syncTemplatesBtn.disabled = false;
      el.syncTemplatesBtn.textContent = 'Sync Templates in Printify';
    }
  }

  async function browseCatalog() {
    try {
      el.browseCatalogBtn.disabled = true;
      el.browseCatalogBtn.textContent = 'Querying Printify…';
      const data = await apiFetch('/api/catalog');
      state.catalogData = data;
      openJsonModal('Printify EU Provider Catalog', data);
    } catch (err) {
      showToast(`Failed to fetch catalog: ${err.message}`, 'error');
    } finally {
      el.browseCatalogBtn.disabled = false;
      el.browseCatalogBtn.textContent = 'Explore EU Providers';
    }
  }

  // --- Module 4: Theme Build & Liquid Patcher ---
  async function buildTheme() {
    const src = el.themeSrcUrl.value.trim();
    if (!src) {
      showToast('Please provide a Shopify CDN URL', 'error');
      return;
    }

    const mode = el.themeModeSelect.value;
    try {
      el.buildThemeBtn.disabled = true;
      el.buildThemeBtn.textContent = 'Building & Uploading to Blob…';

      const url = `/api/theme-build?src=${encodeURIComponent(src)}${mode !== 'default' ? `&mode=${mode}` : ''}`;
      const result = await apiFetch(url, { method: 'POST' });

      el.themeBuildResultBox.style.display = 'block';
      el.themeBuildUrl.value = result.url || '';
      el.themeBuildSha.textContent = result.sha || 'N/A';
      el.themeBuildDetails.textContent = JSON.stringify(result, null, 2);

      showToast('Theme file built and stored in Blob successfully', 'success');
    } catch (err) {
      showToast(`Theme build failed: ${err.message}`, 'error');
    } finally {
      el.buildThemeBtn.disabled = false;
      el.buildThemeBtn.textContent = 'Build & Deploy to Blob';
    }
  }

  // --- Modal & Utilities ---
  function openJsonModal(title, data) {
    el.jsonModalTitle.textContent = title;
    el.jsonModalCode.textContent = JSON.stringify(data, null, 2);
    el.jsonModal.classList.add('open');
  }

  function hideJsonModal() {
    el.jsonModal.classList.remove('open');
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    if (type === 'success') {
      icon = '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
    } else if (type === 'error') {
      icon = '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
    }

    toast.innerHTML = `${icon}<span>${message}</span>`;
    el.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  function copyText(text, btnElement) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Copied to clipboard', 'success');
      if (btnElement) {
        const originalText = btnElement.textContent;
        btnElement.textContent = 'Copied!';
        setTimeout(() => { btnElement.textContent = originalText; }, 1800);
      }
    }).catch(() => {
      showToast('Failed to copy to clipboard', 'error');
    });
  }

  // Event Listeners
  function setupEvents() {
    // Theme toggle
    if (el.themeToggle) el.themeToggle.addEventListener('click', toggleTheme);

    // Lock button
    if (el.lockBtn) {
      el.lockBtn.addEventListener('click', () => {
        showAuthModal();
      });
    }

    // Auth form submission
    if (el.authForm) {
      el.authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        state.key = el.authKeyInput.value.trim();
        verifyKeyAndLoad();
      });
    }

    // Tab buttons
    el.navTabs.forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Status events
    if (el.refreshStatusBtn) el.refreshStatusBtn.addEventListener('click', () => loadStatus(false));
    if (el.runDiagBtn) el.runDiagBtn.addEventListener('click', () => loadStatus(true));
    if (el.autoRefreshToggle) {
      el.autoRefreshToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
          state.autoRefreshTimer = setInterval(() => {
            if (state.activeTab === 'status') loadStatus(false);
          }, 25000);
          showToast('Live auto-refresh enabled (25s interval)', 'info');
        } else {
          clearInterval(state.autoRefreshTimer);
          state.autoRefreshTimer = null;
          showToast('Auto-refresh disabled', 'info');
        }
      });
    }

    // Orders events
    if (el.runTestOrderBtn) el.runTestOrderBtn.addEventListener('click', runTestOrder);
    if (el.cancelTestOrderBtn) el.cancelTestOrderBtn.addEventListener('click', cancelTestOrder);

    // Blanks events
    if (el.refreshBlanksBtn) el.refreshBlanksBtn.addEventListener('click', loadBlanks);
    if (el.syncTemplatesBtn) el.syncTemplatesBtn.addEventListener('click', syncTemplates);
    if (el.browseCatalogBtn) el.browseCatalogBtn.addEventListener('click', browseCatalog);

    // Theme events
    if (el.buildThemeBtn) el.buildThemeBtn.addEventListener('click', buildTheme);
    if (el.copyThemeUrlBtn) {
      el.copyThemeUrlBtn.addEventListener('click', () => {
        copyText(el.themeBuildUrl.value, el.copyThemeUrlBtn);
      });
    }

    // Modal events
    if (el.closeJsonModal) el.closeJsonModal.addEventListener('click', hideJsonModal);
    if (el.copyJsonBtn) {
      el.copyJsonBtn.addEventListener('click', () => {
        copyText(el.jsonModalCode.textContent, el.copyJsonBtn);
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        hideJsonModal();
      } else if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        if (e.key === '1') switchTab('status');
        if (e.key === '2') switchTab('orders');
        if (e.key === '3') switchTab('blanks');
        if (e.key === '4') switchTab('theme');
        if (e.key.toLowerCase() === 'l') showAuthModal();
        if (e.key.toLowerCase() === 'r') {
          if (state.activeTab === 'status') loadStatus(false);
          if (state.activeTab === 'blanks') loadBlanks();
        }
      }
    });
  }

  // Start on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

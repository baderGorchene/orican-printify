/**
 * ORICAN Printify Admin & Operations CRM
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
    globalSearchInput: document.getElementById('globalSearchInput'),

    // Status Tab Elements
    refreshStatusBtn: document.getElementById('refreshStatusBtn'),
    runDiagBtn: document.getElementById('runDiagBtn'),
    autoRefreshToggle: document.getElementById('autoRefreshToggle'),
    envContainer: document.getElementById('envContainer'),
    runsTableBody: document.getElementById('runsTableBody'),
    lastRefreshedAt: document.getElementById('lastRefreshedAt'),
    kpiProdMode: document.getElementById('kpiProdMode'),

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
        ? '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>'
        : '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
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
      showToast('Connected to ORICAN backend', 'success');
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

    if (tabId === 'status' && !state.statusData) {
      loadStatus();
    } else if (tabId === 'blanks' && !state.blanksData) {
      loadBlanks();
    } else if (tabId === 'models' && !state.modelsData) {
      loadModels();
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
          showToast('Blob Diagnostic PASSED: Storage is public and read/write active', 'success');
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
    if (el.kpiProdMode) {
      el.kpiProdMode.textContent = env.AUTO_PRODUCTION ? 'Auto-Production' : 'Manual Approval';
    }

    const envEntries = [
      { key: 'PRINTIFY_TOKEN', label: 'Printify Token', ok: !!env.PRINTIFY_TOKEN, desc: 'Bearer token for Printify API v1' },
      { key: 'SHOPIFY_WEBHOOK_SECRET', label: 'Shopify Webhook Secret', ok: !!env.SHOPIFY_WEBHOOK_SECRET, desc: 'HMAC SHA-256 signing secret' },
      { key: 'BLOB_READ_WRITE_TOKEN', label: 'Vercel Blob Storage', ok: !!env.BLOB_READ_WRITE_TOKEN, desc: 'Public storage for customer proofs' },
      { key: 'ALLOWED_ORIGINS', label: 'CORS Origins', ok: !!env.ALLOWED_ORIGINS, desc: env.ALLOWED_ORIGINS || 'CORS origins allowlist' },
      { key: 'AUTO_PRODUCTION', label: 'Auto Production Mode', ok: env.AUTO_PRODUCTION === true, desc: env.AUTO_PRODUCTION ? 'Direct to production' : 'Hold for manual review' }
    ];

    el.envContainer.innerHTML = envEntries.map(e => `
      <div class="env-tile">
        <div>
          <div class="env-name-label">${e.label}</div>
          <div class="env-desc-label">${e.desc}</div>
        </div>
        <span class="status-pill ${e.ok ? 'success' : 'error'}">
          ${e.ok ? 'OK' : 'MISSING'}
        </span>
      </div>
    `).join('');

    // Render Webhook Runs Table
    const runs = data.runs || [];
    if (!runs.length) {
      el.runsTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; padding: 36px; color: var(--text-muted);">
            No order webhook executions logged in Blob storage yet.
          </td>
        </tr>
      `;
      return;
    }

    renderRunsTable(runs);
  }

  function renderRunsTable(runs) {
    el.runsTableBody.innerHTML = runs.map((run, idx) => {
      const hasError = !!run.error;
      const skipped = !!run.skipped;
      const statusClass = hasError ? 'status-pill error' : skipped ? 'status-pill warning' : 'status-pill success';
      const statusText = hasError ? run.error : skipped ? `Skipped: ${run.skipped}` : 'Fulfillment Sent';
      const timeStr = run.at ? new Date(run.at).toLocaleString() : 'Recent';

      return `
        <tr>
          <td><span style="font-family:var(--font-mono); font-size:0.75rem;">${timeStr}</span></td>
          <td><strong style="color:var(--text-primary);">${run.order || '#TEST'}</strong></td>
          <td><span class="${statusClass}">${statusText}</span></td>
          <td><span style="font-weight:600;">${run.items || run.line_items || 0}</span> items</td>
          <td>
            <button class="btn btn-secondary btn-sm inspect-run-btn" data-run-index="${idx}">
              Inspect Payload
            </button>
          </td>
        </tr>
      `;
    }).join('');

    document.querySelectorAll('.inspect-run-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = btn.dataset.runIndex;
        openJsonModal(`Webhook Execution: ${runs[idx].order || 'Run'}`, runs[idx]);
      });
    });
  }

  // --- Module 2: Orders & Simulation ---
  async function runTestOrder() {
    try {
      el.runTestOrderBtn.disabled = true;
      el.runTestOrderBtn.textContent = 'Simulating…';
      const keep = el.keepTestOrderCheck.checked ? '?keep=1' : '';
      const result = await apiFetch(`/api/test-order${keep}`, { method: 'POST' });

      el.testOrderResultBox.style.display = 'block';
      el.testOrderResultCode.textContent = JSON.stringify(result, null, 2);

      if (result.cancelled && !result.cancelled.error) {
        showToast('Simulated order created & auto-cancelled in Printify', 'success');
      } else if (result.result && result.result.printify_order_id) {
        showToast(`Order created in Printify: ID ${result.result.printify_order_id}`, 'info');
      } else {
        showToast('Simulation complete', 'info');
      }
    } catch (err) {
      showToast(`Simulation failed: ${err.message}`, 'error');
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
      el.cancelTestOrderBtn.textContent = 'Cancel Order in Printify';
    }
  }

  // --- Module 3: Blanks & Catalog Explorer ---
  // --- 3D Model Catalogue ---
  // Every model is optimized here before upload, so the storefront downloads as little as possible:
  // FBX/OBJ become GLB, only the base color texture is kept (it's the only map the customizer uses),
  // textures are capped at 2048 px and stored as JPEG unless they need alpha. The picker never loads 3D:
  // it shows spin.webp, a strip of SPIN_FRAMES pre-rendered angles.
  const MODEL_WARN_BYTES = 10 * 1024 * 1024;
  const MAX_TEXTURE = 2048;
  const SPIN_FRAMES = 12;
  const SPIN_SIZE = 256;
  const fmtSize = (b) => `${(b / 1048576).toFixed(1)} MB`;

  async function loadModels() {
    const box = document.getElementById('modelsContainer');
    try {
      const res = await fetch('/api/models', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.modelsData = await res.json();
      box.innerHTML = state.modelsData.length ? state.modelsData.map(m => {
        const kind = m.model.split('?')[0].split('.').pop().toUpperCase();
        const preview = m.spin
          ? `<div class="blank-mockup-img" role="img" aria-label="${m.name}" style="background:url('${m.spin}') 0 0 / ${SPIN_FRAMES * 100}% 100% no-repeat;"></div>`
          : `<img class="blank-mockup-img" src="${m.thumb || '/orican-placeholder.png'}" alt="${m.name}" />`;
        return `
        <div class="blank-crm-card">
          <div class="blank-stage">
            <span class="blank-blueprint-pill">${kind}${m.texture ? ' + texture' : ''} • ${fmtSize(m.size)}</span>
            ${preview}
          </div>
          <div class="blank-card-details">
            <div class="blank-header-row">
              <h3 class="blank-name-title" style="text-transform:capitalize;">${m.name}</h3>
              <div style="display:flex; gap:8px;">
                ${m.spin ? '' : `<button class="btn btn-secondary btn-sm" data-optimize-model="${m.slug}">Optimize</button>`}
                <button class="btn btn-danger btn-sm" data-delete-model="${m.slug}">Delete</button>
              </div>
            </div>
            ${m.spin ? '' : '<p class="form-hint">Not optimized yet: shoppers download the full file and see no spin preview.</p>'}
            ${m.size > MODEL_WARN_BYTES ? `<p class="form-hint" style="color:#e5484d;">Still over ${fmtSize(MODEL_WARN_BYTES)} after optimizing: the mesh itself is heavy. Decimating it in Blender helps most.</p>` : ''}
          </div>
        </div>`;
      }).join('') : '<div style="grid-column:1 / -1; text-align:center; padding:48px; color:var(--text-muted);">No models yet. Add one above.</div>';
    } catch (err) {
      showToast(`Failed to load models: ${err.message}`, 'error');
    }
  }

  // Same three.js release (r128) and loaders as the storefront customizer.
  const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/';
  const LOADER_LIBS = {
    glb: [THREE_CDN + 'loaders/GLTFLoader.js'],
    fbx: [THREE_CDN + 'libs/fflate.min.js', THREE_CDN + 'loaders/FBXLoader.js'],
    obj: [THREE_CDN + 'loaders/OBJLoader.js'],
  };
  const scriptCache = {};
  const loadScript = (src) => scriptCache[src] || (scriptCache[src] = new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = () => { delete scriptCache[src]; fail(new Error(`Could not load ${src}`)); };
    document.head.appendChild(s);
  }));
  const extOf = (f) => f.name.split('?')[0].split('.').pop().toLowerCase();

  async function loadObject(modelFile, textureFile) {
    const kind = extOf(modelFile);
    if (!LOADER_LIBS[kind]) throw new Error(`Unsupported model type .${kind}`);
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
    for (const src of [...LOADER_LIBS[kind], THREE_CDN + 'exporters/GLTFExporter.js']) await loadScript(src);

    let obj;
    if (kind === 'glb') {
      const buf = await modelFile.arrayBuffer();
      obj = await new Promise((ok, fail) => new THREE.GLTFLoader().parse(buf, '', g => ok(g.scene), fail));
    } else if (kind === 'fbx') {
      // Same as the storefront: external texture paths can't resolve, so they become a blank pixel.
      const mgr = new THREE.LoadingManager();
      mgr.setURLModifier(u => /^(blob:|data:)/.test(u) ? u : 'data:image/gif;base64,R0lGODlhAQABAAAAACw=');
      obj = new THREE.FBXLoader(mgr).parse(await modelFile.arrayBuffer(), '');
    } else {
      obj = new THREE.OBJLoader().parse(await modelFile.text());
    }

    let tex = null;
    if (textureFile) {
      const url = URL.createObjectURL(textureFile);
      tex = await new THREE.TextureLoader().loadAsync(url).finally(() => URL.revokeObjectURL(url));
      tex.encoding = THREE.sRGBEncoding;
    }
    // Keep only what the customizer renders: base color texture and color. Normal/roughness/metal maps
    // are typically most of a model's weight and the customizer never uses them.
    obj.traverse(o => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const out = mats.map(src => {
        const img = src && src.map && src.map.image;
        const map = tex || (img && img.width > 1 ? src.map : null);
        const alpha = !!src && (src.transparent || src.alphaTest > 0);
        if (map) map.format = alpha ? THREE.RGBAFormat : THREE.RGBFormat; // RGB -> exported as JPEG
        return new THREE.MeshStandardMaterial({
          name: (src && src.name) || '',
          map,
          color: map ? 0xffffff : ((src && src.color) || new THREE.Color(0xcccccc)),
          transparent: alpha,
          alphaTest: (src && src.alphaTest) || 0,
          roughness: 0.6,
          metalness: 0.05,
          side: THREE.DoubleSide,
        });
      });
      o.material = Array.isArray(o.material) ? out : out[0];
    });
    return obj;
  }

  const exportGlb = (obj) => new Promise((ok, fail) => {
    try {
      new THREE.GLTFExporter().parse(obj, ok, { binary: true, maxTextureSize: MAX_TEXTURE });
    } catch (err) { fail(err); }
  });

  // SPIN_FRAMES views around the Y axis side by side in one WebP, played by the picker with CSS steps().
  async function renderSpin(obj) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    const strip = document.createElement('canvas');
    strip.width = SPIN_SIZE * SPIN_FRAMES;
    strip.height = SPIN_SIZE;
    const ctx = strip.getContext('2d');
    const pivot = new THREE.Group();
    const parent = obj.parent;
    try {
      renderer.setSize(SPIN_SIZE, SPIN_SIZE);
      renderer.outputEncoding = THREE.sRGBEncoding;
      const scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, 0.75));
      const sun = new THREE.DirectionalLight(0xffffff, 0.9);
      sun.position.set(2, 3, 4);
      scene.add(sun, pivot);
      pivot.add(obj);
      // Center the model on the pivot and frame its bounding sphere so it never leaves the frame.
      const sphere = new THREE.Box3().setFromObject(obj).getBoundingSphere(new THREE.Sphere());
      const offset = sphere.center.clone();
      obj.position.sub(offset);
      const dist = (sphere.radius || 1) / Math.sin(THREE.MathUtils.degToRad(16)) * 1.05;
      const camera = new THREE.PerspectiveCamera(32, 1, dist / 100, dist * 10);
      camera.position.set(0, 0, dist);
      for (let i = 0; i < SPIN_FRAMES; i++) {
        pivot.rotation.y = (i / SPIN_FRAMES) * Math.PI * 2;
        renderer.render(scene, camera);
        ctx.drawImage(renderer.domElement, i * SPIN_SIZE, 0);
      }
      obj.position.add(offset);
      return await new Promise((ok, fail) => strip.toBlob(b => b ? ok(b) : fail(new Error('Preview render failed')), 'image/webp', 0.82));
    } finally {
      pivot.remove(obj);
      if (parent) parent.add(obj);
      renderer.dispose();
      renderer.forceContextLoss();
    }
  }

  // model (+ optional mtl/texture/thumb Files) -> [[Blob, publishedName]] ready to upload.
  async function optimizeModel(model, mtl, texture, thumb, setStatus) {
    setStatus('Optimizing…');
    const parts = [];
    try {
      const obj = await loadObject(model, texture);
      setStatus('Rendering preview…');
      parts.push([await renderSpin(obj), 'spin.webp']);
      setStatus('Compressing…');
      const glb = new Blob([await exportGlb(obj)], { type: 'model/gltf-binary' });
      // An already-lean GLB can come out bigger after re-encoding; keep whichever is smaller.
      parts.push(extOf(model) === 'glb' && glb.size >= model.size ? [model, 'model.glb'] : [glb, 'model.glb']);
    } catch (err) {
      // Exotic files the exporter can't handle still work, just unoptimized.
      showToast(`Couldn't optimize (${err.message}); uploading the original files.`, 'error');
      parts.length = 0;
      parts.push([model, `model.${extOf(model)}`]);
      if (mtl) parts.push([mtl, 'model.mtl']);
      if (texture) parts.push([texture, `texture.${extOf(texture).replace('jpeg', 'jpg')}`]);
    }
    if (thumb) parts.push([thumb, `thumb.${extOf(thumb).replace('jpeg', 'jpg')}`]);
    return parts;
  }

  // Upload parts, then delete every older file of that model, so it is never missing mid-upload.
  async function publishModel(slug, parts, keep, setStatus) {
    const { upload } = await import('/orican-upload.js');
    const urls = [...keep];
    for (const [blob, name] of parts) {
      setStatus(`Uploading ${name} (${fmtSize(blob.size)})…`);
      const r = await upload(`models/${slug}/${name}`, blob, { access: 'public', handleUploadUrl: '/api/models', clientPayload: state.key });
      urls.push(r.url);
    }
    await apiFetch('/api/models', { method: 'POST', body: { action: 'prune', slug, keep: urls } });
  }

  async function uploadModel(e) {
    e.preventDefault();
    if (!state.key) return showAuthModal();
    const slug = document.getElementById('modelName').value.trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    const file = (id) => document.getElementById(id).files[0];
    const model = file('modelFile');
    if (!slug || !model) return showToast('Name and model file are required', 'error');
    const btn = document.getElementById('uploadModelBtn');
    const setStatus = (t) => { btn.textContent = t; };
    btn.disabled = true;
    try {
      const parts = await optimizeModel(model, file('modelMtl'), file('modelTexture'), file('modelThumb'), setStatus);
      const before = [model, file('modelMtl'), file('modelTexture')].reduce((n, f) => n + (f ? f.size : 0), 0);
      const after = parts.filter(([, n]) => /^(model|texture)/.test(n)).reduce((n, [b]) => n + b.size, 0);
      await publishModel(slug, parts, [], setStatus);
      showToast(`Model "${slug}" uploaded: ${fmtSize(before)} → ${fmtSize(after)}`, 'success');
      e.target.reset();
      loadModels();
    } catch (err) {
      showToast(`Upload failed: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Upload model';
    }
  }

  async function optimizeExisting(slug, btn) {
    if (!state.key) return showAuthModal();
    const m = (state.modelsData || []).find(x => x.slug === slug);
    if (!m) return;
    const setStatus = (t) => { btn.textContent = t; };
    btn.disabled = true;
    try {
      setStatus('Downloading…');
      const asFile = async (url) => {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status} for ${url.split('/').pop()}`);
        return new File([await r.blob()], url.split('/').pop());
      };
      const [model, mtl, texture] = await Promise.all([m.model, m.mtl, m.texture].map(u => u ? asFile(u) : null));
      const parts = await optimizeModel(model, mtl, texture, null, setStatus);
      const after = parts.filter(([, n]) => /^(model|texture)/.test(n)).reduce((n, [b]) => n + b.size, 0);
      await publishModel(slug, parts, m.thumb ? [m.thumb] : [], setStatus);
      showToast(`"${slug}" optimized: ${fmtSize(m.size)} → ${fmtSize(after)}`, 'success');
      loadModels();
    } catch (err) {
      showToast(`Optimize failed: ${err.message}`, 'error');
      btn.disabled = false;
      btn.textContent = 'Optimize';
    }
  }

  async function deleteModel(slug) {
    if (!confirm(`Delete model "${slug}" from the catalogue?`)) return;
    try {
      await apiFetch('/api/models', { method: 'POST', body: { action: 'delete', slug } });
      showToast(`Model "${slug}" deleted`, 'success');
      loadModels();
    } catch (err) {
      showToast(`Delete failed: ${err.message}`, 'error');
    }
  }

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
        <div class="blank-crm-card" data-blank-index="${bIdx}">
          <div class="blank-stage">
            <span class="blank-blueprint-pill">${b.key} • Blueprint ${b.blueprint_id}</span>
            <img class="blank-mockup-img" id="mockup-${bIdx}" src="${initialMockup}" alt="${b.name}" />
          </div>

          <div class="blank-card-details">
            <div class="blank-header-row">
              <h3 class="blank-name-title">${b.name}</h3>
              <span class="blank-provider-subtitle">OPT OnDemand (CZ)</span>
            </div>

            <div class="swatch-group-wrap">
              <div class="swatch-header-label">
                <span>Color Swatches</span>
                <span id="selected-color-name-${bIdx}" style="color:var(--text-primary); font-weight:600;">${firstColor}</span>
              </div>
              <div class="swatch-list-row">
                ${colors.map((cName, cIdx) => `
                  <button 
                    class="color-swatch-circle ${cIdx === 0 ? 'active' : ''}" 
                    style="background-color: ${b.colors[cName]};" 
                    title="${cName}"
                    data-blank-idx="${bIdx}"
                    data-color="${cName}"
                    data-mockup="${(b.mockups && b.mockups[cName]) || ''}"
                  ></button>
                `).join('')}
              </div>
            </div>

            <div class="swatch-group-wrap">
              <span class="swatch-header-label">Available Sizes (${(b.sizes || []).length})</span>
              <div class="size-pill-tags">
                ${(b.sizes || []).map(s => `<span class="size-tag">${s}</span>`).join('')}
              </div>
            </div>

            <div class="blank-card-footer">
              <div>
                <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; font-weight:600;">Wholesale Cost</div>
                <div class="blank-cost-figure">${costRange} USD</div>
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
    document.querySelectorAll('.color-swatch-circle').forEach(btn => {
      btn.addEventListener('click', () => {
        const bIdx = btn.dataset.blankIdx;
        const colorName = btn.dataset.color;
        const mockupUrl = btn.dataset.mockup;

        // Update active class
        const parentCard = btn.closest('.blank-crm-card');
        parentCard.querySelectorAll('.color-swatch-circle').forEach(s => s.classList.remove('active'));
        btn.classList.add('active');

        // Update color label
        const label = document.getElementById(`selected-color-name-${bIdx}`);
        if (label) label.textContent = colorName;

        // Update mockup image
        const img = document.getElementById(`mockup-${bIdx}`);
        if (img && mockupUrl) {
          img.style.opacity = '0.3';
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
      el.buildThemeBtn.textContent = 'Compiling & Uploading…';

      const url = `/api/theme-build?src=${encodeURIComponent(src)}${mode !== 'default' ? `&mode=${mode}` : ''}`;
      const result = await apiFetch(url, { method: 'POST' });

      el.themeBuildResultBox.style.display = 'block';
      el.themeBuildUrl.value = result.url || '';
      el.themeBuildSha.textContent = result.sha || 'N/A';
      el.themeBuildDetails.textContent = JSON.stringify(result, null, 2);

      showToast('Theme file compiled and stored in Blob successfully', 'success');
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

  // Filter search
  function handleSearch(query) {
    const q = query.toLowerCase().trim();
    if (!q) {
      if (state.statusData && state.statusData.runs) renderRunsTable(state.statusData.runs);
      return;
    }

    if (state.statusData && state.statusData.runs) {
      const filtered = state.statusData.runs.filter(r => 
        JSON.stringify(r).toLowerCase().includes(q)
      );
      renderRunsTable(filtered);
    }
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

    // Global Search
    if (el.globalSearchInput) {
      el.globalSearchInput.addEventListener('input', (e) => {
        handleSearch(e.target.value);
      });
    }

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

    // Model catalogue events
    document.getElementById('refreshModelsBtn').addEventListener('click', loadModels);
    document.getElementById('modelForm').addEventListener('submit', uploadModel);
    document.getElementById('modelsContainer').addEventListener('click', (e) => {
      const b = e.target.closest('[data-delete-model]');
      if (b) deleteModel(b.dataset.deleteModel);
      const o = e.target.closest('[data-optimize-model]');
      if (o) optimizeExisting(o.dataset.optimizeModel, o);
    });

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
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (el.globalSearchInput) el.globalSearchInput.focus();
      } else if (e.key === 'Escape') {
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

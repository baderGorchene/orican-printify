/**
 * ORICAN Admin: models catalogue, orders, blanks and theme tools.
 */

(function () {
  'use strict';

  // State
  const state = {
    key: localStorage.getItem('orican_admin_key') || new URLSearchParams(window.location.search).get('key') || '',
    activeTab: 'models',
    blanksData: null,
    statusData: null,
    catalogData: null
  };

  // DOM Elements
  const el = {
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
    setupEvents();
    loadModels(); // public list, no key needed

    if (!state.key) {
      showAuthModal();
    } else {
      verifyKeyAndLoad();
    }
  }

  // Authentication & API Client
  function showAuthModal() {
    el.authModal.classList.add('open');
    el.authKeyInput.value = state.key;
    el.authKeyInput.focus();
  }

  function hideAuthModal() {
    el.authModal.classList.remove('open');
    el.authError.hidden = true;
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
      el.authError.hidden = false;
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

    if (tabId === 'orders' && !state.statusData) {
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

    const env = data.env || {};

    const envEntries = [
      { key: 'PRINTIFY_TOKEN', label: 'Printify Token', ok: !!env.PRINTIFY_TOKEN, desc: 'Bearer token for Printify API v1' },
      { key: 'SHOPIFY_WEBHOOK_SECRET', label: 'Shopify Webhook Secret', ok: !!env.SHOPIFY_WEBHOOK_SECRET, desc: 'HMAC SHA-256 signing secret' },
      { key: 'BLOB_READ_WRITE_TOKEN', label: 'Vercel Blob Storage', ok: !!env.BLOB_READ_WRITE_TOKEN, desc: 'Public storage for customer proofs' },
      { key: 'ALLOWED_ORIGINS', label: 'CORS Origins', ok: !!env.ALLOWED_ORIGINS, desc: env.ALLOWED_ORIGINS || 'CORS origins allowlist' },
      { key: 'AUTO_PRODUCTION', label: 'Auto Production Mode', ok: env.AUTO_PRODUCTION === true, desc: env.AUTO_PRODUCTION ? 'Direct to production' : 'Hold for manual review' }
    ];

    el.envContainer.innerHTML = envEntries.map(e => `
      <div class="env-item">
        <div><b>${e.label}</b><small>${e.desc}</small></div>
        <span><span class="tag ${e.ok ? 'ok' : (e.key === 'AUTO_PRODUCTION' ? 'warn' : 'bad')}">${e.ok ? 'OK' : (e.key === 'AUTO_PRODUCTION' ? 'Off' : 'Missing')}</span></span>
      </div>
    `).join('');

    // Render Webhook Runs Table
    const runs = data.runs || [];
    if (!runs.length) {
      el.runsTableBody.innerHTML = '<tr><td colspan="5" class="empty">No orders yet.</td></tr>';
      return;
    }

    renderRunsTable(runs);
  }

  function renderRunsTable(runs) {
    el.runsTableBody.innerHTML = runs.map((run, idx) => {
      const hasError = !!run.error;
      const skipped = !!run.skipped;
      const statusClass = hasError ? 'tag bad' : skipped ? 'tag warn' : 'tag ok';
      const statusText = hasError ? run.error : skipped ? `Skipped: ${run.skipped}` : 'Sent to Printify';
      const timeStr = run.at ? new Date(run.at).toLocaleString() : 'Recent';

      return `
        <tr>
          <td class="time">${timeStr}</td>
          <td><b>${run.order || '#TEST'}</b></td>
          <td><span class="${statusClass}">${statusText}</span></td>
          <td>${run.items || run.line_items || 0}</td>
          <td><button class="btn btn-sm inspect-run-btn" data-run-index="${idx}">Details</button></td>
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
      el.runTestOrderBtn.textContent = 'Running…';
      const keep = el.keepTestOrderCheck.checked ? '?keep=1' : '';
      const result = await apiFetch(`/api/test-order${keep}`, { method: 'POST' });

      el.testOrderResultBox.hidden = false;
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
      el.runTestOrderBtn.textContent = 'Run test order';
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
      el.cancelTestOrderBtn.textContent = 'Cancel order';
    }
  }

  // --- 3D Model Catalogue ---
  // Every model is optimized here before upload, so the storefront downloads as little as possible:
  // FBX/OBJ become GLB, only the base color texture is kept (it's the only map the customizer uses),
  // textures are capped at 2048 px and stored as JPEG unless they need alpha. The picker never loads 3D:
  // it shows spin.webp, a strip of SPIN_FRAMES pre-rendered angles.
  const MODEL_WARN_BYTES = 10 * 1024 * 1024;
  const MAX_TEXTURE = 2048;
  const SPIN_FRAMES = 12;
  const SPIN_SIZE = 512; // sharp enough for the homepage slider's large cards (~150 KB per model)
  const fmtSize = (b) => `${(b / 1048576).toFixed(1)} MB`;

  async function loadModels() {
    const box = document.getElementById('modelsContainer');
    try {
      const res = await fetch('/api/models?view=all', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      state.modelsData = data.models;
      state.packs = data.packs || [];
      renderPacks();
      renderModelStats();
      box.innerHTML = state.modelsData.length ? state.modelsData.map(m => {
        // The spin strip plays on hover (CSS); models without one show their still thumbnail.
        const preview = m.spin
          ? `<div class="model-preview spin" style="background-image:url('${m.spin}')" role="img" aria-label="${m.name}"></div>`
          : m.thumb
            ? `<div class="model-preview still" style="background-image:url('${m.thumb}')" role="img" aria-label="${m.name}"></div>`
            : '<div class="model-preview none" aria-hidden="true">3D</div>';
        const heavy = m.size > MODEL_WARN_BYTES;
        const when = windowTag(m);
        return `
        <div class="model-card">
          ${preview}
          <div class="model-body">
            <span class="model-name" title="${m.name}">${m.name}</span>
            <div class="model-meta">
              <span>${fmtSize(m.size)}</span>
              ${m.spin ? '' : '<span class="tag warn" title="Shoppers download the full file and see no preview">Not optimized</span>'}
              ${heavy && m.spin ? '<span class="tag bad" title="The mesh itself is heavy: decimating it in Blender helps most">Heavy</span>' : ''}
              ${when ? `<span class="tag ${when.cls}">${when.label}</span>` : ''}
            </div>
            <div class="model-actions">
              ${m.spin
                ? `<button class="btn btn-sm" data-optimize-model="${m.slug}" title="Render the 360° preview again (e.g. at the current, sharper size)">Re-render</button>`
                : `<button class="btn btn-sm btn-primary" data-optimize-model="${m.slug}">Optimize</button>`}
              <button class="btn btn-sm" data-schedule-model="${m.slug}">Schedule</button>
              <button class="btn btn-sm btn-danger" data-delete-model="${m.slug}">Delete</button>
            </div>
          </div>
        </div>`;
      }).join('') : '<p class="empty">No models yet. Upload one above.</p>';
    } catch (err) {
      showToast(`Failed to load models: ${err.message}`, 'error');
    }
  }

  function renderModelStats() {
    const models = state.modelsData || [];
    const now = Date.now();
    const live = (x) => (!x.from || Date.parse(x.from) <= now) && (!x.until || Date.parse(x.until) > now);
    const set = (id, value, sub) => {
      document.getElementById(id).textContent = value;
      document.getElementById(`${id}Sub`).textContent = sub;
    };
    const todo = models.filter(m => !m.spin).length;
    set('statModels', models.length, `${models.filter(live).length} visible now`);
    set('statPacks', state.packs.length, `${state.packs.filter(live).length} live now`);
    set('statOptimize', todo, todo ? 'No 360° preview yet' : 'All optimized');
    set('statSize', fmtSize(models.reduce((n, m) => n + (m.size || 0), 0)), `${models.filter(m => m.size > MODEL_WARN_BYTES).length} over ${MODEL_WARN_BYTES / 1048576} MB`);
    document.getElementById('statOptimize').closest('.tile').classList.toggle('alert', todo > 0);
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
      btn.textContent = m.spin ? 'Re-render' : 'Optimize';
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

  // --- Schedules & packs (saved together as one config by /api/models) ---
  const pad = (n) => String(n).padStart(2, '0');
  // ISO (UTC) <-> <input type="datetime-local"> value in the admin's local time.
  const toLocalInput = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
  const fmtDay = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  // Status of an optional { from, until } window, or null when there are no dates.
  function windowTag(w) {
    const now = Date.now();
    if (w.until && Date.parse(w.until) <= now) return { label: 'Ended', cls: 'bad' };
    if (w.from && Date.parse(w.from) > now) return { label: `Starts ${fmtDay(w.from)}`, cls: 'warn' };
    if (w.until) return { label: `Ends ${fmtDay(w.until)}`, cls: 'ok' };
    if (w.from) return { label: 'Live', cls: 'ok' };
    return null;
  }

  function currentConfig() {
    const models = {};
    (state.modelsData || []).forEach(m => {
      if (m.from || m.until) models[m.slug] = { from: m.from, until: m.until };
    });
    return { models, packs: state.packs || [] };
  }

  async function saveConfig(cfg, okMessage) {
    await apiFetch('/api/models', { method: 'POST', body: { action: 'config', config: cfg } });
    showToast(okMessage, 'success');
    loadModels();
  }

  const openModal = (id) => document.getElementById(id).classList.add('open');
  const closeModals = () => document.querySelectorAll('.modal.open').forEach(m => {
    if (m.id !== 'authModal') m.classList.remove('open');
  });

  // Model schedule dialog
  function openSchedule(slug) {
    const m = state.modelsData.find(x => x.slug === slug);
    if (!m) return;
    state.scheduleSlug = slug;
    document.getElementById('scheduleName').textContent = m.name;
    document.getElementById('scheduleFrom').value = toLocalInput(m.from);
    document.getElementById('scheduleUntil').value = toLocalInput(m.until);
    openModal('scheduleModal');
  }

  async function saveSchedule(from, until) {
    if (!state.key) return showAuthModal();
    const cfg = currentConfig();
    const slug = state.scheduleSlug;
    if (from || until) cfg.models[slug] = { from, until };
    else delete cfg.models[slug];
    try {
      await saveConfig(cfg, from || until ? 'Schedule saved' : 'Model always shown');
      closeModals();
    } catch (err) {
      showToast(`Schedule not saved: ${err.message}`, 'error');
    }
  }

  // Packs
  function previewTile(m) {
    if (m.spin) return `<div class="model-preview spin" style="background-image:url('${m.spin}')"></div>`;
    if (m.thumb) return `<div class="model-preview still" style="background-image:url('${m.thumb}')"></div>`;
    return '<div class="model-preview none">3D</div>';
  }

  function renderPacks() {
    const box = document.getElementById('packsContainer');
    const bySlug = Object.fromEntries((state.modelsData || []).map(m => [m.slug, m]));
    box.innerHTML = state.packs.length ? state.packs.map(p => {
      const members = p.models.map(s => bySlug[s]).filter(Boolean);
      const when = windowTag(p) || { label: 'Always on', cls: 'ok' };
      const dates = [p.from && `from ${fmtDay(p.from)}`, p.until && `until ${fmtDay(p.until)}`].filter(Boolean).join(' ') || 'no dates';
      return `
        <div class="pack-row">
          <div class="pack-thumbs">${members.slice(0, 5).map(previewTile).join('')}</div>
          <div class="pack-main">
            <b>${p.name.replace(/</g, '&lt;')}</b>
            <small>${members.length} model${members.length === 1 ? '' : 's'} · ${dates}</small>
          </div>
          <span class="tag ${when.cls}">${when.label}</span>
          <button class="btn btn-sm" data-edit-pack="${p.id}">Edit</button>
          <button class="btn btn-sm btn-danger" data-delete-pack="${p.id}">Delete</button>
        </div>`;
    }).join('') : '<p class="empty">No packs yet. Create one for an event like Halloween or Christmas.</p>';
  }

  function openPack(id) {
    const p = state.packs.find(x => x.id === id) || { id: null, name: '', from: null, until: null, models: [] };
    state.editPackId = p.id;
    document.getElementById('packModalTitle').textContent = p.id ? `Edit ${p.name}` : 'New pack';
    document.getElementById('packName').value = p.name;
    document.getElementById('packFrom').value = toLocalInput(p.from);
    document.getElementById('packUntil').value = toLocalInput(p.until);
    const chosen = new Set(p.models);
    document.getElementById('packModels').innerHTML = (state.modelsData || []).map(m => `
      <label class="pick">
        <input type="checkbox" value="${m.slug}" ${chosen.has(m.slug) ? 'checked' : ''} />
        ${previewTile(m)}
        <span title="${m.name}">${m.name}</span>
      </label>`).join('') || '<p class="muted">Upload models first.</p>';
    openModal('packModal');
  }

  async function savePack(e) {
    e.preventDefault();
    if (!state.key) return showAuthModal();
    const name = document.getElementById('packName').value.trim();
    const models = [...document.querySelectorAll('#packModels input:checked')].map(i => i.value);
    if (!models.length) return showToast('Pick at least one model', 'error');
    const pack = {
      id: state.editPackId || `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'pack'}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      from: fromLocalInput(document.getElementById('packFrom').value),
      until: fromLocalInput(document.getElementById('packUntil').value),
      models,
    };
    const cfg = currentConfig();
    cfg.packs = state.editPackId ? cfg.packs.map(p => (p.id === pack.id ? pack : p)) : [...cfg.packs, pack];
    const btn = document.getElementById('packSaveBtn');
    btn.disabled = true;
    try {
      await saveConfig(cfg, `Pack "${name}" saved`);
      closeModals();
    } catch (err) {
      showToast(`Pack not saved: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function deletePack(id) {
    const p = state.packs.find(x => x.id === id);
    if (!p || !confirm(`Delete pack "${p.name}"? Its models stay in the catalogue.`)) return;
    const cfg = currentConfig();
    cfg.packs = cfg.packs.filter(x => x.id !== id);
    try {
      await saveConfig(cfg, `Pack "${p.name}" deleted`);
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
    const money = (c) => `$${(c / 100).toFixed(2)}`;
    el.blanksContainer.innerHTML = blanks.length ? blanks.map((b, bIdx) => {
      if (b.missing) {
        return `
        <div class="blank-card">
          <div class="blank-empty">No Printify draft yet</div>
          <div class="blank-body">
            <div class="blank-title"><h3>${b.name}</h3></div>
            <p class="muted">${b.matching_variants} matching variants at this provider. Sync templates to create the draft.</p>
          </div>
        </div>`;
      }
      const variants = b.variants || [];
      const mockups = b.mockups || {};
      // A configured color is only real if Printify enabled variants for it; the rest are shown struck out.
      const sizesOf = (c) => variants.filter(v => v.color === c).map(v => v.size);
      const colors = Object.keys(b.colors || {});
      const first = colors.find(c => mockups[c]) || colors.find(c => sizesOf(c).length) || colors[0] || '';
      const costs = variants.map(v => v.cost_cents).filter(Boolean);
      const cost = costs.length
        ? (Math.min(...costs) === Math.max(...costs) ? money(costs[0]) : `${money(Math.min(...costs))} - ${money(Math.max(...costs))}`)
        : '—';

      return `
        <div class="blank-card" data-blank-idx="${bIdx}">
          <div class="blank-shot">
            <img src="${mockups[first] || '/orican-placeholder.png'}" alt="${b.name}, ${first}" />
            <span class="tag warn blank-nomock" ${mockups[first] ? 'hidden' : ''}>No mockup for this color</span>
          </div>
          <div class="blank-body">
            <div class="blank-title"><h3>${b.name}</h3><small>Blueprint ${b.blueprint_id}</small></div>
            <div class="swatches">
              ${colors.map(c => {
                const off = !sizesOf(c).length;
                return `<button class="swatch${c === first ? ' active' : ''}${off ? ' off' : ''}" style="background-color:${b.colors[c]};" title="${c}${off ? ' (not offered by this provider)' : ''}" aria-label="${c}" data-color="${c}"></button>`;
              }).join('')}
            </div>
            <div class="sizes"><b class="blank-color">${first}</b> · <span class="blank-sizes">${sizesOf(first).join(' ') || 'not offered'}</span></div>
            <div class="blank-foot">
              <span>Cost <b>${cost}</b></span>
              <button class="btn btn-sm view-variants-btn">Variants (${variants.length})</button>
            </div>
          </div>
        </div>`;
    }).join('') : '<p class="empty">No blanks configured.</p>';

    el.blanksContainer.onclick = (e) => {
      const card = e.target.closest('.blank-card[data-blank-idx]');
      if (!card) return;
      const b = blanks[card.dataset.blankIdx];
      if (e.target.closest('.view-variants-btn')) return openJsonModal(`Variant Matrix: ${b.name}`, b.variants || []);
      const sw = e.target.closest('.swatch');
      if (!sw) return;
      const c = sw.dataset.color;
      const src = (b.mockups || {})[c];
      card.querySelectorAll('.swatch').forEach(s => s.classList.toggle('active', s === sw));
      card.querySelector('.blank-color').textContent = c;
      card.querySelector('.blank-sizes').textContent = (b.variants || []).filter(v => v.color === c).map(v => v.size).join(' ') || 'not offered';
      card.querySelector('.blank-nomock').hidden = !!src;
      const img = card.querySelector('img');
      img.alt = `${b.name}, ${c}`;
      img.style.opacity = '0.3';
      img.onload = () => { img.style.opacity = '1'; };
      img.src = src || '/orican-placeholder.png';
    };
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
      el.syncTemplatesBtn.textContent = 'Sync templates in Printify';
    }
  }

  async function browseCatalog() {
    try {
      el.browseCatalogBtn.disabled = true;
      el.browseCatalogBtn.textContent = 'Loading…';
      const data = await apiFetch('/api/catalog');
      state.catalogData = data;
      openJsonModal('Printify EU Provider Catalog', data);
    } catch (err) {
      showToast(`Failed to fetch catalog: ${err.message}`, 'error');
    } finally {
      el.browseCatalogBtn.disabled = false;
      el.browseCatalogBtn.textContent = 'EU providers';
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
      el.buildThemeBtn.textContent = 'Building…';

      const url = `/api/theme-build?src=${encodeURIComponent(src)}${mode !== 'default' ? `&mode=${mode}` : ''}`;
      const result = await apiFetch(url, { method: 'POST' });

      el.themeBuildResultBox.hidden = false;
      el.themeBuildUrl.value = result.url || '';
      el.themeBuildSha.textContent = result.sha || 'N/A';
      el.themeBuildDetails.textContent = JSON.stringify(result, null, 2);

      showToast('Theme file compiled and stored in Blob successfully', 'success');
    } catch (err) {
      showToast(`Theme build failed: ${err.message}`, 'error');
    } finally {
      el.buildThemeBtn.disabled = false;
      el.buildThemeBtn.textContent = 'Build';
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
    toast.textContent = message;
    el.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
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
      const sc = e.target.closest('[data-schedule-model]');
      if (sc) openSchedule(sc.dataset.scheduleModel);
    });

    // Schedules & packs
    document.getElementById('scheduleForm').addEventListener('submit', (e) => {
      e.preventDefault();
      saveSchedule(fromLocalInput(document.getElementById('scheduleFrom').value),
        fromLocalInput(document.getElementById('scheduleUntil').value));
    });
    document.getElementById('scheduleClearBtn').addEventListener('click', () => saveSchedule(null, null));
    document.getElementById('newPackBtn').addEventListener('click', () => openPack(null));
    document.getElementById('packForm').addEventListener('submit', savePack);
    document.getElementById('packsContainer').addEventListener('click', (e) => {
      const ed = e.target.closest('[data-edit-pack]');
      if (ed) openPack(ed.dataset.editPack);
      const del = e.target.closest('[data-delete-pack]');
      if (del) deletePack(del.dataset.deletePack);
    });
    document.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', closeModals));

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
        closeModals();
      } else if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        if (e.key === '1') switchTab('models');
        if (e.key === '2') switchTab('orders');
        if (e.key === '3') switchTab('blanks');
        if (e.key === '4') switchTab('theme');
        if (e.key.toLowerCase() === 'l') showAuthModal();
        if (e.key.toLowerCase() === 'r') {
          if (state.activeTab === 'models') loadModels();
          if (state.activeTab === 'orders') loadStatus(false);
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

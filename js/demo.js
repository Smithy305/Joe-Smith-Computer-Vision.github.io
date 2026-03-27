(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────
  const MAX_DIM      = 560;   // max px for internal canvas
  const DEBOUNCE_MS  = 160;
  const TOP_N        = 3;

  // ── State ──────────────────────────────────────────────────────────────────
  let net            = null;
  let sourceCanvas   = null;   // resized copy of the uploaded image
  let originalPreds  = null;   // cached top-N for the unmodified image
  let debounceTimer  = null;
  let processing     = false;

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const uploadArea    = document.getElementById('upload-area');
  const modelStatus   = document.getElementById('model-status');
  const splitView     = document.getElementById('demo-split');
  const controlsEl    = document.getElementById('demo-controls');
  const origCanvas    = document.getElementById('original-canvas');
  const degCanvas     = document.getElementById('degraded-canvas');
  const origPredsEl   = document.getElementById('original-predictions');
  const degPredsEl    = document.getElementById('degraded-predictions');
  const deltaEl       = document.getElementById('confidence-delta');
  const processingEl  = document.getElementById('processing-overlay');
  const resetBtn      = document.getElementById('reset-btn');

  const sliders = {
    blur:       document.getElementById('ctrl-blur'),
    noise:      document.getElementById('ctrl-noise'),
    jpeg:       document.getElementById('ctrl-jpeg'),
    brightness: document.getElementById('ctrl-brightness'),
    contrast:   document.getElementById('ctrl-contrast'),
  };

  const valueEls = {
    blur:       document.getElementById('val-blur'),
    noise:      document.getElementById('val-noise'),
    jpeg:       document.getElementById('val-jpeg'),
    brightness: document.getElementById('val-brightness'),
    contrast:   document.getElementById('val-contrast'),
  };

  // ── Model init ─────────────────────────────────────────────────────────────
  async function init() {
    try {
      net = await mobilenet.load({ version: 2, alpha: 1.0 });
      activateUploadArea();
    } catch (err) {
      modelStatus.textContent = 'Failed to load model — please refresh the page.';
    }
  }

  function activateUploadArea() {
    uploadArea.classList.remove('disabled');
    uploadArea.innerHTML = `
      <div class="upload-icon">&#128247;</div>
      <p><strong>Drag &amp; drop an image here</strong><br>or click to browse</p>
      <p style="font-size:0.78rem;opacity:0.65;margin-top:0.4rem">JPG &middot; PNG &middot; WebP &middot; BMP</p>
      <input type="file" id="file-input" accept="image/*" style="display:none" aria-hidden="true">
    `;

    const fileInput = document.getElementById('file-input');
    fileInput.addEventListener('change', e => {
      if (e.target.files[0]) handleFile(e.target.files[0]);
    });

    uploadArea.addEventListener('click',    () => fileInput.click());
    uploadArea.addEventListener('keydown',  e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
    uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
    uploadArea.addEventListener('dragleave',    () => uploadArea.classList.remove('drag-over'));
    uploadArea.addEventListener('drop', e => {
      e.preventDefault();
      uploadArea.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) handleFile(file);
    });
  }

  // ── Image upload ───────────────────────────────────────────────────────────
  async function handleFile(file) {
    const img = await fileToImage(file);
    sourceCanvas = fitToCanvas(img, MAX_DIM);

    // Draw to both display canvases
    [origCanvas, degCanvas].forEach(c => {
      c.width  = sourceCanvas.width;
      c.height = sourceCanvas.height;
    });
    origCanvas.getContext('2d').drawImage(sourceCanvas, 0, 0);
    degCanvas.getContext('2d').drawImage(sourceCanvas, 0, 0);

    // Show UI
    uploadArea.style.display = 'none';
    splitView.style.display  = 'grid';
    controlsEl.style.display = 'block';

    // Run inference on original
    origPredsEl.innerHTML = '<p class="pred-placeholder">Running inference&hellip;</p>';
    originalPreds = await net.classify(origCanvas, TOP_N);
    renderPredictions(origPredsEl, originalPreds);

    // Run degraded pipeline (all sliders at zero → mirrors original on first run)
    await runPipeline();
  }

  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image.')); };
      img.src = url;
    });
  }

  function fitToCanvas(img, maxDim) {
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (w > maxDim || h > maxDim) {
      if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
      else         { w = Math.round(w * maxDim / h); h = maxDim; }
    }
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c;
  }

  // ── Degradation pipeline ───────────────────────────────────────────────────
  function readParams() {
    return {
      blur:       parseFloat(sliders.blur.value),
      noise:      parseFloat(sliders.noise.value),
      jpeg:       parseInt(sliders.jpeg.value, 10),
      brightness: parseInt(sliders.brightness.value, 10),
      contrast:   parseInt(sliders.contrast.value, 10),
    };
  }

  async function applyDegradations(src, { blur, noise, jpeg, brightness, contrast }) {
    const c   = document.createElement('canvas');
    c.width   = src.width;
    c.height  = src.height;
    const ctx = c.getContext('2d');

    // CSS-filter degradations applied during the draw call
    const filters = [];
    if (blur > 0)           filters.push(`blur(${blur}px)`);
    if (brightness !== 100) filters.push(`brightness(${brightness}%)`);
    if (contrast   !== 100) filters.push(`contrast(${contrast}%)`);
    ctx.filter = filters.length ? filters.join(' ') : 'none';
    ctx.drawImage(src, 0, 0);
    ctx.filter = 'none';

    // Gaussian noise via raw ImageData
    if (noise > 0) {
      const id = ctx.getImageData(0, 0, c.width, c.height);
      const d  = id.data;
      for (let i = 0; i < d.length; i += 4) {
        // Box-Muller for approximately Gaussian noise
        const u1 = Math.random() || 1e-10;
        const u2 = Math.random();
        const n  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * noise;
        d[i]   = clamp(d[i]   + n, 0, 255);
        d[i+1] = clamp(d[i+1] + n, 0, 255);
        d[i+2] = clamp(d[i+2] + n, 0, 255);
      }
      ctx.putImageData(id, 0, 0);
    }

    // JPEG compression: encode and decode to create blocking artefacts
    if (jpeg < 100) {
      return new Promise(resolve => {
        const dataURL = c.toDataURL('image/jpeg', jpeg / 100);
        const img = new Image();
        img.onload = () => {
          const c2 = document.createElement('canvas');
          c2.width = src.width; c2.height = src.height;
          c2.getContext('2d').drawImage(img, 0, 0);
          resolve(c2);
        };
        img.src = dataURL;
      });
    }

    return c;
  }

  async function runPipeline() {
    if (!sourceCanvas || processing) return;
    processing = true;
    processingEl.style.display = 'flex';

    try {
      const params  = readParams();
      const degraded = await applyDegradations(sourceCanvas, params);

      // Display
      const ctx = degCanvas.getContext('2d');
      ctx.clearRect(0, 0, degCanvas.width, degCanvas.height);
      ctx.drawImage(degraded, 0, 0);

      // Inference
      const preds = await net.classify(degraded, TOP_N);
      renderPredictions(degPredsEl, preds);
      renderDelta(originalPreds, preds);
    } finally {
      processingEl.style.display = 'none';
      processing = false;
    }
  }

  function schedulePipeline() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runPipeline, DEBOUNCE_MS);
  }

  // ── Predictions rendering ──────────────────────────────────────────────────
  // ImageNet labels are often "tench, Tinca tinca" — take the first synonym only
  function shortLabel(label) {
    return label.split(',')[0].trim();
  }

  function renderPredictions(container, preds) {
    container.innerHTML = preds.map(p => {
      const pct = (p.probability * 100).toFixed(1);
      return `<div class="prediction-item">
        <div class="prediction-label">
          <span class="prediction-class">${shortLabel(p.className)}</span>
          <span class="prediction-prob">${pct}%</span>
        </div>
        <div class="prediction-bar-track">
          <div class="prediction-bar-fill" style="width:${pct}%"></div>
        </div>
      </div>`;
    }).join('');
  }

  function renderDelta(origPreds, degPreds) {
    if (!origPreds || !degPreds || !origPreds.length || !degPreds.length) {
      deltaEl.style.display = 'none';
      return;
    }
    deltaEl.style.display = 'block';

    const origTop   = origPreds[0];
    const degTop    = degPreds[0];
    const origClass = shortLabel(origTop.className);
    const degClass  = shortLabel(degTop.className);

    if (origClass !== degClass) {
      deltaEl.className   = 'confidence-delta negative';
      deltaEl.textContent = `Top class changed: "${origClass}" → "${degClass}"`;
    } else {
      const delta = (degTop.probability - origTop.probability) * 100;
      const sign  = delta >= 0 ? '+' : '';
      if      (delta < -5)  deltaEl.className = 'confidence-delta negative';
      else if (delta >  2)  deltaEl.className = 'confidence-delta positive';
      else                  deltaEl.className = 'confidence-delta neutral';
      deltaEl.textContent = `Top-1 confidence: ${sign}${delta.toFixed(1)}% vs original`;
    }
  }

  // ── Controls ───────────────────────────────────────────────────────────────
  const sliderFormat = {
    blur:       v => `${parseFloat(v)} px`,
    noise:      v => `${parseInt(v, 10)}`,
    jpeg:       v => `${parseInt(v, 10)}%`,
    brightness: v => `${parseInt(v, 10)}%`,
    contrast:   v => `${parseInt(v, 10)}%`,
  };

  Object.entries(sliders).forEach(([key, el]) => {
    el.addEventListener('input', () => {
      valueEls[key].textContent = sliderFormat[key](el.value);
      schedulePipeline();
    });
  });

  resetBtn.addEventListener('click', () => {
    sliders.blur.value       = 0;
    sliders.noise.value      = 0;
    sliders.jpeg.value       = 100;
    sliders.brightness.value = 100;
    sliders.contrast.value   = 100;
    valueEls.blur.textContent       = '0 px';
    valueEls.noise.textContent      = '0';
    valueEls.jpeg.textContent       = '100%';
    valueEls.brightness.textContent = '100%';
    valueEls.contrast.textContent   = '100%';
    schedulePipeline();
  });

  // ── Utils ──────────────────────────────────────────────────────────────────
  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  // ── Boot ───────────────────────────────────────────────────────────────────
  init();
})();

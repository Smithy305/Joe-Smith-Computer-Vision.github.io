(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────
  const MAX_DIM     = 560;
  const DEBOUNCE_MS = 250;
  const TOP_N       = 3;

  // ── State ──────────────────────────────────────────────────────────────────
  let net           = null;
  let sourceCanvas  = null;
  let originalPreds = null;
  let originalML    = null;
  let debounceTimer = null;
  let processing    = false;

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const uploadArea   = document.getElementById('upload-area');
  const modelStatus  = document.getElementById('model-status');
  const splitView    = document.getElementById('demo-split');
  const controlsEl   = document.getElementById('demo-controls');
  const origCanvas   = document.getElementById('original-canvas');
  const degCanvas    = document.getElementById('degraded-canvas');
  const origPredsEl  = document.getElementById('original-predictions');
  const degPredsEl   = document.getElementById('degraded-predictions');
  const deltaEl      = document.getElementById('confidence-delta');
  const processingEl = document.getElementById('processing-overlay');
  const resetBtn     = document.getElementById('reset-btn');
  const origMLEl     = document.getElementById('original-ml');
  const degMLEl      = document.getElementById('degraded-ml');

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
    fileInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });
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

    [origCanvas, degCanvas].forEach(c => {
      c.width  = sourceCanvas.width;
      c.height = sourceCanvas.height;
    });
    origCanvas.getContext('2d').drawImage(sourceCanvas, 0, 0);
    degCanvas.getContext('2d').drawImage(sourceCanvas, 0, 0);

    uploadArea.style.display = 'none';
    splitView.style.display  = 'grid';
    controlsEl.style.display = 'block';

    origPredsEl.innerHTML = '<p class="pred-placeholder">Running inference&hellip;</p>';
    originalPreds = await net.classify(origCanvas, TOP_N);
    renderPredictions(origPredsEl, originalPreds);

    // ML score for original
    const origID = origCanvas.getContext('2d').getImageData(0, 0, origCanvas.width, origCanvas.height);
    originalML = modifiedLaplacian(origID, origCanvas.width, origCanvas.height);
    renderML(origMLEl, originalML, null);

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
    let w = img.naturalWidth, h = img.naturalHeight;
    if (w > maxDim || h > maxDim) {
      if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
      else        { w = Math.round(w * maxDim / h); h = maxDim; }
    }
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c;
  }

  // ── Image processing (pure ImageData — no ctx.filter) ─────────────────────

  // Separable Gaussian blur, modifies data in-place.
  function gaussianBlur(data, width, height, sigma) {
    if (sigma <= 0) return;
    const radius = Math.min(Math.ceil(3 * sigma), 40);
    const size   = 2 * radius + 1;
    const kernel = new Float32Array(size);
    let ksum = 0;
    for (let i = 0; i < size; i++) {
      const x = i - radius;
      kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
      ksum += kernel[i];
    }
    for (let i = 0; i < size; i++) kernel[i] /= ksum;

    const tmp = new Float32Array(width * height * 4);

    // Horizontal pass: data → tmp
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0;
        for (let k = 0; k < size; k++) {
          const sx = clamp(x + k - radius, 0, width - 1);
          const si = (y * width + sx) * 4;
          const w  = kernel[k];
          r += data[si]   * w;
          g += data[si+1] * w;
          b += data[si+2] * w;
        }
        const oi = (y * width + x) * 4;
        tmp[oi] = r; tmp[oi+1] = g; tmp[oi+2] = b; tmp[oi+3] = data[oi+3];
      }
    }

    // Vertical pass: tmp → data
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0;
        for (let k = 0; k < size; k++) {
          const sy = clamp(y + k - radius, 0, height - 1);
          const si = (sy * width + x) * 4;
          const w  = kernel[k];
          r += tmp[si]   * w;
          g += tmp[si+1] * w;
          b += tmp[si+2] * w;
        }
        const oi = (y * width + x) * 4;
        data[oi]   = r;
        data[oi+1] = g;
        data[oi+2] = b;
      }
    }
  }

  // Brightness and contrast, modifies data in-place.
  // CSS semantics: brightness(100%) = no change, contrast(100%) = no change.
  function applyBrightnessContrast(data, brightness, contrast) {
    if (brightness === 100 && contrast === 100) return;
    const bf = brightness / 100;
    const cf = contrast   / 100;
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        let v = data[i + c] * bf;          // brightness: scale
        v = (v - 127.5) * cf + 127.5;     // contrast: pivot around mid-grey
        data[i + c] = clamp(v + 0.5 | 0, 0, 255);
      }
    }
  }

  // Gaussian noise (Box-Muller), modifies data in-place.
  function applyNoise(data, sigma) {
    if (sigma <= 0) return;
    for (let i = 0; i < data.length; i += 4) {
      const u1 = Math.random() || 1e-10;
      const u2 = Math.random();
      const n  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sigma;
      data[i]   = clamp(data[i]   + n | 0, 0, 255);
      data[i+1] = clamp(data[i+1] + n | 0, 0, 255);
      data[i+2] = clamp(data[i+2] + n | 0, 0, 255);
    }
  }

  // JPEG encode/decode round-trip (async).
  function jpegRoundTrip(canvas, quality) {
    return new Promise(resolve => {
      const dataURL = canvas.toDataURL('image/jpeg', quality / 100);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = canvas.width; c.height = canvas.height;
        c.getContext('2d').drawImage(img, 0, 0);
        resolve(c);
      };
      img.src = dataURL;
    });
  }

  // Modified Laplacian sharpness score (higher = sharper).
  // ML(x,y) = |2I - I_left - I_right| + |2I - I_top - I_bottom|
  function modifiedLaplacian(imageData, width, height) {
    const d = imageData.data;
    let sum = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const ic = (y       * width + x    ) * 4;
        const il = (y       * width + x - 1) * 4;
        const ir = (y       * width + x + 1) * 4;
        const it = ((y - 1) * width + x    ) * 4;
        const ib = ((y + 1) * width + x    ) * 4;
        const gc = 0.299*d[ic] + 0.587*d[ic+1] + 0.114*d[ic+2];
        const gl = 0.299*d[il] + 0.587*d[il+1] + 0.114*d[il+2];
        const gr = 0.299*d[ir] + 0.587*d[ir+1] + 0.114*d[ir+2];
        const gt = 0.299*d[it] + 0.587*d[it+1] + 0.114*d[it+2];
        const gb = 0.299*d[ib] + 0.587*d[ib+1] + 0.114*d[ib+2];
        sum += Math.abs(2*gc - gl - gr) + Math.abs(2*gc - gt - gb);
      }
    }
    return sum / ((width - 2) * (height - 2));
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
    // Draw source onto a working canvas
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0);

    // All pixel-level ops in a single ImageData pass (order matters)
    const id = ctx.getImageData(0, 0, c.width, c.height);
    gaussianBlur(id.data, c.width, c.height, blur);
    applyBrightnessContrast(id.data, brightness, contrast);
    applyNoise(id.data, noise);
    ctx.putImageData(id, 0, 0);

    // JPEG round-trip last (async — creates blocking artefacts)
    return jpeg < 100 ? jpegRoundTrip(c, jpeg) : c;
  }

  async function runPipeline() {
    if (!sourceCanvas || processing) return;
    processing = true;
    processingEl.style.display = 'flex';

    try {
      const params   = readParams();
      const degraded = await applyDegradations(sourceCanvas, params);

      // Display degraded image
      const ctx = degCanvas.getContext('2d');
      ctx.clearRect(0, 0, degCanvas.width, degCanvas.height);
      ctx.drawImage(degraded, 0, 0);

      // ML score
      const degID = degraded.getContext('2d').getImageData(0, 0, degraded.width, degraded.height);
      const degML = modifiedLaplacian(degID, degraded.width, degraded.height);
      renderML(degMLEl, degML, originalML);

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

  // ── Rendering ──────────────────────────────────────────────────────────────
  function shortLabel(label) { return label.split(',')[0].trim(); }

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
      deltaEl.style.display = 'none'; return;
    }
    deltaEl.style.display = 'block';
    const origClass = shortLabel(origPreds[0].className);
    const degClass  = shortLabel(degPreds[0].className);
    if (origClass !== degClass) {
      deltaEl.className   = 'confidence-delta negative';
      deltaEl.textContent = `Top class changed: "${origClass}" \u2192 "${degClass}"`;
    } else {
      const delta = (degPreds[0].probability - origPreds[0].probability) * 100;
      const sign  = delta >= 0 ? '+' : '';
      deltaEl.className   = delta < -5 ? 'confidence-delta negative' : delta > 2 ? 'confidence-delta positive' : 'confidence-delta neutral';
      deltaEl.textContent = `Top-1 confidence: ${sign}${delta.toFixed(1)}% vs original`;
    }
  }

  function renderML(el, score, reference) {
    if (!el) return;
    el.style.display = 'block';
    if (reference === null) {
      el.innerHTML = `<strong>Modified Laplacian:</strong> ${score.toFixed(2)} <span class="ml-hint">(sharpness — higher is better)</span>`;
    } else {
      const delta   = score - reference;
      const pct     = ((delta / reference) * 100).toFixed(1);
      const sign    = delta >= 0 ? '+' : '';
      const cls     = delta < -0.5 ? 'negative' : delta > 0.5 ? 'positive' : 'neutral';
      el.innerHTML  = `<strong>Modified Laplacian:</strong> ${score.toFixed(2)} <span class="ml-delta ${cls}">${sign}${pct}%</span>`;
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
    sliders.blur.value       = 0;  valueEls.blur.textContent       = '0 px';
    sliders.noise.value      = 0;  valueEls.noise.textContent      = '0';
    sliders.jpeg.value       = 100; valueEls.jpeg.textContent      = '100%';
    sliders.brightness.value = 100; valueEls.brightness.textContent = '100%';
    sliders.contrast.value   = 100; valueEls.contrast.textContent   = '100%';
    schedulePipeline();
  });

  // ── Utils ──────────────────────────────────────────────────────────────────
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // ── Boot ───────────────────────────────────────────────────────────────────
  init();
})();

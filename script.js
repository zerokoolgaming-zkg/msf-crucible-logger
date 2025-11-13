/* MSF Crucible Screenshot Uploader
 * Front-end logic:
 *  - Loads portrait PNGs from /portraits and builds tiny grayscale fingerprints for each.
 *  - Lets user upload a screenshot and shows it on a canvas.
 *  - Uses Tesseract.js OCR to extract text (stage, powers, VP, season).
 *  - Crops out fixed portrait slots and matches them to the known portraits.
 *  - Computes Punchup / Punchdown, TCP diff and %.
 *  - Sends a row (A–T) plus the raw image to Google Apps Script.
 */

const inputEl = document.getElementById('screenshotInput');
const processBtn = document.getElementById('processBtn');
const statusBar = document.getElementById('statusBar');
const canvas = document.getElementById('previewCanvas');
const ctx = canvas.getContext('2d');

const seasonInput = document.getElementById('seasonInput');
const stageNameInput = document.getElementById('stageNameInput');
const roomInput = document.getElementById('roomInput');
const vpInput = document.getElementById('vpInput');
const attackPowerInput = document.getElementById('attackPowerInput');
const defensePowerInput = document.getElementById('defensePowerInput');

const defenseList = document.getElementById('defenseList');
const attackList = document.getElementById('attackList');

const punchLabelEl = document.getElementById('punchLabel');
const tcpDiffEl = document.getElementById('tcpDiff');
const tcpPercentEl = document.getElementById('tcpPercent');

const sendBtn = document.getElementById('sendToSheetBtn');
const sendStatusEl = document.getElementById('sendStatus');

let uploadedImage = null;          // HTMLImageElement for the screenshot
let uploadedImageDataURL = null;   // base64 for sending to Apps Script

// Portrait fingerprints: { name, url, fp }
let portraitLibrary = [];

// --- Helpers --------------------------------------------------------

function showStatus(msg, isError = false) {
  statusBar.textContent = msg;
  statusBar.classList.remove('hidden');
  statusBar.style.borderColor = isError ? 'rgba(239,68,68,0.7)' : 'rgba(56,189,248,0.7)';
}

function clearStatus() {
  statusBar.textContent = '';
  statusBar.classList.add('hidden');
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// Downscale an image to a tiny grayscale fingerprint (e.g. 16x16 = 256 floats)
function buildFingerprint(img, size = 16) {
  const tmp = document.createElement('canvas');
  tmp.width = size;
  tmp.height = size;
  const tctx = tmp.getContext('2d');
  tctx.drawImage(img, 0, 0, size, size);
  const data = tctx.getImageData(0, 0, size, size).data;
  const fp = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    fp[i] = (r + g + b) / 3 / 255;
  }
  return fp;
}

// Euclidean distance between two fingerprints
function fpDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum / a.length);
}

function loadPortraitLibrary() {
  const { PORTRAITS } = CONFIG;
  if (!PORTRAITS || !PORTRAITS.length) return Promise.resolve();

  return Promise.all(
    PORTRAITS.map(p =>
      new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const fp = buildFingerprint(img);
          portraitLibrary.push({ name: p.name, url: p.url, fp });
          resolve();
        };
        img.onerror = () => {
          console.warn('Failed to load portrait', p);
          resolve();
        };
        img.src = p.url;
      })
    )
  );
}

// Crop a region from the screenshot into an Image object
function cropRegionToImage(rel) {
  if (!uploadedImage) return null;
  const { width, height } = canvas;
  const x = clamp(Math.round(rel.x * width), 0, width);
  const y = clamp(Math.round(rel.y * height), 0, height);
  const w = clamp(Math.round(rel.w * width), 1, width - x);
  const h = clamp(Math.round(rel.h * height), 1, height - y);

  const tmp = document.createElement('canvas');
  tmp.width = w;
  tmp.height = h;
  const tctx = tmp.getContext('2d');
  tctx.drawImage(canvas, x, y, w, h, 0, 0, w, h);

  const img = new Image();
  img.src = tmp.toDataURL('image/png');
  return img;
}

// Given a cropped portrait image, find best matching character
function matchPortrait(img) {
  if (!portraitLibrary.length || !img) {
    return { name: '' };
  }
  const fp = buildFingerprint(img);
  let best = null;
  let bestDist = Infinity;
  for (const p of portraitLibrary) {
    const d = fpDistance(fp, p.fp);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  // Threshold to avoid random garbage being "matched"
  if (bestDist > 0.12) {
    return { name: '' }; // unknown
  }
  return { name: best.name, dist: bestDist };
}

// Update the editable character lists in the UI
function renderCharacterLists(defenseNames, attackNames) {
  defenseList.innerHTML = '';
  attackList.innerHTML = '';

  for (let i = 0; i < 5; i++) {
    const li = document.createElement('li');
    const input = document.createElement('input');
    input.className = 'char-input';
    input.value = defenseNames[i] || '';
    input.dataset.slot = 'defense-' + i;
    li.appendChild(input);
    defenseList.appendChild(li);
  }

  for (let i = 0; i < 5; i++) {
    const li = document.createElement('li');
    const input = document.createElement('input');
    input.className = 'char-input';
    input.value = attackNames[i] || '';
    input.dataset.slot = 'attack-' + i;
    li.appendChild(input);
    attackList.appendChild(li);
  }
}

// Recalculate punchup / diff / percent fields
function updateComputedFields() {
  const n = Number(attackPowerInput.value || 0);
  const o = Number(defensePowerInput.value || 0);
  if (!n && !o) {
    punchLabelEl.value = '';
    tcpDiffEl.value = '';
    tcpPercentEl.value = '';
    return;
  }
  const diff = n - o;
  const label = o > n ? 'Punchup' : 'Punchdown';
  const pct = o ? (diff / o) * 100 : 0;

  punchLabelEl.value = label;
  tcpDiffEl.value = diff.toLocaleString('en-US', { maximumFractionDigits: 0 });
  tcpPercentEl.value = pct.toFixed(2) + '%';
}

// Read values from editable char lists back into arrays
function getCurrentCharacterNames() {
  const defense = [];
  const attack = [];
  defenseList.querySelectorAll('input').forEach(i => defense.push(i.value.trim()));
  attackList.querySelectorAll('input').forEach(i => attack.push(i.value.trim()));
  return { defense, attack };
}

// --- OCR + parsing --------------------------------------------------

async function runOcr() {
  showStatus('Running OCR on screenshot (Tesseract.js)… this stays local in your browser.');

  const worker = await Tesseract.createWorker();
  try {
    const ret = await worker.recognize(canvas);
    await worker.terminate();
    const text = ret.data.text || '';
    // console.log(text);

    // Season
    let season = CONFIG.DEFAULT_SEASON;
    const seasonMatch = text.match(/Season\s+([0-9IVX]+)/i);
    if (seasonMatch) {
      season = 'Season ' + seasonMatch[1];
    }

    // Stage name
    let stageName = '';
    const stageMatch = text.match(/Stage\s*([0-9]+[^\n]*)/i);
    if (stageMatch) {
      stageName = ('Stage ' + stageMatch[1]).trim();
    }

    // Powers ("Power: 6,774,909")
    const powerMatches = text.match(/Power[:\s]+([0-9,]+)/gi) || [];
    let attackPower = 0;
    let defensePower = 0;
    if (powerMatches.length >= 2) {
      const p1 = powerMatches[0].match(/([0-9,]+)/);
      const p2 = powerMatches[1].match(/([0-9,]+)/);
      if (p1) attackPower = Number(p1[1].replace(/,/g, ''));
      if (p2) defensePower = Number(p2[1].replace(/,/g, ''));
    }

    // Victory points ("My Total Victory Points: 8,366VP")
    let vp = 0;
    const vpMatch = text.match(/Total Victory Points[:\s]+([0-9,]+)/i);
    if (vpMatch) {
      vp = Number(vpMatch[1].replace(/,/g, ''));
    }

    // Room: if stageName starts with "Stage 3" -> 3
    let room = '';
    const roomMatch = stageName.match(/Stage\s*(\d+)/i);
    if (roomMatch) {
      room = Number(roomMatch[1]);
    }

    // Populate fields (user can adjust)
    seasonInput.value = season;
    stageNameInput.value = stageName;
    roomInput.value = room || '';
    attackPowerInput.value = attackPower || '';
    defensePowerInput.value = defensePower || '';
    vpInput.value = vp || '';

    updateComputedFields();
    showStatus('OCR complete. Now matching character portraits…');
  } catch (err) {
    console.error(err);
    showStatus('OCR failed: ' + err.message, true);
  }
}

// --- portrait matching pipeline ------------------------------------

function runPortraitMatching() {
  const { IMAGE_SLOTS } = CONFIG;
  const attackNames = [];
  const defenseNames = [];

  if (!IMAGE_SLOTS) return { attackNames, defenseNames };

  (IMAGE_SLOTS.attack || []).forEach(slot => {
    const img = cropRegionToImage(slot);
    const m = matchPortrait(img);
    attackNames.push(m.name || '');
  });

  (IMAGE_SLOTS.defense || []).forEach(slot => {
    const img = cropRegionToImage(slot);
    const m = matchPortrait(img);
    defenseNames.push(m.name || '');
  });

  renderCharacterLists(defenseNames, attackNames);
  showStatus('Portrait matching complete. Review names, then send to sheet.');
}

// --- Google Sheets integration -------------------------------------

async function sendRowToGoogleSheet() {
  const googleUrl = CONFIG.GOOGLE_SCRIPT_URL;
  if (!googleUrl || googleUrl.includes('YOUR_SCRIPT_ID_HERE')) {
    sendStatusEl.textContent = 'ERROR: Please set GOOGLE_SCRIPT_URL in config.js first.';
    sendStatusEl.className = 'send-status err';
    return;
  }

  const { defense, attack } = getCurrentCharacterNames();
  // Pad / trim to exactly 5 each
  const defense5 = [...defense, '', '', '', '', ''].slice(0, 5);
  const attack5 = [...attack, '', '', '', '', ''].slice(0, 5);

  const season = seasonInput.value.trim();
  const stageName = stageNameInput.value.trim();
  const room = Number(roomInput.value || 0);
  const attackPower = Number(attackPowerInput.value || 0);
  const defensePower = Number(defensePowerInput.value || 0);
  const vp = Number(vpInput.value || 0);

  const diff = attackPower - defensePower;
  const label = defensePower > attackPower ? 'Punchup' : 'Punchdown';
  const tcpPct = defensePower ? (diff / defensePower) * 100 : 0;

  // Columns:
  // A–E: defense5
  // F–J: attack5
  // K: season
  // L: room #
  // M: punchup/down
  // N: attack power
  // O: defense power
  // P: diff
  // Q: victory points
  // R: blank
  // S: tcp percentage diff
  // T: drive link (set by Apps Script after it saves the file)
  const row = [
    ...defense5,
    ...attack5,
    season,
    room,
    label,
    attackPower,
    defensePower,
    diff,
    vp,
    '',                 // R
    tcpPct,             // S (raw number; format as % in sheet)
    ''                  // T (placeholder, Apps Script will overwrite with file URL)
  ];

  sendStatusEl.textContent = 'Sending row to Google Sheet…';
  sendStatusEl.className = 'send-status';

  try {
    const payload = {
      action: 'appendRow',
      row,
      imageDataURL: uploadedImageDataURL
    };

    const res = await fetch(googleUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    let data = {};
    try {
      data = JSON.parse(text);
    } catch (e) {
      // ignore, maybe not JSON if CORS misconfigured
    }

    if (res.ok) {
      const link = data.imageUrl || '';
      if (link) {
        sendStatusEl.innerHTML = 'Row added to sheet. Drive link: <a href="' + link + '" target="_blank">open screenshot</a>';
      } else {
        sendStatusEl.textContent = 'Row added to sheet (no link returned).';
      }
      sendStatusEl.className = 'send-status ok';
    } else {
      sendStatusEl.textContent = 'Error from Apps Script: ' + (data.error || res.status);
      sendStatusEl.className = 'send-status err';
    }
  } catch (err) {
    console.error(err);
    sendStatusEl.textContent = 'Network / script error: ' + err.message;
    sendStatusEl.className = 'send-status err';
  }
}

// --- event wiring ---------------------------------------------------

inputEl.addEventListener('change', () => {
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    uploadedImageDataURL = e.target.result;
    const img = new Image();
    img.onload = () => {
      uploadedImage = img;
      // Resize canvas to keep aspect ratio but limit width
      const maxW = 920;
      const scale = Math.min(1, maxW / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      processBtn.disabled = false;
      sendBtn.disabled = true;
      clearStatus();
      showStatus('Screenshot loaded. Click "Process Screenshot" to run OCR + portrait matching.');
    };
    img.src = uploadedImageDataURL;
  };
  reader.readAsDataURL(file);
});

processBtn.addEventListener('click', async () => {
  if (!uploadedImage) return;
  processBtn.disabled = true;
  sendBtn.disabled = true;
  showStatus('Processing screenshot…');
  await runOcr();
  runPortraitMatching();
  processBtn.disabled = false;
  sendBtn.disabled = false;
});

[attackPowerInput, defensePowerInput].forEach(el => {
  el.addEventListener('input', updateComputedFields);
});

sendBtn.addEventListener('click', () => {
  sendRowToGoogleSheet();
});

// Init
window.addEventListener('DOMContentLoaded', async () => {
  showStatus('Loading portrait library…');
  await loadPortraitLibrary();
  clearStatus();
  showStatus('Ready. Choose a screenshot to begin.');
  seasonInput.value = CONFIG.DEFAULT_SEASON || '';
});

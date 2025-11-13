// ZKG Counter Upload – client
const CONFIG = {
  backendUrl: "PUT_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE",
  sheetId: "1Mq88NZUs6rIsbQFGmR_4koqxZofYeFS063-S81GtShk",
  sheetTab: "Counters",
  tryPortraitMatch: true,
  portraitsHashUrl: "portraits_hash.json" // optional
};

const $ = sel => document.querySelector(sel);
const statusEl = $("#status");
const fileInput = $("#fileInput");
const btn = $("#uploadBtn");
const preview = $("#preview");

btn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async (e) => {
  const files = [...e.target.files];
  if (!files.length) return;
  setStatus("Uploading", true);
  btn.disabled = true;
  try {
    const hashDb = await maybeLoadPortraitHash();
    for (const f of files) {
      await processOne(f, hashDb);
    }
    setStatus("Completed ✓");
    setTimeout(()=>location.reload(), 5000);
  } catch (err) {
    console.error(err);
    setStatus("Error – check console");
    btn.disabled = false;
  }
});

function setStatus(text, glow=false){
  statusEl.textContent = text;
  statusEl.classList.toggle("glow", !!glow);
  statusEl.classList.toggle("glowmsg", !!glow);
}

async function maybeLoadPortraitHash(){
  if (!CONFIG.tryPortraitMatch) return null;
  try{
    const r = await fetch(CONFIG.portraitsHashUrl, {cache:"no-store"});
    if (!r.ok) return null;
    return await r.json();
  }catch{ return null; }
}

async function processOne(file, hashDb){
  const url = URL.createObjectURL(file);
  const img = document.createElement("img");
  img.src = url;
  img.alt = file.name;
  preview.appendChild(img);

  // OCR with Tesseract
  const { data } = await Tesseract.recognize(url, 'eng', {
    tessedit_char_whitelist: '0123456789VPMy Total Victory PointsPower:.,',
  });

  const rawText = (data.text || "").replace(/\s+/g, ' ').trim();
  // Extract totals
  const powers = [...rawText.matchAll(/Power[:\s]*([0-9,\.]+)/gi)].map(m => parseNumber(m[1]));
  // Heuristic: first "Power" = Attack team TCP (N), last "Power" = Defense team TCP (O)
  const tcpTeam = powers.length ? powers[0] : null;
  const tcpCounter = powers.length > 1 ? powers[powers.length-1] : null;

  // Victory Points
  const vpMatch = rawText.match(/My Total Victory Points[:\s]*([0-9,]+)/i);
  const victoryPoints = vpMatch ? parseInt(vpMatch[1].replace(/,/g,''),10) : null;

  // Compute punchup / diff
  const M = (tcpTeam!=null && tcpCounter!=null) ? (tcpCounter>tcpTeam ? "PUNCHUP" : "PUNCHDOWN") : "";
  const P = (tcpTeam!=null && tcpCounter!=null) ? Math.abs(tcpTeam - tcpCounter) : null;

  // Optional season/room from inputs
  const season = ($("#season").value||"").trim();
  const room = ($("#room").value||"").trim();

  // Portrait name best-effort (A..E attack, F..J defense)
  const names = hashDb ? await guessNamesFromPortraits(url, hashDb) : {
    attack: [], defense: []
  };

  const payload = {
    sheetId: CONFIG.sheetId,
    sheetTab: CONFIG.sheetTab,
    row: [
      names.attack[0]||"", names.attack[1]||"", names.attack[2]||"", names.attack[3]||"", names.attack[4]||"",
      names.defense[0]||"", names.defense[1]||"", names.defense[2]||"", names.defense[3]||"", names.defense[4]||"",
      season||"", room||"", M, tcpTeam||"", tcpCounter||"", P||"", victoryPoints||"", "", // S (notes) left blank by default
    ]
  };

  if (!CONFIG.backendUrl || CONFIG.backendUrl.startsWith("PUT_")){
    console.warn("Set CONFIG.backendUrl to your Apps Script URL.");
    return;
  }
  await fetch(CONFIG.backendUrl, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(payload)
  });
}

// Parses 1,627,514 into 1627514
function parseNumber(s){
  if (!s) return null;
  const n = Number(String(s).replace(/[^\d]/g,''));
  return isFinite(n)? n : null;
}

// ---- portrait matching (best-effort) ----
async function guessNamesFromPortraits(imgUrl, hashDb){
  // relative boxes (% of width/height) tuned to typical 1365x768 style screenshots
  // [x,y,w,h] in percentages
  const attackBoxes = [
    [10.5, 35.5, 6.5, 17], [18.5, 35.5, 6.5, 17], [26.5, 35.5, 6.5, 17],
    [34.5, 35.5, 6.5, 17], [42.5, 35.5, 6.5, 17]
  ];
  const defenseBoxes = [
    [57.5, 35.5, 6.2, 17], [65.2, 35.5, 6.2, 17], [72.8, 35.5, 6.2, 17],
    [80.4, 35.5, 6.2, 17], [88.0, 35.5, 6.2, 17], [95.6, 35.5, 6.2, 17]
  ];

  const img = await loadImage(imgUrl);
  const namesA = [];
  const namesD = [];

  for (const b of attackBoxes){
    const hash = await cropAndHash(img, ...b);
    namesA.push(bestMatch(hash, hashDb));
  }
  for (const b of defenseBoxes){
    const hash = await cropAndHash(img, ...b);
    namesD.push(bestMatch(hash, hashDb));
  }
  return {attack: namesA, defense: namesD};
}

function loadImage(url){
  return new Promise((res,rej)=>{
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = ()=>res(img);
    img.onerror = rej;
    img.src = url;
  });
}

async function cropAndHash(img, xPct, yPct, wPct, hPct){
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const w = img.naturalWidth, h = img.naturalHeight;
  const x = Math.round(w * xPct/100), y = Math.round(h * yPct/100);
  const cw = Math.round(w * wPct/100), ch = Math.round(h * hPct/100);
  canvas.width = 32; canvas.height = 32;
  ctx.drawImage(img, x, y, cw, ch, 0, 0, 32, 32);
  // aHash 8x8
  const small = document.createElement('canvas');
  small.width = 8; small.height = 8;
  const sctx = small.getContext('2d');
  sctx.drawImage(canvas, 0,0,8,8);
  const { data } = sctx.getImageData(0,0,8,8);
  let gray = [];
  for(let i=0;i<data.length;i+=4){
    gray.push(0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2]);
  }
  const avg = gray.reduce((a,b)=>a+b,0)/gray.length;
  return gray.map(v=> v>avg ? 1:0).join("");
}

function bestMatch(hash, db){
  if (!hash || !db) return "";
  let bestName="", bestDist=1e9;
  for (const {name,hash:ref} of db){
    const d = hamming(hash, ref);
    if (d < bestDist){ bestDist = d; bestName = name; }
  }
  // Allow only reasonably close matches
  return bestDist <= 12 ? bestName : "";
}

function hamming(a,b){
  let d=0;
  for(let i=0;i<Math.min(a.length,b.length);i++) if (a[i]!==b[i]) d++;
  return d + Math.abs(a.length-b.length);
}

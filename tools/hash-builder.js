async function listPortraits(){
  // We cannot list directory contents on GitHub Pages.
  // Workaround: user manually creates portraits/index.json listing filenames.
  try{
    const r = await fetch('../portraits/index.json', {cache:'no-store'});
    if (!r.ok) return [];
    return await r.json();
  }catch{ return []; }
}

const msg = document.getElementById('msg');
const out = document.getElementById('out');
const buildBtn = document.getElementById('build');
const dlBtn = document.getElementById('download');

buildBtn.addEventListener('click', async ()=>{
  msg.textContent = 'Building...'; msg.classList.add('glow');
  const files = await listPortraits();
  const results = [];
  for (const f of files){
    const name = f.replace(/\.[a-z]+$/i,'').replace(/[_-]+/g,' ').toUpperCase();
    const url = `../portraits/${f}`;
    const hash = await imgHash(url);
    results.push({name, hash});
    const img = document.createElement('img'); img.src = url; img.alt = name;
    out.appendChild(img);
  }
  const blob = new Blob([JSON.stringify(results,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  dlBtn.href = url; dlBtn.download = 'portraits_hash.json'; dlBtn.disabled = false;
  msg.textContent = 'Done ✓'; msg.classList.remove('glow');
});

function imgHash(url){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = ()=>{
      const cvs = document.createElement('canvas');
      cvs.width = 8; cvs.height = 8;
      const ctx = cvs.getContext('2d');
      ctx.drawImage(img, 0,0,8,8);
      const {data} = ctx.getImageData(0,0,8,8);
      const gray=[];
      for(let i=0;i<data.length;i+=4){
        gray.push(0.299*data[i]+0.587*data[i+1]+0.114*data[i+2]);
      }
      const avg = gray.reduce((a,b)=>a+b,0)/gray.length;
      const bits = gray.map(v=> v>avg?1:0).join('');
      resolve(bits);
    };
    img.onerror = reject;
    img.src = url;
  });
}

// REVEAL stage effects: countdown ring, celebration and miss flash.
// Works by watching the elements each page already updates (#fill width, #clock, #msg),
// so the game logic in each page stays unchanged.
(function(){
  const stage = document.querySelector(".stage"); if(!stage) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clock = stage.querySelector("#clock"), fill = stage.querySelector("#fill"), msg = stage.querySelector("#msg");

  // ring around the clock
  const ring = document.createElement("div"); ring.className = "ring";
  const C = 2*Math.PI*44;
  ring.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="trk" cx="50" cy="50" r="44"/><circle class="arc" cx="50" cy="50" r="44" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg>`;
  clock.parentNode.insertBefore(ring, clock); ring.appendChild(clock);
  const arc = ring.querySelector(".arc");
  const sync = () => {
    const pct = parseFloat(fill.style.width); const f = isNaN(pct) ? 1 : Math.max(0, Math.min(1, pct/100));
    arc.setAttribute("stroke-dashoffset", String(C*(1-f)));
    const low = clock.classList.contains("low");
    ring.classList.toggle("low", low); stage.classList.toggle("lowtime", low);
  };
  new MutationObserver(sync).observe(fill, {attributes:true, attributeFilter:["style"]});
  new MutationObserver(sync).observe(clock, {attributes:true, attributeFilter:["class"]});
  sync();

  // tell CSS how many tiles there are so long words fit on one row
  const tiles = stage.querySelector("#tiles");
  if(tiles){ const fit=()=>tiles.style.setProperty("--n", Math.max(1,tiles.children.length)); new MutationObserver(fit).observe(tiles,{childList:true}); fit(); }

  // confetti
  const cv = document.createElement("canvas"); cv.className = "confetti"; stage.appendChild(cv);
  const ctx = cv.getContext("2d"); let parts = [], raf = 0;
  const COLORS = ["#ffe08a","#f6b21b","#36e39a","#8fb2ff","#ff8fa3","#ffffff"];
  function burst(){
    if(reduce) return;
    const r = stage.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio||1);
    cv.width = r.width*dpr; cv.height = r.height*dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
    for(let i=0;i<140;i++){
      const side = i%2 ? 1 : -1;
      parts.push({x:r.width/2 + side*r.width*0.15, y:r.height*0.35, vx:(Math.random()*6+2)*side*(Math.random()<.3?-1:1), vy:-(Math.random()*9+5),
        s:Math.random()*6+4, rot:Math.random()*6, vr:(Math.random()-.5)*.4, c:COLORS[i%COLORS.length], life:0});
    }
    if(!raf) raf = requestAnimationFrame(step);
  }
  function step(){
    const r = stage.getBoundingClientRect(); ctx.clearRect(0,0,r.width,r.height);
    parts.forEach(p=>{ p.vy+=0.32; p.vx*=0.99; p.x+=p.vx; p.y+=p.vy; p.rot+=p.vr; p.life++;
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot); ctx.fillStyle=p.c; ctx.globalAlpha=Math.max(0,1-p.life/110);
      ctx.fillRect(-p.s/2,-p.s/4,p.s,p.s/2); ctx.restore(); });
    parts = parts.filter(p=>p.life<110 && p.y<r.height+20);
    raf = parts.length ? requestAnimationFrame(step) : 0;
    if(!raf) ctx.clearRect(0,0,r.width,r.height);
  }
  function flash(cls){ stage.classList.remove("flash-good","flash-bad"); void stage.offsetWidth; stage.classList.add(cls); }

  let prev = "";
  new MutationObserver(()=>{
    const k = msg.classList.contains("good") ? "good" : msg.classList.contains("bad") ? "bad" : "";
    const txt = msg.textContent;
    if(k==="good" && (prev!=="good" || txt!==msg._last)) { if(prev!=="good"){ flash("flash-good"); burst(); } }
    if(k==="bad" && txt!==msg._last) flash("flash-bad");
    prev = k; msg._last = txt;
  }).observe(msg, {attributes:true, attributeFilter:["class"], childList:true, characterData:true, subtree:true});
  window.REVEAL_STAGE = { burst };
})();

// Answer slots: the answer box shows one "_" per letter and fills them in as you type.
(function(){
  const stage = document.querySelector(".stage"); if(!stage) return;
  const inp = stage.querySelector("#guess"), tiles = stage.querySelector("#tiles");
  if(!inp || !tiles) return;
  const wrap = document.createElement("div"); wrap.className = "slotwrap";
  inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp);
  const slots = document.createElement("div"); slots.className = "slots"; slots.setAttribute("aria-hidden","true");
  wrap.appendChild(slots);
  inp.classList.add("slotted");
  let last = null;
  function render(){
    const n = tiles.children.length || 1;
    const v = inp.value.toUpperCase().replace(/[^A-Z]/g,"");
    if(inp.value !== v) inp.value = v;
    if(inp.maxLength !== n) inp.maxLength = n;
    const key = n + "|" + v + "|" + (document.activeElement===inp) + "|" + inp.disabled;
    if(key === last) return; last = key;
    slots.style.setProperty("--n", n);
    let html = "";
    for(let i=0;i<n;i++){
      const ch = v[i];
      const cls = ch ? "s on" : (i===v.length && document.activeElement===inp && !inp.disabled ? "s cur" : "s");
      html += `<span class="${cls}">${ch || "_"}</span>`;
    }
    slots.innerHTML = html;
  }
  ["input","keyup","focus","blur"].forEach(e=>inp.addEventListener(e, render));
  new MutationObserver(render).observe(tiles, {childList:true});
  setInterval(render, 150);   // catches value resets done by the game code
  render();
})();

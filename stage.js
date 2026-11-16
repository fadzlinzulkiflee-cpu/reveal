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
  if(tiles){ const fit=()=>{ const n=Math.max(1,tiles.children.length); tiles.style.setProperty("--n", n); stage.toggleAttribute("data-long", n>=10); }; new MutationObserver(fit).observe(tiles,{childList:true}); fit(); }

  // confetti
  const cv = document.createElement("canvas"); cv.className = "confetti"; stage.appendChild(cv);
  const ctx = cv.getContext("2d"); let parts = [], raf = 0;
  const COLORS = ["#ffe08a","#f6b21b","#36e39a","#8fb2ff","#ff8fa3","#ffffff"];
  function burst(){
    if(reduce) return;
    const r = stage.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio||1);
    cv.width = r.width*dpr; cv.height = r.height*dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
    for(let i=0;i<60;i++){
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

// Sound, vibration, countdown and banner.
// data-sound on the stage: "full" (Solo, TV) or "feedback" (phones: only right/wrong sounds, plus vibration).
(function(){
  const stage = document.querySelector(".stage"); if(!stage) return;
  const full = (stage.dataset.sound || "full") === "full";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let ctx = null, muted = false;
  try { muted = localStorage.getItem("reveal-muted") === "1"; } catch(e) {}
  const unlock = () => { if(!ctx){ try{ ctx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } if(ctx && ctx.state==="suspended") ctx.resume(); };
  ["pointerdown","keydown","touchstart"].forEach(e=>addEventListener(e, unlock, {passive:true}));

  function tone(freq, dur, type="sine", vol=.18, when=0, slideTo=0){
    if(muted || !ctx) return;
    const t0 = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if(slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0+dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0+.01); g.gain.exponentialRampToValueAtTime(0.0001, t0+dur);
    o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0+dur+.02);
  }
  // Vibration: Android uses navigator.vibrate. iPhone Safari has no vibrate API, but toggling a
  // hidden iOS "switch" checkbox gives a light haptic tap (iOS 18+), so we use that as a fallback.
  let hap = null;
  function iosTap(){
    if(!hap){
      hap = document.createElement("label"); hap.setAttribute("aria-hidden","true");
      hap.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0";
      const cb = document.createElement("input"); cb.type = "checkbox"; cb.setAttribute("switch",""); cb.tabIndex = -1;
      hap.appendChild(cb); document.body.appendChild(hap);
    }
    // never while typing: on iPhone the toggle can steal focus and close the keyboard
    const a = document.activeElement;
    if(a && (a.tagName==="INPUT" || a.tagName==="TEXTAREA") && a.type!=="checkbox") return;
    hap.click();
  }
  const canVibrate = typeof navigator.vibrate === "function";
  let vibeOn = true;
  const readVibe = () => { try{ vibeOn = localStorage.getItem("reveal-vibe") !== "0"; }catch(e){} };
  readVibe();
  const buzz = p => {
    if(!vibeOn) return;
    try{
      if(canVibrate){ navigator.vibrate(p); return; }
      const pulses = Array.isArray(p) ? p.filter((_,i)=>i%2===0) : [p];
      let at = 0; pulses.forEach(d=>{ setTimeout(iosTap, at); at += Math.max(90, d); });
    }catch(e){}
  };
  const SFX = {
    tick(){ tone(1200,.05,"square",.06); },
    pop(){ tone(520,.12,"triangle",.14,0,900); },
    good(){ [523,659,784,1046].forEach((f,i)=>tone(f,.18,"triangle",.16,i*.08)); buzz([40,40,80]); },
    bad(){ tone(220,.25,"sawtooth",.09,0,140); buzz(160); },
    beep(final){ tone(final?988:660, final?.35:.14, "square", .1); buzz(final?60:20); },
    del(){ tone(340,.07,"triangle",.11,0,200); buzz(15); },
    heart(){ tone(70,.16,"sine",.5,0,45); tone(62,.18,"sine",.4,.2,40); buzz([35,140,30]); },
    roll(dur=1.1){ if(muted||!ctx) return; const n=Math.floor(dur/.045); for(let i=0;i<n;i++) noise(.05, .05+.12*i/n, i*.045, 900); },
    crash(){ noise(.9,.22,0,3000); tone(98,.5,"sine",.3,0,60); buzz(90); },
    whoosh(){ noise(.35,.12,0,1800); tone(300,.3,"sine",.08,0,1400); },
    combo(n){ [659,784,988,1175].slice(0,Math.min(4,n)).forEach((f,i)=>tone(f,.1,"square",.07,.25+i*.06)); },
    fanfare(){ [392,523,659,784,659,784,1046].forEach((f,i)=>tone(f,.22,"triangle",.17,i*.11)); }
  };
  function noise(dur, vol, when=0, hp=500){
    if(muted || !ctx) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate*dur)), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for(let i=0;i<len;i++) d[i] = (Math.random()*2-1) * Math.pow(1-i/len, 2);
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), t0 = ctx.currentTime+when;
    src.buffer = buf; f.type = "highpass"; f.frequency.value = hp; g.gain.setValueAtTime(vol, t0);
    src.connect(f).connect(g).connect(ctx.destination); src.start(t0);
  }
  SFX.buzz = buzz; SFX.full = full;
  window.REVEAL_SFX = SFX;

  // mute button
  const mb = document.createElement("button");
  mb.type="button"; mb.className="mute"; mb.setAttribute("aria-label","Sound on or off");
  const paint = () => { mb.textContent = muted ? "Sound off" : "Sound on"; mb.setAttribute("aria-pressed", String(!muted)); };
  mb.addEventListener("click", ()=>{ muted=!muted; try{ localStorage.setItem("reveal-muted", muted?"1":"0"); }catch(e){} unlock(); paint(); });
  paint(); stage.appendChild(mb);
  addEventListener("reveal-settings", ()=>{ try{ muted = localStorage.getItem("reveal-muted") === "1"; }catch(e){} readVibe(); paint(); });
  addEventListener("storage", e=>{ if(e.key==="reveal-muted"||e.key==="reveal-vibe") dispatchEvent(new Event("reveal-settings")); });

  // delete / backspace in the answer box: soft click and tiny buzz
  const ans = stage.querySelector("#guess");
  if(ans){
    let prevLen = 0;
    ans.addEventListener("focus", ()=>{ prevLen = ans.value.length; });
    ans.addEventListener("input", e=>{
      const len = ans.value.length;
      const deleted = e.inputType ? e.inputType.startsWith("delete") : len < prevLen;
      if(deleted) SFX.del();
      prevLen = len;
    });
  }

  // automatic sounds from what the page already shows
  const tiles = stage.querySelector("#tiles"), clock = stage.querySelector("#clock"), msg = stage.querySelector("#msg");
  if(full && tiles){
    new MutationObserver(ms=>{ if(ms.some(m=>m.type==="attributes" && m.target.classList.contains("open") && !(m.oldValue||"").includes("open") && !m.target.classList.contains("beat") && !m.target.classList.contains("missed"))) SFX.pop(); })
      .observe(tiles,{subtree:true,attributes:true,attributeFilter:["class"],attributeOldValue:true});
  }
  if(!full && clock){   // phones: no sound, but feel the heartbeat in the last seconds
    let lastT = "";
    new MutationObserver(()=>{ const v=clock.textContent; if(v!==lastT){ lastT=v; if(clock.classList.contains("low") && +v>0 && !stage.classList.contains("frozen")) buzz([35,140,30]); } })
      .observe(clock,{childList:true,characterData:true,subtree:true});
  }
  if(full && clock){
    let lastT = "";
    new MutationObserver(()=>{ const v=clock.textContent; if(v!==lastT){ lastT=v; if(clock.classList.contains("low") && +v>0 && !stage.classList.contains("frozen")) SFX.heart(); } })
      .observe(clock,{childList:true,characterData:true,subtree:true});
  }
  if(msg){
    let prevK="", prevT="";
    new MutationObserver(()=>{
      const k = msg.classList.contains("good") ? "good" : msg.classList.contains("bad") ? "bad" : "";
      const tx = msg.textContent;
      if(k==="good" && prevK!=="good") SFX.good();
      if(k==="bad" && tx!==prevT && tx) SFX.bad();
      prevK=k; prevT=tx;
    }).observe(msg,{attributes:true,attributeFilter:["class"],childList:true,characterData:true,subtree:true});
  }

  // 3-2-1 countdown overlay
  const ov = document.createElement("div"); ov.className="countdown"; ov.hidden=true; ov.setAttribute("aria-live","assertive");
  stage.appendChild(ov);
  let cdTimer = 0;
  function countdown(cb, secs=3){
    clearInterval(cdTimer); let n = secs;
    stage.classList.add("counting");
    ov.hidden=false; ov.innerHTML = `<span class="lbl">Get ready</span><b>${n}</b>`; SFX.beep(false);
    cdTimer = setInterval(()=>{
      n--;
      if(n>0){ ov.innerHTML = `<span class="lbl">Get ready</span><b>${n}</b>`; SFX.beep(false); }
      else if(n===0){ ov.innerHTML = `<b class="go">GO!</b>`; SFX.beep(true); }
      else { clearInterval(cdTimer); ov.hidden=true; stage.classList.remove("counting"); cb && cb(); }
    }, reduce ? 700 : 800);
  }
  function cancelCountdown(){ clearInterval(cdTimer); ov.hidden=true; stage.classList.remove("counting"); }

  // banner (e.g. Royale final showdown)
  const bn = document.createElement("div"); bn.className="banner"; bn.hidden=true; stage.insertBefore(bn, stage.firstChild);
  function banner(text){ bn.hidden=!text; bn.textContent=text||""; }

  window.REVEAL_STAGE = Object.assign(window.REVEAL_STAGE||{}, { countdown, cancelCountdown, banner, sfx:SFX });
})();

// REVEAL drama layer: last-seconds tension, big splashes, combo meter, drum roll and score bumps.
// Like stage.js, it watches what each page already shows (#clock, #msg, #tiles, score) and adds the show.
(function(){
  const stage = document.querySelector(".stage"); if(!stage) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SFX = window.REVEAL_SFX || {};
  const play = (name, ...a) => { try{ SFX[name] && SFX[name](...a); }catch(e){} };
  const clock = stage.querySelector("#clock"), fill = stage.querySelector("#fill"),
        msg = stage.querySelector("#msg"), tiles = stage.querySelector("#tiles"), inp = stage.querySelector("#guess");

  // red vignette that throbs with the heartbeat
  const vig = document.createElement("div"); vig.className = "vignette"; vig.setAttribute("aria-hidden","true");
  stage.appendChild(vig);

  // "frozen": this player is done with the word, so the tension stops
  const frozen = () => !inp ? false : (!!(msg && msg.classList.contains("good")) || (inp.disabled && stage.classList.contains("lowtime")));
  function refreshFrozen(){ stage.classList.toggle("frozen", frozen()); }
  if(msg) new MutationObserver(refreshFrozen).observe(msg,{attributes:true,attributeFilter:["class"]});
  if(inp) new MutationObserver(refreshFrozen).observe(inp,{attributes:true,attributeFilter:["disabled"]});

  // every second in the danger zone: thump the stage
  if(clock){
    let last = "";
    new MutationObserver(()=>{
      const v = clock.textContent; if(v===last) return; last = v;
      refreshFrozen();
      if(!stage.classList.contains("lowtime") || stage.classList.contains("frozen") || !(+v>0)) return;
      stage.classList.remove("thump"); void stage.offsetWidth; stage.classList.add("thump");
    }).observe(clock,{childList:true,characterData:true,subtree:true});
  }

  // splash text + flying points
  // On the player's screen the praise takes the answer box's place and stays until the next word.
  const splash = document.createElement("div"); splash.className = "splash"; splash.setAttribute("aria-hidden","true");
  const form = inp && inp.form;
  if(form && msg){ splash.classList.add("inline"); form.after(splash); } else stage.appendChild(splash);
  function showSplash(word, sub, kind){
    splash.className = "splash " + (kind||"") + (form && msg ? " inline" : "");
    splash.innerHTML = `<b>${word}</b>` + (sub ? `<span>${sub}</span>` : "");
    if(!splash.classList.contains("inline")){
      const anchor = stage.querySelector(".slotwrap") || inp || msg, sr = stage.getBoundingClientRect();
      if(anchor){ const r = anchor.getBoundingClientRect(); splash.style.top = (r.top - sr.top + r.height/2) + "px"; }
    } else stage.classList.add("won");
    void splash.offsetWidth; splash.classList.add("go");
  }
  function clearSplash(){ stage.classList.remove("won"); splash.classList.remove("go"); }
  function flyPoints(text){
    if(reduce) return;
    const el = document.createElement("div"); el.className = "flypts"; el.textContent = text;
    const r = msg ? msg.getBoundingClientRect() : null, sr = stage.getBoundingClientRect();
    el.style.top = (r ? r.top - sr.top - 56 : sr.height*.6) + "px";
    stage.appendChild(el); setTimeout(()=>el.remove(), 1400);
  }
  function judge(){
    const pct = fill ? parseFloat(fill.style.width) : NaN;
    const f = isNaN(pct) ? .5 : pct/100;
    const secs = clock ? +clock.textContent : 99;
    const all = tiles ? tiles.children.length : 0;
    const hidden = tiles ? [...tiles.children].filter(t=>!t.classList.contains("open") || t.classList.contains("beat")).length : 0;
    const tx = msg.textContent, sm = tx.match(/Streak ×(\d+)/), streak = sm ? +sm[1] : 0;
    // success messages from the REVEAL 3.0 brief
    if(all && hidden === all) return ["INSTANT REVEAL!", "Before a single letter", "zap"];
    if(f >= .75) return ["INSTANT REVEAL!", "Faster than the letters", "zap"];
    if(secs <= 3) return ["PERFECT TIMING!", "Just in time", "clutch"];
    if(all && hidden/all >= .5) return ["BRILLIANT!", `${hidden} of ${all} letters still hidden`, "genius"];
    if(streak >= 3) return ["ON FIRE!", `${streak} in a row`, "fire"];
    return ["QUICK THINKER!", "", ""];
  }
  if(msg && inp){   // splashes on the player's own screen (Solo and phone), not the TV
    let prevK = "", prevT = "";
    new MutationObserver(()=>{
      const k = msg.classList.contains("good") ? "good" : msg.classList.contains("bad") ? "bad" : "";
      const tx = msg.textContent;
      if(k==="good" && prevK!=="good" && /\+\d+/.test(tx)){
        const [w, sub, kind] = judge(); showSplash(w, sub, kind);
        if(kind==="zap" || kind==="genius") play("whoosh");
      }
      if(k==="bad" && tx && tx!==prevT){
        stage.classList.remove("shake"); void stage.offsetWidth; stage.classList.add("shake");
        const m = tx.match(/−\d+/); if(m) flyPoints(m[0]+" pts");
      }
      if(k!=="good" && prevK==="good") clearSplash();
      prevK = k; prevT = tx;
    }).observe(msg,{attributes:true,attributeFilter:["class"],childList:true,characterData:true,subtree:true});
  }

  // drum roll + crash when the word is revealed after nobody got it
  if(tiles){
    let rolling = false;
    new MutationObserver(ms=>{
      if(rolling) return;
      if(ms.some(m=>m.target.classList && m.target.classList.contains("missed") && !(m.oldValue||"").includes("missed"))){
        rolling = true; play("roll", .9); setTimeout(()=>{ play("crash"); rolling=false; }, 900);
      }
    }).observe(tiles,{subtree:true,attributes:true,attributeFilter:["class"],attributeOldValue:true});
  }

  // combo meter (pages call REVEAL_DRAMA.combo(n))
  const cb = document.createElement("div"); cb.className = "combo"; cb.hidden = true; cb.setAttribute("aria-live","polite");
  const top = stage.querySelector(".toprow") || stage; top.appendChild(cb);
  let comboN = 0;
  function combo(n){
    if(n === comboN) return;
    const up = n > comboN; comboN = n;
    cb.hidden = n < 2;
    if(n >= 2){
      cb.innerHTML = `<span>COMBO</span><b>×${n}</b>`; cb.dataset.heat = Math.min(4, n);
      if(up){ cb.classList.remove("bump"); void cb.offsetWidth; cb.classList.add("bump"); play("combo", n); }
    }
  }

  // score counters pop when they change
  ["sc","meScore"].forEach(id=>{
    const el = document.getElementById(id); if(!el) return;
    let last = el.textContent;
    new MutationObserver(()=>{
      const v = el.textContent; if(v===last) return;
      const up = (parseInt(v)||0) > (parseInt(last)||0); last = v;
      el.classList.remove("bump-up","bump-down"); void el.offsetWidth; el.classList.add(up ? "bump-up" : "bump-down");
    }).observe(el,{childList:true,characterData:true,subtree:true});
  });

  window.REVEAL_DRAMA = { combo, splash:showSplash };
})();

// End-of-game hooks: rank title, gap to your best and a shareable score card.
window.REVEAL_END = (function(){
  const TITLES = [
    [0,"Warming Up"],[400,"Word Rookie"],[900,"Quick Thinker"],[1400,"Sharp Mind"],
    [1900,"Word Hunter"],[2400,"Mind Reader"],[2900,"REVEAL Legend"]
  ];
  function title(score){
    let i = 0; while(i+1 < TITLES.length && score >= TITLES[i+1][0]) i++;
    const next = TITLES[i+1];
    return { name:TITLES[i][1], level:i+1, of:TITLES.length, next: next ? { name:next[1], need:next[0]-score } : null };
  }
  function link(){ return location.href.replace(/[?#].*$/,"").replace(/(host|play|online)\.html$/,""); }
  async function share(text, btn){
    const url = link();
    const full = text + "\n" + url;
    try{
      if(navigator.share){ await navigator.share({ text: full }); return; }
    }catch(e){ if(e && e.name==="AbortError") return; }
    try{ await navigator.clipboard.writeText(full); if(btn){ const o=btn.textContent; btn.textContent="Copied! Paste it anywhere"; setTimeout(()=>btn.textContent=o, 2200); } }
    catch(e){ prompt("Copy your score:", full); }
  }
  // One-tap share row (Lin, launch): WhatsApp, Threads, Facebook, X and Copy.
  // getText() is read on tap, so the row can be built before the score is known.
  // Instagram has no web share link, so phones use the main Share button for it.
  function bar(getText){
    const el = document.createElement("div");
    el.className = "sharebar"; el.setAttribute("aria-label","Share to");
    const go = {
      wa: t=>"https://wa.me/?text="+encodeURIComponent(t),
      th: t=>"https://www.threads.net/intent/post?text="+encodeURIComponent(t),
      fb: ()=>"https://www.facebook.com/sharer/sharer.php?u="+encodeURIComponent(link()),
      x:  t=>"https://twitter.com/intent/tweet?text="+encodeURIComponent(t)
    };
    const items = [["wa","WhatsApp"],["th","Threads"],["fb","Facebook"],["x","X"],["cp","Copy"]];
    el.innerHTML = items.map(([k,n])=>`<a class="sb sb-${k}" href="#" data-k="${k}" role="button">${n}</a>`).join("");
    el.addEventListener("click", async e=>{
      const a = e.target.closest("a[data-k]"); if(!a) return;
      e.preventDefault();
      const full = getText() + "\n" + link();
      if(a.dataset.k === "cp"){
        try{ await navigator.clipboard.writeText(full); a.textContent = "Copied!"; }
        catch(_){ prompt("Copy your score:", full); }
        setTimeout(()=>a.textContent="Copy", 2000); return;
      }
      window.open(go[a.dataset.k](full), "_blank", "noopener");
    });
    return el;
  }
  return { title, share, bar };
})();

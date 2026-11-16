// REVEAL Daily Challenge: the same 10 words for everyone each day (UTC), plus an online leaderboard.
// Leaderboard storage: Supabase table `daily_scores` (see README). Only the public publishable key is used here.
window.REVEAL_CONFIG = Object.assign({
  supabaseUrl: "https://nnvgopfuenajnioiqmdk.supabase.co",
  supabaseKey: "sb_publishable_87f_38eIrLHXX6a3Jb71rA_kjm3WLEN"
}, window.REVEAL_CONFIG || {});

window.REVEAL_DAILY = (function(){
  const COUNT = { easy:3, medium:4, hard:3 }, T = 20, N = COUNT.easy + COUNT.medium + COUNT.hard;   // 10 words, 20 s each (Lin)
  const store = { get(k){try{return localStorage.getItem(k)}catch(e){return null}}, set(k,v){try{localStorage.setItem(k,v)}catch(e){}} };

  function today(){ return new Date().toISOString().slice(0,10); }            // UTC day, same for everyone
  function niceDate(d){ return new Date(d+"T12:00:00Z").toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}); }
  function msToReset(){ const n=new Date(); return Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),n.getUTCDate()+1) - n.getTime(); }
  function hms(ms){ const s=Math.max(0,Math.floor(ms/1000)); return `${Math.floor(s/3600)}h ${String(Math.floor(s/60)%60).padStart(2,"0")}m`; }

  // small seeded PRNG so every device picks the same words for a given date
  function seedOf(str){ let h=1779033703^str.length; for(let i=0;i<str.length;i++){ h=Math.imul(h^str.charCodeAt(i),3432918353); h=h<<13|h>>>19; } return ()=>{ h=Math.imul(h^h>>>16,2246822507); h=Math.imul(h^h>>>13,3266489909); return (h^=h>>>16)>>>0; }; }
  function rng(seed){ let a=seed(); return ()=>{ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  function words(day=today()){
    const r = rng(seedOf("reveal-daily-"+day)), out = [];
    [["easy",1],["medium",2],["hard",3]].forEach(([k,lv])=>{
      const pool = window.WORDS.filter(w=>w[2]===lv).slice().sort((a,b)=>a[0]<b[0]?-1:1);
      for(let i=0;i<COUNT[k];i++){ const j=Math.floor(r()*pool.length); out.push(pool.splice(j,1)[0]); }
    });
    return out;
  }

  function device(){ let d=store.get("reveal-device"); if(!d){ d=(crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)+Date.now().toString(36)); store.set("reveal-device",d); } return d; }
  function result(day=today()){ try{ return JSON.parse(store.get("reveal-daily-"+day)||"null"); }catch(e){ return null; } }
  function saveResult(r, day=today()){ store.set("reveal-daily-"+day, JSON.stringify(r)); }
  function streak(){
    let n=0; const d=new Date();
    if(!result(today())) d.setUTCDate(d.getUTCDate()-1);   // today not played yet: count up to yesterday
    while(result(d.toISOString().slice(0,10))){ n++; d.setUTCDate(d.getUTCDate()-1); }
    return n;
  }

  const C = window.REVEAL_CONFIG;
  const online = () => !!(C.supabaseUrl && C.supabaseKey);
  const api = path => C.supabaseUrl.replace(/\/$/,"") + "/rest/v1/" + path;
  const headers = extra => Object.assign({ apikey:C.supabaseKey, "Content-Type":"application/json" }, extra||{});
  const auth = token => token ? { Authorization:"Bearer " + token } : {};
  async function submit(row, token){
    if(!online()) return { ok:false, offline:true };
    // signed-in players post under their account; we keep the new row's id to highlight it on the board
    const h = Object.assign({ Prefer:"return=representation" }, auth(token));
    try{
      const res = await fetch(api("daily_scores?select=id"), { method:"POST", headers:headers(h), body:JSON.stringify(row) });
      if(res.status===409) return { ok:true, already:true };
      if(res.ok){ try{ const j = await res.json(); if(j && j[0]) store.set("reveal-daily-id-"+row.day, String(j[0].id)); }catch(e){} }
      return { ok:res.ok, status:res.status };
    }catch(e){ return { ok:false, error:String(e) }; }
  }
  async function board(day=today(), limit=50){
    if(!online()) return null;
    try{
      const q = `daily_scores?select=id,name,score,solved,time_ms,user_id&day=eq.${day}&order=score.desc,time_ms.asc&limit=${limit}`;
      const res = await fetch(api(q), { headers:headers() });
      if(!res.ok) return null;
      return await res.json();
    }catch(e){ return null; }
  }
  // One try per account: the account's row for a day, if it has one (null = none or unknown).
  async function accountRow(uid, token, day=today()){
    if(!online() || !uid) return null;
    try{
      const res = await fetch(api(`daily_scores?select=id,score,solved,time_ms&day=eq.${day}&user_id=eq.${uid}`), { headers:headers(auth(token)) });
      if(!res.ok) return null;
      const j = await res.json(); return j[0] || null;
    }catch(e){ return null; }
  }
  // Move today's guest score (posted from this device) to the signed-in account.
  async function claim(token, day=today()){
    if(!online() || !token) return false;
    try{
      const res = await fetch(api("rpc/claim_daily"), { method:"POST", headers:headers(auth(token)), body:JSON.stringify({ p_day:day, p_device:device() }) });
      return res.ok;
    }catch(e){ return false; }
  }
  const esc = s => String(s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function renderBoard(el, rows, me){
    if(rows===null){ el.innerHTML = online() ? `<p class="lb-empty">Couldn't load the leaderboard. Check your connection.</p>` : `<p class="lb-empty">The online leaderboard opens soon.</p>`; return; }
    if(!rows.length){ el.innerHTML = `<p class="lb-empty">No scores yet today. Be the first!</p>`; return; }
    const myId = store.get("reveal-daily-id-"+today()), uid = me && me.uid;
    const meIdx = rows.findIndex(r=>(uid && r.user_id===uid) || (myId && String(r.id)===myId));
    el.innerHTML = `<ol class="lb">` + rows.map((r,i)=>`<li class="${i===meIdx?"me":""}${i<3?" top":""}"><span class="pos">${i+1}</span><span class="nm">${esc(r.name)}</span><span class="sv">${r.solved}/${N}</span><span class="tm">${(r.time_ms/1000).toFixed(1)}s</span><b class="sc">${r.score}</b></li>`).join("") + `</ol>`
      + (meIdx<0 && result() ? `<p class="lb-empty">You're not in the top ${rows.length} yet.</p>` : "");
  }
  return { T, N, today, niceDate, msToReset, hms, words, device, result, saveResult, streak, submit, board, accountRow, claim, renderBoard, online, store };
})();

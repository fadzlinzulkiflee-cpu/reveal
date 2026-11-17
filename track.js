// REVEAL visitor counts (Lin, 17 Nov): where players come from and what they do, so promos can be compared.
// Sends tiny anonymous events to Supabase (supabase/tracking.sql): visit, start, finish, signin, signup.
// Each event carries the visitor's FIRST source (?src=threads, a share link, Facebook, Google…) and a random
// visitor id kept on this device. No names, emails or IPs are stored.
window.REVEAL_TRACK = (function(){
  const C = Object.assign({ supabaseUrl:"https://nnvgopfuenajnioiqmdk.supabase.co", supabaseKey:"sb_publishable_87f_38eIrLHXX6a3Jb71rA_kjm3WLEN" }, window.REVEAL_CONFIG || {});
  const ls = { get(k){try{return localStorage.getItem(k)}catch(e){return null}}, set(k,v){try{localStorage.setItem(k,v)}catch(e){}} };
  const ss = { get(k){try{return sessionStorage.getItem(k)}catch(e){return null}}, set(k,v){try{sessionStorage.setItem(k,v)}catch(e){}} };
  const clean = s => String(s||"").toLowerCase().replace(/[^a-z0-9._-]/g,"").slice(0,32);

  let visitor = ls.get("reveal-visitor");
  if(!/^[a-z0-9]{12,40}$/.test(visitor||"")){ visitor = Array.from({length:20},()=>"abcdefghijklmnopqrstuvwxyz0123456789"[Math.random()*36|0]).join(""); ls.set("reveal-visitor", visitor); }

  // Where did this visit come from? ?src= / ?utm_source= first, then the in-app browser, then the referrer.
  function detect(){
    const q = new URLSearchParams(location.search);
    const tag = clean(q.get("src") || q.get("utm_source") || q.get("ref"));
    if(tag) return tag;
    const ua = navigator.userAgent || "";
    if(/Barcelona/i.test(ua)) return "threads";        // Threads in-app browser
    if(/Instagram/i.test(ua)) return "instagram";
    if(/FBAN|FBAV|FB_IAB/i.test(ua)) return "facebook";
    if(/TikTok|musical_ly|BytedanceWebview/i.test(ua)) return "tiktok";
    let host = "";
    try{ host = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./,"") : ""; }catch(e){}
    if(!host || host === location.hostname) return "";  // typed, bookmark, home-screen app, or our own pages
    const map = [[/threads\.(net|com)$/,"threads"],[/(^|\.)facebook\.com$|fb\.me$/,"facebook"],[/instagram\.com$/,"instagram"],
      [/(^|\.)t\.co$|(^|\.)x\.com$|twitter\.com$/,"x"],[/whatsapp\.com$|wa\.me$/,"whatsapp"],[/google\./,"google"],[/bing\.com$/,"bing"],
      [/tiktok\.com$/,"tiktok"],[/reddit\.com$/,"reddit"],[/telegram\.|t\.me$/,"telegram"],[/youtube\.com$|youtu\.be$/,"youtube"]];
    for(const [re,name] of map) if(re.test(host)) return name;
    return clean(host);
  }
  const now = detect();
  let first = ls.get("reveal-src");
  if(!first){ first = now || "direct"; ls.set("reveal-src", first); }
  const src = first;

  function send(kind, mode){
    if(!C.supabaseUrl || !C.supabaseKey) return;
    try{
      fetch(C.supabaseUrl + "/rest/v1/rpc/reveal_track", {
        method:"POST", keepalive:true,
        headers:{ "Content-Type":"application/json", apikey:C.supabaseKey, Authorization:"Bearer " + C.supabaseKey },
        body: JSON.stringify({ kind, mode: clean(mode) || null, src, visitor, via: now || null })
      }).catch(()=>{});
    }catch(e){}
  }
  // one "visit" per browser tab session
  if(!ss.get("reveal-visit")){ ss.set("reveal-visit","1"); send("visit", (location.pathname.split("/").pop() || "index.html").replace(/\.html$/,"")); }

  return {
    src, visitor,
    start(mode){ send("start", mode); },
    finish(mode){ send("finish", mode); },
    // once per account on this device
    signin(uid){ const k = "reveal-tracked-in-" + uid; if(!ls.get(k)){ ls.set(k,"1"); send("signin"); } },
    signup(){ send("signup"); }
  };
})();

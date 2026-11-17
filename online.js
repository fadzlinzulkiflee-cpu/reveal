// REVEAL Online Battle Royale.
// Ranked (signed in): the match runs on the server (supabase/ranked.sql). This page joins with rk_join(),
// polls rk_state() about twice a second and sends answers with rk_guess(). The server's state has the same
// shape as the unranked host's messages, so both modes share the screens below.
// Unranked (guests), no game server: the first player to look for a match claims a well-known "lobby beacon" id on the
// PeerJS broker and hosts the match on their own device. Others who search find the beacon, learn the
// host's game id, and connect. When the match starts the host drops the beacon, so the next searcher
// opens a new lobby. Empty seats are filled with bots (clearly marked BOT).
(function(){
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const NET = window.REVEAL_NET;
  const q = new URLSearchParams(location.search);
  const store = { get(k){try{return localStorage.getItem(k)}catch(e){return null}}, set(k,v){try{localStorage.setItem(k,v)}catch(e){}} };

  // ---- tunables (URL overrides are for testing) ----
  const BEACON = "reveal-br-v1-lobby-";      // + slot number
  const SLOTS = 4;                            // parallel lobbies if one beacon is stuck
  const LOBBY_SECS = +(q.get("lobby") || 20); // how long a lobby waits for humans
  const MAX = 20, FILL = Math.min(MAX, +(q.get("size") || 10)); // bots fill the match up to FILL players
  const T = +(q.get("t") || 20);              // seconds per word
  const REVEAL_SECS = +(q.get("rv") || 4);    // pause on the answer between rounds
  const NOBOTS = q.get("bots") === "0";
  const tmode = () => ranked ? "ranked" : "br";

  const AV = ["#c7f58b","#8fd3ff","#ffc98b","#d9a7ff","#ff9fb0","#7fe0c4","#f6e27a","#b3c7ff","#ffb38a","#a8f0a0","#f0a8e0","#9be7ff"];
  const avColor = name => { let h=0; for(const c of name) h=(h*31+c.charCodeAt(0))>>>0; return AV[h%AV.length]; };
  const initial = n => esc((n.trim()[0]||"?").toUpperCase());
  // Signed-in players show their avatar (saved by the home screen); guests show an initial.
  const AVS = window.REVEAL_AVATARS, okAv = a => !!(AVS && a && AVS.has(a));
  const myAv = okAv(store.get("reveal-avatar")) ? store.get("reveal-avatar") : null;
  const avHTML = (p, cls="") => okAv(p.a)
    ? `<span class="av pic${cls}" title="${esc(p.n)}${p.bot?" (bot)":""}">${AVS.svg(p.a)}</span>`
    : `<span class="av${cls}" style="--av:${avColor(p.n)}" title="${esc(p.n)}${p.bot?" (bot)":""}">${initial(p.n)}</span>`;
  const BOT_NAMES = ["Nova","Pixel","Echo","Blaze","Juno","Orbit","Maple","Comet","Indigo","Rook","Sable","Kiwi","Atlas","Ember","Quill","Zephyr","Pepper","Lumen","Vega","Mochi","Sprout","Cobalt","Dune","Fable"];
  const shuffle = a => { for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };

  let token = store.get("reveal-token"); if(!token){ token = Math.random().toString(36).slice(2)+Date.now().toString(36); store.set("reveal-token",token); }
  $("nameIn").value = store.get("reveal-name") || "";

  // ============ CLIENT VIEW (used by every player, including the host) ============
  let st = null, myName = "", playRound = -1, deadline = 0, clockTimer = 0, lobbyTimer = 0, lobbyEnds = 0;
  let send = () => {};            // set when connected (or to the local host handler)
  let isHost = false, lastBubbles = new Set();

  function show(id){
    ["find","searching","lobby","play","reveal","over"].forEach(s=>$(s).hidden = s!==id);
    $("lost").hidden = true;
    $("hostNote2").hidden = !(isHost && (id==="play" || id==="reveal"));
  }

  function onMsg(m){
    if(m.t==="result") return onResult(m);
    if(m.t!=="state") return;
    const prev = st && st.phase;
    st = m;
    $("me").hidden = false; $("meName").textContent = myName;
    $("meState").textContent = st.phase==="lobby" ? "In lobby" : st.phase==="over" ? ordinal(st.place||1)+" place" : st.out ? "Out" : "Still in";
    if(st.phase==="lobby"){ overCounted = false; return drawLobby(); }
    if(prev==="lobby" && window.REVEAL_TRACK) REVEAL_TRACK.start(tmode());
    clearInterval(lobbyTimer);
    // Ranked updates arrive about twice a second with the same phase, so only (re)draw what changed.
    // Restarting the 3-2-1 or rebuilding the tiles on every update made the screen jump.
    const sameRound = prev===st.phase && st.round===playRound;
    if(st.phase==="countdown"){
      if(sameRound){ drawAlive(); return; }
      startPlay();
      // answer box stays focused through the 3-2-1 so the keyboard is already up at GO! (guesses wait for "play")
      $("guess").disabled = !!st.out; $("guessBtn").disabled = true;
      if(!st.out) $("guess").focus({preventScroll:true});
      $("clock").textContent = st.T; $("fill").style.width = "100%"; $("clock").classList.remove("low");
      REVEAL_STAGE.banner(st.showdown ? "Final showdown · first correct answer wins" : null);
      if(!st.out) REVEAL_STAGE.countdown(null); else REVEAL_STAGE.cancelCountdown();
      drawAlive();
    } else if(st.phase==="play"){
      if(st.round!==playRound) startPlay();
      else if(prev!=="play"){ REVEAL_STAGE.cancelCountdown(); $("guess").value = ""; clearInterval(clockTimer); clockTimer = setInterval(drawClock, 200); }
      REVEAL_STAGE.banner(st.showdown ? "Final showdown · first correct answer wins" : null);
      updatePlay();
    } else if(st.phase==="reveal"){
      clearInterval(clockTimer); REVEAL_STAGE.cancelCountdown(); if(prev!=="reveal") show("reveal");
      $("answer").textContent = st.word;
      $("clueLine").innerHTML = `Clue: <em>${esc(st.hint||"")}</em>`;
      const sm = st.sum || { survived: st.alive, out: 0 };
      setHTML($("sumRow"), `<span><b>${sm.survived}</b>survived</span><span class="out"><b>${sm.out}</b>knocked out</span>`);
      const rm = $("revealMsg");
      rm.className = "big-msg " + (st.eliminated ? "bad" : st.out ? "" : "good");
      rm.textContent = st.eliminated ? "You're out!" : st.out ? "Spectating" : "You survived!";
      setHTML($("feed"), (st.feed||[]).map(f=>`<li>${f}</li>`).join(""));
      $("revealNote").textContent = st.finished ? "And that's the match…" : `${st.alive} still in. Next word coming up.`;
      if(prev!=="reveal" && st.eliminated && navigator.vibrate) try{ navigator.vibrate([60,40,60]); }catch(e){}
    } else if(st.phase==="over"){
      clearInterval(clockTimer); REVEAL_STAGE.cancelCountdown(); REVEAL_STAGE.banner(null);
      if(prev==="over") return;
      show("over");
      const won = st.place===1;
      if(!overCounted){   // count the match in your records (synced to your account next time the menu opens)
        overCounted = true;
        if(window.REVEAL_TRACK) REVEAL_TRACK.finish(tmode());
        const bump = k => store.set(k, String(+(store.get(k)||0)+1));
        bump("reveal-games"); bump("reveal-br-matches"); if(won) bump("reveal-br-wins");
      }
      $("place").textContent = ordinal(st.place);
      $("myTitle").textContent = won ? (st.coWin ? "SURVIVOR" : "LAST ONE STANDING") : st.place<=3 ? "SO CLOSE" : "KNOCKED OUT";
      $("winner").textContent = st.winner;
      $("overNote").textContent = `You finished ${ordinal(st.place)} of ${st.total}` + (st.outRound ? `, out in round ${st.outRound}.` : ".");
      const rl = $("rateLine"); rl.hidden = !ranked;
      if(ranked){
        if(st.rated && st.ratingAfter != null){
          const d = st.ratingAfter - st.ratingBefore, A = window.REVEAL_AUTH;
          rl.innerHTML = `Rating ${st.ratingBefore} → <b>${st.ratingAfter}</b> <span class="${d>=0?"up":"down"}">(${d>=0?"+":""}${d})</span> · ${A ? A.tier(st.ratingAfter) : ""}`;
        } else rl.textContent = "Not rated: a rated match needs 3 or more signed-in players.";
      }
      if(won && prev!=="over" && window.REVEAL_SFX) REVEAL_SFX.fanfare();
      shareText = won ? `REVEAL Battle Royale: I was the last one standing out of ${st.total}!` : `REVEAL Battle Royale: I finished ${ordinal(st.place)} of ${st.total}.`;
      $("hostNote2").hidden = true;
    }
  }
  function setHTML(el, html){ if(el._html!==html){ el._html = html; el.innerHTML = html; } }
  const ordinal = n => { const s=["th","st","nd","rd"], v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); };

  function drawLobby(){
    show("lobby");
    $("hostNote1").hidden = !isHost;
    const humans = st.players.filter(p=>!p.bot).length;
    let note = humans>1 ? `${humans} players found. Bots fill the empty seats when the match starts.` : "Waiting for more players. Bots fill the empty seats when the match starts.";
    if(ranked) note += humans>=3 ? " This match counts for rating." : ` ${3-humans} more signed-in player${3-humans>1?"s":""} and it counts for rating.`;
    $("lobbyNote").textContent = note;
    const now = new Set(st.players.map(p=>p.n));
    setHTML($("bubbles"), st.players.map(p=>`<span class="bub${p.n===myName?" mine":""}${lastBubbles.has(p.n)?"":" fresh"}">${avHTML(p)}${esc(p.n)}${p.bot?' <small>BOT</small>':""}</span>`).join(""));
    lastBubbles = now;
    lobbyEnds = performance.now() + st.startsIn*1000;
    clearInterval(lobbyTimer);
    const tickLobby = ()=>{ $("lobbyClock").textContent = Math.max(0, Math.ceil((lobbyEnds-performance.now())/1000)); };
    tickLobby(); lobbyTimer = setInterval(tickLobby, 250);
  }

  function drawAlive(){
    if(!st.players) return;
    setHTML($("alive"), st.players.map(p=>avHTML(p, (p.out?" x":p.l?" ok":"")+(p.n===myName?" mine":""))).join(""));
  }

  function startPlay(){
    show("play"); playRound = st.round;
    const n = st.len;
    $("tiles").style.setProperty("--fit", `min(46px, calc((min(100vw, 520px) - 80px) / ${n} - 6px))`);
    $("play").toggleAttribute("data-long", n>=10);
    $("tiles").innerHTML = Array.from({length:n}, ()=>`<div class="t"><div class="in"><div class="f"></div><div class="b"></div></div></div>`).join("");
    $("hint").textContent = st.hint;
    $("guess").value = ""; $("msg").textContent = ""; $("msg").className = "msg";
    $("guess").placeholder = "";
    clearInterval(clockTimer); clockTimer = setInterval(drawClock, 200);
  }
  function updatePlay(){
    deadline = performance.now() + st.left*1000;
    $("roundLbl").textContent = `Round ${st.round} · ${st.alive} of ${st.total} left`;
    const tiles = $("tiles").children;
    [...st.pattern].forEach((ch,i)=>{ if(ch!=="_" && tiles[i] && !tiles[i].classList.contains("open")){ tiles[i].querySelector(".b").textContent=ch; tiles[i].classList.add("open"); }});
    const locked = st.out || st.correct || st.failed;
    $("guess").disabled = locked; $("guessBtn").disabled = locked;
    if(st.out){ $("msg").className="msg"; $("msg").textContent="You're out. Watching the rest of the match."; }
    else if(st.correct){ $("msg").className="msg good"; if(!$("msg").textContent) $("msg").textContent="You got it! Waiting for the others."; }
    else if(st.failed){ $("msg").className="msg bad"; $("msg").textContent="Wrong! You're out after this round."; }
    else if(document.activeElement!==$("guess")) $("guess").focus({preventScroll:true});
    $("lockLine").innerHTML = st.out ? "" : `<b>${st.locked||0}</b> of ${st.alive} locked in`;
    drawAlive(); drawClock();
  }
  function drawClock(){
    const left = Math.max(0,(deadline-performance.now())/1000);
    $("clock").textContent = Math.ceil(left);
    const low = left<=5; $("clock").classList.toggle("low",low); $("bar").classList.toggle("low",low);
    $("fill").style.width = (st && st.T ? left/st.T*100 : 0) + "%";
  }
  function onResult(r){
    const m = $("msg"), inp = $("guess");
    inp.disabled = true; $("guessBtn").disabled = true;
    if(r.ok){ st.correct = true; m.className = "msg good"; m.textContent = r.first ? "Correct, and first!" : "Correct! You're safe if you're not the slowest."; }
    else { st.failed = true; m.className = "msg bad"; m.textContent = "Wrong! You're out after this round."; inp.classList.remove("shake"); void inp.offsetWidth; inp.classList.add("shake"); }
  }

  $("guessForm").addEventListener("submit", e=>{
    e.preventDefault();
    if(!st || st.phase!=="play" || $("guess").disabled) return;
    const g = $("guess").value.trim(); if(!g) return;
    $("guess").disabled = true; $("guessBtn").disabled = true;
    send({t:"guess", g});
  });
  let shareText = "", overCounted = false;
  $("shareBtn").addEventListener("click", e=>REVEAL_END.share(shareText + "\nThink fast. Guess faster.", e.currentTarget));
  addEventListener("DOMContentLoaded", ()=>$("shareBtn").after(REVEAL_END.bar(()=>shareText + "\nThink fast. Guess faster.")));

  // ============ MATCHMAKING ============
  let peers = [], searching = false, conn = null;
  function teardown(){
    if(ranked){ clearTimeout(ranked.timer); ranked = null; }
    searching = false; conn = null; isHost = false; H = null;
    clearInterval(clockTimer); clearInterval(lobbyTimer); clearInterval(hostTimer);
    peers.forEach(p=>{ try{ p.destroy(); }catch(e){} }); peers = [];
    send = () => {}; st = null; playRound = -1; lastBubbles = new Set();
    try{ REVEAL_STAGE.cancelCountdown(); REVEAL_STAGE.banner(null); }catch(e){}
  }
  function findErr(t){ show("find"); $("findErr").hidden = !t; $("findErr").textContent = t||""; }
  function newPeer(id){ const p = new Peer(id, NET.opts); peers.push(p); return p; }
  function drop(p){ try{ p.destroy(); }catch(e){} peers = peers.filter(x=>x!==p); }

  $("findForm").addEventListener("submit", e=>{
    e.preventDefault();
    const name = $("nameIn").value.trim().replace(/\s+/g," ");
    if(!name) return findErr("Enter your name so others know who's winning.");
    store.set("reveal-name", name); myName = name;
    find();
  });
  $("cancelBtn").addEventListener("click", ()=>{ leaveRanked(); findErr(""); });
  $("againBtn").addEventListener("click", ()=>{ teardown(); find(); });
  $("lostBtn").addEventListener("click", ()=>{ teardown(); find(); });

  function find(){
    if(rankedOn()) return findRanked();
    teardown(); searching = true; show("searching"); $("findErr").hidden = true;
    $("searchNote").textContent = "Looking for players online.";
    trySlot(0);
  }

  // Try to join the lobby at this slot; if nobody holds it, claim it and host.
  function trySlot(slot){
    if(!searching) return;
    if(slot >= SLOTS) return findErr("Couldn't find or open a lobby. Check your internet and try again.");
    const id = BEACON + slot;
    const claim = newPeer(id);
    claim.on("open", ()=>{ if(searching) becomeHost(claim, slot); else drop(claim); });
    claim.on("error", err=>{
      drop(claim);
      if(!searching) return;
      if(err.type==="unavailable-id") joinBeacon(slot);
      else findErr("Couldn't reach the match server (" + err.type + "). Check your internet and try again.");
    });
  }

  // Someone holds the beacon: ask it for the host's game id.
  function joinBeacon(slot){
    const me = newPeer();
    let done = false;
    const next = () => { if(done) return; done = true; drop(me); trySlot(slot+1); };
    const giveUp = setTimeout(next, 6000);
    me.on("open", ()=>{
      const c = me.connect(BEACON + slot, {reliable:true});
      c.on("open", ()=>c.send({t:"seek"}));
      c.on("data", m=>{
        if(done) return;
        if(m.t==="host"){ done = true; clearTimeout(giveUp); try{ c.close(); }catch(e){} joinGame(me, m.id, slot); }
        else if(m.t==="full") { clearTimeout(giveUp); next(); }
      });
    });
    me.on("error", err=>{ if(!done && (err.type==="peer-unavailable")){ clearTimeout(giveUp); done = true; drop(me); trySlot(slot); } else if(!done && !conn){ clearTimeout(giveUp); next(); } });
  }

  function joinGame(me, hostId, slot){
    $("searchNote").textContent = "Lobby found. Joining…";
    const c = me.connect(hostId, {reliable:true});
    let joined = false;
    const giveUp = setTimeout(()=>{ if(!joined){ drop(me); trySlot(slot+1); } }, 8000);
    c.on("open", ()=>c.send({t:"hello", name:myName, token, av:myAv}));
    c.on("data", m=>{
      if(m.t==="full"){ clearTimeout(giveUp); drop(me); return trySlot(slot+1); }
      if(m.t==="welcome"){ joined = true; clearTimeout(giveUp); searching = false; conn = c; myName = m.name; send = x=>{ try{ c.send(x); }catch(e){} }; return; }
      if(joined) onMsg(m);
    });
    c.on("close", ()=>{ if(joined && conn===c && !(st && st.phase==="over")) hostLost(); });
    me.on("disconnected", ()=>{ try{ me.reconnect(); }catch(e){} });
  }
  // ============ RANKED (server-run) ============
  let ranked = null;
  const AU = window.REVEAL_AUTH;
  const rankedOn = () => { const s = AU && AU.state(); return !!(s && s.profile); };
  function paintFind(s){
    const p = s && s.profile;
    $("rankedBox").hidden = !p; $("findForm").hidden = !!p; $("guestNote").hidden = !!p;
    $("modeTag").textContent = p ? "Ranked" : "Unranked";
    if(p){
      $("rkName").textContent = "@" + p.username;
      $("rkRating").textContent = `Rating ${p.rating ?? 1000} · ${AU.tier(p.rating ?? 1000)}`;
      $("rkAv").innerHTML = okAv(p.avatar) ? AVS.svg(p.avatar) : "";
    }
  }
  if(AU) AU.on(paintFind);
  $("rankedBtn").addEventListener("click", ()=>find());

  // ---- players online (supabase/online.sql) ----
  // Every open page says "I'm here" about every 20 s with a random id that isn't tied to the player, and gets back
  // how many people are on this page, how many signed-in players are waiting in a ranked lobby or playing ranked,
  // and when the open ranked lobby starts. If the SQL hasn't been run yet the strip just stays hidden.
  let pulseId = store.get("reveal-pulse");
  if(!/^[a-z0-9]{10,40}$/.test(pulseId||"")){ pulseId = Array.from({length:20},()=>"abcdefghijklmnopqrstuvwxyz0123456789"[Math.random()*36|0]).join(""); store.set("reveal-pulse", pulseId); }
  let live = null, liveStarts = 0, pulseTimer = 0, pulseTick = 0;
  async function pulse(){
    clearTimeout(pulseTimer);
    pulseTimer = setTimeout(pulse, 20000);
    if(document.hidden || !AU || !AU.state().available) return;
    const { data, error } = await AU.rpc("rk_activity", { me:pulseId });
    if(error || !data || typeof data.online !== "number") return;
    live = data; liveStarts = data.starts != null ? performance.now() + data.starts*1000 : 0;
    drawPulse();
  }
  function drawPulse(){
    clearInterval(pulseTick);
    if(!live) return;
    $("pulse").hidden = false;
    const n = Math.max(1, live.online);   // you're online too
    setHTML($("plOnline"), n===1 ? "<b>1</b> player online now" : `<b>${n}</b> players online now`);
    const sub = $("plRanked");
    sub.hidden = !rankedOn();
    if(sub.hidden) return;
    const paint = ()=>{
      const left = liveStarts ? Math.ceil((liveStarts - performance.now())/1000) : 0;
      const w = live.waiting, pl = live.playing, parts = [];
      if(w > 0 && left > 1){
        parts.push(`<b>${w}</b> waiting in a ranked lobby. Next match starts in <b>${left} s</b>.`);
        if(w >= 2) parts.push("Join now and it counts for rating.");
      } else {
        parts.push("No ranked lobby open right now. Join and yours starts in 20 s.");
      }
      if(pl > 0) parts.push(`<b>${pl}</b> playing ranked now.`);
      setHTML(sub, parts.join(" "));
    };
    paint();
    if(liveStarts) pulseTick = setInterval(paint, 1000);
  }
  document.addEventListener("visibilitychange", ()=>{ if(!document.hidden) pulse(); });

  // Ranked Hour (daily.js): every day at the same time, so ranked players meet each other instead of bots.
  function paintRH(){
    const RH = window.REVEAL_RANKED_HOUR, el = $("rhLine"); if(!RH){ el.hidden = true; return; }
    const i = RH.info(); el.hidden = false; el.classList.toggle("live", i.live);
    setHTML(el, i.live
      ? `<b>Ranked Hour is live.</b> Most ranked players are on now, for another ${RH.span(i.endsIn)}.`
      : `<b>Ranked Hour:</b> every day at ${RH.clock(i.at)} (your time) for an hour. Most players join then${i.startsIn <= 3*3600000 ? `. Starts in ${RH.span(i.startsIn)}.` : "."}`);
  }
  paintRH(); setInterval(paintRH, 30000);
  if(AU) AU.on(()=>drawPulse());
  pulse();

  async function findRanked(){
    teardown(); show("searching"); $("findErr").hidden = true;
    $("searchNote").textContent = "Finding a ranked match…";
    myName = AU.state().profile.username;
    const seq = ++joinSeq;
    const { data, error } = await AU.rpc("rk_join");
    if(seq !== joinSeq){ if(data) AU.rpc("rk_leave", { m:data }); return; }   // cancelled while joining
    if(error || !data) return findErr(error ? error.message : "Couldn't reach the ranked server. Try again.");
    ranked = { mid:data, fails:0, timer:0 };
    send = m => { if(m && m.t==="guess") rankedGuess(m.g); };
    poll();
  }
  // Exit / Cancel: tell the server, so the next search finds a fresh lobby instead of putting you back in this one.
  let joinSeq = 0;
  function leaveRanked(){
    joinSeq++;
    const mid = ranked && !(st && st.phase === "over") ? ranked.mid : null;
    teardown();
    return mid ? Promise.race([AU.rpc("rk_leave", { m:mid }), new Promise(r=>setTimeout(r, 1500))]) : Promise.resolve();
  }
  async function poll(){
    const r = ranked; if(!r) return;
    clearTimeout(r.timer);
    const { data, error } = await AU.rpc("rk_state", { m:r.mid });
    if(r !== ranked) return;
    if(error || !data){
      if(++r.fails >= 6) return rankedLost();
    } else {
      r.fails = 0; onMsg(data);
      if(data.phase === "over"){ AU.syncStats(); AU.reloadProfile(); return; }
    }
    r.timer = setTimeout(poll, data && data.phase === "lobby" ? 1000 : 500);
  }
  async function rankedGuess(g){
    const r = ranked; if(!r) return;
    const { data, error } = await AU.rpc("rk_guess", { m:r.mid, g });
    if(r !== ranked) return;
    if(error || !data){ $("guess").disabled = false; $("guessBtn").disabled = false; $("msg").className = "msg bad"; $("msg").textContent = "Couldn't send your answer. Try again."; }
    else if(!data.late) onMsg(data);
    poll();
  }
  function rankedLost(){
    if(ranked){ clearTimeout(ranked.timer); ranked = null; }
    $("lostTitle").textContent = "Lost connection to the match.";
    $("lostNote").textContent = "Check your internet. If the match is still going, Find a match puts you back in.";
    hostLost(true);
  }

  function hostLost(keepText){
    if(!keepText){ $("lostTitle").textContent = "The match host left."; $("lostNote").textContent = "This unranked match ran on one player's phone. Find a new match to keep playing."; }
    clearInterval(clockTimer); clearInterval(lobbyTimer);
    try{ REVEAL_STAGE.cancelCountdown(); REVEAL_STAGE.banner(null); }catch(e){}
    ["find","searching","lobby","play","reveal","over"].forEach(s=>$(s).hidden = true);
    $("lost").hidden = false;
  }

  // ============ HOST ============
  let H = null, hostTimer = 0;
  function becomeHost(beacon, slot){
    searching = false; isHost = true;
    $("searchNote").textContent = "Opening a new lobby…";
    const game = newPeer();
    H = { beacon, game, phase:"lobby", players:[], nextId:1, startAt:performance.now()+LOBBY_SECS*1000, round:0, words:[], cur:null, total:0 };
    const meP = { id:0, name:myName, bot:false, local:true, out:false, av:myAv };
    H.players.push(meP);
    send = m => hostHandle(meP, m);
    beacon.on("connection", c=>{
      c.on("data", m=>{ if(m && m.t==="seek") try{ c.send(H && H.phase==="lobby" && H.players.length<MAX && game.id ? {t:"host", id:game.id} : {t:"full"}); }catch(e){} });
    });
    beacon.on("disconnected", ()=>{ if(H && H.phase==="lobby") try{ beacon.reconnect(); }catch(e){} });
    game.on("connection", c=>{
      c.on("data", m=>{
        if(!H) return;
        if(m && m.t==="hello"){
          if(H.phase!=="lobby" || H.players.length>=MAX){ try{ c.send({t:"full"}); }catch(e){} return; }
          const p = { id:H.nextId++, name:uniqueName(String(m.name||"Player").slice(0,14)), bot:false, conn:c, out:false, av: okAv(m.av) ? m.av : null };
          H.players.push(p);
          c.send({t:"welcome", name:p.name});
          c.on("close", ()=>{ p.gone = true; if(H && H.phase==="lobby"){ H.players = H.players.filter(x=>x!==p); syncAll(); } else if(H) checkRoundEnd(); });
          syncAll();
          if(H.players.length>=MAX) H.startAt = performance.now();
        } else {
          const p = H.players.find(x=>x.conn===c); if(p) hostHandle(p, m);
        }
      });
    });
    game.on("open", ()=>{ syncAll(); });
    game.on("disconnected", ()=>{ try{ game.reconnect(); }catch(e){} });
    game.on("error", err=>{ if(H && H.phase==="lobby" && !game.open) findErr("Couldn't open a lobby (" + err.type + "). Try again."); });
    hostTimer = setInterval(hostTick, 100);
    syncAll();
  }
  function uniqueName(n){
    n = n.trim() || "Player"; let out = n, k = 2;
    const taken = new Set(H.players.map(p=>p.name.toLowerCase()));
    while(taken.has(out.toLowerCase())) out = `${n} ${k++}`;
    return out;
  }
  const alivePlayers = () => H.players.filter(p=>!p.out);

  function hostHandle(p, m){
    if(!H || !m) return;
    if(m.t==="guess") onGuess(p, String(m.g||""));
  }

  function startMatch(){
    try{ H.beacon.destroy(); }catch(e){}       // let the next searcher open a new lobby
    if(!NOBOTS){
      const names = shuffle(BOT_NAMES.slice()).filter(n=>!H.players.some(p=>p.name.toLowerCase()===n.toLowerCase()));
      while(H.players.length < Math.max(FILL, 2) && names.length){
        const skill = .3 + Math.random()*.6;
        const bn = names.pop(), bid = bn.toLowerCase();
        H.players.push({ id:H.nextId++, name:bn, bot:true, skill, out:false, av: okAv(bid) ? bid : AVS ? AVS.LIST[Math.floor(Math.random()*AVS.LIST.length)][0] : null });
      }
    }
    H.total = H.players.length;
    H.words = shuffle(pickWords(60, "mixed").slice());   // unranked: everyday words (ranked words live on the server)
    H.round = 0;
    nextRound();
  }

  function nextRound(){
    if(H.round >= H.words.length) return gameOver();
    const [word, hint] = H.words[H.round]; H.round++;
    const n = word.length;
    H.cur = { word, hint, n, order:shuffle([...Array(n).keys()]), shown:0, open:Array(n).fill(false),
      start:0, ended:false, showdown: alivePlayers().length===2 };
    H.players.forEach(p=>{ p.rd = { correct:false, failed:false, at:0, elim:false }; if(p.bot && !p.out) planBot(p); });
    H.phase = "countdown"; H.phaseEnds = performance.now() + 3400;
    syncAll();
  }

  // A bot decides up front when it will answer and whether it gets it right.
  function planBot(p){
    const c = H.cur, s = p.skill, r = Math.random();
    const miss = .04 + (1-s)*.12, wrong = .04 + (1-s)*.08;
    p.plan = r < miss ? null : { right: r >= miss + wrong,
      // fraction of the clock used: skilled bots answer earlier; long words take a little longer
      at: Math.min(.97, .18 + (1-s)*.45 + Math.random()*.32 + Math.max(0,c.n-7)*.015) * T };
  }

  function pattern(){ const c = H.cur; return [...c.word].map((ch,i)=>c.open[i]?ch:"_").join(""); }
  function timeLeft(){ return H.cur && H.phase==="play" ? Math.max(0, T-(performance.now()-H.cur.start)/1000) : T; }

  function hostTick(){
    if(!H) return;
    const now = performance.now();
    if(H.phase==="lobby"){
      if(now >= H.startAt) startMatch();
      return;
    }
    if(H.phase==="countdown" && now >= H.phaseEnds){ H.phase = "play"; H.cur.start = now; syncAll(); return; }
    if(H.phase==="play"){
      const c = H.cur, el = (now - c.start)/1000, step = T/c.n;
      const target = Math.min(c.n-1, Math.floor(el/step));
      let changed = false;
      while(c.shown < target){ c.open[c.order[c.shown]] = true; c.shown++; changed = true; }
      H.players.forEach(p=>{ if(p.bot && !p.out && p.plan && !p.rd.correct && !p.rd.failed && el >= p.plan.at) onGuess(p, p.plan.right ? c.word : "X"); });
      if(H.phase!=="play" || c.ended) return;
      if(el >= T) return endRound();
      if(changed || now - (H.lastSync||0) > 1000) syncAll();
      return;
    }
    if(H.phase==="reveal" && now >= H.phaseEnds){ H.finished ? gameOver() : nextRound(); }
  }

  function onGuess(p, raw){
    const c = H.cur;
    if(H.phase!=="play" || !c || c.ended || p.out || p.rd.correct || p.rd.failed) return;
    const g = raw.toUpperCase().replace(/[^A-Z]/g,""); if(!g) return;
    if(g===c.word){
      const first = !alivePlayers().some(x=>x.rd.correct);
      p.rd.correct = true; p.rd.at = performance.now();
      reply(p, {t:"result", ok:true, first});
      if(c.showdown) return endRound();
    } else {
      p.rd.failed = true;
      reply(p, {t:"result", ok:false, out:true});
    }
    syncAll(); checkRoundEnd();
  }
  function checkRoundEnd(){
    if(!H || H.phase!=="play" || H.cur.ended) return;
    const act = alivePlayers().filter(p=>!p.gone);
    if(act.every(p=>p.rd.correct || p.rd.failed)) endRound();
  }

  function endRound(){
    const c = H.cur; if(c.ended) return; c.ended = true;
    const contenders = alivePlayers();
    const correct = contenders.filter(p=>p.rd.correct).sort((a,b)=>a.rd.at-b.rd.at);
    const feed = [];
    H.sum = { survived: contenders.length, out: 0 };
    if(!correct.length){
      feed.push("Nobody got it, so everyone stays in.");
    } else {
      const losers = contenders.filter(p=>!p.rd.correct);
      const slow = correct.length>=2 && !c.showdown ? correct[correct.length-1] : null;
      if(slow) losers.push(slow);
      const aliveAfter = contenders.length - losers.length;
      losers.forEach(p=>{ p.out = true; p.rd.elim = true; p.outRound = H.round; p.place = aliveAfter + 1; });
      H.sum = { survived: aliveAfter, out: losers.length };
      if(c.showdown) feed.push(`<b>${esc(correct[0].name)}</b> answered first and wins the showdown!`);
      const missed = losers.filter(p=>p!==slow && !p.rd.failed), wrong = losers.filter(p=>p.rd.failed);
      if(wrong.length) feed.push(`Wrong answer: ${list(wrong)}`);
      if(missed.length && !c.showdown) feed.push(`Out of time: ${list(missed)}`);
      if(slow) feed.push(`Slowest correct: ${list([slow])}`);
      if(!losers.length) feed.push("Everyone survives.");
    }
    const left = alivePlayers();
    H.finished = left.length<=1 || H.round>=H.words.length;
    H.feed = feed;
    H.phase = "reveal"; H.phaseEnds = performance.now() + REVEAL_SECS*1000;
    syncAll();
  }
  const list = ps => ps.slice(0,6).map(p=>`<b>${esc(p.name)}</b>`).join(", ") + (ps.length>6 ? ` +${ps.length-6} more` : "");

  function gameOver(){
    H.phase = "over"; clearInterval(hostTimer);
    const alive = alivePlayers();
    alive.forEach(p=>p.place = 1);
    H.winner = alive.length===1 ? `${alive[0].name} is the last one standing!` : alive.length ? `${alive.map(p=>p.name).join(" & ")} survive!` : "No one survived!";
    syncAll();
    // keep connections open a little so everyone receives the result, then close the match
    setTimeout(()=>{ H && H.players.forEach(p=>{ if(p.conn) try{ p.conn.close(); }catch(e){} }); }, 4000);
  }

  function viewFor(p){
    const c = H.cur;
    const base = { t:"state", phase:H.phase, total:H.total || H.players.length, alive:alivePlayers().length, T,
      // "l" = locked in (answered, right or wrong). Correctness stays hidden until the round ends.
      players: H.players.map(x=>({ n:x.name, a:x.av||null, bot:!!x.bot, out:!!x.out, l:!!(x.rd && (x.rd.correct || x.rd.failed) && H.phase==="play") })),
      locked: H.phase==="play" ? alivePlayers().filter(x=>x.rd && (x.rd.correct || x.rd.failed)).length : 0 };
    if(H.phase==="lobby") return Object.assign(base, { startsIn: Math.max(0,(H.startAt-performance.now())/1000) });
    if(H.phase==="over") return Object.assign(base, { place:p.place||1, outRound:p.outRound||0, winner:H.winner, coWin: alivePlayers().length>1 });
    return Object.assign(base, {
      round:H.round, len:c.n, hint:c.hint, pattern:pattern(), left:timeLeft(), showdown:c.showdown,
      out: !!p.out,
      correct: !!(p.rd && p.rd.correct), failed: !!(p.rd && p.rd.failed),
      eliminated: !!(p.rd && p.rd.elim), word: H.phase==="reveal" ? c.word : undefined,
      feed: H.phase==="reveal" ? H.feed : undefined, sum: H.phase==="reveal" ? H.sum : undefined, finished: !!H.finished
    });
  }
  function reply(p, m){
    if(p.local) setTimeout(()=>onMsg(m), 0);
    else if(p.conn && !p.gone) try{ p.conn.send(m); }catch(e){}
  }
  function syncAll(){
    if(!H) return;
    H.lastSync = performance.now();
    H.players.forEach(p=>{ if(!p.bot) reply(p, viewFor(p)); });
  }

  // test hook
  window.REVEAL_ONLINE = { get host(){ return H; }, get state(){ return st; }, leave: ()=>leaveRanked() };
})();

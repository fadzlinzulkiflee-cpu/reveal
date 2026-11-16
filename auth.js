// REVEAL accounts: Google sign-in through Supabase Auth, plus a public profile (unique player name + avatar)
// and personal records saved to the account. Guests never need this: every mode except ranked works signed out.
// Only the public publishable key is used (from REVEAL_CONFIG in daily.js). Database setup: supabase/accounts.sql.
window.REVEAL_AUTH = (function(){
  const C = window.REVEAL_CONFIG || {};
  const listeners = [];
  const S = { user:null, profile:null, loaded:false };
  const sb = (window.supabase && C.supabaseUrl && C.supabaseKey)
    ? window.supabase.createClient(C.supabaseUrl, C.supabaseKey, { auth:{ flowType:"pkce", persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, storageKey:"reveal-auth" } })
    : null;

  // Player names: 3 to 14 characters, lowercase letters, numbers and underscore. Same rule in the database.
  const BLOCK = ["fuck","shit","cunt","bitch","nigg","fagg","slut","whore","rape","nazi","porn","dick","penis","vagina","anal",
                 "puki","pukimak","babi","sial","kontol","pantat","lancau","butoh","bangsat","keparat","jubur",
                 "admin","moderator","reveal"];
  function nameProblem(n){
    if(!n) return "Pick a player name.";
    if(n.length < 3) return "At least 3 characters.";
    if(n.length > 14) return "14 characters at most.";
    if(!/^[a-z0-9_]+$/.test(n)) return "Use only letters, numbers and _.";
    if(BLOCK.some(w=>n.replace(/_/g,"").includes(w))) return "Please pick a different name.";
    return "";
  }
  const clean = n => String(n||"").trim().toLowerCase().replace(/^@/,"");

  function emit(){ listeners.forEach(f=>{ try{ f(state()); }catch(e){ console.error(e); } }); }
  function state(){ return { available:!!sb, loaded:S.loaded, user:S.user, profile:S.profile, needsProfile:!!(S.user && S.loaded && !S.profile) }; }

  async function loadProfile(){
    if(!sb || !S.user){ S.profile = null; return; }
    const { data, error } = await sb.from("profiles").select("username,avatar,stats,rating").eq("id", S.user.id).maybeSingle();
    if(!error) S.profile = data || null;
  }
  async function refresh(user){
    const changed = (user && user.id) !== (S.user && S.user.id);
    S.user = user || null;
    if(changed || !S.loaded){ await loadProfile(); }
    S.loaded = true; emit();
  }

  const ready = (async()=>{
    if(!sb){ S.loaded = true; emit(); return; }
    try{
      const { data } = await sb.auth.getSession();
      await refresh(data.session && data.session.user);
    }catch(e){ S.loaded = true; emit(); }
    sb.auth.onAuthStateChange((ev, session)=>{ setTimeout(()=>refresh(session && session.user), 0); });
    // tidy the address bar after the Google redirect
    if(/[?&](code|error)=/.test(location.search)){ history.replaceState(null, "", location.pathname + location.hash); }
  })();

  async function signIn(){
    if(!sb) return { ok:false, msg:"Sign-in isn't available right now." };
    const { error } = await sb.auth.signInWithOAuth({ provider:"google", options:{ redirectTo: location.origin + location.pathname } });
    return error ? { ok:false, msg:error.message } : { ok:true };
  }
  async function signOut(){ if(sb) await sb.auth.signOut(); S.user = null; S.profile = null; emit(); }

  async function nameFree(n){
    n = clean(n);
    if(nameProblem(n) || !sb) return false;
    const { data, error } = await sb.from("profiles").select("id").eq("username", n).maybeSingle();
    if(error) return null;                          // unknown (offline): let the save decide
    return !data || (S.user && data.id === S.user.id);
  }
  async function saveProfile({ username, avatar }){
    if(!sb || !S.user) return { ok:false, msg:"Sign in first." };
    username = clean(username);
    const bad = nameProblem(username); if(bad) return { ok:false, msg:bad };
    if(!window.REVEAL_AVATARS || !REVEAL_AVATARS.has(avatar)) avatar = "nova";
    const row = { username, avatar, updated_at:new Date().toISOString() };
    const q = S.profile
      ? sb.from("profiles").update(row).eq("id", S.user.id)
      : sb.from("profiles").insert(Object.assign({ id:S.user.id, stats:localStats() }, row));
    const { error } = await q;
    if(error) return { ok:false, msg: error.code === "23505" ? "That name is taken. Try another." : "Couldn't save right now. Try again." };
    await loadProfile(); emit();
    return { ok:true };
  }

  // Records follow the account: fastest correct answer, longest streak, total correct, games, best score,
  // online Battle Royale matches and wins.
  const store = { get(k){try{return localStorage.getItem(k)}catch(e){return null}}, set(k,v){try{localStorage.setItem(k,v)}catch(e){}} };
  const KEYS = { fastest:"reveal-rec-fastest", streak:"reveal-rec-streak", correct:"reveal-rec-correct", games:"reveal-games", best:"reveal-best", matches:"reveal-br-matches", wins:"reveal-br-wins" };
  function localStats(){
    const o = {};
    Object.entries(KEYS).forEach(([k,key])=>{ const v = parseFloat(store.get(key)); if(isFinite(v)) o[k] = v; });
    return o;
  }
  function merge(a, b){
    const o = Object.assign({}, a);
    Object.entries(b||{}).forEach(([k,v])=>{
      if(typeof v !== "number" || !isFinite(v)) return;
      o[k] = o[k] === undefined ? v : k === "fastest" ? Math.min(o[k], v) : Math.max(o[k], v);
    });
    return o;
  }
  async function syncStats(){
    if(!sb || !S.user || !S.profile) return null;
    const merged = merge(localStats(), S.profile.stats || {});
    Object.entries(merged).forEach(([k,v])=>store.set(KEYS[k], k === "fastest" ? v.toFixed(2) : String(v)));
    if(JSON.stringify(merged) !== JSON.stringify(S.profile.stats || {})){
      const { error } = await sb.from("profiles").update({ stats:merged, updated_at:new Date().toISOString() }).eq("id", S.user.id);
      if(!error) S.profile.stats = merged;
    }
    return merged;
  }
  async function token(){
    if(!sb) return null;
    const { data } = await sb.auth.getSession();
    return data.session ? data.session.access_token : null;
  }

  return { ready, state, on(f){ listeners.push(f); f(state()); }, signIn, signOut, nameFree, saveProfile, nameProblem, clean, syncStats, token };
})();

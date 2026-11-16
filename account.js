// REVEAL account sheet on the home screen: Sign in chip, Google button, first-login profile, records, sign out.
(function(){
  const A = window.REVEAL_AUTH, AV = window.REVEAL_AVATARS, $ = id => document.getElementById(id);
  if(!A || !AV) return;
  const dlg = $("account");
  let picked = "nova", checkT = 0, editing = false, prompted = false;

  $("acAvatars").innerHTML = AV.LIST.map(([id,name])=>
    `<label class="avopt"><input type="radio" name="av" value="${id}"><span>${AV.svg(id)}</span><small>${name}</small></label>`).join("");
  $("acAvatars").addEventListener("change", e=>{ picked = e.target.value; });

  function open(){ if(dlg.showModal){ if(!dlg.open) dlg.showModal(); } else dlg.setAttribute("open",""); }
  function close(){ if(dlg.close) dlg.close(); else dlg.removeAttribute("open"); editing = false; paint(A.state()); }

  function recordsHTML(st){
    const s = st || {}, cell = (v,k)=>`<div><b>${v}</b><span>${k}</span></div>`;
    return cell(isFinite(s.fastest) ? (+s.fastest).toFixed(1)+"s" : "–","Fastest") + cell(s.streak||0,"Streak") + cell(s.correct||0,"Correct") + cell(s.games||0,"Games");
  }
  function showPane(id){ ["acOut","acEdit","acIn"].forEach(p=>$(p).hidden = p!==id); }

  function paint(st){
    const btn = $("acctBtn");
    btn.hidden = !st.available || !st.loaded;
    const p = st.profile;
    if(p){
      $("acctAv").innerHTML = AV.svg(p.avatar); $("acctAv").hidden = false; $("acctLbl").textContent = "@" + p.username;
      btn.setAttribute("aria-label", "Your account, @" + p.username);
    } else {
      $("acctAv").innerHTML = ""; $("acctAv").hidden = true; $("acctLbl").textContent = st.user ? "Finish profile" : "Sign in";
      btn.removeAttribute("aria-label");
    }
    btn.classList.toggle("in", !!p);
    if(editing || st.needsProfile){
      showPane("acEdit");
      $("acTitle").textContent = p ? "Edit profile" : "Welcome to REVEAL";
      $("acEditLead").textContent = p ? "Change your player name or avatar." : "Pick the name other players will see. You can change it later.";
      $("acClose").textContent = p ? "Cancel" : "Later";
    } else if(p){
      showPane("acIn"); $("acTitle").textContent = "Your account"; $("acClose").textContent = "Done";
      $("acMeAv").innerHTML = AV.svg(p.avatar);
      $("acMeName").textContent = "@" + p.username;
      $("acMeSub").textContent = `Rating ${p.rating ?? 1000} · ranked play coming soon`;
      $("acRecords").innerHTML = recordsHTML(p.stats);
    } else { showPane("acOut"); $("acTitle").textContent = "Sign in"; $("acClose").textContent = "Close"; }
    // First time back from Google: ask for a player name right away
    if(st.needsProfile && !prompted){ prompted = true; startEdit(); open(); }
  }

  function startEdit(){
    const p = A.state().profile;
    editing = true; picked = p ? p.avatar : AV.LIST[Math.floor(Math.random()*AV.LIST.length)][0];
    const r = document.querySelector(`#acAvatars input[value="${picked}"]`); if(r) r.checked = true;
    $("acName").value = p ? p.username : "";
    nameMsg(p ? "" : "3 to 14 letters, numbers or _", "");
    paint(A.state());
  }
  function nameMsg(text, kind){ const m = $("acNameMsg"); m.textContent = text || "3 to 14 letters, numbers or _"; m.className = "ac-namemsg " + (kind||""); }

  $("acName").addEventListener("input", ()=>{
    const el = $("acName"), v = A.clean(el.value).replace(/[^a-z0-9_]/g,"");
    if(el.value !== v) el.value = v;
    const bad = A.nameProblem(v);
    clearTimeout(checkT);
    if(bad){ nameMsg(v ? bad : "", v ? "bad" : ""); return; }
    nameMsg("Checking…", "");
    checkT = setTimeout(async()=>{
      const free = await A.nameFree(v);
      if(A.clean($("acName").value) !== v) return;
      nameMsg(free === false ? "That name is taken." : free ? `@${v} is available.` : "", free === false ? "bad" : free ? "good" : "");
    }, 350);
  });
  $("acEdit").addEventListener("submit", async e=>{
    e.preventDefault();
    $("acSave").disabled = true; nameMsg("Saving…","");
    const res = await A.saveProfile({ username:$("acName").value, avatar:picked });
    $("acSave").disabled = false;
    if(!res.ok){ nameMsg(res.msg, "bad"); return; }
    editing = false; await A.syncStats(); paint(A.state());
    if(typeof applyUI === "function") applyUI();
  });

  $("acctBtn").addEventListener("click", ()=>{ editing = A.state().needsProfile; if(editing) startEdit(); else paint(A.state()); open(); });
  $("acClose").addEventListener("click", ()=>{
    if(editing && A.state().profile){ editing = false; paint(A.state()); return; }   // Cancel edit: back to the account view
    close();
  });
  dlg.addEventListener("close", ()=>{ editing = false; });
  $("acGoogle").addEventListener("click", async ()=>{
    $("acGoogle").disabled = true; $("acErr").hidden = true;
    const res = await A.signIn();
    if(!res.ok){ $("acGoogle").disabled = false; $("acErr").textContent = res.msg; $("acErr").hidden = false; }
  });
  $("acEditBtn").addEventListener("click", startEdit);
  $("acOutBtn").addEventListener("click", async ()=>{ await A.signOut(); close(); });

  let lastUser = null;
  A.on(async st=>{
    paint(st);
    const uid = st.user && st.user.id;
    if(st.profile){ try{ localStorage.setItem("reveal-name", st.profile.username); }catch(e){} }   // online match name
    if(st.profile && uid !== lastUser){ lastUser = uid; await A.syncStats(); if(typeof applyUI === "function") applyUI(); if(window.REVEAL_DAILY_CLAIM) REVEAL_DAILY_CLAIM(); }
    if(!uid) lastUser = null;
  });
})();

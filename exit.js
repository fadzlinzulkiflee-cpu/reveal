// REVEAL Exit: a small "Exit" button for game screens and a calm confirm sheet.
// REVEAL_EXIT.ask({title, body, ok}) resolves true when the player confirms.
// REVEAL_EXIT.button(onClick) returns a ready <button class="exitbtn">.
window.REVEAL_EXIT = (function(){
  let sheet = null, resolver = null;
  function build(){
    sheet = document.createElement("div");
    sheet.className = "exitsheet"; sheet.hidden = true;
    sheet.setAttribute("role","dialog"); sheet.setAttribute("aria-modal","true"); sheet.setAttribute("aria-labelledby","exitTtl");
    sheet.innerHTML = `<div class="exitbox"><h2 id="exitTtl"></h2><p class="exitbody"></p>
      <div class="exitrow"><button type="button" class="ghost" data-a="0">Keep playing</button><button type="button" class="primary" data-a="1"></button></div></div>`;
    sheet.addEventListener("click", e=>{
      const b = e.target.closest("button[data-a]");
      if(b) done(b.dataset.a === "1"); else if(e.target === sheet) done(false);
    });
    addEventListener("keydown", e=>{ if(!sheet.hidden && e.key === "Escape") done(false); });
    document.body.appendChild(sheet);
  }
  function done(v){ sheet.hidden = true; const r = resolver; resolver = null; r && r(v); }
  function ask(o){
    o = o || {};
    if(!sheet) build();
    if(resolver) done(false);
    sheet.querySelector("h2").textContent = o.title || "Leave this game?";
    sheet.querySelector(".exitbody").textContent = o.body || "";
    sheet.querySelector('[data-a="1"]').textContent = o.ok || "Exit";
    sheet.hidden = false;
    sheet.querySelector('[data-a="0"]').focus({preventScroll:true});
    return new Promise(r=>{ resolver = r; });
  }
  function button(onClick){
    const b = document.createElement("button");
    b.type = "button"; b.className = "exitbtn";
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg><span>Exit</span>`;
    b.addEventListener("click", onClick);
    return b;
  }
  function home(){ location.href = "./"; }
  return { ask, button, home };
})();

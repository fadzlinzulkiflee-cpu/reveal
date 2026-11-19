// REVEAL iPhone app (Capacitor) helpers. On the website this file only sets REVEAL_NATIVE = false.
// Load it first on every page: auth.js, drama.js and host.html read these values.
(function(){
  const C = window.Capacitor;
  const native = !!(C && C.isNativePlatform && C.isNativePlatform());
  window.REVEAL_NATIVE = native;
  window.REVEAL_SITE = "https://playreveal.app/";        // share and invite links always point at the website
  window.REVEAL_LINK = function(path){                    // absolute link to a page, right on both web and app
    return new URL(path || "", native ? window.REVEAL_SITE : location.href).href;
  };
  if(native) document.documentElement.classList.add("native");
})();

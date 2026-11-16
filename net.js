// Shared PeerJS settings for host.html and play.html.
// Default: the free public PeerJS broker. For a private broker or local testing add
// ?peerhost=HOST&peerport=PORT&peerpath=/PATH&peersecure=0 to the page URL.
window.REVEAL_NET = (function(){
  const q = new URLSearchParams(location.search);
  const opts = { debug: 0 };
  if (q.get("peerhost")) {
    opts.host = q.get("peerhost");
    opts.port = +(q.get("peerport") || 443);
    opts.path = q.get("peerpath") || "/";
    opts.secure = q.get("peersecure") !== "0";
  }
  const passthrough = ["peerhost","peerport","peerpath","peersecure"]
    .filter(k => q.get(k)).map(k => `${k}=${encodeURIComponent(q.get(k))}`).join("&");
  return {
    opts,
    passthrough,                       // appended to the join link so phones use the same broker
    prefix: "reveal-wordgame-room-",   // peer id = prefix + room code
    codeChars: "ABCDEFGHJKMNPQRSTUVWXYZ23456789",
  };
})();

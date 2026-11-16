// Shared PeerJS settings for host.html and play.html.
// Default: the free public PeerJS broker. For a private broker or local testing add
// ?peerhost=HOST&peerport=PORT&peerpath=/PATH&peersecure=0 to the page URL.
window.REVEAL_NET = (function(){
  const q = new URLSearchParams(location.search);
  const opts = { debug: 0 };
  // Relay (TURN) for phones whose network blocks direct connections (some mobile data).
  // PeerJS already includes a small free relay in Europe/US. RELAY adds Metered's Open Relay (free 20 GB a month,
  // servers in Asia, works over port 443 too). Paste the username and credential from the Metered dashboard.
  // These are meant to be used in browsers, so they are not secret.
  const RELAY = { username: "", credential: "" };
  if (RELAY.username && RELAY.credential) {
    opts.config = { iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun.relay.metered.ca:80" },
      { urls: ["turn:global.relay.metered.ca:80", "turn:global.relay.metered.ca:80?transport=tcp",
               "turn:global.relay.metered.ca:443", "turns:global.relay.metered.ca:443?transport=tcp"],
        username: RELAY.username, credential: RELAY.credential },
      { urls: ["turn:eu-0.turn.peerjs.com:3478", "turn:us-0.turn.peerjs.com:3478"], username: "peerjs", credential: "peerjsp" }
    ], sdpSemantics: "unified-plan" };
  }
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

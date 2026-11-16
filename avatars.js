// REVEAL ready-made avatars (no photo uploads). Each is drawn as inline SVG from shape + colour + topper.
window.REVEAL_AVATARS = (function(){
  const LIST = [
    ["nova","Nova","#C7F58B","blob","ears"],["pixel","Pixel","#7FCBFF","square","antenna"],["echo","Echo","#C4A1FF","blob","horns"],
    ["blaze","Blaze","#FF7E73","drop","flame"],["juno","Juno","#FFC15E","round","bow"],["orbit","Orbit","#7FE0C4","round","ring"],
    ["maple","Maple","#FFB38A","blob","leaf"],["comet","Comet","#F6E27A","star",""],["kiwi","Kiwi","#A8F0A0","round","sprout"],
    ["mochi","Mochi","#F0A8E0","square","ears"],["sable","Sable","#B3C7FF","drop","horns"],["rook","Rook","#9BE7FF","square","bot"]
  ];
  const byId = Object.fromEntries(LIST.map(a=>[a[0],a]));
  function shade(hex, k){ const n=parseInt(hex.slice(1),16); const f=v=>Math.max(0,Math.min(255,Math.round(v*k))); return `rgb(${f(n>>16)},${f(n>>8&255)},${f(n&255)})`; }
  function svg(id, cls=""){
    const [, name, col, shape, extra] = byId[id] || LIST[0], d = shade(col,.72);
    const body = {
      blob:'<path d="M50 14c22 0 36 16 36 38 0 22-14 36-36 36S14 74 14 52c0-22 14-38 36-38z"/>',
      square:'<rect x="16" y="20" width="68" height="66" rx="20"/>',
      round:'<circle cx="50" cy="54" r="34"/>',
      drop:'<path d="M50 10c10 16 34 28 34 48a34 34 0 0 1-68 0c0-20 24-32 34-48z"/>',
      star:`<path d="M50 12l11 20 22 4-15 16 3 23-21-10-21 10 3-23-15-16 22-4z" stroke-linejoin="round" stroke-width="10" stroke="${col}"/>`
    }[shape];
    const top = {
      ears:`<circle cx="26" cy="24" r="10" fill="${col}"/><circle cx="74" cy="24" r="10" fill="${col}"/><circle cx="26" cy="24" r="4" fill="${d}"/><circle cx="74" cy="24" r="4" fill="${d}"/>`,
      antenna:`<rect x="48" y="6" width="4" height="16" fill="${d}"/><circle cx="50" cy="7" r="5" fill="#FF7E73"/>`,
      horns:`<path d="M24 26l-4-16 14 10zM76 26l4-16-14 10z" fill="#F6F8F0" stroke="${d}" stroke-width="2.5" stroke-linejoin="round"/>`,
      flame:`<path d="M44 14c0-6 6-10 6-10s0 6 6 8c4 2 2 8 2 8H42s-2-3 2-6z" fill="#FFC15E"/>`,
      bow:`<path d="M50 20l-14-8v16zM50 20l14-8v16z" fill="#FF7E73"/><circle cx="50" cy="20" r="4" fill="#d0493f"/>`,
      ring:`<ellipse cx="50" cy="56" rx="46" ry="9" fill="none" stroke="${d}" stroke-width="4" opacity=".8"/>`,
      leaf:`<path d="M50 16c2-10 14-12 18-10-2 8-10 12-18 10z" fill="#8FC55A"/>`,
      sprout:`<path d="M50 22V12" stroke="#5f9a3a" stroke-width="4"/><path d="M50 13c-8-6-14-2-14-2 4 6 10 6 14 2zM50 13c8-6 14-2 14-2-4 6-10 6-14 2z" fill="#8FC55A"/>`,
      bot:`<rect x="46" y="8" width="8" height="12" rx="2" fill="${d}"/><circle cx="50" cy="8" r="5" fill="#C7F58B"/>`,
      "":""
    }[extra];
    const eyes = extra==="bot"
      ? `<rect x="30" y="42" width="40" height="18" rx="9" fill="#17231D"/><circle cx="40" cy="51" r="5" fill="#C7F58B"/><circle cx="60" cy="51" r="5" fill="#C7F58B"/>`
      : `<circle cx="38" cy="50" r="10" fill="#fff"/><circle cx="62" cy="50" r="10" fill="#fff"/><circle cx="40" cy="52" r="5" fill="#17231D"/><circle cx="64" cy="52" r="5" fill="#17231D"/><circle cx="42" cy="50" r="1.8" fill="#fff"/><circle cx="66" cy="50" r="1.8" fill="#fff"/>`;
    return `<svg viewBox="0 0 100 100" class="${cls}" role="img" aria-label="${name}">${top}<g fill="${col}">${body}</g>`
      + `<path d="M22 70a34 30 0 0 0 56 0" fill="${d}" opacity=".35"/>${eyes}`
      + `<circle cx="28" cy="64" r="5" fill="#FF7E73" opacity=".35"/><circle cx="72" cy="64" r="5" fill="#FF7E73" opacity=".35"/>`
      + `<path d="M42 68q8 7 16 0" fill="none" stroke="#17231D" stroke-width="4" stroke-linecap="round"/></svg>`;
  }
  return { LIST, svg, has:id=>!!byId[id], name:id=>(byId[id]||LIST[0])[1] };
})();

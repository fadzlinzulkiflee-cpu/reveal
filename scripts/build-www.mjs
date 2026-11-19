// Copies the website files into www/ for the iPhone app (Capacitor). The website itself needs no build.
// Only game files go in: no SQL, no README, no node tooling. Ranked words are never in this repo.
import { cpSync, rmSync, mkdirSync, readdirSync } from "node:fs";
const out = "www";
rmSync(out, { recursive:true, force:true });
mkdirSync(out);
for(const f of readdirSync(".")){
  if(/\.(html|js|css|webmanifest)$/.test(f) && f !== "capacitor.config.js") cpSync(f, `${out}/${f}`);
}
for(const d of ["icons", "vendor"]) cpSync(d, `${out}/${d}`, { recursive:true });
console.log("www/ ready:", readdirSync(out).length, "entries");

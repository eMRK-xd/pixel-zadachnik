/* «Пластинка» — the first mod and an example for mod authors.
   Shows what is playing in any player on the PC (Windows media sessions) and switches tracks.
   Uses: zadachnik.on("media" | "mediaArt" | "taskDone" | "visible"), zadachnik.media.*  (permission "media"). */
const $ = id => document.getElementById(id);
const cv = $("disc"), cx = cv.getContext("2d"), W = cv.width, H = cv.height;
const img = cx.createImageData(W, H);

let st = null;              // last state from the app: {title, artist, album, playing, pos, dur, app, canNext, canPrev}
let art = null;             // album cover, 12×12 pixels [r,g,b] or null
let rot = 0, vel = 0;       // disc angle and speed (rad/s)
let arm = 0;                // 0 = parked, 1 = on the record
let est = 0, estAt = 0, lastPos = -1;   // track position estimate (players don't report it every second)
let visible = true, running = false, lastT = 0, acc = 0;

/* ---------- colours ---------- */
const C = { rim: [42, 40, 52], groove: [21, 18, 28], groove2: [28, 24, 37], sheen: [56, 52, 68], dust: [110, 102, 126],
  label: [201, 150, 43], labelD: [125, 90, 20], labelRing: [224, 177, 62], hole: [14, 10, 20], arm: [184, 184, 200], armD: [110, 110, 126], head: [224, 177, 62] };

function px(x, y, c, a = 255) { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = a; }
function line(x0, y0, x1, y1, c) { // Bresenham, crisp pixels
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
  for (;;) { px(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
}

function draw() {
  img.data.fill(0);
  const ox = 16, oy = 16, cs = Math.cos(-rot), sn = Math.sin(-rot);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const dx = x + .5 - ox, dy = y + .5 - oy, r = Math.hypot(dx, dy);
    if (r > 15.5) continue;
    const u = dx * cs - dy * sn, v = dx * sn + dy * cs;          // coordinates on the spinning record
    let c;
    if (r > 14.6) c = C.rim;
    else if (r < 1.2) c = C.hole;
    else if (r < 6.3) {                                          // label: album cover or a gold label with a mark
      if (art) { const ix = Math.max(0, Math.min(11, Math.floor(u + 6))), iy = Math.max(0, Math.min(11, Math.floor(v + 6))); c = art[iy * 12 + ix]; }
      else c = r > 5.4 ? C.labelRing : (u > 1.5 && Math.abs(v) < 1.6) ? C.labelD : C.label;
    } else {                                                     // grooves + light that stays still while the disc turns
      const a = Math.atan2(dy, dx), sh = Math.abs(((a + Math.PI * .75) % Math.PI + Math.PI) % Math.PI - Math.PI / 2);
      c = sh > 1.25 ? C.sheen : (Math.floor(r) % 2 ? C.groove2 : C.groove);
    }
    px(x, y, c);
  }
  for (const [rr, off] of [[11, 0], [8.5, 2.4], [13, 4.1]]) {    // dust flecks show the spin
    const a = rot + off; px(Math.round(ox + Math.cos(a) * rr - .5), Math.round(oy + Math.sin(a) * rr - .5), C.dust);
  }
  // tonearm: pivot top-right, needle swings onto the record
  const e = arm * arm * (3 - 2 * arm), nx = 36 + (27 - 36) * e, ny = 23 + (17 - 23) * e;
  line(36, 4, nx, ny, C.arm); line(37, 4, nx + 1, ny, C.armD);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) px(35 + i, 2 + j, i === 1 && j === 1 ? C.head : C.armD);
  px(Math.round(nx) - 1, Math.round(ny), C.head); px(Math.round(nx), Math.round(ny), C.head); px(Math.round(nx) - 1, Math.round(ny) + 1, C.head);
  cx.putImageData(img, 0, 0);
}

/* ---------- animation: 30 steps a second, sleeps when nothing moves ---------- */
function frame(t) {
  const dt = Math.min(.1, lastT ? (t - lastT) / 1000 : 0); lastT = t; acc += dt;
  const target = st?.playing ? Math.PI * 2 * .55 : 0;           // 33⅓ rpm
  vel += (target - vel) * Math.min(1, dt * (target ? 2.2 : 1.4)); // spins up and slows down like a real deck
  rot += vel * dt;
  arm += ((st?.playing ? 1 : 0) - arm) * Math.min(1, dt * 5);
  if (acc >= 1 / 30) { acc = 0; draw(); progress(); }
  const busy = Math.abs(vel - target) > .02 || Math.abs((st?.playing ? 1 : 0) - arm) > .01 || target > 0;
  if (busy && visible) requestAnimationFrame(frame); else { running = false; lastT = 0; draw(); progress(); }
}
function wake() { if (!running && visible) { running = true; requestAnimationFrame(frame); } }

/* ---------- text ---------- */
const appName = a => /spotify/i.test(a) ? "Spotify" : /yandex/i.test(a) ? "Яндекс Музыка" : /vk|boom/i.test(a) ? "VK Музыка"
  : /chrome|msedge|firefox|opera|browser|yandex/i.test(a) ? "браузер" : /vlc/i.test(a) ? "VLC" : /aimp/i.test(a) ? "AIMP" : /foobar/i.test(a) ? "foobar2000"
  : (a || "").split(/[\\/!]/).pop().replace(/\.exe$/i, "").replace(/_.*$/, "");
function marquee() {
  const t = $("title"), box = t.parentElement; t.classList.remove("run");
  const over = t.scrollWidth - box.clientWidth;
  if (over > 2) { t.style.setProperty("--shift", -(over + 40) + "px"); t.style.setProperty("--dur", Math.max(6, (over + 40) / 18) + "s"); t.classList.add("run"); }
}
function text() {
  const idle = !st || !st.title;
  document.body.classList.toggle("idle", idle);
  const title = idle ? "тишина" : st.title, sub = idle ? "включи музыку в любом плеере" : [st.artist, appName(st.app)].filter(Boolean).join(" · ");
  if ($("title").textContent !== title) { $("title").textContent = title; marquee(); }
  $("sub").textContent = sub;
  $("play").textContent = st?.playing ? "II" : "▸";
  $("prev").disabled = !st?.canPrev; $("next").disabled = !st?.canNext; $("play").disabled = !st;
}
function progress() {
  if (!st || !st.dur) { $("fill").style.width = "0"; return; }
  const p = st.playing ? est + (performance.now() - estAt) / 1000 : est;
  $("fill").style.width = Math.max(0, Math.min(100, p / st.dur * 100)) + "%";
}

/* ---------- album cover → 12×12 pixels for the label ---------- */
function loadArt(url) {
  if (!url) { art = null; draw(); return; }
  const im = new Image();
  im.onload = () => {
    const c = document.createElement("canvas"); c.width = c.height = 12; const g = c.getContext("2d");
    const s = Math.min(im.width, im.height); g.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 12, 12);
    const d = g.getImageData(0, 0, 12, 12).data; art = [];
    for (let i = 0; i < 144; i++) art.push([d[i * 4] & 0xf8, d[i * 4 + 1] & 0xf8, d[i * 4 + 2] & 0xf8]); // fewer shades = more pixel-art
    draw();
  };
  im.src = url;
}

/* ---------- talking to the app ---------- */
zadachnik.on("media", s => {
  const was = st; st = s;
  if (s && s.dur) {                                              // keep our own clock; resync only when the player reports a new position
    const guess = was?.playing ? est + (performance.now() - estAt) / 1000 : est;
    if (s.pos !== lastPos || !was || was.title !== s.title || Math.abs(guess - s.pos) > 30) { est = s.pos; estAt = performance.now(); lastPos = s.pos; }
    else if (was.playing !== s.playing) { est = guess; estAt = performance.now(); }
  }
  text(); wake();
});
zadachnik.on("mediaArt", loadArt);
zadachnik.on("visible", v => { visible = v; wake(); });
zadachnik.on("taskDone", () => { vel = -9; arm = Math.min(arm, .7); wake(); }); // a little scratch when you finish a task

$("play").onclick = () => zadachnik.media.toggle();
$("prev").onclick = () => zadachnik.media.prev();
$("next").onclick = () => zadachnik.media.next();
cv.onclick = () => st && zadachnik.media.toggle();

document.fonts?.ready.then(marquee);
zadachnik.on("font", marquee); // the app's font changed: the title has a new width
text(); draw();

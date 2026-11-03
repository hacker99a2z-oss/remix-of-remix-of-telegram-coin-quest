import arenaBg from "@/assets/arena-bg.jpg";
import { useEffect, useRef, useState } from "react";
import { Crosshair, Shield } from "lucide-react";
import { haptic } from "@/lib/tg";

// Arena shooter: enemies come from the front (top), max 3-4 at once.
// Left joystick moves the hero. Hold SHIELD to raise the shield in front.
// Hold SHOOT to show a laser sight, drag to aim, release to fire.
// One hit kills (both sides). Cars/crates/barrels block bullets.
// Every bullet (ours and theirs) takes 1 second to reach its target point.

const DURATION = 90;
const TRAVEL_FRAMES = 60; // ~1s at 60fps

type Bullet = { x: number; y: number; vx: number; vy: number; enemy: boolean; life: number };
type Look = { hood: string; hoodDeep: string; skin: string; hat: "bald" | "beanie" | "bandana" | "cap"; hatCol: string; mask: string };
type Enemy = { x: number; y: number; ty: number; cool: number; warn: number; phase: number; flash: number; dir: number; look: Look; dead: number; spin: number };
type Part = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number };
type Float = { x: number; y: number; text: string; life: number; color: string };
type Cover = { x: number; y: number; w: number; h: number; kind: "car" | "crate" | "barrel" };

const COL = {
  sky1: "#0b3b7a", sky2: "#2b8fe0", bldg: "#14305e", bldg2: "#1d4580", win: "#ffb347", road: "#2a2f45",
  shield: "#7ef0ff", laser: "#ff2b4a", bulletMe: "#ffe14a", bulletEnemy: "#ff8a3d", gold: "#ffd45a", red: "#ff5a6e",
};
const HERO: Look = { hood: "#3a9be8", hoodDeep: "#1f62b0", skin: "#f08a3c", hat: "cap", hatCol: "#3fb6ff", mask: "#13285a" };
const LOOKS: Look[] = [
  { hood: "#1f3f8f", hoodDeep: "#132a63", skin: "#c96a32", hat: "bald", hatCol: "#c96a32", mask: "#0f1f4d" },
  { hood: "#b33a3a", hoodDeep: "#7a2222", skin: "#e0915a", hat: "beanie", hatCol: "#222", mask: "#2a0f12" },
  { hood: "#2f7a4a", hoodDeep: "#1c4d2e", skin: "#8a5a3a", hat: "bandana", hatCol: "#e23b3b", mask: "#132a1c" },
  { hood: "#5a3a8f", hoodDeep: "#38245c", skin: "#f0b07a", hat: "cap", hatCol: "#222", mask: "#1a1030" },
  { hood: "#444b5a", hoodDeep: "#2a2f3a", skin: "#d07a40", hat: "beanie", hatCol: "#f0a020", mask: "#111" },
];

export function ShooterGame({ onEnd }: { onEnd: (score: number, survived: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  const input = useRef({ mx: 0, my: 0, shield: false, aiming: false, aimX: 0, aimY: 0, fire: false, aimInit: false });
  const [hud, setHud] = useState({ score: 0, time: DURATION, kills: 0 });
  const [countdown, setCountdown] = useState(3);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [shieldOn, setShieldOn] = useState(false);
  const [aimOn, setAimOn] = useState(false);
  const joy = useRef<{ id: number; cx: number; cy: number } | null>(null);
  const aimPtr = useRef<{ id: number; lx: number; ly: number } | null>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    haptic("light");
    const t = setTimeout(() => setCountdown((c) => c - 1), 700);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    if (countdown > 0) return;
    const canvas = canvasRef.current!, wrap = wrapRef.current!;
    const ctx = canvas.getContext("2d")!;
    const bgImg = new Image(); bgImg.src = arenaBg;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0;
    const resize = () => {
      W = wrap.clientWidth; H = wrap.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const p = { x: W / 2, y: H * 0.8, walk: 0, dead: 0, shieldT: 0, recoil: 0, gunA: -Math.PI / 2 };
    let enemies: Enemy[] = [], bullets: Bullet[] = [], parts: Part[] = [], floats: Float[] = [];
    let score = 0, kills = 0, shake = 0, spawnCd = 30, done = false, lastHud = 0, raf = 0, survived = 0;
    const covers: Cover[] = [
      { x: W * 0.12, y: H * 0.5, w: 70, h: 34, kind: "car" },
      { x: W * 0.62, y: H * 0.47, w: 46, h: 36, kind: "crate" },
      { x: W * 0.4, y: H * 0.63, w: 26, h: 34, kind: "barrel" },
      { x: W * 0.78, y: H * 0.64, w: 42, h: 34, kind: "crate" },
    ];
    const stars = Array.from({ length: 30 }, () => ({ x: Math.random() * W, y: Math.random() * H * 0.25, r: Math.random() * 1.5 + 0.5 }));
    const blds = Array.from({ length: 7 }, (_, i) => ({ x: (i / 7) * W - 10, w: W / 7 + 14, h: H * (0.12 + Math.random() * 0.15), seed: Math.random() }));
    const start = performance.now();
    let last = start;
    const inp = input.current;

    const burst = (x: number, y: number, color: string, n = 14, sp = 4) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = Math.random() * sp + 1;
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color, size: Math.random() * 4 + 2 });
      }
    };
    const fireBullet = (sx: number, sy: number, tx: number, ty: number, enemy: boolean) => {
      bullets.push({ x: sx, y: sy, vx: (tx - sx) / TRAVEL_FRAMES, vy: (ty - sy) / TRAVEL_FRAMES, enemy, life: TRAVEL_FRAMES * 3 });
    };
    const spawnEnemy = () => {
      enemies.push({ x: 40 + Math.random() * (W - 80), y: -40, ty: H * (0.2 + Math.random() * 0.2), cool: 90 + Math.random() * 90, warn: 0, phase: Math.random() * 6, flash: 0, dir: Math.random() < 0.5 ? -1 : 1, look: LOOKS[Math.floor(Math.random() * LOOKS.length)]!, dead: 0, spin: Math.random() < 0.5 ? -1 : 1 });
    };
    const finish = (delay: number) => {
      if (done) return;
      done = true;
      setTimeout(() => endRef.current(score, survived), delay);
    };

    // Chibi street character, facing the viewer. gunA = gun angle in world space.
    const drawGuy = (L: Look, walk: number, gunA: number, flash: number, warn: boolean, scale: number) => {
      ctx.save(); ctx.scale(scale, scale);
      const step = Math.sin(walk) * 4;
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.ellipse(0, 30, 24, 7, 0, 0, Math.PI * 2); ctx.fill();
      // legs + shoes
      ctx.fillStyle = L.hoodDeep;
      ctx.beginPath(); ctx.roundRect(-13, 8, 11, 18 + step, 4); ctx.roundRect(2, 8, 11, 18 - step, 4); ctx.fill();
      ctx.fillStyle = "#1a1a2a"; ctx.beginPath(); ctx.ellipse(-8, 27 + step, 8, 4, 0, 0, Math.PI * 2); ctx.ellipse(8, 27 - step, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.translate(0, Math.abs(Math.sin(walk)) * -2);
      // hoodie
      const g = ctx.createLinearGradient(0, -22, 0, 12); g.addColorStop(0, L.hood); g.addColorStop(1, L.hoodDeep);
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-18, -20, 36, 32, 12); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-3, -16); ctx.lineTo(-4, -6); ctx.moveTo(3, -16); ctx.lineTo(4, -6); ctx.stroke();
      ctx.fillStyle = "rgba(0,0,0,0.15)"; ctx.fillRect(-12, 0, 24, 6);
      // head (big)
      ctx.fillStyle = L.skin; ctx.beginPath(); ctx.ellipse(0, -36, 17, 16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-17, -35, 4, 0, Math.PI * 2); ctx.arc(17, -35, 4, 0, Math.PI * 2); ctx.fill();
      // mask over lower face
      ctx.fillStyle = L.mask; ctx.beginPath(); ctx.moveTo(-17, -36); ctx.quadraticCurveTo(0, -30, 17, -36); ctx.lineTo(15, -24); ctx.quadraticCurveTo(0, -16, -15, -24); ctx.fill();
      // angry eyes
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(-6, -40, 4.5, 5, 0, 0, Math.PI * 2); ctx.ellipse(6, -40, 4.5, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = warn ? COL.laser : "#1a1a1a"; ctx.beginPath(); ctx.arc(-5, -39, 2.4, 0, Math.PI * 2); ctx.arc(5, -39, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#3a1a0a"; ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-11, -48); ctx.lineTo(-2, -45); ctx.moveTo(11, -48); ctx.lineTo(2, -45); ctx.stroke();
      // headwear
      if (L.hat === "cap") {
        ctx.fillStyle = L.hatCol; ctx.beginPath(); ctx.arc(0, -46, 17, Math.PI, 0); ctx.fill();
        ctx.beginPath(); ctx.ellipse(-12, -47, 14, 4, -0.25, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#d8283a"; ctx.beginPath(); ctx.moveTo(4, -60); ctx.quadraticCurveTo(18, -62, 20, -50); ctx.quadraticCurveTo(12, -56, 4, -52); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.beginPath(); ctx.arc(-4, -54, 5, Math.PI, 0); ctx.fill();
      } else if (L.hat === "beanie") {
        ctx.fillStyle = L.hatCol; ctx.beginPath(); ctx.arc(0, -46, 17, Math.PI, 0); ctx.fill(); ctx.fillRect(-17, -48, 34, 5);
        ctx.beginPath(); ctx.arc(0, -64, 4, 0, Math.PI * 2); ctx.fill();
      } else if (L.hat === "bandana") {
        ctx.fillStyle = L.hatCol; ctx.beginPath(); ctx.arc(0, -46, 17, Math.PI, 0); ctx.fill();
        ctx.beginPath(); ctx.moveTo(16, -48); ctx.lineTo(25, -44); ctx.lineTo(22, -52); ctx.fill();
      } else { ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.beginPath(); ctx.ellipse(-5, -48, 6, 3, -0.4, 0, Math.PI * 2); ctx.fill(); }
      // arms + gun
      ctx.save(); ctx.translate(10, -6); ctx.rotate(gunA);
      ctx.fillStyle = L.hood; ctx.beginPath(); ctx.roundRect(-4, -5, 18, 10, 5); ctx.fill();
      ctx.fillStyle = L.skin; ctx.beginPath(); ctx.arc(15, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#4a4a50"; ctx.beginPath(); ctx.roundRect(12, -5, 26, 8, 2); ctx.fill(); ctx.fillStyle = "#2a2a30"; ctx.fillRect(16, 2, 6, 8);
      if (flash > 0) { ctx.fillStyle = COL.bulletMe; ctx.shadowColor = COL.bulletMe; ctx.shadowBlur = 20; ctx.beginPath(); ctx.moveTo(38, -1); ctx.lineTo(38 + 18 * flash, -9); ctx.lineTo(38 + 12 * flash, -1); ctx.lineTo(38 + 20 * flash, 7); ctx.fill(); }
      ctx.restore();
      ctx.restore();
    };

    const drawHero = (t: number) => {
      ctx.save(); ctx.translate(p.x, p.y);
      if (p.dead > 0) { ctx.rotate(p.dead * 1.4); ctx.globalAlpha = Math.max(0.2, 1 - p.dead * 0.6); }
      drawGuy(HERO, p.walk, p.gunA, p.recoil, false, 1.05);
      const s = p.shieldT;
      if (s > 0.02 && p.dead === 0) {
        const sx = -26 + s * 26, sy = -10 - s * 54, sw = 20 + s * 50, sh = 30 - s * 12;
        ctx.save(); ctx.translate(sx, sy);
        ctx.shadowColor = COL.shield; ctx.shadowBlur = 10 + s * 25;
        ctx.fillStyle = `rgba(126,240,255,${0.35 + s * 0.3})`; ctx.strokeStyle = COL.shield; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(0, 0, sw / 2, sh / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (s > 0.5) { ctx.globalAlpha *= 0.5 + 0.5 * Math.sin(t / 80); ctx.beginPath(); ctx.ellipse(0, 0, sw / 2 + 5, sh / 2 + 4, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
        ctx.restore();
      }
      ctx.restore();
    };

    const drawEnemy = (e: Enemy, t: number) => {
      ctx.save(); ctx.translate(e.x, e.y);
      if (e.dead > 0) { const k = Math.min(1, e.dead); ctx.translate(e.spin * k * 20, -Math.sin(k * Math.PI) * 25); ctx.rotate(e.spin * k * 1.6); ctx.globalAlpha = 1 - k; }
      const ang = Math.atan2(p.y - e.y, p.x - e.x);
      drawGuy(e.look, t / 120 + e.phase, ang, e.flash, e.warn > 0, 0.85);
      ctx.restore();
      if (e.warn > 0 && e.dead === 0) {
        ctx.save(); ctx.globalAlpha = 0.35 * Math.abs(Math.sin(t / 50)); ctx.strokeStyle = COL.bulletEnemy; ctx.setLineDash([4, 6]); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(p.x, p.y - 20); ctx.stroke(); ctx.restore();
      }
    };

    const drawCover = (c: Cover) => {
      ctx.save(); ctx.translate(c.x, c.y);
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.ellipse(c.w / 2, c.h, c.w / 2 + 4, 6, 0, 0, Math.PI * 2); ctx.fill();
      if (c.kind === "car") {
        ctx.fillStyle = "#6a3fc0"; ctx.beginPath(); ctx.roundRect(0, 8, c.w, c.h - 12, 8); ctx.fill();
        ctx.fillStyle = "#8a5ae0"; ctx.beginPath(); ctx.roundRect(12, 0, c.w - 26, 14, 6); ctx.fill();
        ctx.fillStyle = "#9fd8ff"; ctx.fillRect(16, 3, c.w - 34, 8);
        ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(14, c.h - 4, 6, 0, Math.PI * 2); ctx.arc(c.w - 14, c.h - 4, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = COL.gold; ctx.fillRect(c.w - 6, 14, 5, 4);
      } else if (c.kind === "crate") {
        ctx.fillStyle = "#b5793a"; ctx.fillRect(0, 0, c.w, c.h); ctx.strokeStyle = "#7a4e22"; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, c.w - 3, c.h - 3);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(c.w, c.h); ctx.moveTo(c.w, 0); ctx.lineTo(0, c.h); ctx.stroke();
      } else {
        ctx.fillStyle = "#d84a2a"; ctx.beginPath(); ctx.roundRect(0, 0, c.w, c.h, 5); ctx.fill();
        ctx.fillStyle = "#a83218"; ctx.fillRect(0, 9, c.w, 3); ctx.fillRect(0, c.h - 12, c.w, 3);
        ctx.fillStyle = COL.gold; ctx.beginPath(); ctx.arc(c.w / 2, c.h / 2, 4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    };

    const drawBg = (t: number) => {
      if (bgImg.complete && bgImg.naturalWidth) {
        const s = Math.max(W / bgImg.naturalWidth, H / bgImg.naturalHeight);
        const iw = bgImg.naturalWidth * s, ih = bgImg.naturalHeight * s;
        ctx.drawImage(bgImg, (W - iw) / 2, (H - ih) / 2, iw, ih);
        return;
      }
      const sky = ctx.createLinearGradient(0, 0, 0, H * 0.45); sky.addColorStop(0, COL.sky1); sky.addColorStop(1, COL.sky2);
      ctx.fillStyle = sky; ctx.fillRect(-20, -20, W + 40, H * 0.45 + 20);
      ctx.fillStyle = "#fff"; for (const s of stars) { ctx.globalAlpha = 0.4 + 0.4 * Math.sin(t / 500 + s.x); ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#ffe9b0"; ctx.shadowColor = "#ffe9b0"; ctx.shadowBlur = 30; ctx.beginPath(); ctx.arc(W * 0.82, H * 0.08, 16, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      for (const b of blds) {
        const top = H * 0.42 - b.h;
        ctx.fillStyle = b.seed > 0.5 ? COL.bldg : COL.bldg2; ctx.fillRect(b.x, top, b.w, b.h + 4);
        for (let wy = top + 10; wy < H * 0.4; wy += 16) for (let wx = b.x + 8; wx < b.x + b.w - 10; wx += 14) {
          const on = Math.sin(wx * 3.1 + wy * 1.7 + b.seed * 9) > 0.3;
          ctx.fillStyle = on ? COL.win : "rgba(0,0,0,0.25)"; ctx.globalAlpha = on ? 0.6 + 0.3 * Math.sin(t / 900 + wx) : 1; ctx.fillRect(wx, wy, 7, 9);
        }
        ctx.globalAlpha = 1;
      }
      const road = ctx.createLinearGradient(0, H * 0.42, 0, H); road.addColorStop(0, "#3a3550"); road.addColorStop(1, "#5a4038");
      ctx.fillStyle = road; ctx.fillRect(-20, H * 0.42, W + 40, H * 0.6);
      ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fillRect(-20, H * 0.42, W + 40, 6);
      ctx.fillStyle = "rgba(255,212,90,0.35)"; for (let x = 10; x < W; x += 50) ctx.fillRect(x, H * 0.72, 26, 4);
      // street lamps
      for (const lx of [W * 0.05, W * 0.95]) {
        ctx.fillStyle = "#222b40"; ctx.fillRect(lx - 2, H * 0.22, 4, H * 0.2);
        const gl = ctx.createRadialGradient(lx, H * 0.22, 2, lx, H * 0.22, 60); gl.addColorStop(0, "rgba(255,220,140,0.6)"); gl.addColorStop(1, "rgba(255,220,140,0)");
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(lx, H * 0.22, 60, 0, Math.PI * 2); ctx.fill();
      }
    };
    const hitCover = (x: number, y: number) => covers.find((c) => x > c.x && x < c.x + c.w && y > c.y && y < c.y + c.h);

    const loop = (t: number) => {
      const dt = Math.min(2.5, (t - last) / 16.67);
      last = t;
      const elapsed = (t - start) / 1000;
      const timeLeft = Math.max(0, DURATION - elapsed);
      if (!done) survived = Math.min(DURATION, elapsed);

      // --- player movement
      if (!done) {
        const sp = (inp.shield ? 2.4 : 4.2) * dt;
        const nx = Math.max(28, Math.min(W - 28, p.x + inp.mx * sp));
        const ny = Math.max(H * 0.5, Math.min(H - 40, p.y + inp.my * sp));
        if (!covers.some((c) => nx > c.x - 14 && nx < c.x + c.w + 14 && ny > c.y && ny < c.y + c.h + 30)) { p.x = nx; p.y = ny; }
        if (Math.hypot(inp.mx, inp.my) > 0.1) p.walk += 0.25 * dt;
      }
      p.shieldT += ((inp.shield ? 1 : 0) - p.shieldT) * 0.3 * dt;
      if (done && p.dead > 0) p.dead = Math.min(1, p.dead + 0.04 * dt);
      p.recoil = Math.max(0, p.recoil - 0.1 * dt);

      // --- aiming
      const gunX = p.x + 12, gunY = p.y - 8;
      if (inp.aiming && !inp.aimInit) {
        let best: Enemy | null = null, bd = 1e9;
        for (const e of enemies) { if (e.dead) continue; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; best = e; } }
        inp.aimX = best ? best.x : p.x; inp.aimY = best ? best.y : p.y - 250;
        inp.aimInit = true;
      }
      inp.aimX = Math.max(0, Math.min(W, inp.aimX)); inp.aimY = Math.max(0, Math.min(H, inp.aimY));
      const targetA = inp.aiming ? Math.atan2(inp.aimY - gunY, inp.aimX - gunX) : -Math.PI / 3;
      p.gunA += (targetA - p.gunA) * 0.35 * dt;
      if (inp.fire) {
        inp.fire = false;
        if (!done) {
          const a = Math.atan2(inp.aimY - gunY, inp.aimX - gunX);
          fireBullet(gunX + Math.cos(a) * 40, gunY + Math.sin(a) * 40, inp.aimX, inp.aimY, false);
          p.recoil = 1; shake = Math.max(shake, 3); haptic("medium");
        }
      }

      // --- enemies
      spawnCd -= dt;
      const maxE = elapsed < 20 ? 3 : 4;
      if (!done && enemies.filter((e) => !e.dead).length < maxE && spawnCd <= 0) { spawnEnemy(); spawnCd = 50 + Math.random() * 40; }
      for (const e of enemies) {
        if (e.dead > 0) { e.dead += 0.035 * dt; continue; }
        e.y += (e.ty - e.y) * 0.03 * dt;
        e.x += e.dir * 0.8 * dt;
        if (e.x < 30 || e.x > W - 30) e.dir *= -1;
        e.flash = Math.max(0, e.flash - 0.08 * dt);
        if (done || Math.abs(e.y - e.ty) > 30) continue;
        e.cool -= dt;
        if (e.cool <= 25 && e.warn === 0 && e.cool > 0) e.warn = 1;
        if (e.cool <= 0) {
          e.warn = 0; e.flash = 1; e.cool = Math.max(70, 150 - elapsed * 1.2) + Math.random() * 80;
          const a = Math.atan2(p.y - 10 - e.y, p.x - e.x);
          fireBullet(e.x + 9 + Math.cos(a) * 32, e.y - 5 + Math.sin(a) * 32, p.x, p.y - 20, true);
        }
      }

      // --- bullets
      bullets = bullets.filter((b) => {
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        if (b.life <= 0 || b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30) return false;
        const cv = hitCover(b.x, b.y);
        if (cv) { burst(b.x, b.y, "#d9c39a", 8, 2.5); return false; }
        if (b.enemy) {
          if (p.shieldT > 0.6 && !done) {
            const sx = p.x, sy = p.y - 64;
            if (Math.abs(b.x - sx) < 38 && Math.abs(b.y - sy) < 18) {
              burst(b.x, b.y, COL.shield, 12, 3); haptic("light");
              floats.push({ x: sx, y: sy - 20, text: "BLOCK!", life: 1, color: COL.shield });
              score += 2; return false;
            }
          }
          if (!done && Math.hypot(b.x - p.x, b.y - (p.y - 20)) < 24) {
            p.dead = 0.01; shake = 18; haptic("error");
            burst(b.x, b.y, COL.red, 30, 6);
            floats.push({ x: p.x, y: p.y - 80, text: "K.O.!", life: 1.4, color: COL.red });
            finish(1400);
            return false;
          }
        } else {
          for (const e of enemies) {
            if (!e.dead && Math.hypot(b.x - e.x, b.y - (e.y - 20)) < 26) {
              e.dead = 0.01; e.spin = b.vx >= 0 ? 1 : -1;
              kills++; score += 10; shake = Math.max(shake, 8);
              burst(e.x, e.y - 20, COL.red, 24, 6); burst(e.x, e.y - 20, COL.gold, 16, 5);
              floats.push({ x: e.x, y: e.y - 60, text: "+10", life: 1, color: COL.gold });
              haptic("success");
              return false;
            }
          }
        }
        return true;
      });
      enemies = enemies.filter((e) => e.dead < 1);

      // --- draw
      ctx.save();
      if (shake > 0) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake *= 0.88; if (shake < 0.3) shake = 0; }
      drawBg(t);
      for (const e of enemies) if (e.y < H * 0.5) drawEnemy(e, t);
      for (const c of covers) drawCover(c);
      for (const e of enemies) if (e.y >= H * 0.5) drawEnemy(e, t);

      // laser sight
      if (inp.aiming && !done) {
        ctx.save();
        ctx.strokeStyle = COL.laser; ctx.shadowColor = COL.laser; ctx.shadowBlur = 12; ctx.lineWidth = 2;
        ctx.globalAlpha = 0.8 + 0.2 * Math.sin(t / 60);
        ctx.beginPath(); ctx.moveTo(gunX, gunY); ctx.lineTo(inp.aimX, inp.aimY); ctx.stroke();
        ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(inp.aimX, inp.aimY, 14 + Math.sin(t / 120) * 2, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = COL.laser; ctx.beginPath(); ctx.arc(inp.aimX, inp.aimY, 3.5, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2 + t / 400; ctx.beginPath(); ctx.moveTo(inp.aimX + Math.cos(a) * 18, inp.aimY + Math.sin(a) * 18); ctx.lineTo(inp.aimX + Math.cos(a) * 25, inp.aimY + Math.sin(a) * 25); ctx.stroke(); }
        ctx.restore();
      }

      drawHero(t);

      for (const b of bullets) {
        ctx.save(); const c = b.enemy ? COL.bulletEnemy : COL.bulletMe;
        ctx.shadowColor = c; ctx.shadowBlur = 16; ctx.strokeStyle = c; ctx.lineWidth = 5; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(b.x - b.vx * 3, b.y - b.vy * 3); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        if (Math.random() < 0.4) parts.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.5, color: c, size: 2 });
      }
      parts = parts.filter((q) => {
        q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.95; q.vy *= 0.95; q.life -= 0.03 * dt;
        ctx.globalAlpha = Math.max(0, q.life); ctx.fillStyle = q.color;
        ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(0, q.size * q.life), 0, Math.PI * 2); ctx.fill();
        return q.life > 0;
      });
      floats = floats.filter((f) => {
        f.y -= 1 * dt; f.life -= 0.022 * dt;
        ctx.globalAlpha = Math.max(0, f.life); ctx.fillStyle = f.color;
        ctx.font = "22px 'Lilita One', system-ui"; ctx.textAlign = "center"; ctx.fillText(f.text, f.x, f.y);
        return f.life > 0;
      });
      ctx.globalAlpha = 1;
      if (p.dead > 0) { ctx.fillStyle = `rgba(255,40,60,${0.35 * (1 - p.dead)})`; ctx.fillRect(0, 0, W, H); }
      ctx.restore();

      if (t - lastHud > 100 || done) { lastHud = t; setHud({ score, time: timeLeft, kills }); }
      if (timeLeft <= 0 && !done) { haptic("success"); floats.push({ x: W / 2, y: H / 2, text: "YOU SURVIVED!", life: 1.5, color: COL.gold }); finish(1200); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [countdown]);

  // ---- controls
  const joyDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    joy.current = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    joyMove(e);
  };
  const joyMove = (e: React.PointerEvent) => {
    const j = joy.current; if (!j || j.id !== e.pointerId) return;
    let dx = e.clientX - j.cx, dy = e.clientY - j.cy;
    const d = Math.hypot(dx, dy), max = 45;
    if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
    setKnob({ x: dx, y: dy });
    input.current.mx = dx / max; input.current.my = dy / max;
  };
  const joyUp = () => { joy.current = null; setKnob({ x: 0, y: 0 }); input.current.mx = 0; input.current.my = 0; };

  const shootDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    aimPtr.current = { id: e.pointerId, lx: e.clientX, ly: e.clientY };
    input.current.aiming = true; input.current.aimInit = false; setAimOn(true); haptic("light");
  };
  const shootMove = (e: React.PointerEvent) => {
    const a = aimPtr.current; if (!a || a.id !== e.pointerId) return;
    input.current.aimX += (e.clientX - a.lx) * 2.2; input.current.aimY += (e.clientY - a.ly) * 2.2;
    a.lx = e.clientX; a.ly = e.clientY;
  };
  const shootUp = () => {
    if (!aimPtr.current) return;
    aimPtr.current = null; input.current.aiming = false; input.current.fire = true; setAimOn(false);
  };
  const shieldSet = (v: boolean) => { input.current.shield = v; setShieldOn(v); if (v) haptic("light"); };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background select-none">
      <div className="flex items-center justify-between gap-3 px-4 pt-4">
        <div className="font-display text-3xl text-gold-gradient">{hud.score}</div>
        <div className="text-sm text-muted-foreground">💀 {hud.kills}</div>
        <div className="font-display text-xl tabular-nums">⏱ {Math.ceil(hud.time)}s</div>
      </div>
      <div className="mx-4 mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-gold transition-[width] duration-200" style={{ width: `${(hud.time / DURATION) * 100}%` }} />
      </div>
      <div ref={wrapRef} className="relative mt-3 flex-1 touch-none">
        <canvas ref={canvasRef} className="absolute inset-0" />
        {countdown > 0 && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background/50">
            <div key={countdown} className="font-display text-8xl text-gold-gradient animate-in zoom-in-50 fade-in duration-500">{countdown}</div>
            <p className="px-6 text-center text-foreground">Move with the left stick. Hold 🛡️ to block. Hold 🎯, drag to aim, release to shoot! Hide behind cover — one hit and you're out!</p>
          </div>
        )}
        {/* joystick */}
        <div
          onPointerDown={joyDown} onPointerMove={joyMove} onPointerUp={joyUp} onPointerCancel={joyUp}
          className="absolute bottom-6 left-5 flex h-32 w-32 touch-none items-center justify-center rounded-full border-2 border-primary/40 bg-card/40 backdrop-blur"
        >
          <div className="h-14 w-14 rounded-full bg-gold shadow-glow" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
        </div>
        {/* shield + shoot */}
        <button
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); shieldSet(true); }}
          onPointerUp={() => shieldSet(false)} onPointerCancel={() => shieldSet(false)}
          className={`absolute bottom-36 right-24 flex h-16 w-16 touch-none items-center justify-center rounded-full border-2 transition-transform ${shieldOn ? "scale-110 border-secondary bg-secondary text-secondary-foreground shadow-glow" : "border-secondary/60 bg-card/60 text-foreground"}`}
          aria-label="Shield"
        >
          <Shield className="h-7 w-7" />
        </button>
        <button
          onPointerDown={shootDown} onPointerMove={shootMove} onPointerUp={shootUp} onPointerCancel={shootUp}
          className={`absolute bottom-6 right-5 flex h-24 w-24 touch-none items-center justify-center rounded-full border-2 transition-transform ${aimOn ? "scale-110 border-destructive bg-destructive text-destructive-foreground shadow-glow" : "border-destructive/60 bg-card/60 text-foreground"}`}
          aria-label="Shoot"
        >
          <Crosshair className="h-10 w-10" />
        </button>
      </div>
    </div>
  );
}

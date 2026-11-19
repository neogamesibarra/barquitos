import { gameEvents } from "./events.js";
import { ObjectPool } from "./pool.js";
import { state } from "./state.js";

function triggerScreenShake(duration, intensity) {
  state.shakeTimer = duration || 0.25;
  state.shakeIntensity = intensity || 8;
}

// Textos flotantes
function addFloatingText(text, x, y, color, size) {
  state.floatingTexts.push({
    text: text,
    x: x !== undefined ? x : 960,
    y: y !== undefined ? y : 480,
    color: color || "#00e5ff",
    size: size || 38,
    life: 2.2,
    maxLife: 2.2,
    vy: -40
  });
}

/** @typedef {{x: number, y: number, vx: number, vy: number, radius: number, color: string,
 * life: number, maxLife: number, gravity: number}} Particle */
const MAX_PARTICLES = 80;
const particlePool = new ObjectPool(() => ({
  x: 0, y: 0, vx: 0, vy: 0, radius: 0, color: '', life: 0, maxLife: 0, gravity: 0
}), MAX_PARTICLES);
let particleOverwriteIdx = 0;

/** @param {number} x @param {number} y @param {number} vx @param {number} vy
 * @param {number} radius @param {string} color @param {number} life @param {number} [gravity] */
function addParticle(x, y, vx, vy, radius, color, life, gravity = 0) {
  let particle;
  if (state.particles.length >= MAX_PARTICLES) {
    particle = state.particles[particleOverwriteIdx];
    particleOverwriteIdx = (particleOverwriteIdx + 1) % MAX_PARTICLES;
  } else {
    particle = particlePool.acquire();
    state.particles.push(particle);
  }
  particle.x = x;
  particle.y = y;
  particle.vx = vx;
  particle.vy = vy;
  particle.radius = radius;
  particle.color = color;
  particle.life = particle.maxLife = life;
  particle.gravity = gravity;
}

/** @param {number} index */
function removeParticle(index) {
  const particle = state.particles[index];
  state.particles[index] = state.particles[state.particles.length - 1];
  state.particles.pop();
  particlePool.release(particle);
}

function clearParticles() {
  particlePool.releaseAll(state.particles);
}

function spawnSplash(x, y) {
  for (let i = 0; i < 14; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 20 + Math.random() * 80;
    addParticle(
      x, y,
      Math.cos(ang) * spd, Math.sin(ang) * spd,
      2 + Math.random() * 3, "rgba(180, 230, 255, 0.8)", 0.35
    );
  }
}

function spawnHullSplinters(x, y, dirX, dirY) {
  for (let i = 0; i < 6; i++) {
    addParticle(
      x, y,
      dirX * 70 + (Math.random() - 0.5) * 150, dirY * 70 + (Math.random() - 0.5) * 150,
      2 + Math.random() * 3, i % 2 ? "#f7c077" : "#975032", 0.35
    );
  }
}

function spawnMuzzleFlash(x, y, rot) {
  addParticle(x, y, 0, 0, 10, "#fff6bb", 0.08);
  for (let i = 0; i < 7; i++) {
    const ang = rot + (Math.random() - 0.5) * 0.7;
    const spd = 80 + Math.random() * 160;
    addParticle(x, y, Math.cos(ang) * spd, Math.sin(ang) * spd, 3 + Math.random() * 4, "#ffea40", 0.18);
  }
}

function spawnIslandImpactParticles(x, y) {
  for (let i = 0; i < 14; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 30 + Math.random() * 95;
    addParticle(
      x, y,
      Math.cos(ang) * spd, Math.sin(ang) * spd,
      2.5 + Math.random() * 4, (i % 2 === 0) ? "#8d6e63" : (i % 3 === 0 ? "#5d4037" : "#455a64"), 0.42
    );
  }
}

function spawnMetalRamSparks(x, y, dirX, dirY) {
  const baseAng = Math.atan2(dirY, dirX);
  for (let i = 0; i < 16; i++) {
    const sAng = baseAng + (Math.random() - 0.5) * 1.8;
    const sSpd = 90 + Math.random() * 220;
    const col = (i % 3 === 0) ? "#ffffff" : (i % 2 === 0 ? "#fff176" : "#ff9100");
    addParticle(
      x + (Math.random() - 0.5) * 6, y + (Math.random() - 0.5) * 6,
      Math.cos(sAng) * sSpd, Math.sin(sAng) * sSpd,
      1.8 + Math.random() * 2.5, col, 0.32
    );
  }
}

function spawnWaterFoam(x, y, dirX, dirY) {
  addParticle(
    x + (Math.random() - 0.5) * 8, y + (Math.random() - 0.5) * 8,
    dirX * 15 + (Math.random() - 0.5) * 10, dirY * 15 + (Math.random() - 0.5) * 10,
    2.5 + Math.random() * 3.5, "rgba(255, 255, 255, 0.75)", 0.55
  );
}

function spawnConfetti(count) {
  count = count || 60;
  const colors = ["#E67E22", "#1E60D5", "#D81B60", "#75e363", "#FDD835", "#FF80AB", "#00E5FF", "#FF2A2A"];
  for (let i = 0; i < count; i++) {
    const x = 200 + Math.random() * 1520;
    addParticle(
      x, 1040,
      (Math.random() - 0.5) * 350, -400 - Math.random() * 450,
      5 + Math.random() * 7, colors[Math.floor(Math.random() * colors.length)], 2.5, 300
    );
  }
}

function renderParticles(dt) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.gravity) p.vy += p.gravity * dt;
    p.life -= dt;
    if (p.life <= 0) {
      removeParticle(i);
      continue;
    }
    state.ctx.beginPath();
    state.ctx.arc(p.x, p.y, p.radius * (p.life / p.maxLife), 0, Math.PI * 2);
    state.ctx.fillStyle = p.color;
    state.ctx.fill();
  }
}

function renderFloatingTexts(dt) {
  for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
    const ft = state.floatingTexts[i];
    ft.y += ft.vy * dt;
    ft.life -= dt;
    if (ft.life <= 0) {
      state.floatingTexts[i] = state.floatingTexts[state.floatingTexts.length - 1];
      state.floatingTexts.pop();
      continue;
    }
    const alpha = Math.min(1.0, ft.life / 0.5);
    state.ctx.save();
    state.ctx.globalAlpha = alpha;
    state.ctx.font = "bold " + ft.size + "px sans-serif";
    state.ctx.textAlign = "center";
    state.ctx.fillStyle = ft.color;
    state.ctx.strokeStyle = "#000000";
    state.ctx.lineWidth = 4.5;
    state.ctx.strokeText(ft.text, ft.x, ft.y);
    state.ctx.fillText(ft.text, ft.x, ft.y);
    state.ctx.restore();
  }
}

gameEvents.on('effect:splash', spawnSplash);
gameEvents.on('effect:muzzle', spawnMuzzleFlash);
gameEvents.on('effect:island-impact', spawnIslandImpactParticles);
gameEvents.on('effect:splinters', spawnHullSplinters);

gameEvents.on('effect:foam', spawnWaterFoam);
gameEvents.on('effect:sparks', spawnMetalRamSparks);
gameEvents.on('effect:text', addFloatingText);
gameEvents.on('effect:shake', triggerScreenShake);
gameEvents.on('effect:confetti', spawnConfetti);

export { clearParticles, removeParticle, addFloatingText, addParticle, renderFloatingTexts, renderParticles, spawnConfetti, spawnHullSplinters, spawnIslandImpactParticles, spawnMetalRamSparks, spawnMuzzleFlash, spawnSplash, spawnWaterFoam, triggerScreenShake };

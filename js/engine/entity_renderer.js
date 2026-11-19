import { MODE_HORDE, MODE_TEAMS, STATE_ARENA, STATE_LOBBY } from "./config.js";
import { waveYaw } from "./physics.js";
import { drawMiniHeart, drawSymbolOnDeck } from "./renderer.js";
import { state } from "./state.js";

const STERN_WIDTH = [14, 11, 18, 13, 17, 12, 19, 15];
const BOW_SHOULDER = [16, 21, 9, 13, 19, 8, 12, 23];
const FLEET_ACCENTS = ["#ffd76a", "#c4ebff", "#df9dff", "#65f4d6"];
const BOSS_ACCENTS = ["#ffd76a", "#ff6a47", "#dd83ff", "#5ef5e2"];
const BOSS_HULLS = ["#572039", "#171d2b", "#342066", "#153d57"];
const BOSS_SAILS = ["#e0444f", "#555e72", "#a15bed", "#236e83"];
const BOSS_TITLES = ["Galeón Corsario", "Acorazado Carmesí", "Dreadnought Abisal", "Leviatán"];
const BOSS_MASTS = [-24, 4, 30];
const BOSS_MASTS_HIGH_RANK = [-35, -12, 11, 34];

function drawShip(c, entity) {
  if (!entity.isAlive) {
    if (state.selectedMode === MODE_HORDE) {
      c.save();
      c.beginPath();
      c.arc(entity.x, entity.y, 15, 0, Math.PI * 2);
      c.fillStyle = "#763949";
      c.fill();
      c.strokeStyle = "#ffdc79";
      c.lineWidth = 5;
      c.stroke();
      c.beginPath();
      c.arc(entity.x, entity.y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * entity.rescueTime);
      c.strokeStyle = "#86ffaf";
      c.stroke();
      c.font = "bold 13px sans-serif";
      c.textAlign = "center";
      c.fillStyle = "#ffffff";
      c.fillText("RESCATE", entity.x, entity.y - 30);
      c.restore();
    }
    return;
  }
  c.save();
  c.translate(entity.x, entity.y);
  c.rotate(entity.rotation + (state.currentState === STATE_ARENA ? waveYaw(entity) : 0));

  const hullCol = entity.flashTimer > 0 ? "#ffffff" : entity.data.hull;
  let sailCol = entity.flashTimer > 0 ? "#ffffff" : entity.data.sail;
  let stripeCol = entity.flashTimer > 0 ? "#ffffff" : entity.data.stripe;

  // Modo Equipos: pintar vela con el color del equipo
  if (state.selectedMode === MODE_TEAMS) {
    const t = entity.data.team || "blue";
    sailCol = (t === "blue") ? "#42a5f5" : "#ef5350";
    stripeCol = (t === "blue") ? "#0d47a1" : "#b71c1c";
  }

  const outlineCol = "#1c1c24";

  if (entity.slot === (state.isRemoteClient ? state.remoteSlot : state.localPlayerSlot)) {
    c.beginPath();
    c.arc(0, 0, 49, 0, Math.PI * 2);
    c.strokeStyle = "#ffffff";
    c.lineWidth = 5;
    c.stroke();
    c.strokeStyle = entity.data.hull;
    c.lineWidth = 3;
    c.stroke();
  }
  if (state.currentState === STATE_ARENA) {
    const wakeLength = entity.isRamming ? 122 : 66;
    c.beginPath();
    c.moveTo(-17, -10);
    c.quadraticCurveTo(-wakeLength * 0.55, -17, -wakeLength, -24);
    c.moveTo(-17, 10);
    c.quadraticCurveTo(-wakeLength * 0.55, 17, -wakeLength, 24);
    c.strokeStyle = entity.isRamming ? "rgba(204,255,255,0.8)" : "rgba(225,255,255,0.45)";
    c.lineWidth = entity.isRamming ? 4 : 2;
    c.stroke();
  }

  const sternWidth = STERN_WIDTH[entity.slot];
  const bowShoulder = BOW_SHOULDER[entity.slot];
  // 1. Casco: Popa rectangular en x = -24, proa triangular en x = 28
  c.beginPath();
  c.moveTo(28, 0);
  c.lineTo(bowShoulder, -14);
  c.lineTo(-24, -sternWidth);
  c.lineTo(-24, sternWidth);
  c.lineTo(bowShoulder, 14);
  c.closePath();
  c.fillStyle = hullCol;
  c.fill();
  c.strokeStyle = outlineCol;
  c.lineWidth = 3;
  c.stroke();

  if (state.selectedMode === MODE_HORDE && state.hordeUpgrades.fleetRank > 0) {
    const rank = state.hordeUpgrades.fleetRank;
    c.fillStyle = "#233453";
    c.fillRect(-12, -22, 14 + Math.min(rank, 5), 10);
    c.fillRect(-12, 12, 14 + Math.min(rank, 5), 10);
    sailCol = rank >= 2 ? "#e2f5ff" : sailCol;
    c.fillStyle = FLEET_ACCENTS[Math.min(rank - 1, 3)];
    for (let armor = 0; armor < Math.min(rank + 1, 6); armor++) {
      c.fillRect(-23 + armor * 7, -17, 5, 6);
      c.fillRect(-23 + armor * 7, 11, 5, 6);
    }
    if (rank >= 2) {
      c.fillRect(-29, -16, 7, 32);
      c.fillRect(11, -13, 9, 5);
      c.fillRect(11, 8, 9, 5);
    }
  }

  // 1b. Espolón metálico frontal puntiagudo (Ariete de acero)
  // Collar metálico de la base
  c.beginPath();
  c.rect(23, -7, 4, 14);
  c.fillStyle = (entity.flashTimer > 0) ? "#ffffff" : "#37474f";
  c.fill();
  c.strokeStyle = outlineCol;
  c.lineWidth = 1.5;
  c.stroke();

  // Remaches dorados del collar
  c.fillStyle = (entity.flashTimer > 0) ? "#ffffff" : "#ffd54f";
  c.fillRect(24, -5, 2, 2);
  c.fillRect(24, 3, 2, 2);

  // Faceta superior iluminada (acero plateado)
  c.beginPath();
  c.moveTo(26, -7);
  c.lineTo(44, 0);
  c.lineTo(26, 0);
  c.closePath();
  c.fillStyle = (entity.flashTimer > 0) ? "#ffffff" : "#cfd8dc";
  c.fill();

  // Faceta inferior sombreada (acero oscuro)
  c.beginPath();
  c.moveTo(26, 0);
  c.lineTo(44, 0);
  c.lineTo(26, 7);
  c.closePath();
  c.fillStyle = (entity.flashTimer > 0) ? "#ffffff" : "#78909c";
  c.fill();

  // Contorno exterior afilado
  c.beginPath();
  c.moveTo(26, -7);
  c.lineTo(44, 0);
  c.lineTo(26, 7);
  c.closePath();
  c.strokeStyle = outlineCol;
  c.lineWidth = 2;
  c.stroke();

  // Cresta central afilada
  c.beginPath();
  c.moveTo(26, 0);
  c.lineTo(43, 0);
  c.strokeStyle = (entity.flashTimer > 0) ? "#ffffff" : "#eceff1";
  c.lineWidth = 1.2;
  c.stroke();

  // Destello de energía en la punta si está embistiendo con velocidad
  const fwdSpdDraw = entity.vx * Math.cos(entity.rotation) + entity.vy * Math.sin(entity.rotation);
  if (entity.isRamming || fwdSpdDraw > 130) {
    c.beginPath();
    c.arc(44, 0, 4.5, 0, Math.PI * 2);
    c.fillStyle = "rgba(0, 229, 255, 0.75)";
    c.fill();
    c.beginPath();
    c.arc(44, 0, 2, 0, Math.PI * 2);
    c.fillStyle = "#ffffff";
    c.fill();
  }

  // 2. Cañones laterales
  c.strokeStyle = outlineCol;
  c.lineWidth = 3.5;
  c.beginPath();
  c.moveTo(-2, -14); c.lineTo(-2, -19);
  c.moveTo(-2, 14); c.lineTo(-2, 19);
  c.stroke();

  // 3. Vela triangular ancha
  c.beginPath();
  c.moveTo(2, -18);
  c.lineTo(15, 0);
  c.lineTo(2, 18);
  c.lineTo(-4, 0);
  c.closePath();
  c.fillStyle = sailCol;
  c.fill();
  c.strokeStyle = outlineCol;
  c.lineWidth = 2;
  c.stroke();

  // Franja en vela
  c.beginPath();
  c.moveTo(0, -7);
  c.lineTo(12, 0);
  c.lineTo(0, 7);
  c.lineTo(-3, 0);
  c.closePath();
  c.fillStyle = stripeCol;
  c.fill();

  // 4. Símbolo geométrico en cubierta
  drawSymbolOnDeck(c, -10, 0, entity.data.symbol, stripeCol, outlineCol);

  // 5. Pips de munición
  const ammoDrawCount = Math.min(entity.maxAmmo, 5);
  const startPy = -((ammoDrawCount - 1) * 3);
  for (let a = 0; a < ammoDrawCount; a++) {
    c.beginPath();
    c.arc(-19, startPy + a * 6, 2.2, 0, Math.PI * 2);
    if (entity.ammo > a) {
      c.fillStyle = "#ffea00";
      c.fill();
      c.strokeStyle = "#ffffff";
      c.lineWidth = 1;
      c.stroke();
    } else {
      c.strokeStyle = "rgba(30, 30, 40, 0.7)";
      c.lineWidth = 1.2;
      c.stroke();
    }
  }

  // 6. Medidor de boost
  if (entity.boost < 0.98) {
    c.beginPath();
    c.arc(-24, 0, 9, -Math.PI * 0.5, -Math.PI * 0.5 + entity.boost * Math.PI);
    c.strokeStyle = entity.boost < 0.2 ? "rgba(255, 60, 20, 0.9)" : "rgba(0, 220, 255, 0.9)";
    c.lineWidth = 2.5;
    c.stroke();
  }

  c.restore();

  // 7. Nombre y Vidas sobre el barco
  if (state.currentState !== STATE_LOBBY) {
    const displayName = entity.data.customName || entity.data.name;
    c.save();
    c.font = "bold 13px sans-serif";
    c.textAlign = "center";
    c.fillStyle = "#ffffff";
    c.strokeStyle = "#000000";
    c.lineWidth = 3.5;
    c.strokeText(displayName, entity.x, entity.y - 42);
    c.fillText(displayName, entity.x, entity.y - 42);

    // Un cartucho por cada disparo disponible.
    const ammoSpacing = Math.min(9, 68 / Math.max(1, entity.ammo));
    const ammoLeft = entity.x - (entity.ammo - 1) * ammoSpacing / 2;
    const cartridgeHalf = Math.min(3, ammoSpacing * 0.34);
    c.strokeStyle = "#000";
    c.lineWidth = 0.8;
    for (let round = 0; round < entity.ammo; round++) {
      const bulletX = ammoLeft + round * ammoSpacing;
      const bulletY = entity.y - 16;
      c.beginPath();
      c.moveTo(bulletX - cartridgeHalf, bulletY + 1);
      c.lineTo(bulletX - cartridgeHalf, bulletY - 4);
      c.quadraticCurveTo(bulletX, bulletY - 9, bulletX + cartridgeHalf, bulletY - 4);
      c.lineTo(bulletX + cartridgeHalf, bulletY + 1);
      c.closePath();
      c.fillStyle = "#bc7045";
      c.fill();
      c.stroke();
      c.fillStyle = "#ffe587";
      c.fillRect(bulletX - cartridgeHalf, bulletY - 3, cartridgeHalf * 2, 5);
      c.strokeRect(bulletX - cartridgeHalf, bulletY - 3, cartridgeHalf * 2, 5);
    }

    // Corazones de vida
    const heartSpacing = 14;
    const heartCount = Math.ceil(entity.maxHealth);
    const totalHw = (heartCount - 1) * heartSpacing;
    const startHx = entity.x - totalHw / 2;
    const hy = entity.y - 28;
    for (let h = 0; h < heartCount; h++) {
      const heartState = Math.max(0, Math.min(1, entity.health - h));
      drawMiniHeart(c, startHx + h * heartSpacing, hy, heartState);
    }
    c.restore();
  }
}

function drawCannonball(c, entity) {
  c.beginPath();
  c.arc(entity.x, entity.y, entity.isBossShot ? 14 : (entity.isPirate ? 7 : 6), 0, Math.PI * 2);
  if (entity.isPirate) {
    c.fillStyle = "#8e24aa";
    c.fill();
    c.strokeStyle = "#e1bee7";
    c.lineWidth = 2;
    c.stroke();
  } else {
    c.fillStyle = "#1c1c22";
    c.fill();
    c.strokeStyle = "#686a74";
    c.lineWidth = 1.5;
    c.stroke();
    c.beginPath();
    c.arc(entity.x - 2, entity.y - 2, 1.8, 0, Math.PI * 2);
    c.fillStyle = "rgba(255, 255, 255, 0.8)";
    c.fill();
  }
}

function drawAmmoCrate(c, entity) {
  c.save();
  c.translate(entity.x, entity.y);
  c.fillStyle = "#d4a359";
  c.fillRect(-12, -12, 24, 24);
  c.strokeStyle = "#5a3d1b";
  c.lineWidth = 2.2;
  c.strokeRect(-12, -12, 24, 24);

  c.fillStyle = "#ffdd44";
  c.fillRect(-10, -3, 20, 6);
  c.font = "bold 13px sans-serif";
  c.textAlign = "center";
  c.fillStyle = "#221105";
  c.fillText("💣", 0, 4.5);
  c.restore();
}

function drawHordePowerup(c, entity) {
  c.save();
  c.translate(entity.x, entity.y);

  // Halo pulsante exterior
  const pulse = 0.7 + 0.3 * Math.sin(entity.time * 2.5);
  let haloColor = "#00e5ff";
  let icon = "⚡";
  if (entity.type === 0) { haloColor = "#00e676"; icon = "💚"; }
  else if (entity.type === 1) { haloColor = "#29b6f6"; icon = "📦"; }
  else if (entity.type === 2) { haloColor = "#ffea00"; icon = "⚡"; }
  else if (entity.type === 3) { haloColor = "#ff4081"; icon = "💥"; }
  else if (entity.type === 4) { haloColor = "#ffd700"; icon = "🛡️"; }

  c.beginPath();
  c.arc(0, 0, 20 * pulse, 0, Math.PI * 2);
  c.fillStyle = haloColor;
  c.globalAlpha = 0.3;
  c.fill();
  c.globalAlpha = 1.0;

  c.fillStyle = "#102027";
  c.fillRect(-15, -15, 30, 30);
  c.strokeStyle = haloColor;
  c.lineWidth = 3;
  c.strokeRect(-15, -15, 30, 30);

  c.font = "18px sans-serif";
  c.textAlign = "center";
  c.fillText(icon, 0, 6);
  c.restore();
}

function drawPirateShip(c, entity) {
  if (!entity.isAlive) return;
  c.save();
  c.translate(entity.x, entity.y);
  c.rotate(entity.rotation);

  const hullCol = entity.flashTimer > 0 ? "#ffffff" : "#1a1a1e";
  const sailCol = entity.flashTimer > 0 ? "#ffffff" : "#2c2c34";

  // Casco pirata negro
  c.beginPath();
  c.moveTo(26, 0); c.lineTo(14, -13); c.lineTo(-22, -13);
  c.lineTo(-22, 13); c.lineTo(14, 13);
  c.closePath();
  c.fillStyle = hullCol;
  c.fill();
  c.strokeStyle = "#ff1744";
  c.lineWidth = 2;
  c.stroke();

  // Vela negra con calavera
  c.beginPath();
  c.moveTo(0, -16); c.lineTo(14, 0); c.lineTo(0, 16); c.lineTo(-4, 0);
  c.closePath();
  c.fillStyle = sailCol;
  c.fill();
  c.strokeStyle = "#111111";
  c.lineWidth = 1.5;
  c.stroke();

  c.font = "12px sans-serif";
  c.textAlign = "center";
  c.fillText("☠️", 4, 4);

  c.restore();

  // Barra de salud pequeña si tiene más de 1 vida
  if (entity.maxHealth > 1 || entity.health < entity.maxHealth) {
    const bw = 28;
    const bh = 4;
    const bx = entity.x - bw / 2;
    const by = entity.y - 22;
    c.fillStyle = "rgba(0,0,0,0.6)";
    c.fillRect(bx, by, bw, bh);
    c.fillStyle = "#ff1744";
    c.fillRect(bx, by, bw * (entity.health / entity.maxHealth), bh);
  }
}

function drawBossGalleon(c, entity) {
  if (!entity.isAlive) return;
  c.save();
  c.translate(entity.x, entity.y);
  c.rotate(entity.rotation);

  const tier = Math.min(entity.rank - 1, 3);
  const accent = BOSS_ACCENTS[tier];
  const hullCol = entity.flashTimer > 0 ? "#ffffff" : BOSS_HULLS[tier];
  const sailCol = entity.flashTimer > 0 ? "#ffffff" : BOSS_SAILS[tier];

  // Casco gigante
  c.beginPath();
  const beam = tier === 1 ? 34 : 26;
  c.moveTo(56, 0); c.lineTo(34, -beam); c.lineTo(-50, -beam);
  c.lineTo(-50, beam); c.lineTo(34, beam);
  c.closePath();
  c.fillStyle = hullCol;
  c.fill();
  c.strokeStyle = "#ffd700";
  c.lineWidth = 4;
  c.stroke();

  c.fillStyle = accent;
  for (let plate = 0; plate < Math.min(entity.rank + 1, 6); plate++) {
    c.fillRect(-44 + plate * 13, -29, 8, 7);
    c.fillRect(-44 + plate * 13, 22, 8, 7);
  }
  if (entity.rank >= 2) {
    c.beginPath();
    c.moveTo(40, -11); c.lineTo(65 + tier * 4, 0); c.lineTo(40, 11);
    c.closePath();
    c.fill();
  }
  const barrels = Math.min(4, entity.rank + 1);
  c.fillStyle = entity.warning === 1 ? "#fff597" : "#28354a";
  for (let barrel = 0; barrel < barrels; barrel++) {
    const gunOffset = (barrel - (barrels - 1) / 2) * 23;
    c.fillRect(gunOffset - 4, -beam - 9, 8, 15);
    c.fillRect(gunOffset - 4, beam - 6, 8, 15);
  }
  c.fillStyle = entity.warning === 1 ? "#fff597" : accent;
  for (let frontGun = -1; frontGun <= 1; frontGun++) {
    c.fillRect(42, frontGun * 14 - 4, 19, 8);
  }
  if (tier >= 2) {
    c.beginPath();
    c.moveTo(39, -14); c.lineTo(69, -17); c.lineTo(59, 0);
    c.lineTo(69, 17); c.lineTo(39, 14); c.closePath();
    c.strokeStyle = accent;
    c.stroke();
  }

  const mastOffsets = entity.rank >= 3 ? BOSS_MASTS_HIGH_RANK : BOSS_MASTS;
  for (let m = 0; m < mastOffsets.length; m++) {
    const mx = mastOffsets[m];
    c.beginPath();
    c.moveTo(mx - 8, -22); c.lineTo(mx + 12, 0); c.lineTo(mx - 8, 22);
    if (tier === 0) { c.lineTo(mx - 2, 9); c.lineTo(mx - 9, 4); }
    c.closePath();
    c.fillStyle = sailCol;
    c.fill();
    c.strokeStyle = "#b71c1c";
    c.lineWidth = 2;
    c.stroke();
  }

  c.font = "24px sans-serif";
  c.textAlign = "center";
  c.fillText("☠️", 6, 8);

  c.restore();
  c.font = "bold 16px sans-serif";
  c.textAlign = "center";
  c.strokeStyle = "#241332";
  c.lineWidth = 4;
  const title = `${BOSS_TITLES[tier]} ${entity.rank}`;
  c.strokeText(title, entity.x, entity.y - 43);
  c.fillStyle = accent;
  c.fillText(title, entity.x, entity.y - 43);
}

export { drawAmmoCrate, drawBossGalleon, drawCannonball, drawHordePowerup, drawPirateShip, drawShip };

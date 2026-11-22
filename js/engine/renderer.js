import { drawMapBase, drawMapForeground, getMapCache } from "./map_cache.js";
import { MODE_HORDE, MODE_TEAMS, SEA_WAVES, STATE_ARENA, STATE_LOBBY, STATE_PODIUM, TOTAL_ROUNDS, V_HEIGHT, V_WIDTH, arenaBounds } from "./config.js";
import { updateTouchControlsVisibility } from "./controls.js";
import { renderFloatingTexts, renderParticles } from "./effects.js";
import { setLobbyUIVisible } from "./hud.js";
import { updateLobbyRoster, updatePodiumActions } from "./lobby.js";
import { needsMorePlayers, soloRoomOccupied } from "./modes.js";
import { state } from "./state.js";
import { fitLobby, offsetX, offsetY, scale } from "./viewport.js";

// Precomputar vértices trigonométricos para hexágonos
function traceMiniHeart(c) {
  c.beginPath();
  c.moveTo(0, 1.5);
  c.bezierCurveTo(-4, -3.5, -6, 1.5, 0, 5.5);
  c.bezierCurveTo(6, 1.5, 4, -3.5, 0, 1.5);
  c.closePath();
}

function drawMiniHeart(c, x, y, fillState) {
  c.save();
  c.translate(x, y);

  const isFull = (fillState === true || fillState >= 0.99);
  const isHalf = (!isFull && fillState >= 0.49);

  if (isFull) {
    traceMiniHeart(c);
    c.fillStyle = "#ff2a55";
    c.fill();
    c.strokeStyle = "#220008";
    c.lineWidth = 1.2;
    c.stroke();
  } else if (isHalf) {
    // Fondo oscuro
    traceMiniHeart(c);
    c.fillStyle = "rgba(15, 25, 35, 0.7)";
    c.fill();

    // Recorte de la mitad izquierda roja (clipping)
    c.save();
    c.beginPath();
    c.rect(-10, -10, 10, 20);
    c.clip();
    traceMiniHeart(c);
    c.fillStyle = "#ff2a55";
    c.fill();
    c.restore();

    // Borde exterior
    traceMiniHeart(c);
    c.strokeStyle = "#ff2a55";
    c.lineWidth = 1.2;
    c.stroke();
  } else {
    traceMiniHeart(c);
    c.fillStyle = "rgba(15, 25, 35, 0.7)";
    c.fill();
    c.strokeStyle = "rgba(255, 255, 255, 0.35)";
    c.lineWidth = 1;
    c.stroke();
  }
  c.restore();
}

function drawSymbolOnDeck(c, x, y, type, col, outline) {
  c.fillStyle = col;
  c.strokeStyle = outline;
  c.lineWidth = 1.5;
  if (type === "circle") {
    c.beginPath();
    c.arc(x, y, 4.5, 0, Math.PI * 2);
    c.fill(); c.stroke();
  } else if (type === "square") {
    c.fillRect(x - 4, y - 4, 8, 8);
    c.strokeRect(x - 4, y - 4, 8, 8);
  } else if (type === "triangle") {
    c.beginPath();
    c.moveTo(x, y - 5); c.lineTo(x + 5, y + 4); c.lineTo(x - 5, y + 4);
    c.closePath(); c.fill(); c.stroke();
  } else if (type === "diamond") {
    c.beginPath();
    c.moveTo(x, y - 5); c.lineTo(x + 4.5, y); c.lineTo(x, y + 5); c.lineTo(x - 4.5, y);
    c.closePath(); c.fill(); c.stroke();
  } else if (type === "star") {
    c.beginPath();
    for (let si = 0; si < 5; si++) {
      const aExt = (Math.PI * 2 / 5) * si - Math.PI / 2;
      const aInt = aExt + Math.PI / 5;
      c.lineTo(x + Math.cos(aExt) * 5, y + Math.sin(aExt) * 5);
      c.lineTo(x + Math.cos(aInt) * 2.5, y + Math.sin(aInt) * 2.5);
    }
    c.closePath(); c.fill(); c.stroke();
  } else if (type === "heart") {
    c.beginPath();
    c.arc(x - 2, y - 2, 2.5, 0, Math.PI * 2);
    c.arc(x + 2, y - 2, 2.5, 0, Math.PI * 2);
    c.fill();
  } else if (type === "crown") {
    c.beginPath();
    c.moveTo(x - 4, y + 4); c.lineTo(x - 4, y - 2); c.lineTo(x - 2, y + 1);
    c.lineTo(x, y - 4); c.lineTo(x + 2, y + 1); c.lineTo(x + 4, y - 2);
    c.lineTo(x + 4, y + 4);
    c.closePath(); c.fill();
  } else {
    c.beginPath();
    c.moveTo(x - 2, y - 5); c.lineTo(x + 1, y - 1); c.lineTo(x - 2, y + 1); c.lineTo(x + 2, y + 5);
    c.lineWidth = 2.2; c.stroke();
  }
}

// RENDERIZADO (Optimizado a 60 FPS)
function render(dt) {
  const remoteBar = document.getElementById("remote-player-bar");
  if (remoteBar) {
    const display = state.isRemoteClient && state.currentState === STATE_LOBBY ? "flex" : "none";
    if (remoteBar.style.display !== display) remoteBar.style.display = display;
  }
  updateTouchControlsVisibility();
  updatePodiumActions();
  const matchInvite = document.getElementById("match-invite");
  if (matchInvite) matchInvite.hidden = state.playMenuChoice === "solo" || state.isRemoteClient || state.currentState !== STATE_ARENA || !state.currentRoomCode || !window.drawQRCodeToCanvas;
  state.ctx.setTransform(1, 0, 0, 1, 0, 0);
  state.ctx.save();
  try {
    state.ctx.fillStyle = "#142557";
    state.ctx.fillRect(0, 0, state.canvas.width, state.canvas.height);

    // Centrado de resolución virtual 1920x1080
    state.ctx.translate(offsetX, offsetY);
    state.ctx.scale(scale, scale);

    // Screen Shake
    if (state.shakeTimer > 0) {
      const sX = (Math.random() - 0.5) * state.shakeIntensity;
      const sY = (Math.random() - 0.5) * state.shakeIntensity;
      state.ctx.translate(sX, sY);
    }

    if (state.currentState === STATE_LOBBY) {
      renderLobby();
    } else if (state.currentState === STATE_ARENA) {
      renderArena(dt);
    } else if (state.currentState === STATE_PODIUM) {
      renderPodium();
    }

  } finally { state.ctx.restore(); }
}

function renderLobby() {
  updateLobbyRoster();
  const waiting = needsMorePlayers();
  const occupied = soloRoomOccupied();
  const startButton = /** @type {HTMLButtonElement|null} */ (document.getElementById("btn-start-game"));
  const disabled = occupied || waiting || (state.isRemoteClient && !state.remoteIsHost);
  if (startButton && startButton.disabled !== disabled) startButton.disabled = disabled;
  const notice = document.getElementById("start-player-notice");
  if (notice) {
    let layoutChanged = false;
    const hidden = !waiting && !occupied;
    if (notice.hidden !== hidden) { notice.hidden = hidden; layoutChanged = true; }
    const message = occupied ? "Ya hay otros jugadores en esta sala. Elige una opción multijugador." :
      "Se necesitan al menos 2 jugadores. Si vas a jugar desde aquí, pulsa «Jugar en esta pantalla».";
    if (notice.textContent !== message) { notice.textContent = message; layoutChanged = true; }
    if (layoutChanged && state.canvas) fitLobby(state.canvas.width, state.canvas.height);
  }
  // Fondo del lobby
  const grad = state.ctx.createLinearGradient(0, 0, 0, V_HEIGHT);
  grad.addColorStop(0, "#2476d9");
  grad.addColorStop(1, "#372798");
  state.ctx.fillStyle = grad;
  state.ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);

  // Olas suaves
  state.ctx.strokeStyle = "rgba(0, 229, 255, 0.12)";
  state.ctx.lineWidth = 1.5;
  for (let wy = 50; wy < V_HEIGHT; wy += 90) {
    state.ctx.beginPath();
    for (let wx = 0; wx <= V_WIDTH; wx += 40) {
      const offY = Math.sin((wx * 0.008) + (state.waveAnim * 1.5) + wy) * 8;
      if (wx === 0) state.ctx.moveTo(wx, wy + offY);
      else state.ctx.lineTo(wx, wy + offY);
    }
    state.ctx.stroke();
  }

  // Barcos conectados
  for (let s = 0; s < state.activeShips.length; s++) {
    state.activeShips[s].draw(state.ctx);
  }

  renderParticles(0.016);
  setLobbyUIVisible(true);
}

function drawOceanSwell(c) {
  c.save();
  try {
    c.beginPath();
    c.rect(arenaBounds.x, arenaBounds.y, arenaBounds.w, arenaBounds.h);
    c.clip();
    c.lineCap = "round";
    // Frentes curvos y espuma fragmentada; sin franjas gruesas ni líneas discontinuas.
    for (let layer = 0; layer < 2; layer++) {
      const w = SEA_WAVES[layer];
      const length = Math.PI * 2 / w.k;
      const travel = state.waveAnim * w.rate / w.k;
      const base = (travel % length) + (Math.PI / 2 - layer * 1.7) / w.k;
      for (let row = -12; row <= 12; row++) {
        const crest = base + row * length;
        c.beginPath();
        for (let x = arenaBounds.x - 20; x <= arenaBounds.x + arenaBounds.w + 24; x += 24) {
          let y = (crest - x * w.x) / w.y;
          y += 8 * Math.sin(x * 0.014 + state.waveAnim * 0.7 + row);
          if (x === arenaBounds.x - 20) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.lineWidth = layer ? 9 : 18;
        c.strokeStyle = layer ? "rgba(80,221,247,0.07)" : "rgba(5,87,166,0.10)";
        c.stroke();
        c.lineWidth = layer ? 2 : 5;
        c.strokeStyle = "rgba(136,242,255,0.19)";
        c.stroke();
        // Espuma que nace y se desvanece en segmentos de las crestas.
        for (let j = 0; j < 13; j++) {
          const fx = arenaBounds.x + j * 112 + 22 * Math.sin(row * 2.4 + j);
          const fy = (crest - fx * w.x) / w.y +
            8 * Math.sin(fx * 0.014 + state.waveAnim * 0.7 + row);
          if (fy < arenaBounds.y - 20 || fy > arenaBounds.y + arenaBounds.h + 20) continue;
          const foam = Math.max(0, Math.sin(j * 2.3 + row * 1.9 + state.waveAnim * 0.8));
          if (foam < 0.25) continue;
          c.strokeStyle = "rgba(231,255,255," + (foam * 0.48) + ")";
          c.lineWidth = 1.5;
          c.beginPath();
          c.moveTo(fx, fy);
          c.quadraticCurveTo(fx + 10, fy - 2 - 10 * w.x / w.y, fx + 22, fy - 22 * w.x / w.y);
          c.stroke();
        }
      }
    }
  } finally { c.restore(); }
}

function renderArena(dt) {
  setLobbyUIVisible(false);

  const cache = getMapCache(state.islands, state.canvas.width, state.canvas.height, state.currentRound);
  drawMapBase(state.ctx, cache, state.islands);
  drawOceanSwell(state.ctx);
  drawMapForeground(state.ctx, cache, state.islands);

  // Cajas de munición y Mejoras de Horda
  for (let c = 0; c < state.ammoCrates.length; c++) state.ammoCrates[c].draw(state.ctx);
  for (let hp = 0; hp < state.hordePowerups.length; hp++) state.hordePowerups[hp].draw(state.ctx);

  // Proyectiles y partículas
  for (let b = 0; b < state.cannonballs.length; b++) state.cannonballs[b].draw(state.ctx);
  renderParticles(dt);

  // Barcos aliados, piratas y Jefe
  for (let s = 0; s < state.activeShips.length; s++) state.activeShips[s].draw(state.ctx);
  for (let pr = 0; pr < state.pirateShips.length; pr++) state.pirateShips[pr].draw(state.ctx);
  if (state.bossGalleon) state.bossGalleon.draw(state.ctx);

  // Delimitación visual de la zona jugable
  state.ctx.save();
  state.ctx.strokeStyle = "rgba(0, 229, 255, 0.35)";
  state.ctx.lineWidth = 2.5;
  state.ctx.strokeRect(arenaBounds.x, arenaBounds.y, arenaBounds.w, arenaBounds.h);

  // Bordes letales en modo Batalla durante Muerte Súbita
  if (state.selectedMode !== MODE_HORDE && state.suddenDeathActive) {
    const pulse = 0.65 + 0.35 * Math.sin(state.waveAnim * 4.0);
    state.ctx.strokeStyle = "rgba(255, 30, 30, " + pulse + ")";
    state.ctx.lineWidth = 6;
    state.ctx.strokeRect(state.currentBounds.x, state.currentBounds.y, state.currentBounds.w, state.currentBounds.h);
  }
  state.ctx.restore();

  // Textos flotantes
  renderFloatingTexts(dt);

  // HUD lateral rediseñado (100% altura de pantalla)
  renderHUD();
}

// Rediseño HUD Lateral: Franjas laterales recortadas NO jugables
const inMatchPlayers = [];

function renderHUD() {
  state.ctx.save();

  const panelW = 270;
  const leftPanelX = 0;
  const rightPanelX = 1650;
  const cardX_L = 15;
  const cardX_R = 1665;
  const cardW = 240;
  const cardH = 61;

  // Fondos laterales y bordes pre-renderizados en mapOffscreenCanvas (cero repintado redundante)

  // 2. Obtener ÚNICAMENTE los jugadores que están en partida
  inMatchPlayers.length = 0;
  for (let s = 0; s < state.activeShips.length; s++) {
    inMatchPlayers.push(state.activeShips[s].data);
  }

  if (state.selectedMode === MODE_TEAMS) {
    // === MODO BATALLA POR EQUIPOS ===
    // Cabecera Equipo Azul
    state.ctx.fillStyle = "rgba(13, 71, 161, 0.92)";
    state.ctx.fillRect(cardX_L, 20, cardW, 48);
    state.ctx.strokeStyle = "#42a5f5";
    state.ctx.lineWidth = 2;
    state.ctx.strokeRect(cardX_L, 20, cardW, 48);
    state.ctx.font = "bold 16px sans-serif";
    state.ctx.textAlign = "center";
    state.ctx.fillStyle = "#ffffff";
    state.ctx.fillText("🔵 EQUIPO AZUL", cardX_L + cardW / 2, 42);
    state.ctx.font = "bold 13px sans-serif";
    state.ctx.fillStyle = "#90caf9";
    state.ctx.fillText(state.teamScores.blue + " PUNTOS", cardX_L + cardW / 2, 60);

    // Tarjetas jugadores azules en partida
    let blueCount = 0;
    for (let i = 0; i < inMatchPlayers.length; i++) {
      if (inMatchPlayers[i].team === "blue") {
        drawPlayerHUDCard(cardX_L, 80 + blueCount * 96, cardW, cardH, inMatchPlayers[i]);
        blueCount++;
      }
    }
    if (blueCount === 0) {
      state.ctx.font = "italic 13px sans-serif";
      state.ctx.textAlign = "center";
      state.ctx.fillStyle = "#78909c";
      state.ctx.fillText("Sin jugadores", cardX_L + cardW / 2, 120);
    }

    // Cabecera Equipo Rojo
    state.ctx.fillStyle = "rgba(183, 28, 28, 0.92)";
    state.ctx.fillRect(cardX_R, 20, cardW, 48);
    state.ctx.strokeStyle = "#ef5350";
    state.ctx.lineWidth = 2;
    state.ctx.strokeRect(cardX_R, 20, cardW, 48);
    state.ctx.font = "bold 16px sans-serif";
    state.ctx.textAlign = "center";
    state.ctx.fillStyle = "#ffffff";
    state.ctx.fillText("🔴 EQUIPO ROJO", cardX_R + cardW / 2, 42);
    state.ctx.font = "bold 13px sans-serif";
    state.ctx.fillStyle = "#ffab91";
    state.ctx.fillText(state.teamScores.red + " PUNTOS", cardX_R + cardW / 2, 60);

    // Tarjetas jugadores rojos en partida
    let redCount = 0;
    for (let j = 0; j < inMatchPlayers.length; j++) {
      if (inMatchPlayers[j].team === "red") {
        drawPlayerHUDCard(cardX_R, 80 + redCount * 96, cardW, cardH, inMatchPlayers[j]);
        redCount++;
      }
    }
    if (redCount === 0) {
      state.ctx.font = "italic 13px sans-serif";
      state.ctx.textAlign = "center";
      state.ctx.fillStyle = "#78909c";
      state.ctx.fillText("Sin jugadores", cardX_R + cardW / 2, 120);
    }

  } else if (state.selectedMode === MODE_HORDE) {
    // === MODO HORDA PIRATA (ZOMBIES) ===
    // Cabecera Flota Aliada
    state.ctx.fillStyle = "rgba(10, 28, 44, 0.92)";
    state.ctx.fillRect(cardX_L, 20, cardW, 48);
    state.ctx.strokeStyle = "#00e5ff";
    state.ctx.lineWidth = 2;
    state.ctx.strokeRect(cardX_L, 20, cardW, 48);
    state.ctx.font = "bold 16px sans-serif";
    state.ctx.textAlign = "center";
    state.ctx.fillStyle = "#00e5ff";
    state.ctx.fillText("⚓ FLOTA ALIADA", cardX_L + cardW / 2, 42);
    state.ctx.font = "bold 13px sans-serif";
    state.ctx.fillStyle = "#ffffff";
    state.ctx.fillText("OLEADA " + state.currentWave, cardX_L + cardW / 2, 60);

    // Tarjetas de aliados en partida
    for (let a = 0; a < inMatchPlayers.length; a++) {
      drawPlayerHUDCard(cardX_L, 80 + a * 96, cardW, cardH, inMatchPlayers[a]);
    }

    // Panel de Mejoras Globales (Pack-a-Punch) en panel derecho
    state.ctx.fillStyle = "rgba(10, 28, 44, 0.95)";
    state.ctx.fillRect(cardX_R, 20, cardW, 305);
    state.ctx.strokeStyle = "#ffd700";
    state.ctx.lineWidth = 2;
    state.ctx.strokeRect(cardX_R, 20, cardW, 305);

    state.ctx.font = "bold 16px sans-serif";
    state.ctx.textAlign = "center";
    state.ctx.fillStyle = "#ffd700";
    state.ctx.fillText("⭐ MEJORAS EQUIPO", cardX_R + cardW / 2, 48);

    state.ctx.font = "14px sans-serif";
    state.ctx.textAlign = "left";
    const upY = 82;

    state.ctx.fillStyle = "#ff4081";
    state.ctx.fillText("💥 Armas: Nivel " + state.hordeUpgrades.weaponLevel, cardX_R + 16, upY);
    state.ctx.fillStyle = "#bbbbbb";
    state.ctx.font = "12px sans-serif";
    const wTitle = (state.hordeUpgrades.weaponLevel === 1) ? "Disparo simple" : (state.hordeUpgrades.weaponLevel === 2 ? "Doble cañón" : "Disparo triple");
    state.ctx.fillText(wTitle, cardX_R + 34, upY + 18);

    state.ctx.font = "14px sans-serif";
    state.ctx.fillStyle = "#29b6f6";
    state.ctx.fillText("📦 Munición: Máx " + state.hordeUpgrades.maxAmmo, cardX_R + 16, upY + 52);

    state.ctx.fillStyle = "#ffd700";
    state.ctx.fillText("🛡️ Casco: " + state.hordeUpgrades.maxHealth + " Vidas", cardX_R + 16, upY + 90);

    state.ctx.fillStyle = "#00e676";
    state.ctx.fillText("💚 Revivir Usados: " + state.hordeUpgrades.repairs, cardX_R + 16, upY + 128);

    // Contador de piratas restantes
    state.ctx.fillStyle = "#ffffff";
    state.ctx.font = "bold 15px sans-serif";
    state.ctx.textAlign = "center";
    state.ctx.fillText("☠️ Piratas: " + (state.pirateShips.length + state.waveEnemiesToSpawn), cardX_R + cardW / 2, upY + 185);

  } else {
    // === MODO TODOS CONTRA TODOS (BATTLE) ===
    // Cabecera Panel Izquierdo
    state.ctx.fillStyle = "rgba(10, 28, 44, 0.92)";
    state.ctx.fillRect(cardX_L, 20, cardW, 48);
    state.ctx.strokeStyle = "#ffd700";
    state.ctx.lineWidth = 2;
    state.ctx.strokeRect(cardX_L, 20, cardW, 48);
    state.ctx.font = "bold 16px sans-serif";
    state.ctx.textAlign = "center";
    state.ctx.fillStyle = "#ffd700";
    state.ctx.fillText("⚔️ CAPITANES", cardX_L + cardW / 2, 42);
    state.ctx.font = "bold 13px sans-serif";
    state.ctx.fillStyle = "#ffffff";
    state.ctx.fillText("RONDA " + Math.min(state.currentRound, TOTAL_ROUNDS) + " / " + TOTAL_ROUNDS, cardX_L + cardW / 2, 60);

    if (inMatchPlayers.length <= 1) {
      if (inMatchPlayers.length === 1) {
        drawPlayerHUDCard(cardX_L, 80, cardW, cardH, inMatchPlayers[0]);
      }
      state.ctx.fillStyle = "rgba(10, 28, 44, 0.92)";
      state.ctx.fillRect(cardX_R, 20, cardW, 48);
      state.ctx.strokeStyle = "#00e5ff";
      state.ctx.lineWidth = 2;
      state.ctx.strokeRect(cardX_R, 20, cardW, 48);
      state.ctx.font = "bold 16px sans-serif";
      state.ctx.textAlign = "center";
      state.ctx.fillStyle = "#00e5ff";
      state.ctx.fillText("🏆 TORNEO", cardX_R + cardW / 2, 42);
      state.ctx.font = "bold 13px sans-serif";
      state.ctx.fillStyle = "#ffffff";
      state.ctx.fillText("10 RONDAS", cardX_R + cardW / 2, 60);
    } else if (inMatchPlayers.length === 2) {
      // Exactamente 2 jugadores: Duelo 1 vs 1 perfecto
      drawPlayerHUDCard(cardX_L, 80, cardW, cardH, inMatchPlayers[0]);

      state.ctx.fillStyle = "rgba(10, 28, 44, 0.92)";
      state.ctx.fillRect(cardX_R, 20, cardW, 48);
      state.ctx.strokeStyle = "#ffd700";
      state.ctx.lineWidth = 2;
      state.ctx.strokeRect(cardX_R, 20, cardW, 48);
      state.ctx.font = "bold 16px sans-serif";
      state.ctx.textAlign = "center";
      state.ctx.fillStyle = "#ffd700";
      state.ctx.fillText("⚔️ RIVAL", cardX_R + cardW / 2, 42);
      state.ctx.font = "bold 13px sans-serif";
      state.ctx.fillStyle = "#ffffff";
      state.ctx.fillText("RONDA " + Math.min(state.currentRound, TOTAL_ROUNDS) + " / " + TOTAL_ROUNDS, cardX_R + cardW / 2, 60);

      drawPlayerHUDCard(cardX_R, 80, cardW, cardH, inMatchPlayers[1]);
    } else {
      // 3 o más jugadores: dividir equitativamente
      const half = Math.ceil(inMatchPlayers.length / 2);
      for (let p1 = 0; p1 < half; p1++) {
        drawPlayerHUDCard(cardX_L, 80 + p1 * 96, cardW, cardH, inMatchPlayers[p1]);
      }

      state.ctx.fillStyle = "rgba(10, 28, 44, 0.92)";
      state.ctx.fillRect(cardX_R, 20, cardW, 48);
      state.ctx.strokeStyle = "#ffd700";
      state.ctx.lineWidth = 2;
      state.ctx.strokeRect(cardX_R, 20, cardW, 48);
      state.ctx.font = "bold 16px sans-serif";
      state.ctx.textAlign = "center";
      state.ctx.fillStyle = "#ffd700";
      state.ctx.fillText("⚔️ CAPITANES", cardX_R + cardW / 2, 42);
      state.ctx.font = "bold 13px sans-serif";
      state.ctx.fillStyle = "#ffffff";
      state.ctx.fillText("RONDA " + Math.min(state.currentRound, TOTAL_ROUNDS) + " / " + TOTAL_ROUNDS, cardX_R + cardW / 2, 60);

      for (let p2 = half; p2 < inMatchPlayers.length; p2++) {
        drawPlayerHUDCard(cardX_R, 80 + (p2 - half) * 96, cardW, cardH, inMatchPlayers[p2]);
      }
    }
  }

  // === CENTRO SUPERIOR: Ronda / Oleada y Barra del Jefe ===
  if (state.bossGalleon && state.bossGalleon.isAlive) {
    // Barra gigante de vida del Jefe Final
    const barX = 560;
    const barY = 25;
    const barW = 800;
    const barH = 34;
    const hpPct = Math.max(0, Math.min(1, state.bossGalleon.health / state.bossGalleon.maxHealth));

    state.ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    state.ctx.fillRect(barX, barY, barW, barH);
    state.ctx.strokeStyle = "#ffd700";
    state.ctx.lineWidth = 3;
    state.ctx.strokeRect(barX, barY, barW, barH);

    const bGrad = state.ctx.createLinearGradient(barX, 0, barX + barW, 0);
    bGrad.addColorStop(0, "#ffd700");
    bGrad.addColorStop(1, "#ff1744");
    state.ctx.fillStyle = bGrad;
    state.ctx.fillRect(barX + 3, barY + 3, (barW - 6) * hpPct, barH - 6);

    state.ctx.font = "bold 18px sans-serif";
    state.ctx.textAlign = "center";
    state.ctx.fillStyle = "#ffffff";
    state.ctx.strokeStyle = "#000000";
    state.ctx.lineWidth = 3;
    const bossLabel = "☠️ GALEÓN JEFE PIRATA - " + Math.max(0, Math.ceil(state.bossGalleon.health)) + " / " + state.bossGalleon.maxHealth + " ☠️";
    state.ctx.strokeText(bossLabel, 960, barY + 24);
    state.ctx.fillText(bossLabel, 960, barY + 24);
  } else {
    // Indicador Central de Ronda
    state.ctx.font = "bold 24px sans-serif";
    state.ctx.textAlign = "center";
    state.ctx.fillStyle = "#FFE082";
    state.ctx.strokeStyle = "#000000";
    state.ctx.lineWidth = 4;
    const roundTxt = (state.selectedMode === MODE_HORDE) ?
      ("🌊 OLEADA " + state.currentWave + " 🌊") :
      ("RONDA " + Math.min(state.currentRound, TOTAL_ROUNDS) + " DE " + TOTAL_ROUNDS);
    state.ctx.strokeText(roundTxt, 960, 48);
    state.ctx.fillText(roundTxt, 960, 48);
  }

  // Cuenta atrás central
  if (state.countdownTime > 0) {
    let txt = "3";
    let col = "#FF2A2A";
    if (state.countdownTime > 2.5) { txt = "3"; col = "#FF2A2A"; }
    else if (state.countdownTime > 1.5) { txt = "2"; col = "#FFEA00"; }
    else if (state.countdownTime > 0.5) { txt = "1"; col = "#00E676"; }
    else { txt = "¡FUEGO!"; col = "#00E5FF"; }

    state.ctx.font = "bold 88px sans-serif";
    state.ctx.textAlign = "center";
    state.ctx.fillStyle = col;
    state.ctx.strokeStyle = "#000000";
    state.ctx.lineWidth = 6;
    state.ctx.strokeText(txt, 960, 540);
    state.ctx.fillText(txt, 960, 540);
  }

  // Ganador de ronda
  if (state.roundWinner) {
    state.ctx.font = "bold 44px sans-serif";
    state.ctx.textAlign = "center";
    state.ctx.fillStyle = state.roundWinner.hull || "#ffffff";
    state.ctx.strokeStyle = "#000000";
    state.ctx.lineWidth = 5;
    const wTxt = (state.roundWinner.name.indexOf("¡") !== -1) ?
      state.roundWinner.name : "¡" + (state.roundWinner.customName || state.roundWinner.name).toUpperCase() + " GANA LA RONDA!";
    state.ctx.strokeText(wTxt, 960, 480);
    state.ctx.fillText(wTxt, 960, 480);
  }

  state.ctx.restore();
}

function drawPlayerHUDCard(x, y, w, h, player) {
  // Buscar el barco activo asociado para obtener vidas y munición en tiempo real
  let ship = null;
  for (let s = 0; s < state.activeShips.length; s++) {
    if (state.activeShips[s].slot === player.slot) {
      ship = state.activeShips[s];
      break;
    }
  }

  const curHealth = ship ? ship.health : 3;
  const curMaxHealth = ship ? ship.maxHealth : 3;
  const curAmmo = ship ? ship.ammo : 3;
  const curMaxAmmo = ship ? ship.maxAmmo : 3;
  const isAlive = ship ? ship.isAlive : true;

  state.ctx.fillStyle = isAlive ? "rgba(10, 18, 28, 0.88)" : "rgba(35, 10, 10, 0.75)";
  state.ctx.fillRect(x, y, w, h);
  state.ctx.strokeStyle = isAlive ? player.hull : "#555555";
  state.ctx.lineWidth = 2.5;
  state.ctx.strokeRect(x, y, w, h);

  // Nombre del jugador (personalizado o por defecto)
  const nameStr = player.customName || player.name;
  state.ctx.font = "bold 15px sans-serif";
  state.ctx.textAlign = "left";
  state.ctx.fillStyle = isAlive ? "#ffffff" : "#888888";
  state.ctx.fillText(nameStr, x + 12, y + 24);

  state.ctx.font = "bold 14px sans-serif";
  state.ctx.fillStyle = "#ff9eaa";
  state.ctx.fillText("Vida " + Math.max(0, curHealth) + "/" + curMaxHealth, x + 12, y + 46);
  state.ctx.textAlign = "right";
  state.ctx.fillStyle = "#ffe587";
  state.ctx.fillText("Balas " + curAmmo + "/" + curMaxAmmo, x + w - 12, y + 46);
}

function renderPodium() {
  setLobbyUIVisible(false);

  // Fondo podio
  state.ctx.fillStyle = "#1A4B75";
  state.ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);

  let sorted = [];
  for (let i = 0; i < state.playersData.length; i++) {
    if (state.playersData[i].connected) sorted.push(state.playersData[i]);
  }
  if (sorted.length === 0) sorted = [state.playersData[0], state.playersData[1]];

  sorted.sort((a, b) => {
    return b.score - a.score;
  });

  state.ctx.font = "bold 44px sans-serif";
  state.ctx.textAlign = "center";
  state.ctx.fillStyle = sorted[0].hull;
  state.ctx.strokeStyle = "#000000";
  state.ctx.lineWidth = 4;

  let champTxt = "👑 ¡" + (sorted[0].customName || sorted[0].name).toUpperCase() + " ES EL CAMPEÓN! 👑";
  if (state.selectedMode === MODE_TEAMS) {
    const winTeam = (state.teamScores.blue >= state.teamScores.red) ? "EQUIPO AZUL" : "EQUIPO ROJO";
    champTxt = "👑 ¡" + winTeam + " ES EL CAMPEÓN DEL TORNEO! 👑";
  } else if (state.selectedMode === MODE_HORDE) {
    champTxt = "🌊 ¡LA FLOTA RESISTIÓ HASTA LA OLEADA " + state.currentWave + "! 🌊";
  }
  state.ctx.strokeText(champTxt, 960, 110);
  state.ctx.fillText(champTxt, 960, 110);

  // Columnas de podio
  const count = sorted.length;
  const baseY = 860;
  const maxH = 480;
  const minH = 160;
  const totalW = 1560;
  const startX = 180;
  const spacing = 16;
  const colW = (totalW - spacing * (count - 1)) / count;

  for (let j = 0; j < count; j++) {
    const p = sorted[j];
    const colH = minH + (maxH - minH) * (1 - j / Math.max(1, count - 1));
    const cX = startX + j * (colW + spacing);
    const cY = baseY - colH;

    state.ctx.fillStyle = p.hull;
    state.ctx.fillRect(cX, cY, colW, colH);
    state.ctx.strokeStyle = "#ffffff";
    state.ctx.lineWidth = 3;
    state.ctx.strokeRect(cX, cY, colW, colH);

    state.ctx.font = "bold 28px sans-serif";
    state.ctx.fillStyle = "#ffffff";
    state.ctx.textAlign = "center";
    state.ctx.fillText((j + 1) + "°", cX + colW / 2, cY + 45);

    state.ctx.font = "bold 18px sans-serif";
    state.ctx.fillText(p.customName || p.name, cX + colW / 2, cY + 85);

    state.ctx.fillStyle = "#ffea00";
    state.ctx.fillText(p.score + " pts", cX + colW / 2, cY + 120);
  }

}

export { drawMiniHeart, drawSymbolOnDeck, render };

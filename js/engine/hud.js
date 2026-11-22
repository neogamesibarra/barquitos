import { gameEvents } from "./events.js";
import { MODE_HORDE, MODE_TEAMS, STATE_ARENA, STATE_PODIUM, TOTAL_ROUNDS, V_HEIGHT, V_WIDTH } from "./config.js";
import { recordHordeScore } from "./leaderboard.js";
import { state } from "./state.js";
import { offsetX, offsetY, scale } from "./viewport.js";

// Desacoplamiento del HUD lateral en DOM (Cero manipulación en bucle de 60 FPS)
const cachedHUD = {
  leftEl: null,
  rightEl: null,
  cards: {},
  teamBlueScore: null,
  teamRedScore: null,
  hordeWave: null,
  hordeUpgrades: null
};

function initHUDPanels() {
  cachedHUD.leftEl = document.getElementById("hud-panel-left");
  cachedHUD.rightEl = document.getElementById("hud-panel-right");
  if (!cachedHUD.leftEl || !cachedHUD.rightEl) return;

  cachedHUD.cards = {};
  cachedHUD.leftEl.innerHTML = "";
  cachedHUD.rightEl.innerHTML = "";

  const panelW = 270;
  cachedHUD.leftEl.style.left = offsetX + "px";
  cachedHUD.leftEl.style.top = offsetY + "px";
  cachedHUD.leftEl.style.width = (panelW * scale) + "px";
  cachedHUD.leftEl.style.height = (V_HEIGHT * scale) + "px";
  cachedHUD.leftEl.style.transform = "scale(" + scale + ")";
  cachedHUD.leftEl.style.transformOrigin = "top left";
  cachedHUD.leftEl.style.display = (state.currentState === STATE_ARENA) ? "flex" : "none";

  cachedHUD.rightEl.style.left = (offsetX + (V_WIDTH - panelW) * scale) + "px";
  cachedHUD.rightEl.style.top = offsetY + "px";
  cachedHUD.rightEl.style.width = (panelW * scale) + "px";
  cachedHUD.rightEl.style.height = (V_HEIGHT * scale) + "px";
  cachedHUD.rightEl.style.transform = "scale(" + scale + ")";
  cachedHUD.rightEl.style.transformOrigin = "top left";
  cachedHUD.rightEl.style.display = (state.currentState === STATE_ARENA) ? "flex" : "none";

  if (state.selectedMode === MODE_TEAMS) {
    const hBlue = document.createElement("div");
    hBlue.className = "hud-panel-header blue";
    hBlue.innerHTML = "<div>🔵 EQUIPO AZUL</div><div class='hud-header-sub' id='hud-blue-score'>" + state.teamScores.blue + " PUNTOS</div>";
    cachedHUD.leftEl.appendChild(hBlue);
    cachedHUD.teamBlueScore = hBlue.querySelector("#hud-blue-score");

    const hRed = document.createElement("div");
    hRed.className = "hud-panel-header red";
    hRed.innerHTML = "<div>🔴 EQUIPO ROJO</div><div class='hud-header-sub' id='hud-red-score'>" + state.teamScores.red + " PUNTOS</div>";
    cachedHUD.rightEl.appendChild(hRed);
    cachedHUD.teamRedScore = hRed.querySelector("#hud-red-score");

    for (let s = 0; s < state.activeShips.length; s++) {
      const sh = state.activeShips[s];
      const parentEl = (sh.data.team === "red") ? cachedHUD.rightEl : cachedHUD.leftEl;
      createPlayerHUDCard(parentEl, sh);
    }
  } else if (state.selectedMode === MODE_HORDE) {
    const hHorde = document.createElement("div");
    hHorde.className = "hud-panel-header horde";
    hHorde.innerHTML = "<div>⚓ FLOTA ALIADA</div><div class='hud-header-sub' id='hud-horde-wave'>OLEADA " + state.currentWave + "</div>";
    cachedHUD.leftEl.appendChild(hHorde);
    cachedHUD.hordeWave = hHorde.querySelector("#hud-horde-wave");

    for (let a = 0; a < state.activeShips.length; a++) {
      createPlayerHUDCard(cachedHUD.leftEl, state.activeShips[a]);
    }

    const upBox = document.createElement("div");
    upBox.className = "hud-horde-upgrades-box";
    upBox.id = "hud-horde-upgrades";
    upBox.innerHTML = "<h4>⭐ MEJORAS EQUIPO</h4>" +
      "<div class='hud-horde-item' style='color:#ff4081;'>💥 Armas: Nivel <span id='hud-w-lvl'>" + state.hordeUpgrades.weaponLevel + "</span></div>" +
      "<div class='hud-horde-item' style='color:#29b6f6;'>📦 Munición: Máx <span id='hud-m-ammo'>" + state.hordeUpgrades.maxAmmo + "</span></div>" +
      "<div class='hud-horde-item' style='color:#ffd700;'>🛡️ Casco: <span id='hud-m-hp'>" + state.hordeUpgrades.maxHealth + "</span> Vidas</div>" +
      "<div class='hud-horde-item' style='color:#00e676;'>💚 Revivir Usados: <span id='hud-rep-cnt'>" + state.hordeUpgrades.repairs + "</span></div>" +
      "<div class='hud-horde-pirates-count'>☠️ Piratas: <span id='hud-pir-cnt'>" + (state.pirateShips.length + state.waveEnemiesToSpawn) + "</span></div>";
    cachedHUD.rightEl.appendChild(upBox);
    cachedHUD.hordeUpgrades = upBox;
  } else {
    const hBatL = document.createElement("div");
    hBatL.className = "hud-panel-header battle";
    hBatL.innerHTML = "<div>⚔️ JUGADORES 1-4</div><div class='hud-header-sub'>RONDA " + state.currentRound + "/" + TOTAL_ROUNDS + "</div>";
    cachedHUD.leftEl.appendChild(hBatL);

    const hBatR = document.createElement("div");
    hBatR.className = "hud-panel-header battle";
    hBatR.innerHTML = "<div>⚔️ JUGADORES 5-8</div><div class='hud-header-sub'>COMBATE NAVAL</div>";
    cachedHUD.rightEl.appendChild(hBatR);

    for (let b = 0; b < state.activeShips.length; b++) {
      const shB = state.activeShips[b];
      const parentB = (shB.slot < 4) ? cachedHUD.leftEl : cachedHUD.rightEl;
      createPlayerHUDCard(parentB, shB);
    }
  }
}

function createPlayerHUDCard(parentEl, ship) {
  const p = ship.data;
  const card = document.createElement("div");
  card.className = "hud-card";
  card.style.borderLeftColor = p.hull || "#00e5ff";
  card.style.borderLeftWidth = "4px";

  const topRow = document.createElement("div");
  topRow.className = "hud-card-top";

  const nameSpan = document.createElement("span");
  nameSpan.className = "hud-card-name";
  nameSpan.textContent = p.customName || p.name;
  nameSpan.style.color = p.hull || "#ffffff";

  const statusSpan = document.createElement("span");
  statusSpan.className = "hud-card-status " + (ship.isAlive ? "alive" : "sunk");
  statusSpan.textContent = ship.isAlive ? "VIVO" : "HUNDIDO";

  topRow.appendChild(nameSpan);
  topRow.appendChild(statusSpan);

  const track = document.createElement("div");
  track.className = "hud-health-track";
  const fill = document.createElement("div");
  fill.className = "hud-health-fill";
  const pct = Math.max(0, Math.min(100, (ship.health / ship.maxHealth) * 100));
  fill.style.width = pct + "%";
  track.appendChild(fill);

  const botRow = document.createElement("div");
  botRow.className = "hud-card-bottom";

  const ammoSpan = document.createElement("span");
  ammoSpan.className = "hud-ammo-text";
  let ammoDots = "";
  for (let a = 0; a < ship.ammo; a++) ammoDots += "● ";
  ammoSpan.textContent = ammoDots || "RECARGANDO...";

  const scoreSpan = document.createElement("span");
  scoreSpan.className = "hud-score-text";
  scoreSpan.textContent = p.score + " PTS";

  botRow.appendChild(ammoSpan);
  botRow.appendChild(scoreSpan);

  card.appendChild(topRow);
  card.appendChild(track);
  card.appendChild(botRow);

  parentEl.appendChild(card);

  cachedHUD.cards[ship.slot] = {
    cardEl: card,
    nameEl: nameSpan,
    statusEl: statusSpan,
    healthFill: fill,
    ammoEl: ammoSpan,
    scoreEl: scoreSpan,
    lastHp: ship.health,
    lastMaxHp: ship.maxHealth,
    lastAmmo: ship.ammo,
    lastAlive: ship.isAlive,
    lastScore: p.score
  };
}

function updateShipHUD(slot) {
  const c = cachedHUD.cards[slot];
  if (!c) return;
  let ship = null;
  for (let i = 0; i < state.activeShips.length; i++) {
    if (state.activeShips[i].slot === slot) {
      ship = state.activeShips[i];
      break;
    }
  }
  if (!ship) return;

  if (c.lastHp !== ship.health || c.lastMaxHp !== ship.maxHealth) {
    c.lastHp = ship.health;
    c.lastMaxHp = ship.maxHealth;
    const pct = Math.max(0, Math.min(100, (ship.health / ship.maxHealth) * 100));
    c.healthFill.style.width = pct + "%";
    if (pct < 30) c.healthFill.style.backgroundColor = "#ff1744";
    else if (pct < 60) c.healthFill.style.backgroundColor = "#ffd600";
    else c.healthFill.style.backgroundColor = "#00e676";
  }

  if (c.lastAlive !== ship.isAlive) {
    c.lastAlive = ship.isAlive;
    c.statusEl.className = "hud-card-status " + (ship.isAlive ? "alive" : "sunk");
    c.statusEl.textContent = ship.isAlive ? "VIVO" : "HUNDIDO";
    if (!ship.isAlive) {
      c.cardEl.className = "hud-card sunk";
    } else {
      c.cardEl.className = "hud-card";
    }
  }

  if (c.lastAmmo !== ship.ammo) {
    c.lastAmmo = ship.ammo;
    let dots = "";
    for (let a = 0; a < ship.ammo; a++) dots += "● ";
    c.ammoEl.textContent = dots || "RECARGANDO...";
  }

  if (c.lastScore !== ship.data.score) {
    c.lastScore = ship.data.score;
    c.scoreEl.textContent = ship.data.score + " PTS";
  }
}

function updateAllShipsHUD() {
  for (let slot in cachedHUD.cards) {
    updateShipHUD(parseInt(slot, 10));
  }
}

function updateTeamScoresHUD() {
  if (cachedHUD.teamBlueScore) cachedHUD.teamBlueScore.textContent = state.teamScores.blue + " PUNTOS";
  if (cachedHUD.teamRedScore) cachedHUD.teamRedScore.textContent = state.teamScores.red + " PUNTOS";
}

function updateHordeUpgradesHUD() {
  if (!cachedHUD.hordeUpgrades) return;
  const wLvl = document.getElementById("hud-w-lvl");
  const mAmmo = document.getElementById("hud-m-ammo");
  const mHp = document.getElementById("hud-m-hp");
  const rCnt = document.getElementById("hud-rep-cnt");
  const pCnt = document.getElementById("hud-pir-cnt");
  if (wLvl) wLvl.textContent = String(state.hordeUpgrades.weaponLevel);
  if (mAmmo) mAmmo.textContent = String(state.hordeUpgrades.maxAmmo);
  if (mHp) mHp.textContent = String(state.hordeUpgrades.maxHealth);
  if (rCnt) rCnt.textContent = String(state.hordeUpgrades.repairs);
  if (pCnt) pCnt.textContent = String(state.pirateShips.length + state.waveEnemiesToSpawn);
}

function setLobbyUIVisible(visible) {
  if (!state.elLobbyUI) {
    state.elLobbyUI = document.getElementById("lobby-ui");
  }
  if (state.elLobbyUI) {
    const targetDisplay = visible ? "flex" : "none";
    if (state.elLobbyUI.style.display !== targetDisplay) {
      state.elLobbyUI.style.display = targetDisplay;
    }
  }
  const pL = document.getElementById("hud-panel-left");
  const pR = document.getElementById("hud-panel-right");
  if (pL) pL.style.display = "none";
  if (pR) pR.style.display = "none";
}

function updatePauseOverlay() {
  const overlay = document.getElementById("pause-overlay");
  if (overlay) overlay.hidden = !state.isPaused || state.currentState !== STATE_ARENA;
  const actions = document.getElementById("pause-actions");
  if (actions) actions.hidden = state.isRemoteClient;
}

let rankingRequest = 0;

function updateHordeLeaderboardVisibility() {
  if (state.currentState === STATE_PODIUM && state.selectedMode === MODE_HORDE) return;
  rankingRequest++;
  const panel = document.getElementById("horde-leaderboard");
  if (panel) panel.hidden = true;
}

/** @param {Parameters<typeof recordHordeScore>[0]} result */
async function showHordeLeaderboard(result) {
  const request = ++rankingRequest;
  const panel = document.getElementById("horde-leaderboard");
  const status = document.getElementById("horde-ranking-status");
  const rows = document.getElementById("horde-ranking-rows");
  if (panel && status && rows) {
    panel.hidden = false;
    status.textContent = "Cargando puntajes…";
    rows.replaceChildren();
  }

  const { entries, entry, global } = await recordHordeScore(result);
  if (!panel || !status || !rows || request !== rankingRequest || state.currentState !== STATE_PODIUM) return;
  status.textContent = global ? "Ranking global" : "Ranking local";
  for (let index = 0; index < entries.length; index++) {
    const item = entries[index];
    const row = document.createElement("tr");
    const latest = item.id === entry.id;
    row.classList.toggle("latest-score", latest);
    for (const value of [index + 1, item.players.join(", "), item.wave, item.score]) {
      const cell = document.createElement("td");
      cell.textContent = String(value);
      row.append(cell);
    }
    if (latest) row.cells[0].setAttribute("aria-label", "Puesto " + (index + 1) + ", tu partida");
    rows.append(row);
  }
}

gameEvents.on('ship:hud', updateShipHUD);

export { setLobbyUIVisible, showHordeLeaderboard, updateHordeLeaderboardVisibility, updatePauseOverlay, updateAllShipsHUD, updateHordeUpgradesHUD, updateShipHUD, updateTeamScoresHUD };

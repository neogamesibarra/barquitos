import { clearParticles } from "./effects.js";
import { gameEvents } from "./events.js";
import { ARENA_ISLANDS, MODE_HORDE, MODE_TEAMS, STATE_ARENA, STATE_PODIUM, TOTAL_ROUNDS, arenaBounds } from "./config.js";
import { ensureLocalPlayer, releaseLocalInputs } from "./controls.js";
import { clearCannonballs, AmmoCrate, Island, BossGalleon, PirateShip, Ship } from "./entities.js";
import { setLobbyUIVisible, showHordeLeaderboard, updateHordeLeaderboardVisibility, updatePauseOverlay } from "./hud.js";
import { requestLobbyAction } from "./lobby.js";
import { sendTvAction } from "./multiplayer.js";
import { getSafeSpawnPoint, stepBattlePhysics, stepHordeCollisions } from "./physics.js";
import { state } from "./state.js";

function applyGlobalPowerup(type, collector) {
  gameEvents.emit("sound:powerup");
  gameEvents.emit("effect:shake", 0.3, 8);
  sendTvAction("vibrate", null, [100, 60, 140]);

  state.hordeUpgrades.maxHealth += 0.5;
  for (let life = 0; life < state.activeShips.length; life++) {
    const ally = state.activeShips[life];
    ally.maxHealth = state.hordeUpgrades.maxHealth;
    if (type !== 0 && ally.isAlive) ally.health = Math.min(ally.maxHealth, ally.health + 1);
  }

  if (type === 0) {
    // Cura hasta 10 puntos y revive a los caídos con hasta 10.
    state.hordeUpgrades.repairs++;
    for (let r = 0; r < state.activeShips.length; r++) {
      const sh = state.activeShips[r];
      if (!sh.isAlive) {
        sh.isAlive = true;
        sh.health = Math.min(sh.maxHealth, 10);
        sh.x = 960 + (Math.random() - 0.5) * 180;
        sh.y = 540 + (Math.random() - 0.5) * 180;
        sh.vx = 0; sh.vy = 0;
      } else {
        sh.health = Math.min(sh.maxHealth, sh.health + 10);
      }
    }
    gameEvents.emit("effect:text", "💚 ¡+10 VIDA Y REVIVIR!", collector.x, collector.y - 45, "#00e676", 42);
  } else if (type === 1) {
    // Bodega Ampliada (+1 max ammo)
    state.hordeUpgrades.maxAmmo++;
    for (let a = 0; a < state.activeShips.length; a++) {
      state.activeShips[a].maxAmmo = state.hordeUpgrades.maxAmmo;
    }
    gameEvents.emit("effect:text", "📦 ¡BODEGA AMPLIADA! (MÁX " + state.hordeUpgrades.maxAmmo + " BALAS)", collector.x, collector.y - 45, "#29b6f6", 38);
  } else if (type === 2) {
    // Munición Máxima
    for (let m = 0; m < state.activeShips.length; m++) {
      state.activeShips[m].ammo = state.activeShips[m].maxAmmo;
    }
    gameEvents.emit("effect:text", "⚡ ¡MUNICIÓN MÁXIMA PARA TODOS!", collector.x, collector.y - 45, "#ffea00", 42);
  } else if (type === 3) {
    // Pack-a-Punch (Armas mejoradas)
    state.hordeUpgrades.weaponLevel++;
    const wName = (state.hordeUpgrades.weaponLevel === 2) ? "DOBLE CAÑÓN" : (state.hordeUpgrades.weaponLevel === 3 ? "TRIPLE DISPARO" : "CAÑONES HIPER");
    gameEvents.emit("effect:text", "💥 ¡PACK-A-PUNCH! " + wName + " (NV " + state.hordeUpgrades.weaponLevel + ")", collector.x, collector.y - 45, "#ff4081", 40);
  } else if (type === 4) {
    // La reparación ligera aplica la curación común.
    gameEvents.emit("effect:text", "🛠️ ¡REPARACIÓN LIGERA!", collector.x, collector.y - 45, "#ffd700", 40);
  }
}

function initArenaIslands() {
  state.islands = ARENA_ISLANDS.map(island => new Island(island));
}

// Inicio de Rondas y Modos

function clearRoundEntities() {
  clearCannonballs();
  state.ammoCrates = [];
  state.hordePowerups = [];
  state.pirateShips = [];
  state.bossGalleon = null;
  clearParticles();
  state.floatingTexts = [];
  state.roundWinner = null;
  state.roundOverTimer = 0;
}

function startBattleRound() {
  clearRoundEntities();
  state.currentState = STATE_ARENA;
  state.countdownTime = 3.5;
  state.lastCountdownStep = -1;
  state.roundTimer = 0;
  state.suddenDeathActive = false;
  state.currentBounds = { x: arenaBounds.x, y: arenaBounds.y, w: arenaBounds.w, h: arenaBounds.h };
  state.roundWinner = null;
  state.roundOverTimer = 0;
  sendTvAction("state_change", null, STATE_ARENA);

  initArenaIslands();
  clearCannonballs();
  state.ammoCrates = [];
  state.hordePowerups = [];
  state.pirateShips = [];
  state.bossGalleon = null;
  clearParticles();
  state.floatingTexts = [];

  state.ammoCrates.push(new AmmoCrate(700, 540));
  state.ammoCrates.push(new AmmoCrate(1220, 540));

  state.activeShips = [];
  const connected = [];
  for (let i = 0; i < state.playersData.length; i++) {
    if (state.playersData[i].connected) connected.push(state.playersData[i]);
  }

  const count = connected.length;
  const radius = 350;
  for (let j = 0; j < count; j++) {
    const p = connected[j];
    const angle = (Math.PI * 2 / count) * j;
    const sX = 960 + Math.cos(angle) * radius;
    const sY = 540 + Math.sin(angle) * radius;
    const ship = new Ship(p.slot, sX, sY, angle + Math.PI);
    state.activeShips.push(ship);
  }
}

function startTeamsRound() {
  clearRoundEntities();
  state.currentState = STATE_ARENA;
  state.countdownTime = 3.5;
  state.lastCountdownStep = -1;
  state.roundTimer = 0;
  state.suddenDeathActive = false;
  state.currentBounds = { x: arenaBounds.x, y: arenaBounds.y, w: arenaBounds.w, h: arenaBounds.h };
  state.roundWinner = null;
  state.roundOverTimer = 0;
  sendTvAction("state_change", null, STATE_ARENA);

  initArenaIslands();
  clearCannonballs();
  state.ammoCrates = [];
  state.hordePowerups = [];
  state.pirateShips = [];
  state.bossGalleon = null;
  clearParticles();
  state.floatingTexts = [];

  state.ammoCrates.push(new AmmoCrate(700, 540));
  state.ammoCrates.push(new AmmoCrate(1220, 540));

  state.activeShips = [];
  const blueShips = [];
  const redShips = [];

  for (let i = 0; i < state.playersData.length; i++) {
    if (state.playersData[i].connected) {
      if (state.playersData[i].team === "red") redShips.push(state.playersData[i]);
      else blueShips.push(state.playersData[i]);
    }
  }

  // Si todos eligieron el mismo equipo, mover un jugador real al otro bando.
  if (!blueShips.length && redShips.length > 1) {
    const newBlue = redShips.pop();
    newBlue.team = "blue";
    blueShips.push(newBlue);
  } else if (!redShips.length && blueShips.length > 1) {
    const newRed = blueShips.pop();
    newRed.team = "red";
    redShips.push(newRed);
  }

  // Desplegar barcos azules en la izquierda
  for (let b = 0; b < blueShips.length; b++) {
    const bY = 540 + (b - (blueShips.length - 1) / 2) * 130;
    const sBlue = new Ship(blueShips[b].slot, 520, bY, 0);
    state.activeShips.push(sBlue);
  }

  // Desplegar barcos rojos en la derecha
  for (let r = 0; r < redShips.length; r++) {
    const rY = 540 + (r - (redShips.length - 1) / 2) * 130;
    const sRed = new Ship(redShips[r].slot, 1400, rY, Math.PI);
    state.activeShips.push(sRed);
  }
}

function startHordeMode() {
  clearRoundEntities();
  state.currentState = STATE_ARENA;
  state.currentWave = 1;
  state.countdownTime = 3.5;
  state.lastCountdownStep = -1;
  state.roundTimer = 0;
  state.suddenDeathActive = false;
  state.currentBounds = { x: arenaBounds.x, y: arenaBounds.y, w: arenaBounds.w, h: arenaBounds.h };
  state.roundWinner = null;
  state.roundOverTimer = 0;
  sendTvAction("state_change", null, STATE_ARENA);

  state.hordeUpgrades = {
    weaponLevel: 1,
    maxAmmo: 3,
    maxHealth: 3,
    fleetRank: 0,
    repairs: 0
  };

  initArenaIslands();
  clearCannonballs();
  state.ammoCrates = [];
  state.hordePowerups = [];
  clearParticles();
  state.floatingTexts = [];

  // Barcos aliados juntos en el centro
  state.activeShips = [];
  const connected = [];
  for (let i = 0; i < state.playersData.length; i++) {
    if (state.playersData[i].connected) connected.push(state.playersData[i]);
  }
  const count = connected.length;
  for (let j = 0; j < count; j++) {
    const ang = (Math.PI * 2 / count) * j;
    const sh = new Ship(connected[j].slot, 960 + Math.cos(ang) * 160, 540 + Math.sin(ang) * 160, ang);
    state.activeShips.push(sh);
  }

  startHordeWave(state.currentWave);
}

function startHordeWave(wave) {
  state.waveEnemiesToSpawn = 2 + wave;
  state.waveSpawnTimer = 1.5;
  state.waveIntermissionTimer = 0;
  state.pirateShips = [];
  state.bossGalleon = null;

  // Revivir a todos los jugadores aliados caídos al completar con éxito una ronda
  if (wave > 1) {
    let revivedCount = 0;
    for (let pIdx = 0; pIdx < state.playersData.length; pIdx++) {
      if (!state.playersData[pIdx].connected) continue;
      const pSlot = state.playersData[pIdx].slot;
      let shipFound = null;
      for (let sIdx = 0; sIdx < state.activeShips.length; sIdx++) {
        if (state.activeShips[sIdx].slot === pSlot) {
          shipFound = state.activeShips[sIdx];
          break;
        }
      }
      if (!shipFound) {
        shipFound = new Ship(pSlot, 960 + (Math.random() - 0.5) * 200, 540 + (Math.random() - 0.5) * 200, 0);
        state.activeShips.push(shipFound);
        revivedCount++;
      } else if (!shipFound.isAlive) {
        shipFound.isAlive = true;
        shipFound.health = state.hordeUpgrades.maxHealth;
        shipFound.ammo = Math.max(3, state.hordeUpgrades.maxAmmo);
        shipFound.x = 960 + (Math.random() - 0.5) * 260;
        shipFound.y = 540 + (Math.random() - 0.5) * 260;
        shipFound.vx = 0;
        shipFound.vy = 0;
        shipFound.stunTimer = 0;
        shipFound.flashTimer = 0.5;
        revivedCount++;
      } else {
        shipFound.health = state.hordeUpgrades.maxHealth;
        if (shipFound.ammo < 3) shipFound.ammo = 3;
      }
    }
    if (revivedCount > 0) {
      gameEvents.emit("effect:text", "✨ ¡JUGADORES CAÍDOS REVIVIDOS! ✨", 960, 480, "#00e676", 42);
      gameEvents.emit("sound:powerup");
      sendTvAction("vibrate", null, [80, 50, 80]);
    }
  }

  if (wave % 10 === 0) {
    // Ronda de Jefe
    gameEvents.emit("boss:spawn");
    gameEvents.emit("effect:shake", 0.8, 14);
    state.bossGalleon = new BossGalleon(960, 150, wave);
    gameEvents.emit("effect:text", "☠️ ¡ALERTA: GALEÓN JEFE PIRATA! ☠️", 960, 420, "#ff1744", 48);
    // 2 piratas escoltas (dificultad equilibrada)
    state.waveEnemiesToSpawn = 2;
  } else {
    gameEvents.emit("wave:start");
    gameEvents.emit("effect:text", "🌊 OLEADA " + wave + " 🌊", 960, 420, "#00e5ff", 50);
  }
}

function spawnPirateEnemy() {
  // Aparecen desde los bordes de la zona jugable
  const edge = Math.floor(Math.random() * 4);
  let px = 960;
  let py = 540;
  if (edge === 0) {
    px = arenaBounds.x + 40 + Math.random() * (arenaBounds.w - 80);
    py = arenaBounds.y + 15;
  } else if (edge === 1) {
    px = arenaBounds.x + arenaBounds.w - 25;
    py = arenaBounds.y + 40 + Math.random() * (arenaBounds.h - 80);
  } else if (edge === 2) {
    px = arenaBounds.x + 40 + Math.random() * (arenaBounds.w - 80);
    py = arenaBounds.y + arenaBounds.h - 25;
  } else {
    px = arenaBounds.x + 25;
    py = arenaBounds.y + 40 + Math.random() * (arenaBounds.h - 80);
  }

  state.pirateShips.push(new PirateShip(px, py, state.currentWave));
}

function needsMorePlayers() {
  if (state.selectedMode === MODE_HORDE) return false;
  if (state.isRemoteClient) return state.activeShips.length < 2;
  let count = 0;
  for (let i = 0; i < state.playersData.length; i++) {
    if (state.playersData[i].connected && ++count === 2) return false;
  }
  return true;
}

function soloRoomOccupied() {
  return state.playMenuChoice === "solo" && state.playersData.some((player) => {
    return player.connected && player.slot !== state.localPlayerSlot;
  });
}

function startNewMatch() {
  if (state.isRemoteClient) { requestLobbyAction("start"); return; }
  if (soloRoomOccupied()) return;
  if (state.playMenuChoice === "solo") state.selectedMode = MODE_HORDE;
  if (needsMorePlayers()) return;
  if (state.selectedMode === MODE_HORDE && !state.playersData.some((player) => { return player.connected; })) {
    ensureLocalPlayer();
  }
  console.log("[BARQUITOS] INICIANDO NUEVA PARTIDA! Modo:", state.selectedMode);
  state.isPaused = false;
  updatePauseOverlay();
  state.currentRound = 0;
  state.teamScores.blue = 0;
  state.teamScores.red = 0;
  state.roundWinner = null;
  state.matchWinner = null;
  for (let i = 0; i < state.playersData.length; i++) {
    state.playersData[i].score = 0;
  }
  startRoundByMode();
  updateHordeLeaderboardVisibility();
}

function startRoundByMode() {
  if (state.isRemoteClient) { requestLobbyAction("start"); return; }
  try {
    releaseLocalInputs();
    // Ocultar de inmediato la interfaz del lobby
    setLobbyUIVisible(false);
    const el = document.getElementById("lobby-ui");
    if (el) el.style.display = "none";

    // Desbloquear audio tras clic de usuario si aún no estaba activo
    gameEvents.emit("round:start");

    if (state.selectedMode === MODE_HORDE) {
      startHordeMode();
    } else {
      state.currentRound++;
      if (state.selectedMode === MODE_TEAMS) {
        startTeamsRound();
      } else {
        startBattleRound();
      }
    }
  } catch (errStart) {
    if (window.console && window.console.error) {
      window.console.error("[BARQUITOS] Error en startRoundByMode:", errStart);
    }
    state.currentState = STATE_ARENA;
    state.countdownTime = 3.5;
    state.lastCountdownStep = -1;
    initArenaIslands();
  }
}

function updateBattle(dt) {
  // Cuenta regresiva
  if (state.countdownTime > 0.5) {
    state.countdownTime -= dt;
    const step = Math.ceil(state.countdownTime - 0.5);
    if (step !== state.lastCountdownStep) {
      state.lastCountdownStep = step;
      if (step > 0 && step <= 3) gameEvents.emit("sound:countdown", false);
    }
    return;
  } else if (state.countdownTime > 0) {
    if (state.lastCountdownStep !== 0) {
      state.lastCountdownStep = 0;
      gameEvents.emit("sound:countdown", true);
    }
    state.countdownTime -= dt;
  }

  if (state.roundWinner) {
    state.roundOverTimer += dt;
    if (state.roundOverTimer >= 3.5) {
      concludeRoundCheck();
    }
    return;
  }

  state.roundTimer += dt;

  // Muerte súbita a los 45s
  if (state.roundTimer >= 45.0) {
    if (!state.suddenDeathActive) {
      state.suddenDeathActive = true;
      gameEvents.emit("ship:hit");
    }
    const shrink = 24.0 * dt;
    state.currentBounds.x += shrink;
    state.currentBounds.y += shrink * 0.55;
    state.currentBounds.w = Math.max(420, state.currentBounds.w - shrink * 2.0);
    state.currentBounds.h = Math.max(280, state.currentBounds.h - shrink * 1.1);
  }

  stepBattlePhysics(dt);

  // Cajas
  for (let cr = 0; cr < state.ammoCrates.length; cr++) {
    state.ammoCrates[cr].update(dt);
  }
  if (Math.random() < (0.35 * dt) && state.ammoCrates.length < 5) {
    const pt = getSafeSpawnPoint(state.currentBounds, 40);
    state.ammoCrates.push(new AmmoCrate(pt.x, pt.y));
  }

  checkRoundSurvivor();
}

function checkRoundSurvivor() {
  if (state.roundWinner) return;

  if (state.selectedMode === MODE_TEAMS) {
    let blueAlive = 0;
    let redAlive = 0;
    for (let i = 0; i < state.activeShips.length; i++) {
      if (state.activeShips[i].isAlive) {
        if (state.activeShips[i].data.team === "red") redAlive++;
        else blueAlive++;
      }
    }

    if (blueAlive === 0 || redAlive === 0) {
      if (blueAlive > 0) {
        state.teamScores.blue++;
        state.roundWinner = { name: "¡EQUIPO AZUL!", hull: "#42a5f5" };
        gameEvents.emit("round:end", true);
      } else if (redAlive > 0) {
        state.teamScores.red++;
        state.roundWinner = { name: "¡EQUIPO ROJO!", hull: "#ef5350" };
        gameEvents.emit("round:end", true);
      } else {
        state.roundWinner = { name: "¡EMPATE!", hull: "#ffffff" };
        gameEvents.emit("round:end", false);
      }
    }
  } else {
    // Modo Todos contra Todos
    const alive = [];
    for (let j = 0; j < state.activeShips.length; j++) {
      if (state.activeShips[j].isAlive) alive.push(state.activeShips[j]);
    }

    if (alive.length <= 1) {
      if (alive.length === 1) {
        state.roundWinner = alive[0].data;
        state.playersData[alive[0].slot].score++;
        gameEvents.emit("round:end", true);
      } else {
        state.roundWinner = { name: "¡EMPATE!", hull: "#ffffff" };
        gameEvents.emit("round:end", false);
      }
    }
  }
}

function updateRescues(dt) {
  for (let i = 0; i < state.activeShips.length; i++) {
    const fallen = state.activeShips[i];
    if (fallen.isAlive) continue;
    const nearby = state.activeShips.some((ally) => {
      if (!ally.isAlive) return false;
      const dx = ally.x - fallen.x;
      const dy = ally.y - fallen.y;
      return dx * dx + dy * dy <= 100 * 100;
    });
    fallen.rescueTime = nearby ? fallen.rescueTime + dt : 0;
    if (fallen.rescueTime >= 2) {
      fallen.isAlive = true;
      fallen.health = 1;
      fallen.rescueTime = 0;
      fallen.vx = 0;
      fallen.vy = 0;
      fallen.stunTimer = 0;
      gameEvents.emit("effect:text", "¡RESCATADO!", fallen.x, fallen.y - 25, "#86ffaf", 26);
    }
  }
}

function updateHorde(dt) {
  if (state.currentState !== STATE_ARENA) return;
  if (state.countdownTime > 0.5) {
    state.countdownTime -= dt;
    const step = Math.ceil(state.countdownTime - 0.5);
    if (step !== state.lastCountdownStep) {
      state.lastCountdownStep = step;
      if (step > 0 && step <= 3) gameEvents.emit("sound:countdown", false);
    }
    return;
  } else if (state.countdownTime > 0) {
    if (state.lastCountdownStep !== 0) {
      state.lastCountdownStep = 0;
      gameEvents.emit("sound:countdown", true);
    }
    state.countdownTime -= dt;
  }

  // Spawning de oleada
  if (state.waveEnemiesToSpawn > 0) {
    state.waveSpawnTimer -= dt;
    if (state.waveSpawnTimer <= 0) {
      state.waveSpawnTimer = Math.max(1.2, 3.0 - state.currentWave * 0.08);
      spawnPirateEnemy();
      state.waveEnemiesToSpawn--;
    }
  }

  updateRescues(dt);

  // Actualizar barcos aliados
  for (let s = 0; s < state.activeShips.length; s++) {
    const ship = state.activeShips[s];
    ship.update(dt);

    // Limitar barcos aliados a la zona jugable (los marcadores laterales NO son jugables)
    if (ship.isAlive) {
      if (ship.x < arenaBounds.x + 22) {
        ship.x = arenaBounds.x + 22;
        ship.vx = Math.abs(ship.vx) * 0.45 + 50;
        ship.applyRam(1, 0, 90);
        gameEvents.emit("effect:foam", ship.x, ship.y, 1, 0);
      } else if (ship.x > arenaBounds.x + arenaBounds.w - 22) {
        ship.x = arenaBounds.x + arenaBounds.w - 22;
        ship.vx = -Math.abs(ship.vx) * 0.45 - 50;
        ship.applyRam(-1, 0, 90);
        gameEvents.emit("effect:foam", ship.x, ship.y, -1, 0);
      }
      if (ship.y < arenaBounds.y + 22) {
        ship.y = arenaBounds.y + 22;
        ship.vy = Math.abs(ship.vy) * 0.45 + 50;
        ship.applyRam(0, 1, 90);
        gameEvents.emit("effect:foam", ship.x, ship.y, 0, 1);
      } else if (ship.y > arenaBounds.y + arenaBounds.h - 22) {
        ship.y = arenaBounds.y + arenaBounds.h - 22;
        ship.vy = -Math.abs(ship.vy) * 0.45 - 50;
        ship.applyRam(0, -1, 90);
        gameEvents.emit("effect:foam", ship.x, ship.y, 0, -1);
      }
    }

    // Colisiones con islas
    if (ship.isAlive) {
      for (let i = 0; i < state.islands.length; i++) {
        const isl = state.islands[i];
        const dX = ship.x - isl.x;
        const dY = ship.y - isl.y;
        const minDist = isl.rad + 18;
        const distSq = dX * dX + dY * dY;
        if (distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq);
          const nx = dX / (dist || 1);
          const ny = dY / (dist || 1);
          ship.x = isl.x + nx * minDist;
          ship.y = isl.y + ny * minDist;
          ship.vx = nx * 120;
          ship.vy = ny * 120;
          ship.applyRam(nx, ny, 140);
        }
      }

      // Recogida de cajas de munición
      for (let c = state.ammoCrates.length - 1; c >= 0; c--) {
        const crate = state.ammoCrates[c];
        const acDx = crate.x - ship.x;
        const acDy = crate.y - ship.y;
        if (acDx * acDx + acDy * acDy < 784) {
          if (ship.collectAmmo()) {
            if (state.playersData[ship.slot]) {
              state.playersData[ship.slot].score += 25;
              gameEvents.emit("ship:hud", ship.slot);
            }
            state.ammoCrates[c] = state.ammoCrates[state.ammoCrates.length - 1];
            state.ammoCrates.pop();
          }
        }
      }

      // Recogida de Mejoras Globales (Power-ups)
      for (let p = state.hordePowerups.length - 1; p >= 0; p--) {
        const pUp = state.hordePowerups[p];
        const puDx = pUp.x - ship.x;
        const puDy = pUp.y - ship.y;
        if (puDx * puDx + puDy * puDy < 900) {
          applyGlobalPowerup(pUp.type, ship);
          if (state.playersData[ship.slot]) {
            state.playersData[ship.slot].score += 50;
            gameEvents.emit("ship:hud", ship.slot);
          }
          state.hordePowerups[p] = state.hordePowerups[state.hordePowerups.length - 1];
          state.hordePowerups.pop();
        }
      }
    }
  }

  // Actualizar barcos piratas
  for (let pr = state.pirateShips.length - 1; pr >= 0; pr--) {
    const pirate = state.pirateShips[pr];
    pirate.update(dt);
    if (!pirate.isAlive) {
      state.pirateShips[pr] = state.pirateShips[state.pirateShips.length - 1];
      state.pirateShips.pop();
    }
  }

  // Actualizar Jefe
  if (state.bossGalleon) {
    state.bossGalleon.update(dt);
    if (!state.bossGalleon.isAlive) {
      state.bossGalleon = null;
    }
  }

  stepHordeCollisions(dt);

  // Cajas y Mejoras
  for (let cr = 0; cr < state.ammoCrates.length; cr++) state.ammoCrates[cr].update(dt);
  for (let hp = 0; hp < state.hordePowerups.length; hp++) state.hordePowerups[hp].update(dt);

  // Spawning periódico de munición
  if (Math.random() < (0.55 * dt) && state.ammoCrates.length < 6) {
    const ammoSpawn = getSafeSpawnPoint(state.currentBounds, 36);
    state.ammoCrates.push(new AmmoCrate(ammoSpawn.x, ammoSpawn.y));
  }

  // La derrota tiene prioridad sobre la restauración de barcos al cerrar la oleada.
  if (!state.activeShips.some(ship => ship.isAlive)) {
    if (!state.roundWinner) gameEvents.emit("round:end", false);
    state.roundWinner = { name: "¡LA FLOTA HA CAÍDO!", hull: "#ff1744" };
    state.roundOverTimer += dt;
    if (state.roundOverTimer >= 4) openPodiumScreen();
    return;
  }

  // Fin de oleada: todos los piratas y jefe muertos (Éxito de ronda)
  if (state.waveEnemiesToSpawn === 0 && state.pirateShips.length === 0 && (!state.bossGalleon || !state.bossGalleon.isAlive)) {
    if (state.waveIntermissionTimer === 0) {
      gameEvents.emit("effect:text", "🏆 ¡OLEADA " + state.currentWave + " COMPLETADA! 🏆", 960, 330, "#00e676", 46);
      gameEvents.emit("effect:text", "💚 ¡SALUD AL MÁXIMO RESTAURADA!", 960, 390, "#76ff03", 34);
      gameEvents.emit("sound:powerup");

      // Bonificación de puntos por sobrevivir la oleada para todos los aliados
      const waveBonus = state.currentWave * 200;
      for (let hs = 0; hs < state.activeShips.length; hs++) {
        const aShip = state.activeShips[hs];
        if (state.playersData[aShip.slot]) {
          state.playersData[aShip.slot].score += waveBonus;
          gameEvents.emit("ship:hud", aShip.slot);
        }
        aShip.health = aShip.maxHealth;
        aShip.isAlive = true;
        aShip.flashTimer = 0.4;
        if (aShip.ammo < 3) aShip.ammo = 3;
        sendTvAction("vibrate", aShip.slot, [90, 60, 90]);
      }
    }
    state.waveIntermissionTimer += dt;
    if (state.waveIntermissionTimer >= 4.5) {
      state.currentWave++;
      startHordeWave(state.currentWave);
    }
  }

}

function concludeRoundCheck() {
  if (state.currentRound >= TOTAL_ROUNDS) {
    openPodiumScreen();
    return;
  }
  startRoundByMode();
}

function openPodiumScreen() {
  if (state.currentState !== STATE_ARENA) return;
  state.currentState = STATE_PODIUM;
  state.podiumAnimTimer = 0;
  let sorted = [];
  for (let i = 0; i < state.playersData.length; i++) {
    if (state.playersData[i].connected) sorted.push(state.playersData[i]);
  }
  if (sorted.length === 0) sorted = [state.playersData[0], state.playersData[1]];
  sorted.sort((a, b) => { return b.score - a.score; });
  state.matchWinner = sorted[0];
  if (state.selectedMode === MODE_HORDE) {
    const fleet = state.activeShips.map(ship => state.playersData[ship.slot]);
    void showHordeLeaderboard({
      wave: state.currentWave,
      score: fleet.reduce((total, player) => total + player.score, 0),
      players: fleet.map(player => player.customName || player.name)
    });
  }
  gameEvents.emit("match:end");
  gameEvents.emit("effect:confetti", 90);
  sendTvAction("state_change", null, STATE_PODIUM);
}

export { applyGlobalPowerup, initArenaIslands, needsMorePlayers, soloRoomOccupied, startNewMatch, startRoundByMode, updateBattle, updateHorde, updateRescues };

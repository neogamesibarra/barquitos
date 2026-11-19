import { gameEvents } from "./events.js";
import { removeCannonball } from "./entities.js";
import { MODE_TEAMS, SEA_WAVES, STATE_ARENA, arenaBounds } from "./config.js";
import { sendTvAction } from "./multiplayer.js";
import { state } from "./state.js";

// La simulación consume la muestra de forma síncrona antes de calcular la siguiente.
const seaSampleResult = { sx: 0, sy: 0, ax: 0, ay: 0 };

/** @param {number} x @param {number} y @param {number} time */
function seaSample(x, y, time) {
  let sx = 0, sy = 0, ax = 0, ay = 0;
  for (let i = 0; i < SEA_WAVES.length; i++) {
    const w = SEA_WAVES[i];
    const phase = (x * w.x + y * w.y) * w.k - time * w.rate + i * 1.7;
    const cs = Math.cos(phase);
    sx += w.amplitude * w.k * cs * w.x;
    sy += w.amplitude * w.k * cs * w.y;
    const force = w.amplitude * w.rate * w.rate * cs;
    ax += force * w.x;
    ay += force * w.y;
  }
  seaSampleResult.sx = sx;
  seaSampleResult.sy = sy;
  seaSampleResult.ax = ax;
  seaSampleResult.ay = ay;
  return seaSampleResult;
}

function waveYaw(ship) {
  if (state.currentState !== STATE_ARENA) return 0;
  const sea = seaSample(ship.x, ship.y, state.waveAnim);
  // Máximo 16 grados: el jugador conserva el timón y puede anticipar la cresta.
  return Math.max(-0.28, Math.min(0.28,
    (sea.sy * Math.cos(ship.rotation) - sea.sx * Math.sin(ship.rotation)) * 0.46));
}

function pushByWaves(ship, dt) {
  const sea = seaSample(ship.x, ship.y, state.waveAnim);
  ship.vx += sea.ax * 1.5 * dt;
  ship.vy += sea.ay * 1.5 * dt;
}

function applyWaterDrift(ship, speed, dt) {
  const forwardX = Math.cos(ship.rotation);
  const forwardY = Math.sin(ship.rotation);
  let forward = ship.vx * forwardX + ship.vy * forwardY;
  let lateral = -ship.vx * forwardY + ship.vy * forwardX;
  forward += (speed - forward) * (1 - Math.exp(-4 * dt));
  lateral *= Math.exp(-1.12 * dt);
  ship.vx = forwardX * forward - forwardY * lateral;
  ship.vy = forwardY * forward + forwardX * lateral;
}

// Configuración de Islas

// Comprobación segura de islas para spawn de barcos y cajas (Anti-atascos)
function isInsideIsland(x, y, margin) {
  const m = margin || 30;
  for (let i = 0; i < state.islands.length; i++) {
    const isl = state.islands[i];
    const dx = x - isl.x;
    const dy = y - isl.y;
    const checkRad = isl.rad + m;
    if (Math.abs(dx) <= checkRad && Math.abs(dy) <= checkRad) {
      if (dx * dx + dy * dy < checkRad * checkRad) return true;
    }
  }
  return false;
}

function getSafeSpawnPoint(bounds, margin) {
  const b = bounds || state.currentBounds || arenaBounds;
  const m = margin || 40;
  for (let attempt = 0; attempt < 30; attempt++) {
    const rx = b.x + 80 + Math.random() * (b.w - 160);
    const ry = b.y + 80 + Math.random() * (b.h - 160);
    if (!isInsideIsland(rx, ry, m)) {
      return { x: rx, y: ry };
    }
  }
  return { x: b.x + 120, y: b.y + 120 };
}

function getLootPosition(x, y) {
  if (!isInsideIsland(x, y, 36)) return { x: x, y: y };
  return getSafeSpawnPoint(state.currentBounds, 36);
}

/** @param {number} dx @param {number} dy @param {number} halfSize @returns {boolean} */
function overlapsAabb(dx, dy, halfSize) {
  return Math.abs(dx) <= halfSize && Math.abs(dy) <= halfSize;
}

function stepBattlePhysics(dt) {
  // Actualizar barcos
  for (let s = 0; s < state.activeShips.length; s++) {
    const ship = state.activeShips[s];
    ship.update(dt);

    // Límite de la zona jugable (los marcadores laterales NO son jugables)
    if (state.suddenDeathActive) {
      if (ship.x < state.currentBounds.x || ship.x > state.currentBounds.x + state.currentBounds.w ||
          ship.y < state.currentBounds.y || ship.y > state.currentBounds.y + state.currentBounds.h) {
        ship.die();
      }
    } else {
      // En juego normal, rebotar contra los bordes de la zona jugable
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

    if (!ship.isAlive) continue;

    // Colisión con islas (descarte rápido AABB + deslizamiento tangencial suave sin vibraciones)
    for (let i = 0; i < state.islands.length; i++) {
      const isl = state.islands[i];
      const dX = ship.x - isl.x;
      const dY = ship.y - isl.y;
      const minDist = isl.rad + 20;
      if (Math.abs(dX) > minDist || Math.abs(dY) > minDist) continue;
      const distSq = dX * dX + dY * dY;
      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq) || 1;
        const nx = dX / dist;
        const ny = dY / dist;
        ship.x = isl.x + nx * (minDist + 0.5);
        ship.y = isl.y + ny * (minDist + 0.5);
        const vDotN = ship.vx * nx + ship.vy * ny;
        if (vDotN < 0) {
          ship.vx -= vDotN * nx * 1.1;
          ship.vy -= vDotN * ny * 1.1;
        }
        if (ship.isRamming) {
          ship.isRamming = false;
          gameEvents.emit("effect:island-impact", ship.x, ship.y);
        }
      }
    }

    // Colisión entre barcos con espolón metálico y daño de embestida
    for (let s2 = s + 1; s2 < state.activeShips.length; s2++) {
      const ship2 = state.activeShips[s2];
      if (!ship2.isAlive) continue;
      const cDx = ship2.x - ship.x;
      const cDy = ship2.y - ship.y;
      if (!overlapsAabb(cDx, cDy, 39)) continue;
      const cDistSq = cDx * cDx + cDy * cDy;
      if (cDistSq < 1521) {
        const cDist = Math.sqrt(cDistSq) || 1;
        const cNx = cDx / (cDist || 1);
        const cNy = cDy / (cDist || 1);

        const fwd1X = Math.cos(ship.rotation);
        const fwd1Y = Math.sin(ship.rotation);
        const spd1Fwd = ship.vx * fwd1X + ship.vy * fwd1Y;
        const dot1 = cNx * fwd1X + cNy * fwd1Y;

        const fwd2X = Math.cos(ship2.rotation);
        const fwd2Y = Math.sin(ship2.rotation);
        const spd2Fwd = ship2.vx * fwd2X + ship2.vy * fwd2Y;
        const dot2 = (-cNx) * fwd2X + (-cNy) * fwd2Y;

        const canDamageEachOther = (state.selectedMode !== MODE_TEAMS || ship.data.team !== ship2.data.team);

        // Barco 1 embiste a Barco 2 con la punta de metal (mitad de daño de una bala = 0.5)
        if (canDamageEachOther && (ship.isRamming || spd1Fwd > 130) && dot1 > 0.45 && ship.ramCooldown <= 0) {
          ship.ramCooldown = 0.65;
          ship2.applyHit(cNx, cNy, 360, 0.5);
          gameEvents.emit("effect:sparks", ship.x + fwd1X * 30, ship.y + fwd1Y * 30, -cNx, -cNy);
          gameEvents.emit("effect:text", "💥 -0.5", ship2.x, ship2.y - 25, "#ff3d00", 28);
          gameEvents.emit("effect:shake", 0.2, 5);
          sendTvAction("vibrate", ship.slot, 100);
        } else if (ship.isRamming) {
          ship2.applyRam(cNx, cNy, 460);
        }

        // Barco 2 embiste a Barco 1 con la punta de metal
        if (canDamageEachOther && (ship2.isRamming || spd2Fwd > 130) && dot2 > 0.45 && ship2.ramCooldown <= 0) {
          ship2.ramCooldown = 0.65;
          ship.applyHit(-cNx, -cNy, 360, 0.5);
          gameEvents.emit("effect:sparks", ship2.x + fwd2X * 30, ship2.y + fwd2Y * 30, cNx, cNy);
          gameEvents.emit("effect:text", "💥 -0.5", ship.x, ship.y - 25, "#ff3d00", 28);
          gameEvents.emit("effect:shake", 0.2, 5);
          sendTvAction("vibrate", ship2.slot, 100);
        } else if (ship2.isRamming) {
          ship.applyRam(-cNx, -cNy, 460);
        }

        ship.vx -= cNx * 120;
        ship.vy -= cNy * 120;
        ship2.vx += cNx * 120;
        ship2.vy += cNy * 120;
      }
    }

    // Recogida de cajas de munición
    for (let c = state.ammoCrates.length - 1; c >= 0; c--) {
      const crate = state.ammoCrates[c];
      const acDx = crate.x - ship.x;
      const acDy = crate.y - ship.y;
      if (acDx * acDx + acDy * acDy < 784) {
        if (ship.collectAmmo()) {
          state.ammoCrates[c] = state.ammoCrates[state.ammoCrates.length - 1];
          state.ammoCrates.pop();
        }
      }
    }
  }

  // Actualizar balas de cañón
  for (let b = state.cannonballs.length - 1; b >= 0; b--) {
    const ball = state.cannonballs[b];
    ball.update(dt);
    if (ball.isDead) {
      removeCannonball(b);
      continue;
    }

    // Colisión de proyectil con límites de la zona jugable (no cruzan hacia el HUD)
    if (ball.x <= arenaBounds.x || ball.x >= arenaBounds.x + arenaBounds.w ||
        ball.y <= arenaBounds.y || ball.y >= arenaBounds.y + arenaBounds.h) {
      ball.isDead = true;
      gameEvents.emit("effect:island-impact", ball.x, ball.y);
      removeCannonball(b);
      continue;
    }

    // Colisión de proyectil con islas (descarte rápido AABB + distancia al cuadrado)
    let hitIsland = false;
    for (let ii = 0; ii < state.islands.length; ii++) {
      const isObj = state.islands[ii];
      const idX = ball.x - isObj.x;
      const idY = ball.y - isObj.y;
      const hitDist = isObj.rad + 5;
      if (Math.abs(idX) > hitDist || Math.abs(idY) > hitDist) continue;
      if (idX * idX + idY * idY <= hitDist * hitDist) {
        hitIsland = true;
        break;
      }
    }
    if (hitIsland) {
      ball.isDead = true;
      gameEvents.emit("effect:island-impact", ball.x, ball.y);
      removeCannonball(b);
      continue;
    }

    // Impacto en barcos
    for (let sh = 0; sh < state.activeShips.length; sh++) {
      const targetShip = state.activeShips[sh];
      if (!targetShip.isAlive || targetShip.slot === ball.shooterSlot) continue;

      // En Modo Equipos: desactivar daño entre compañeros del mismo equipo
      if (state.selectedMode === MODE_TEAMS && ball.shooterTeam && ball.shooterTeam === targetShip.data.team) {
        continue;
      }

      const bDx = targetShip.x - ball.x;
      const bDy = targetShip.y - ball.y;
      if (!overlapsAabb(bDx, bDy, 22)) continue;
      if (bDx * bDx + bDy * bDy < 484) {
        gameEvents.emit("effect:splinters", ball.x, ball.y, ball.dx, ball.dy);
        targetShip.applyHit(ball.dx, ball.dy, 550, ball.damage);
        ball.isDead = true;
        removeCannonball(b);
        break;
      }
    }
  }
}

function stepHordeCollisions(dt) {
  // Colisiones físicas y embestida con punta metálica entre jugadores y piratas/jefe
  for (let ash = 0; ash < state.activeShips.length; ash++) {
    const pShip = state.activeShips[ash];
    if (!pShip.isAlive) continue;
    const pfwdX = Math.cos(pShip.rotation);
    const pfwdY = Math.sin(pShip.rotation);
    const pSpdFwd = pShip.vx * pfwdX + pShip.vy * pfwdY;

    // Colisión entre barcos aliados (fuego amigo estrictamente desactivado)
    for (let ash2 = ash + 1; ash2 < state.activeShips.length; ash2++) {
      const pShip2 = state.activeShips[ash2];
      if (!pShip2.isAlive) continue;
      const asDx = pShip2.x - pShip.x;
      const asDy = pShip2.y - pShip.y;
      if (!overlapsAabb(asDx, asDy, 38)) continue;
      const asDistSq = asDx * asDx + asDy * asDy;
      if (asDistSq < 1444) {
        const asDist = Math.sqrt(asDistSq) || 1;
        const asNx = asDx / asDist;
        const asNy = asDy / asDist;
        pShip.vx -= asNx * 100;
        pShip.vy -= asNy * 100;
        pShip2.vx += asNx * 100;
        pShip2.vy += asNy * 100;
      }
    }

    // Embestida contra Barcos Piratas (causa 0.5 de daño a los piratas)
    for (let psh = 0; psh < state.pirateShips.length; psh++) {
      const pirShip = state.pirateShips[psh];
      if (!pirShip.isAlive) continue;
      const cpx = pirShip.x - pShip.x;
      const cpy = pirShip.y - pShip.y;
      if (!overlapsAabb(cpx, cpy, 39)) continue;
      const cpDistSq = cpx * cpx + cpy * cpy;
      if (cpDistSq < 1521) {
        const cpDist = Math.sqrt(cpDistSq) || 1;
        const cpnX = cpx / cpDist;
        const cpnY = cpy / cpDist;
        const cpDot = cpnX * pfwdX + cpnY * pfwdY;

        if ((pShip.isRamming || pSpdFwd > 130) && cpDot > 0.45 && pShip.ramCooldown <= 0) {
          pShip.ramCooldown = 0.65;
          pirShip.applyHit(cpnX, cpnY, 380, 0.5, pShip.slot);
          gameEvents.emit("effect:sparks", pShip.x + pfwdX * 30, pShip.y + pfwdY * 30, -cpnX, -cpnY);
          gameEvents.emit("effect:text", "💥 -0.5", pirShip.x, pirShip.y - 25, "#ff3d00", 28);
          gameEvents.emit("effect:shake", 0.22, 6);
          sendTvAction("vibrate", pShip.slot, 120);
        }

        pShip.vx -= cpnX * 110;
        pShip.vy -= cpnY * 110;
        pirShip.vx += cpnX * 110;
        pirShip.vy += cpnY * 110;
      }
    }

    // Embestida contra el Galeón Jefe (causa 0.5 de daño al jefe)
    if (state.bossGalleon && state.bossGalleon.isAlive) {
      const bgx = state.bossGalleon.x - pShip.x;
      const bgy = state.bossGalleon.y - pShip.y;
      const bgDistSq = overlapsAabb(bgx, bgy, 60) ? bgx * bgx + bgy * bgy : Infinity;
      if (bgDistSq < 3600) {
        const bgDist = Math.sqrt(bgDistSq) || 1;
        const bgnX = bgx / bgDist;
        const bgnY = bgy / bgDist;
        const bgDot = bgnX * pfwdX + bgnY * pfwdY;

        if ((pShip.isRamming || pSpdFwd > 130) && bgDot > 0.45 && pShip.ramCooldown <= 0) {
          pShip.ramCooldown = 0.65;
          state.bossGalleon.applyHit(bgnX, bgnY, 80, 0.5, pShip.slot);
          gameEvents.emit("effect:sparks", pShip.x + pfwdX * 30, pShip.y + pfwdY * 30, -bgnX, -bgnY);
          gameEvents.emit("effect:text", "💥 -0.5", state.bossGalleon.x, state.bossGalleon.y - 35, "#ffd700", 32);
          gameEvents.emit("effect:shake", 0.26, 7);
          sendTvAction("vibrate", pShip.slot, 130);
        }

        pShip.vx -= bgnX * 200;
        pShip.vy -= bgnY * 200;
        state.bossGalleon.vx += bgnX * 30;
        state.bossGalleon.vy += bgnY * 30;
      }
    }
  }

  // Actualizar proyectiles
  for (let b = state.cannonballs.length - 1; b >= 0; b--) {
    const ball = state.cannonballs[b];
    ball.update(dt);
    if (ball.isDead) {
      removeCannonball(b);
      continue;
    }

    // Colisión con límites de la zona jugable en horda
    if (ball.x <= arenaBounds.x || ball.x >= arenaBounds.x + arenaBounds.w ||
        ball.y <= arenaBounds.y || ball.y >= arenaBounds.y + arenaBounds.h) {
      ball.isDead = true;
      gameEvents.emit("effect:island-impact", ball.x, ball.y);
      removeCannonball(b);
      continue;
    }

    // Colisión con islas
    let hitIsl = false;
    for (let ii = 0; ii < state.islands.length; ii++) {
      const isObj = state.islands[ii];
      const idX = ball.x - isObj.x;
      const idY = ball.y - isObj.y;
      const hDist = isObj.rad + 5;
      if (!overlapsAabb(idX, idY, hDist)) continue;
      if (idX * idX + idY * idY <= hDist * hDist) {
        hitIsl = true;
        break;
      }
    }
    if (hitIsl) {
      ball.isDead = true;
      gameEvents.emit("effect:island-impact", ball.x, ball.y);
      removeCannonball(b);
      continue;
    }

    if (ball.isPirate) {
      // Bala pirata impacta a jugadores aliados
      for (let ash = 0; ash < state.activeShips.length; ash++) {
        const ally = state.activeShips[ash];
        if (!ally.isAlive) continue;
        const aDx = ally.x - ball.x;
        const aDy = ally.y - ball.y;
        if (!overlapsAabb(aDx, aDy, ball.isBossShot ? 29 : 22)) continue;
        if (aDx * aDx + aDy * aDy < (ball.isBossShot ? 841 : 484)) {
          gameEvents.emit("effect:splinters", ball.x, ball.y, ball.dx, ball.dy);
          ally.applyHit(ball.dx, ball.dy, 520, ball.damage);
          ball.isDead = true;
          removeCannonball(b);
          break;
        }
      }
    } else {
      // Bala aliada: FUEGO AMIGO DESACTIVADO ENTRE JUGADORES
      // Impacta a piratas o al jefe
      let hitEnemy = false;
      for (let psh = 0; psh < state.pirateShips.length; psh++) {
        const pir = state.pirateShips[psh];
        if (!pir.isAlive) continue;
        const pDx = pir.x - ball.x;
        const pDy = pir.y - ball.y;
        if (!overlapsAabb(pDx, pDy, 23)) continue;
        if (pDx * pDx + pDy * pDy < 520) {
          gameEvents.emit("effect:splinters", ball.x, ball.y, ball.dx, ball.dy);
          pir.applyHit(ball.dx, ball.dy, 460, ball.damage, ball.shooterSlot);
          ball.isDead = true;
          hitEnemy = true;
          removeCannonball(b);
          break;
        }
      }

      if (!hitEnemy && state.bossGalleon && state.bossGalleon.isAlive) {
        const bgDx = state.bossGalleon.x - ball.x;
        const bgDy = state.bossGalleon.y - ball.y;
        if (overlapsAabb(bgDx, bgDy, 48) && bgDx * bgDx + bgDy * bgDy < 2300) {
          gameEvents.emit("effect:splinters", ball.x, ball.y, ball.dx, ball.dy);
          state.bossGalleon.applyHit(ball.dx, ball.dy, 120, ball.damage, ball.shooterSlot);
          ball.isDead = true;
          removeCannonball(b);
        }
      }
    }
  }
}

export { applyWaterDrift, getLootPosition, getSafeSpawnPoint, isInsideIsland, pushByWaves, stepBattlePhysics, stepHordeCollisions, waveYaw };

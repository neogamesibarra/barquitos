import { gameEvents } from "./events.js";
import { ObjectPool } from "./pool.js";
import { SoundSynth as Sound } from "../sound_synth.js";
import { MODE_HORDE, MODE_TEAMS, STATE_ARENA, STATE_LOBBY, arenaBounds } from "./config.js";
import { addFloatingText, addParticle, spawnWaterFoam, triggerScreenShake } from "./effects.js";
import { drawAmmoCrate, drawBossGalleon, drawCannonball, drawHordePowerup, drawPirateShip, drawShip } from "./entity_renderer.js";
import { applyGlobalPowerup } from "./modes.js";
import { sendTvAction } from "./multiplayer.js";
import { applyWaterDrift, getLootPosition, pushByWaves, waveYaw } from "./physics.js";
import { state } from "./state.js";

// Clase Barco
/** @typedef {import("./state.js").PlayerProfile} PlayerProfile */

/** Barco de un capitán, simulado por el anfitrión o interpolado en la vista remota. */
class Ship {
  /** @type {number|undefined} */
  targetX;
  /** @type {number|undefined} */
  targetY;
  /** @type {number|undefined} */
  targetAngle;
  /** @type {number|undefined} */
  remoteSpeed;
  /** @type {number|undefined} */
  inputExpiresAt;
  /** @type {number|undefined} */
  speed;

  /** @param {number} slot @param {number} [x] @param {number} [y] @param {number} [rot] */
  constructor(slot, x, y, rot) {
    this.slot = slot;
    this.data = state.playersData[slot] || /** @type {PlayerProfile} */ ({});
    this.x = x || 960;
    this.y = y || 540;
    this.rotation = rot !== undefined ? rot : 0;
    this.vx = 0;
    this.vy = 0;
    this.maxHealth = (state.selectedMode === MODE_HORDE) ? state.hordeUpgrades.maxHealth : 3;
    this.health = this.maxHealth;
    this.maxAmmo = (state.selectedMode === MODE_HORDE) ? state.hordeUpgrades.maxAmmo : 3;
    this.ammo = this.maxAmmo;
    this.boost = 1.0;
    this.isAlive = true;
    this.stunTimer = 0;
    this.spinVel = 0;
    this.shootCooldown = 0;
    this.shotBuffer = 0;
    this.flashTimer = 0;
    this.isRamming = false;
    this.ramCooldown = 0;
    this.kills = 0;
    this.turnInput = 0;
    this.headingInput = null;
    this.thrustInput = false;
    this.shootInput = false;
    this.rescueTime = 0;
  }

  update(dt) {
    if (!this.isAlive) return;
  
    if (this.stunTimer > 0) this.stunTimer -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
    if (this.flashTimer > 0) this.flashTimer -= dt;
    if (this.ramCooldown > 0) this.ramCooldown -= dt;
  
    if (this.thrustInput && this.boost > 0.05 && this.stunTimer <= 0) {
      this.boost = Math.max(0, this.boost - 0.40 * dt);
      this.isRamming = true;
    } else {
      this.boost = Math.min(1.0, this.boost + 0.25 * dt);
      this.isRamming = false;
    }
  
    if (this.stunTimer > 0) {
      this.rotation += this.spinVel * dt;
      this.spinVel *= Math.max(0, 1 - 3.0 * dt);
    } else if (this.headingInput != null) {
      this.rotation = this.headingInput;
    } else {
      const turn = this.turnInput;
      if (Math.abs(turn) > 0.05) {
        this.rotation += turn * 3.8 * dt;
      }
    }
  
    const fwdX = Math.cos(this.rotation);
    const fwdY = Math.sin(this.rotation);
    let targetSpeed = 80;
    if (this.stunTimer <= 0) {
      if (this.thrustInput) {
        targetSpeed = (this.boost > 0.05) ? 340 : 185;
      }
    } else {
      targetSpeed = 0;
    }
  
    applyWaterDrift(this, targetSpeed, dt);
    if (state.currentState === STATE_ARENA) pushByWaves(this, dt);
  
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  
    // No permitir que los piratas se salgan de la zona jugable
    if (this.x < arenaBounds.x + 20) { this.x = arenaBounds.x + 20; this.vx = Math.abs(this.vx) * 0.5 + 40; }
    else if (this.x > arenaBounds.x + arenaBounds.w - 20) { this.x = arenaBounds.x + arenaBounds.w - 20; this.vx = -Math.abs(this.vx) * 0.5 - 40; }
    if (this.y < arenaBounds.y + 20) { this.y = arenaBounds.y + 20; this.vy = Math.abs(this.vy) * 0.5 + 40; }
    else if (this.y > arenaBounds.y + arenaBounds.h - 20) { this.y = arenaBounds.y + arenaBounds.h - 20; this.vy = -Math.abs(this.vy) * 0.5 - 40; }
  
    // Mantener fuego y conservar pulsaciones breves durante la recarga.
    this.shotBuffer = Math.max(0, (this.shotBuffer || 0) - dt);
    if (this.shootInput || this.shotBuffer > 0) {
      if (this.shootCooldown <= 0 && this.ammo > 0 && this.stunTimer <= 0) {
        this.shotBuffer = 0;
        this.ammo--;
      gameEvents.emit("ship:hud", this.slot);
        this.shootCooldown = 0.42;
  
        const aim = this.rotation + waveYaw(this);
        const gunX = Math.cos(aim);
        const gunY = Math.sin(aim);
        const latX = -gunY;
        const latY = gunX;
        this.vx -= gunX * 260;
        this.vy -= gunY * 260;
  
        gameEvents.emit("ship:fired");
        const sTeam = (state.selectedMode === MODE_TEAMS) ? (this.data.team || "blue") : null;
        const wLevel = (state.selectedMode === MODE_HORDE) ? state.hordeUpgrades.weaponLevel : 1;
  
        if (wLevel <= 1) {
          const bX = this.x + gunX * 32;
          const bY = this.y + gunY * 32;
          spawnCannonball(bX, bY, gunX, gunY, this.slot, false, 1, sTeam);
          gameEvents.emit("effect:muzzle", bX, bY, aim);
        } else if (wLevel === 2) {
          // Cañón doble
          const bX1 = this.x + gunX * 30 + latX * 7;
          const bY1 = this.y + gunY * 30 + latY * 7;
          const bX2 = this.x + gunX * 30 - latX * 7;
          const bY2 = this.y + gunY * 30 - latY * 7;
          spawnCannonball(bX1, bY1, gunX, gunY, this.slot, false, 1, sTeam);
          spawnCannonball(bX2, bY2, gunX, gunY, this.slot, false, 1, sTeam);
          gameEvents.emit("effect:muzzle", bX1, bY1, aim);
          gameEvents.emit("effect:muzzle", bX2, bY2, aim);
        } else {
          // Cañón triple
          const ang1 = aim - 0.16;
          const ang2 = aim;
          const ang3 = aim + 0.16;
          spawnCannonball(this.x + gunX * 32, this.y + gunY * 32, Math.cos(ang1), Math.sin(ang1), this.slot, false, 1.2, sTeam);
          spawnCannonball(this.x + gunX * 32, this.y + gunY * 32, Math.cos(ang2), Math.sin(ang2), this.slot, false, 1.2, sTeam);
          spawnCannonball(this.x + gunX * 32, this.y + gunY * 32, Math.cos(ang3), Math.sin(ang3), this.slot, false, 1.2, sTeam);
          gameEvents.emit("effect:muzzle", this.x + gunX * 32, this.y + gunY * 32, aim);
        }
  
        sendTvAction("vibrate", this.slot, 60);
      }
    }
  
    // Estela de espuma de agua en popa
    const curSpd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (curSpd > 35) {
      if (Math.random() < 0.55) {
        spawnWaterFoam(this.x - fwdX * 24, this.y - fwdY * 24, -fwdX, -fwdY);
      }
    }
  }

  applyHit(dirX, dirY, force, dmg) {
    if (!this.isAlive) return;
    gameEvents.emit("ship:hit");
    triggerScreenShake(0.18, 5);
    const damage = (dmg !== undefined) ? dmg : 1;
    const finalForce = (this.ammo === 0) ? force * 2.0 : force;
    this.vx += dirX * finalForce;
    this.vy += dirY * finalForce;
    this.stunTimer = 0.35;
    this.spinVel = (Math.random() - 0.5) * 24;
    this.flashTimer = 0.22;
    sendTvAction("vibrate", this.slot, 120);
  
    // Chispas de madera
    for (let p = 0; p < 8; p++) {
      const pAng = Math.random() * Math.PI * 2;
      const pSpd = 40 + Math.random() * 90;
      addParticle(
        this.x, this.y,
        Math.cos(pAng) * pSpd, Math.sin(pAng) * pSpd,
        2 + Math.random() * 3, "#ffdd44", 0.35
      );
    }
  
    if (state.currentState !== STATE_LOBBY) {
      this.health -= damage;
      gameEvents.emit("ship:hud", this.slot);
    if (this.health <= 0) {
        this.health = 0;
        this.die();
      }
    }
  }

  applyRam(dirX, dirY, force) {
    if (!this.isAlive) return;
    gameEvents.emit("ship:hit");
    this.vx += dirX * force;
    this.vy += dirY * force;
    this.stunTimer = 0.3;
    this.spinVel = (Math.random() - 0.5) * 18;
    this.flashTimer = 0.15;
    sendTvAction("vibrate", this.slot, 90);
  }

  collectAmmo() {
    if (!this.isAlive || this.ammo >= this.maxAmmo) return false;
    this.ammo = Math.min(this.maxAmmo, this.ammo + 3);
    // Recoger munición no debe cancelar un botón que sigue presionado.
    Sound.playPickup();
    sendTvAction("vibrate", this.slot, 40);
    return true;
  }

  die() {
    if (!this.isAlive) return;
    this.isAlive = false;
    this.rescueTime = 0;
    if (state.selectedMode === MODE_HORDE) {
      const raft = getLootPosition(this.x, this.y);
      this.x = raft.x;
      this.y = raft.y;
    }
    gameEvents.emit("ship:sunk");
    gameEvents.emit("effect:splash", this.x, this.y);
    triggerScreenShake(0.35, 10);
    sendTvAction("vibrate", this.slot, 300);
  
    for (let i = 0; i < 35; i++) {
      const spd = 60 + Math.random() * 220;
      const ang = Math.random() * Math.PI * 2;
      addParticle(
        this.x, this.y,
        Math.cos(ang) * spd, Math.sin(ang) * spd,
        3 + Math.random() * 6, this.data.hull || "#ff2222", 0.8
      );
    }
  }

  draw(context) {
    drawShip(context, this);
  }
}

// Clase Bala de Cañón
class Cannonball {
  /** @param {number} x @param {number} y @param {number} dx @param {number} dy
   * @param {number} shooterSlot @param {boolean} isPirate @param {number} [damage]
   * @param {string|null} [shooterTeam] */
  constructor(x, y, dx, dy, shooterSlot, isPirate, damage, shooterTeam) {
    this.reset(x, y, dx, dy, shooterSlot, isPirate, damage, shooterTeam);
  }

  /** @param {number} x @param {number} y @param {number} dx @param {number} dy
   * @param {number} shooterSlot @param {boolean} isPirate @param {number} [damage]
   * @param {string|null} [shooterTeam] */
  reset(x, y, dx, dy, shooterSlot, isPirate, damage, shooterTeam) {
    this.x = x;
    this.y = y;
    this.dx = dx;
    this.dy = dy;
    this.shooterSlot = shooterSlot;
    this.isPirate = !!isPirate;
    this.damage = damage || 1;
    this.isBossShot = this.isPirate && this.damage === 2;
    this.shooterTeam = shooterTeam || null;
    this.dist = 0;
    this.maxDist = isPirate ? 540 : 580;
    this.speed = isPirate ? 600 : 700;
    this.isDead = false;
  }

  update(dt) {
    const step = this.speed * dt;
    this.x += this.dx * step;
    this.y += this.dy * step;
    this.dist += step;
  
    if (this.dist >= this.maxDist) {
      this.isDead = true;
      gameEvents.emit("effect:splash", this.x, this.y);
    }
  }

  draw(context) {
    drawCannonball(context, this);
  }
}

// Cajas de munición estándar
class AmmoCrate {
  constructor(x, y) {
    this.x = x;
    this.baseY = y;
    this.y = y;
    this.time = Math.random() * 5;
  }

  update(dt) {
    this.time += dt * 3.0;
    this.y = this.baseY + Math.sin(this.time) * 4.0;
  }

  draw(context) {
    drawAmmoCrate(context, this);
  }
}

// Mejoras Globales de Horda (Power-ups estilo CoD Zombies)
// 0: CORAZÓN VERDE, 1: BODEGA AMPLIADA, 2: MUNICIÓN MÁXIMA, 3: PACK-A-PUNCH, 4: REPARACIÓN LIGERA
class HordePowerup {
  constructor(x, y, type) {
    this.x = x;
    this.baseY = y;
    this.y = y;
    this.time = Math.random() * 5;
    const roll = type === undefined ? Math.random() : 0;
    this.type = type !== undefined ? type : (roll < 0.05 ? 0 : 1 + Math.floor((roll - 0.05) / 0.95 * 4));
  }

  update(dt) {
    this.time += dt * 3.5;
    this.y = this.baseY + Math.sin(this.time) * 5.0;
  }

  draw(context) {
    drawHordePowerup(context, this);
  }
}

// Barcos Piratas Enemigos (IA)
class PirateShip {
  /** @param {number} x @param {number} y @param {number} wave */
  constructor(x, y, wave) {
    this.x = x;
    this.y = y;
    this.rotation = Math.random() * Math.PI * 2;
    this.vx = 0;
    this.vy = 0;
    this.wave = wave || 1;
    this.maxHealth = 1 + Math.floor(wave / 5);
    this.health = this.maxHealth;
    this.speed = 90 + Math.min(60, wave * 4);
    this.shootCooldown = 2.5 + Math.random() * 2.5;
    this.isAlive = true;
    this.flashTimer = 0;
  }

  update(dt) {
    if (!this.isAlive) return;
    if (this.flashTimer > 0) this.flashTimer -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
  
    // Optimización IA: Recalcular ángulo objetivo cada 12 frames
    this.aiTick = (this.aiTick || 0) + 1;
    if (this.aiTick % 12 === 1 || this.cachedDesiredAng === undefined) {
      let nearest = null;
      let nearDistSq = 99999999;
      for (let i = 0; i < state.activeShips.length; i++) {
        const s = state.activeShips[i];
        if (!s.isAlive) continue;
        const dSq = (s.x - this.x) * (s.x - this.x) + (s.y - this.y) * (s.y - this.y);
        if (dSq < nearDistSq) {
          nearDistSq = dSq;
          nearest = s;
        }
      }
  
      let dAng = this.rotation;
      if (nearest) {
        dAng = Math.atan2(nearest.y - this.y, nearest.x - this.x);
      }
  
      // Esquivar islas con AABB y distancia al cuadrado
      for (let ii = 0; ii < state.islands.length; ii++) {
        const isl = state.islands[ii];
        const idX = this.x - isl.x;
        const idY = this.y - isl.y;
        const avoidDist = isl.rad + 70;
        if (Math.abs(idX) <= avoidDist && Math.abs(idY) <= avoidDist) {
          if (idX * idX + idY * idY < avoidDist * avoidDist) {
            dAng = Math.atan2(idY, idX);
            break;
          }
        }
      }
      this.cachedNearest = nearest;
      this.cachedNearDistSq = nearDistSq;
      this.cachedDesiredAng = dAng;
    }
    const desiredAng = this.cachedDesiredAng;
  
    // Fuerza de separación entre piratas para evitar amontonamiento (Boids separation)
    for (let p2 = 0; p2 < state.pirateShips.length; p2++) {
      const otherPirate = state.pirateShips[p2];
      if (otherPirate === this || !otherPirate.isAlive) continue;
      const pDx = this.x - otherPirate.x;
      const pDy = this.y - otherPirate.y;
      if (Math.abs(pDx) < 45 && Math.abs(pDy) < 45) {
        const pDistSq = pDx * pDx + pDy * pDy;
        if (pDistSq < 2025 && pDistSq > 1) {
          const pDist = Math.sqrt(pDistSq);
          const push = (45 - pDist) * 2.2;
          this.vx += (pDx / pDist) * push * dt * 60;
          this.vy += (pDy / pDist) * push * dt * 60;
        }
      }
    }
  
    // Giro suave hacia el objetivo
    const diff = Math.atan2(Math.sin(desiredAng - this.rotation), Math.cos(desiredAng - this.rotation));
    this.rotation += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff * 4.2 * dt));
  
    const fwdX = Math.cos(this.rotation);
    const fwdY = Math.sin(this.rotation);
  
    this.vx += (fwdX * this.speed - this.vx) * 5.0 * dt;
    this.vy += (fwdY * this.speed - this.vy) * 5.0 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  
    // Mantener estrictamente dentro del área jugable (sin atravesar paneles laterales)
    if (this.x < arenaBounds.x + 24) {
      this.x = arenaBounds.x + 24;
      this.vx = Math.abs(this.vx) * 0.6 + 20;
    } else if (this.x > arenaBounds.x + arenaBounds.w - 24) {
      this.x = arenaBounds.x + arenaBounds.w - 24;
      this.vx = -Math.abs(this.vx) * 0.6 - 20;
    }
    if (this.y < arenaBounds.y + 24) {
      this.y = arenaBounds.y + 24;
      this.vy = Math.abs(this.vy) * 0.6 + 20;
    } else if (this.y > arenaBounds.y + arenaBounds.h - 24) {
      this.y = arenaBounds.y + arenaBounds.h - 24;
      this.vy = -Math.abs(this.vy) * 0.6 - 20;
    }
  
    // Disparar a los jugadores
    if (this.cachedNearest && this.cachedNearDistSq < 302500 && this.shootCooldown <= 0) { // 550^2
      this.shootCooldown = Math.max(2.5, 5.0 - this.wave * 0.08) + Math.random() * 1.0;
      const bX = this.x + fwdX * 28;
      const bY = this.y + fwdY * 28;
      spawnCannonball(bX, bY, fwdX, fwdY, -1, true, 1);
      gameEvents.emit("effect:muzzle", bX, bY, this.rotation);
      gameEvents.emit("ship:fired");
    }
  
    if (Math.random() < 0.35) {
      spawnWaterFoam(this.x - fwdX * 20, this.y - fwdY * 20, -fwdX, -fwdY);
    }
  }

  applyHit(dirX, dirY, force, dmg, attackerSlot) {
    if (!this.isAlive) return;
    gameEvents.emit("ship:hit");
    this.health -= (dmg !== undefined ? dmg : 1);
    this.flashTimer = 0.18;
    this.vx += dirX * (force || 300);
    this.vy += dirY * (force || 300);
  
    // Sumar puntos por impacto
    if (typeof attackerSlot === "number" && attackerSlot >= 0 && state.playersData[attackerSlot]) {
      state.playersData[attackerSlot].score += 25;
      gameEvents.emit("ship:hud", attackerSlot);
    }
  
    if (this.health <= 0) {
      this.die(attackerSlot);
    }
  }

  die(killerSlot) {
    if (!this.isAlive) return;
    this.isAlive = false;
    gameEvents.emit("ship:sunk");
    triggerScreenShake(0.25, 7);
  
    // Sumar puntos al jugador que hundió el barco pirata
    if (typeof killerSlot === "number" && killerSlot >= 0 && state.playersData[killerSlot]) {
      state.playersData[killerSlot].score += 100;
      addFloatingText("+100", this.x, this.y - 20, "#ffca28", 22);
      gameEvents.emit("ship:hud", killerSlot);
    }
  
    for (let i = 0; i < 24; i++) {
      const spd = 40 + Math.random() * 180;
      const ang = Math.random() * Math.PI * 2;
      addParticle(
        this.x, this.y,
        Math.cos(ang) * spd, Math.sin(ang) * spd,
        2 + Math.random() * 4, (i % 2 === 0) ? "#111111" : "#8e24aa", 0.65
      );
    }
  
    // 50% de probabilidad de soltar Botín de Mejora, 30% de munición
    if (Math.random() < 0.50) {
      const loot = getLootPosition(this.x, this.y);
      state.hordePowerups.push(new HordePowerup(loot.x, loot.y));
    } else if (Math.random() < 0.60) {
      const ammo = getLootPosition(this.x, this.y);
      state.ammoCrates.push(new AmmoCrate(ammo.x, ammo.y));
    }
  }

  draw(context) {
    drawPirateShip(context, this);
  }
}

// Galeón Jefe Pirata (Cada 10 Rondas)
class BossGalleon {
  /** @param {number} x @param {number} y @param {number} wave */
  constructor(x, y, wave) {
    this.x = x;
    this.y = y;
    this.rotation = Math.PI * 0.5;
    this.vx = 0;
    this.vy = 0;
    this.wave = wave;
    this.maxHealth = 22 + Math.floor(wave / 10) * 18;
    this.health = this.maxHealth;
    this.speed = 82;
    this.rank = Math.max(1, Math.floor(wave / 10));
    this.specialTimer = 4.2;
    this.warning = 0;
    this.isAlive = true;
    this.flashTimer = 0;
  }

  update(dt) {
    if (!this.isAlive) return;
    if (this.flashTimer > 0) this.flashTimer -= dt;
    this.specialTimer -= dt * (this.health <= this.maxHealth / 2 ? 2 : 1);
  
    // Navegar despacio hacia el centro o jugador más cercano
    let targetX = 960;
    let targetY = 540;
    for (let i = 0; i < state.activeShips.length; i++) {
      if (state.activeShips[i].isAlive) {
        targetX = state.activeShips[i].x;
        targetY = state.activeShips[i].y;
        break;
      }
    }
  
    const desiredAng = Math.atan2(targetY - this.y, targetX - this.x);
    const diff = Math.atan2(Math.sin(desiredAng - this.rotation), Math.cos(desiredAng - this.rotation));
    this.rotation += Math.max(-1.5 * dt, Math.min(1.5 * dt, diff * 2.2 * dt));
  
    const fwdX = Math.cos(this.rotation);
    const fwdY = Math.sin(this.rotation);
    const latX = -fwdY;
    const latY = fwdX;
  
    this.vx += (fwdX * this.speed - this.vx) * 3.0 * dt;
    this.vy += (fwdY * this.speed - this.vy) * 3.0 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  
    // Mantener al Galeón Jefe dentro de los límites del océano jugable
    if (this.x < arenaBounds.x + 60) {
      this.x = arenaBounds.x + 60;
      this.vx = Math.abs(this.vx) * 0.5 + 10;
    } else if (this.x > arenaBounds.x + arenaBounds.w - 60) {
      this.x = arenaBounds.x + arenaBounds.w - 60;
      this.vx = -Math.abs(this.vx) * 0.5 - 10;
    }
    if (this.y < arenaBounds.y + 60) {
      this.y = arenaBounds.y + 60;
      this.vy = Math.abs(this.vy) * 0.5 + 10;
    } else if (this.y > arenaBounds.y + arenaBounds.h - 60) {
      this.y = arenaBounds.y + arenaBounds.h - 60;
      this.vy = -Math.abs(this.vy) * 0.5 - 10;
    }
  
    // Anunciar la próxima salva antes de disparar.
    this.warning = this.specialTimer <= 0.75 ? 1 : 0;
    if (this.specialTimer <= 0) {
      this.specialTimer = 4.2;
        this.warning = 0;
      gameEvents.emit("ship:fired");
      triggerScreenShake(0.3, 7);
  
      for (let f = -1; f <= 1; f++) {
        const fAng = this.rotation + f * Math.min(0.5, 0.2 + this.rank * 0.06);
        const muzzleX = this.x + fwdX * 61 + latX * f * 14;
        const muzzleY = this.y + fwdY * 61 + latY * f * 14;
        spawnCannonball(muzzleX, muzzleY, Math.cos(fAng), Math.sin(fAng), -1, true, 2);
        gameEvents.emit("effect:muzzle", muzzleX, muzzleY, fAng);
      }
      const guns = Math.min(4, this.rank + 1);
      for (let gun = 0; gun < guns; gun++) {
        const offset = (gun - (guns - 1) / 2) * 23;
        const gunX = this.x + fwdX * offset;
        const gunY = this.y + fwdY * offset;
        spawnCannonball(gunX + latX * 29, gunY + latY * 29, latX, latY, -1, true, 2);
        spawnCannonball(gunX - latX * 29, gunY - latY * 29, -latX, -latY, -1, true, 2);
      }
    }
  
    if (Math.random() < 0.6) {
      spawnWaterFoam(this.x - fwdX * 45, this.y - fwdY * 45, -fwdX, -fwdY);
    }
  }

  applyHit(dirX, dirY, force, dmg, attackerSlot) {
    if (!this.isAlive) return;
    gameEvents.emit("ship:hit");
    triggerScreenShake(0.2, 5);
    this.health -= (dmg !== undefined ? dmg : 1);
    this.flashTimer = 0.2;
    this.vx += dirX * 60;
    this.vy += dirY * 60;
  
    // Sumar puntos por impacto al jefe
    if (typeof attackerSlot === "number" && attackerSlot >= 0 && state.playersData[attackerSlot]) {
      state.playersData[attackerSlot].score += 35;
      gameEvents.emit("ship:hud", attackerSlot);
    }
  
    if (this.health <= 0) {
      this.die(attackerSlot);
    }
  }

  die(killerSlot) {
    if (!this.isAlive) return;
    this.isAlive = false;
    Sound.playFanfare();
    triggerScreenShake(1.2, 18);
  
    // Sumar puntos al jugador que derrotó al Galeón Jefe
    if (typeof killerSlot === "number" && killerSlot >= 0 && state.playersData[killerSlot]) {
      state.playersData[killerSlot].score += 500;
      addFloatingText("+500", this.x, this.y - 40, "#ffd700", 36);
      gameEvents.emit("ship:hud", killerSlot);
    }
  
    for (let i = 0; i < 70; i++) {
      const spd = 60 + Math.random() * 260;
      const ang = Math.random() * Math.PI * 2;
      addParticle(
        this.x, this.y,
        Math.cos(ang) * spd, Math.sin(ang) * spd,
        4 + Math.random() * 8, (i % 2 === 0) ? "#ffd700" : "#ff1744", 1.2
      );
    }
  
    state.hordeUpgrades.fleetRank++;
    applyGlobalPowerup(4, this);
    addFloatingText("👑 ¡FLOTA BLINDADA! NIVEL " + state.hordeUpgrades.fleetRank, 960, 380, "#ffd700", 52);
  }

  draw(context) {
    drawBossGalleon(context, this);
  }
}

class Island {
  /** @param {{x: number, y: number, rad: number}} geometry */
  constructor({ x, y, rad }) {
    this.x = x;
    this.y = y;
    this.rad = rad;
  }
}

function updateLobbyShips() {
  if (state.currentState !== STATE_LOBBY) return;
  for (let i = 0; i < state.playersData.length; i++) {
    const p = state.playersData[i];
    let found = false;
    for (let s = 0; s < state.activeShips.length; s++) {
      if (state.activeShips[s].slot === p.slot) {
        found = true;
        if (!p.connected) {
          state.activeShips.splice(s, 1);
        }
        break;
      }
    }
    if (!found && p.connected) {
      const ang = (Math.PI * 2 / 8) * p.slot;
      const sX = 960 + Math.cos(ang) * 230;
      const sY = 640 + Math.sin(ang) * 230;
      state.activeShips.push(new Ship(p.slot, sX, sY, ang + Math.PI));
    }
  }
}

const cannonballPool = new ObjectPool(() => new Cannonball(0, 0, 0, 0, 0, false), 128);

/** @type {(...args: Parameters<Cannonball["reset"]>) => void} */
function spawnCannonball(x, y, dx, dy, shooterSlot, isPirate, damage, shooterTeam) {
  const ball = cannonballPool.acquire();
  ball.reset(x, y, dx, dy, shooterSlot, isPirate, damage, shooterTeam);
  state.cannonballs.push(ball);
}

/** @param {number} index */
function removeCannonball(index) {
  const ball = state.cannonballs[index];
  state.cannonballs[index] = state.cannonballs[state.cannonballs.length - 1];
  state.cannonballs.pop();
  cannonballPool.release(ball);
}

function clearCannonballs() {
  cannonballPool.releaseAll(state.cannonballs);
}

export { clearCannonballs, removeCannonball, spawnCannonball, Island, AmmoCrate, BossGalleon, Cannonball, HordePowerup, PirateShip, Ship, updateLobbyShips };

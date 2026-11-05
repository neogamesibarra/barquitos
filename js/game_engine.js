// game_engine.js - Motor principal de BARQUITOS (HTML5 Canvas 2D + WebSockets)
// Compatible con Samsung Smart TV (Tizen 2015 / ES5 estricto)
(function(window) {
  "use strict";

  // Capa de audio sintetizado procedural
  var Sound = {
    playCannon: function () { if (window.SoundSynth && window.SoundSynth.playCannon) window.SoundSynth.playCannon(); },
    playHit: function () { if (window.SoundSynth && window.SoundSynth.playHit) window.SoundSynth.playHit(); },
    playPickup: function () { if (window.SoundSynth && window.SoundSynth.playPickup) window.SoundSynth.playPickup(); },
    playSplash: function () { if (window.SoundSynth && window.SoundSynth.playSplash) window.SoundSynth.playSplash(); },
    playCountdown: function (isFinal) { if (window.SoundSynth && window.SoundSynth.playCountdown) window.SoundSynth.playCountdown(isFinal); },
    playFanfare: function () { if (window.SoundSynth && window.SoundSynth.playFanfare) window.SoundSynth.playFanfare(); },
    playIslandThud: function () { if (window.SoundSynth && window.SoundSynth.playIslandThud) window.SoundSynth.playIslandThud(); },
    playPowerup: function () { if (window.SoundSynth && window.SoundSynth.playPowerup) window.SoundSynth.playPowerup(); },
    playWaveStart: function () { if (window.SoundSynth && window.SoundSynth.playWaveStart) window.SoundSynth.playWaveStart(); },
    playBossAlert: function () { if (window.SoundSynth && window.SoundSynth.playBossAlert) window.SoundSynth.playBossAlert(); },
    toggleMute: function () { if (window.SoundSynth && window.SoundSynth.toggleMute) return window.SoundSynth.toggleMute(); return false; }
  };

  var elLobbyUI = null;
  function setLobbyUIVisible(visible) {
    if (!elLobbyUI) {
      elLobbyUI = document.getElementById("lobby-ui");
    }
    if (elLobbyUI) {
      var targetDisplay = visible ? "block" : "none";
      if (elLobbyUI.style.display !== targetDisplay) {
        elLobbyUI.style.display = targetDisplay;
      }
    }
  }

  // Estados del juego
  var STATE_LOBBY = 0;
  var STATE_ARENA = 1;
  var STATE_PODIUM = 3;

  // Modos de juego
  var MODE_BATTLE = 0; // Todos contra Todos (10 Rondas)
  var MODE_TEAMS = 1;  // Batalla por Equipos (10 Rondas)
  var MODE_HORDE = 2;  // Horda Pirata (Zombies Cooperativo)

  var currentState = STATE_LOBBY;
  var selectedMode = MODE_BATTLE;

  var currentRoomCode = "";
  var uuidToSlot = {};
  var PLAYER_PROFILES = [
    { slot: 0, name: "Capitán 1", hull: "#E67E22", sail: "#FFF8E7", stripe: "#2ECC71", symbol: "circle", uuid: "", connected: false, ready: false, score: 0, team: "blue", customName: "" },
    { slot: 1, name: "Capitán 2", hull: "#1E60D5", sail: "#82B1FF", stripe: "#0D47A1", symbol: "square", uuid: "", connected: false, ready: false, score: 0, team: "red", customName: "" },
    { slot: 2, name: "Capitán 3", hull: "#D81B60", sail: "#FF80AB", stripe: "#FFD600", symbol: "triangle", uuid: "", connected: false, ready: false, score: 0, team: "blue", customName: "" },
    { slot: 3, name: "Capitán 4", hull: "#43A047", sail: "#B9F6CA", stripe: "#1B5E20", symbol: "diamond", uuid: "", connected: false, ready: false, score: 0, team: "red", customName: "" },
    { slot: 4, name: "Capitán 5", hull: "#FDD835", sail: "#FFFDE7", stripe: "#F57F17", symbol: "star", uuid: "", connected: false, ready: false, score: 0, team: "blue", customName: "" },
    { slot: 5, name: "Capitán 6", hull: "#FF80AB", sail: "#FCE4EC", stripe: "#C51162", symbol: "heart", uuid: "", connected: false, ready: false, score: 0, team: "red", customName: "" },
    { slot: 6, name: "Capitán 7", hull: "#261C1A", sail: "#FFCA28", stripe: "#111111", symbol: "crown", uuid: "", connected: false, ready: false, score: 0, team: "blue", customName: "" },
    { slot: 7, name: "Capitán 8", hull: "#E53935", sail: "#FFCDD2", stripe: "#00ACC1", symbol: "bolt", uuid: "", connected: false, ready: false, score: 0, team: "red", customName: "" }
  ];

  var playersData = [];
  for (var pi = 0; pi < 8; pi++) {
    playersData.push(JSON.parse(JSON.stringify(PLAYER_PROFILES[pi])));
  }

  var activeShips = [];
  var cannonballs = [];
  var ammoCrates = [];
  var hordePowerups = [];
  var pirateShips = [];
  var bossGalleon = null;
  var particles = [];
  var floatingTexts = [];
  var islands = [];

  var currentRound = 0;
  var TOTAL_ROUNDS = 10; // 10 Rondas en Todos contra Todos y Equipos
  var teamScores = { blue: 0, red: 0 };

  // Variables Modo Horda Pirata
  var currentWave = 1;
  var waveSpawnTimer = 0;
  var waveEnemiesToSpawn = 0;
  var waveIntermissionTimer = 0;
  var hordeUpgrades = {
    weaponLevel: 1, // 1: normal, 2: cañón doble, 3: cañón triple, 4: cañón explosivo
    maxAmmo: 3,     // Bodega ampliada
    maxHealth: 3,   // Casco reforzado
    repairs: 0
  };

  var countdownTime = 0;
  var lastCountdownStep = -1;
  var roundTimer = 0;
  var suddenDeathActive = false;
  var arenaBounds = { x: 270, y: 35, w: 1380, h: 1010 };
  var currentBounds = { x: 270, y: 35, w: 1380, h: 1010 };

  var waveAnim = 0;
  var roundWinner = null;
  var roundOverTimer = 0;
  var podiumAnimTimer = 0;
  var podiumSelectedBtn = 0; // 0: Jugar Otra Vez, 1: Lobby

  // Screen Shake
  var shakeTimer = 0;
  var shakeIntensity = 0;
  function triggerScreenShake(duration, intensity) {
    shakeTimer = duration || 0.25;
    shakeIntensity = intensity || 8;
  }

  // Textos flotantes
  function addFloatingText(text, x, y, color, size) {
    floatingTexts.push({
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

  // Precomputar vértices trigonométricos para hexágonos
  var HEX_COS = [];
  var HEX_SIN = [];
  for (var hi = 0; hi < 6; hi++) {
    var hAngle = (Math.PI * 2 / 6) * hi - (Math.PI / 6);
    HEX_COS.push(Math.cos(hAngle));
    HEX_SIN.push(Math.sin(hAngle));
  }

  function drawHexagon(c, cx, cy, radius, fillCol, strokeCol, strokeW) {
    c.beginPath();
    c.moveTo(cx + HEX_COS[0] * radius, cy + HEX_SIN[0] * radius);
    for (var i = 1; i < 6; i++) {
      c.lineTo(cx + HEX_COS[i] * radius, cy + HEX_SIN[i] * radius);
    }
    c.closePath();
    if (fillCol) {
      c.fillStyle = fillCol;
      c.fill();
    }
    if (strokeCol) {
      c.strokeStyle = strokeCol;
      c.lineWidth = strokeW || 2;
      c.stroke();
    }
  }

  // Clase Barco
  function Ship(slot, x, y, rot) {
    this.slot = slot;
    this.data = playersData[slot] || {};
    this.x = x || 960;
    this.y = y || 540;
    this.rotation = rot !== undefined ? rot : 0;
    this.vx = 0;
    this.vy = 0;
    this.maxHealth = (selectedMode === MODE_HORDE) ? hordeUpgrades.maxHealth : 3;
    this.health = this.maxHealth;
    this.maxAmmo = (selectedMode === MODE_HORDE) ? hordeUpgrades.maxAmmo : 3;
    this.ammo = this.maxAmmo;
    this.boost = 1.0;
    this.isAlive = true;
    this.stunTimer = 0;
    this.spinVel = 0;
    this.shootCooldown = 0;
    this.flashTimer = 0;
    this.isRamming = false;
    this.ramCooldown = 0;
    this.kills = 0;
    this.turnInput = 0;
    this.thrustInput = false;
    this.shootInput = false;
  }

  Ship.prototype.update = function(dt) {
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
    } else {
      if (Math.abs(this.turnInput) > 0.05) {
        this.rotation += this.turnInput * 3.8 * dt;
      }
    }

    var fwdX = Math.cos(this.rotation);
    var fwdY = Math.sin(this.rotation);
    var latX = -fwdY;
    var latY = fwdX;

    var targetSpeed = 80;
    if (this.stunTimer <= 0) {
      if (this.thrustInput) {
        targetSpeed = (this.boost > 0.05) ? 340 : 185;
      }
    } else {
      targetSpeed = 0;
    }

    var curFwd = this.vx * fwdX + this.vy * fwdY;
    var curLat = this.vx * latX + this.vy * latY;

    curFwd += (targetSpeed - curFwd) * Math.min(1, 8.5 * dt);
    curLat += (0 - curLat) * Math.min(1, 4.6 * dt);

    this.vx = fwdX * curFwd + latX * curLat;
    this.vy = fwdY * curFwd + latY * curLat;

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // No permitir que los piratas se salgan de la zona jugable
    if (this.x < arenaBounds.x + 20) { this.x = arenaBounds.x + 20; this.vx = Math.abs(this.vx) * 0.5 + 40; }
    else if (this.x > arenaBounds.x + arenaBounds.w - 20) { this.x = arenaBounds.x + arenaBounds.w - 20; this.vx = -Math.abs(this.vx) * 0.5 - 40; }
    if (this.y < arenaBounds.y + 20) { this.y = arenaBounds.y + 20; this.vy = Math.abs(this.vy) * 0.5 + 40; }
    else if (this.y > arenaBounds.y + arenaBounds.h - 20) { this.y = arenaBounds.y + arenaBounds.h - 20; this.vy = -Math.abs(this.vy) * 0.5 - 40; }

    // Disparos
    if (this.shootInput) {
      if (this.shootCooldown <= 0 && this.ammo > 0 && this.stunTimer <= 0) {
        this.ammo--;
        this.shootCooldown = 0.42;

        this.vx -= fwdX * 180;
        this.vy -= fwdY * 180;

        Sound.playCannon();
        var sTeam = (selectedMode === MODE_TEAMS) ? (this.data.team || "blue") : null;
        var wLevel = (selectedMode === MODE_HORDE) ? hordeUpgrades.weaponLevel : 1;

        if (wLevel <= 1) {
          var bX = this.x + fwdX * 32;
          var bY = this.y + fwdY * 32;
          cannonballs.push(new Cannonball(bX, bY, fwdX, fwdY, this.slot, false, 1, sTeam));
          spawnMuzzleFlash(bX, bY, this.rotation);
        } else if (wLevel === 2) {
          // Cañón doble
          var bX1 = this.x + fwdX * 30 + latX * 7;
          var bY1 = this.y + fwdY * 30 + latY * 7;
          var bX2 = this.x + fwdX * 30 - latX * 7;
          var bY2 = this.y + fwdY * 30 - latY * 7;
          cannonballs.push(new Cannonball(bX1, bY1, fwdX, fwdY, this.slot, false, 1, sTeam));
          cannonballs.push(new Cannonball(bX2, bY2, fwdX, fwdY, this.slot, false, 1, sTeam));
          spawnMuzzleFlash(bX1, bY1, this.rotation);
          spawnMuzzleFlash(bX2, bY2, this.rotation);
        } else {
          // Cañón triple
          var ang1 = this.rotation - 0.16;
          var ang2 = this.rotation;
          var ang3 = this.rotation + 0.16;
          cannonballs.push(new Cannonball(this.x + fwdX * 32, this.y + fwdY * 32, Math.cos(ang1), Math.sin(ang1), this.slot, false, 1.2, sTeam));
          cannonballs.push(new Cannonball(this.x + fwdX * 32, this.y + fwdY * 32, Math.cos(ang2), Math.sin(ang2), this.slot, false, 1.2, sTeam));
          cannonballs.push(new Cannonball(this.x + fwdX * 32, this.y + fwdY * 32, Math.cos(ang3), Math.sin(ang3), this.slot, false, 1.2, sTeam));
          spawnMuzzleFlash(this.x + fwdX * 32, this.y + fwdY * 32, this.rotation);
        }

        sendTvAction("vibrate", this.slot, 60);
      }
      this.shootInput = false;
    }

    // Estela de espuma de agua en popa
    var curSpd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (curSpd > 35) {
      if (Math.random() < 0.55) {
        spawnWaterFoam(this.x - fwdX * 24, this.y - fwdY * 24, -fwdX, -fwdY);
      }
    }
  };

  Ship.prototype.applyHit = function(dirX, dirY, force, dmg) {
    if (!this.isAlive) return;
    Sound.playHit();
    triggerScreenShake(0.18, 5);
    var damage = (dmg !== undefined) ? dmg : 1;
    var finalForce = (this.ammo === 0) ? force * 2.0 : force;
    this.vx += dirX * finalForce;
    this.vy += dirY * finalForce;
    this.stunTimer = 0.35;
    this.spinVel = (Math.random() - 0.5) * 24;
    this.flashTimer = 0.22;
    sendTvAction("vibrate", this.slot, 120);

    // Chispas de madera
    for (var p = 0; p < 8; p++) {
      var pAng = Math.random() * Math.PI * 2;
      var pSpd = 40 + Math.random() * 90;
      particles.push({
        x: this.x, y: this.y,
        vx: Math.cos(pAng) * pSpd, vy: Math.sin(pAng) * pSpd,
        radius: 2 + Math.random() * 3,
        color: "#ffdd44", life: 0.35, maxLife: 0.35
      });
    }

    if (currentState !== STATE_LOBBY) {
      this.health -= damage;
      if (this.health <= 0) {
        this.health = 0;
        this.die();
      }
    }
  };

  Ship.prototype.applyRam = function(dirX, dirY, force) {
    if (!this.isAlive) return;
    Sound.playHit();
    this.vx += dirX * force;
    this.vy += dirY * force;
    this.stunTimer = 0.3;
    this.spinVel = (Math.random() - 0.5) * 18;
    this.flashTimer = 0.15;
    sendTvAction("vibrate", this.slot, 90);
  };

  Ship.prototype.collectAmmo = function() {
    if (!this.isAlive || this.ammo >= this.maxAmmo) return false;
    this.ammo = Math.min(this.maxAmmo, this.ammo + 3);
    this.shootInput = false; // Jamás disparar al recoger
    this.shootCooldown = 0.35;
    Sound.playPickup();
    sendTvAction("vibrate", this.slot, 40);
    return true;
  };

  Ship.prototype.die = function() {
    if (!this.isAlive) return;
    this.isAlive = false;
    Sound.playSplash();
    triggerScreenShake(0.35, 10);
    sendTvAction("vibrate", this.slot, 300);

    for (var i = 0; i < 35; i++) {
      var spd = 60 + Math.random() * 220;
      var ang = Math.random() * Math.PI * 2;
      particles.push({
        x: this.x, y: this.y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        radius: 3 + Math.random() * 6,
        color: this.data.hull || "#ff2222",
        life: 0.8, maxLife: 0.8
      });
    }
  };

  Ship.prototype.draw = function(c) {
    if (!this.isAlive) return;
    c.save();
    c.translate(this.x, this.y);
    c.rotate(this.rotation);

    var hullCol = this.flashTimer > 0 ? "#ffffff" : this.data.hull;
    var sailCol = this.flashTimer > 0 ? "#ffffff" : this.data.sail;
    var stripeCol = this.flashTimer > 0 ? "#ffffff" : this.data.stripe;

    // Modo Equipos: pintar vela con el color del equipo
    if (selectedMode === MODE_TEAMS) {
      var t = this.data.team || "blue";
      sailCol = (t === "blue") ? "#42a5f5" : "#ef5350";
      stripeCol = (t === "blue") ? "#0d47a1" : "#b71c1c";
    }

    var outlineCol = "#1c1c24";

    // 1. Casco: Popa rectangular en x = -24, proa triangular en x = 28
    c.beginPath();
    c.moveTo(28, 0);
    c.lineTo(16, -14);
    c.lineTo(-24, -14);
    c.lineTo(-24, 14);
    c.lineTo(16, 14);
    c.closePath();
    c.fillStyle = hullCol;
    c.fill();
    c.strokeStyle = outlineCol;
    c.lineWidth = 3;
    c.stroke();

    // 1b. Espolón metálico frontal puntiagudo (Ariete de acero)
    // Collar metálico de la base
    c.beginPath();
    c.rect(23, -7, 4, 14);
    c.fillStyle = (this.flashTimer > 0) ? "#ffffff" : "#37474f";
    c.fill();
    c.strokeStyle = outlineCol;
    c.lineWidth = 1.5;
    c.stroke();

    // Remaches dorados del collar
    c.fillStyle = (this.flashTimer > 0) ? "#ffffff" : "#ffd54f";
    c.fillRect(24, -5, 2, 2);
    c.fillRect(24, 3, 2, 2);

    // Faceta superior iluminada (acero plateado)
    c.beginPath();
    c.moveTo(26, -7);
    c.lineTo(44, 0);
    c.lineTo(26, 0);
    c.closePath();
    c.fillStyle = (this.flashTimer > 0) ? "#ffffff" : "#cfd8dc";
    c.fill();

    // Faceta inferior sombreada (acero oscuro)
    c.beginPath();
    c.moveTo(26, 0);
    c.lineTo(44, 0);
    c.lineTo(26, 7);
    c.closePath();
    c.fillStyle = (this.flashTimer > 0) ? "#ffffff" : "#78909c";
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
    c.strokeStyle = (this.flashTimer > 0) ? "#ffffff" : "#eceff1";
    c.lineWidth = 1.2;
    c.stroke();

    // Destello de energía en la punta si está embistiendo con velocidad
    var fwdSpdDraw = this.vx * Math.cos(this.rotation) + this.vy * Math.sin(this.rotation);
    if (this.isRamming || fwdSpdDraw > 130) {
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
    drawSymbolOnDeck(c, -10, 0, this.data.symbol, stripeCol, outlineCol);

    // 5. Pips de munición
    var ammoDrawCount = Math.min(this.maxAmmo, 5);
    var startPy = -((ammoDrawCount - 1) * 3);
    for (var a = 0; a < ammoDrawCount; a++) {
      c.beginPath();
      c.arc(-19, startPy + a * 6, 2.2, 0, Math.PI * 2);
      if (this.ammo > a) {
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
    if (this.boost < 0.98) {
      c.beginPath();
      c.arc(-24, 0, 9, -Math.PI * 0.5, -Math.PI * 0.5 + this.boost * Math.PI);
      c.strokeStyle = this.boost < 0.2 ? "rgba(255, 60, 20, 0.9)" : "rgba(0, 220, 255, 0.9)";
      c.lineWidth = 2.5;
      c.stroke();
    }

    c.restore();

    // 7. Nombre y Vidas sobre el barco
    if (currentState !== STATE_LOBBY) {
      var displayName = this.data.customName || this.data.name;
      c.save();
      c.font = "bold 13px sans-serif";
      c.textAlign = "center";
      c.fillStyle = "#ffffff";
      c.strokeStyle = "#000000";
      c.lineWidth = 3.5;
      c.strokeText(displayName, this.x, this.y - 42);
      c.fillText(displayName, this.x, this.y - 42);

      // Corazones de vida
      var heartSpacing = 14;
      var totalHw = (this.maxHealth - 1) * heartSpacing;
      var startHx = this.x - totalHw / 2;
      var hy = this.y - 28;
      for (var h = 0; h < this.maxHealth; h++) {
        var heartState = Math.max(0, Math.min(1, this.health - h));
        drawMiniHeart(c, startHx + h * heartSpacing, hy, heartState);
      }
      c.restore();
    }
  };

  function drawMiniHeart(c, x, y, fillState) {
    c.save();
    c.translate(x, y);

    function makeHeart() {
      c.beginPath();
      c.moveTo(0, 1.5);
      c.bezierCurveTo(-4, -3.5, -6, 1.5, 0, 5.5);
      c.bezierCurveTo(6, 1.5, 4, -3.5, 0, 1.5);
      c.closePath();
    }

    var isFull = (fillState === true || fillState >= 0.99);
    var isHalf = (!isFull && fillState >= 0.49);

    if (isFull) {
      makeHeart();
      c.fillStyle = "#ff2a55";
      c.fill();
      c.strokeStyle = "#220008";
      c.lineWidth = 1.2;
      c.stroke();
    } else if (isHalf) {
      // Fondo oscuro
      makeHeart();
      c.fillStyle = "rgba(15, 25, 35, 0.7)";
      c.fill();

      // Recorte de la mitad izquierda roja (clipping)
      c.save();
      c.beginPath();
      c.rect(-10, -10, 10, 20);
      c.clip();
      makeHeart();
      c.fillStyle = "#ff2a55";
      c.fill();
      c.restore();

      // Borde exterior
      makeHeart();
      c.strokeStyle = "#ff2a55";
      c.lineWidth = 1.2;
      c.stroke();
    } else {
      makeHeart();
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
      for (var si = 0; si < 5; si++) {
        var aExt = (Math.PI * 2 / 5) * si - Math.PI / 2;
        var aInt = aExt + Math.PI / 5;
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

  // Clase Bala de Cañón
  function Cannonball(x, y, dx, dy, shooterSlot, isPirate, damage, shooterTeam) {
    this.x = x;
    this.y = y;
    this.dx = dx;
    this.dy = dy;
    this.shooterSlot = shooterSlot;
    this.isPirate = !!isPirate;
    this.damage = damage || 1;
    this.shooterTeam = shooterTeam || null;
    this.dist = 0;
    this.maxDist = isPirate ? 540 : 580;
    this.speed = isPirate ? 600 : 700;
    this.isDead = false;
  }

  Cannonball.prototype.update = function(dt) {
    var step = this.speed * dt;
    this.x += this.dx * step;
    this.y += this.dy * step;
    this.dist += step;

    if (this.dist >= this.maxDist) {
      this.isDead = true;
      spawnSplash(this.x, this.y);
    }
  };

  Cannonball.prototype.draw = function(c) {
    c.beginPath();
    c.arc(this.x, this.y, this.isPirate ? 7 : 6, 0, Math.PI * 2);
    if (this.isPirate) {
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
      c.arc(this.x - 2, this.y - 2, 1.8, 0, Math.PI * 2);
      c.fillStyle = "rgba(255, 255, 255, 0.8)";
      c.fill();
    }
  };

  // Cajas de munición estándar
  function AmmoCrate(x, y) {
    this.x = x;
    this.baseY = y;
    this.y = y;
    this.time = Math.random() * 5;
  }

  AmmoCrate.prototype.update = function(dt) {
    this.time += dt * 3.0;
    this.y = this.baseY + Math.sin(this.time) * 4.0;
  };

  AmmoCrate.prototype.draw = function(c) {
    c.save();
    c.translate(this.x, this.y);
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
  };

  // Mejoras Globales de Horda (Power-ups estilo CoD Zombies)
  // 0: REPARACIÓN TOTAL, 1: BODEGA AMPLIADA, 2: MUNICIÓN MÁXIMA, 3: PACK-A-PUNCH, 4: CASCO REFORZADO
  function HordePowerup(x, y, type) {
    this.x = x;
    this.baseY = y;
    this.y = y;
    this.time = Math.random() * 5;
    this.type = (type !== undefined) ? type : Math.floor(Math.random() * 5);
  }

  HordePowerup.prototype.update = function(dt) {
    this.time += dt * 3.5;
    this.y = this.baseY + Math.sin(this.time) * 5.0;
  };

  HordePowerup.prototype.draw = function(c) {
    c.save();
    c.translate(this.x, this.y);

    // Halo pulsante exterior
    var pulse = 0.7 + 0.3 * Math.sin(this.time * 2.5);
    var haloColor = "#00e5ff";
    var icon = "⚡";
    if (this.type === 0) { haloColor = "#00e676"; icon = "💚"; }
    else if (this.type === 1) { haloColor = "#29b6f6"; icon = "📦"; }
    else if (this.type === 2) { haloColor = "#ffea00"; icon = "⚡"; }
    else if (this.type === 3) { haloColor = "#ff4081"; icon = "💥"; }
    else if (this.type === 4) { haloColor = "#ffd700"; icon = "🛡️"; }

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
  };

  function applyGlobalPowerup(type, collector) {
    Sound.playPowerup();
    triggerScreenShake(0.3, 8);
    sendTvAction("vibrate", null, [100, 60, 140]);

    if (type === 0) {
      // Reparación Total + Revivir a todos los caídos
      hordeUpgrades.repairs++;
      for (var r = 0; r < activeShips.length; r++) {
        var sh = activeShips[r];
        if (!sh.isAlive) {
          sh.isAlive = true;
          sh.health = sh.maxHealth;
          sh.x = 960 + (Math.random() - 0.5) * 180;
          sh.y = 540 + (Math.random() - 0.5) * 180;
          sh.vx = 0; sh.vy = 0;
        } else {
          sh.health = sh.maxHealth;
        }
      }
      addFloatingText("💚 ¡REPARACIÓN TOTAL Y REVIVIR!", collector.x, collector.y - 45, "#00e676", 42);
    } else if (type === 1) {
      // Bodega Ampliada (+1 max ammo)
      hordeUpgrades.maxAmmo++;
      for (var a = 0; a < activeShips.length; a++) {
        activeShips[a].maxAmmo = hordeUpgrades.maxAmmo;
      }
      addFloatingText("📦 ¡BODEGA AMPLIADA! (MÁX " + hordeUpgrades.maxAmmo + " BALAS)", collector.x, collector.y - 45, "#29b6f6", 38);
    } else if (type === 2) {
      // Munición Máxima
      for (var m = 0; m < activeShips.length; m++) {
        activeShips[m].ammo = activeShips[m].maxAmmo;
      }
      addFloatingText("⚡ ¡MUNICIÓN MÁXIMA PARA TODOS!", collector.x, collector.y - 45, "#ffea00", 42);
    } else if (type === 3) {
      // Pack-a-Punch (Armas mejoradas)
      hordeUpgrades.weaponLevel++;
      var wName = (hordeUpgrades.weaponLevel === 2) ? "DOBLE CAÑÓN" : (hordeUpgrades.weaponLevel === 3 ? "TRIPLE DISPARO" : "CAÑONES HIPER");
      addFloatingText("💥 ¡PACK-A-PUNCH! " + wName + " (NV " + hordeUpgrades.weaponLevel + ")", collector.x, collector.y - 45, "#ff4081", 40);
    } else if (type === 4) {
      // Casco Reforzado (+1 vida max permanent)
      hordeUpgrades.maxHealth++;
      for (var c = 0; c < activeShips.length; c++) {
        activeShips[c].maxHealth = hordeUpgrades.maxHealth;
        activeShips[c].health = Math.min(activeShips[c].maxHealth, activeShips[c].health + 1);
      }
      addFloatingText("🛡️ ¡CASCO REFORZADO! (+1 BLINDAJE)", collector.x, collector.y - 45, "#ffd700", 40);
    }
  }

  // Barcos Piratas Enemigos (IA)
  function PirateShip(x, y, wave) {
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

  PirateShip.prototype.update = function(dt) {
    if (!this.isAlive) return;
    if (this.flashTimer > 0) this.flashTimer -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;

    // Buscar jugador vivo más cercano
    var nearest = null;
    var nearDistSq = 99999999;
    for (var i = 0; i < activeShips.length; i++) {
      var s = activeShips[i];
      if (!s.isAlive) continue;
      var dSq = (s.x - this.x) * (s.x - this.x) + (s.y - this.y) * (s.y - this.y);
      if (dSq < nearDistSq) {
        nearDistSq = dSq;
        nearest = s;
      }
    }

    var desiredAng = this.rotation;
    if (nearest) {
      desiredAng = Math.atan2(nearest.y - this.y, nearest.x - this.x);
    }

    // Esquivar islas
    for (var ii = 0; ii < islands.length; ii++) {
      var isl = islands[ii];
      var idX = this.x - isl.x;
      var idY = this.y - isl.y;
      var iDist = Math.sqrt(idX * idX + idY * idY);
      if (iDist < isl.rad + 70) {
        var avoidAng = Math.atan2(idY, idX);
        desiredAng = avoidAng;
        break;
      }
    }

    // Giro suave hacia el objetivo
    var diff = desiredAng - this.rotation;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    this.rotation += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff * 4.2 * dt));

    var fwdX = Math.cos(this.rotation);
    var fwdY = Math.sin(this.rotation);

    this.vx += (fwdX * this.speed - this.vx) * 5.0 * dt;
    this.vy += (fwdY * this.speed - this.vy) * 5.0 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Disparar a los jugadores
    if (nearest && nearDistSq < 302500 && this.shootCooldown <= 0) { // 550^2
      this.shootCooldown = Math.max(2.5, 5.0 - this.wave * 0.08) + Math.random() * 1.0;
      var bX = this.x + fwdX * 28;
      var bY = this.y + fwdY * 28;
      cannonballs.push(new Cannonball(bX, bY, fwdX, fwdY, -1, true, 1));
      spawnMuzzleFlash(bX, bY, this.rotation);
      Sound.playCannon();
    }

    if (Math.random() < 0.35) {
      spawnWaterFoam(this.x - fwdX * 20, this.y - fwdY * 20, -fwdX, -fwdY);
    }
  };

  PirateShip.prototype.applyHit = function(dirX, dirY, force, dmg) {
    if (!this.isAlive) return;
    Sound.playHit();
    this.health -= (dmg !== undefined ? dmg : 1);
    this.flashTimer = 0.18;
    this.vx += dirX * (force || 300);
    this.vy += dirY * (force || 300);

    if (this.health <= 0) {
      this.die();
    }
  };

  PirateShip.prototype.die = function() {
    if (!this.isAlive) return;
    this.isAlive = false;
    Sound.playSplash();
    triggerScreenShake(0.25, 7);

    for (var i = 0; i < 24; i++) {
      var spd = 40 + Math.random() * 180;
      var ang = Math.random() * Math.PI * 2;
      particles.push({
        x: this.x, y: this.y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        radius: 2 + Math.random() * 4,
        color: (i % 2 === 0) ? "#111111" : "#8e24aa",
        life: 0.65, maxLife: 0.65
      });
    }

    // 50% de probabilidad de soltar Botín de Mejora, 30% de munición
    if (Math.random() < 0.50) {
      hordePowerups.push(new HordePowerup(this.x, this.y));
    } else if (Math.random() < 0.60) {
      ammoCrates.push(new AmmoCrate(this.x, this.y));
    }
  };

  PirateShip.prototype.draw = function(c) {
    if (!this.isAlive) return;
    c.save();
    c.translate(this.x, this.y);
    c.rotate(this.rotation);

    var hullCol = this.flashTimer > 0 ? "#ffffff" : "#1a1a1e";
    var sailCol = this.flashTimer > 0 ? "#ffffff" : "#2c2c34";

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
    if (this.maxHealth > 1 || this.health < this.maxHealth) {
      var bw = 28;
      var bh = 4;
      var bx = this.x - bw / 2;
      var by = this.y - 22;
      c.fillStyle = "rgba(0,0,0,0.6)";
      c.fillRect(bx, by, bw, bh);
      c.fillStyle = "#ff1744";
      c.fillRect(bx, by, bw * (this.health / this.maxHealth), bh);
    }
  };

  // Galeón Jefe Pirata (Cada 10 Rondas)
  function BossGalleon(x, y, wave) {
    this.x = x;
    this.y = y;
    this.rotation = Math.PI * 0.5;
    this.vx = 0;
    this.vy = 0;
    this.wave = wave;
    this.maxHealth = 20 + Math.floor(wave / 10) * 10;
    this.health = this.maxHealth;
    this.speed = 70;
    this.specialTimer = 6.0;
    this.isAlive = true;
    this.flashTimer = 0;
  }

  BossGalleon.prototype.update = function(dt) {
    if (!this.isAlive) return;
    if (this.flashTimer > 0) this.flashTimer -= dt;
    this.specialTimer -= dt;

    // Navegar despacio hacia el centro o jugador más cercano
    var targetX = 960;
    var targetY = 540;
    for (var i = 0; i < activeShips.length; i++) {
      if (activeShips[i].isAlive) {
        targetX = activeShips[i].x;
        targetY = activeShips[i].y;
        break;
      }
    }

    var desiredAng = Math.atan2(targetY - this.y, targetX - this.x);
    var diff = desiredAng - this.rotation;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    this.rotation += Math.max(-1.5 * dt, Math.min(1.5 * dt, diff * 2.2 * dt));

    var fwdX = Math.cos(this.rotation);
    var fwdY = Math.sin(this.rotation);
    var latX = -fwdY;
    var latY = fwdX;

    this.vx += (fwdX * this.speed - this.vx) * 3.0 * dt;
    this.vy += (fwdY * this.speed - this.vy) * 3.0 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Ataques especiales del Jefe
    if (this.specialTimer <= 0) {
      this.specialTimer = 6.0;
      Sound.playCannon();
      triggerScreenShake(0.3, 7);

      // Disparo frontal moderado (3 cañones)
      for (var f = -1; f <= 1; f++) {
        var fAng = this.rotation + f * 0.25;
        cannonballs.push(new Cannonball(this.x + fwdX * 50, this.y + fwdY * 50, Math.cos(fAng), Math.sin(fAng), -1, true, 1));
      }

      // Salva lateral moderada (1 cañón por cada banda)
      cannonballs.push(new Cannonball(this.x + latX * 25, this.y + latY * 25, latX, latY, -1, true, 1));
      cannonballs.push(new Cannonball(this.x - latX * 25, this.y - latY * 25, -latX, -latY, -1, true, 1));
      spawnMuzzleFlash(this.x + fwdX * 50, this.y + fwdY * 50, this.rotation);
    }

    if (Math.random() < 0.6) {
      spawnWaterFoam(this.x - fwdX * 45, this.y - fwdY * 45, -fwdX, -fwdY);
    }
  };

  BossGalleon.prototype.applyHit = function(dirX, dirY, force, dmg) {
    if (!this.isAlive) return;
    Sound.playHit();
    triggerScreenShake(0.2, 5);
    this.health -= (dmg !== undefined ? dmg : 1);
    this.flashTimer = 0.2;
    this.vx += dirX * 60;
    this.vy += dirY * 60;

    if (this.health <= 0) {
      this.die();
    }
  };

  BossGalleon.prototype.die = function() {
    if (!this.isAlive) return;
    this.isAlive = false;
    Sound.playFanfare();
    triggerScreenShake(1.2, 18);

    for (var i = 0; i < 70; i++) {
      var spd = 60 + Math.random() * 260;
      var ang = Math.random() * Math.PI * 2;
      particles.push({
        x: this.x, y: this.y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        radius: 4 + Math.random() * 8,
        color: (i % 2 === 0) ? "#ffd700" : "#ff1744",
        life: 1.2, maxLife: 1.2
      });
    }

    // Suelta 2 mejoras garantizadas
    hordePowerups.push(new HordePowerup(this.x - 30, this.y, 3)); // Pack-a-Punch
    hordePowerups.push(new HordePowerup(this.x + 30, this.y, 0)); // Reparación Total
    addFloatingText("👑 ¡GALEÓN JEFE DERROTADO!", 960, 380, "#ffd700", 52);
  };

  BossGalleon.prototype.draw = function(c) {
    if (!this.isAlive) return;
    c.save();
    c.translate(this.x, this.y);
    c.rotate(this.rotation);

    var hullCol = this.flashTimer > 0 ? "#ffffff" : "#0d0d11";
    var sailCol = this.flashTimer > 0 ? "#ffffff" : "#212121";

    // Casco gigante
    c.beginPath();
    c.moveTo(56, 0); c.lineTo(34, -26); c.lineTo(-50, -26);
    c.lineTo(-50, 26); c.lineTo(34, 26);
    c.closePath();
    c.fillStyle = hullCol;
    c.fill();
    c.strokeStyle = "#ffd700";
    c.lineWidth = 4;
    c.stroke();

    // 3 Mástiles y Velas
    var mastOffsets = [-24, 4, 30];
    for (var m = 0; m < 3; m++) {
      var mx = mastOffsets[m];
      c.beginPath();
      c.moveTo(mx - 8, -22); c.lineTo(mx + 12, 0); c.lineTo(mx - 8, 22);
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
  };

  // Partículas y Efectos
  function spawnSplash(x, y) {
    for (var i = 0; i < 14; i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 20 + Math.random() * 80;
      particles.push({
        x: x, y: y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        radius: 2 + Math.random() * 3,
        color: "rgba(180, 230, 255, 0.8)",
        life: 0.35, maxLife: 0.35
      });
    }
  }

  function spawnMuzzleFlash(x, y, rot) {
    for (var i = 0; i < 7; i++) {
      var ang = rot + (Math.random() - 0.5) * 0.7;
      var spd = 80 + Math.random() * 160;
      particles.push({
        x: x, y: y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        radius: 3 + Math.random() * 4,
        color: "#ffea40", life: 0.18, maxLife: 0.18
      });
    }
  }

  function spawnIslandImpactParticles(x, y) {
    for (var i = 0; i < 14; i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 30 + Math.random() * 95;
      particles.push({
        x: x, y: y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        radius: 2.5 + Math.random() * 4,
        color: (i % 2 === 0) ? "#8d6e63" : (i % 3 === 0 ? "#5d4037" : "#455a64"),
        life: 0.42, maxLife: 0.42
      });
    }
  }

  function spawnMetalRamSparks(x, y, dirX, dirY) {
    var baseAng = Math.atan2(dirY, dirX);
    for (var i = 0; i < 16; i++) {
      var sAng = baseAng + (Math.random() - 0.5) * 1.8;
      var sSpd = 90 + Math.random() * 220;
      var col = (i % 3 === 0) ? "#ffffff" : (i % 2 === 0 ? "#fff176" : "#ff9100");
      particles.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 6,
        vx: Math.cos(sAng) * sSpd,
        vy: Math.sin(sAng) * sSpd,
        radius: 1.8 + Math.random() * 2.5,
        color: col,
        life: 0.32,
        maxLife: 0.32
      });
    }
  }

  function spawnWaterFoam(x, y, dirX, dirY) {
    particles.push({
      x: x + (Math.random() - 0.5) * 8,
      y: y + (Math.random() - 0.5) * 8,
      vx: dirX * 15 + (Math.random() - 0.5) * 10,
      vy: dirY * 15 + (Math.random() - 0.5) * 10,
      radius: 2.5 + Math.random() * 3.5,
      color: "rgba(255, 255, 255, 0.75)",
      life: 0.55, maxLife: 0.55
    });
  }

  function spawnConfetti(count) {
    count = count || 60;
    var colors = ["#E67E22", "#1E60D5", "#D81B60", "#43A047", "#FDD835", "#FF80AB", "#00E5FF", "#FF2A2A"];
    for (var i = 0; i < count; i++) {
      var x = 200 + Math.random() * 1520;
      particles.push({
        x: x, y: 1040,
        vx: (Math.random() - 0.5) * 350,
        vy: -400 - Math.random() * 450,
        radius: 5 + Math.random() * 7,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 2.5, maxLife: 2.5, gravity: 300
      });
    }
  }

  function renderParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.gravity) p.vy += p.gravity * dt;
      p.life -= dt;
      if (p.life <= 0) {
        particles[i] = particles[particles.length - 1];
        particles.pop();
        continue;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * (p.life / p.maxLife), 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
  }

  function renderFloatingTexts(dt) {
    for (var i = floatingTexts.length - 1; i >= 0; i--) {
      var ft = floatingTexts[i];
      ft.y += ft.vy * dt;
      ft.life -= dt;
      if (ft.life <= 0) {
        floatingTexts[i] = floatingTexts[floatingTexts.length - 1];
        floatingTexts.pop();
        continue;
      }
      var alpha = Math.min(1.0, ft.life / 0.5);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = "bold " + ft.size + "px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = ft.color;
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 4.5;
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }

  // Red MQTT y Acciones hacia mandos
  function sendTvAction(action, slot, val) {
    if (window.CloudNet && window.CloudNet.isConnected()) {
      if (action === "vibrate") {
        if (slot === null) {
          window.CloudNet.broadcast({ type: "vibrate", duration: val || 80 });
        } else {
          for (var i = 0; i < playersData.length; i++) {
            if (playersData[i].slot === slot && playersData[i].uuid) {
              window.CloudNet.sendToPlayer(playersData[i].uuid, { type: "vibrate", duration: val || 80 });
              break;
            }
          }
        }
      } else if (action === "state_change") {
        window.CloudNet.broadcast({ type: "state_change", state: val });
      }
    }
  }

  // Configuración de Islas
  function initArenaIslands() {
    islands = [
      { x: 960, y: 540, rad: 70 },
      { x: 600, y: 330, rad: 55 },
      { x: 1320, y: 750, rad: 55 },
      { x: 600, y: 750, rad: 52 },
      { x: 1320, y: 330, rad: 52 }
    ];
  }

  // Inicio de Rondas y Modos
  function startBattleRound() {
    currentState = STATE_ARENA;
    countdownTime = 3.5;
    lastCountdownStep = -1;
    roundTimer = 0;
    suddenDeathActive = false;
    currentBounds = { x: arenaBounds.x, y: arenaBounds.y, w: arenaBounds.w, h: arenaBounds.h };
    roundWinner = null;
    roundOverTimer = 0;
    sendTvAction("state_change", null, "playing");

    initArenaIslands();
    cannonballs = [];
    ammoCrates = [];
    hordePowerups = [];
    pirateShips = [];
    bossGalleon = null;
    particles = [];
    floatingTexts = [];

    ammoCrates.push(new AmmoCrate(700, 540));
    ammoCrates.push(new AmmoCrate(1220, 540));

    activeShips = [];
    var connected = [];
    for (var i = 0; i < playersData.length; i++) {
      if (playersData[i].connected) connected.push(playersData[i]);
    }
    if (connected.length === 0) {
      connected = [playersData[0], playersData[1]];
    }

    var count = connected.length;
    var radius = 350;
    for (var j = 0; j < count; j++) {
      var p = connected[j];
      var angle = (Math.PI * 2 / count) * j;
      var sX = 960 + Math.cos(angle) * radius;
      var sY = 540 + Math.sin(angle) * radius;
      var ship = new Ship(p.slot, sX, sY, angle + Math.PI);
      activeShips.push(ship);
    }
  }

  function startTeamsRound() {
    currentState = STATE_ARENA;
    countdownTime = 3.5;
    lastCountdownStep = -1;
    roundTimer = 0;
    suddenDeathActive = false;
    currentBounds = { x: arenaBounds.x, y: arenaBounds.y, w: arenaBounds.w, h: arenaBounds.h };
    roundWinner = null;
    roundOverTimer = 0;
    sendTvAction("state_change", null, "playing");

    initArenaIslands();
    cannonballs = [];
    ammoCrates = [];
    hordePowerups = [];
    pirateShips = [];
    bossGalleon = null;
    particles = [];
    floatingTexts = [];

    ammoCrates.push(new AmmoCrate(700, 540));
    ammoCrates.push(new AmmoCrate(1220, 540));

    activeShips = [];
    var blueShips = [];
    var redShips = [];

    for (var i = 0; i < playersData.length; i++) {
      if (playersData[i].connected) {
        if (playersData[i].team === "red") redShips.push(playersData[i]);
        else blueShips.push(playersData[i]);
      }
    }

    // Fallback si no hay conectados
    if (blueShips.length === 0 && redShips.length === 0) {
      blueShips.push(playersData[0]);
      redShips.push(playersData[1]);
    }

    // Desplegar barcos azules en la izquierda
    for (var b = 0; b < blueShips.length; b++) {
      var bY = 540 + (b - (blueShips.length - 1) / 2) * 130;
      var sBlue = new Ship(blueShips[b].slot, 520, bY, 0);
      activeShips.push(sBlue);
    }

    // Desplegar barcos rojos en la derecha
    for (var r = 0; r < redShips.length; r++) {
      var rY = 540 + (r - (redShips.length - 1) / 2) * 130;
      var sRed = new Ship(redShips[r].slot, 1400, rY, Math.PI);
      activeShips.push(sRed);
    }
  }

  function startHordeMode() {
    currentState = STATE_ARENA;
    currentWave = 1;
    countdownTime = 3.5;
    lastCountdownStep = -1;
    roundTimer = 0;
    suddenDeathActive = false;
    currentBounds = { x: arenaBounds.x, y: arenaBounds.y, w: arenaBounds.w, h: arenaBounds.h };
    roundWinner = null;
    roundOverTimer = 0;
    sendTvAction("state_change", null, "playing");

    hordeUpgrades = {
      weaponLevel: 1,
      maxAmmo: 3,
      maxHealth: 3,
      repairs: 0
    };

    initArenaIslands();
    cannonballs = [];
    ammoCrates = [];
    hordePowerups = [];
    particles = [];
    floatingTexts = [];

    // Barcos aliados juntos en el centro
    activeShips = [];
    var connected = [];
    for (var i = 0; i < playersData.length; i++) {
      if (playersData[i].connected) connected.push(playersData[i]);
    }
    if (connected.length === 0) {
      connected = [playersData[0], playersData[1]];
    }

    var count = connected.length;
    for (var j = 0; j < count; j++) {
      var ang = (Math.PI * 2 / count) * j;
      var sh = new Ship(connected[j].slot, 960 + Math.cos(ang) * 160, 540 + Math.sin(ang) * 160, ang);
      activeShips.push(sh);
    }

    startHordeWave(currentWave);
  }

  function startHordeWave(wave) {
    waveEnemiesToSpawn = 2 + wave;
    waveSpawnTimer = 1.5;
    waveIntermissionTimer = 0;
    pirateShips = [];
    bossGalleon = null;

    // Revivir a todos los jugadores aliados caídos al completar con éxito una ronda
    if (wave > 1) {
      var revivedCount = 0;
      for (var pIdx = 0; pIdx < playersData.length; pIdx++) {
        if (!playersData[pIdx].connected) continue;
        var pSlot = playersData[pIdx].slot;
        var shipFound = null;
        for (var sIdx = 0; sIdx < activeShips.length; sIdx++) {
          if (activeShips[sIdx].slot === pSlot) {
            shipFound = activeShips[sIdx];
            break;
          }
        }
        if (!shipFound) {
          shipFound = new Ship(pSlot, 960 + (Math.random() - 0.5) * 200, 540 + (Math.random() - 0.5) * 200, 0);
          activeShips.push(shipFound);
          revivedCount++;
        } else if (!shipFound.isAlive) {
          shipFound.isAlive = true;
          shipFound.health = hordeUpgrades.maxHealth;
          shipFound.ammo = Math.max(3, hordeUpgrades.maxAmmo);
          shipFound.x = 960 + (Math.random() - 0.5) * 260;
          shipFound.y = 540 + (Math.random() - 0.5) * 260;
          shipFound.vx = 0;
          shipFound.vy = 0;
          shipFound.stunTimer = 0;
          shipFound.flashTimer = 0.5;
          revivedCount++;
        } else {
          shipFound.health = hordeUpgrades.maxHealth;
          if (shipFound.ammo < 3) shipFound.ammo = 3;
        }
      }
      if (revivedCount > 0) {
        addFloatingText("✨ ¡JUGADORES CAÍDOS REVIVIDOS! ✨", 960, 480, "#00e676", 42);
        Sound.playPowerup();
        sendTvAction("vibrate", null, [80, 50, 80]);
      }
    }

    if (wave % 10 === 0) {
      // Ronda de Jefe
      Sound.playBossAlert();
      triggerScreenShake(0.8, 14);
      bossGalleon = new BossGalleon(960, 150, wave);
      addFloatingText("☠️ ¡ALERTA: GALEÓN JEFE PIRATA! ☠️", 960, 420, "#ff1744", 48);
      // 2 piratas escoltas (dificultad equilibrada)
      waveEnemiesToSpawn = 2;
    } else {
      Sound.playWaveStart();
      addFloatingText("🌊 OLEADA " + wave + " 🌊", 960, 420, "#00e5ff", 50);
    }
  }

  function spawnPirateEnemy() {
    // Aparecen desde los bordes de la zona jugable
    var edge = Math.floor(Math.random() * 4);
    var px = 960;
    var py = 540;
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

    pirateShips.push(new PirateShip(px, py, currentWave));
  }

  function startNewMatch() {
    currentRound = 0;
    teamScores.blue = 0;
    teamScores.red = 0;
    for (var i = 0; i < playersData.length; i++) {
      playersData[i].score = 0;
    }
    startRoundByMode();
  }

  function startRoundByMode() {
    if (selectedMode === MODE_HORDE) {
      startHordeMode();
    } else {
      currentRound++;
      if (selectedMode === MODE_TEAMS) {
        startTeamsRound();
      } else {
        startBattleRound();
      }
    }
  }

  // Generador de código de sala
  function generateRoomCode() {
    var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var code = "";
    for (var i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // Conexión CloudNet
  function connectCloudNet() {
    currentRoomCode = generateRoomCode();
    var roomDisplay = document.getElementById("room-code-text") || document.getElementById("room-code-display");
    if (roomDisplay) roomDisplay.textContent = currentRoomCode;
    generateLobbyQR();

    var updateStatusUI = function(status, msg) {
      var stLabel = document.getElementById("cloud-status") || document.getElementById("server-status");
      if (stLabel) {
        if (status === "online" || status === "connected") {
          stLabel.className = "status-tag online";
          stLabel.textContent = "● CONECTADO A LA NUBE";
        } else if (status === "offline" || status === "error") {
          stLabel.className = "status-tag offline";
          stLabel.textContent = "○ " + (msg || "DESCONECTADO").toUpperCase();
        } else {
          stLabel.className = "status-tag connecting";
          stLabel.textContent = msg || "Conectando a la nube...";
        }
      }
    };

    if (window.CloudNet) {
      window.CloudNet.initHost(currentRoomCode, {
        onReady: function() {
          console.log("[TV] Host iniciado en sala:", currentRoomCode);
          var rd = document.getElementById("room-code-text") || document.getElementById("room-code-display");
          if (rd) rd.textContent = currentRoomCode;
          updateStatusUI("online");
          generateLobbyQR();
        },
        onStatus: function(status, msg) {
          updateStatusUI(status, msg);
        },
        onMessage: function(topic, msg) {
          handleIncomingMessage(msg);
        }
      });
    }
  }

  function handleIncomingMessage(msg) {
    if (!msg || !msg.type) return;

    if (msg.type === "join") {
      var uuid = msg.uuid;
      if (!uuid) return;

      var slot = -1;
      if (uuidToSlot[uuid] !== undefined) {
        slot = uuidToSlot[uuid];
      } else {
        for (var s = 0; s < 8; s++) {
          if (!playersData[s].uuid) {
            slot = s;
            uuidToSlot[uuid] = slot;
            playersData[slot].uuid = uuid;
            break;
          }
        }
      }

      if (slot === -1) {
        if (window.CloudNet) window.CloudNet.sendToPlayer(uuid, { type: "error", message: "Sala llena (8 capitanes)" });
        return;
      }

      playersData[slot].connected = true;
      if (msg.name && typeof msg.name === "string") {
        var jName = msg.name.trim().substring(0, 12);
        if (jName.length > 0) playersData[slot].customName = jName;
      }
      if (msg.team && (msg.team === "red" || msg.team === "blue")) {
        playersData[slot].team = msg.team;
      }

      if (window.CloudNet) {
        window.CloudNet.sendToPlayer(uuid, {
          type: "init",
          slot: slot,
          name: playersData[slot].name,
          customName: playersData[slot].customName,
          hull: playersData[slot].hull,
          sail: playersData[slot].sail,
          stripe: playersData[slot].stripe,
          symbol: playersData[slot].symbol,
          ready: playersData[slot].ready,
          team: playersData[slot].team,
          mode: selectedMode
        });
      }

      updateLobbyShips();
    } else if (msg.type === "ready") {
      for (var r = 0; r < playersData.length; r++) {
        if (playersData[r].uuid === msg.uuid) {
          playersData[r].ready = !!msg.ready;
          break;
        }
      }
      updateLobbyShips();
    } else if (msg.type === "set_name") {
      var sSlot = (typeof msg.slot === "number") ? msg.slot : -1;
      if (sSlot >= 0 && sSlot < playersData.length) {
        if (msg.name && typeof msg.name === "string") {
          var cleanName = msg.name.trim().substring(0, 12);
          if (cleanName.length > 0) {
            playersData[sSlot].customName = cleanName;
            for (var sn = 0; sn < activeShips.length; sn++) {
              if (activeShips[sn].slot === sSlot) {
                activeShips[sn].data.customName = cleanName;
                break;
              }
            }
          }
        }
      }
    } else if (msg.type === "set_team") {
      // Buscar slot por uuid primero, luego por msg.slot como fallback
      var tSlot = -1;
      if (msg.uuid) {
        for (var tu = 0; tu < playersData.length; tu++) {
          if (playersData[tu].uuid === msg.uuid) { tSlot = playersData[tu].slot; break; }
        }
      }
      if (tSlot < 0 && typeof msg.slot === "number") tSlot = msg.slot;
      if (tSlot >= 0 && tSlot < playersData.length) {
        var tm = (msg.team === "red") ? "red" : "blue";
        playersData[tSlot].team = tm;
        for (var st = 0; st < activeShips.length; st++) {
          if (activeShips[st].slot === tSlot) {
            activeShips[st].data.team = tm;
            break;
          }
        }
        updateLobbyShips();
        // Confirmar el equipo al controlador
        window.CloudNet.sendToPlayer(tSlot, { type: "team_confirmed", team: tm });
      }
    } else if (msg.type === "input") {
      var inSlot = -1;
      for (var p = 0; p < playersData.length; p++) {
        if (playersData[p].uuid === msg.uuid) {
          inSlot = playersData[p].slot;
          break;
        }
      }

      if (inSlot !== -1) {
        for (var sh = 0; sh < activeShips.length; sh++) {
          if (activeShips[sh].slot === inSlot) {
            activeShips[sh].turnInput = typeof msg.turn === "number" ? msg.turn : 0;
            activeShips[sh].thrustInput = !!msg.thrust;
            activeShips[sh].shootInput = !!msg.shoot;
            break;
          }
        }
      }
    } else if (msg.type === "host_action") {
      if (msg.action === "start") {
        if (currentState === STATE_LOBBY || currentState === STATE_PODIUM) {
          startNewMatch();
        } else {
          startRoundByMode();
        }
      } else if (msg.action === "set_mode") {
        if (typeof msg.mode === "number" && msg.mode >= 0 && msg.mode <= 2) {
          selectedMode = msg.mode;
          updateLobbyModeUI();
          broadcastCurrentMode();
        }
      } else if (msg.action === "toggle_mode") {
        selectedMode = (selectedMode + 1) % 3;
        updateLobbyModeUI();
        broadcastCurrentMode();
      }
    }
  }

  function broadcastCurrentMode() {
    if (window.CloudNet && window.CloudNet.isConnected()) {
      var names = ["TODOS VS TODOS", "BATALLA POR EQUIPOS", "HORDA PIRATA"];
      window.CloudNet.broadcast({
        type: "mode_change",
        mode: selectedMode,
        modeName: names[selectedMode] || "MODO DE JUEGO"
      });
    }
  }

  function generateLobbyQR() {
    var qrCanvas = document.getElementById("qr-canvas");
    if (qrCanvas && window.drawQRCodeToCanvas) {
      var href = window.location.href.split("?")[0].split("#")[0];
      var controllerUrl = href;
      if (controllerUrl.indexOf("/index.html") !== -1) {
        controllerUrl = controllerUrl.replace("/index.html", "/controller.html");
      } else if (controllerUrl.indexOf("/tv.html") !== -1) {
        controllerUrl = controllerUrl.replace("/tv.html", "/controller.html");
      } else if (controllerUrl.match(/\/tv\/?$/)) {
        controllerUrl = controllerUrl.replace(/\/tv\/?$/, "/controller.html");
      } else if (controllerUrl.indexOf("controller.html") === -1) {
        controllerUrl = controllerUrl.replace(/\/+$/, "") + "/controller.html";
      }
      controllerUrl += "?room=" + currentRoomCode;

      window.drawQRCodeToCanvas(qrCanvas, controllerUrl, 250);

      var urlLabel = document.getElementById("url-text");
      if (urlLabel) urlLabel.textContent = controllerUrl;
    }
  }

  function updateLobbyShips() {
    if (currentState !== STATE_LOBBY) return;
    for (var i = 0; i < playersData.length; i++) {
      var p = playersData[i];
      var found = false;
      for (var s = 0; s < activeShips.length; s++) {
        if (activeShips[s].slot === p.slot) {
          found = true;
          if (!p.connected) {
            activeShips.splice(s, 1);
          }
          break;
        }
      }
      if (!found && p.connected) {
        var ang = (Math.PI * 2 / 8) * p.slot;
        var sX = 960 + Math.cos(ang) * 230;
        var sY = 640 + Math.sin(ang) * 230;
        activeShips.push(new Ship(p.slot, sX, sY, ang + Math.PI));
      }
    }
  }

  // Bucle principal
  var lastTime = 0;
  var canvas = null;
  var ctx = null;
  var V_WIDTH = 1920;
  var V_HEIGHT = 1080;
  var scale = 1;
  var offsetX = 0;
  var offsetY = 0;

  function gameLoop(time) {
    if (!lastTime) lastTime = time;
    var dt = (time - lastTime) / 1000;
    if (dt > 0.1) dt = 0.1;
    lastTime = time;

    update(dt);
    render(dt);

    window.requestAnimationFrame(gameLoop);
  }

  function update(dt) {
    waveAnim += dt;
    if (shakeTimer > 0) {
      shakeTimer -= dt;
      if (shakeTimer < 0) shakeTimer = 0;
    }

    if (currentState === STATE_LOBBY) {
      for (var s = 0; s < activeShips.length; s++) {
        activeShips[s].update(dt);
      }
    } else if (currentState === STATE_ARENA) {
      if (selectedMode === MODE_HORDE) {
        updateHorde(dt);
      } else {
        updateBattle(dt);
      }
    } else if (currentState === STATE_PODIUM) {
      podiumAnimTimer += dt;
    }
  }

  function updateBattle(dt) {
    // Cuenta regresiva
    if (countdownTime > 0.5) {
      countdownTime -= dt;
      var step = Math.ceil(countdownTime - 0.5);
      if (step !== lastCountdownStep) {
        lastCountdownStep = step;
        if (step > 0 && step <= 3) Sound.playCountdown(false);
      }
      return;
    } else if (countdownTime > 0) {
      if (lastCountdownStep !== 0) {
        lastCountdownStep = 0;
        Sound.playCountdown(true);
      }
      countdownTime -= dt;
    }

    if (roundWinner) {
      roundOverTimer += dt;
      if (roundOverTimer >= 3.5) {
        concludeRoundCheck();
      }
      return;
    }

    roundTimer += dt;

    // Muerte súbita a los 45s
    if (roundTimer >= 45.0) {
      if (!suddenDeathActive) {
        suddenDeathActive = true;
        Sound.playHit();
      }
      var shrink = 24.0 * dt;
      currentBounds.x += shrink;
      currentBounds.y += shrink * 0.55;
      currentBounds.w = Math.max(420, currentBounds.w - shrink * 2.0);
      currentBounds.h = Math.max(280, currentBounds.h - shrink * 1.1);
    }

    // Actualizar barcos
    for (var s = 0; s < activeShips.length; s++) {
      var ship = activeShips[s];
      ship.update(dt);

      // Límite de la zona jugable (los marcadores laterales NO son jugables)
      if (suddenDeathActive) {
        if (ship.x < currentBounds.x || ship.x > currentBounds.x + currentBounds.w ||
            ship.y < currentBounds.y || ship.y > currentBounds.y + currentBounds.h) {
          ship.die();
        }
      } else {
        // En juego normal, rebotar contra los bordes de la zona jugable
        if (ship.x < arenaBounds.x + 22) {
          ship.x = arenaBounds.x + 22;
          ship.vx = Math.abs(ship.vx) * 0.45 + 50;
          ship.applyRam(1, 0, 90);
          spawnWaterFoam(ship.x, ship.y, 1, 0);
        } else if (ship.x > arenaBounds.x + arenaBounds.w - 22) {
          ship.x = arenaBounds.x + arenaBounds.w - 22;
          ship.vx = -Math.abs(ship.vx) * 0.45 - 50;
          ship.applyRam(-1, 0, 90);
          spawnWaterFoam(ship.x, ship.y, -1, 0);
        }
        if (ship.y < arenaBounds.y + 22) {
          ship.y = arenaBounds.y + 22;
          ship.vy = Math.abs(ship.vy) * 0.45 + 50;
          ship.applyRam(0, 1, 90);
          spawnWaterFoam(ship.x, ship.y, 0, 1);
        } else if (ship.y > arenaBounds.y + arenaBounds.h - 22) {
          ship.y = arenaBounds.y + arenaBounds.h - 22;
          ship.vy = -Math.abs(ship.vy) * 0.45 - 50;
          ship.applyRam(0, -1, 90);
          spawnWaterFoam(ship.x, ship.y, 0, -1);
        }
      }

      if (!ship.isAlive) continue;

      // Colisión con islas
      for (var i = 0; i < islands.length; i++) {
        var isl = islands[i];
        var dX = ship.x - isl.x;
        var dY = ship.y - isl.y;
        var minDist = isl.rad + 18;
        var distSq = dX * dX + dY * dY;
        if (distSq < minDist * minDist) {
          var dist = Math.sqrt(distSq);
          var nx = dX / (dist || 1);
          var ny = dY / (dist || 1);
          ship.x = isl.x + nx * minDist;
          ship.y = isl.y + ny * minDist;
          ship.vx = nx * 120;
          ship.vy = ny * 120;
          ship.applyRam(nx, ny, 140);
        }
      }

      // Colisión entre barcos con espolón metálico y daño de embestida
      for (var s2 = s + 1; s2 < activeShips.length; s2++) {
        var ship2 = activeShips[s2];
        if (!ship2.isAlive) continue;
        var cDx = ship2.x - ship.x;
        var cDy = ship2.y - ship.y;
        var cDistSq = cDx * cDx + cDy * cDy;
        if (cDistSq < 1521) {
          var cDist = Math.sqrt(cDistSq) || 1;
          var cNx = cDx / (cDist || 1);
          var cNy = cDy / (cDist || 1);

          var fwd1X = Math.cos(ship.rotation);
          var fwd1Y = Math.sin(ship.rotation);
          var spd1Fwd = ship.vx * fwd1X + ship.vy * fwd1Y;
          var dot1 = cNx * fwd1X + cNy * fwd1Y;

          var fwd2X = Math.cos(ship2.rotation);
          var fwd2Y = Math.sin(ship2.rotation);
          var spd2Fwd = ship2.vx * fwd2X + ship2.vy * fwd2Y;
          var dot2 = (-cNx) * fwd2X + (-cNy) * fwd2Y;

          var canDamageEachOther = (selectedMode !== MODE_TEAMS || ship.data.team !== ship2.data.team);

          // Barco 1 embiste a Barco 2 con la punta de metal (mitad de daño de una bala = 0.5)
          if (canDamageEachOther && (ship.isRamming || spd1Fwd > 130) && dot1 > 0.45 && ship.ramCooldown <= 0) {
            ship.ramCooldown = 0.65;
            ship2.applyHit(cNx, cNy, 360, 0.5);
            spawnMetalRamSparks(ship.x + fwd1X * 30, ship.y + fwd1Y * 30, -cNx, -cNy);
            addFloatingText("💥 -0.5", ship2.x, ship2.y - 25, "#ff3d00", 28);
            triggerScreenShake(0.2, 5);
            sendTvAction("vibrate", ship.slot, 100);
          } else if (ship.isRamming) {
            ship2.applyRam(cNx, cNy, 460);
          }

          // Barco 2 embiste a Barco 1 con la punta de metal
          if (canDamageEachOther && (ship2.isRamming || spd2Fwd > 130) && dot2 > 0.45 && ship2.ramCooldown <= 0) {
            ship2.ramCooldown = 0.65;
            ship.applyHit(-cNx, -cNy, 360, 0.5);
            spawnMetalRamSparks(ship2.x + fwd2X * 30, ship2.y + fwd2Y * 30, cNx, cNy);
            addFloatingText("💥 -0.5", ship.x, ship.y - 25, "#ff3d00", 28);
            triggerScreenShake(0.2, 5);
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
      for (var c = ammoCrates.length - 1; c >= 0; c--) {
        var crate = ammoCrates[c];
        var acDx = crate.x - ship.x;
        var acDy = crate.y - ship.y;
        if (acDx * acDx + acDy * acDy < 784) {
          if (ship.collectAmmo()) {
            ammoCrates[c] = ammoCrates[ammoCrates.length - 1];
            ammoCrates.pop();
          }
        }
      }
    }

    // Actualizar balas de cañón
    for (var b = cannonballs.length - 1; b >= 0; b--) {
      var ball = cannonballs[b];
      ball.update(dt);
      if (ball.isDead) {
        cannonballs[b] = cannonballs[cannonballs.length - 1];
        cannonballs.pop();
        continue;
      }

      // Colisión de proyectil con límites de la zona jugable (no cruzan hacia el HUD)
      if (ball.x <= arenaBounds.x || ball.x >= arenaBounds.x + arenaBounds.w ||
          ball.y <= arenaBounds.y || ball.y >= arenaBounds.y + arenaBounds.h) {
        ball.isDead = true;
        Sound.playIslandThud();
        spawnIslandImpactParticles(ball.x, ball.y);
        cannonballs[b] = cannonballs[cannonballs.length - 1];
        cannonballs.pop();
        continue;
      }

      // Colisión de proyectil con islas (¡Jamás atraviesan las islas!)
      var hitIsland = false;
      for (var ii = 0; ii < islands.length; ii++) {
        var isObj = islands[ii];
        var idX = ball.x - isObj.x;
        var idY = ball.y - isObj.y;
        var hitDist = isObj.rad + 5;
        if (idX * idX + idY * idY <= hitDist * hitDist) {
          hitIsland = true;
          break;
        }
      }
      if (hitIsland) {
        ball.isDead = true;
        Sound.playIslandThud();
        spawnIslandImpactParticles(ball.x, ball.y);
        cannonballs[b] = cannonballs[cannonballs.length - 1];
        cannonballs.pop();
        continue;
      }

      // Impacto en barcos
      for (var sh = 0; sh < activeShips.length; sh++) {
        var targetShip = activeShips[sh];
        if (!targetShip.isAlive || targetShip.slot === ball.shooterSlot) continue;

        // En Modo Equipos: desactivar daño entre compañeros del mismo equipo
        if (selectedMode === MODE_TEAMS && ball.shooterTeam && ball.shooterTeam === targetShip.data.team) {
          continue;
        }

        var bDx = targetShip.x - ball.x;
        var bDy = targetShip.y - ball.y;
        if (bDx * bDx + bDy * bDy < 484) {
          targetShip.applyHit(ball.dx, ball.dy, 550, ball.damage);
          ball.isDead = true;
          cannonballs[b] = cannonballs[cannonballs.length - 1];
          cannonballs.pop();
          break;
        }
      }
    }

    // Cajas
    for (var cr = 0; cr < ammoCrates.length; cr++) {
      ammoCrates[cr].update(dt);
    }
    if (Math.random() < (0.35 * dt) && ammoCrates.length < 5) {
      ammoCrates.push(new AmmoCrate(
        currentBounds.x + 80 + Math.random() * (currentBounds.w - 160),
        currentBounds.y + 80 + Math.random() * (currentBounds.h - 160)
      ));
    }

    checkRoundSurvivor();
  }

  function checkRoundSurvivor() {
    if (roundWinner) return;

    if (selectedMode === MODE_TEAMS) {
      var blueAlive = 0;
      var redAlive = 0;
      for (var i = 0; i < activeShips.length; i++) {
        if (activeShips[i].isAlive) {
          if (activeShips[i].data.team === "red") redAlive++;
          else blueAlive++;
        }
      }

      if (blueAlive === 0 || redAlive === 0) {
        if (blueAlive > 0) {
          teamScores.blue++;
          roundWinner = { name: "¡EQUIPO AZUL!", hull: "#42a5f5" };
          Sound.playFanfare();
        } else if (redAlive > 0) {
          teamScores.red++;
          roundWinner = { name: "¡EQUIPO ROJO!", hull: "#ef5350" };
          Sound.playFanfare();
        } else {
          roundWinner = { name: "¡EMPATE!", hull: "#ffffff" };
        }
      }
    } else {
      // Modo Todos contra Todos
      var alive = [];
      for (var j = 0; j < activeShips.length; j++) {
        if (activeShips[j].isAlive) alive.push(activeShips[j]);
      }

      if (alive.length <= 1) {
        if (alive.length === 1) {
          roundWinner = alive[0].data;
          playersData[alive[0].slot].score++;
          Sound.playFanfare();
        } else {
          roundWinner = { name: "¡EMPATE!", hull: "#ffffff" };
        }
      }
    }
  }

  function updateHorde(dt) {
    if (countdownTime > 0.5) {
      countdownTime -= dt;
      var step = Math.ceil(countdownTime - 0.5);
      if (step !== lastCountdownStep) {
        lastCountdownStep = step;
        if (step > 0 && step <= 3) Sound.playCountdown(false);
      }
      return;
    } else if (countdownTime > 0) {
      if (lastCountdownStep !== 0) {
        lastCountdownStep = 0;
        Sound.playCountdown(true);
      }
      countdownTime -= dt;
    }

    // Spawning de oleada
    if (waveEnemiesToSpawn > 0) {
      waveSpawnTimer -= dt;
      if (waveSpawnTimer <= 0) {
        waveSpawnTimer = Math.max(1.2, 3.0 - currentWave * 0.08);
        spawnPirateEnemy();
        waveEnemiesToSpawn--;
      }
    }

    // Actualizar barcos aliados
    var anyAllyAlive = false;
    for (var s = 0; s < activeShips.length; s++) {
      var ship = activeShips[s];
      ship.update(dt);
      if (ship.isAlive) anyAllyAlive = true;

      // Limitar barcos aliados a la zona jugable (los marcadores laterales NO son jugables)
      if (ship.isAlive) {
        if (ship.x < arenaBounds.x + 22) {
          ship.x = arenaBounds.x + 22;
          ship.vx = Math.abs(ship.vx) * 0.45 + 50;
          ship.applyRam(1, 0, 90);
          spawnWaterFoam(ship.x, ship.y, 1, 0);
        } else if (ship.x > arenaBounds.x + arenaBounds.w - 22) {
          ship.x = arenaBounds.x + arenaBounds.w - 22;
          ship.vx = -Math.abs(ship.vx) * 0.45 - 50;
          ship.applyRam(-1, 0, 90);
          spawnWaterFoam(ship.x, ship.y, -1, 0);
        }
        if (ship.y < arenaBounds.y + 22) {
          ship.y = arenaBounds.y + 22;
          ship.vy = Math.abs(ship.vy) * 0.45 + 50;
          ship.applyRam(0, 1, 90);
          spawnWaterFoam(ship.x, ship.y, 0, 1);
        } else if (ship.y > arenaBounds.y + arenaBounds.h - 22) {
          ship.y = arenaBounds.y + arenaBounds.h - 22;
          ship.vy = -Math.abs(ship.vy) * 0.45 - 50;
          ship.applyRam(0, -1, 90);
          spawnWaterFoam(ship.x, ship.y, 0, -1);
        }
      }

      // Colisiones con islas
      if (ship.isAlive) {
        for (var i = 0; i < islands.length; i++) {
          var isl = islands[i];
          var dX = ship.x - isl.x;
          var dY = ship.y - isl.y;
          var minDist = isl.rad + 18;
          var distSq = dX * dX + dY * dY;
          if (distSq < minDist * minDist) {
            var dist = Math.sqrt(distSq);
            var nx = dX / (dist || 1);
            var ny = dY / (dist || 1);
            ship.x = isl.x + nx * minDist;
            ship.y = isl.y + ny * minDist;
            ship.vx = nx * 120;
            ship.vy = ny * 120;
            ship.applyRam(nx, ny, 140);
          }
        }

        // Recogida de cajas de munición
        for (var c = ammoCrates.length - 1; c >= 0; c--) {
          var crate = ammoCrates[c];
          var acDx = crate.x - ship.x;
          var acDy = crate.y - ship.y;
          if (acDx * acDx + acDy * acDy < 784) {
            if (ship.collectAmmo()) {
              ammoCrates[c] = ammoCrates[ammoCrates.length - 1];
              ammoCrates.pop();
            }
          }
        }

        // Recogida de Mejoras Globales (Power-ups)
        for (var p = hordePowerups.length - 1; p >= 0; p--) {
          var pUp = hordePowerups[p];
          var puDx = pUp.x - ship.x;
          var puDy = pUp.y - ship.y;
          if (puDx * puDx + puDy * puDy < 900) {
            applyGlobalPowerup(pUp.type, ship);
            hordePowerups[p] = hordePowerups[hordePowerups.length - 1];
            hordePowerups.pop();
          }
        }
      }
    }

    // Actualizar barcos piratas
    for (var pr = pirateShips.length - 1; pr >= 0; pr--) {
      var pirate = pirateShips[pr];
      pirate.update(dt);
      if (!pirate.isAlive) {
        pirateShips[pr] = pirateShips[pirateShips.length - 1];
        pirateShips.pop();
      }
    }

    // Actualizar Jefe
    if (bossGalleon) {
      bossGalleon.update(dt);
      if (!bossGalleon.isAlive) {
        bossGalleon = null;
      }
    }

    // Colisiones físicas y embestida con punta metálica entre jugadores y piratas/jefe
    for (var ash = 0; ash < activeShips.length; ash++) {
      var pShip = activeShips[ash];
      if (!pShip.isAlive) continue;
      var pfwdX = Math.cos(pShip.rotation);
      var pfwdY = Math.sin(pShip.rotation);
      var pSpdFwd = pShip.vx * pfwdX + pShip.vy * pfwdY;

      // Colisión entre barcos aliados (fuego amigo estrictamente desactivado)
      for (var ash2 = ash + 1; ash2 < activeShips.length; ash2++) {
        var pShip2 = activeShips[ash2];
        if (!pShip2.isAlive) continue;
        var asDx = pShip2.x - pShip.x;
        var asDy = pShip2.y - pShip.y;
        var asDistSq = asDx * asDx + asDy * asDy;
        if (asDistSq < 1444) {
          var asDist = Math.sqrt(asDistSq) || 1;
          var asNx = asDx / asDist;
          var asNy = asDy / asDist;
          pShip.vx -= asNx * 100;
          pShip.vy -= asNy * 100;
          pShip2.vx += asNx * 100;
          pShip2.vy += asNy * 100;
        }
      }

      // Embestida contra Barcos Piratas (causa 0.5 de daño a los piratas)
      for (var psh = 0; psh < pirateShips.length; psh++) {
        var pirShip = pirateShips[psh];
        if (!pirShip.isAlive) continue;
        var cpx = pirShip.x - pShip.x;
        var cpy = pirShip.y - pShip.y;
        var cpDistSq = cpx * cpx + cpy * cpy;
        if (cpDistSq < 1521) {
          var cpDist = Math.sqrt(cpDistSq) || 1;
          var cpnX = cpx / cpDist;
          var cpnY = cpy / cpDist;
          var cpDot = cpnX * pfwdX + cpnY * pfwdY;

          if ((pShip.isRamming || pSpdFwd > 130) && cpDot > 0.45 && pShip.ramCooldown <= 0) {
            pShip.ramCooldown = 0.65;
            pirShip.applyHit(cpnX, cpnY, 380, 0.5);
            spawnMetalRamSparks(pShip.x + pfwdX * 30, pShip.y + pfwdY * 30, -cpnX, -cpnY);
            addFloatingText("💥 -0.5", pirShip.x, pirShip.y - 25, "#ff3d00", 28);
            triggerScreenShake(0.22, 6);
            sendTvAction("vibrate", pShip.slot, 120);
          }

          pShip.vx -= cpnX * 110;
          pShip.vy -= cpnY * 110;
          pirShip.vx += cpnX * 110;
          pirShip.vy += cpnY * 110;
        }
      }

      // Embestida contra el Galeón Jefe (causa 0.5 de daño al jefe)
      if (bossGalleon && bossGalleon.isAlive) {
        var bgx = bossGalleon.x - pShip.x;
        var bgy = bossGalleon.y - pShip.y;
        var bgDistSq = bgx * bgx + bgy * bgy;
        if (bgDistSq < 3600) {
          var bgDist = Math.sqrt(bgDistSq) || 1;
          var bgnX = bgx / bgDist;
          var bgnY = bgy / bgDist;
          var bgDot = bgnX * pfwdX + bgnY * pfwdY;

          if ((pShip.isRamming || pSpdFwd > 130) && bgDot > 0.45 && pShip.ramCooldown <= 0) {
            pShip.ramCooldown = 0.65;
            bossGalleon.applyHit(bgnX, bgnY, 80, 0.5);
            spawnMetalRamSparks(pShip.x + pfwdX * 30, pShip.y + pfwdY * 30, -bgnX, -bgnY);
            addFloatingText("💥 -0.5", bossGalleon.x, bossGalleon.y - 35, "#ffd700", 32);
            triggerScreenShake(0.26, 7);
            sendTvAction("vibrate", pShip.slot, 130);
          }

          pShip.vx -= bgnX * 200;
          pShip.vy -= bgnY * 200;
          bossGalleon.vx += bgnX * 30;
          bossGalleon.vy += bgnY * 30;
        }
      }
    }

    // Actualizar proyectiles
    for (var b = cannonballs.length - 1; b >= 0; b--) {
      var ball = cannonballs[b];
      ball.update(dt);
      if (ball.isDead) {
        cannonballs[b] = cannonballs[cannonballs.length - 1];
        cannonballs.pop();
        continue;
      }

      // Colisión con límites de la zona jugable en horda
      if (ball.x <= arenaBounds.x || ball.x >= arenaBounds.x + arenaBounds.w ||
          ball.y <= arenaBounds.y || ball.y >= arenaBounds.y + arenaBounds.h) {
        ball.isDead = true;
        Sound.playIslandThud();
        spawnIslandImpactParticles(ball.x, ball.y);
        cannonballs[b] = cannonballs[cannonballs.length - 1];
        cannonballs.pop();
        continue;
      }

      // Colisión con islas
      var hitIsl = false;
      for (var ii = 0; ii < islands.length; ii++) {
        var isObj = islands[ii];
        var idX = ball.x - isObj.x;
        var idY = ball.y - isObj.y;
        var hDist = isObj.rad + 5;
        if (idX * idX + idY * idY <= hDist * hDist) {
          hitIsl = true;
          break;
        }
      }
      if (hitIsl) {
        ball.isDead = true;
        Sound.playIslandThud();
        spawnIslandImpactParticles(ball.x, ball.y);
        cannonballs[b] = cannonballs[cannonballs.length - 1];
        cannonballs.pop();
        continue;
      }

      if (ball.isPirate) {
        // Bala pirata impacta a jugadores aliados
        for (var ash = 0; ash < activeShips.length; ash++) {
          var ally = activeShips[ash];
          if (!ally.isAlive) continue;
          var aDx = ally.x - ball.x;
          var aDy = ally.y - ball.y;
          if (aDx * aDx + aDy * aDy < 484) {
            ally.applyHit(ball.dx, ball.dy, 520, ball.damage);
            ball.isDead = true;
            cannonballs[b] = cannonballs[cannonballs.length - 1];
            cannonballs.pop();
            break;
          }
        }
      } else {
        // Bala aliada: FUEGO AMIGO DESACTIVADO ENTRE JUGADORES
        // Impacta a piratas o al jefe
        var hitEnemy = false;
        for (var psh = 0; psh < pirateShips.length; psh++) {
          var pir = pirateShips[psh];
          if (!pir.isAlive) continue;
          var pDx = pir.x - ball.x;
          var pDy = pir.y - ball.y;
          if (pDx * pDx + pDy * pDy < 520) {
            pir.applyHit(ball.dx, ball.dy, 460, ball.damage);
            ball.isDead = true;
            hitEnemy = true;
            cannonballs[b] = cannonballs[cannonballs.length - 1];
            cannonballs.pop();
            break;
          }
        }

        if (!hitEnemy && bossGalleon && bossGalleon.isAlive) {
          var bgDx = bossGalleon.x - ball.x;
          var bgDy = bossGalleon.y - ball.y;
          if (bgDx * bgDx + bgDy * bgDy < 2300) {
            bossGalleon.applyHit(ball.dx, ball.dy, 120, ball.damage);
            ball.isDead = true;
            cannonballs[b] = cannonballs[cannonballs.length - 1];
            cannonballs.pop();
          }
        }
      }
    }

    // Cajas y Mejoras
    for (var cr = 0; cr < ammoCrates.length; cr++) ammoCrates[cr].update(dt);
    for (var hp = 0; hp < hordePowerups.length; hp++) hordePowerups[hp].update(dt);

    // Spawning periódico de munición
    if (Math.random() < (0.55 * dt) && ammoCrates.length < 6) {
      ammoCrates.push(new AmmoCrate(
        currentBounds.x + 80 + Math.random() * (currentBounds.w - 160),
        currentBounds.y + 80 + Math.random() * (currentBounds.h - 160)
      ));
    }

    // Fin de oleada: todos los piratas y jefe muertos (Éxito de ronda)
    if (waveEnemiesToSpawn === 0 && pirateShips.length === 0 && (!bossGalleon || !bossGalleon.isAlive)) {
      if (waveIntermissionTimer === 0) {
        addFloatingText("🏆 ¡OLEADA " + currentWave + " COMPLETADA! 🏆", 960, 330, "#00e676", 46);
        addFloatingText("💚 ¡SALUD AL MÁXIMO RESTAURADA!", 960, 390, "#76ff03", 34);
        Sound.playPowerup();

        // Recuperar la vida al máximo para todos los barcos aliados y revivir a los caídos
        for (var hs = 0; hs < activeShips.length; hs++) {
          var aShip = activeShips[hs];
          aShip.health = aShip.maxHealth;
          aShip.isAlive = true;
          aShip.flashTimer = 0.4;
          if (aShip.ammo < 3) aShip.ammo = 3;
          sendTvAction("vibrate", aShip.slot, [90, 60, 90]);
        }
      }
      waveIntermissionTimer += dt;
      if (waveIntermissionTimer >= 4.5) {
        currentWave++;
        startHordeWave(currentWave);
      }
    }

    // Comprobar derrota del equipo
    if (!anyAllyAlive) {
      roundWinner = { name: "¡LA FLOTA HA CAÍDO!", hull: "#ff1744" };
      roundOverTimer += dt;
      if (roundOverTimer >= 4.0) {
        openPodiumScreen();
      }
    }
  }

  function concludeRoundCheck() {
    if (currentRound >= TOTAL_ROUNDS) {
      openPodiumScreen();
      return;
    }
    startRoundByMode();
  }

  function openPodiumScreen() {
    currentState = STATE_PODIUM;
    podiumAnimTimer = 0;
    Sound.playFanfare();
    spawnConfetti(90);
    sendTvAction("state_change", null, "podium");
  }

  // RENDERIZADO
  function render(dt) {
    ctx.save();
    ctx.fillStyle = "#05111c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Centrado de resolución virtual 1920x1080
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Screen Shake
    if (shakeTimer > 0) {
      var sX = (Math.random() - 0.5) * shakeIntensity;
      var sY = (Math.random() - 0.5) * shakeIntensity;
      ctx.translate(sX, sY);
    }

    if (currentState === STATE_LOBBY) {
      renderLobby();
    } else if (currentState === STATE_ARENA) {
      renderArena(dt);
    } else if (currentState === STATE_PODIUM) {
      renderPodium();
    }

    ctx.restore();
  }

  function renderLobby() {
    // Fondo del lobby
    var grad = ctx.createLinearGradient(0, 0, 0, V_HEIGHT);
    grad.addColorStop(0, "#0b1e33");
    grad.addColorStop(1, "#071322");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);

    // Olas suaves
    ctx.strokeStyle = "rgba(0, 229, 255, 0.12)";
    ctx.lineWidth = 1.5;
    for (var wy = 50; wy < V_HEIGHT; wy += 90) {
      ctx.beginPath();
      for (var wx = 0; wx <= V_WIDTH; wx += 40) {
        var offY = Math.sin((wx * 0.008) + (waveAnim * 1.5) + wy) * 8;
        if (wx === 0) ctx.moveTo(wx, wy + offY);
        else ctx.lineTo(wx, wy + offY);
      }
      ctx.stroke();
    }

    // Barcos conectados
    for (var s = 0; s < activeShips.length; s++) {
      activeShips[s].draw(ctx);
    }

    renderParticles(0.016);
    setLobbyUIVisible(true);
  }

  function renderArena(dt) {
    setLobbyUIVisible(false);

    // Fondo del océano
    var grad = ctx.createLinearGradient(0, 0, 0, V_HEIGHT);
    grad.addColorStop(0, "#0e345a");
    grad.addColorStop(1, "#092038");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);

    // Olas activas
    ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
    ctx.lineWidth = 1.8;
    for (var wy = 60; wy < V_HEIGHT; wy += 80) {
      ctx.beginPath();
      for (var wx = 0; wx <= V_WIDTH; wx += 35) {
        var offY = Math.sin((wx * 0.01) + (waveAnim * 2.2) + wy) * 7;
        if (wx === 0) ctx.moveTo(wx, wy + offY);
        else ctx.lineTo(wx, wy + offY);
      }
      ctx.stroke();
    }

    // Islas
    for (var i = 0; i < islands.length; i++) {
      renderHexIsland(islands[i].x, islands[i].y, islands[i].rad);
    }

    // Cajas de munición y Mejoras de Horda
    for (var c = 0; c < ammoCrates.length; c++) ammoCrates[c].draw(ctx);
    for (var hp = 0; hp < hordePowerups.length; hp++) hordePowerups[hp].draw(ctx);

    // Proyectiles y partículas
    for (var b = 0; b < cannonballs.length; b++) cannonballs[b].draw(ctx);
    renderParticles(dt);

    // Barcos aliados, piratas y Jefe
    for (var s = 0; s < activeShips.length; s++) activeShips[s].draw(ctx);
    for (var pr = 0; pr < pirateShips.length; pr++) pirateShips[pr].draw(ctx);
    if (bossGalleon) bossGalleon.draw(ctx);

    // Delimitación visual de la zona jugable
    ctx.save();
    ctx.strokeStyle = "rgba(0, 229, 255, 0.35)";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(arenaBounds.x, arenaBounds.y, arenaBounds.w, arenaBounds.h);

    // Bordes letales en modo Batalla durante Muerte Súbita
    if (selectedMode !== MODE_HORDE && suddenDeathActive) {
      var pulse = 0.65 + 0.35 * Math.sin(waveAnim * 4.0);
      ctx.strokeStyle = "rgba(255, 30, 30, " + pulse + ")";
      ctx.lineWidth = 6;
      ctx.strokeRect(currentBounds.x, currentBounds.y, currentBounds.w, currentBounds.h);
    }
    ctx.restore();

    // Textos flotantes
    renderFloatingTexts(dt);

    // HUD lateral rediseñado (100% altura de pantalla)
    renderHUD();
  }

  function renderHexIsland(cx, cy, radius) {
    // Sombra
    drawHexagon(ctx, cx, cy + 6, radius + 4, "rgba(4, 18, 30, 0.45)", null);
    // Arena exterior
    drawHexagon(ctx, cx, cy, radius, "#E6C280", "#C59B53", 4);
    // Césped interior
    drawHexagon(ctx, cx, cy, radius * 0.72, "#43A047", "#2E7D32", 3);
    // Rocas centrales
    drawHexagon(ctx, cx, cy, radius * 0.34, "#78909C", "#455A64", 2);
  }

  // Rediseño HUD Lateral: Franjas laterales recortadas NO jugables
  function renderHUD() {
    ctx.save();

    var panelW = 270;
    var leftPanelX = 0;
    var rightPanelX = 1650;
    var cardX_L = 15;
    var cardX_R = 1665;
    var cardW = 240;
    var cardH = 86;

    // 1. Fondos sólidos y bordes divisores de las franjas laterales
    // Panel Izquierdo
    var leftGrad = ctx.createLinearGradient(0, 0, panelW, 0);
    leftGrad.addColorStop(0, "#05111c");
    leftGrad.addColorStop(1, "#0a1d30");
    ctx.fillStyle = leftGrad;
    ctx.fillRect(leftPanelX, 0, panelW, V_HEIGHT);

    // Borde divisor derecho del panel izquierdo (frontera con el mar)
    ctx.strokeStyle = "rgba(0, 229, 255, 0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(panelW, 0);
    ctx.lineTo(panelW, V_HEIGHT);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 215, 0, 0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(panelW - 2, 0);
    ctx.lineTo(panelW - 2, V_HEIGHT);
    ctx.stroke();

    // Panel Derecho
    var rightGrad = ctx.createLinearGradient(rightPanelX, 0, V_WIDTH, 0);
    rightGrad.addColorStop(0, "#0a1d30");
    rightGrad.addColorStop(1, "#05111c");
    ctx.fillStyle = rightGrad;
    ctx.fillRect(rightPanelX, 0, panelW, V_HEIGHT);

    // Borde divisor izquierdo del panel derecho (frontera con el mar)
    ctx.strokeStyle = "rgba(0, 229, 255, 0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(rightPanelX, 0);
    ctx.lineTo(rightPanelX, V_HEIGHT);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 215, 0, 0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rightPanelX + 2, 0);
    ctx.lineTo(rightPanelX + 2, V_HEIGHT);
    ctx.stroke();

    // 2. Obtener ÚNICAMENTE los jugadores que están en partida
    var inMatchPlayers = [];
    for (var s = 0; s < activeShips.length; s++) {
      inMatchPlayers.push(activeShips[s].data);
    }

    if (selectedMode === MODE_TEAMS) {
      // === MODO BATALLA POR EQUIPOS ===
      // Cabecera Equipo Azul
      ctx.fillStyle = "rgba(13, 71, 161, 0.92)";
      ctx.fillRect(cardX_L, 20, cardW, 48);
      ctx.strokeStyle = "#42a5f5";
      ctx.lineWidth = 2;
      ctx.strokeRect(cardX_L, 20, cardW, 48);
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.fillText("🔵 EQUIPO AZUL", cardX_L + cardW / 2, 42);
      ctx.font = "bold 13px sans-serif";
      ctx.fillStyle = "#90caf9";
      ctx.fillText(teamScores.blue + " PUNTOS", cardX_L + cardW / 2, 60);

      // Tarjetas jugadores azules en partida
      var blueCount = 0;
      for (var i = 0; i < inMatchPlayers.length; i++) {
        if (inMatchPlayers[i].team === "blue") {
          drawPlayerHUDCard(cardX_L, 80 + blueCount * 96, cardW, cardH, inMatchPlayers[i]);
          blueCount++;
        }
      }
      if (blueCount === 0) {
        ctx.font = "italic 13px sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "#78909c";
        ctx.fillText("Sin jugadores", cardX_L + cardW / 2, 120);
      }

      // Cabecera Equipo Rojo
      ctx.fillStyle = "rgba(183, 28, 28, 0.92)";
      ctx.fillRect(cardX_R, 20, cardW, 48);
      ctx.strokeStyle = "#ef5350";
      ctx.lineWidth = 2;
      ctx.strokeRect(cardX_R, 20, cardW, 48);
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.fillText("🔴 EQUIPO ROJO", cardX_R + cardW / 2, 42);
      ctx.font = "bold 13px sans-serif";
      ctx.fillStyle = "#ffab91";
      ctx.fillText(teamScores.red + " PUNTOS", cardX_R + cardW / 2, 60);

      // Tarjetas jugadores rojos en partida
      var redCount = 0;
      for (var j = 0; j < inMatchPlayers.length; j++) {
        if (inMatchPlayers[j].team === "red") {
          drawPlayerHUDCard(cardX_R, 80 + redCount * 96, cardW, cardH, inMatchPlayers[j]);
          redCount++;
        }
      }
      if (redCount === 0) {
        ctx.font = "italic 13px sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "#78909c";
        ctx.fillText("Sin jugadores", cardX_R + cardW / 2, 120);
      }

    } else if (selectedMode === MODE_HORDE) {
      // === MODO HORDA PIRATA (ZOMBIES) ===
      // Cabecera Flota Aliada
      ctx.fillStyle = "rgba(10, 28, 44, 0.92)";
      ctx.fillRect(cardX_L, 20, cardW, 48);
      ctx.strokeStyle = "#00e5ff";
      ctx.lineWidth = 2;
      ctx.strokeRect(cardX_L, 20, cardW, 48);
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#00e5ff";
      ctx.fillText("⚓ FLOTA ALIADA", cardX_L + cardW / 2, 42);
      ctx.font = "bold 13px sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.fillText("OLEADA " + currentWave, cardX_L + cardW / 2, 60);

      // Tarjetas de aliados en partida
      for (var a = 0; a < inMatchPlayers.length; a++) {
        drawPlayerHUDCard(cardX_L, 80 + a * 96, cardW, cardH, inMatchPlayers[a]);
      }

      // Panel de Mejoras Globales (Pack-a-Punch) en panel derecho
      ctx.fillStyle = "rgba(10, 28, 44, 0.95)";
      ctx.fillRect(cardX_R, 20, cardW, 305);
      ctx.strokeStyle = "#ffd700";
      ctx.lineWidth = 2;
      ctx.strokeRect(cardX_R, 20, cardW, 305);

      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffd700";
      ctx.fillText("⭐ MEJORAS EQUIPO", cardX_R + cardW / 2, 48);

      ctx.font = "14px sans-serif";
      ctx.textAlign = "left";
      var upY = 82;

      ctx.fillStyle = "#ff4081";
      ctx.fillText("💥 Armas: Nivel " + hordeUpgrades.weaponLevel, cardX_R + 16, upY);
      ctx.fillStyle = "#bbbbbb";
      ctx.font = "12px sans-serif";
      var wTitle = (hordeUpgrades.weaponLevel === 1) ? "Disparo simple" : (hordeUpgrades.weaponLevel === 2 ? "Doble cañón" : "Disparo triple");
      ctx.fillText(wTitle, cardX_R + 34, upY + 18);

      ctx.font = "14px sans-serif";
      ctx.fillStyle = "#29b6f6";
      ctx.fillText("📦 Munición: Máx " + hordeUpgrades.maxAmmo, cardX_R + 16, upY + 52);

      ctx.fillStyle = "#ffd700";
      ctx.fillText("🛡️ Casco: " + hordeUpgrades.maxHealth + " Vidas", cardX_R + 16, upY + 90);

      ctx.fillStyle = "#00e676";
      ctx.fillText("💚 Revivir Usados: " + hordeUpgrades.repairs, cardX_R + 16, upY + 128);

      // Contador de piratas restantes
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 15px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("☠️ Piratas: " + (pirateShips.length + waveEnemiesToSpawn), cardX_R + cardW / 2, upY + 185);

    } else {
      // === MODO TODOS CONTRA TODOS (BATTLE) ===
      // Cabecera Panel Izquierdo
      ctx.fillStyle = "rgba(10, 28, 44, 0.92)";
      ctx.fillRect(cardX_L, 20, cardW, 48);
      ctx.strokeStyle = "#ffd700";
      ctx.lineWidth = 2;
      ctx.strokeRect(cardX_L, 20, cardW, 48);
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffd700";
      ctx.fillText("⚔️ CAPITANES", cardX_L + cardW / 2, 42);
      ctx.font = "bold 13px sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.fillText("RONDA " + Math.min(currentRound, TOTAL_ROUNDS) + " / " + TOTAL_ROUNDS, cardX_L + cardW / 2, 60);

      if (inMatchPlayers.length <= 1) {
        if (inMatchPlayers.length === 1) {
          drawPlayerHUDCard(cardX_L, 80, cardW, cardH, inMatchPlayers[0]);
        }
        ctx.fillStyle = "rgba(10, 28, 44, 0.92)";
        ctx.fillRect(cardX_R, 20, cardW, 48);
        ctx.strokeStyle = "#00e5ff";
        ctx.lineWidth = 2;
        ctx.strokeRect(cardX_R, 20, cardW, 48);
        ctx.font = "bold 16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "#00e5ff";
        ctx.fillText("🏆 TORNEO", cardX_R + cardW / 2, 42);
        ctx.font = "bold 13px sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.fillText("10 RONDAS", cardX_R + cardW / 2, 60);
      } else if (inMatchPlayers.length === 2) {
        // Exactamente 2 jugadores: Duelo 1 vs 1 perfecto
        drawPlayerHUDCard(cardX_L, 80, cardW, cardH, inMatchPlayers[0]);

        ctx.fillStyle = "rgba(10, 28, 44, 0.92)";
        ctx.fillRect(cardX_R, 20, cardW, 48);
        ctx.strokeStyle = "#ffd700";
        ctx.lineWidth = 2;
        ctx.strokeRect(cardX_R, 20, cardW, 48);
        ctx.font = "bold 16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "#ffd700";
        ctx.fillText("⚔️ RIVAL", cardX_R + cardW / 2, 42);
        ctx.font = "bold 13px sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.fillText("RONDA " + Math.min(currentRound, TOTAL_ROUNDS) + " / " + TOTAL_ROUNDS, cardX_R + cardW / 2, 60);

        drawPlayerHUDCard(cardX_R, 80, cardW, cardH, inMatchPlayers[1]);
      } else {
        // 3 o más jugadores: dividir equitativamente
        var half = Math.ceil(inMatchPlayers.length / 2);
        for (var p1 = 0; p1 < half; p1++) {
          drawPlayerHUDCard(cardX_L, 80 + p1 * 96, cardW, cardH, inMatchPlayers[p1]);
        }

        ctx.fillStyle = "rgba(10, 28, 44, 0.92)";
        ctx.fillRect(cardX_R, 20, cardW, 48);
        ctx.strokeStyle = "#ffd700";
        ctx.lineWidth = 2;
        ctx.strokeRect(cardX_R, 20, cardW, 48);
        ctx.font = "bold 16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "#ffd700";
        ctx.fillText("⚔️ CAPITANES", cardX_R + cardW / 2, 42);
        ctx.font = "bold 13px sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.fillText("RONDA " + Math.min(currentRound, TOTAL_ROUNDS) + " / " + TOTAL_ROUNDS, cardX_R + cardW / 2, 60);

        for (var p2 = half; p2 < inMatchPlayers.length; p2++) {
          drawPlayerHUDCard(cardX_R, 80 + (p2 - half) * 96, cardW, cardH, inMatchPlayers[p2]);
        }
      }
    }

    // === CENTRO SUPERIOR: Ronda / Oleada y Barra del Jefe ===
    if (bossGalleon && bossGalleon.isAlive) {
      // Barra gigante de vida del Jefe Final
      var barX = 560;
      var barY = 25;
      var barW = 800;
      var barH = 34;
      var hpPct = Math.max(0, Math.min(1, bossGalleon.health / bossGalleon.maxHealth));

      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.strokeStyle = "#ffd700";
      ctx.lineWidth = 3;
      ctx.strokeRect(barX, barY, barW, barH);

      var bGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      bGrad.addColorStop(0, "#ffd700");
      bGrad.addColorStop(1, "#ff1744");
      ctx.fillStyle = bGrad;
      ctx.fillRect(barX + 3, barY + 3, (barW - 6) * hpPct, barH - 6);

      ctx.font = "bold 18px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 3;
      var bossLabel = "☠️ GALEÓN JEFE PIRATA - " + Math.max(0, Math.ceil(bossGalleon.health)) + " / " + bossGalleon.maxHealth + " ☠️";
      ctx.strokeText(bossLabel, 960, barY + 24);
      ctx.fillText(bossLabel, 960, barY + 24);
    } else {
      // Indicador Central de Ronda
      ctx.font = "bold 24px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#FFE082";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 4;
      var roundTxt = (selectedMode === MODE_HORDE) ?
        ("🌊 OLEADA " + currentWave + " 🌊") :
        ("RONDA " + Math.min(currentRound, TOTAL_ROUNDS) + " DE " + TOTAL_ROUNDS);
      ctx.strokeText(roundTxt, 960, 48);
      ctx.fillText(roundTxt, 960, 48);
    }

    // Cuenta atrás central
    if (countdownTime > 0) {
      var txt = "3";
      var col = "#FF2A2A";
      if (countdownTime > 2.5) { txt = "3"; col = "#FF2A2A"; }
      else if (countdownTime > 1.5) { txt = "2"; col = "#FFEA00"; }
      else if (countdownTime > 0.5) { txt = "1"; col = "#00E676"; }
      else { txt = "¡FUEGO!"; col = "#00E5FF"; }

      ctx.font = "bold 88px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = col;
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 6;
      ctx.strokeText(txt, 960, 540);
      ctx.fillText(txt, 960, 540);
    }

    // Ganador de ronda
    if (roundWinner) {
      ctx.font = "bold 44px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = roundWinner.hull || "#ffffff";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 5;
      var wTxt = (roundWinner.name.indexOf("¡") !== -1) ?
        roundWinner.name : "¡" + (roundWinner.customName || roundWinner.name).toUpperCase() + " GANA LA RONDA!";
      ctx.strokeText(wTxt, 960, 480);
      ctx.fillText(wTxt, 960, 480);
    }

    ctx.restore();
  }

  function drawPlayerHUDCard(x, y, w, h, player) {
    // Buscar el barco activo asociado para obtener vidas y munición en tiempo real
    var ship = null;
    for (var s = 0; s < activeShips.length; s++) {
      if (activeShips[s].slot === player.slot) {
        ship = activeShips[s];
        break;
      }
    }

    var curHealth = ship ? ship.health : 3;
    var curMaxHealth = ship ? ship.maxHealth : 3;
    var curAmmo = ship ? ship.ammo : 3;
    var curMaxAmmo = ship ? ship.maxAmmo : 3;
    var isAlive = ship ? ship.isAlive : true;

    ctx.fillStyle = isAlive ? "rgba(10, 18, 28, 0.88)" : "rgba(35, 10, 10, 0.75)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = isAlive ? player.hull : "#555555";
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x, y, w, h);

    // Nombre del jugador (personalizado o por defecto)
    var nameStr = player.customName || player.name;
    ctx.font = "bold 15px sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = isAlive ? "#ffffff" : "#888888";
    ctx.fillText(nameStr, x + 12, y + 24);

    // Puntaje o Estado
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "right";
    if (selectedMode === MODE_HORDE) {
      ctx.fillStyle = isAlive ? "#00e676" : "#ff1744";
      ctx.fillText(isAlive ? "VIVO" : "CAÍDO", x + w - 12, y + 24);
    } else {
      ctx.fillStyle = "#ffea00";
      ctx.fillText(player.score + " pts", x + w - 12, y + 24);
    }

    // Corazones de vida
    var hY = y + 44;
    for (var i = 0; i < curMaxHealth; i++) {
      var hState = Math.max(0, Math.min(1, curHealth - i));
      drawMiniHeart(ctx, x + 18 + i * 14, hY, hState);
    }

    // Munición
    ctx.textAlign = "left";
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#bbbbbb";
    ctx.fillText("BALAS:", x + 12, y + 68);
    for (var a = 0; a < curMaxAmmo; a++) {
      ctx.beginPath();
      ctx.arc(x + 65 + a * 12, y + 64, 3.2, 0, Math.PI * 2);
      if (a < curAmmo) {
        ctx.fillStyle = "#ffea00";
        ctx.fill();
      } else {
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  function renderPodium() {
    setLobbyUIVisible(false);

    // Fondo podio
    ctx.fillStyle = "#1A4B75";
    ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);

    var sorted = [];
    for (var i = 0; i < playersData.length; i++) {
      if (playersData[i].connected) sorted.push(playersData[i]);
    }
    if (sorted.length === 0) sorted = [playersData[0], playersData[1]];

    sorted.sort(function(a, b) {
      return b.score - a.score;
    });

    ctx.font = "bold 44px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = sorted[0].hull;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 4;

    var champTxt = "👑 ¡" + (sorted[0].customName || sorted[0].name).toUpperCase() + " ES EL CAMPEÓN! 👑";
    if (selectedMode === MODE_TEAMS) {
      var winTeam = (teamScores.blue >= teamScores.red) ? "EQUIPO AZUL" : "EQUIPO ROJO";
      champTxt = "👑 ¡" + winTeam + " ES EL CAMPEÓN DEL TORNEO! 👑";
    } else if (selectedMode === MODE_HORDE) {
      champTxt = "🌊 ¡LA FLOTA RESISTIÓ HASTA LA OLEADA " + currentWave + "! 🌊";
    }
    ctx.strokeText(champTxt, 960, 110);
    ctx.fillText(champTxt, 960, 110);

    // Columnas de podio
    var count = sorted.length;
    var baseY = 860;
    var maxH = 480;
    var minH = 160;
    var totalW = 1560;
    var startX = 180;
    var spacing = 16;
    var colW = (totalW - spacing * (count - 1)) / count;

    for (var j = 0; j < count; j++) {
      var p = sorted[j];
      var colH = minH + (maxH - minH) * (1 - j / Math.max(1, count - 1));
      var cX = startX + j * (colW + spacing);
      var cY = baseY - colH;

      ctx.fillStyle = p.hull;
      ctx.fillRect(cX, cY, colW, colH);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.strokeRect(cX, cY, colW, colH);

      ctx.font = "bold 28px sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.fillText((j + 1) + "°", cX + colW / 2, cY + 45);

      ctx.font = "bold 18px sans-serif";
      ctx.fillText(p.customName || p.name, cX + colW / 2, cY + 85);

      ctx.fillStyle = "#ffea00";
      ctx.fillText(p.score + " pts", cX + colW / 2, cY + 120);
    }

    // Botones del podio: Jugar Otra Vez / Volver al Lobby
    renderPodiumButtons();
  }

  function renderPodiumButtons() {
    var btnY = 940;
    var btnW = 340;
    var btnH = 65;

    // Botón 0: Jugar Otra Vez
    var b1X = 540 - btnW / 2;
    ctx.fillStyle = (podiumSelectedBtn === 0) ? "#2ecc71" : "#1e824c";
    ctx.fillRect(b1X, btnY, btnW, btnH);
    ctx.strokeStyle = (podiumSelectedBtn === 0) ? "#ffffff" : "#27ae60";
    ctx.lineWidth = 4;
    ctx.strokeRect(b1X, btnY, btnW, btnH);

    ctx.font = "bold 22px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText("🔄 JUGAR OTRA VEZ", b1X + btnW / 2, btnY + 41);

    // Botón 1: Volver al Lobby
    var b2X = 1380 - btnW / 2;
    ctx.fillStyle = (podiumSelectedBtn === 1) ? "#3498db" : "#2980b9";
    ctx.fillRect(b2X, btnY, btnW, btnH);
    ctx.strokeStyle = (podiumSelectedBtn === 1) ? "#ffffff" : "#2980b9";
    ctx.lineWidth = 4;
    ctx.strokeRect(b2X, btnY, btnW, btnH);

    ctx.fillText("🏠 VOLVER AL LOBBY", b2X + btnW / 2, btnY + 41);
  }

  // Control remoto Tizen / Teclado PC
  window.addEventListener("keydown", function(e) {
    var k = e.keyCode;

    if (k === 77) { // Tecla M: Mute
      Sound.toggleMute();
      return;
    }

    if (currentState === STATE_LOBBY) {
      if (k === 37) { // Left
        selectedMode = (selectedMode + 2) % 3;
        updateLobbyModeUI();
        broadcastCurrentMode();
      } else if (k === 39) { // Right
        selectedMode = (selectedMode + 1) % 3;
        updateLobbyModeUI();
        broadcastCurrentMode();
      } else if (k === 13 || k === 32) { // Enter / Space / OK
        startNewMatch();
      }
    } else if (currentState === STATE_PODIUM) {
      if (k === 37) {
        podiumSelectedBtn = 0;
      } else if (k === 39) {
        podiumSelectedBtn = 1;
      } else if (k === 13 || k === 32) {
        if (podiumSelectedBtn === 0) {
          startNewMatch();
        } else {
          for (var p2 = 0; p2 < playersData.length; p2++) playersData[p2].score = 0;
          currentRound = 0;
          currentState = STATE_LOBBY;
          updateLobbyShips();
          sendTvAction("state_change", null, "lobby");
        }
      }
    }
  }, false);

  function updateLobbyModeUI() {
    var b1 = document.getElementById("btn-mode-battle");
    var b2 = document.getElementById("btn-mode-teams");
    var b3 = document.getElementById("btn-mode-horde");
    if (b1) b1.className = (selectedMode === MODE_BATTLE) ? "mode-card active" : "mode-card";
    if (b2) b2.className = (selectedMode === MODE_TEAMS) ? "mode-card active" : "mode-card";
    if (b3) b3.className = (selectedMode === MODE_HORDE) ? "mode-card active" : "mode-card";
  }

  function resizeCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    scale = Math.min(canvas.width / V_WIDTH, canvas.height / V_HEIGHT);
    offsetX = (canvas.width - V_WIDTH * scale) / 2;
    offsetY = (canvas.height - V_HEIGHT * scale) / 2;
  }

  window.addEventListener("resize", resizeCanvas, false);

  // Inicialización de la pantalla TV / Anfitrión
  window.onload = function() {
    canvas = document.getElementById("game-canvas");
    if (!canvas) return;
    ctx = canvas.getContext("2d");
    if (!ctx) return;
    elLobbyUI = document.getElementById("lobby-ui");
    resizeCanvas();

    connectCloudNet();
    window.requestAnimationFrame(gameLoop);

    var bBattle = document.getElementById("btn-mode-battle");
    var bTeams = document.getElementById("btn-mode-teams");
    var bHorde = document.getElementById("btn-mode-horde");
    var bStart = document.getElementById("btn-start-game");

    if (bBattle) {
      bBattle.onclick = function() {
        selectedMode = MODE_BATTLE;
        updateLobbyModeUI();
        broadcastCurrentMode();
      };
    }
    if (bTeams) {
      bTeams.onclick = function() {
        selectedMode = MODE_TEAMS;
        updateLobbyModeUI();
        broadcastCurrentMode();
      };
    }
    if (bHorde) {
      bHorde.onclick = function() {
        selectedMode = MODE_HORDE;
        updateLobbyModeUI();
        broadcastCurrentMode();
      };
    }
    if (bStart) {
      bStart.onclick = function() {
        startNewMatch();
      };
    }
  };

  window.BarquitosGame = {
    startRound: startRoundByMode,
    startNewMatch: startNewMatch
  };
})(window);

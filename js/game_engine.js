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

  // Desacoplamiento del HUD lateral en DOM (Cero manipulación en bucle de 60 FPS)
  var cachedHUD = {
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

    var panelW = 270;
    cachedHUD.leftEl.style.left = offsetX + "px";
    cachedHUD.leftEl.style.top = offsetY + "px";
    cachedHUD.leftEl.style.width = (panelW * scale) + "px";
    cachedHUD.leftEl.style.height = (V_HEIGHT * scale) + "px";
    cachedHUD.leftEl.style.transform = "scale(" + scale + ")";
    cachedHUD.leftEl.style.transformOrigin = "top left";
    cachedHUD.leftEl.style.display = (currentState === STATE_ARENA) ? "flex" : "none";

    cachedHUD.rightEl.style.left = (offsetX + (V_WIDTH - panelW) * scale) + "px";
    cachedHUD.rightEl.style.top = offsetY + "px";
    cachedHUD.rightEl.style.width = (panelW * scale) + "px";
    cachedHUD.rightEl.style.height = (V_HEIGHT * scale) + "px";
    cachedHUD.rightEl.style.transform = "scale(" + scale + ")";
    cachedHUD.rightEl.style.transformOrigin = "top left";
    cachedHUD.rightEl.style.display = (currentState === STATE_ARENA) ? "flex" : "none";

    if (selectedMode === MODE_TEAMS) {
      var hBlue = document.createElement("div");
      hBlue.className = "hud-panel-header blue";
      hBlue.innerHTML = "<div>🔵 EQUIPO AZUL</div><div class='hud-header-sub' id='hud-blue-score'>" + teamScores.blue + " PUNTOS</div>";
      cachedHUD.leftEl.appendChild(hBlue);
      cachedHUD.teamBlueScore = hBlue.querySelector("#hud-blue-score");

      var hRed = document.createElement("div");
      hRed.className = "hud-panel-header red";
      hRed.innerHTML = "<div>🔴 EQUIPO ROJO</div><div class='hud-header-sub' id='hud-red-score'>" + teamScores.red + " PUNTOS</div>";
      cachedHUD.rightEl.appendChild(hRed);
      cachedHUD.teamRedScore = hRed.querySelector("#hud-red-score");

      for (var s = 0; s < activeShips.length; s++) {
        var sh = activeShips[s];
        var parentEl = (sh.data.team === "red") ? cachedHUD.rightEl : cachedHUD.leftEl;
        createPlayerHUDCard(parentEl, sh);
      }
    } else if (selectedMode === MODE_HORDE) {
      var hHorde = document.createElement("div");
      hHorde.className = "hud-panel-header horde";
      hHorde.innerHTML = "<div>⚓ FLOTA ALIADA</div><div class='hud-header-sub' id='hud-horde-wave'>OLEADA " + currentWave + "</div>";
      cachedHUD.leftEl.appendChild(hHorde);
      cachedHUD.hordeWave = hHorde.querySelector("#hud-horde-wave");

      for (var a = 0; a < activeShips.length; a++) {
        createPlayerHUDCard(cachedHUD.leftEl, activeShips[a]);
      }

      var upBox = document.createElement("div");
      upBox.className = "hud-horde-upgrades-box";
      upBox.id = "hud-horde-upgrades";
      upBox.innerHTML = "<h4>⭐ MEJORAS EQUIPO</h4>" +
        "<div class='hud-horde-item' style='color:#ff4081;'>💥 Armas: Nivel <span id='hud-w-lvl'>" + hordeUpgrades.weaponLevel + "</span></div>" +
        "<div class='hud-horde-item' style='color:#29b6f6;'>📦 Munición: Máx <span id='hud-m-ammo'>" + hordeUpgrades.maxAmmo + "</span></div>" +
        "<div class='hud-horde-item' style='color:#ffd700;'>🛡️ Casco: <span id='hud-m-hp'>" + hordeUpgrades.maxHealth + "</span> Vidas</div>" +
        "<div class='hud-horde-item' style='color:#00e676;'>💚 Revivir Usados: <span id='hud-rep-cnt'>" + hordeUpgrades.repairs + "</span></div>" +
        "<div class='hud-horde-pirates-count'>☠️ Piratas: <span id='hud-pir-cnt'>" + (pirateShips.length + waveEnemiesToSpawn) + "</span></div>";
      cachedHUD.rightEl.appendChild(upBox);
      cachedHUD.hordeUpgrades = upBox;
    } else {
      var hBatL = document.createElement("div");
      hBatL.className = "hud-panel-header battle";
      hBatL.innerHTML = "<div>⚔️ JUGADORES 1-4</div><div class='hud-header-sub'>RONDA " + currentRound + "/" + TOTAL_ROUNDS + "</div>";
      cachedHUD.leftEl.appendChild(hBatL);

      var hBatR = document.createElement("div");
      hBatR.className = "hud-panel-header battle";
      hBatR.innerHTML = "<div>⚔️ JUGADORES 5-8</div><div class='hud-header-sub'>COMBATE NAVAL</div>";
      cachedHUD.rightEl.appendChild(hBatR);

      for (var b = 0; b < activeShips.length; b++) {
        var shB = activeShips[b];
        var parentB = (shB.slot < 4) ? cachedHUD.leftEl : cachedHUD.rightEl;
        createPlayerHUDCard(parentB, shB);
      }
    }
  }

  function createPlayerHUDCard(parentEl, ship) {
    var p = ship.data;
    var card = document.createElement("div");
    card.className = "hud-card";
    card.style.borderLeftColor = p.hull || "#00e5ff";
    card.style.borderLeftWidth = "4px";

    var topRow = document.createElement("div");
    topRow.className = "hud-card-top";

    var nameSpan = document.createElement("span");
    nameSpan.className = "hud-card-name";
    nameSpan.textContent = p.customName || p.name;
    nameSpan.style.color = p.hull || "#ffffff";

    var statusSpan = document.createElement("span");
    statusSpan.className = "hud-card-status " + (ship.isAlive ? "alive" : "sunk");
    statusSpan.textContent = ship.isAlive ? "VIVO" : "HUNDIDO";

    topRow.appendChild(nameSpan);
    topRow.appendChild(statusSpan);

    var track = document.createElement("div");
    track.className = "hud-health-track";
    var fill = document.createElement("div");
    fill.className = "hud-health-fill";
    var pct = Math.max(0, Math.min(100, (ship.health / ship.maxHealth) * 100));
    fill.style.width = pct + "%";
    track.appendChild(fill);

    var botRow = document.createElement("div");
    botRow.className = "hud-card-bottom";

    var ammoSpan = document.createElement("span");
    ammoSpan.className = "hud-ammo-text";
    var ammoDots = "";
    for (var a = 0; a < ship.ammo; a++) ammoDots += "● ";
    ammoSpan.textContent = ammoDots || "RECARGANDO...";

    var scoreSpan = document.createElement("span");
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
    var c = cachedHUD.cards[slot];
    if (!c) return;
    var ship = null;
    for (var i = 0; i < activeShips.length; i++) {
      if (activeShips[i].slot === slot) {
        ship = activeShips[i];
        break;
      }
    }
    if (!ship) return;

    if (c.lastHp !== ship.health || c.lastMaxHp !== ship.maxHealth) {
      c.lastHp = ship.health;
      c.lastMaxHp = ship.maxHealth;
      var pct = Math.max(0, Math.min(100, (ship.health / ship.maxHealth) * 100));
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
      var dots = "";
      for (var a = 0; a < ship.ammo; a++) dots += "● ";
      c.ammoEl.textContent = dots || "RECARGANDO...";
    }

    if (c.lastScore !== ship.data.score) {
      c.lastScore = ship.data.score;
      c.scoreEl.textContent = ship.data.score + " PTS";
    }
  }

  function updateAllShipsHUD() {
    for (var slot in cachedHUD.cards) {
      updateShipHUD(parseInt(slot, 10));
    }
  }

  function updateTeamScoresHUD() {
    if (cachedHUD.teamBlueScore) cachedHUD.teamBlueScore.textContent = teamScores.blue + " PUNTOS";
    if (cachedHUD.teamRedScore) cachedHUD.teamRedScore.textContent = teamScores.red + " PUNTOS";
  }

  function updateHordeUpgradesHUD() {
    if (!cachedHUD.hordeUpgrades) return;
    var wLvl = document.getElementById("hud-w-lvl");
    var mAmmo = document.getElementById("hud-m-ammo");
    var mHp = document.getElementById("hud-m-hp");
    var rCnt = document.getElementById("hud-rep-cnt");
    var pCnt = document.getElementById("hud-pir-cnt");
    if (wLvl) wLvl.textContent = hordeUpgrades.weaponLevel;
    if (mAmmo) mAmmo.textContent = hordeUpgrades.maxAmmo;
    if (mHp) mHp.textContent = hordeUpgrades.maxHealth;
    if (rCnt) rCnt.textContent = hordeUpgrades.repairs;
    if (pCnt) pCnt.textContent = (pirateShips.length + waveEnemiesToSpawn);
  }

  function setLobbyUIVisible(visible) {
    if (!elLobbyUI) {
      elLobbyUI = document.getElementById("lobby-ui");
    }
    if (elLobbyUI) {
      var targetDisplay = visible ? "flex" : "none";
      if (elLobbyUI.style.display !== targetDisplay) {
        elLobbyUI.style.display = targetDisplay;
      }
    }
    var pL = document.getElementById("hud-panel-left");
    var pR = document.getElementById("hud-panel-right");
    if (pL) pL.style.display = "none";
    if (pR) pR.style.display = "none";
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
  var selectedMode = MODE_HORDE;

  var currentRoomCode = "";
  var uuidToSlot = {};
  var PLAYER_PROFILES = [
    { slot: 0, name: "Capitán 1", hull: "#E67E22", sail: "#FFF8E7", stripe: "#2ECC71", symbol: "circle", uuid: "", connected: false, ready: false, score: 0, team: "blue", customName: "" },
    { slot: 1, name: "Capitán 2", hull: "#1E60D5", sail: "#82B1FF", stripe: "#0D47A1", symbol: "square", uuid: "", connected: false, ready: false, score: 0, team: "red", customName: "" },
    { slot: 2, name: "Capitán 3", hull: "#D81B60", sail: "#FF80AB", stripe: "#FFD600", symbol: "triangle", uuid: "", connected: false, ready: false, score: 0, team: "blue", customName: "" },
    { slot: 3, name: "Capitán 4", hull: "#75e363", sail: "#B9F6CA", stripe: "#218957", symbol: "diamond", uuid: "", connected: false, ready: false, score: 0, team: "red", customName: "" },
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
  var wakeParticles = [];
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
    fleetRank: 0,
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
  var matchWinner = null;
  var roundOverTimer = 0;
  var podiumAnimTimer = 0;
  var podiumSelectedBtn = 0; // 0: Jugar Otra Vez, 1: Lobby

  // Screen Shake
  var shakeTimer = 0;
  var shakeIntensity = 0;

  // Variables Multijugador Online (Jugar con amigos en otros países)
  var isRemoteClient = false;
  var remoteSlot = -1;
  var localPlayerSlot = -1;
  var releaseTouchControls = releaseLocalInputs;
  var myPlayerUUID = null;
  var myCustomNickname = "";
  var mySelectedTeam = "blue";
  var isClientReady = false;
  var lastBroadcastTime = 0;
  var lastInputSendTime = 0;

  var localInputState = {
    turn: 0,
    thrust: false,
    shoot: false
  };

  var lastSentLocalInput = {
    turn: 999,
    thrust: false,
    shoot: false
  };

  var keyState = {
    left: false,
    right: false,
    thrust: false,
    shoot: false
  };

  function getQueryParam(name) {
    try {
      var params = new URLSearchParams(window.location.search);
      return (params.get(name) || "").toUpperCase();
    } catch (e) {
      return "";
    }
  }

  function getOrCreateUUID() {
    var key = "barquitos_cloud_uuid";
    var saved = null;
    try { saved = window.localStorage.getItem(key); } catch (e) {}
    if (saved && saved.length > 8) return saved;

    var newUuid = "u-";
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      newUuid += crypto.randomUUID().replace(/-/g, "").substr(0, 12);
    } else {
      var chars = "0123456789abcdef";
      for (var i = 0; i < 12; i++) {
        newUuid += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      newUuid += "-" + Date.now().toString(36);
    }
    try { window.localStorage.setItem(key, newUuid); } catch (e) {}
    return newUuid;
  }
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
    this.rescueTime = 0;
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
      updateShipHUD(this.slot);
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
      addParticle({
        x: this.x, y: this.y,
        vx: Math.cos(pAng) * pSpd, vy: Math.sin(pAng) * pSpd,
        radius: 2 + Math.random() * 3,
        color: "#ffdd44", life: 0.35, maxLife: 0.35
      });
    }

    if (currentState !== STATE_LOBBY) {
      this.health -= damage;
      updateShipHUD(this.slot);
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
    this.rescueTime = 0;
    if (selectedMode === MODE_HORDE) {
      var raft = getLootPosition(this.x, this.y);
      this.x = raft.x;
      this.y = raft.y;
    }
    Sound.playSplash();
    spawnSplash(this.x, this.y);
    triggerScreenShake(0.35, 10);
    sendTvAction("vibrate", this.slot, 300);

    for (var i = 0; i < 35; i++) {
      var spd = 60 + Math.random() * 220;
      var ang = Math.random() * Math.PI * 2;
      addParticle({
        x: this.x, y: this.y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        radius: 3 + Math.random() * 6,
        color: this.data.hull || "#ff2222",
        life: 0.8, maxLife: 0.8
      });
    }
  };

  Ship.prototype.draw = function(c) {
    if (!this.isAlive) {
      if (selectedMode === MODE_HORDE) {
        c.save();
        c.beginPath();
        c.arc(this.x, this.y, 15, 0, Math.PI * 2);
        c.fillStyle = "#763949";
        c.fill();
        c.strokeStyle = "#ffdc79";
        c.lineWidth = 5;
        c.stroke();
        c.beginPath();
        c.arc(this.x, this.y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * this.rescueTime);
        c.strokeStyle = "#86ffaf";
        c.stroke();
        c.font = "bold 13px sans-serif";
        c.textAlign = "center";
        c.fillStyle = "#ffffff";
        c.fillText("RESCATE", this.x, this.y - 30);
        c.restore();
      }
      return;
    }
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

    if (this.slot === (isRemoteClient ? remoteSlot : localPlayerSlot)) {
      c.beginPath();
      c.arc(0, 0, 49, 0, Math.PI * 2);
      c.strokeStyle = "#ffffff";
      c.lineWidth = 5;
      c.stroke();
      c.strokeStyle = this.data.hull;
      c.lineWidth = 3;
      c.stroke();
    }
    if (currentState === STATE_ARENA) {
      var wakeLength = this.isRamming ? 122 : 66;
      c.beginPath();
      c.moveTo(-17, -10);
      c.quadraticCurveTo(-wakeLength * 0.55, -17, -wakeLength, -24);
      c.moveTo(-17, 10);
      c.quadraticCurveTo(-wakeLength * 0.55, 17, -wakeLength, 24);
      c.strokeStyle = this.isRamming ? "rgba(204,255,255,0.8)" : "rgba(225,255,255,0.45)";
      c.lineWidth = this.isRamming ? 4 : 2;
      c.stroke();
    }

    var sternWidth = [14, 11, 18, 13, 17, 12, 19, 15][this.slot];
    var bowShoulder = [16, 21, 9, 13, 19, 8, 12, 23][this.slot];
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

    if (selectedMode === MODE_HORDE && hordeUpgrades.fleetRank > 0) {
      var rank = hordeUpgrades.fleetRank;
      c.fillStyle = "#233453";
      c.fillRect(-12, -22, 14 + Math.min(rank, 5), 10);
      c.fillRect(-12, 12, 14 + Math.min(rank, 5), 10);
      sailCol = rank >= 2 ? "#e2f5ff" : sailCol;
      c.fillStyle = ["#ffd76a", "#c4ebff", "#df9dff", "#65f4d6"][Math.min(rank - 1, 3)];
      for (var armor = 0; armor < Math.min(rank + 1, 6); armor++) {
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
    var roll = type === undefined ? Math.random() : 0;
    this.type = type !== undefined ? type : (roll < 0.05 ? 0 : 1 + Math.floor((roll - 0.05) / 0.95 * 4));
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

    // Optimización IA: Recalcular ángulo objetivo cada 12 frames
    this.aiTick = (this.aiTick || 0) + 1;
    if (this.aiTick % 12 === 1 || this.cachedDesiredAng === undefined) {
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

      var dAng = this.rotation;
      if (nearest) {
        dAng = Math.atan2(nearest.y - this.y, nearest.x - this.x);
      }

      // Esquivar islas con AABB y distancia al cuadrado
      for (var ii = 0; ii < islands.length; ii++) {
        var isl = islands[ii];
        var idX = this.x - isl.x;
        var idY = this.y - isl.y;
        var avoidDist = isl.rad + 70;
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
    var desiredAng = this.cachedDesiredAng;

    // Fuerza de separación entre piratas para evitar amontonamiento (Boids separation)
    for (var p2 = 0; p2 < pirateShips.length; p2++) {
      var otherPirate = pirateShips[p2];
      if (otherPirate === this || !otherPirate.isAlive) continue;
      var pDx = this.x - otherPirate.x;
      var pDy = this.y - otherPirate.y;
      if (Math.abs(pDx) < 45 && Math.abs(pDy) < 45) {
        var pDistSq = pDx * pDx + pDy * pDy;
        if (pDistSq < 2025 && pDistSq > 1) {
          var pDist = Math.sqrt(pDistSq);
          var push = (45 - pDist) * 2.2;
          this.vx += (pDx / pDist) * push * dt * 60;
          this.vy += (pDy / pDist) * push * dt * 60;
        }
      }
    }

    // Giro suave hacia el objetivo
    var diff = Math.atan2(Math.sin(desiredAng - this.rotation), Math.cos(desiredAng - this.rotation));
    this.rotation += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff * 4.2 * dt));

    var fwdX = Math.cos(this.rotation);
    var fwdY = Math.sin(this.rotation);

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

  PirateShip.prototype.applyHit = function(dirX, dirY, force, dmg, attackerSlot) {
    if (!this.isAlive) return;
    Sound.playHit();
    this.health -= (dmg !== undefined ? dmg : 1);
    this.flashTimer = 0.18;
    this.vx += dirX * (force || 300);
    this.vy += dirY * (force || 300);

    // Sumar puntos por impacto
    if (typeof attackerSlot === "number" && attackerSlot >= 0 && playersData[attackerSlot]) {
      playersData[attackerSlot].score += 25;
      updateShipHUD(attackerSlot);
    }

    if (this.health <= 0) {
      this.die(attackerSlot);
    }
  };

  PirateShip.prototype.die = function(killerSlot) {
    if (!this.isAlive) return;
    this.isAlive = false;
    Sound.playSplash();
    triggerScreenShake(0.25, 7);

    // Sumar puntos al jugador que hundió el barco pirata
    if (typeof killerSlot === "number" && killerSlot >= 0 && playersData[killerSlot]) {
      playersData[killerSlot].score += 100;
      addFloatingText("+100", this.x, this.y - 20, "#ffca28", 22);
      updateShipHUD(killerSlot);
    }

    for (var i = 0; i < 24; i++) {
      var spd = 40 + Math.random() * 180;
      var ang = Math.random() * Math.PI * 2;
      addParticle({
        x: this.x, y: this.y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        radius: 2 + Math.random() * 4,
        color: (i % 2 === 0) ? "#111111" : "#8e24aa",
        life: 0.65, maxLife: 0.65
      });
    }

    // 50% de probabilidad de soltar Botín de Mejora, 30% de munición
    if (Math.random() < 0.50) {
      var loot = getLootPosition(this.x, this.y);
      hordePowerups.push(new HordePowerup(loot.x, loot.y));
    } else if (Math.random() < 0.60) {
      var ammo = getLootPosition(this.x, this.y);
      ammoCrates.push(new AmmoCrate(ammo.x, ammo.y));
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
    this.maxHealth = 22 + Math.floor(wave / 10) * 18;
    this.health = this.maxHealth;
    this.speed = 82;
    this.rank = Math.max(1, Math.floor(wave / 10));
    this.specialTimer = 4.2;
    this.attackCount = 0;
    this.warning = 0;
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
    var diff = Math.atan2(Math.sin(desiredAng - this.rotation), Math.cos(desiredAng - this.rotation));
    this.rotation += Math.max(-1.5 * dt, Math.min(1.5 * dt, diff * 2.2 * dt));

    var fwdX = Math.cos(this.rotation);
    var fwdY = Math.sin(this.rotation);
    var latX = -fwdY;
    var latY = fwdX;

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
    var frontal = this.health <= this.maxHealth / 2 && this.attackCount % 2 === 1;
    this.warning = this.specialTimer <= 0.75 ? (frontal ? 2 : 1) : 0;
    if (this.specialTimer <= 0) {
      this.specialTimer = 4.2;
      this.attackCount++;
      this.warning = 0;
      Sound.playCannon();
      triggerScreenShake(0.3, 7);

      if (frontal) {
        var spread = Math.min(4, this.rank + 1);
        for (var f = -spread; f <= spread; f++) {
          var fAng = this.rotation + f * 0.25;
          cannonballs.push(new Cannonball(this.x + fwdX * 50, this.y + fwdY * 50, Math.cos(fAng), Math.sin(fAng), -1, true, 1));
        }

        spawnMuzzleFlash(this.x + fwdX * 50, this.y + fwdY * 50, this.rotation);
      } else {
        var guns = Math.min(4, this.rank + 1);
        for (var gun = 0; gun < guns; gun++) {
          var offset = (gun - (guns - 1) / 2) * 23;
          var gunX = this.x + fwdX * offset;
          var gunY = this.y + fwdY * offset;
          cannonballs.push(new Cannonball(gunX + latX * 29, gunY + latY * 29, latX, latY, -1, true, 1));
          cannonballs.push(new Cannonball(gunX - latX * 29, gunY - latY * 29, -latX, -latY, -1, true, 1));
        }
      }
    }

    if (Math.random() < 0.6) {
      spawnWaterFoam(this.x - fwdX * 45, this.y - fwdY * 45, -fwdX, -fwdY);
    }
  };

  BossGalleon.prototype.applyHit = function(dirX, dirY, force, dmg, attackerSlot) {
    if (!this.isAlive) return;
    Sound.playHit();
    triggerScreenShake(0.2, 5);
    this.health -= (dmg !== undefined ? dmg : 1);
    this.flashTimer = 0.2;
    this.vx += dirX * 60;
    this.vy += dirY * 60;

    // Sumar puntos por impacto al jefe
    if (typeof attackerSlot === "number" && attackerSlot >= 0 && playersData[attackerSlot]) {
      playersData[attackerSlot].score += 35;
      updateShipHUD(attackerSlot);
    }

    if (this.health <= 0) {
      this.die(attackerSlot);
    }
  };

  BossGalleon.prototype.die = function(killerSlot) {
    if (!this.isAlive) return;
    this.isAlive = false;
    Sound.playFanfare();
    triggerScreenShake(1.2, 18);

    // Sumar puntos al jugador que derrotó al Galeón Jefe
    if (typeof killerSlot === "number" && killerSlot >= 0 && playersData[killerSlot]) {
      playersData[killerSlot].score += 500;
      addFloatingText("+500", this.x, this.y - 40, "#ffd700", 36);
      updateShipHUD(killerSlot);
    }

    for (var i = 0; i < 70; i++) {
      var spd = 60 + Math.random() * 260;
      var ang = Math.random() * Math.PI * 2;
      addParticle({
        x: this.x, y: this.y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        radius: 4 + Math.random() * 8,
        color: (i % 2 === 0) ? "#ffd700" : "#ff1744",
        life: 1.2, maxLife: 1.2
      });
    }

    hordeUpgrades.fleetRank++;
    applyGlobalPowerup(4, this);
    addFloatingText("👑 ¡FLOTA BLINDADA! NIVEL " + hordeUpgrades.fleetRank, 960, 380, "#ffd700", 52);
  };

  BossGalleon.prototype.draw = function(c) {
    if (!this.isAlive) return;
    c.save();
    c.translate(this.x, this.y);
    c.rotate(this.rotation);

    var tier = Math.min(this.rank - 1, 3);
    var accent = ["#ffd76a", "#ff6a47", "#dd83ff", "#5ef5e2"][tier];
    var hullCol = this.flashTimer > 0 ? "#ffffff" : ["#572039", "#171d2b", "#342066", "#153d57"][tier];
    var sailCol = this.flashTimer > 0 ? "#ffffff" : ["#e0444f", "#555e72", "#a15bed", "#236e83"][tier];

    // Casco gigante
    c.beginPath();
    var beam = tier === 1 ? 34 : 26;
    c.moveTo(56, 0); c.lineTo(34, -beam); c.lineTo(-50, -beam);
    c.lineTo(-50, beam); c.lineTo(34, beam);
    c.closePath();
    c.fillStyle = hullCol;
    c.fill();
    c.strokeStyle = "#ffd700";
    c.lineWidth = 4;
    c.stroke();

    c.fillStyle = accent;
    for (var plate = 0; plate < Math.min(this.rank + 1, 6); plate++) {
      c.fillRect(-44 + plate * 13, -29, 8, 7);
      c.fillRect(-44 + plate * 13, 22, 8, 7);
    }
    if (this.rank >= 2) {
      c.beginPath();
      c.moveTo(40, -11); c.lineTo(65 + tier * 4, 0); c.lineTo(40, 11);
      c.closePath();
      c.fill();
    }
    var barrels = Math.min(4, this.rank + 1);
    c.fillStyle = this.warning === 1 ? "#fff597" : "#28354a";
    for (var barrel = 0; barrel < barrels; barrel++) {
      var gunOffset = (barrel - (barrels - 1) / 2) * 23;
      c.fillRect(gunOffset - 4, -beam - 9, 8, 15);
      c.fillRect(gunOffset - 4, beam - 6, 8, 15);
    }
    c.fillStyle = this.warning === 2 ? "#fff597" : accent;
    c.fillRect(42, -5, 14, 10);
    if (tier >= 2) {
      c.beginPath();
      c.moveTo(39, -14); c.lineTo(69, -17); c.lineTo(59, 0);
      c.lineTo(69, 17); c.lineTo(39, 14); c.closePath();
      c.strokeStyle = accent;
      c.stroke();
    }

    var mastOffsets = this.rank >= 3 ? [-35, -12, 11, 34] : [-24, 4, 30];
    for (var m = 0; m < mastOffsets.length; m++) {
      var mx = mastOffsets[m];
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
    var title = ["Galeón Corsario", "Acorazado Carmesí", "Dreadnought Abisal", "Leviatán"][tier] + " " + this.rank;
    c.strokeText(title, this.x, this.y - 43);
    c.fillStyle = accent;
    c.fillText(title, this.x, this.y - 43);
  };

  // Partículas y Efectos con Object Pooling y ring-buffer estricto de 80
  var MAX_PARTICLES = 80;
  var particleOverwriteIdx = 0;
  function addParticle(p) {
    if (particles.length >= MAX_PARTICLES) {
      particles[particleOverwriteIdx] = p;
      particleOverwriteIdx = (particleOverwriteIdx + 1) % MAX_PARTICLES;
    } else {
      particles.push(p);
    }
  }

  function spawnSplash(x, y) {
    for (var i = 0; i < 14; i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = 20 + Math.random() * 80;
      addParticle({
        x: x, y: y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        radius: 2 + Math.random() * 3,
        color: "rgba(180, 230, 255, 0.8)",
        life: 0.35, maxLife: 0.35
      });
    }
  }

  function spawnHullSplinters(x, y, dirX, dirY) {
    for (var i = 0; i < 6; i++) {
      addParticle({
        x: x, y: y,
        vx: dirX * 70 + (Math.random() - 0.5) * 150,
        vy: dirY * 70 + (Math.random() - 0.5) * 150,
        radius: 2 + Math.random() * 3,
        color: i % 2 ? "#f7c077" : "#975032",
        life: 0.35, maxLife: 0.35
      });
    }
  }

  function spawnMuzzleFlash(x, y, rot) {
    addParticle({ x: x, y: y, vx: 0, vy: 0, radius: 10, color: "#fff6bb", life: 0.08, maxLife: 0.08 });
    for (var i = 0; i < 7; i++) {
      var ang = rot + (Math.random() - 0.5) * 0.7;
      var spd = 80 + Math.random() * 160;
      addParticle({
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
      addParticle({
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
      addParticle({
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
    addParticle({
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
    var colors = ["#E67E22", "#1E60D5", "#D81B60", "#75e363", "#FDD835", "#FF80AB", "#00E5FF", "#FF2A2A"];
    for (var i = 0; i < count; i++) {
      var x = 200 + Math.random() * 1520;
      addParticle({
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

  // Comprobación segura de islas para spawn de barcos y cajas (Anti-atascos)
  function isInsideIsland(x, y, margin) {
    var m = margin || 30;
    for (var i = 0; i < islands.length; i++) {
      var isl = islands[i];
      var dx = x - isl.x;
      var dy = y - isl.y;
      var checkRad = isl.rad + m;
      if (Math.abs(dx) <= checkRad && Math.abs(dy) <= checkRad) {
        if (dx * dx + dy * dy < checkRad * checkRad) return true;
      }
    }
    return false;
  }

  function getSafeSpawnPoint(bounds, margin) {
    var b = bounds || currentBounds || arenaBounds;
    var m = margin || 40;
    for (var attempt = 0; attempt < 30; attempt++) {
      var rx = b.x + 80 + Math.random() * (b.w - 160);
      var ry = b.y + 80 + Math.random() * (b.h - 160);
      if (!isInsideIsland(rx, ry, m)) {
        return { x: rx, y: ry };
      }
    }
    return { x: b.x + 120, y: b.y + 120 };
  }

  function getLootPosition(x, y) {
    if (!isInsideIsland(x, y, 36)) return { x: x, y: y };
    return getSafeSpawnPoint(currentBounds, 36);
  }

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

  function clearRoundEntities() {
    cannonballs = [];
    ammoCrates = [];
    hordePowerups = [];
    pirateShips = [];
    bossGalleon = null;
    particles = [];
    floatingTexts = [];
    roundWinner = null;
    roundOverTimer = 0;
  }

  function startBattleRound() {
    clearRoundEntities();
    currentState = STATE_ARENA;
    countdownTime = 3.5;
    lastCountdownStep = -1;
    roundTimer = 0;
    suddenDeathActive = false;
    currentBounds = { x: arenaBounds.x, y: arenaBounds.y, w: arenaBounds.w, h: arenaBounds.h };
    roundWinner = null;
    roundOverTimer = 0;
    sendTvAction("state_change", null, STATE_ARENA);

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
    } else if (connected.length === 1) {
      // Si solo hay 1 jugador conectado, añadir un rival para que la ronda no termine al instante
      var rivalSlot = (connected[0].slot === 0) ? 1 : 0;
      connected.push(playersData[rivalSlot]);
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
    clearRoundEntities();
    currentState = STATE_ARENA;
    countdownTime = 3.5;
    lastCountdownStep = -1;
    roundTimer = 0;
    suddenDeathActive = false;
    currentBounds = { x: arenaBounds.x, y: arenaBounds.y, w: arenaBounds.w, h: arenaBounds.h };
    roundWinner = null;
    roundOverTimer = 0;
    sendTvAction("state_change", null, STATE_ARENA);

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

    // Asegurar que ambos bandos tengan al menos un barco para combatir
    if (blueShips.length === 0) {
      blueShips.push(playersData[0]);
    }
    if (redShips.length === 0) {
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
    clearRoundEntities();
    currentState = STATE_ARENA;
    currentWave = 1;
    countdownTime = 3.5;
    lastCountdownStep = -1;
    roundTimer = 0;
    suddenDeathActive = false;
    currentBounds = { x: arenaBounds.x, y: arenaBounds.y, w: arenaBounds.w, h: arenaBounds.h };
    roundWinner = null;
    roundOverTimer = 0;
    sendTvAction("state_change", null, STATE_ARENA);

    hordeUpgrades = {
      weaponLevel: 1,
      maxAmmo: 3,
      maxHealth: 3,
      fleetRank: 0,
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

  function needsMorePlayers() {
    var count = isRemoteClient ? activeShips.length : playersData.filter(function (player) {
      return player.connected;
    }).length;
    return selectedMode !== MODE_HORDE && count < 2;
  }

  function startNewMatch() {
    if (isRemoteClient) { requestLobbyAction("start"); return; }
    if (needsMorePlayers()) return;
    if (selectedMode === MODE_HORDE && !playersData.some(function (player) { return player.connected; })) {
      ensureLocalPlayer();
    }
    console.log("[BARQUITOS] INICIANDO NUEVA PARTIDA! Modo:", selectedMode);
    currentRound = 0;
    teamScores.blue = 0;
    teamScores.red = 0;
    roundWinner = null;
    matchWinner = null;
    for (var i = 0; i < playersData.length; i++) {
      playersData[i].score = 0;
    }
    startRoundByMode();
  }

  function startRoundByMode() {
    if (isRemoteClient) { requestLobbyAction("start"); return; }
    try {
      releaseLocalInputs();
      // Ocultar de inmediato la interfaz del lobby
      setLobbyUIVisible(false);
      var el = document.getElementById("lobby-ui");
      if (el) el.style.display = "none";

      // Desbloquear audio tras clic de usuario si aún no estaba activo
      if (window.SoundSynth && window.SoundSynth.initAudio) {
        try { window.SoundSynth.initAudio(); } catch (eAudio) {}
      }

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
    } catch (errStart) {
      if (window.console && window.console.error) {
        window.console.error("[BARQUITOS] Error en startRoundByMode:", errStart);
      }
      currentState = STATE_ARENA;
      countdownTime = 3.5;
      lastCountdownStep = -1;
      initArenaIslands();
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


  // ==========================================================================
  // MULTIJUGADOR ONLINE: TRANSMISIÓN (HOST) Y SINCRONIZACIÓN (CLIENTE)
  // ==========================================================================

  function broadcastGameState() {
    if (!window.CloudNet || !window.CloudNet.isConnected() || isRemoteClient) return;
    var now = Date.now();
    if (now - lastBroadcastTime < 90) return; // ~11 Hz: tasa óptima para evitar congestión en brokers MQTT y conexiones móviles
    lastBroadcastTime = now;

    // 1. Barcos de jugadores
    var sData = [];
    for (var i = 0; i < activeShips.length; i++) {
      var sh = activeShips[i];
      sData.push([
        sh.slot,
        Math.round(sh.x),
        Math.round(sh.y),
        Math.round(sh.rotation * 100) / 100,
        sh.health,
        sh.maxHealth,
        sh.ammo,
        sh.isAlive ? 1 : 0,
        (sh.data && sh.data.team) ? sh.data.team : "blue",
        (sh.data && sh.data.name) ? sh.data.name : "",
        (sh.data && sh.data.customName) ? sh.data.customName : "",
        sh.isRamming ? 1 : 0,
        sh.flashTimer > 0 ? 1 : 0,
        Math.round(sh.speed || 80),
        (sh.data && typeof sh.data.score === "number") ? sh.data.score : (playersData[sh.slot] ? playersData[sh.slot].score : 0),
        Math.round(sh.rescueTime * 10) / 10
      ]);
    }

    // 2. Balas de cañón activas
    var bData = [];
    for (var b = 0; b < cannonballs.length; b++) {
      var cb = cannonballs[b];
      if (!cb.isDead) {
        bData.push([
          Math.round(cb.x),
          Math.round(cb.y),
          Math.round(cb.dx * 100) / 100,
          Math.round(cb.dy * 100) / 100,
          cb.isPirate ? 1 : 0,
          cb.shooterTeam || "blue"
        ]);
      }
    }

    // 3. Barcos Piratas (Modo Horda)
    var pData = [];
    if (selectedMode === MODE_HORDE) {
      for (var p = 0; p < pirateShips.length; p++) {
        var pi = pirateShips[p];
        if (pi.isAlive) {
          pData.push([
            Math.round(pi.x),
            Math.round(pi.y),
            Math.round(pi.rotation * 100) / 100,
            pi.health,
            pi.maxHealth,
            pi.flashTimer > 0 ? 1 : 0
          ]);
        }
      }
    }

    // 4. Galeón Jefe
    var boData = null;
    if (selectedMode === MODE_HORDE && bossGalleon && bossGalleon.isAlive) {
      boData = [
        Math.round(bossGalleon.x),
        Math.round(bossGalleon.y),
        Math.round(bossGalleon.rotation * 100) / 100,
        bossGalleon.health,
        bossGalleon.maxHealth,
        bossGalleon.flashTimer > 0 ? 1 : 0,
        bossGalleon.warning
      ];
    }

    // 5. Cajas de munición y mejoras
    var cData = [];
    for (var c = 0; c < ammoCrates.length; c++) {
      cData.push([Math.round(ammoCrates[c].x), Math.round(ammoCrates[c].y), -1]);
    }
    if (selectedMode === MODE_HORDE) {
      for (var pu = 0; pu < hordePowerups.length; pu++) {
        cData.push([Math.round(hordePowerups[pu].x), Math.round(hordePowerups[pu].y), hordePowerups[pu].type]);
      }
    }

    var syncPayload = {
      type: "sync",
      st: currentState,
      m: selectedMode,
      r: currentRound,
      w: currentWave,
      cd: Math.round(countdownTime * 10) / 10,
      rt: Math.round(roundTimer),
      ts: teamScores,
      up: (selectedMode === MODE_HORDE) ? hordeUpgrades : null,
      sh: sData,
      cb: bData,
      pi: pData,
      bo: boData,
      cr: cData,
      rw: roundWinner ? roundWinner.name : null,
      mw: matchWinner ? matchWinner.name : null,
      psc: playersData.map(function(p){ return p.score || 0; })
    };

    window.CloudNet.broadcastState(syncPayload);
  }

  function applyClientSync(msg) {
    if (!isRemoteClient || !msg) return;
    if (islands.length === 0) {
      initArenaIslands();
    }

    if (typeof msg.st === "number") {
      currentState = msg.st;
    } else if (msg.st === "playing" || msg.st === "arena") {
      currentState = STATE_ARENA;
    } else if (msg.st === "podium") {
      currentState = STATE_PODIUM;
    } else if (msg.st === "lobby") {
      currentState = STATE_LOBBY;
    }
    selectedMode = msg.m;
    currentRound = msg.r;
    currentWave = msg.w || 1;
    countdownTime = msg.cd;
    roundTimer = msg.rt;
    updateLobbyModeUI();
    if (msg.ts) teamScores = msg.ts;
    if (msg.psc && msg.psc.length) {
      for (var pi = 0; pi < msg.psc.length; pi++) {
        if (playersData[pi]) playersData[pi].score = msg.psc[pi];
      }
    }
    if (msg.up) hordeUpgrades = msg.up;
    roundWinner = msg.rw ? { name: msg.rw, hull: "#ffca28" } : null;
    matchWinner = msg.mw ? { name: msg.mw, hull: "#ffd700" } : null;

    // Visibilidad del lobby en cliente
    var lobbyUI = document.getElementById("lobby-ui");
    if (lobbyUI) {
      lobbyUI.style.display = (currentState === STATE_LOBBY) ? "flex" : "none";
    }

    // Controles táctiles en pantalla durante la partida en móviles/tablets
    updateTouchControlsVisibility();
    updateLobbyPermissions();

    // 1. Sincronizar barcos
    if (msg.sh) {
      var syncedSlots = {};
      for (var i = 0; i < msg.sh.length; i++) {
        var item = msg.sh[i];
        var slot = item[0];
        syncedSlots[slot] = true;
        var ship = null;
        for (var s = 0; s < activeShips.length; s++) {
          if (activeShips[s].slot === slot) {
            ship = activeShips[s];
            break;
          }
        }
        if (!ship) {
          ship = new Ship(slot, item[1], item[2], item[3]);
          activeShips.push(ship);
        }
        ship.targetX = item[1];
        ship.targetY = item[2];
        ship.targetAngle = item[3];
        if (typeof item[13] === "number") {
          ship.remoteSpeed = item[13];
        }

        var distSq = (ship.x - ship.targetX) * (ship.x - ship.targetX) + (ship.y - ship.targetY) * (ship.y - ship.targetY);
        if (distSq > 15000 || ship.x === 960) {
          ship.x = ship.targetX;
          ship.y = ship.targetY;
          ship.rotation = ship.targetAngle;
        }

        ship.health = item[4];
        ship.maxHealth = item[5];
        ship.ammo = item[6];
        ship.isAlive = (item[7] === 1);
        ship.rescueTime = item[15] || 0;
        if (ship.data) {
          ship.data.team = item[8];
          if (item[9]) ship.data.name = item[9];
          ship.data.customName = item[10] || "";
        }
        ship.isRamming = (item[11] === 1);
        if (item[12] === 1) ship.flashTimer = 0.2;
        if (typeof item[14] === "number") {
          if (ship.data) ship.data.score = item[14];
          if (playersData[slot]) playersData[slot].score = item[14];
        }
      }
      for (var shipIndex = activeShips.length - 1; shipIndex >= 0; shipIndex--) {
        if (!syncedSlots[activeShips[shipIndex].slot]) activeShips.splice(shipIndex, 1);
      }
    }

    // 2. Reutilizar las balas en la vista remota, donde solo se dibujan.
    var remoteBalls = msg.cb || [];
    for (var b = 0; b < remoteBalls.length; b++) {
      var bItem = remoteBalls[b];
      var ball = cannonballs[b];
      if (!ball) {
        cannonballs.push(new Cannonball(bItem[0], bItem[1], bItem[2], bItem[3], 0, bItem[4] === 1, 1, bItem[5]));
      } else {
        ball.x = bItem[0];
        ball.y = bItem[1];
        ball.dx = bItem[2];
        ball.dy = bItem[3];
        ball.isPirate = (bItem[4] === 1);
        ball.shooterTeam = bItem[5];
      }
    }
    cannonballs.length = remoteBalls.length;

    // 3. Sincronizar piratas reutilizando instancias para evitar basura y micro-tirones
    if (msg.pi) {
      while (pirateShips.length < msg.pi.length) {
        pirateShips.push(new PirateShip(0, 0, currentWave));
      }
      if (pirateShips.length > msg.pi.length) {
        pirateShips.length = msg.pi.length;
      }
      for (var p = 0; p < msg.pi.length; p++) {
        var pItem = msg.pi[p];
        var ps = pirateShips[p];
        ps.x = pItem[0];
        ps.y = pItem[1];
        ps.rotation = pItem[2];
        ps.health = pItem[3];
        ps.maxHealth = pItem[4];
        ps.isAlive = true;
        if (pItem[5] === 1) ps.flashTimer = 0.2;
      }
    } else {
      pirateShips = [];
    }

    // 4. Sincronizar jefe
    if (msg.bo) {
      if (!bossGalleon || bossGalleon.wave !== currentWave) {
        bossGalleon = new BossGalleon(msg.bo[0], msg.bo[1], currentWave);
      }
      bossGalleon.x = msg.bo[0];
      bossGalleon.y = msg.bo[1];
      bossGalleon.rotation = msg.bo[2];
      bossGalleon.health = msg.bo[3];
      bossGalleon.maxHealth = msg.bo[4];
      bossGalleon.isAlive = true;
      bossGalleon.warning = msg.bo[6] || 0;
      if (msg.bo[5] === 1) bossGalleon.flashTimer = 0.2;
    } else {
      bossGalleon = null;
    }

    // 5. Sincronizar cajas
    ammoCrates = [];
    hordePowerups = [];
    if (msg.cr) {
      for (var c = 0; c < msg.cr.length; c++) {
        var cItem = msg.cr[c];
        if (cItem[2] === -1) {
          ammoCrates.push(new AmmoCrate(cItem[0], cItem[1]));
        } else {
          hordePowerups.push(new HordePowerup(cItem[0], cItem[1], cItem[2]));
        }
      }
    }

    updateAllShipsHUD(); updateTeamScoresHUD(); updateHordeUpgradesHUD();
  }

  function updateRemoteClient(dt) {
    // 1. Interpolación suave de barcos
    for (var s = 0; s < activeShips.length; s++) {
      var ship = activeShips[s];

      // Barco propio en cliente remoto: control táctil responsivo sin lag
      if (ship.slot === remoteSlot && ship.isAlive) {
        if (localInputState.turn !== 0) {
          ship.rotation += localInputState.turn * 2.8 * dt;
        }
        var currentSpeed = (localInputState.thrust) ? 190 : 80;
        ship.x += Math.cos(ship.rotation) * currentSpeed * dt;
        ship.y += Math.sin(ship.rotation) * currentSpeed * dt;

        // Suave convergencia hacia la posición del anfitrión
        if (ship.targetX !== undefined) {
          ship.x += (ship.targetX - ship.x) * 0.12;
          ship.y += (ship.targetY - ship.y) * 0.12;
          var aDiffLocal = Math.atan2(Math.sin(ship.targetAngle - ship.rotation), Math.cos(ship.targetAngle - ship.rotation));
          ship.rotation += aDiffLocal * 0.10;
        }
      } else {
        // Barcos remotos: avance continuo y convergencia
        if (ship.targetX !== undefined) {
          var rSpeed = ship.remoteSpeed || 80;
          if (ship.isAlive) {
            ship.x += Math.cos(ship.rotation) * rSpeed * dt;
            ship.y += Math.sin(ship.rotation) * rSpeed * dt;
          }
          ship.x += (ship.targetX - ship.x) * 0.22;
          ship.y += (ship.targetY - ship.y) * 0.22;

          var aDiff = Math.atan2(Math.sin(ship.targetAngle - ship.rotation), Math.cos(ship.targetAngle - ship.rotation));
          ship.rotation += aDiff * 0.25;
        }
      }

      if (ship.flashTimer > 0) ship.flashTimer -= dt;
      if (ship.ramCooldown > 0) ship.ramCooldown -= dt;

      // Estela de espuma si el barco se mueve
      if (ship.isAlive && Math.random() < 0.35) {
        var rearX = ship.x - Math.cos(ship.rotation) * 26;
        var rearY = ship.y - Math.sin(ship.rotation) * 26;
        spawnWaterFoam(rearX, rearY, -Math.cos(ship.rotation), -Math.sin(ship.rotation));
      }
    }

    // 2. Partículas
    for (var pt = particles.length - 1; pt >= 0; pt--) {
      var p = particles[pt];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) {
        particles[pt] = particles[particles.length - 1];
        particles.pop();
      }
    }

    // 3. Textos flotantes
    for (var ft = floatingTexts.length - 1; ft >= 0; ft--) {
      var fText = floatingTexts[ft];
      fText.y -= dt * 30;
      fText.life -= dt;
      if (fText.life <= 0) {
        floatingTexts.splice(ft, 1);
      }
    }

    // 4. Enviar inputs locales al anfitrión
    sendLocalInputsToHost();
  }

  function ensureLocalPlayer() {
    if (isRemoteClient) return -1;
    if (localPlayerSlot !== -1) return localPlayerSlot;
    // El naranja queda disponible para el primer mando que se conecte por QR.
    for (var i = 1; i < playersData.length; i++) {
      if (!playersData[i].connected && !playersData[i].uuid) {
        localPlayerSlot = i;
        playersData[i].connected = true;
        playersData[i].ready = true;
        updateLobbyShips();
        if (currentState === STATE_ARENA && !activeShips.some(function (ship) { return ship.slot === i; })) {
          activeShips.push(new Ship(i, 960, 800, -Math.PI / 2));
        }
        updateLocalPlayerButton();
        return i;
      }
    }
    return -1;
  }

  function updateLocalPlayerButton() {
    var button = document.getElementById("btn-local-player");
    if (!button) return;
    button.style.display = isRemoteClient ? "none" : "";
    button.disabled = localPlayerSlot !== -1;
    if (localPlayerSlot !== -1) {
      button.textContent = "JUGANDO AQUÍ · " + playersData[localPlayerSlot].name;
      button.style.borderColor = playersData[localPlayerSlot].hull;
    }
  }

  var touchState = { left: false, right: false, thrust: false, shoot: false };

  function updateLocalInputValues(immediate) {
    var turn = 0;
    var left = keyState.left || touchState.left;
    var right = keyState.right || touchState.right;
    if (left && !right) turn = -1.0;
    else if (right && !left) turn = 1.0;

    localInputState.turn = turn;
    localInputState.thrust = keyState.thrust || touchState.thrust;
    localInputState.shoot = keyState.shoot || touchState.shoot;

    if (isRemoteClient) {
      sendLocalInputsToHost(immediate);
    } else {
      if (localInputState.turn || localInputState.thrust || localInputState.shoot) ensureLocalPlayer();
      // El anfitrión solo puede conducir el barco asignado a esta pantalla.
      var localShip = null;
      for (var s = 0; s < activeShips.length; s++) {
        var sh = activeShips[s];
        if (sh && sh.isAlive && sh.slot === localPlayerSlot) {
          localShip = sh;
          break;
        }
      }
      if (localShip) {
        localShip.turnInput = localInputState.turn;
        localShip.thrustInput = localInputState.thrust;
        localShip.shootInput = localInputState.shoot;
      }
    }
  }

  function releaseLocalInputs() {
    keyState.left = false;
    keyState.right = false;
    keyState.thrust = false;
    keyState.shoot = false;
    touchState.left = false;
    touchState.right = false;
    touchState.thrust = false;
    touchState.shoot = false;
    updateLocalInputValues(true);
  }

  function sendLocalInputsToHost(immediate) {
    if (!isRemoteClient || !window.CloudNet || !window.CloudNet.isConnected()) return;

    var now = Date.now();
    var changed = (Math.abs(localInputState.turn - lastSentLocalInput.turn) > 0.05) ||
                  (localInputState.thrust !== lastSentLocalInput.thrust) ||
                  (localInputState.shoot !== lastSentLocalInput.shoot);

    // Si cambió el input (girar, acelerar, disparar): enviar de inmediato con throttle máx 60ms
    // Si NO cambió: enviar solo un latido cada 350ms (~3 Hz) para mantener viva la sesión sin saturar la red
    if (!immediate && now - lastInputSendTime < (changed ? 60 : 350)) return;

    lastSentLocalInput.turn = localInputState.turn;
    lastSentLocalInput.thrust = localInputState.thrust;
    lastSentLocalInput.shoot = localInputState.shoot;
    lastInputSendTime = now;

    window.CloudNet.sendToHost({
      type: "input",
      uuid: myPlayerUUID,
      turn: localInputState.turn,
      thrust: localInputState.thrust,
      shoot: localInputState.shoot
    });
  }

  function handleClientIncomingMessage(topic, msg) {
    if (!msg || !msg.type) return;

    if (msg.type === "init") {
      stopClientJoinRetry();
      remoteSlot = msg.slot;
      if (typeof msg.mode === "number") selectedMode = msg.mode;
      if (typeof msg.state === "number") currentState = msg.state;
      updateLobbyPermissions();
      var slotBadge = document.getElementById("remote-player-slot");
      if (slotBadge) {
        var profile = PLAYER_PROFILES[remoteSlot] || {};
        slotBadge.textContent = "BARCO " + (remoteSlot + 1) + " (" + (profile.name || "Capitán") + ")";
        slotBadge.style.backgroundColor = msg.hull || profile.hull || "#1e3a50";
      }

      // Re-sincronizar apodo guardado
      try {
        var savedName = window.localStorage.getItem("barquitos_nickname");
        if (savedName) {
          myCustomNickname = savedName;
          var inp = document.getElementById("remote-nickname-input");
          if (inp) inp.value = savedName;
          if (window.CloudNet && window.CloudNet.isConnected()) {
            window.CloudNet.sendToHost({
              type: "set_name",
              uuid: myPlayerUUID,
              name: savedName
            });
          }
        }
      } catch(e){}

      // Re-sincronizar equipo guardado
      try {
        var savedTeam = window.localStorage.getItem("barquitos_team");
        if (savedTeam === "red" || savedTeam === "blue") {
          mySelectedTeam = savedTeam;
          if (window.CloudNet && window.CloudNet.isConnected()) {
            window.CloudNet.sendToHost({
              type: "set_team",
              uuid: myPlayerUUID,
              slot: remoteSlot,
              team: mySelectedTeam
            });
          }
          updateRemoteTeamUI();
        }
      } catch(e){}

    } else if (msg.type === "team_confirmed") {
      if (msg.team) {
        mySelectedTeam = msg.team;
        updateRemoteTeamUI();
      }
    } else if (msg.type === "mode_change") {
      selectedMode = msg.mode;
      updateLobbyModeUI();
      updateRemoteTeamVisibility();
    } else if (msg.type === "state_change") {
      if (typeof msg.state === "number") {
        currentState = msg.state;
      } else if (msg.state === "playing" || msg.state === "arena") {
        currentState = STATE_ARENA;
      } else if (msg.state === "podium") {
        currentState = STATE_PODIUM;
      } else if (msg.state === "lobby") {
        currentState = STATE_LOBBY;
      }
      var lobbyUI = document.getElementById("lobby-ui");
      if (lobbyUI) {
        lobbyUI.style.display = (currentState === STATE_LOBBY) ? "flex" : "none";
      }
    } else if (msg.type === "sync") {
      applyClientSync(msg);
    } else if (msg.type === "powerup") {
      Sound.playPowerup();
      if (window.navigator && window.navigator.vibrate) {
        try { window.navigator.vibrate([70, 50, 70]); } catch(e){}
      }
    } else if (msg.type === "vibrate") {
      if (window.navigator && window.navigator.vibrate) {
        try { window.navigator.vibrate(msg.duration || 80); } catch(e){}
      }
    }
  }

  function updateRemoteTeamUI() {
    var btnB = document.getElementById("remote-btn-blue");
    var btnR = document.getElementById("remote-btn-red");
    if (btnB) btnB.className = "remote-team-btn blue" + (mySelectedTeam === "blue" ? " active" : "");
    if (btnR) btnR.className = "remote-team-btn red" + (mySelectedTeam === "red" ? " active" : "");
  }

  function updateRemoteTeamVisibility() {
    var toggleBox = document.getElementById("remote-team-toggle");
    if (toggleBox) {
      toggleBox.style.display = (selectedMode === MODE_TEAMS) ? "flex" : "none";
    }
  }

  function isTouchDevice() {
    return (("ontouchstart" in window) || !!(window.navigator && (window.navigator.maxTouchPoints > 0 || window.navigator.msMaxTouchPoints > 0)));
  }

  function updateTouchControlsVisibility() {
    var touchControls = document.getElementById("onscreen-touch-controls");
    if (!touchControls) return;
    var playerSlot = isRemoteClient ? remoteSlot : localPlayerSlot;
    var visible = currentState === STATE_ARENA && isTouchDevice() && playerSlot !== -1;
    if (!visible && touchControls.style.display === "flex") releaseTouchControls();
    touchControls.style.display = visible ? "flex" : "none";
    var badge = document.getElementById("touch-player-label");
    if (badge && playerSlot !== -1 && playersData[playerSlot]) {
      badge.textContent = playersData[playerSlot].customName || playersData[playerSlot].name;
      badge.style.color = playersData[playerSlot].hull;
    }
  }

  // Prevención de doble toque para hacer zoom en móviles y tablets
  (function preventMobileDoubleTapZoom() {
    var lastTouchEnd = 0;
    document.addEventListener("touchend", function(e) {
      var now = Date.now();
      if (now - lastTouchEnd <= 320) {
        if (e.cancelable) e.preventDefault();
      }
      lastTouchEnd = now;
    }, { passive: false });

    // Evitar gestos de zoom involuntario
    document.addEventListener("gesturestart", function(e) {
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    document.addEventListener("gesturechange", function(e) {
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    document.addEventListener("gestureend", function(e) {
      if (e.cancelable) e.preventDefault();
    }, { passive: false });

    // Evitar dblclick que provoca saltos de zoom en navegadores móviles
    document.addEventListener("dblclick", function(e) {
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
  })();

  function setupFullscreenButton() {
    var fsBtn = document.getElementById("btn-fullscreen-toggle");
    if (!fsBtn) return;
    var fsIcon = document.getElementById("fs-icon");
    var fsLabel = fsBtn.querySelector ? fsBtn.querySelector(".fs-label") : (document.querySelector ? document.querySelector("#btn-fullscreen-toggle .fs-label") : null);

    function isFullscreen() {
      return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
    }

    function updateFsState() {
      if (isFullscreen()) {
        if (fsBtn.classList && fsBtn.classList.add) fsBtn.classList.add("is-fullscreen");
        if (fsIcon) fsIcon.textContent = "🗗";
        if (fsLabel) fsLabel.textContent = "SALIR PANTALLA";
      } else {
        if (fsBtn.classList && fsBtn.classList.remove) fsBtn.classList.remove("is-fullscreen");
        if (fsIcon) fsIcon.textContent = "⛶";
        if (fsLabel) fsLabel.textContent = "PANTALLA COMPLETA";
      }
    }

    function toggleFullscreen(e) {
      if (e) {
        if (e.cancelable) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
      }
      try {
        if (!isFullscreen()) {
          var root = document.documentElement;
          if (root.requestFullscreen) {
            root.requestFullscreen().catch(function(err){ console.warn("FS error:", err); });
          } else if (root.webkitRequestFullscreen) {
            root.webkitRequestFullscreen();
          } else if (root.mozRequestFullScreen) {
            root.mozRequestFullScreen();
          } else if (root.msRequestFullscreen) {
            root.msRequestFullscreen();
          }
        } else {
          if (document.exitFullscreen) {
            document.exitFullscreen().catch(function(err){ console.warn("Exit FS error:", err); });
          } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
          } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
          } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
          }
        }
      } catch (err) {
        console.warn("Fullscreen toggle failed:", err);
      }
      setTimeout(updateFsState, 150);
    }

    fsBtn.addEventListener("click", toggleFullscreen, false);
    fsBtn.addEventListener("touchend", function(e) {
      toggleFullscreen(e);
    }, { passive: false });

    document.addEventListener("fullscreenchange", updateFsState, false);
    document.addEventListener("webkitfullscreenchange", updateFsState, false);
    document.addEventListener("mozfullscreenchange", updateFsState, false);
    document.addEventListener("MSFullscreenChange", updateFsState, false);

    updateFsState();
  }

  function setupOnscreenControls() {
    var joystick = document.getElementById("touch-joystick");
    var btnThrust = document.getElementById("touch-thrust");
    var btnShoot = document.getElementById("touch-shoot");

    function bindBtn(el, prop) {
      if (!el) return;
      var activeId = null;
      var knob = prop ? null : el.querySelector(".joystick-knob");

      function move(id, x) {
        if (prop || activeId !== id) return;
        var bounds = el.getBoundingClientRect();
        var limit = Math.max(12, (bounds.width - 48) / 2);
        var offset = Math.max(-limit, Math.min(limit, x - bounds.left - bounds.width / 2));
        if (knob) knob.style.transform = "translate(calc(-50% + " + offset + "px), -50%)";
        var left = offset < -8;
        var right = offset > 8;
        if (touchState.left === left && touchState.right === right) return;
        touchState.left = left;
        touchState.right = right;
        updateLocalInputValues(true);
      }

      function press(id, e, x) {
        if (activeId !== null || currentState !== STATE_ARENA) return;
        if (e.cancelable) e.preventDefault();
        activeId = id;
        el.classList.add("pressed");
        if (prop) {
          touchState[prop] = true;
          updateLocalInputValues(true);
        } else {
          move(id, x);
        }
      }

      function release(id, e) {
        if (activeId !== id) return;
        if (e && e.cancelable) e.preventDefault();
        activeId = null;
        el.classList.remove("pressed");
        if (prop) {
          touchState[prop] = false;
        } else {
          touchState.left = false;
          touchState.right = false;
          if (knob) knob.style.transform = "";
        }
        updateLocalInputValues(true);
      }

      if (window.PointerEvent) {
        el.addEventListener("pointerdown", function (e) {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          press(e.pointerId, e, e.clientX);
          if (activeId === e.pointerId && el.setPointerCapture) {
            try { el.setPointerCapture(e.pointerId); } catch (errCapture) {}
          }
        }, false);
        if (!prop) el.addEventListener("pointermove", function (e) { move(e.pointerId, e.clientX); }, false);
        function releasePointer(e) { release(e.pointerId, e); }
        el.addEventListener("pointerup", releasePointer, false);
        el.addEventListener("pointercancel", releasePointer, false);
        el.addEventListener("lostpointercapture", releasePointer, false);
      } else {
        el.addEventListener("touchstart", function (e) {
          if (e.changedTouches.length) press(e.changedTouches[0].identifier, e, e.changedTouches[0].clientX);
        }, { passive: false });
        if (!prop) el.addEventListener("touchmove", function (e) {
          for (var i = 0; i < e.changedTouches.length; i++) {
            var finger = e.changedTouches[i];
            move(finger.identifier, finger.clientX);
          }
        }, { passive: false });
        function releaseTouch(e) {
          for (var i = 0; i < e.changedTouches.length; i++) {
            release(e.changedTouches[i].identifier, e);
          }
        }
        el.addEventListener("touchend", releaseTouch, { passive: false });
        el.addEventListener("touchcancel", releaseTouch, { passive: false });
        el.addEventListener("mousedown", function (e) { if (e.button === 0) press("mouse", e, e.clientX); }, false);
        if (!prop) el.addEventListener("mousemove", function (e) { move("mouse", e.clientX); }, false);
        el.addEventListener("mouseup", function (e) { release("mouse", e); }, false);
        el.addEventListener("mouseleave", function (e) { release("mouse", e); }, false);
      }

      // Una pérdida de foco puede ocurrir sin pointerup ni touchend.
      el.releaseInput = function () { release(activeId); };
    }

    bindBtn(joystick);
    bindBtn(btnThrust, "thrust");
    bindBtn(btnShoot, "shoot");

    function releaseControls() {
      releaseLocalInputs();
      var buttons = [joystick, btnThrust, btnShoot];
      for (var i = 0; i < buttons.length; i++) {
        if (buttons[i] && buttons[i].releaseInput) buttons[i].releaseInput();
      }
    }

    releaseTouchControls = releaseControls;
    window.addEventListener("blur", releaseControls, false);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) releaseControls();
    }, false);
    updateTouchControlsVisibility();
  }

  var clientJoinRetryTimer = null;
  var clientJoinRetryCount = 0;
  function startClientJoinRetry() {
    stopClientJoinRetry();
    if (remoteSlot !== -1) return;
    clientJoinRetryCount = 0;
    var slotBadge = document.getElementById("remote-player-slot");
    if (slotBadge && remoteSlot === -1) {
      slotBadge.textContent = "Buscando anfitrión...";
      slotBadge.style.backgroundColor = "#d97706";
    }
    clientJoinRetryTimer = setInterval(function () {
      if (remoteSlot !== -1 || !window.CloudNet || !window.CloudNet.isConnected()) {
        stopClientJoinRetry();
        return;
      }
      clientJoinRetryCount++;
      console.log("[Online] Reintentando envío de solicitud join a sala:", currentRoomCode, "intento:", clientJoinRetryCount);
      window.CloudNet.sendToHost({
        type: "join",
        uuid: myPlayerUUID,
        name: myCustomNickname,
        team: mySelectedTeam
      });

      if (clientJoinRetryCount >= 4 && remoteSlot === -1) {
        var sb = document.getElementById("remote-player-slot");
        if (sb) {
          sb.textContent = "Esperando al anfitrión de sala " + currentRoomCode + "...";
          sb.style.backgroundColor = "#b91c1c";
        }
        var helpBox = document.getElementById("remote-waiting-help");
        if (helpBox) {
          helpBox.style.display = "inline-flex";
        }
      }
    }, 1500);
  }

  function stopClientJoinRetry() {
    if (clientJoinRetryTimer) {
      clearInterval(clientJoinRetryTimer);
      clientJoinRetryTimer = null;
    }
    clientJoinRetryCount = 0;
    var helpBox = document.getElementById("remote-waiting-help");
    if (helpBox) {
      helpBox.style.display = "none";
    }
  }

  // Conexión CloudNet (Soporta Anfitrión y Jugador Remoto Online)
  function connectCloudNet() {
    var joinCode = getQueryParam("sala") || getQueryParam("join");
    var updateStatusUI = function(status, msg) {
      var stLabel = document.getElementById("cloud-status") || document.getElementById("server-status");
      if (stLabel) {
        if (status === "online" || status === "connected") {
          var bHost = (window.CloudNet && window.CloudNet.getCurrentBrokerHost) ? window.CloudNet.getCurrentBrokerHost() : "";
          stLabel.className = "status-tag online";
          stLabel.textContent = "● CONECTADO A LA NUBE" + (bHost ? " (" + bHost + ")" : "");
        } else if (status === "offline" || status === "error") {
          stLabel.className = "status-tag offline";
          stLabel.textContent = "○ " + (msg || "DESCONECTADO").toUpperCase();
        } else {
          stLabel.className = "status-tag connecting";
          stLabel.textContent = msg || "Conectando a la nube...";
        }
      }
    };

    if (joinCode) {
      // ---------------- MODO CLIENTE ONLINE (Jugador Remoto) ----------------
      isRemoteClient = true;
      currentRoomCode = joinCode.toUpperCase();
      myPlayerUUID = getOrCreateUUID();

      console.log("[Online] Uniéndose a sala remota:", currentRoomCode);

      var roomDisplay = document.getElementById("room-code-text") || document.getElementById("room-code-display");
      if (roomDisplay) roomDisplay.textContent = currentRoomCode;

      // Ocultar controles exclusivos del anfitrión y tarjeta QR en cliente
      updateLobbyPermissions();
      updateLocalPlayerButton();
      var qrCard = document.querySelector(".qr-card");
      if (qrCard) {
        qrCard.style.display = "none";
      }

      var remoteBar = document.getElementById("remote-player-bar");
      if (remoteBar) {
        var rRoom = document.getElementById("remote-player-room");
        if (rRoom) rRoom.textContent = "Sala: " + currentRoomCode;
      }

      setupRemotePlayerBarEvents();

      if (window.CloudNet) {
        window.CloudNet.initClient(currentRoomCode, myPlayerUUID, {
          onReady: function() {
            console.log("[Online] Cliente conectado a la sala:", currentRoomCode);
            updateStatusUI("online", "Conectado a la sala " + currentRoomCode);

            // Si ya teníamos slot asignado, re-sincronizar de inmediato sin perder el barco
            if (remoteSlot !== -1) {
              window.CloudNet.sendToHost({
                type: "rejoin",
                uuid: myPlayerUUID,
                slot: remoteSlot,
                name: myCustomNickname,
                team: mySelectedTeam
              });
            } else {
              window.CloudNet.sendToHost({
                type: "join",
                uuid: myPlayerUUID,
                name: myCustomNickname,
                team: mySelectedTeam
              });
              startClientJoinRetry();
            }
          },
          onStatus: function(status, msg) {
            updateStatusUI(status, msg);
            if (status !== "online" && status !== "connected") {
              releaseLocalInputs();
              stopClientJoinRetry();
            }
          },
          onMessage: function(topic, msg) {
            handleClientIncomingMessage(topic, msg);
          }
        });
      }
    } else {
      // ---------------- MODO ANFITRIÓN (Host / Pantalla Grande) ----------------
      isRemoteClient = false;
      updateLocalPlayerButton();
      if (!currentRoomCode) {
        currentRoomCode = generateRoomCode();
      }
      currentRoomCode = currentRoomCode.trim().toUpperCase();

      var roomDisp = document.getElementById("room-code-text") || document.getElementById("room-code-display");
      if (roomDisp) roomDisp.textContent = currentRoomCode;
      generateLobbyQR();
      setupInviteButtons();

      if (window.CloudNet) {
        window.CloudNet.initHost(currentRoomCode, {
          onReady: function() {
            console.log("[TV] Host iniciado en sala:", currentRoomCode);
            var rd = document.getElementById("room-code-text") || document.getElementById("room-code-display");
            if (rd) rd.textContent = currentRoomCode;
            updateStatusUI("online");
            generateLobbyQR();
            setupInviteButtons();
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
  }

  function setupRemotePlayerBarEvents() {
    var inpNick = document.getElementById("remote-nickname-input");
    if (inpNick) {
      try {
        var sNick = window.localStorage.getItem("barquitos_nickname") || "";
        if (sNick) {
          myCustomNickname = sNick;
          inpNick.value = sNick;
        }
      } catch(e){}

      function syncNick() {
        var val = (inpNick.value || "").trim().substr(0, 12);
        myCustomNickname = val;
        try { window.localStorage.setItem("barquitos_nickname", val); } catch(e){}
        if (window.CloudNet && window.CloudNet.isConnected()) {
          window.CloudNet.sendToHost({
            type: "set_name",
            uuid: myPlayerUUID,
            name: val
          });
        }
      }
      inpNick.addEventListener("input", syncNick, false);
      inpNick.addEventListener("change", syncNick, false);
    }

    var btnBlue = document.getElementById("remote-btn-blue");
    var btnRed = document.getElementById("remote-btn-red");
    function chooseTeam(team) {
      mySelectedTeam = team;
      try { window.localStorage.setItem("barquitos_team", team); } catch(e){}
      updateRemoteTeamUI();
      if (window.CloudNet && window.CloudNet.isConnected()) {
        window.CloudNet.sendToHost({
          type: "set_team",
          uuid: myPlayerUUID,
          slot: remoteSlot,
          team: team
        });
      }
    }
    if (btnBlue) {
      btnBlue.onclick = function() { chooseTeam("blue"); };
    }
    if (btnRed) {
      btnRed.onclick = function() { chooseTeam("red"); };
    }

    var btnReady = document.getElementById("remote-btn-ready");
    if (btnReady) {
      btnReady.onclick = function() {
        isClientReady = !isClientReady;
        btnReady.className = "remote-ready-btn" + (isClientReady ? " active" : "");
        btnReady.textContent = isClientReady ? "LISTO ✓" : "PREPARARSE";
        if (window.CloudNet && window.CloudNet.isConnected()) {
          window.CloudNet.sendToHost({
            type: "ready",
            uuid: myPlayerUUID,
            ready: isClientReady
          });
        }
      };
    }

    var btnBecomeHost = document.getElementById("btn-become-host");
    if (btnBecomeHost) {
      btnBecomeHost.onclick = function() {
        window.location.href = window.location.pathname;
      };
    }

    var btnOpenCtl = document.getElementById("btn-open-controller-quick");
    if (btnOpenCtl) {
      btnOpenCtl.onclick = function() {
        window.location.href = "controller.html?room=" + encodeURIComponent(currentRoomCode);
      };
    }
  }

  function setupInviteButtons() {
    var baseHref = window.location.href.split("?")[0].split("#")[0];
    if (baseHref.indexOf("/controller.html") !== -1) {
      baseHref = baseHref.replace("/controller.html", "/index.html");
    }
    var onlineInviteUrl = baseHref + "?sala=" + currentRoomCode;

    var btnCopy = document.getElementById("btn-copy-invite");
    var btnWa = document.getElementById("btn-whatsapp-share");
    var copyFeed = document.getElementById("copy-feedback");

    if (btnWa) {
      var waMsg = "¡Únete a mi batalla naval en BARQUITOS! ⛵💣\nEntra a este enlace para jugar juntos: " + onlineInviteUrl + "\n(Código de sala: " + currentRoomCode + ")";
      btnWa.href = "https://api.whatsapp.com/send?text=" + encodeURIComponent(waMsg);
    }

    if (btnCopy) {
      btnCopy.onclick = function (e) {
        if (e && e.preventDefault) e.preventDefault();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(onlineInviteUrl);
        } else {
          var temp = document.createElement("textarea");
          temp.value = onlineInviteUrl;
          document.body.appendChild(temp);
          temp.select();
          try { document.execCommand("copy"); } catch(eCopy){}
          document.body.removeChild(temp);
        }
        if (copyFeed) {
          copyFeed.style.display = "block";
          setTimeout(function () {
            copyFeed.style.display = "none";
          }, 3500);
        }
      };
    }

    var btnOpenJoin = document.getElementById("btn-open-join-modal");
    var joinModal = document.getElementById("join-modal");
    var btnConfirmJoin = document.getElementById("btn-confirm-join");
    var btnJoinCtl = document.getElementById("btn-join-controller");
    var btnCancelJoin = document.getElementById("btn-cancel-join");
    var inputJoinRoom = document.getElementById("input-join-room");
    var inputJoinName = document.getElementById("input-join-name");

    if (btnOpenJoin && joinModal) {
      btnOpenJoin.onclick = function () {
        joinModal.style.display = "flex";
        if (inputJoinRoom) {
          inputJoinRoom.value = "";
          inputJoinRoom.focus();
        }
      };
    }

    if (btnCancelJoin && joinModal) {
      btnCancelJoin.onclick = function () {
        joinModal.style.display = "none";
      };
    }

    function doJoin(asController) {
      var codeVal = (inputJoinRoom.value || "").trim().toUpperCase();
      if (codeVal.length >= 3) {
        var nameVal = (inputJoinName ? inputJoinName.value : "").trim();
        if (nameVal) {
          try { window.localStorage.setItem("barquitos_nickname", nameVal); } catch(e){}
        }
        if (asController) {
          window.location.href = "controller.html?room=" + encodeURIComponent(codeVal);
        } else {
          window.location.href = "index.html?sala=" + encodeURIComponent(codeVal);
        }
      } else {
        alert("Por favor ingresa un código de sala válido de 4 letras");
      }
    }

    if (btnConfirmJoin && joinModal && inputJoinRoom) {
      btnConfirmJoin.onclick = function () {
        doJoin(false);
      };
    }

    if (btnJoinCtl && joinModal && inputJoinRoom) {
      btnJoinCtl.onclick = function () {
        doJoin(true);
      };
    }
  }

  function handleIncomingMessage(msg) {
    if (!msg || !msg.type) return;

    if (msg.type === "join" || msg.type === "rejoin") {
      var uuid = msg.uuid;
      if (!uuid) return;

      var slot = -1;
      if (uuidToSlot[uuid] !== undefined) {
        slot = uuidToSlot[uuid];
      }

      if (slot === -1) {
        // El primer mando ocupa el naranja. La pantalla local usa otro puesto.
        for (var s = 0; s < playersData.length; s++) {
          if (!playersData[s].uuid && !playersData[s].connected) {
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

      // Si la partida ya está en curso (STATE_ARENA), asegurarse de que el barco exista en activeShips
      if (currentState === STATE_ARENA) {
        var shipExists = false;
        for (var as = 0; as < activeShips.length; as++) {
          if (activeShips[as].slot === slot) {
            shipExists = true;
            break;
          }
        }
        if (!shipExists) {
          var spawnAng = Math.random() * Math.PI * 2;
          var spawn = getSafeSpawnPoint(currentBounds, 34);
          var newS = new Ship(slot, spawn.x, spawn.y, spawnAng);
          activeShips.push(newS);
        }
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
          mode: selectedMode,
          state: currentState
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
        if (window.CloudNet && playersData[tSlot] && playersData[tSlot].uuid) {
          window.CloudNet.sendToPlayer(playersData[tSlot].uuid, { type: "team_confirmed", team: tm });
        }
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
            activeShips[sh].turnInput = typeof msg.turn === "number" ? msg.turn : (typeof msg.t === "number" ? msg.t : 0);
            activeShips[sh].thrustInput = !!(msg.thrust || msg.th);
            activeShips[sh].shootInput = !!(msg.shoot || msg.sh);
            activeShips[sh].inputExpiresAt = Date.now() + REMOTE_INPUT_TIMEOUT_MS;
            break;
          }
        }
      }
    } else if (msg.type === "host_action") {
      if (!msg.uuid || msg.uuid !== playersData[0].uuid) return;
      if (currentState !== STATE_LOBBY && currentState !== STATE_PODIUM) return;
      if (msg.action === "start") {
        startNewMatch();
      } else if (msg.action === "lobby") {
        requestLobbyAction("lobby");
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
      if (!currentRoomCode || currentRoomCode === "----") return;
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

      window.drawQRCodeToCanvas(qrCanvas, controllerUrl, 230);
      var matchQR = document.getElementById("match-qr-canvas");
      if (matchQR) window.drawQRCodeToCanvas(matchQR, controllerUrl, 230);

      var urlLabel = document.getElementById("url-text");
      if (urlLabel) urlLabel.textContent = controllerUrl;

      var ctlLink = document.querySelector(".controller-link");
      if (ctlLink) {
        ctlLink.href = "controller.html?room=" + currentRoomCode;
      }
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
    if (!dt || dt < 0.001 || isNaN(dt)) dt = 0.016;
    else if (dt > 0.1) dt = 0.1;
    lastTime = time;

    try {
      update(dt);
      render(dt);
    } catch (err) {
      if (window.console && window.console.error) {
        window.console.error("[Barquitos Game Loop Error]", err);
      }
    }

    window.requestAnimationFrame(gameLoop);
  }

  // Los clientes renuevan sus controles aproximadamente cada 350 ms.
  var REMOTE_INPUT_TIMEOUT_MS = 1500;

  function expireRemoteInputs(now) {
    for (var i = 0; i < activeShips.length; i++) {
      var ship = activeShips[i];
      if (ship.inputExpiresAt && now >= ship.inputExpiresAt) {
        ship.turnInput = 0;
        ship.thrustInput = false;
        ship.shootInput = false;
        ship.inputExpiresAt = 0;
      }
    }
  }

  function update(dt) {
    waveAnim += dt;
    if (shakeTimer > 0) {
      shakeTimer -= dt;
      if (shakeTimer < 0) shakeTimer = 0;
    }

    if (isRemoteClient) {
      updateRemoteClient(dt);
      return;
    }

    // Modo Anfitrión: Física y Reglas del Juego
    expireRemoteInputs(Date.now());
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

    // Difusión del estado del mundo a jugadores online remotos.
    broadcastGameState();
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

      // Colisión con islas (descarte rápido AABB + deslizamiento tangencial suave sin vibraciones)
      for (var i = 0; i < islands.length; i++) {
        var isl = islands[i];
        var dX = ship.x - isl.x;
        var dY = ship.y - isl.y;
        var minDist = isl.rad + 20;
        if (Math.abs(dX) > minDist || Math.abs(dY) > minDist) continue;
        var distSq = dX * dX + dY * dY;
        if (distSq < minDist * minDist) {
          var dist = Math.sqrt(distSq) || 1;
          var nx = dX / dist;
          var ny = dY / dist;
          ship.x = isl.x + nx * (minDist + 0.5);
          ship.y = isl.y + ny * (minDist + 0.5);
          var vDotN = ship.vx * nx + ship.vy * ny;
          if (vDotN < 0) {
            ship.vx -= vDotN * nx * 1.1;
            ship.vy -= vDotN * ny * 1.1;
          }
          if (ship.isRamming) {
            ship.isRamming = false;
            Sound.playIslandThud();
            spawnIslandImpactParticles(ship.x, ship.y);
          }
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

      // Colisión de proyectil con islas (descarte rápido AABB + distancia al cuadrado)
      var hitIsland = false;
      for (var ii = 0; ii < islands.length; ii++) {
        var isObj = islands[ii];
        var idX = ball.x - isObj.x;
        var idY = ball.y - isObj.y;
        var hitDist = isObj.rad + 5;
        if (Math.abs(idX) > hitDist || Math.abs(idY) > hitDist) continue;
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
          spawnHullSplinters(ball.x, ball.y, ball.dx, ball.dy);
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
      var pt = getSafeSpawnPoint(currentBounds, 40);
      ammoCrates.push(new AmmoCrate(pt.x, pt.y));
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

  function updateRescues(dt) {
    for (var i = 0; i < activeShips.length; i++) {
      var fallen = activeShips[i];
      if (fallen.isAlive) continue;
      var nearby = activeShips.some(function (ally) {
        if (!ally.isAlive) return false;
        var dx = ally.x - fallen.x;
        var dy = ally.y - fallen.y;
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
        addFloatingText("¡RESCATADO!", fallen.x, fallen.y - 25, "#86ffaf", 26);
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

    updateRescues(dt);

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
              if (playersData[ship.slot]) {
                playersData[ship.slot].score += 25;
                updateShipHUD(ship.slot);
              }
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
            if (playersData[ship.slot]) {
              playersData[ship.slot].score += 50;
              updateShipHUD(ship.slot);
            }
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
            pirShip.applyHit(cpnX, cpnY, 380, 0.5, pShip.slot);
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
            bossGalleon.applyHit(bgnX, bgnY, 80, 0.5, pShip.slot);
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
            spawnHullSplinters(ball.x, ball.y, ball.dx, ball.dy);
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
            spawnHullSplinters(ball.x, ball.y, ball.dx, ball.dy);
            pir.applyHit(ball.dx, ball.dy, 460, ball.damage, ball.shooterSlot);
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
            spawnHullSplinters(ball.x, ball.y, ball.dx, ball.dy);
            bossGalleon.applyHit(ball.dx, ball.dy, 120, ball.damage, ball.shooterSlot);
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
      var ammoSpawn = getSafeSpawnPoint(currentBounds, 36);
      ammoCrates.push(new AmmoCrate(ammoSpawn.x, ammoSpawn.y));
    }

    // Fin de oleada: todos los piratas y jefe muertos (Éxito de ronda)
    if (waveEnemiesToSpawn === 0 && pirateShips.length === 0 && (!bossGalleon || !bossGalleon.isAlive)) {
      if (waveIntermissionTimer === 0) {
        addFloatingText("🏆 ¡OLEADA " + currentWave + " COMPLETADA! 🏆", 960, 330, "#00e676", 46);
        addFloatingText("💚 ¡SALUD AL MÁXIMO RESTAURADA!", 960, 390, "#76ff03", 34);
        Sound.playPowerup();

        // Bonificación de puntos por sobrevivir la oleada para todos los aliados
        var waveBonus = currentWave * 200;
        for (var hs = 0; hs < activeShips.length; hs++) {
          var aShip = activeShips[hs];
          if (playersData[aShip.slot]) {
            playersData[aShip.slot].score += waveBonus;
            updateShipHUD(aShip.slot);
          }
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
    var sorted = [];
    for (var i = 0; i < playersData.length; i++) {
      if (playersData[i].connected) sorted.push(playersData[i]);
    }
    if (sorted.length === 0) sorted = [playersData[0], playersData[1]];
    sorted.sort(function(a, b) { return b.score - a.score; });
    matchWinner = sorted[0];
    Sound.playFanfare();
    spawnConfetti(90);
    sendTvAction("state_change", null, STATE_PODIUM);
  }

  // RENDERIZADO (Optimizado a 60 FPS)
  function render(dt) {
    var remoteBar = document.getElementById("remote-player-bar");
    if (remoteBar) {
      var display = isRemoteClient && currentState === STATE_LOBBY ? "flex" : "none";
      if (remoteBar.style.display !== display) remoteBar.style.display = display;
    }
    updateTouchControlsVisibility();
    updatePodiumActions();
    var matchInvite = document.getElementById("match-invite");
    if (matchInvite) matchInvite.hidden = isRemoteClient || currentState !== STATE_ARENA || !currentRoomCode || !window.drawQRCodeToCanvas;
    ctx.save();
    ctx.fillStyle = "#142557";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

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
    var waiting = needsMorePlayers();
    var startButton = document.getElementById("btn-start-game");
    if (startButton) startButton.disabled = waiting || (isRemoteClient && remoteSlot !== 0);
    var notice = document.getElementById("start-player-notice");
    if (notice) notice.hidden = !waiting;
    // Fondo del lobby
    var grad = ctx.createLinearGradient(0, 0, 0, V_HEIGHT);
    grad.addColorStop(0, "#2476d9");
    grad.addColorStop(1, "#372798");
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


  // Pre-renderizado de alta velocidad del océano e islas (OffscreenCanvas)
  var mapOffscreenCanvas = null;
  var mapOffscreenCtx = null;

  function initMapOffscreen() {
    if (!mapOffscreenCanvas) {
      if (typeof OffscreenCanvas !== "undefined") {
        try {
          mapOffscreenCanvas = new OffscreenCanvas(V_WIDTH, V_HEIGHT);
        } catch (e) {
          mapOffscreenCanvas = document.createElement("canvas");
          mapOffscreenCanvas.width = V_WIDTH;
          mapOffscreenCanvas.height = V_HEIGHT;
        }
      } else {
        mapOffscreenCanvas = document.createElement("canvas");
        mapOffscreenCanvas.width = V_WIDTH;
        mapOffscreenCanvas.height = V_HEIGHT;
      }
      mapOffscreenCtx = mapOffscreenCanvas.getContext("2d");
    }

    if (!mapOffscreenCtx) return;

    // 1. Océano base
    var grad = mapOffscreenCtx.createLinearGradient(0, 0, 0, V_HEIGHT);
    grad.addColorStop(0, "#29c4ef");
    grad.addColorStop(1, "#176bd8");
    mapOffscreenCtx.fillStyle = grad;
    mapOffscreenCtx.fillRect(0, 0, V_WIDTH, V_HEIGHT);

    // 2. Islas hexagonales pre-renderizadas
    for (var i = 0; i < islands.length; i++) {
      renderHexIslandToCtx(mapOffscreenCtx, islands[i].x, islands[i].y, islands[i].rad);
    }

    // 3. Fondos y bordes divisorios de los paneles laterales
    var panelW = 270;
    var rightPanelX = 1650;

    var leftGrad = mapOffscreenCtx.createLinearGradient(0, 0, panelW, 0);
    leftGrad.addColorStop(0, "#142557");
    leftGrad.addColorStop(1, "#243f83");
    mapOffscreenCtx.fillStyle = leftGrad;
    mapOffscreenCtx.fillRect(0, 0, panelW, V_HEIGHT);

    mapOffscreenCtx.strokeStyle = "rgba(0, 229, 255, 0.55)";
    mapOffscreenCtx.lineWidth = 3;
    mapOffscreenCtx.beginPath();
    mapOffscreenCtx.moveTo(panelW, 0);
    mapOffscreenCtx.lineTo(panelW, V_HEIGHT);
    mapOffscreenCtx.stroke();

    mapOffscreenCtx.strokeStyle = "rgba(255, 215, 0, 0.7)";
    mapOffscreenCtx.lineWidth = 1;
    mapOffscreenCtx.beginPath();
    mapOffscreenCtx.moveTo(panelW - 2, 0);
    mapOffscreenCtx.lineTo(panelW - 2, V_HEIGHT);
    mapOffscreenCtx.stroke();

    var rightGrad = mapOffscreenCtx.createLinearGradient(rightPanelX, 0, V_WIDTH, 0);
    rightGrad.addColorStop(0, "#243f83");
    rightGrad.addColorStop(1, "#142557");
    mapOffscreenCtx.fillStyle = rightGrad;
    mapOffscreenCtx.fillRect(rightPanelX, 0, panelW, V_HEIGHT);

    mapOffscreenCtx.strokeStyle = "rgba(0, 229, 255, 0.55)";
    mapOffscreenCtx.lineWidth = 3;
    mapOffscreenCtx.beginPath();
    mapOffscreenCtx.moveTo(rightPanelX, 0);
    mapOffscreenCtx.lineTo(rightPanelX, V_HEIGHT);
    mapOffscreenCtx.stroke();

    mapOffscreenCtx.strokeStyle = "rgba(255, 215, 0, 0.7)";
    mapOffscreenCtx.lineWidth = 1;
    mapOffscreenCtx.beginPath();
    mapOffscreenCtx.moveTo(rightPanelX + 2, 0);
    mapOffscreenCtx.lineTo(rightPanelX + 2, V_HEIGHT);
    mapOffscreenCtx.stroke();

    // 4. Borde delimitador de la arena central
    mapOffscreenCtx.strokeStyle = "rgba(0, 229, 255, 0.35)";
    mapOffscreenCtx.lineWidth = 2.5;
    mapOffscreenCtx.strokeRect(arenaBounds.x, arenaBounds.y, arenaBounds.w, arenaBounds.h);
  }

  function renderHexIslandToCtx(c, cx, cy, radius) {
    var shallows = c.createRadialGradient(cx, cy, radius * 0.7, cx, cy, radius * 1.95);
    shallows.addColorStop(0, "rgba(87,255,209,0.92)");
    shallows.addColorStop(1, "rgba(87,255,209,0)");
    c.fillStyle = shallows;
    c.fillRect(cx - radius * 2, cy - radius * 2, radius * 4, radius * 4);
    drawHexagon(c, cx, cy + 6, radius + 4, "rgba(4, 18, 30, 0.45)", null);
    drawHexagon(c, cx, cy, radius, "#ffe283", "#e29b42", 4);
    drawHexagon(c, cx, cy, radius - 8, "#ffc65a", null);
    drawHexagon(c, cx, cy, radius - 16, "#52cb54", "#218957", 3);
    drawHexagon(c, cx, cy, radius - 28, "#218957", null);
    drawHexagon(c, cx, cy, radius - 38, "#b8e4ee", "#578bb0", 2);
  }

  function renderArena(dt) {
    setLobbyUIVisible(false);

    // 1. Dibujar mapa base e islas pre-renderizadas en una sola llamada ultrarrápida
    if (!mapOffscreenCanvas) initMapOffscreen();
    if (mapOffscreenCanvas) {
      ctx.drawImage(mapOffscreenCanvas, 0, 0);
    } else {
      var grad = ctx.createLinearGradient(0, 0, 0, V_HEIGHT);
      grad.addColorStop(0, "#29c4ef");
      grad.addColorStop(1, "#176bd8");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);
      for (var i = 0; i < islands.length; i++) {
        renderHexIsland(islands[i].x, islands[i].y, islands[i].rad);
      }
    }

    // 2. Olas animadas sobre el mar (limitadas al océano central navegable, 50% menos cálculos trigonométricos)
    ctx.strokeStyle = "rgba(233, 252, 255, 0.26)";
    ctx.lineWidth = 1.8;
    for (var wy = 70; wy < V_HEIGHT; wy += 90) {
      ctx.beginPath();
      for (var wx = 280; wx <= 1640; wx += 45) {
        var offY = Math.sin((wx * 0.01) + (waveAnim * 2.2) + wy) * 7;
        if (wx === 280) ctx.moveTo(wx, wy + offY);
        else ctx.lineTo(wx, wy + offY);
      }
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(224,255,255,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var glint = 0; glint < 22; glint++) {
      var gx = 325 + (glint * 173) % 1240;
      var gy = 76 + (glint * 113) % 920 + Math.sin(waveAnim * 2 + glint) * 10;
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + 22 + Math.sin(waveAnim + glint) * 11, gy);
    }
    ctx.stroke();

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
    drawHexagon(ctx, cx, cy, radius, "#ffe283", "#e29b42", 4);
    // Césped interior
    drawHexagon(ctx, cx, cy, radius * 0.72, "#75e363", "#52cb54", 3);
    // Rocas centrales
    drawHexagon(ctx, cx, cy, radius * 0.34, "#b8e4ee", "#578bb0", 2);
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
    var cardH = 61;

    // Fondos laterales y bordes pre-renderizados en mapOffscreenCanvas (cero repintado redundante)

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

    ctx.font = "bold 14px sans-serif";
    ctx.fillStyle = "#ff9eaa";
    ctx.fillText("Vida " + Math.max(0, curHealth) + "/" + curMaxHealth, x + 12, y + 46);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffe587";
    ctx.fillText("Balas " + curAmmo + "/" + curMaxAmmo, x + w - 12, y + 46);
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

  }

  // Control remoto Tizen / Teclado PC / Controles de Navegación y Combate
  window.addEventListener("keydown", function(e) {
    var k = e.keyCode;
    if (currentState === STATE_PODIUM && (!isRemoteClient || remoteSlot === 0)) {
      if (k === 37 || k === 39) {
        podiumSelectedBtn = k === 37 ? 0 : 1;
        var button = document.getElementById(podiumSelectedBtn === 0 ? "btn-play-again" : "btn-back-lobby");
        if (button) button.focus();
        e.preventDefault();
      } else if ((k === 13 || k === 32) && (!e.target || e.target.tagName !== "BUTTON")) {
        e.preventDefault();
        requestLobbyAction(podiumSelectedBtn === 0 ? "start" : "lobby");
      }
      return;
    }
    if (isRemoteClient && currentState !== STATE_ARENA) {
      if (k === 13) requestLobbyAction("start");
      else if (k === 37 || k === 39) requestLobbyAction("set_mode", (selectedMode + (k === 37 ? 2 : 1)) % 3);
      return;
    }

    if (k === 77) { // Tecla M: Mute
      Sound.toggleMute();
      return;
    }

    if (currentState === STATE_LOBBY && !isRemoteClient) {
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

    }

    // Controles de juego en teclado para PC (Anfitrión o Cliente Online)
    var isPlaying = (currentState === STATE_ARENA);
    if (k === 37 || k === 65) { // ◄ / A: Girar Babor
      keyState.left = true;
      if (isPlaying) updateLocalInputValues();
    }
    if (k === 39 || k === 68) { // ► / D: Girar Estribor
      keyState.right = true;
      if (isPlaying) updateLocalInputValues();
    }
    if (k === 38 || k === 87) { // ▲ / W: Desplegar Velas / Impulso
      keyState.thrust = true;
      if (isPlaying) updateLocalInputValues();
    }
    if (k === 32 || k === 74) { // Espacio / J: Disparar Cañón
      keyState.shoot = true;
      if (isPlaying) updateLocalInputValues();
    }
    if (k === 16 || k === 75) { // Shift / K: Turbo / Embestida con Espolón
      keyState.thrust = true;
      if (isPlaying) updateLocalInputValues();
    }
  }, false);

  window.addEventListener("keyup", function(e) {
    var k = e.keyCode;
    var isPlaying = (currentState === STATE_ARENA);

    if (k === 37 || k === 65) {
      keyState.left = false;
      if (isPlaying) updateLocalInputValues();
    }
    if (k === 39 || k === 68) {
      keyState.right = false;
      if (isPlaying) updateLocalInputValues();
    }
    if (k === 38 || k === 87) {
      keyState.thrust = false;
      if (isPlaying) updateLocalInputValues();
    }
    if (k === 32 || k === 74) {
      keyState.shoot = false;
      if (isPlaying) updateLocalInputValues();
    }
    if (k === 16 || k === 75) {
      keyState.thrust = false;
      if (isPlaying) updateLocalInputValues();
    }
  }, false);

  function updateLobbyModeUI() {
    var b1 = document.getElementById("btn-mode-battle");
    var b2 = document.getElementById("btn-mode-teams");
    var b3 = document.getElementById("btn-mode-horde");
    if (b1) b1.className = (selectedMode === MODE_BATTLE) ? "mode-btn active" : "mode-btn";
    if (b2) b2.className = (selectedMode === MODE_TEAMS) ? "mode-btn active" : "mode-btn";
    if (b3) b3.className = (selectedMode === MODE_HORDE) ? "mode-btn active" : "mode-btn";
  }

  function resizeCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    scale = Math.min(canvas.width / V_WIDTH, canvas.height / V_HEIGHT);
    offsetX = (canvas.width - V_WIDTH * scale) / 2;
    offsetY = (canvas.height - V_HEIGHT * scale) / 2;
    if (currentState === STATE_ARENA) {
      var panelW = 270;
      var pL = document.getElementById("hud-panel-left");
      var pR = document.getElementById("hud-panel-right");
      if (pL) {
        pL.style.left = offsetX + "px";
        pL.style.top = offsetY + "px";
        pL.style.transform = "scale(" + scale + ")";
      }
      if (pR) {
        pR.style.left = (offsetX + (V_WIDTH - panelW) * scale) + "px";
        pR.style.top = offsetY + "px";
        pR.style.transform = "scale(" + scale + ")";
      }
    }
  }

  window.addEventListener("resize", resizeCanvas, false);

  function updateLobbyPermissions() {
    var canManage = !isRemoteClient || remoteSlot === 0;
    var start = document.getElementById("btn-start-game");
    if (start) {
      start.style.display = canManage ? "" : "none";
      start.disabled = !canManage;
    }
    var ids = ["btn-mode-battle", "btn-mode-teams", "btn-mode-horde"];
    for (var i = 0; i < ids.length; i++) {
      var modeButton = document.getElementById(ids[i]);
      if (modeButton) modeButton.disabled = !canManage;
    }
  }

  function requestLobbyAction(action, mode) {
    if (currentState !== STATE_LOBBY && currentState !== STATE_PODIUM) return;
    if (isRemoteClient) {
      if (remoteSlot !== 0 || !window.CloudNet) return;
      window.CloudNet.sendToHost({ type: "host_action", uuid: myPlayerUUID, action: action, mode: mode });
    } else if (action === "start") {
      startNewMatch();
    } else if (action === "set_mode") {
      selectedMode = mode;
      updateLobbyModeUI();
      broadcastCurrentMode();
    } else if (action === "lobby") {
      releaseLocalInputs();
      currentState = STATE_LOBBY;
      updateLobbyShips();
      sendTvAction("state_change", null, STATE_LOBBY);
    }
  }

  function updatePodiumActions() {
    var panel = document.getElementById("podium-actions");
    if (panel) panel.style.display = currentState === STATE_PODIUM && (!isRemoteClient || remoteSlot === 0) ? "flex" : "none";
  }

  function bindLobbyButtons() {
    var localButton = document.getElementById("btn-local-player");
    if (localButton) localButton.addEventListener("click", function () { ensureLocalPlayer(); }, false);
    var playAgain = document.getElementById("btn-play-again");
    if (playAgain) playAgain.addEventListener("click", function () { requestLobbyAction("start"); }, false);
    var backToLobby = document.getElementById("btn-back-lobby");
    if (backToLobby) backToLobby.addEventListener("click", function () { requestLobbyAction("lobby"); }, false);
    var bBattle = document.getElementById("btn-mode-battle");
    var bTeams = document.getElementById("btn-mode-teams");
    var bHorde = document.getElementById("btn-mode-horde");
    var bStart = document.getElementById("btn-start-game");

    function setupModeBtn(btn, modeVal) {
      if (!btn) return;
      var lastTap = 0;
      function setModeAction(e) {
        var now = Date.now();
        if (now - lastTap < 300) return;
        lastTap = now;
        if (e && e.preventDefault) e.preventDefault();
        requestLobbyAction("set_mode", modeVal);
      }
      btn.addEventListener("pointerup", setModeAction, false);
      btn.addEventListener("click", setModeAction, false);
    }

    setupModeBtn(bBattle, MODE_BATTLE);
    setupModeBtn(bTeams, MODE_TEAMS);
    setupModeBtn(bHorde, MODE_HORDE);

    if (bStart) {
      var lastStartTap = 0;
      function triggerStart(e) {
        var now = Date.now();
        if (now - lastStartTap < 400) return;
        lastStartTap = now;
        if (e && e.preventDefault) e.preventDefault();
        requestLobbyAction("start");
      }
      bStart.addEventListener("pointerup", triggerStart, false);
      bStart.addEventListener("click", triggerStart, false);
    }
  }

  var isEngineInitialized = false;
  function initEngine() {
    if (isEngineInitialized) return;
    canvas = document.getElementById("game-canvas");
    if (!canvas) return;
    ctx = canvas.getContext("2d");
    if (!ctx) return;
    isEngineInitialized = true;

    elLobbyUI = document.getElementById("lobby-ui");
    resizeCanvas();
    initArenaIslands();

    // Generar código de sala inmediatamente para que nunca muestre ----
    if (!currentRoomCode && !getQueryParam("sala") && !getQueryParam("join")) {
      currentRoomCode = generateRoomCode();
      var roomDisp = document.getElementById("room-code-text") || document.getElementById("room-code-display");
      if (roomDisp) roomDisp.textContent = currentRoomCode;
      generateLobbyQR();
      setupInviteButtons();
    }

    connectCloudNet();
    setupFullscreenButton();
    setupOnscreenControls();
    bindLobbyButtons();

    window.requestAnimationFrame(gameLoop);
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(initEngine, 1);
  } else {
    window.addEventListener("DOMContentLoaded", initEngine, false);
    window.addEventListener("load", initEngine, false);
  }
  window.onload = initEngine;

  window.BarquitosGame = {
    startRound: startRoundByMode,
    startNewMatch: startNewMatch,
    setMode: function(m) {
      selectedMode = m;
      updateLobbyModeUI();
      broadcastCurrentMode();
    }
  };

})(window);

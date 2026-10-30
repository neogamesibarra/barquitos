// game_engine.js - Motor de juego 100% HTML5 Canvas 2D en JavaScript ES5 estricto.
// Compatible con navegadores WebKit de Smart TVs Samsung Tizen del año 2015.
(function(window) {
  var canvas, ctx;
  var V_WIDTH = 1920;
  var V_HEIGHT = 1080;
  var scale = 1;
  var offsetX = 0;
  var offsetY = 0;

  var STATE_LOBBY = 0;
  var STATE_ARENA = 1;
  var STATE_CRUISE = 2;
  var STATE_PODIUM = 3;

  var MODE_BATTLE = 0;
  var MODE_CRUISE = 1;

  var currentState = STATE_LOBBY;
  var selectedMode = MODE_BATTLE;

  var currentRoomCode = "";
  var uuidToSlot = {};
  var PLAYER_PROFILES = [
    { slot: 0, name: "Tofe (Naranja)", hull: "#E67E22", sail: "#FFF8E7", stripe: "#2ECC71", symbol: "circle", uuid: "", connected: false, ready: false, score: 0 },
    { slot: 1, name: "Nobu (Azul)", hull: "#1E60D5", sail: "#82B1FF", stripe: "#0D47A1", symbol: "square", uuid: "", connected: false, ready: false, score: 0 },
    { slot: 2, name: "Taka (Magenta)", hull: "#D81B60", sail: "#FF80AB", stripe: "#FFD600", symbol: "triangle", uuid: "", connected: false, ready: false, score: 0 },
    { slot: 3, name: "Waba (Verde)", hull: "#43A047", sail: "#B9F6CA", stripe: "#1B5E20", symbol: "diamond", uuid: "", connected: false, ready: false, score: 0 },
    { slot: 4, name: "Miki (Amarillo)", hull: "#FDD835", sail: "#FFFDE7", stripe: "#F57F17", symbol: "star", uuid: "", connected: false, ready: false, score: 0 },
    { slot: 5, name: "Lico (Rosa)", hull: "#FF80AB", sail: "#FCE4EC", stripe: "#C51162", symbol: "heart", uuid: "", connected: false, ready: false, score: 0 },
    { slot: 6, name: "Pita (Negro)", hull: "#261C1A", sail: "#FFCA28", stripe: "#111111", symbol: "crown", uuid: "", connected: false, ready: false, score: 0 },
    { slot: 7, name: "Naru (Rojo)", hull: "#E53935", sail: "#FFCDD2", stripe: "#00ACC1", symbol: "bolt", uuid: "", connected: false, ready: false, score: 0 }
  ];

  var playersData = [];
  for (var pi = 0; pi < 8; pi++) {
    playersData.push(JSON.parse(JSON.stringify(PLAYER_PROFILES[pi])));
  }

  var activeShips = [];
  var cannonballs = [];
  var ammoCrates = [];
  var particles = [];
  var islands = [];
  var checkpoints = [];

  var countdownTime = 3.8;
  var lastCountdownStep = -1;
  var roundTimer = 0;
  var suddenDeathActive = false;
  var arenaBounds = { x: 90, y: 80, w: 1740, h: 920 };
  var currentBounds = { x: 90, y: 80, w: 1740, h: 920 };

  var cruiseCameraY = 540;
  var cruiseScrollSpeed = 135;
  var finishLineY = -4600;

  var waveAnim = 0;
  var roundWinner = null;
  var roundOverTimer = 0;

  var isBirthdayVisible = false;
  var birthdayPulse = 0;

  var podiumAnimTimer = 0;
  var podiumSelectedBtn = 0; // 0: Jugar Otra Vez, 1: Lobby

  // Utilidad para hexágonos regulares
  function getHexPoints(cx, cy, radius) {
    var pts = [];
    for (var i = 0; i < 6; i++) {
      var angle = (Math.PI * 2 / 6) * i - (Math.PI / 6);
      pts.push({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius
      });
    }
    return pts;
  }

  function drawPolygon(pts, fillCol, strokeCol, strokeW) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
    if (fillCol) {
      ctx.fillStyle = fillCol;
      ctx.fill();
    }
    if (strokeCol) {
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = strokeW || 2;
      ctx.stroke();
    }
  }

  // Clase Barco (Constructor ES5)
  function Ship(slot, x, y, rot) {
    this.slot = slot;
    this.data = playersData[slot] || {};
    this.x = x || 960;
    this.y = y || 540;
    this.rotation = rot !== undefined ? rot : 0;
    this.vx = 0;
    this.vy = 0;
    this.ammo = 3;
    this.boost = 1.0;
    this.isAlive = true;
    this.stunTimer = 0;
    this.spinVel = 0;
    this.shootCooldown = 0;
    this.flashTimer = 0;
    this.isRamming = false;

    this.turnInput = 0;
    this.thrustInput = false;
    this.shootInput = false;
  }

  Ship.prototype.update = function(dt) {
    if (!this.isAlive) return;

    if (this.stunTimer > 0) this.stunTimer -= dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
    if (this.flashTimer > 0) this.flashTimer -= dt;

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

    var targetSpeed = 80; // deriva ligera
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

    // Disparos
    if (this.shootInput && this.shootCooldown <= 0 && this.ammo > 0 && this.stunTimer <= 0) {
      this.ammo--;
      this.shootCooldown = 0.45;
      this.shootInput = false;

      this.vx -= fwdX * 180;
      this.vy -= fwdY * 180;

      SoundSynth.playCannon();
      var bX = this.x + fwdX * 32;
      var bY = this.y + fwdY * 32;
      cannonballs.push(new Cannonball(bX, bY, fwdX, fwdY, this.slot));
      spawnMuzzleFlash(bX, bY, this.rotation);
      sendTvAction('vibrate', this.slot, 60);
    }

    // Estela de burbujas en popa
    if (Math.sqrt(this.vx * this.vx + this.vy * this.vy) > 40) {
      if (Math.random() < 0.45) {
        particles.push({
          x: this.x - fwdX * 24 + (Math.random() - 0.5) * 8,
          y: this.y - fwdY * 24 + (Math.random() - 0.5) * 8,
          vx: -fwdX * 15 + (Math.random() - 0.5) * 10,
          vy: -fwdY * 15 + (Math.random() - 0.5) * 10,
          radius: 2 + Math.random() * 3,
          color: 'rgba(255, 255, 255, 0.75)',
          life: 0.6,
          maxLife: 0.6
        });
      }
    }
  };

  Ship.prototype.applyHit = function(dirX, dirY, force) {
    if (!this.isAlive) return;
    SoundSynth.playHit();
    var finalForce = (this.ammo === 0) ? force * 2.0 : force;
    this.vx += dirX * finalForce;
    this.vy += dirY * finalForce;
    this.stunTimer = 0.4;
    this.spinVel = (Math.random() - 0.5) * 28;
    this.flashTimer = 0.18;
    sendTvAction('vibrate', this.slot, 120);
  };

  Ship.prototype.applyRam = function(dirX, dirY, force) {
    if (!this.isAlive) return;
    SoundSynth.playHit();
    this.vx += dirX * force;
    this.vy += dirY * force;
    this.stunTimer = 0.3;
    this.spinVel = (Math.random() - 0.5) * 18;
    this.flashTimer = 0.15;
    sendTvAction('vibrate', this.slot, 90);
  };

  Ship.prototype.collectAmmo = function() {
    if (!this.isAlive || this.ammo >= 3) return false;
    this.ammo = Math.min(3, this.ammo + 1);
    SoundSynth.playPickup();
    sendTvAction('vibrate', this.slot, 40);
    return true;
  };

  Ship.prototype.die = function() {
    if (!this.isAlive) return;
    this.isAlive = false;
    SoundSynth.playSplash();
    sendTvAction('vibrate', this.slot, 300);

    // Explosión de partículas con el color del barco
    for (var i = 0; i < 40; i++) {
      var spd = 60 + Math.random() * 220;
      var ang = Math.random() * Math.PI * 2;
      particles.push({
        x: this.x,
        y: this.y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        radius: 3 + Math.random() * 6,
        color: this.data.hull || '#ff2222',
        life: 0.8,
        maxLife: 0.8
      });
    }
  };

  Ship.prototype.draw = function(c) {
    if (!this.isAlive) return;
    c.save();
    c.translate(this.x, this.y);
    c.rotate(this.rotation);

    var hullCol = this.flashTimer > 0 ? '#ffffff' : this.data.hull;
    var sailCol = this.flashTimer > 0 ? '#ffffff' : this.data.sail;
    var stripeCol = this.flashTimer > 0 ? '#ffffff' : this.data.stripe;
    var outlineCol = '#1c1c24';

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

    // 2. Cañones laterales oscuros
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

    // 4. Símbolo geométrico en cubierta (x = -10, y = 0)
    drawSymbolOnDeck(c, -10, 0, this.data.symbol, stripeCol, outlineCol);

    // 5. Pips de munición en cubierta
    var ammoYs = [-6, 0, 6];
    for (var a = 0; a < 3; a++) {
      c.beginPath();
      c.arc(-19, ammoYs[a], 2.4, 0, Math.PI * 2);
      if (this.ammo > a) {
        c.fillStyle = '#ffea00';
        c.fill();
        c.strokeStyle = '#ffffff';
        c.lineWidth = 1;
        c.stroke();
      } else {
        c.strokeStyle = 'rgba(30, 30, 40, 0.7)';
        c.lineWidth = 1.2;
        c.stroke();
      }
    }

    // 6. Medidor de boost
    if (this.boost < 0.98) {
      c.beginPath();
      c.arc(-24, 0, 9, -Math.PI * 0.5, -Math.PI * 0.5 + this.boost * Math.PI);
      c.strokeStyle = this.boost < 0.2 ? 'rgba(255, 60, 20, 0.9)' : 'rgba(0, 220, 255, 0.9)';
      c.lineWidth = 2.5;
      c.stroke();
    }

    c.restore();
  };

  function drawSymbolOnDeck(c, x, y, type, col, outline) {
    c.fillStyle = col;
    c.strokeStyle = outline;
    c.lineWidth = 1.5;
    if (type === 'circle') {
      c.beginPath();
      c.arc(x, y, 4.5, 0, Math.PI * 2);
      c.fill(); c.stroke();
    } else if (type === 'square') {
      c.fillRect(x - 4, y - 4, 8, 8);
      c.strokeRect(x - 4, y - 4, 8, 8);
    } else if (type === 'triangle') {
      c.beginPath();
      c.moveTo(x, y - 5); c.lineTo(x + 5, y + 4); c.lineTo(x - 5, y + 4);
      c.closePath(); c.fill(); c.stroke();
    } else if (type === 'diamond') {
      c.beginPath();
      c.moveTo(x, y - 6); c.lineTo(x + 5, y); c.lineTo(x, y + 6); c.lineTo(x - 5, y);
      c.closePath(); c.fill(); c.stroke();
    } else if (type === 'star') {
      c.lineWidth = 2.4;
      c.beginPath();
      c.moveTo(x, y - 5); c.lineTo(x, y + 5);
      c.moveTo(x - 5, y); c.lineTo(x + 5, y);
      c.stroke();
    } else if (type === 'heart') {
      c.beginPath();
      c.arc(x - 2, y - 2, 2.5, 0, Math.PI * 2);
      c.arc(x + 2, y - 2, 2.5, 0, Math.PI * 2);
      c.fill();
    } else if (type === 'crown') {
      c.beginPath();
      c.moveTo(x - 4, y + 4); c.lineTo(x - 4, y - 2); c.lineTo(x - 2, y + 1);
      c.lineTo(x, y - 4); c.lineTo(x + 2, y + 1); c.lineTo(x + 4, y - 2);
      c.lineTo(x + 4, y + 4);
      c.closePath(); c.fill();
    } else { // bolt
      c.beginPath();
      c.moveTo(x - 2, y - 5); c.lineTo(x + 1, y - 1); c.lineTo(x - 2, y + 1); c.lineTo(x + 2, y + 5);
      c.lineWidth = 2.2; c.stroke();
    }
  }

  // Clase Bala de Cañón
  function Cannonball(x, y, dx, dy, shooterSlot) {
    this.x = x;
    this.y = y;
    this.dx = dx;
    this.dy = dy;
    this.shooterSlot = shooterSlot;
    this.dist = 0;
    this.maxDist = 520;
    this.speed = 680;
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
    c.arc(this.x, this.y, 6, 0, Math.PI * 2);
    c.fillStyle = '#1c1c22';
    c.fill();
    c.strokeStyle = '#686a74';
    c.lineWidth = 1.5;
    c.stroke();

    // brillo
    c.beginPath();
    c.arc(this.x - 2, this.y - 2, 1.8, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255, 255, 255, 0.8)';
    c.fill();
  };

  // Cajas de munición flotantes
  function AmmoCrate(x, y) {
    this.x = x;
    this.baseY = y;
    this.y = y;
    this.time = Math.random() * 5;
    this.isCollected = false;
  }

  AmmoCrate.prototype.update = function(dt) {
    this.time += dt;
    this.y = this.baseY + Math.sin(this.time * 2.8) * 4;
  };

  AmmoCrate.prototype.draw = function(c) {
    c.save();
    c.translate(this.x, this.y);
    c.rotate(Math.sin(this.time * 1.8) * 0.08);

    // Onda en agua
    c.beginPath();
    c.arc(0, 0, 16 + Math.sin(this.time * 3) * 3, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(200, 240, 255, 0.25)';
    c.lineWidth = 1.5;
    c.stroke();

    // Caja de madera
    c.fillStyle = '#b06f38';
    c.fillRect(-11, -11, 22, 22);

    // Tablones y marco
    c.strokeStyle = '#5a3416';
    c.lineWidth = 1.8;
    c.strokeRect(-11, -11, 22, 22);

    c.beginPath();
    c.moveTo(-11, -4); c.lineTo(11, -4);
    c.moveTo(-11, 4); c.lineTo(11, 4);
    c.moveTo(-9, -9); c.lineTo(9, 9);
    c.moveTo(-9, 9); c.lineTo(9, -9);
    c.stroke();

    // Icono dorado de bala
    c.beginPath();
    c.arc(0, 0, 3.5, 0, Math.PI * 2);
    c.fillStyle = '#ffea00';
    c.fill();

    c.restore();
  };

  function spawnSplash(x, y) {
    for (var i = 0; i < 16; i++) {
      var spd = 30 + Math.random() * 80;
      var ang = Math.random() * Math.PI * 2;
      particles.push({
        x: x, y: y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        radius: 2 + Math.random() * 3,
        color: 'rgba(210, 245, 255, 0.7)',
        life: 0.45, maxLife: 0.45
      });
    }
  }

  function spawnMuzzleFlash(x, y, rot) {
    for (var i = 0; i < 10; i++) {
      var spd = 60 + Math.random() * 120;
      var ang = rot + (Math.random() - 0.5) * 0.6;
      particles.push({
        x: x, y: y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        radius: 3 + Math.random() * 4,
        color: '#ffea40',
        life: 0.18, maxLife: 0.18
      });
    }
  }

  function spawnConfetti(count) {
    count = count || 60;
    var colors = ['#E67E22', '#1E60D5', '#D81B60', '#43A047', '#FDD835', '#FF80AB', '#00E5FF', '#FF2A2A'];
    for (var i = 0; i < count; i++) {
      var x = 200 + Math.random() * 1520;
      particles.push({
        x: x,
        y: 1040,
        vx: (Math.random() - 0.5) * 350,
        vy: -400 - Math.random() * 450,
        radius: 5 + Math.random() * 7,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 2.5,
        maxLife: 2.5,
        gravity: 300
      });
    }
  }

  function sendTvAction(action, slot, val) {
    if (window.CloudNet && window.CloudNet.isConnected()) {
      if (action === 'vibrate') {
        for (var i = 0; i < playersData.length; i++) {
          if (playersData[i].slot === slot && playersData[i].uuid) {
            window.CloudNet.sendToPlayer(playersData[i].uuid, { type: 'vibrate', duration: val || 80 });
            break;
          }
        }
      } else if (action === 'state_change') {
        window.CloudNet.broadcast({ type: 'state_change', state: val });
      }
    }
  }

  // Configuración de Islas Hexagonales
  function initArenaIslands() {
    islands = [
      { x: 960, y: 540, rad: 75 },
      { x: 500, y: 340, rad: 58 },
      { x: 1420, y: 740, rad: 58 },
      { x: 500, y: 740, rad: 52 },
      { x: 1420, y: 340, rad: 52 }
    ];
  }

  function initCruiseCourse() {
    islands = [];
    checkpoints = [];
    ammoCrates = [];

    var currY = 100;
    while (currY > finishLineY + 300) {
      currY -= 360 + Math.random() * 80;

      if (Math.abs(currY) % 850 < 420) {
        checkpoints.push({ y: currY, passed: false, color: 'rgba(255, 255, 255, 0.45)' });
      }

      var pat = Math.floor(Math.random() * 4);
      if (pat === 0) {
        islands.push({ x: 480, y: currY, rad: 65 });
        islands.push({ x: 1440, y: currY, rad: 65 });
        ammoCrates.push(new AmmoCrate(960, currY));
      } else if (pat === 1) {
        islands.push({ x: 960, y: currY, rad: 85 });
        ammoCrates.push(new AmmoCrate(580, currY));
        ammoCrates.push(new AmmoCrate(1340, currY));
      } else if (pat === 2) {
        islands.push({ x: 440, y: currY - 50, rad: 55 });
        islands.push({ x: 960, y: currY + 40, rad: 60 });
        islands.push({ x: 1480, y: currY - 50, rad: 55 });
      } else {
        islands.push({ x: 380, y: currY, rad: 45 });
        islands.push({ x: 760, y: currY, rad: 48 });
        islands.push({ x: 1160, y: currY, rad: 48 });
        islands.push({ x: 1540, y: currY, rad: 45 });
      }
    }
  }

  function startBattleRound() {
    currentState = STATE_ARENA;
    countdownTime = 3.8;
    lastCountdownStep = -1;
    roundTimer = 0;
    suddenDeathActive = false;
    currentBounds = { x: arenaBounds.x, y: arenaBounds.y, w: arenaBounds.w, h: arenaBounds.h };
    roundWinner = null;
    roundOverTimer = 0;

    initArenaIslands();
    cannonballs = [];
    ammoCrates = [];
    particles = [];

    // Colocar cajas de munición iniciales
    ammoCrates.push(new AmmoCrate(700, 540));
    ammoCrates.push(new AmmoCrate(1220, 540));

    // Instanciar barcos conectados en círculo
    activeShips = [];
    var connected = [];
    for (var i = 0; i < playersData.length; i++) {
      if (playersData[i].connected) connected.push(playersData[i]);
    }
    if (connected.length === 0) {
      connected = [playersData[0], playersData[1]]; // Fallback
    }

    var count = connected.length;
    var radius = 380;
    for (var j = 0; j < count; j++) {
      var p = connected[j];
      var angle = (Math.PI * 2 / count) * j;
      var sX = 960 + Math.cos(angle) * radius;
      var sY = 540 + Math.sin(angle) * radius;
      var ship = new Ship(p.slot, sX, sY, angle + Math.PI);
      ship.stunTimer = 3.8; // congelados en cuenta atrás
      activeShips.push(ship);
    }
  }

  function startCruiseRound() {
    currentState = STATE_CRUISE;
    countdownTime = 3.8;
    lastCountdownStep = -1;
    roundTimer = 0;
    cruiseCameraY = 540;
    cruiseScrollSpeed = 135;
    roundWinner = null;
    roundOverTimer = 0;

    initCruiseCourse();
    cannonballs = [];
    particles = [];

    activeShips = [];
    var connected = [];
    for (var i = 0; i < playersData.length; i++) {
      if (playersData[i].connected) connected.push(playersData[i]);
    }
    if (connected.length === 0) {
      connected = [playersData[0], playersData[1]];
    }

    var count = connected.length;
    var startY = 720;
    var spacing = 1400 / (count + 1);

    for (var j = 0; j < count; j++) {
      var p = connected[j];
      var sX = 260 + spacing * (j + 1);
      var ship = new Ship(p.slot, sX, startY, -Math.PI * 0.5);
      ship.stunTimer = 3.8;
      activeShips.push(ship);
    }
  }

  function startRoundByMode() {
    if (selectedMode === MODE_BATTLE) {
      startBattleRound();
    } else {
      startCruiseRound();
    }
  }

  // Generador de código de sala de 4 caracteres
  function generateRoomCode() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var code = '';
    for (var i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // Conexión CloudNet (MQTT WSS sobre Neocities / Nube)
  function connectCloudNet() {
    currentRoomCode = generateRoomCode();
    var roomEl = document.getElementById('room-code-text');
    if (roomEl) roomEl.textContent = currentRoomCode;

    // Generar el código QR de inmediato sin esperar a la red
    generateLobbyQR();

    if (window.CloudNet) {
      window.CloudNet.initHost(currentRoomCode, {
        onReady: function() {
          console.log("[TV] Anfitrión iniciado en sala:", currentRoomCode);
          generateLobbyQR();
        },
        onStatus: function(status, msg) {
          var st = document.getElementById('cloud-status');
          if (st) {
            st.textContent = msg;
            st.className = 'status-tag ' + status;
          }
        },
        onMessage: function(topic, msg) {
          handleIncomingMessage(msg);
        }
      });
    }
  }

  function handleIncomingMessage(msg) {
    if (!msg || !msg.type) return;

    if (msg.type === 'join') {
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
        if (window.CloudNet) window.CloudNet.sendToPlayer(uuid, { type: 'error', message: 'Sala llena (8 jugadores)' });
        return;
      }

      playersData[slot].connected = true;

      if (window.CloudNet) {
        window.CloudNet.sendToPlayer(uuid, {
          type: 'init',
          slot: slot,
          name: playersData[slot].name,
          hull: playersData[slot].hull,
          sail: playersData[slot].sail,
          stripe: playersData[slot].stripe,
          symbol: playersData[slot].symbol,
          ready: playersData[slot].ready
        });
      }

      updateLobbyShips();
    } else if (msg.type === 'ready') {
      var rSlot = -1;
      for (var r = 0; r < playersData.length; r++) {
        if (playersData[r].uuid === msg.uuid) {
          playersData[r].ready = !!msg.ready;
          rSlot = r;
          break;
        }
      }
      updateLobbyShips();
    } else if (msg.type === 'input') {
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
            activeShips[sh].turnInput = typeof msg.turn === 'number' ? msg.turn : 0;
            activeShips[sh].thrustInput = !!msg.thrust;
            if (msg.shoot) activeShips[sh].shootInput = true;
            break;
          }
        }
      }
    }
  }

  function generateLobbyQR() {
    var qrCanvas = document.getElementById('qr-canvas');
    if (qrCanvas && window.drawQRCodeToCanvas) {
      var href = window.location.href.split('?')[0].split('#')[0];
      var controllerUrl = href;
      if (controllerUrl.indexOf('/tv.html') !== -1) {
        controllerUrl = controllerUrl.replace('/tv.html', '/controller.html');
      } else if (controllerUrl.match(/\/tv\/?$/)) {
        controllerUrl = controllerUrl.replace(/\/tv\/?$/, '/controller.html');
      } else if (controllerUrl.indexOf('controller.html') === -1) {
        controllerUrl = controllerUrl.replace(/\/+$/, '') + '/controller.html';
      }
      controllerUrl += '?room=' + currentRoomCode;

      window.drawQRCodeToCanvas(qrCanvas, controllerUrl, 250);

      var urlLabel = document.getElementById('url-text');
      if (urlLabel) urlLabel.textContent = controllerUrl;
    }
  }

  function updateLobbyShips() {
    if (currentState !== STATE_LOBBY) return;
    // En el lobby mantenemos los barcos navegables de los jugadores conectados
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

  // Bucle Principal de Juego
  var lastTime = 0;
  function gameLoop(time) {
    if (!lastTime) lastTime = time;
    var dt = (time - lastTime) / 1000;
    if (dt > 0.1) dt = 0.1; // clamp lag
    lastTime = time;

    update(dt);
    render();

    window.requestAnimationFrame(gameLoop);
  }

  function update(dt) {
    waveAnim += dt * 1.6;

    // Actualizar partículas
    for (var p = particles.length - 1; p >= 0; p--) {
      var pt = particles[p];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.gravity) pt.vy += pt.gravity * dt;
      pt.life -= dt;
      if (pt.life <= 0) particles.splice(p, 1);
    }

    if (currentState === STATE_LOBBY) {
      for (var s = 0; s < activeShips.length; s++) {
        var ship = activeShips[s];
        ship.update(dt);
        // Rebote suave dentro del área de prueba
        if (ship.x < 100) { ship.x = 100; ship.vx *= -0.5; }
        if (ship.x > 1820) { ship.x = 1820; ship.vx *= -0.5; }
        if (ship.y < 420) { ship.y = 420; ship.vy *= -0.5; }
        if (ship.y > 860) { ship.y = 860; ship.vy *= -0.5; }
      }
      return;
    }

    if (currentState === STATE_ARENA) {
      updateBattle(dt);
    } else if (currentState === STATE_CRUISE) {
      updateCruise(dt);
    } else if (currentState === STATE_PODIUM) {
      podiumAnimTimer += dt * 2.5;
    }
  }

  function updateBattle(dt) {
    // Cuenta regresiva
    if (countdownTime > 0) {
      countdownTime -= dt;
      var step = Math.ceil(countdownTime);
      if (step !== lastCountdownStep) {
        lastCountdownStep = step;
        if (step > 0 && step <= 3) SoundSynth.playCountdown(false);
        else if (step <= 0) SoundSynth.playCountdown(true);
      }
      return;
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
        SoundSynth.playHit();
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

      // Fuera del límite letal = muere
      if (ship.x < currentBounds.x || ship.x > currentBounds.x + currentBounds.w ||
          ship.y < currentBounds.y || ship.y > currentBounds.y + currentBounds.h) {
        ship.die();
      }

      // Colisión con islas hexagonales
      for (var i = 0; i < islands.length; i++) {
        var isl = islands[i];
        var dX = ship.x - isl.x;
        var dY = ship.y - isl.y;
        var dist = Math.sqrt(dX * dX + dY * dY);
        if (dist < isl.rad + 18) {
          var nx = dX / (dist || 1);
          var ny = dY / (dist || 1);
          ship.x = isl.x + nx * (isl.rad + 18);
          ship.y = isl.y + ny * (isl.rad + 18);
          ship.vx = nx * 120;
          ship.vy = ny * 120;
          ship.applyRam(nx, ny, 140);
        }
      }

      // Colisión entre barcos
      for (var s2 = s + 1; s2 < activeShips.length; s2++) {
        var ship2 = activeShips[s2];
        if (!ship.isAlive || !ship2.isAlive) continue;
        var cDx = ship2.x - ship.x;
        var cDy = ship2.y - ship.y;
        var cDist = Math.sqrt(cDx * cDx + cDy * cDy);
        if (cDist < 36) {
          var cNx = cDx / (cDist || 1);
          var cNy = cDy / (cDist || 1);
          if (ship.isRamming) ship2.applyRam(cNx, cNy, 460);
          if (ship2.isRamming) ship.applyRam(-cNx, -cNy, 460);
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
        if (Math.sqrt(acDx * acDx + acDy * acDy) < 28) {
          if (ship.collectAmmo()) {
            ammoCrates.splice(c, 1);
          }
        }
      }
    }

    // Actualizar balas de cañón
    for (var b = cannonballs.length - 1; b >= 0; b--) {
      var ball = cannonballs[b];
      ball.update(dt);
      if (ball.isDead) {
        cannonballs.splice(b, 1);
        continue;
      }

      // Impacto en barcos
      for (var sh = 0; sh < activeShips.length; sh++) {
        var targetShip = activeShips[sh];
        if (!targetShip.isAlive || targetShip.slot === ball.shooterSlot) continue;
        var bDx = targetShip.x - ball.x;
        var bDy = targetShip.y - ball.y;
        if (Math.sqrt(bDx * bDx + bDy * bDy) < 22) {
          targetShip.applyHit(ball.dx, ball.dy, 550);
          ball.isDead = true;
          cannonballs.splice(b, 1);
          break;
        }
      }
    }

    // Actualizar cajas
    for (var cr = 0; cr < ammoCrates.length; cr++) {
      ammoCrates[cr].update(dt);
    }

    // Aparición periódica de cajas de munición
    if (Math.random() < 0.005 && ammoCrates.length < 5) {
      ammoCrates.push(new AmmoCrate(
        currentBounds.x + 80 + Math.random() * (currentBounds.w - 160),
        currentBounds.y + 80 + Math.random() * (currentBounds.h - 160)
      ));
    }

    // Comprobar ganador de la ronda
    checkBattleSurvivor();
  }

  function checkBattleSurvivor() {
    var alive = [];
    for (var i = 0; i < activeShips.length; i++) {
      if (activeShips[i].isAlive) alive.push(activeShips[i]);
    }

    if (alive.length <= 1 && !roundWinner) {
      if (alive.length === 1) {
        roundWinner = alive[0].data;
        playersData[alive[0].slot].score++;
        SoundSynth.playFanfare();
      } else {
        roundWinner = { name: "¡EMPATE!", hull: "#ffffff" };
      }
    }
  }

  function updateCruise(dt) {
    if (countdownTime > 0) {
      countdownTime -= dt;
      var step = Math.ceil(countdownTime);
      if (step !== lastCountdownStep) {
        lastCountdownStep = step;
        if (step > 0 && step <= 3) SoundSynth.playCountdown(false);
        else if (step <= 0) SoundSynth.playCountdown(true);
      }
      return;
    }

    if (roundWinner) {
      roundOverTimer += dt;
      if (roundOverTimer >= 3.5) {
        concludeRoundCheck();
      }
      return;
    }

    cruiseScrollSpeed = Math.min(230, cruiseScrollSpeed + dt * 2.2);
    cruiseCameraY -= cruiseScrollSpeed * dt;

    var camBottom = cruiseCameraY + 510;
    var bestY = 99999;
    var leaderSlot = -1;

    for (var s = 0; s < activeShips.length; s++) {
      var ship = activeShips[s];
      ship.update(dt);

      if (ship.y > camBottom || ship.x < 130 || ship.x > 1790) {
        ship.die();
      }

      if (ship.isAlive) {
        if (ship.y < bestY) {
          bestY = ship.y;
          leaderSlot = ship.slot;
        }

        // Meta final
        if (ship.y <= finishLineY) {
          roundWinner = ship.data;
          playersData[ship.slot].score++;
          SoundSynth.playFanfare();
          return;
        }
      }

      // Colisión con islas en Cruise
      for (var i = 0; i < islands.length; i++) {
        var isl = islands[i];
        if (Math.abs(isl.y - ship.y) > 120) continue;
        var dX = ship.x - isl.x;
        var dY = ship.y - isl.y;
        var dist = Math.sqrt(dX * dX + dY * dY);
        if (dist < isl.rad + 18) {
          var nx = dX / (dist || 1);
          var ny = dY / (dist || 1);
          ship.x = isl.x + nx * (isl.rad + 18);
          ship.y = isl.y + ny * (isl.rad + 18);
          ship.vx = nx * 100;
          ship.vy = ny * 100;
        }
      }

      // Colisión con cajas
      for (var c = ammoCrates.length - 1; c >= 0; c--) {
        var crate = ammoCrates[c];
        var acDx = crate.x - ship.x;
        var acDy = crate.y - ship.y;
        if (Math.sqrt(acDx * acDx + acDy * acDy) < 28) {
          if (ship.collectAmmo()) {
            ammoCrates.splice(c, 1);
          }
        }
      }
    }

    // Actualizar checkpoints
    if (leaderSlot !== -1) {
      var leadColor = playersData[leaderSlot].hull;
      for (var cp = 0; cp < checkpoints.length; cp++) {
        if (!checkpoints[cp].passed && bestY <= checkpoints[cp].y) {
          checkpoints[cp].passed = true;
          checkpoints[cp].color = leadColor;
        }
      }
    }

    // Actualizar balas de cañón
    for (var b = cannonballs.length - 1; b >= 0; b--) {
      var ball = cannonballs[b];
      ball.update(dt);
      if (ball.isDead) {
        cannonballs.splice(b, 1);
        continue;
      }
      for (var sh = 0; sh < activeShips.length; sh++) {
        var targetShip = activeShips[sh];
        if (!targetShip.isAlive || targetShip.slot === ball.shooterSlot) continue;
        var bDx = targetShip.x - ball.x;
        var bDy = targetShip.y - ball.y;
        if (Math.sqrt(bDx * bDx + bDy * bDy) < 22) {
          targetShip.applyHit(ball.dx, ball.dy, 550);
          ball.isDead = true;
          cannonballs.splice(b, 1);
          break;
        }
      }
    }

    // Comprobar supervivencia en Cruise
    var alive = [];
    for (var a = 0; a < activeShips.length; a++) {
      if (activeShips[a].isAlive) alive.push(activeShips[a]);
    }
    if (alive.length <= 1 && !roundWinner) {
      if (alive.length === 1) {
        roundWinner = alive[0].data;
        playersData[alive[0].slot].score++;
        SoundSynth.playFanfare();
      } else {
        roundWinner = { name: "¡TODOS ENCALLARON!", hull: "#ffffff" };
      }
    }
  }

  function concludeRoundCheck() {
    // Si alguien llega a 5 puntos -> Podio final
    for (var i = 0; i < playersData.length; i++) {
      if (playersData[i].score >= 5) {
        openPodiumScreen();
        return;
      }
    }
    // Si no, reiniciar siguiente ronda con el mismo modo
    startRoundByMode();
  }

  function openPodiumScreen() {
    currentState = STATE_PODIUM;
    podiumAnimTimer = 0;
    SoundSynth.playFanfare();
    spawnConfetti(90);
  }

  // RENDERIZADO EN CANVAS 2D
  function render() {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    if (currentState === STATE_LOBBY) {
      renderLobby();
    } else if (currentState === STATE_ARENA) {
      renderBattle();
    } else if (currentState === STATE_CRUISE) {
      renderCruise();
    } else if (currentState === STATE_PODIUM) {
      renderPodium();
    }

    // Renderizar siempre cumpleaños si está activo
    if (isBirthdayVisible) {
      renderBirthdayOverlay();
    }

    ctx.restore();
  }

  function renderLobby() {
    // Fondo azul Shipped
    ctx.fillStyle = '#102e4c';
    ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);

    // Área central de prueba
    ctx.fillStyle = '#24A0DE';
    ctx.fillRect(40, 395, 1840, 485);
    ctx.strokeStyle = '#2ab0f0';
    ctx.lineWidth = 3;
    ctx.strokeRect(40, 395, 1840, 485);

    // Olas animadas en área de prueba
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    for (var y = 420; y < 880; y += 65) {
      ctx.beginPath();
      for (var x = 40; x < 1880; x += 50) {
        var wy = y + Math.sin(x * 0.02 + waveAnim + y * 0.1) * 5.0;
        if (x === 40) ctx.moveTo(x, wy); else ctx.lineTo(x, wy);
      }
      ctx.stroke();
    }

    // Partículas y Barcos en el lobby
    renderParticles();
    for (var s = 0; s < activeShips.length; s++) {
      activeShips[s].draw(ctx);
    }
    for (var b = 0; b < cannonballs.length; b++) {
      cannonballs[b].draw(ctx);
    }

    // Actualizar UI del lobby HTML
    var lobbyUI = document.getElementById('lobby-ui');
    if (lobbyUI) lobbyUI.style.display = 'block';
  }

  function renderBattle() {
    var lobbyUI = document.getElementById('lobby-ui');
    if (lobbyUI) lobbyUI.style.display = 'none';

    // 1. Mar azul brillante (#24A0DE)
    ctx.fillStyle = '#24A0DE';
    ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);

    // 2. Patrón sutil de hexágonos gigantes de fondo
    renderHexPattern(0);

    // 3. Bordes laterales oscuros (#1B76A6 y #155E85)
    renderOceanEdges(0);

    // 4. Islas hexagonales concéntricas
    for (var i = 0; i < islands.length; i++) {
      renderHexIsland(islands[i].x, islands[i].y, islands[i].rad);
    }

    // 5. Cajas, balas, partículas y barcos
    for (var c = 0; c < ammoCrates.length; c++) ammoCrates[c].draw(ctx);
    for (var b = 0; b < cannonballs.length; b++) cannonballs[b].draw(ctx);
    renderParticles();
    for (var s = 0; s < activeShips.length; s++) activeShips[s].draw(ctx);

    // 6. Bordes letales con advertencia pulsante
    var pulse = 0.65 + 0.35 * Math.sin(waveAnim * 4.0);
    ctx.strokeStyle = suddenDeathActive ? 'rgba(255, 20, 20, 0.95)' : 'rgba(255, 60, 60, ' + pulse + ')';
    ctx.lineWidth = 4;
    ctx.strokeRect(currentBounds.x, currentBounds.y, currentBounds.w, currentBounds.h);

    // Abismo exterior
    ctx.fillStyle = 'rgba(8, 20, 36, 0.8)';
    ctx.fillRect(0, 0, V_WIDTH, currentBounds.y);
    ctx.fillRect(0, currentBounds.y + currentBounds.h, V_WIDTH, V_HEIGHT - (currentBounds.y + currentBounds.h));
    ctx.fillRect(0, currentBounds.y, currentBounds.x, currentBounds.h);
    ctx.fillRect(currentBounds.x + currentBounds.w, currentBounds.y, V_WIDTH - (currentBounds.x + currentBounds.w), currentBounds.h);

    // 7. HUD Marcador superior y Cuenta regresiva
    renderHUD();
  }

  function renderCruise() {
    var lobbyUI = document.getElementById('lobby-ui');
    if (lobbyUI) lobbyUI.style.display = 'none';

    ctx.save();
    ctx.translate(0, 540 - cruiseCameraY);

    // Mar azul
    ctx.fillStyle = '#24A0DE';
    ctx.fillRect(0, cruiseCameraY - 600, V_WIDTH, 1200);

    renderHexPattern(cruiseCameraY);
    renderOceanEdges(cruiseCameraY);

    // Checkpoints
    for (var cp = 0; cp < checkpoints.length; cp++) {
      var chk = checkpoints[cp];
      if (Math.abs(chk.y - cruiseCameraY) < 650) {
        ctx.strokeStyle = chk.color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(110, chk.y);
        ctx.lineTo(1810, chk.y);
        ctx.stroke();
      }
    }

    // Línea de Meta
    if (Math.abs(finishLineY - cruiseCameraY) < 650) {
      var sqSize = 30;
      for (var x = 110; x < 1810; x += sqSize) {
        var isWhite = (Math.floor(x / sqSize) % 2 === 0);
        ctx.fillStyle = isWhite ? '#ffffff' : '#111111';
        ctx.fillRect(x, finishLineY - 15, sqSize, 30);
      }
    }

    // Islas
    for (var i = 0; i < islands.length; i++) {
      if (Math.abs(islands[i].y - cruiseCameraY) < 650) {
        renderHexIsland(islands[i].x, islands[i].y, islands[i].rad);
      }
    }

    // Cajas, balas, partículas y barcos
    for (var c = 0; c < ammoCrates.length; c++) ammoCrates[c].draw(ctx);
    for (var b = 0; b < cannonballs.length; b++) cannonballs[b].draw(ctx);
    renderParticles();
    for (var s = 0; s < activeShips.length; s++) activeShips[s].draw(ctx);

    // Borde inferior letal
    var camBottom = cruiseCameraY + 510;
    ctx.strokeStyle = 'rgba(255, 50, 50, 0.9)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(110, camBottom);
    ctx.lineTo(1810, camBottom);
    ctx.stroke();

    ctx.fillStyle = 'rgba(10, 20, 40, 0.88)';
    ctx.fillRect(0, camBottom, V_WIDTH, 200);

    ctx.restore();

    renderHUD();
  }

  function renderHexPattern(centerY) {
    var hexSize = 95;
    var hDist = hexSize * 1.5;
    var vDist = hexSize * 1.732;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 2;

    var startRow = Math.floor((centerY - 650) / vDist) - 1;
    var endRow = Math.floor((centerY + 650) / vDist) + 1;

    for (var col = -1; col <= 15; col++) {
      for (var row = startRow; row <= endRow; row++) {
        var cx = col * hDist;
        var cy = row * vDist + (Math.abs(col) % 2 === 1 ? vDist * 0.5 : 0);
        var pts = getHexPoints(cx, cy, hexSize * 0.95);
        drawPolygon(pts, null, 'rgba(255, 255, 255, 0.06)', 2);
      }
    }
  }

  function renderOceanEdges(centerY) {
    ctx.fillStyle = '#1B76A6';
    ctx.fillRect(0, centerY - 600, 110, 1200);
    ctx.fillRect(1810, centerY - 600, 110, 1200);

    ctx.fillStyle = '#155E85';
    ctx.fillRect(0, centerY - 600, 60, 1200);
    ctx.fillRect(1860, centerY - 600, 60, 1200);

    // Olas
    ctx.strokeStyle = 'rgba(27, 118, 166, 0.6)';
    ctx.lineWidth = 3;
    for (var y = centerY - 600; y <= centerY + 600; y += 50) {
      var lW = 110 + Math.sin(y * 0.04 + waveAnim) * 12;
      var rW = 1810 - Math.sin(y * 0.04 + waveAnim) * 12;
      ctx.beginPath();
      ctx.moveTo(0, y); ctx.lineTo(lW, y);
      ctx.moveTo(rW, y); ctx.lineTo(1920, y);
      ctx.stroke();
    }
  }

  function renderHexIsland(x, y, rad) {
    // 1. Roca marrón (#6D5950)
    var rockPts = getHexPoints(x, y, rad);
    drawPolygon(rockPts, '#6D5950', '#45362F', 3.5);

    // 2. Anillo intermedio claro (#8D776C)
    var midPts = getHexPoints(x, y, rad * 0.78);
    drawPolygon(midPts, '#8D776C', null, 0);

    // 3. Interior verde brillante (#68D333)
    var greenPts = getHexPoints(x, y, rad * 0.54);
    drawPolygon(greenPts, '#68D333', null, 0);
  }

  function renderParticles() {
    for (var i = 0; i < particles.length; i++) {
      var pt = particles[i];
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
      ctx.fillStyle = pt.color;
      ctx.fill();
    }
  }

  function renderHUD() {
    // Marcador de tarjetas superiores
    var count = 0;
    for (var i = 0; i < playersData.length; i++) {
      if (playersData[i].connected) count++;
    }
    if (count === 0) count = 2;

    var startX = 960 - (count * 140) / 2;
    var cIdx = 0;
    for (var j = 0; j < playersData.length; j++) {
      var p = playersData[j];
      if (!p.connected && count > 2) continue;

      var x = startX + cIdx * 140;
      cIdx++;

      ctx.fillStyle = 'rgba(12, 18, 28, 0.88)';
      ctx.fillRect(x, 15, 125, 48);
      ctx.strokeStyle = p.hull;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, 15, 125, 48);

      ctx.font = 'bold 20px sans-serif';
      ctx.fillStyle = p.hull;
      ctx.fillText("⛵", x + 12, 46);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(p.score + "/5", x + 48, 47);
    }

    // Cuenta atrás
    if (countdownTime > 0) {
      var txt = "3";
      var col = "#FF2A2A";
      if (countdownTime > 2.6) { txt = "3"; col = "#FF2A2A"; }
      else if (countdownTime > 1.6) { txt = "2"; col = "#FFEA00"; }
      else if (countdownTime > 0.6) { txt = "1"; col = "#00E676"; }
      else { txt = (currentState === STATE_CRUISE) ? "¡ZARPAR!" : "¡FUEGO!"; col = "#00E5FF"; }

      ctx.font = 'bold 84px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = col;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 6;
      ctx.strokeText(txt, 960, 540);
      ctx.fillText(txt, 960, 540);
      ctx.textAlign = 'left';
    }

    // Ganador de ronda
    if (roundWinner) {
      ctx.font = 'bold 46px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = roundWinner.hull || '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 5;
      var wTxt = (roundWinner.name === '¡EMPATE!' || roundWinner.name === '¡TODOS ENCALLARON!') ?
        roundWinner.name : "¡EL BARCO " + roundWinner.name.toUpperCase() + " GANA LA RONDA!";
      ctx.strokeText(wTxt, 960, 480);
      ctx.fillText(wTxt, 960, 480);
      ctx.textAlign = 'left';
    }
  }

  function renderPodium() {
    var lobbyUI = document.getElementById('lobby-ui');
    if (lobbyUI) lobbyUI.style.display = 'none';

    // Fondo podio
    ctx.fillStyle = '#1A4B75';
    ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);

    // Ordenar jugadores de mayor a menor puntuación
    var sorted = [];
    for (var i = 0; i < playersData.length; i++) {
      if (playersData[i].connected) sorted.push(playersData[i]);
    }
    if (sorted.length === 0) sorted = [playersData[0], playersData[1]];

    sorted.sort(function(a, b) {
      return b.score - a.score;
    });

    // Título Campeón
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = sorted[0].hull;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    var champTxt = "👑 ¡" + sorted[0].name.toUpperCase() + " ES EL CAMPEÓN DEL TORNEO! 👑";
    ctx.strokeText(champTxt, 960, 110);
    ctx.fillText(champTxt, 960, 110);

    // Dibujar columnas escalonadas: 1° a la izquierda en lo más alto
    var count = sorted.length;
    var baseY = 860;
    var maxH = 500;
    var minH = 160;
    var totalW = 1560;
    var startX = 180;
    var spacing = 16;
    var colW = (totalW - spacing * (count - 1)) / count;

    for (var j = 0; j < count; j++) {
      var p = sorted[j];
      var h = (count > 1) ? (maxH - (maxH - minH) * (j / (count - 1))) : maxH;
      var colX = startX + j * (colW + spacing);
      var topY = baseY - h;

      // Columna pintada con el color del jugador
      ctx.fillStyle = p.hull;
      ctx.fillRect(colX, topY, colW, h);
      ctx.strokeStyle = '#111116';
      ctx.lineWidth = 4;
      ctx.strokeRect(colX, topY, colW, h);

      // Franja de la vela
      ctx.fillStyle = p.sail;
      ctx.fillRect(colX, topY + 12, colW, 8);

      // Puesto (1°, 2°, 3°...)
      ctx.font = 'bold ' + (j === 0 ? '48px' : '36px') + ' sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 5;
      ctx.strokeText((j + 1) + "°", colX + colW * 0.5, topY + 65);
      ctx.fillText((j + 1) + "°", colX + colW * 0.5, topY + 65);

      // Puntos
      ctx.font = 'bold 22px sans-serif';
      ctx.fillStyle = '#ffea60';
      ctx.strokeText(p.score + " PTS", colX + colW * 0.5, topY + 105);
      ctx.fillText(p.score + " PTS", colX + colW * 0.5, topY + 105);

      // Barco en la cima rotando victorioso
      ctx.save();
      ctx.translate(colX + colW * 0.5, topY - 45);
      ctx.rotate(-Math.PI * 0.5 + Math.sin(podiumAnimTimer + j) * 0.18);
      // Mini dibujo de barco
      ctx.fillStyle = p.hull;
      ctx.beginPath();
      ctx.moveTo(22, 0); ctx.lineTo(12, -11); ctx.lineTo(-18, -11); ctx.lineTo(-18, 11); ctx.lineTo(12, 11);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#111116'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = p.sail;
      ctx.beginPath(); ctx.moveTo(2, -14); ctx.lineTo(12, 0); ctx.lineTo(2, 14); ctx.lineTo(-3, 0);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    renderParticles();

    // Botones de salida del podio
    var b1X = 580;
    var b2X = 1040;
    var bY = 960;

    ctx.fillStyle = (podiumSelectedBtn === 0) ? '#00e676' : '#22384a';
    ctx.fillRect(b1X, bY, 320, 52);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = (podiumSelectedBtn === 0) ? 3 : 1;
    ctx.strokeRect(b1X, bY, 320, 52);
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = (podiumSelectedBtn === 0) ? '#062012' : '#ffffff';
    ctx.fillText("⚔ JUGAR OTRA VEZ", b1X + 160, bY + 34);

    ctx.fillStyle = (podiumSelectedBtn === 1) ? '#ffea00' : '#22384a';
    ctx.fillRect(b2X, bY, 300, 52);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = (podiumSelectedBtn === 1) ? 3 : 1;
    ctx.strokeRect(b2X, bY, 300, 52);
    ctx.fillStyle = (podiumSelectedBtn === 1) ? '#282400' : '#ffffff';
    ctx.fillText("⚓ VOLVER AL LOBBY", b2X + 150, bY + 34);

    ctx.textAlign = 'left';
  }

  function renderBirthdayOverlay() {
    birthdayPulse += 0.08;
    var pulse = 1.0 + 0.02 * Math.sin(birthdayPulse);

    ctx.save();
    ctx.translate(960, 960);
    ctx.scale(pulse, pulse);

    // Fondo dorado
    ctx.fillStyle = 'rgba(10, 14, 25, 0.94)';
    ctx.fillRect(-700, -55, 1400, 95);
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 4;
    ctx.strokeRect(-700, -55, 1400, 95);

    // Texto de arcoíris animado
    var hue = Math.floor((birthdayPulse * 40) % 360);
    ctx.font = 'bold 50px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'hsl(' + hue + ', 90%, 65%)';
    ctx.strokeStyle = '#080810';
    ctx.lineWidth = 8;
    var txt = "¡¡FELIZ CUMPLEAÑOS DIANITA!!";
    ctx.strokeText(txt, 0, 14);
    ctx.fillText(txt, 0, 14);

    ctx.restore();
  }

  function toggleBirthday() {
    isBirthdayVisible = !isBirthdayVisible;
    if (isBirthdayVisible) {
      SoundSynth.playFanfare();
      spawnConfetti(120);
    }
  }

  // Manejo de teclado (Control Remoto Tizen & Teclado PC)
  window.addEventListener('keydown', function(e) {
    var k = e.keyCode;

    // Tecla P o botón Azul de Tizen: Cumpleaños
    if (k === 80 || k === 406) {
      if (e.shiftKey) {
        isBirthdayVisible = false;
      } else {
        toggleBirthday();
      }
      return;
    }

    // Tecla M: Silenciar música
    if (k === 77) {
      SoundSynth.toggleMute();
      return;
    }

    if (currentState === STATE_LOBBY) {
      // Izquierda / Derecha: cambiar modo
      if (k === 37) { // Left
        selectedMode = MODE_BATTLE;
        updateLobbyModeUI();
      } else if (k === 39) { // Right
        selectedMode = MODE_CRUISE;
        updateLobbyModeUI();
      } else if (k === 13 || k === 32) { // Enter / Space / OK
        startRoundByMode();
      }
    } else if (currentState === STATE_PODIUM) {
      if (k === 37) {
        podiumSelectedBtn = 0;
      } else if (k === 39) {
        podiumSelectedBtn = 1;
      } else if (k === 13 || k === 32) {
        if (podiumSelectedBtn === 0) {
          // Jugar otra vez
          for (var p = 0; p < playersData.length; p++) playersData[p].score = 0;
          startRoundByMode();
        } else {
          // Volver al lobby
          for (var p2 = 0; p2 < playersData.length; p2++) playersData[p2].score = 0;
          currentState = STATE_LOBBY;
          updateLobbyShips();
        }
      }
    }
  }, false);

  function updateLobbyModeUI() {
    var b1 = document.getElementById('btn-mode-battle');
    var b2 = document.getElementById('btn-mode-cruise');
    if (b1 && b2) {
      if (selectedMode === MODE_BATTLE) {
        b1.className = 'mode-btn active';
        b2.className = 'mode-btn';
      } else {
        b1.className = 'mode-btn';
        b2.className = 'mode-btn active';
      }
    }
  }

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    var scaleX = canvas.width / V_WIDTH;
    var scaleY = canvas.height / V_HEIGHT;
    scale = Math.min(scaleX, scaleY);

    offsetX = (canvas.width - V_WIDTH * scale) / 2;
    offsetY = (canvas.height - V_HEIGHT * scale) / 2;
  }

  window.addEventListener('resize', resizeCanvas, false);

  // Inicialización de la pantalla TV
  window.onload = function() {
    canvas = document.getElementById('game-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resizeCanvas();

    connectCloudNet();
    window.requestAnimationFrame(gameLoop);

    // Botones del DOM si se hace clic con ratón o puntero en la TV
    var bBattle = document.getElementById('btn-mode-battle');
    var bCruise = document.getElementById('btn-mode-cruise');
    var bStart = document.getElementById('btn-start-game');

    if (bBattle) {
      bBattle.onclick = function() {
        selectedMode = MODE_BATTLE;
        updateLobbyModeUI();
      };
    }
    if (bCruise) {
      bCruise.onclick = function() {
        selectedMode = MODE_CRUISE;
        updateLobbyModeUI();
      };
    }
    if (bStart) {
      bStart.onclick = function() {
        startRoundByMode();
      };
    }
  };

  window.ShippedGame = {
    startRound: startRoundByMode,
    toggleBirthday: toggleBirthday
  };
})(window);

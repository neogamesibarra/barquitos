const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

function mockElement() {
  const listeners = new Map();
  const classes = new Set();
  return {
    style: {}, disabled: false, textContent: '',
    classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
    addEventListener(type, callback) { listeners.set(type, callback); },
    setPointerCapture() {},
    fire(type, values = {}) {
      const event = { cancelable: true, preventDefault() {}, stopPropagation() {}, button: 0, ...values };
      listeners.get(type)?.(event);
    }
  };
}

function createBroker() {
  const clients = new Set();
  const delivered = [];
  function Client() {
    const topics = new Set();
    this.isConnected = () => clients.has(this);
    this.connect = ({ onSuccess }) => {
      clients.add(this);
      onSuccess();
    };
    this.subscribe = topic => topics.add(topic);
    this.disconnect = () => clients.delete(this);
    this.matches = topic => [...topics].some(filter =>
      filter.endsWith('/#') ? topic.startsWith(filter.slice(0, -1)) : topic === filter
    );
    this.send = message => {
      for (const client of clients) {
        if (client.matches(message.destinationName)) {
          delivered.push([client, message.destinationName]);
          client.onMessageArrived(message);
        }
      }
    };
  }
  return {
    MQTT: { Client, Message: function (payloadString) { this.payloadString = payloadString; } },
    delivered,
    loseController() {
      const controller = [...clients].find(client =>
        client.matches('barquitos/v1/TEST/broadcast') &&
        !client.matches('barquitos/v1/TEST/state')
      );
      assert.ok(controller);
      clients.delete(controller);
      controller.onConnectionLost({ errorMessage: 'simulated disconnect' });
    }
  };
}

function createFlakyBroker(failures) {
  const base = createBroker();
  const OriginalClient = base.MQTT.Client;
  base.MQTT.Client = function (...args) {
    OriginalClient.apply(this, args);
    const realConnect = this.connect;
    this.connect = options => {
      if (failures > 0) {
        failures--;
        options.onFailure({ errorMessage: 'broker caido' });
        return;
      }
      realConnect(options);
    };
  };
  return base;
}

function browser(broker, clock, touch = false, pointerEvents = true) {
  const elements = new Map();
  const windowEvents = new Map();
  const documentEvents = new Map();
  const timers = [];
  const window = {
    addEventListener: (type, callback) => windowEvents.set(type, callback),
    location: { search: '', href: 'https://example.test/index.html' },
    navigator: { maxTouchPoints: touch ? 5 : 0 }
  };
  if (pointerEvents) window.PointerEvent = function () {};
  const document = {
    hidden: false,
    getElementById: id => elements.get(id) || null,
    querySelector: () => null,
    addEventListener: (type, callback) => documentEvents.set(type, callback)
  };
  const context = vm.createContext({
    window, document, console, Paho: broker, URLSearchParams,
    Date: { now: () => clock.now },
    setTimeout: callback => timers.push(callback),
    setInterval: () => 1,
    clearInterval() {}
  });
  function load(file, hooks = '') {
    const source = readFileSync(join(__dirname, '..', 'js', file), 'utf8');
    const entry = source.lastIndexOf('})(window);');
    assert.ok(entry >= 0);
    vm.runInContext(source.slice(0, entry) + hooks + source.slice(entry), context, { filename: file });
  }
  load('cloud_network.js');
  return {
    window, document, windowEvents, documentEvents, load,
    element(id) {
      const element = mockElement();
      elements.set(id, element);
      return element;
    },
    flushTimers() { while (timers.length) timers.shift()(); }
  };
}

const engineHooks = `
  window.testGame = {
    host: function () {
      currentRoomCode = "TEST";
      connectCloudNet();
    },
    view: function () {
      isRemoteClient = true;
      window.CloudNet.initClient("TEST", "viewer", {
        onMessage: handleClientIncomingMessage
      });
    },
    ship: function (slot) {
      return activeShips.filter(function (ship) { return ship.slot === slot; })[0];
    },
    expire: function () { expireRemoteInputs(Date.now()); },
    arena: function () { currentState = STATE_ARENA; },
    lobby: function () { currentState = STATE_LOBBY; updateTouchControlsVisibility(); },
    mode: function () { return selectedMode; },
    state: function () { return currentState; },
    localSlot: function () { return localPlayerSlot; },
    ships: function () { return activeShips.length; },
    defeatBoss: function (wave) {
      var boss = new BossGalleon(960, 150, wave);
      boss.die();
      boss.die();
      return { rank: boss.rank, fleetRank: hordeUpgrades.fleetRank };
    },
    rescue: updateRescues,
    lootAtIsland: function () { return getLootPosition(960, 540); },
    nearIsland: isInsideIsland,
    connected: function () { return playersData.filter(function (p) { return p.connected; }).length; },
    controls: setupOnscreenControls,
    buttons: bindLobbyButtons,
    start: startNewMatch,
    visibility: updateTouchControlsVisibility,
    winner: function (name) { roundWinner = name ? { name: name } : null; },
    snapshot: function () { broadcastGameState(); },
    visibleWinner: function () { return roundWinner && roundWinner.name; },
    name: function (slot) { return playersData[slot].customName; },
    team: function (slot) { return playersData[slot].team; },
    raw: function (uuid, payload) {
      window.CloudNet.sendToHost(Object.assign({ uuid: uuid }, payload));
    },
    uuidOf: function (slot) { return playersData[slot].uuid; },
    teamScore: function (side) { return teamScores[side]; },
    applySync: applyClientSync,
    shipOf: function (slot) {
      return activeShips.filter(function (ship) { return ship.slot === slot; })[0];
    },
    inviteUrl: function () {
      var captured = null;
      window.drawQRCodeToCanvas = function (canvas, url) { captured = url; };
      generateLobbyQR();
      return captured;
    }
  };
`;

const controllerHooks = `
  window.testController = {
    join: function () { connectToRoom("TEST"); },
    slot: function () { return mySlot; },
    state: function () { return currentGameState; },
    hold: function () {
      inputState.heading = 0;
      inputState.thrust = true;
      inputState.shoot = true;
      sendInputUpdate(true);
    },
    refresh: function () { sendInputUpdate(); },
    action: function (action, mode) {
      window.CloudNet.sendToHost({ type: "host_action", uuid: playerUUID, action: action, mode: mode });
    },
    bind: function () {
      elHostPanel = document.getElementById('host-panel');
      elBtnHostStart = document.getElementById('btn-host-start');
      elBtnHostMode = document.getElementById('btn-host-mode');
      updateHostControls();
      setupActionButtons();
    }
  };
`;

function assertInputs(ship, active, heading) {
  if (active) {
    assert.equal(ship.headingInput, heading);
    assert.equal(ship.thrustInput, true);
    assert.equal(ship.shootInput, true);
  } else {
    assert.equal(ship.headingInput, null);
    assert.equal(ship.turnInput, 0);
    assert.equal(ship.thrustInput, false);
    assert.equal(ship.shootInput, false);
  }
}

test('mando entra, pierde conexión, vuelve a la misma partida y suelta los controles', () => {
  const broker = createBroker();
  const clock = { now: 10000 };
  const host = browser(broker, clock);
  const phone = browser(broker, clock);
  host.load('game_engine.js', engineHooks);
  phone.load('controller.js', controllerHooks);
  const game = host.window.testGame;
  const controller = phone.window.testController;

  game.host();
  game.arena();
  controller.join();
  phone.flushTimers();
  const slot = controller.slot();
  assert.equal(slot, 0);
  assert.equal(controller.state(), 'playing');

  const ship = game.ship(slot);
  controller.hold();
  assertInputs(ship, true, 0);
  clock.now += 400;
  controller.refresh();
  clock.now += 1100;
  game.expire();
  assertInputs(ship, true, 0);

  broker.loseController();
  clock.now += 400;
  game.expire();
  assertInputs(ship, false);

  phone.flushTimers();
  assert.equal(controller.slot(), slot);
  assert.equal(game.ship(slot), ship);
  assert.equal(controller.state(), 'playing');
  controller.refresh();
  assertInputs(ship, false);

  controller.hold();
  phone.window.onload();
  phone.document.hidden = true;
  phone.documentEvents.get('visibilitychange')();
  assertInputs(ship, false);
});

test('la vista remota limpia el ganador de la ronda y el mando no recibe el tablero', () => {
  const broker = createBroker();
  const clock = { now: 10000 };
  const host = browser(broker, clock);
  const viewer = browser(broker, clock);
  const phone = browser(broker, clock);
  host.load('game_engine.js', engineHooks);
  viewer.load('game_engine.js', engineHooks);
  phone.load('controller.js', controllerHooks);
  const game = host.window.testGame;
  const remote = viewer.window.testGame;

  game.host();
  remote.view();
  phone.window.testController.join();
  phone.flushTimers();
  game.arena();
  game.winner('Capitana');
  game.snapshot();
  assert.equal(remote.visibleWinner(), 'Capitana');
  assert.equal(broker.delivered.filter(([, topic]) => topic.endsWith('/state')).length, 1);

  clock.now += 100;
  game.winner(null);
  game.snapshot();
  assert.equal(remote.visibleWinner(), null);
});

test('primer QR naranja administra la sala y los demás no cambian el modo ni reinician la ronda', () => {
  const broker = createBroker();
  const clock = { now: 10000 };
  const host = browser(broker, clock);
  const first = browser(broker, clock);
  const second = browser(broker, clock);
  host.load('game_engine.js', engineHooks);
  first.load('controller.js', controllerHooks);
  second.load('controller.js', controllerHooks);
  const panel = first.element('host-panel');
  const mode = first.element('btn-host-mode');
  const start = first.element('btn-host-start');
  const game = host.window.testGame;
  game.host();
  assert.equal(game.connected(), 0);
  first.window.testController.join();
  first.flushTimers();
  second.window.testController.join();
  second.flushTimers();
  assert.equal(first.window.testController.slot(), 0);
  assert.equal(second.window.testController.slot(), 1);
  assert.equal(game.ship(0).data.hull, '#E67E22');
  first.window.testController.bind();
  assert.equal(panel.style.display, 'flex');
  mode.fire('click');
  assert.equal(game.mode(), 0);
  second.window.testController.action('set_mode', 2);
  assert.equal(game.mode(), 0);
  start.fire('click');
  assert.equal(game.state(), 1);
  assert.equal(panel.style.display, 'none');
  const ship = game.ship(0);
  clock.now += 1000;
  first.window.testController.action('start');
  assert.equal(game.ship(0), ship);
  first.window.testController.action('set_mode', 2);
  assert.equal(game.mode(), 0);
});

for (const pointerEvents of [true, false]) {
  test('anfitrión móvil y QR controlan barcos independientes con multitáctil ' + (pointerEvents ? 'pointer' : 'touch'), () => {
    const broker = createBroker();
    const clock = { now: 10000 };
    const host = browser(broker, clock, true, pointerEvents);
    const phone = browser(broker, clock);
    host.load('game_engine.js', engineHooks);
    phone.load('controller.js', controllerHooks);
    const controls = host.element('onscreen-touch-controls');
    const left = host.element('touch-joystick');
    left.querySelector = () => null;
    left.getBoundingClientRect = () => ({ left: 0, top: 0, width: 140, height: 140 });
    const thrust = host.element('touch-thrust');
    const shoot = host.element('touch-shoot');
    const game = host.window.testGame;
    game.host();
    const localButton = host.element("btn-local-player");
    game.buttons();
    localButton.fire("click");
    assert.equal(game.localSlot(), 1);
    phone.window.testController.join();
    phone.flushTimers();
    assert.equal(phone.window.testController.slot(), 0);
    game.start();
    game.controls();
    game.visibility();
    assert.equal(controls.style.display, 'flex');
    const local = game.ship(1);
    const orange = game.ship(0);
    const down = (button, id) => button.fire(pointerEvents ? 'pointerdown' : 'touchstart',
      pointerEvents ? { pointerId: id, pointerType: 'touch', clientX: 20, clientY: 70 } : { changedTouches: [{ identifier: id, clientX: 20, clientY: 70 }] });
    const up = (button, id) => button.fire(pointerEvents ? 'pointerup' : 'touchend',
      pointerEvents ? { pointerId: id } : { changedTouches: [{ identifier: id }] });
    down(left, 11);
    down(thrust, 22);
    down(shoot, 33);
    assert.ok(Math.abs(local.headingInput - Math.PI) < 1e-9);
    assert.equal(local.thrustInput, true);
    assert.equal(local.shootInput, true);
    assertInputs(orange, false);
    up(thrust, 99);
    assert.equal(local.thrustInput, true);
    up(thrust, 22);
    assert.equal(local.thrustInput, false);
    assert.equal(local.shootInput, true);
    left.fire(pointerEvents ? 'pointermove' : 'touchmove', pointerEvents
      ? { pointerId: 11, clientX: 120, clientY: 70 }
      : { changedTouches: [{ identifier: 11, clientX: 120, clientY: 70 }] });
    assert.equal(local.headingInput, 0);
    up(left, 11);
    assert.equal(local.headingInput, null);
    host.windowEvents.get('blur')();
    assertInputs(local, false);
    down(thrust, 44);
    assert.equal(local.thrustInput, true);
    game.lobby();
    assertInputs(local, false);
    assert.equal(controls.style.display, 'none');
  });
}

test('jugador online táctil usa su barco y sus botones solicitan cambios al anfitrión', () => {
  const broker = createBroker();
  const clock = { now: 10000 };
  const host = browser(broker, clock);
  const online = browser(broker, clock, true);
  host.load('game_engine.js', engineHooks);
  online.load('game_engine.js', engineHooks);
  host.window.testGame.host();
  online.window.location.search = '?sala=TEST';
  online.window.location.href += '?sala=TEST';
  online.window.testGame.host();
  online.flushTimers();
  const controls = online.element('onscreen-touch-controls');
  const shoot = online.element('touch-shoot');
  const mode = online.element('btn-mode-horde');
  const start = online.element('btn-start-game');
  const game = host.window.testGame;
  online.window.testGame.buttons();
  mode.fire('click');
  assert.equal(game.mode(), 2);
  start.fire('click');
  assert.equal(game.state(), 1);
  online.window.testGame.controls();
  online.window.testGame.visibility();
  assert.equal(controls.style.display, 'flex');
  shoot.fire('pointerdown', { pointerId: 1 });
  assert.equal(game.ship(0).shootInput, true);
  // El límite de frecuencia del anfitrión exige que el reloj avance, como
  // ocurre entre dos toques reales.
  clock.now += 100;
  shoot.fire('pointercancel', { pointerId: 1 });
  assert.equal(game.ship(0).shootInput, false);
});

test('el teclado local no conduce el barco naranja del mando', () => {
  const broker = createBroker();
  const clock = { now: 10000 };
  const host = browser(broker, clock);
  const phone = browser(broker, clock);
  host.load('game_engine.js', engineHooks);
  phone.load('controller.js', controllerHooks);
  const game = host.window.testGame;
  game.host();
  phone.window.testController.join();
  phone.flushTimers();
  game.start();
  host.windowEvents.get('keydown')({ keyCode: 87, preventDefault() {} });
  assert.equal(game.ship(0).thrustInput, false);
  assert.equal(game.ship(game.localSlot()).thrustInput, true);
});

test('un toque en iniciar tiene un único manejador de inicio', () => {
  const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
  const button = html.match(/<button[^>]*id="btn-start-game"[^>]*>/)[0];
  assert.ok(!button.includes('onclick='));
  assert.ok(!html.includes('id="touch-ram"'));
});

test('Horda comienza con un solo barco y admite un mando durante la partida', () => {
  const broker = createBroker();
  const clock = { now: 10000 };
  const host = browser(broker, clock);
  const phone = browser(broker, clock);
  host.load('game_engine.js', engineHooks);
  phone.load('controller.js', controllerHooks);
  const game = host.window.testGame;
  game.host();
  host.window.BarquitosGame.setMode(2);
  game.start();
  assert.equal(game.ships(), 1);
  phone.window.testController.join();
  phone.flushTimers();
  assert.equal(game.ships(), 2);
  assert.equal(phone.window.testController.state(), 'playing');
  const loot = game.lootAtIsland();
  assert.equal(game.nearIsland(loot.x, loot.y, 36), false);
});

test('en Horda online la pantalla móvil no añade un barco sin jugador', () => {
  const broker = createBroker();
  const clock = { now: 10000 };
  const host = browser(broker, clock, true);
  const phone = browser(broker, clock);
  host.load('game_engine.js', engineHooks);
  phone.load('controller.js', controllerHooks);
  const game = host.window.testGame;
  game.host();
  phone.window.testController.join();
  phone.flushTimers();
  host.window.BarquitosGame.setMode(2);
  game.start();
  assert.equal(game.ships(), 1);
  assert.equal(game.localSlot(), -1);
});

test('si el broker principal cae la sala cambia de servidor y el enlace lleva ese broker', () => {
  const broker = createFlakyBroker(3);
  const clock = { now: 10000 };
  const host = browser(broker, clock);
  host.load('game_engine.js', engineHooks);
  const game = host.window.testGame;
  host.element('qr-canvas');
  game.host();
  assert.equal(host.window.CloudNet.isConnected(), false);
  for (let attempt = 0; attempt < 6; attempt++) host.flushTimers();
  assert.equal(host.window.CloudNet.isConnected(), true);
  assert.equal(host.window.CloudNet.getCurrentBrokerIdx(), 1);
  assert.equal(host.window.CloudNet.getBrokerParam(), 'emqx');
  const url = game.inviteUrl();
  assert.ok(url.indexOf('room=TEST') !== -1);
  assert.ok(url.indexOf('b=emqx') !== -1);
});

test('un mando no puede renombrar ni cambiar de equipo a otro jugador', () => {
  const broker = createBroker();
  const clock = { now: 10000 };
  const host = browser(broker, clock);
  const first = browser(broker, clock);
  const second = browser(broker, clock);
  host.load('game_engine.js', engineHooks);
  first.load('controller.js', controllerHooks);
  second.load('controller.js', controllerHooks);
  const game = host.window.testGame;
  game.host();
  first.window.testController.join();
  first.flushTimers();
  second.window.testController.join();
  second.flushTimers();
  const firstUuid = game.uuidOf(0);
  const secondUuid = game.uuidOf(1);

  // El segundo jugador intenta renombrar al primero usando su propio uuid.
  game.raw(secondUuid, { type: 'set_name', slot: 0, name: 'IMPOSTOR' });
  assert.notEqual(game.name(0), 'IMPOSTOR');

  // Y también intenta moverlo de equipo.
  game.raw(secondUuid, { type: 'set_team', slot: 0, team: 'red' });
  assert.notEqual(game.team(0), 'red');

  // Cada jugador sí puede cambiar lo suyo.
  game.raw(firstUuid, { type: 'set_name', name: 'Capitana' });
  assert.equal(game.name(0), 'Capitana');
});

test('el anfitrión descarta datos absurdos y nombres con caracteres de control', () => {
  const broker = createBroker();
  const clock = { now: 10000 };
  const host = browser(broker, clock);
  const phone = browser(broker, clock);
  host.load('game_engine.js', engineHooks);
  phone.load('controller.js', controllerHooks);
  const game = host.window.testGame;
  game.host();
  phone.window.testController.join();
  phone.flushTimers();
  const uuid = game.uuidOf(0);

  game.raw(uuid, { type: 'set_name', name: '  Ca\u0000pi\u001Ftán   Largo   ' });
  assert.equal(game.name(0), 'Capitán Larg');

  const ship = game.shipOf(0);
  game.raw(uuid, {
    type: 'input', heading: 1e9, turn: 9999,
    thrust: 1, shoot: 'sí', firePress: clock.now + 9e9
  });
  assert.ok(ship.headingInput >= 0 && ship.headingInput < Math.PI * 2);
  assert.equal(ship.turnInput, 1);
  assert.equal(ship.thrustInput, true);
  assert.equal(ship.shootInput, true);
});

test('la vista remota acota lo que publica cualquiera en el broker público', () => {
  const broker = createBroker();
  const clock = { now: 10000 };
  const viewer = browser(broker, clock);
  viewer.load('game_engine.js', engineHooks);
  const remote = viewer.window.testGame;
  remote.view();

  remote.applySync({
    swellTime: 1, st: 1, m: 99, r: 1e9, w: 1e9, cd: 1e9, rt: -5,
    ts: { blue: 1e12, red: -3 }, up: { weaponLevel: 1e9, maxAmmo: 1e9, maxHealth: 1e9, fleetRank: -1, repairs: 1e9 },
    sh: [[0, 1e12, -1e12, 1e7, 1e9, 1e9, 1e9, 1, 'blue', 'X', '', 0, 0, 1e9, 1e12, 1e9]],
    cb: [[1e12, -1e12, 1e9, -1e9, 0, 'blue', 0]],
    pi: [[1e12, -1e12, 1e7, 1e9, 1e9, 0]],
    bo: null,
    cr: [[1e12, -1e12, 99]]
  });

  assert.equal(remote.mode(), 2);
  assert.ok(remote.teamScore('blue') <= 999999);
  assert.ok(remote.teamScore('red') >= 0);
  const ship = remote.shipOf(0);
  assert.ok(Math.abs(ship.targetX) <= 20000);
  assert.ok(ship.health >= 0 && ship.health <= ship.maxHealth);
});

test('cada jefe mejora una sola vez el casco de toda la flota y permite rescatar aliados', () => {
  const broker = createBroker();
  const clock = { now: 10000 };
  const host = browser(broker, clock);
  const phone = browser(broker, clock);
  host.load('game_engine.js', engineHooks);
  phone.load('controller.js', controllerHooks);
  const game = host.window.testGame;
  game.host();
  host.window.BarquitosGame.setMode(2);
  game.start();
  phone.window.testController.join();
  phone.flushTimers();
  const local = game.ship(1);
  const orange = game.ship(0);
  assert.equal(game.defeatBoss(10).fleetRank, 1);
  assert.equal(local.maxHealth, 3.5);
  assert.equal(orange.maxHealth, 3.5);
  const secondBoss = game.defeatBoss(20);
  assert.equal(secondBoss.rank, 2);
  assert.equal(secondBoss.fleetRank, 2);
  assert.equal(local.maxHealth, 4);
  orange.die();
  local.x = orange.x;
  local.y = orange.y;
  game.rescue(1);
  assert.equal(orange.isAlive, false);
  game.rescue(1);
  assert.equal(orange.isAlive, true);
  assert.equal(orange.health, 1);
});

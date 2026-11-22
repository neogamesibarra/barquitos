const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { dirname, join, resolve } = require('node:path');
const vm = require('node:vm');

function mockElement() {
  const listeners = new Map();
  const classes = new Set();
  return {
    style: {}, disabled: false, textContent: '',
    classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
    addEventListener(type, callback) { listeners.set(type, callback); },
    setPointerCapture() {},
    setAttribute(name, value) { this[name] = value; },
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
          delivered.push([client, message.destinationName, JSON.parse(message.payloadString)]);
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

function browser(broker, clock, touch = false, pointerEvents = true, sessionStorage = new Map(), fetch = undefined) {
  const elements = new Map();
  const windowEvents = new Map();
  const documentEvents = new Map();
  const timers = [];
  const intervals = new Set();
  const localStorage = new Map();
  const window = {
    localStorage: {
      getItem: key => localStorage.get(key) ?? null,
      setItem: (key, value) => localStorage.set(key, value)
    },
    addEventListener: (type, callback) => windowEvents.set(type, callback),
    location: { search: '', href: 'https://example.test/index.html' },
    sessionStorage: {
      getItem: key => sessionStorage.get(key) ?? null,
      setItem: (key, value) => sessionStorage.set(key, value),
      removeItem: key => sessionStorage.delete(key)
    },
    navigator: { maxTouchPoints: touch ? 5 : 0 }
  };
  if (pointerEvents) window.PointerEvent = function () {};
  const document = {
    readyState: "loading",
    hidden: false,
    getElementById: id => elements.get(id) || null,
    querySelector: () => null,
    addEventListener: (type, callback) => documentEvents.set(type, callback)
  };
  const context = vm.createContext({
    window, document, console, Paho: broker, URLSearchParams,
    Date: class extends Date { static now() { return clock.now; } },
    fetch,
    setTimeout(callback, delay) {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) { timer.cancelled = true; },
    setInterval(callback) {
      intervals.add(callback);
      return callback;
    },
    clearInterval: callback => intervals.delete(callback)
  });
  const modules = new Map();
  function getModule(file) {
    if (!modules.has(file)) {
      modules.set(file, new vm.SourceTextModule(readFileSync(file, 'utf8'), {
        context, identifier: file
      }));
    }
    return modules.get(file);
  }
  function link(specifier, importer) {
    return getModule(resolve(dirname(importer.identifier), specifier));
  }
  async function load(file, hooks) {
    const identifier = join(__dirname, '..', 'js', file);
    const entry = new vm.SourceTextModule(hooks, { context, identifier });
    await entry.link(link);
    await entry.evaluate();
    window.CloudNet = getModule(join(dirname(identifier), 'cloud_network.js')).namespace.CloudNet;
  }
  return {
    window, document, windowEvents, documentEvents, load,
    element(id) {
      const element = mockElement();
      elements.set(id, element);
      return element;
    },
    nextTimeout() { return timers.find(timer => !timer.cancelled)?.delay; },
    tickIntervals() { for (const callback of intervals) callback(); },
    flushTimers() {
      while (timers.length) {
        const timer = timers.shift();
        if (!timer.cancelled) timer.callback();
      }
    }
  };
}

const engineHooks = `
import "./game_engine.js";
import { STATE_ARENA, STATE_LOBBY, STATE_PODIUM } from "./engine/config.js";
import { pollLocalGamepad, setupOnscreenControls, updateTouchControlsVisibility } from "./engine/controls.js";
import { startGameLoop } from "./engine/game_loop.js";
import { BossGalleon } from "./engine/entities.js";
import { bindLobbyButtons } from "./engine/lobby.js";
import { startNewMatch, updateHorde, updateRescues } from "./engine/modes.js";
import { applyClientSync, broadcastGameState, connectCloudNet, expireRemoteInputs, generateLobbyQR, handleClientIncomingMessage } from "./engine/multiplayer.js";
import { getLootPosition, isInsideIsland } from "./engine/physics.js";
import { state } from "./engine/state.js";


  window.testGame = {
    paused: () => state.isPaused,
    startLoop: startGameLoop,
    countdown: () => state.countdownTime,
    loseHorde: () => {
      state.currentWave = 5;
      state.countdownTime = 0;
      state.waveEnemiesToSpawn = 1;
      state.waveSpawnTimer = 2;
      state.roundOverTimer = 4;
      for (const ship of state.activeShips) {
        ship.isAlive = false;
        ship.data.score = 250;
        ship.data.customName = "Capitana";
      }
      updateHorde(1 / 60);
    },
    host: function () {
      state.currentRoomCode = "TEST";
      connectCloudNet();
    },
    view: function () {
      state.isRemoteClient = true;
      window.CloudNet.initClient("TEST", "viewer", {
        onMessage: handleClientIncomingMessage
      });
    },
    ship: function (slot) {
      return state.activeShips.filter(function (ship) { return ship.slot === slot; })[0];
    },
    expire: function () { expireRemoteInputs(Date.now()); },
    arena: function () { state.currentState = STATE_ARENA; },
    podium: function () { state.currentState = STATE_PODIUM; window.CloudNet.broadcast({ type: "state_change", state: STATE_PODIUM }); },
    lobby: function () { state.currentState = STATE_LOBBY; updateTouchControlsVisibility(); },
    mode: function () { return state.selectedMode; },
    state: function () { return state.currentState; },
    occupyFirstSlotLocally: function () {
      state.localPlayerSlot = 0;
      state.playersData[0].connected = true;
    },
    localSlot: function () { return state.localPlayerSlot; },
    ships: function () { return state.activeShips.length; },
    defeatBoss: function (wave) {
      var boss = new BossGalleon(960, 150, wave);
      boss.die();
      boss.die();
      return { rank: boss.rank, fleetRank: state.hordeUpgrades.fleetRank };
    },
    rescue: updateRescues,
    lootAtIsland: function () { return getLootPosition(960, 540); },
    nearIsland: isInsideIsland,
    connected: function () { return state.playersData.filter(function (p) { return p.connected; }).length; },
    controls: setupOnscreenControls,
    pollPad: pollLocalGamepad,
    buttons: bindLobbyButtons,
    start: startNewMatch,
    visibility: updateTouchControlsVisibility,
    winner: function (name) { state.roundWinner = name ? { name: name } : null; },
    snapshot: function () { broadcastGameState(); },
    visibleWinner: function () { return state.roundWinner && state.roundWinner.name; },
    name: function (slot) { return state.playersData[slot].customName; },
    team: function (slot) { return state.playersData[slot].team; },
    raw: function (uuid, payload) {
      window.CloudNet.sendToHost(Object.assign({ uuid: uuid }, payload));
    },
    uuidOf: function (slot) { return state.playersData[slot].uuid; },
    teamScore: function (side) { return state.teamScores[side]; },
    applySync: applyClientSync,
    shipOf: function (slot) {
      return state.activeShips.filter(function (ship) { return ship.slot === slot; })[0];
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
  import "./controller.js";
  import { CloudNet } from "./cloud_network.js";
  import { connectToRoom, session } from "./controller/session.js";
  import { elements, updateHostControls, setupActionButtons } from "./controller/ui.js";
  import { inputState, markFirePress, sendInputUpdate } from "./controller/joystick.js";
  window.testController = {
    join: function () { connectToRoom("TEST"); },
    slot: function () { return session.mySlot; },
    isHost: function () { return session.isHost; },
    paused: () => session.isPaused,
    mode: function () { return session.currentMode; },
    state: function () { return session.currentGameState; },
    hold: function () {
      inputState.heading = 0;
      inputState.thrust = true;
      inputState.shoot = true;
      sendInputUpdate(true);
    },
    refresh: function () { sendInputUpdate(); },
    steer: (heading, immediate = false) => {
      inputState.heading = heading;
      sendInputUpdate(immediate);
    },
    fire: () => {
      inputState.shoot = true;
      markFirePress();
      sendInputUpdate(true);
    },
    setName: name => { session.myCustomName = name; },
    room: () => session.currentRoom,
    action: function (action, mode) {
      CloudNet.sendToHost({ type: "host_action", uuid: session.playerUUID, action: action, mode: mode });
    },
    bind: function () {
      elements.elHostPanel = document.getElementById('host-panel');
      elements.elBtnHostStart = document.getElementById('btn-host-start');
      elements.elBtnHostMode = document.getElementById('btn-host-mode');
      elements.elBtnHostLobby = document.getElementById('btn-host-lobby');
      elements.elBtnHostPause = document.getElementById('btn-host-pause');
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

test('mando entra, pierde conexión, vuelve a la misma partida y suelta los controles', async () => {
  const broker = createBroker();
  const clock = { now: 10000 };
  const host = browser(broker, clock);
  const phone = browser(broker, clock);
  await host.load('game_engine.js', engineHooks);
  await phone.load('controller.js', controllerHooks);
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
  phone.documentEvents.get("DOMContentLoaded")();
  phone.document.hidden = true;
  phone.documentEvents.get('visibilitychange')();
  assertInputs(ship, false);
});

test('la vista remota limpia el ganador de la ronda y el mando no recibe el tablero', async () => {
  const broker = createBroker();
  const clock = { now: 10000 };
  const host = browser(broker, clock);
  const viewer = browser(broker, clock);
  const phone = browser(broker, clock);
  await host.load('game_engine.js', engineHooks);
  await viewer.load('game_engine.js', engineHooks);
  await phone.load('controller.js', controllerHooks);
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

test('primer QR naranja administra la sala y los demás no cambian el modo ni reinician la ronda', async () => {
  const broker = createBroker();
  const clock = { now: 10000 };
  const host = browser(broker, clock);
  const first = browser(broker, clock);
  const second = browser(broker, clock);
  await host.load('game_engine.js', engineHooks);
  await first.load('controller.js', controllerHooks);
  await second.load('controller.js', controllerHooks);
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

test('el primer QR administra la sala con un jugador local en el puesto cero', async () => {
  const broker = createBroker();
  const clock = { now: 10000 };
  const host = browser(broker, clock);
  const first = browser(broker, clock);
  const second = browser(broker, clock);
  await host.load('game_engine.js', engineHooks);
  await first.load('controller.js', controllerHooks);
  await second.load('controller.js', controllerHooks);
  const game = host.window.testGame;
  const lobby = host.element('lobby-ui');
  lobby.style.display = 'flex';
  const battle = host.element('btn-mode-battle');
  const firstPhone = first.window.testController;
  const secondPhone = second.window.testController;
  const firstPanel = first.element('host-panel');
  const firstMode = first.element('btn-host-mode');
  const firstStart = first.element('btn-host-start');
  const secondMode = second.element('btn-host-mode');
  game.host();
  game.occupyFirstSlotLocally();
  for (const [device, controller] of [[first, firstPhone], [second, secondPhone]]) {
    controller.bind();
    controller.join();
    device.flushTimers();
  }

  assert.equal(firstPhone.slot(), 1);
  assert.equal(firstPhone.isHost(), true);
  assert.equal(firstPanel.style.display, 'flex');
  assert.equal(secondPhone.isHost(), false);

  firstMode.fire('touchend');
  assert.equal(game.mode(), 0);
  assert.equal(battle.className, 'mode-btn active');
  assert.equal(secondPhone.mode(), 0);
  firstPhone.action('set_mode', 1);
  assert.equal(game.mode(), 1);
  assert.equal(secondPhone.mode(), 1);

  firstStart.fire('click');
  assert.equal(game.state(), 1); // STATE_ARENA
  assert.equal(lobby.style.display, 'none');
  assert.equal(firstPhone.state(), 'playing');
  assert.equal(secondPhone.state(), 'playing');

  game.podium();
  firstPhone.action('lobby');
  first.window.CloudNet.disconnect();
  clock.now += 46000;
  secondPhone.action('toggle_mode'); // Renueva su plaza sin permisos de anfitrión.
  assert.equal(game.mode(), 1);
  game.expire();
  assert.equal(secondPhone.isHost(), true);
  secondMode.fire('click');
  assert.equal(game.mode(), 2);
});

test('solo el anfitrión QR pausa la arena y todos los mandos reciben la pausa', async () => {
  const broker = createBroker();
  const clock = { now: 10000 };
  const host = browser(broker, clock);
  const first = browser(broker, clock);
  const second = browser(broker, clock);
  let nextFrame;
  host.window.requestAnimationFrame = frame => { nextFrame = frame; };
  const overlay = host.element('pause-overlay');
  const resume = host.element('btn-pause-resume');
  const menu = host.element('btn-pause-lobby');
  const pause = first.element('btn-host-pause');
  await host.load('game_engine.js', engineHooks);
  await first.load('controller.js', controllerHooks);
  await second.load('controller.js', controllerHooks);
  const game = host.window.testGame;
  const captain = first.window.testController;
  const guest = second.window.testController;
  game.host();
  game.occupyFirstSlotLocally();
  game.buttons();
  captain.bind();
  captain.join();
  first.flushTimers();
  guest.join();
  second.flushTimers();

  captain.action('toggle_pause');
  assert.equal(game.paused(), false);
  captain.action('start');
  captain.hold();
  const ship = game.ship(captain.slot());
  assert.equal(ship.thrustInput, true);
  guest.action('toggle_pause');
  assert.equal(game.paused(), false);
  pause.fire('click');
  assert.equal(game.paused(), true);
  assert.equal(ship.thrustInput, false);
  assert.equal(ship.shotBuffer, 0);
  assert.equal(overlay.hidden, false);
  assert.equal(captain.paused(), true);
  assert.equal(guest.paused(), true);
  game.startLoop();
  const countdown = game.countdown();
  nextFrame(0);
  nextFrame(100);
  assert.equal(game.countdown(), countdown);
  guest.hold();
  assert.equal(game.ship(guest.slot()).thrustInput, false);

  const late = browser(broker, clock);
  await late.load('controller.js', controllerHooks);
  late.window.testController.join();
  late.flushTimers();
  assert.equal(late.window.testController.paused(), true);
  resume.fire('click');
  assert.equal(game.paused(), false);
  assert.equal(overlay.hidden, true);
  assert.equal(guest.paused(), false);
  nextFrame(200);
  assert.ok(game.countdown() < countdown);

  clock.now += 300;
  pause.fire('touchend');
  assert.equal(game.paused(), true);
  menu.fire('click');
  assert.equal(game.state(), 0);
  assert.equal(game.paused(), false);
  assert.equal(guest.state(), 'lobby');
  assert.equal(guest.paused(), false);
  captain.action('start');
  assert.equal(game.state(), 1);
  assert.equal(game.paused(), false);
});

test('ranking de Horda combina Firebase vacío u objeto, recorta a diez y funciona sin red', async () => {
  const requests = [];
  let remote = null;
  let offline = false;
  const host = browser(createBroker(), { now: 10000 }, false, true, new Map(), async (url, options) => {
    requests.push({ url, options });
    if (offline) throw new Error('sin conexión');
    if (options.method === 'PUT') remote = JSON.parse(options.body);
    return { ok: true, json: async () => remote, headers: { get: () => '"version"' } };
  });
  await host.load('game_engine.js', `
    import "./cloud_network.js";
    import { getHordeLeaderboard, recordHordeScore } from "./engine/leaderboard.js";
    window.ranking = { getHordeLeaderboard, recordHordeScore };
  `);
  const ranking = host.window.ranking;
  assert.equal((await ranking.getHordeLeaderboard()).length, 0);
  const record = (wave, score) => ranking.recordHordeScore({ wave, score, players: ['Capitana'] });
  const first = await record(1, 999);
  assert.equal(first.global, true);
  assert.equal(first.entries[0].id, first.entry.id);
  assert.equal(requests.at(-1).options.headers['If-Match'], '"version"');

  remote = Object.fromEntries(Array.from({ length: 11 }, (_, index) => [index, {
    id: 'fleet-' + index, wave: index + 2, score: 50, players: ['Flota'], date: '2026-11-22'
  }]));
  const result = await record(12, 70);
  assert.equal(result.entries.length, 10);
  assert.equal(result.entries[0].id, result.entry.id);
  assert.equal(result.entries[1].score, 50);
  assert.equal(remote.at(-1).wave, 4);
  offline = true;
  const fallback = await record(13, 1);
  assert.equal(fallback.global, false);
  assert.equal(fallback.entries[0].wave, 13);
  assert.equal((await ranking.getHordeLeaderboard())[0].id, fallback.entry.id);
  assert.equal(JSON.parse(host.window.localStorage.getItem('barquitos_horde_top10')).length, 10);
});

test('la derrota de Horda abre la tabla y marca el puntaje de la flota', async () => {
  const puts = [];
  const host = browser(createBroker(), { now: 10000 }, false, true, new Map(), async (_url, options) => {
    if (options.method === 'PUT') puts.push(JSON.parse(options.body));
    return { ok: true, json: async () => null };
  });
  const panel = host.element('horde-leaderboard');
  const status = host.element('horde-ranking-status');
  const body = host.element('horde-ranking-rows');
  const rows = [];
  body.replaceChildren = () => { rows.length = 0; };
  body.append = row => rows.push(row);
  host.document.createElement = () => {
    const cells = [];
    return {
      cells,
      append: cell => cells.push(cell),
      setAttribute() {},
      classList: { toggle(name, enabled) { if (enabled) this.active = name; } }
    };
  };
  await host.load('game_engine.js', engineHooks);
  const game = host.window.testGame;
  game.start();
  game.loseHorde();
  assert.equal(game.state(), 3);
  assert.equal(panel.hidden, false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(puts.length, 1);
  assert.equal(status.textContent, 'Ranking global');
  assert.deepEqual(rows[0].cells.map(cell => cell.textContent), ['1', 'Capitana', '5', '250']);
  assert.equal(rows[0].classList.active, 'latest-score');
  game.start();
  assert.equal(panel.hidden, true);
});

for (const pointerEvents of [true, false]) {
  test('anfitrión móvil y QR controlan barcos independientes con multitáctil ' + (pointerEvents ? 'pointer' : 'touch'), async () => {
    const broker = createBroker();
    const clock = { now: 10000 };
    const host = browser(broker, clock, true, pointerEvents);
    const phone = browser(broker, clock);
    await host.load('game_engine.js', engineHooks);
    await phone.load('controller.js', controllerHooks);
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

test('jugador online táctil usa su barco y sus botones solicitan cambios al anfitrión', async () => {
  const broker = createBroker();
  const clock = { now: 10000 };
  const host = browser(broker, clock);
  const online = browser(broker, clock, true);
  await host.load('game_engine.js', engineHooks);
  await online.load('game_engine.js', engineHooks);
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

test('el teclado local no conduce el barco naranja del mando', async () => {
  const broker = createBroker();
  const clock = { now: 10000 };
  const host = browser(broker, clock);
  const phone = browser(broker, clock);
  await host.load('game_engine.js', engineHooks);
  await phone.load('controller.js', controllerHooks);
  const game = host.window.testGame;
  game.host();
  phone.window.testController.join();
  phone.flushTimers();
  game.start();
  host.windowEvents.get('keydown')({ key: 'w', preventDefault() {} });
  assert.equal(game.ship(0).thrustInput, false);
  assert.equal(game.ship(game.localSlot()).thrustInput, true);
});

test('un toque en iniciar tiene un único manejador de inicio', async () => {
  const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
  const button = html.match(/<button[^>]*id="btn-start-game"[^>]*>/)[0];
  assert.ok(!button.includes('onclick='));
  assert.ok(!html.includes('id="touch-ram"'));
});

test('Horda comienza con un solo barco y admite un mando durante la partida', async () => {
  const broker = createBroker();
  const clock = { now: 10000 };
  const host = browser(broker, clock);
  const phone = browser(broker, clock);
  await host.load('game_engine.js', engineHooks);
  await phone.load('controller.js', controllerHooks);
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

test('en Horda online la pantalla móvil no añade un barco sin jugador', async () => {
  const broker = createBroker();
  const clock = { now: 10000 };
  const host = browser(broker, clock, true);
  const phone = browser(broker, clock);
  await host.load('game_engine.js', engineHooks);
  await phone.load('controller.js', controllerHooks);
  const game = host.window.testGame;
  game.host();
  phone.window.testController.join();
  phone.flushTimers();
  host.window.BarquitosGame.setMode(2);
  game.start();
  assert.equal(game.ships(), 1);
  assert.equal(game.localSlot(), -1);
});

test('si el broker principal cae la sala cambia de servidor y el enlace lleva ese broker', async () => {
  const broker = createFlakyBroker(3);
  const clock = { now: 10000 };
  const host = browser(broker, clock);
  await host.load('game_engine.js', engineHooks);
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

test('un mando no puede renombrar ni cambiar de equipo a otro jugador', async () => {
  const broker = createBroker();
  const clock = { now: 10000 };
  const host = browser(broker, clock);
  const first = browser(broker, clock);
  const second = browser(broker, clock);
  await host.load('game_engine.js', engineHooks);
  await first.load('controller.js', controllerHooks);
  await second.load('controller.js', controllerHooks);
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

test('el anfitrión descarta datos absurdos y nombres con caracteres de control', async () => {
  const broker = createBroker();
  const clock = { now: 10000 };
  const host = browser(broker, clock);
  const phone = browser(broker, clock);
  await host.load('game_engine.js', engineHooks);
  await phone.load('controller.js', controllerHooks);
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

test('la vista remota acota lo que publica cualquiera en el broker público', async () => {
  const broker = createBroker();
  const clock = { now: 10000 };
  const viewer = browser(broker, clock);
  await viewer.load('game_engine.js', engineHooks);
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

test('cada jefe mejora una sola vez el casco de toda la flota y permite rescatar aliados', async () => {
  const broker = createBroker();
  const clock = { now: 10000 };
  const host = browser(broker, clock);
  const phone = browser(broker, clock);
  await host.load('game_engine.js', engineHooks);
  await phone.load('controller.js', controllerHooks);
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

test('el mando limita el giro a 25 Hz, filtra temblores y entrega las acciones críticas', async () => {
  const broker = createBroker();
  const clock = { now: 10000 };
  const host = browser(broker, clock);
  const phone = browser(broker, clock);
  await host.load('game_engine.js', engineHooks);
  await phone.load('controller.js', controllerHooks);
  host.window.testGame.host();
  host.window.testGame.arena();
  const controller = phone.window.testController;
  controller.join();
  phone.flushTimers();
  const ship = host.window.testGame.ship(controller.slot());
  const sent = () => broker.delivered.filter((entry) => entry[2]?.type === 'input').length;
  controller.steer(0);
  for (let step = 1; step < 200; step++) {
    clock.now += 5;
    controller.steer(step / 10);
  }
  assert.equal(sent(), 25);
  const lastHeading = broker.delivered.at(-1)[2].heading;
  clock.now += 50;
  controller.steer(lastHeading + 0.01);
  assert.equal(sent(), 25);
  clock.now += 350;
  controller.refresh();
  assert.equal(sent(), 26, 'el heartbeat renueva el control');
  controller.steer(null, true);
  assert.equal(ship.headingInput, null, 'el anfitrión aplica la liberación dentro del throttle');
  controller.fire();
  assert.equal(ship.shotBuffer, 0.8, 'el disparo llega inmediatamente al anfitrión');
  assert.equal(sent(), 28);
});

test('una recarga sin código explícito recupera el barco y el apodo confirmados', async () => {
  const broker = createBroker();
  const clock = { now: 10000 };
  const storage = new Map();
  const host = browser(broker, clock);
  const first = browser(broker, clock, true, true, storage);
  await host.load('game_engine.js', engineHooks);
  await first.load('controller.js', controllerHooks);
  const game = host.window.testGame;
  game.host();
  game.arena();
  first.window.testController.setName('Marina');
  first.window.testController.join();
  first.flushTimers();
  const slot = first.window.testController.slot();
  const ship = game.ship(slot);
  first.window.CloudNet.disconnect();
  const reloaded = browser(broker, clock, true, true, storage);
  await reloaded.load('controller.js', controllerHooks);
  reloaded.documentEvents.get('DOMContentLoaded')();
  reloaded.flushTimers();
  assert.equal(reloaded.window.testController.room(), 'TEST');
  assert.equal(reloaded.window.testController.slot(), slot);
  assert.equal(game.ship(slot), ship);
  assert.equal(game.name(slot), 'Marina');
  assert.equal(game.connected(), 1);
  reloaded.windowEvents.get('popstate')();
  assert.equal(storage.size, 0);
  assert.equal(reloaded.window.CloudNet.isConnected(), false);
});

test('una sesión desconocida se borra al responder otro anfitrión y no ocupa un barco', async () => {
  const broker = createBroker();
  const clock = { now: 10000 };
  const storage = new Map([['barquitos_controller_session', JSON.stringify({
    roomId: 'TEST', playerId: 'u-previous', playerName: 'Capitana', expiresAt: 20000
  })]]);
  const host = browser(broker, clock);
  const phone = browser(broker, clock, true, true, storage);
  await host.load('game_engine.js', engineHooks);
  await phone.load('controller.js', controllerHooks);
  host.window.testGame.host();
  phone.documentEvents.get('DOMContentLoaded')();
  phone.flushTimers();
  assert.equal(phone.window.testController.room(), '');
  assert.equal(phone.window.testController.slot(), -1);
  assert.equal(host.window.testGame.connected(), 0);
  assert.equal(storage.size, 0);
});

test('se descarta la sesión si el broker está disponible pero el anfitrión no responde', async () => {
  const storage = new Map([['barquitos_controller_session', JSON.stringify({
    roomId: 'TEST', playerId: 'u-previous', playerName: 'Capitana', expiresAt: 60000
  })]]);
  const clock = { now: 10000 };
  const phone = browser(createBroker(), clock, true, true, storage);
  await phone.load('controller.js', controllerHooks);
  phone.documentEvents.get('DOMContentLoaded')();
  phone.flushTimers();
  phone.document.hidden = true;
  for (let step = 0; step < 10; step++) phone.tickIntervals();
  assert.equal(storage.size, 1, 'el tiempo en segundo plano no agota los reintentos');
  phone.document.hidden = false;
  for (let step = 0; step < 8; step++) {
    clock.now += 1500;
    phone.tickIntervals();
  }
  assert.equal(storage.size, 0);
  assert.equal(phone.window.testController.room(), '');
  assert.equal(phone.window.CloudNet.isConnected(), false);
});

test('se libera la plaza fantasma al volver al lobby y se conserva durante una ronda', async () => {
  const broker = createBroker();
  const clock = { now: 10000 };
  const host = browser(broker, clock);
  const phone = browser(broker, clock);
  const replacement = browser(broker, clock);
  await host.load('game_engine.js', engineHooks);
  await phone.load('controller.js', controllerHooks);
  await replacement.load('controller.js', controllerHooks);
  const game = host.window.testGame;
  game.host();
  phone.window.testController.join();
  phone.flushTimers();
  assert.equal(game.connected(), 1);

  game.arena();
  phone.window.CloudNet.disconnect();
  clock.now += 46000;
  game.expire();
  assert.equal(game.connected(), 1);
  game.lobby();
  game.expire();
  assert.equal(game.connected(), 0);

  replacement.window.testController.join();
  replacement.flushTimers();
  assert.equal(replacement.window.testController.slot(), 0);
});

test('el transporte pausa los reintentos sin red y reconecta en el evento online', async () => {
  const broker = createFlakyBroker(1);
  const host = browser(broker, { now: 10000 });
  await host.load('game_engine.js', engineHooks);
  host.window.testGame.host();
  assert.equal(host.nextTimeout(), 1000);
  host.windowEvents.get('offline')();
  assert.equal(host.nextTimeout(), undefined);
  assert.equal(host.window.CloudNet.isConnected(), false);
  host.windowEvents.get('online')();
  assert.equal(host.window.CloudNet.isConnected(), true);
  host.flushTimers();
});

test('el anfitrión vuelve del podio desde el mando 1 y sincroniza la sala con los demás mandos', async () => {
  const broker = createBroker();
  const clock = { now: 10000 };
  const host = browser(broker, clock);
  const first = browser(broker, clock);
  const second = browser(broker, clock);
  await host.load('game_engine.js', engineHooks);
  await first.load('controller.js', controllerHooks);
  await second.load('controller.js', controllerHooks);
  const game = host.window.testGame;
  game.host();
  for (const phone of [first, second]) {
    phone.window.testController.join();
    phone.flushTimers();
  }
  const menu = first.element('btn-host-lobby');
  first.window.testController.bind();
  game.podium();
  assert.equal(menu.hidden, false);
  second.window.testController.action('lobby');
  assert.equal(game.state(), 3);
  menu.fire('touchend');
  menu.fire('click');
  assert.equal(game.state(), 0);
  assert.equal(first.window.testController.state(), 'lobby');
  assert.equal(second.window.testController.state(), 'lobby');
  assert.equal(menu.hidden, true);
});

test('ready, apodo, equipo y acción de anfitrión renuevan la plaza sin enviar controles', async () => {
  for (const payload of [
    { type: 'ready', ready: true },
    { type: 'set_name', name: 'Mar' },
    { type: 'set_team', team: 'red' },
    { type: 'host_action', action: 'toggle_mode' }
  ]) {
    const broker = createBroker();
    const clock = { now: 10000 };
    const host = browser(broker, clock);
    const phone = browser(broker, clock);
    await host.load('game_engine.js', engineHooks);
    await phone.load('controller.js', controllerHooks);
    const game = host.window.testGame;
    game.host();
    phone.window.testController.join();
    phone.flushTimers();
    clock.now += 44000;
    game.raw(game.uuidOf(0), payload);
    clock.now += 2000;
    game.expire();
    assert.equal(game.connected(), 1, payload.type);
    clock.now += 44000;
    game.expire();
    assert.equal(game.connected(), 0, payload.type);
  }
});

test('el estado de munición y vida solo se envía al mando afectado y cuando cambia', async () => {
  const clock = { now: 10000 };
  const broker = createBroker();
  const host = browser(broker, clock);
  const first = browser(broker, clock);
  const second = browser(broker, clock);
  await host.load('game_engine.js', engineHooks);
  await first.load('controller.js', controllerHooks);
  await second.load('controller.js', controllerHooks);
  const game = host.window.testGame;
  game.host();
  game.arena();
  for (const phone of [first, second]) {
    phone.window.testController.join();
    phone.flushTimers();
  }
  const messages = () => broker.delivered.filter(([, , payload]) => payload.type === 'ship_status');
  game.snapshot();
  game.snapshot();
  assert.equal(messages().length, 2);
  const ship = game.ship(0);
  ship.ammo = 0;
  ship.maxAmmo = 5;
  ship.isAlive = false;
  game.snapshot();
  game.snapshot();
  assert.equal(messages().length, 3);
  assert.match(messages().at(-1)[1], new RegExp('/out/' + game.uuidOf(0) + '$'));
  assert.deepEqual(messages().at(-1)[2], { type: 'ship_status', alive: false, ammo: 0, maxAmmo: 5 });
});

test('el gamepad local maneja su propio barco y conserva el impulso del teclado al desconectarse', async () => {
  const host = browser(createBroker(), { now: 10000 });
  await host.load('game_engine.js', engineHooks);
  const game = host.window.testGame;
  game.arena();
  let pad = { connected: true, axes: [0, 0.8], buttons: [{ pressed: true }] };
  host.window.navigator.getGamepads = () => [pad];
  game.pollPad();
  const ship = game.ship(game.localSlot());
  assert.equal(ship.headingInput, Math.PI / 2);
  assert.ok(ship.headingMagnitude > 0 && ship.headingMagnitude < 1);
  assert.equal(ship.shootInput, true);
  host.windowEvents.get('keydown')({ key: 'w', preventDefault() {} });
  pad = null;
  game.pollPad();
  assert.equal(ship.headingInput, null);
  assert.equal(ship.shootInput, false);
  assert.equal(ship.thrustInput, true);
});

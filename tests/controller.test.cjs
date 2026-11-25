const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve, dirname } = require('node:path');
const { createContext, SourceTextModule, SyntheticModule } = require('node:vm');

const KEY = 'barquitos_controller_session';
const JS = resolve(__dirname, '../js');

test('el mando guarda y envía hasta 16 caracteres del apodo', async () => {
  const fixture = await controllerFixture();
  const { api, outgoing, storage } = fixture;
  api.connectToRoom('TEST');
  fixture.receive({ type: 'init', slot: 1, state: 0 });
  for (const name of ['abcdefghijklmnop', 'abcdefghijklmnopq']) {
    api.updateNickname(name, true);
    assert.equal(api.session.myCustomName, 'abcdefghijklmnop');
    assert.equal(outgoing.at(-1).name, 'abcdefghijklmnop');
    assert.equal(JSON.parse(storage.get(KEY)).playerName, 'abcdefghijklmnop');
  }
});

async function controllerFixture(initial, navigator = {}) {
  const clock = { now: 10000 };
  const outgoing = [];
  const storage = new Map(initial ? [[KEY, JSON.stringify(initial)]] : []);
  const listeners = new Map();
  const frames = [];
  let connection;
  let connected = true;
  const CloudNet = {
    isConnected: () => connected,
    initClient: (_room, _uuid, options) => {
      connection = options;
      connected = true;
      options.onReady();
    },
    sendToHost: payload => outgoing.push(payload),
    getBrokerParam: () => 'hivemq',
    disconnect: () => { connected = false; }
  };
  const window = {
    navigator,
    PointerEvent: function () {},
    requestAnimationFrame: fn => frames.push(fn),
    location: { href: 'https://test/barquitos/controller.html', search: '' },
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    },
    addEventListener: (event, fn) => listeners.set(event, fn)
  };
  const document = { hidden: false, addEventListener: (event, fn) => listeners.set(event, fn) };
  const context = createContext({
    window, document, URLSearchParams, Date: { now: () => clock.now },
    setInterval: () => 1, clearInterval() {}, setTimeout, clearTimeout
  });
  const modules = new Map([[resolve(JS, 'cloud_network.js'),
    new SyntheticModule(['CloudNet'], function () { this.setExport('CloudNet', CloudNet); }, { context })
  ]]);
  function moduleFor(path) {
    if (!modules.has(path)) {
      modules.set(path, new SourceTextModule(readFileSync(path, 'utf8'), { context, identifier: path }));
    }
    return modules.get(path);
  }
  const entry = new SourceTextModule(`
    export * from './controller/joystick.js';
    export * from './controller/session.js';
    export * from './controller/ui.js';
    export * from './gamepad.js';
    export * from './mobile_viewport.js';
  `, { identifier: resolve(JS, 'test-entry.js'), context });
  await entry.link((specifier, importer) => moduleFor(resolve(dirname(importer.identifier), specifier)));
  await entry.evaluate();
  return {
    api: entry.namespace, clock, outgoing, storage, listeners, document, CloudNet, frames,
    receive: message => connection.onMessage('', message)
  };
}

test('el joystick aislado filtra temblores y respeta 40 ms salvo disparo o liberación', async () => {
  const { api, clock, outgoing } = await controllerFixture();
  api.session.mySlot = 1;
  api.inputState.heading = 0;
  api.sendInputUpdate();
  clock.now += 39;
  api.inputState.heading = 0.3;
  api.sendInputUpdate();
  assert.equal(outgoing.length, 1);
  clock.now += 1;
  api.sendInputUpdate();
  assert.equal(outgoing.length, 2);
  clock.now += 40;
  api.inputState.heading = 0.31;
  api.sendInputUpdate();
  assert.equal(outgoing.length, 2);
  api.inputState.shoot = true;
  api.markFirePress();
  api.sendInputUpdate(true);
  assert.equal(outgoing.at(-1).firePress, clock.now);
  api.releaseInputs();
  assert.equal(outgoing.length, 4);
  assert.equal(outgoing.at(-1).heading, null);
  assert.equal(outgoing.at(-1).sh, 0);
});

test('los gestos del juego se cancelan y los campos editables conservan sus gestos', async () => {
  const { api, listeners } = await controllerFixture();
  api.bindGameZoomGuards('#gamepad-container');
  for (const eventName of ['gesturestart', 'dblclick', 'touchmove']) {
    for (const [inGame, editable, blocked] of [[true, false, true], [true, true, false], [false, false, false]]) {
      let prevented = false;
      listeners.get(eventName)({
        target: { closest: selector => selector === '#gamepad-container' ? inGame : editable },
        touches: [{}, {}],
        preventDefault: () => { prevented = true; }
      });
      assert.equal(prevented, blocked, eventName);
    }
  }
});

test('pantalla completa respeta la disponibilidad y usa la API prefijada cuando corresponde', async () => {
  const { api, document } = await controllerFixture();
  document.documentElement = { requestFullscreen: () => assert.fail('API deshabilitada') };
  document.fullscreenEnabled = false;
  assert.equal(api.fullscreenRequest(), null);
  document.documentElement.webkitRequestFullscreen = () => {
    document.webkitFullscreenElement = document.documentElement;
  };
  document.webkitExitFullscreen = () => { document.webkitFullscreenElement = null; };
  await api.toggleDocumentFullscreen();
  assert.equal(api.isDocumentFullscreen(), true);
  await api.toggleDocumentFullscreen();
  assert.equal(api.isDocumentFullscreen(), false);
});

test('la sesión se guarda al confirmar barco y se limpia al salir', async () => {
  const fixture = await controllerFixture();
  const { api, storage, CloudNet, listeners } = fixture;
  api.bindSessionEvents();
  api.connectToRoom('test');
  assert.equal(storage.size, 0);
  fixture.receive({ type: 'init', slot: 1, state: 1, name: 'Capitán 2', customName: 'Mar' });
  const saved = JSON.parse(storage.get(KEY));
  assert.equal(saved.roomId, 'TEST');
  assert.equal(saved.playerId, api.session.playerUUID);
  assert.equal(saved.playerName, 'Mar');
  assert.ok(saved.expiresAt > fixture.clock.now);
  listeners.get('popstate')();
  assert.equal(storage.size, 0);
  assert.equal(api.session.mySlot, -1);
  assert.equal(CloudNet.isConnected(), false);
});

test('el arranque elimina una sesión vencida y conserva una vigente', async () => {
  const saved = { roomId: 'TEST', playerId: 'u-existing', playerName: 'Mar', expiresAt: 10000 };
  const expired = await controllerFixture(saved);
  assert.equal(expired.api.session.currentRoom, '');
  assert.equal(expired.storage.size, 0);
  const valid = await controllerFixture({ ...saved, expiresAt: 10001 });
  assert.equal(valid.api.session.currentRoom, 'TEST');
  assert.equal(valid.api.session.playerUUID, 'u-existing');
  valid.api.connectToRoom('TEST');
  assert.equal(valid.outgoing.at(-1).type, 'rejoin');
  valid.receive({ type: 'session_expired' });
  assert.equal(valid.storage.size, 0);
});

test('Wake Lock se libera al ocultar la pestaña y se recupera al volver a la partida', async () => {
  let requested = 0;
  let released = 0;
  const fixture = await controllerFixture(undefined, { wakeLock: {
    async request(kind) {
      assert.equal(kind, 'screen');
      requested++;
      return { addEventListener() {}, async release() { released++; } };
    }
  } });
  const { api, document, listeners } = fixture;
  api.bindSessionEvents();
  api.connectToRoom('TEST');
  fixture.receive({ type: 'init', slot: 0, state: 1, name: 'Capitán 1' });
  await new Promise(setImmediate);
  assert.equal(requested, 1);
  document.hidden = true;
  listeners.get('visibilitychange')();
  assert.equal(released, 1);
  document.hidden = false;
  listeners.get('visibilitychange')();
  await new Promise(setImmediate);
  assert.equal(requested, 2);
  fixture.receive({ type: 'state_change', state: 3 });
  assert.equal(released, 2);
});

function tapButton() {
  const handlers = new Map();
  return {
    hidden: true, style: {},
    classList: {
      values: new Set(),
      add(name) { this.values.add(name); },
      remove(...names) { for (const name of names) this.values.delete(name); },
      toggle(name, enabled) { if (enabled) this.values.add(name); else this.values.delete(name); }
    },
    setAttribute(name, value) { this[name] = value; },
    addEventListener: (type, handler) => handlers.set(type, handler),
    tap: (type, values = {}) => handlers.get(type)({ preventDefault() {}, ...values })
  };
}

test('el mando anfitrión muestra Menú principal solo en podio y envía una sola acción por toque', async () => {
  const fixture = await controllerFixture();
  const { api, outgoing, clock } = fixture;
  const menu = tapButton();
  const ready = tapButton();
  api.elements.elBtnHostLobby = menu;
  api.elements.elBtnReady = ready;
  api.setupActionButtons();
  api.connectToRoom('TEST');
  fixture.receive({ type: 'init', slot: 0, state: 3, name: 'Capitán 1' });
  assert.equal(menu.hidden, false);

  menu.tap('touchend');
  clock.now += 349;
  menu.tap('click');
  const menuPackets = () => outgoing.filter(packet => packet.action === 'lobby');
  assert.equal(menuPackets().length, 1);
  assert.equal(menuPackets()[0].type, 'host_action');
  assert.equal(menuPackets()[0].uuid, api.session.playerUUID);
  clock.now++;
  menu.tap('click');
  assert.equal(menuPackets().length, 2);

  ready.tap('touchend');
  clock.now += 299;
  ready.tap('click');
  assert.deepEqual(outgoing.filter(packet => packet.type === 'ready').map(packet => packet.ready), [true]);
  clock.now++;
  ready.tap('click');
  assert.deepEqual(outgoing.filter(packet => packet.type === 'ready').map(packet => packet.ready), [true, false]);

  fixture.receive({ type: 'state_change', state: 0 });
  assert.equal(menu.hidden, true);
  fixture.receive({ type: 'init', slot: 1, state: 3, name: 'Capitán 2' });
  assert.equal(menu.hidden, true);
});

test('el permiso explícito activa el panel y las acciones fuera del puesto cero', async () => {
  const { api, receive, outgoing, clock } = await controllerFixture();
  const panel = tapButton();
  const start = tapButton();
  const mode = tapButton();
  api.elements.elHostPanel = panel;
  api.elements.elBtnHostStart = start;
  api.elements.elBtnHostMode = mode;
  api.setupActionButtons();
  api.connectToRoom('TEST');
  receive({ type: 'init', slot: 0, state: 0, isHost: false });
  assert.equal(panel.style.display, 'none');
  receive({ type: 'init', slot: 2, state: 0, isHost: true });
  assert.equal(panel.style.display, 'flex');
  mode.tap('touchend');
  mode.tap('click');
  start.tap('click');
  const actions = () => outgoing.filter(packet => packet.type === 'host_action').map(packet => packet.action);
  assert.deepEqual(actions(), ['toggle_mode', 'start']);

  receive({ type: 'state_change', state: 1 });
  assert.equal(panel.style.display, 'none');
  receive({ type: 'state_change', state: 3 });
  assert.equal(panel.style.display, 'flex');
  receive({ type: 'host_permissions', isHost: false });
  assert.equal(panel.style.display, 'none');
  clock.now += 1000;
  start.tap('click');
  assert.deepEqual(actions(), ['toggle_mode', 'start']);
  receive({ type: 'host_permissions', isHost: true });
  assert.equal(panel.style.display, 'flex');
});

test('el botón de pausa sigue el permiso y confirma su icono con el estado del motor', async () => {
  const { api, receive, outgoing, clock } = await controllerFixture();
  const pause = tapButton();
  api.elements.elBtnHostPause = pause;
  api.setupActionButtons();
  api.connectToRoom('TEST');
  receive({ type: 'init', slot: 2, state: 0, isHost: true });
  assert.equal(pause.hidden, true);
  receive({ type: 'state_change', state: 1 });
  assert.equal(pause.hidden, false);
  pause.tap('touchend');
  pause.tap('click');
  const actions = () => outgoing.filter(packet => packet.action === 'toggle_pause');
  assert.equal(actions().length, 1);
  assert.equal(pause['aria-pressed'], 'false');

  receive({ type: 'pause_state', paused: true });
  assert.equal(pause.textContent, '▶️');
  assert.equal(pause['aria-pressed'], 'true');
  clock.now += 300;
  pause.tap('click');
  assert.equal(actions().length, 2);
  receive({ type: 'pause_state', paused: false });
  assert.equal(pause.textContent, '⏸️');
  receive({ type: 'host_permissions', isHost: false });
  assert.equal(pause.hidden, true);
  clock.now += 300;
  pause.tap('click');
  assert.equal(actions().length, 2);
});

test('los estados intermedios mantienen el juego y el podio limpia los inputs y el disparo pendiente', async () => {
  const fixture = await controllerFixture();
  const { api, outgoing } = fixture;
  api.elements.elHostPanel = tapButton();
  api.elements.elBtnShoot = tapButton();
  api.connectToRoom('TEST');
  fixture.receive({ type: 'init', slot: 0, state: 1, name: 'Capitán 1' });
  api.inputState.heading = 1;
  api.inputState.thrust = true;
  api.inputState.shoot = true;
  api.markFirePress();
  for (const state of [2, 'countdown', 'round_over', 'arena']) {
    fixture.receive({ type: 'state_change', state });
    assert.equal(api.session.currentGameState, 'playing');
    assert.equal(api.elements.elBtnShoot.style.display, 'flex');
    assert.equal(api.inputState.shoot, true);
  }
  fixture.receive({ type: 'state_change', state: 'podium' });
  const release = outgoing.at(-1);
  assert.equal(release.type, 'input');
  assert.equal(release.heading, null);
  assert.equal(release.th, 0);
  assert.equal(release.sh, 0);
  assert.equal(release.firePress, 0);
});

test('la zona muerta y la curva del stick preservan los extremos y suavizan el giro leve', async () => {
  const { api } = await controllerFixture();
  assert.equal(api.stickResponse(0.1, 0.08, 0.14).heading, null);
  const half = api.stickResponse(0, 0.57, 0.14);
  assert.equal(half.heading, Math.PI / 2);
  assert.ok(Math.abs(half.magnitude - Math.pow(0.5, 1.5)) < 1e-10);
  assert.equal(api.stickResponse(-1, 0.5, 0.14).magnitude, 1);
});

test('el mando actualiza munición y hundimiento y filtra los disparos hasta revivir', async () => {
  const fixture = await controllerFixture();
  const { api, outgoing } = fixture;
  const ammo = tapButton();
  const sunk = tapButton();
  const shoot = tapButton();
  Object.assign(api.elements, { elAmmo: ammo, elSunk: sunk, elBtnShoot: shoot });
  api.connectToRoom('TEST');
  fixture.receive({ type: 'init', slot: 0, state: 1, name: 'Capitán 1' });
  fixture.receive({ type: 'ship_status', alive: true, ammo: 0, maxAmmo: 5 });
  assert.equal(ammo.textContent, '0 / 5');
  assert.equal(shoot.classList.values.has('is-empty'), true);

  fixture.receive({ type: 'ship_status', alive: false, ammo: 2, maxAmmo: 5 });
  assert.equal(sunk.hidden, false);
  api.inputState.shoot = true;
  api.markFirePress();
  api.sendInputUpdate(true);
  assert.equal(outgoing.at(-1).sh, 0);
  assert.equal(outgoing.at(-1).firePress, 0);
  fixture.receive({ type: 'ship_status', alive: true, ammo: 5, maxAmmo: 5 });
  assert.equal(sunk.hidden, true);
  assert.equal(ammo.textContent, '5 / 5');
  assert.equal(shoot.classList.values.has('is-empty'), false);
});

test('el mando físico activa el sondeo al conectarse y libera sus entradas al desconectarse', async () => {
  let pad = null;
  const { api, frames, listeners, outgoing } = await controllerFixture(undefined, {
    getGamepads: () => [pad]
  });
  api.session.mySlot = 0;
  api.session.currentGameState = 'playing';
  api.initJoystick();
  assert.equal(frames.length, 0);
  pad = { connected: true, axes: [0.1, 0], buttons: [] };
  listeners.get('gamepadconnected')();
  frames.shift()();
  assert.equal(api.inputState.heading, null);
  pad.axes = [0, -0.8];
  pad.buttons[7] = { pressed: true };
  pad.buttons[1] = { pressed: true };
  frames.shift()();
  assert.equal(outgoing.at(-1).heading, -Math.PI / 2);
  assert.equal(outgoing.at(-1).sh, 1);
  assert.equal(outgoing.at(-1).th, 1);
  pad = null;
  frames.shift()();
  assert.equal(outgoing.at(-1).heading, null);
  assert.equal(outgoing.at(-1).th, 0);
  assert.equal(outgoing.at(-1).sh, 0);
  assert.equal(frames.length, 0);
});

test('el joystick flotante nace bajo el pulgar, mide desde ese origen y vuelve al centro al cancelar', async () => {
  const { api, clock, outgoing } = await controllerFixture();
  const zone = tapButton();
  zone.setPointerCapture = () => {};
  const wheel = tapButton();
  wheel.getBoundingClientRect = () => ({ width: 100, height: 100 });
  wheel.parentElement = { getBoundingClientRect: () => ({ left: 100, top: 50, width: 200, height: 100 }) };
  wheel.style.setProperty = () => {};
  const knob = { style: {}, offsetWidth: 40 };
  Object.assign(api.elements, { elSteeringZone: zone, elWheelOuter: wheel, elWheelKnob: knob });
  api.session.mySlot = 0;
  api.initJoystick();
  zone.tap('pointerdown', { pointerId: 1, clientX: 160, clientY: 120 });
  assert.equal(wheel.style.transform, 'translate(-40px, 20px)');
  assert.equal(api.inputState.heading, null);
  clock.now += 40;
  zone.tap('pointermove', { pointerId: 1, clientX: 165, clientY: 120 });
  assert.equal(api.inputState.heading, null);
  zone.tap('pointermove', { pointerId: 1, clientX: 185, clientY: 120 });
  assert.equal(api.inputState.heading, 0);
  assert.ok(outgoing.at(-1).magnitude > 0 && outgoing.at(-1).magnitude < 1);
  zone.tap('pointercancel', { pointerId: 1 });
  assert.equal(wheel.style.transform, '');
  assert.equal(outgoing.at(-1).heading, null);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve, dirname } = require('node:path');
const { createContext, SourceTextModule, SyntheticModule } = require('node:vm');

const KEY = 'barquitos_controller_session';
const JS = resolve(__dirname, '../js');

async function controllerFixture(initial, navigator = {}) {
  const clock = { now: 10000 };
  const outgoing = [];
  const storage = new Map(initial ? [[KEY, JSON.stringify(initial)]] : []);
  const listeners = new Map();
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
  `, { identifier: resolve(JS, 'test-entry.js'), context });
  await entry.link((specifier, importer) => moduleFor(resolve(dirname(importer.identifier), specifier)));
  await entry.evaluate();
  return {
    api: entry.namespace, clock, outgoing, storage, listeners, document, CloudNet,
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
    addEventListener: (type, handler) => handlers.set(type, handler),
    tap: type => handlers.get(type)({ preventDefault() {} })
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

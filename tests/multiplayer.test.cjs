const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

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

function browser(broker, clock) {
  const windowEvents = new Map();
  const documentEvents = new Map();
  const timers = [];
  const window = {
    addEventListener: (type, callback) => windowEvents.set(type, callback),
    location: { search: '' }
  };
  const document = {
    hidden: false,
    getElementById: () => null,
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
    flushTimers() { while (timers.length) timers.shift()(); }
  };
}

const engineHooks = `
  window.testGame = {
    host: function () {
      playersData[0].connected = true;
      playersData[0].ready = true;
      updateLobbyShips();
      window.CloudNet.initHost("TEST", {
        onMessage: function (topic, msg) { handleIncomingMessage(msg); }
      });
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
    winner: function (name) { roundWinner = name ? { name: name } : null; },
    snapshot: function () { broadcastGameState(); },
    visibleWinner: function () { return roundWinner && roundWinner.name; }
  };
`;

const controllerHooks = `
  window.testController = {
    join: function () { connectToRoom("TEST"); },
    slot: function () { return mySlot; },
    state: function () { return currentGameState; },
    hold: function () {
      inputState.turn = 1;
      inputState.thrust = true;
      inputState.shoot = true;
      sendInputUpdate(true);
    },
    refresh: function () { sendInputUpdate(); }
  };
`;

function assertInputs(ship, active) {
  assert.equal(ship.turnInput, active ? 1 : 0);
  assert.equal(ship.thrustInput, active);
  assert.equal(ship.shootInput, active);
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
  assert.equal(slot, 1);
  assert.equal(controller.state(), 'playing');

  const ship = game.ship(slot);
  controller.hold();
  assertInputs(ship, true);
  clock.now += 400;
  controller.refresh();
  clock.now += 1100;
  game.expire();
  assertInputs(ship, true);

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

const { test, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

let state, initialState, Ship, Cannonball, arenaBounds, STATE_ARENA, stepBattlePhysics, initArenaIslands;

before(async () => {
  global.window = { location: { search: '' }, addEventListener() {} };
  global.document = { getElementById: () => null };
  ({ state } = await import('../js/engine/state.js'));
  ({ Ship, Cannonball } = await import('../js/engine/entities.js'));
  ({ arenaBounds, STATE_ARENA } = await import('../js/engine/config.js'));
  ({ stepBattlePhysics } = await import('../js/engine/physics.js'));
  ({ initArenaIslands } = await import('../js/engine/modes.js'));
  initialState = structuredClone(state);
});

beforeEach(() => Object.assign(state, structuredClone(initialState)));

test('una bala en movimiento impacta en una isla y se retira de la arena', () => {
  initArenaIslands();
  const { x, y, rad } = state.islands[0];
  const ball = new Cannonball(x - rad - 10, y, 1, 0, 0, false);
  state.cannonballs.push(ball);
  stepBattlePhysics(0.03);
  assert.equal(ball.isDead, true);
  assert.equal(state.cannonballs.length, 0);
});

test('dos barcos en contacto reciben impulsos en sentidos opuestos', () => {
  const first = new Ship(0, 500, 500, 0);
  const second = new Ship(1, 525, 500, 0);
  state.activeShips.push(first, second);
  stepBattlePhysics(0);
  assert.ok(first.vx < 0);
  assert.ok(second.vx > 0);
  assert.equal(first.health, first.maxHealth);
  assert.equal(second.health, second.maxHealth);
});

test('el borde devuelve barcos a la arena y elimina proyectiles', () => {
  const ship = new Ship(0, arenaBounds.x + 10, 500, 0);
  ship.vx = -80;
  const ball = new Cannonball(arenaBounds.x + 5, 500, -1, 0, 0, false);
  state.activeShips.push(ship);
  state.cannonballs.push(ball);
  stepBattlePhysics(0.03);
  assert.equal(ship.x, arenaBounds.x + 22);
  assert.ok(ship.vx > 0);
  assert.equal(ball.isDead, true);

  state.currentState = STATE_ARENA;
  state.suddenDeathActive = true;
  state.currentBounds.x += 50;
  ship.x = state.currentBounds.x - 1;
  stepBattlePhysics(0);
  assert.equal(ship.isAlive, false);
});

test('una bala reutilizada reinicia los datos de dueño, tipo y recorrido', async () => {
  const { spawnCannonball, removeCannonball } = await import('../js/engine/entities.js');
  spawnCannonball(30, 40, 1, 0, -1, true, 2, 'red');
  const previous = state.cannonballs[0];
  previous.dist = 25;
  previous.isDead = true;
  removeCannonball(0);
  spawnCannonball(100, 200, 0, 1, 3, false);
  const next = state.cannonballs[0];
  assert.equal(next, previous);
  assert.deepEqual(
    [next.x, next.y, next.dx, next.dy, next.shooterSlot, next.shooterTeam, next.damage,
      next.isPirate, next.isBossShot, next.dist, next.isDead, next.speed, next.maxDist],
    [100, 200, 0, 1, 3, null, 1, false, false, 0, false, 700, 580]
  );
});

test('una partícula reutilizada reinicia gravedad, color y duración', async () => {
  const { addParticle, clearParticles } = await import('../js/engine/effects.js');
  addParticle(1, 2, 3, 4, 5, 'red', 2, 300);
  const previous = state.particles[0];
  clearParticles();
  addParticle(6, 7, 8, 9, 10, 'blue', 1);
  assert.equal(state.particles[0], previous);
  assert.deepEqual(previous, {
    x: 6, y: 7, vx: 8, vy: 9, radius: 10, color: 'blue', life: 1, maxLife: 1, gravity: 0
  });
});

test('el mapa redibuja las capas solo al cambiar ronda, islas o viewport', async () => {
  const { getMapCache } = await import('../js/engine/map_cache.js');
  const { createElement: oldCreateElement } = document;
  let created = 0;
  let cleared = 0;
  document.createElement = () => {
    created++;
    return {
      getContext: () => ({
        clearRect: () => { cleared++; },
        createLinearGradient: () => ({ addColorStop() {} }),
        fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}
      })
    };
  };
  try {
    const islands = [];
    const first = getMapCache(islands, 960, 540, 1);
    assert.equal(getMapCache(islands, 960, 540, 1), first);
    assert.equal(cleared, 2);
    getMapCache(islands, 960, 540, 2);
    getMapCache(islands, 1280, 720, 2);
    getMapCache([], 1280, 720, 2);
    assert.equal(cleared, 8);
    getMapCache(islands, 1280, 720, 2);
    getMapCache(islands, 1280, 720, 2, 1);
    assert.equal(getMapCache(islands, 1280, 720, 2, 1).mode, 1);
    assert.equal(cleared, 12);
    assert.equal(created, 2);
  } finally {
    document.createElement = oldCreateElement;
  }
});

test('el reloj suma 60 ticks por segundo a 60, 120 y 144 Hz y descarta el tiempo oculto', async () => {
  const { createFixedClock } = await import('../js/engine/game_loop.js');
  for (const hz of [60, 120, 144]) {
    let ticks = 0;
    const clock = createFixedClock(step => {
      assert.equal(step, 1 / 60);
      ticks++;
    });
    for (let frame = 0; frame <= hz; frame++) clock.advance(frame * 1000 / hz);
    assert.equal(ticks, 60, `${hz} Hz`);
    clock.advance(5000);
    assert.equal(ticks, 66, 'un frame lento aporta como máximo 0,1 s');
    clock.reset();
    assert.equal(clock.advance(30000), 0);
    assert.equal(ticks, 66);
    clock.advance(30000 + 1000 / 60);
    assert.equal(ticks, 67);
  }
});

test('el bus desduplica suscripciones y permite cancelar o limpiar listeners', async () => {
  const { createEventBus } = await import('../js/engine/events.js');
  const bus = createEventBus();
  const calls = [];
  const listener = slot => calls.push(slot);
  const unsubscribe = bus.on('ship:hud', listener);
  bus.on('ship:hud', listener);
  bus.emit('ship:hud', 1);
  unsubscribe();
  bus.emit('ship:hud', 2);
  bus.on('ship:hud', listener);
  bus.clear();
  bus.emit('ship:hud', 3);
  assert.deepEqual(calls, [1]);
});

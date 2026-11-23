const { test, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

let state, initialState, config, modes, Cannonball, stepBattlePhysics, getSafeSpawnPoint, isInsideIsland;
before(async () => {
  global.window = { location: { search: '' }, addEventListener() {} };
  global.document = { getElementById: () => null };
  ({ state } = await import('../js/engine/state.js'));
  ({ Cannonball } = await import('../js/engine/entities.js'));
  ({ stepBattlePhysics, getSafeSpawnPoint, isInsideIsland } = await import('../js/engine/physics.js'));
  config = await import('../js/engine/config.js');
  modes = await import('../js/engine/modes.js');
  initialState = structuredClone(state);
});
beforeEach(() => Object.assign(state, structuredClone(initialState)));

function start(mode) {
  state.playersData[0].connected = true;
  state.playersData[1].connected = true;
  state.selectedMode = mode;
  modes.startNewMatch();
  state.countdownTime = 0;
}

test('cada modo tiene sus islas y Horda conserva las cinco originales', () => {
  const maps = [0, 1, 2].map(mode => {
    modes.initArenaIslands(mode);
    return state.islands.map(({ x, y, rad }) => [x, y, rad]);
  });
  assert.equal(new Set(maps.map(map => JSON.stringify(map))).size, 3);
  assert.deepEqual(maps.map(map => map.length), [6, 6, 5]);
  assert.deepEqual(maps[2], [[960, 540, 70], [600, 330, 55], [1320, 750, 55], [600, 750, 52], [1320, 330, 52]]);
  assert.ok(maps[1].every(([x, y, r]) => maps[1].some(other =>
    other[0] === 1920 - x && other[1] === y && other[2] === r)));
});

test('los barcos y las cajas aparecen separados de las islas en los tres mapas', () => {
  for (const mode of [0, 1, 2]) {
    for (const count of [2, 3, 4, 5, 6, 7, 8]) {
      Object.assign(state, structuredClone(initialState));
      state.playersData.forEach((player, slot) => {
        player.connected = slot < count;
        player.team = slot === 0 ? 'blue' : 'red';
      });
      start(mode);
      assert.equal(state.activeShips.length, count);
      for (const ship of state.activeShips) assert.equal(isInsideIsland(ship.x, ship.y, 34), false);
      for (const crate of state.ammoCrates) assert.equal(isInsideIsland(crate.x, crate.y, 36), false);
    }
    const { x, y } = state.islands[0];
    const bounds = state.currentBounds;
    const values = [(x - bounds.x - 80) / (bounds.w - 160), (y - bounds.y - 80) / (bounds.h - 160)];
    const savedRandom = Math.random;
    let attempt = 0;
    try {
      Math.random = () => values[attempt++ % 2];
      const point = getSafeSpawnPoint(bounds, 40);
      assert.equal(attempt, 60);
      assert.equal(isInsideIsland(point.x, point.y, 40), false);
    } finally {
      Math.random = savedRandom;
    }
  }
});

test('el ganador cobra un punto por ronda y la décima ronda termina en podio', () => {
  start(config.MODE_BATTLE);
  for (let round = 1; round <= config.TOTAL_ROUNDS; round++) {
    assert.equal(state.currentRound, round);
    state.countdownTime = 0;
    state.activeShips[1].isAlive = false;
    modes.updateBattle(0);
    assert.equal(state.playersData[0].score, round);
    modes.updateBattle(3.5);
  }
  assert.equal(state.currentState, config.STATE_PODIUM);
  assert.equal(state.matchWinner.slot, 0);
});

test('los disparos respetan el fuego amigo y se puntúa por equipo superviviente', () => {
  state.playersData[2].connected = true;
  start(config.MODE_TEAMS);
  const ally = state.activeShips.find(ship => ship.slot === 2);
  const enemy = state.activeShips.find(ship => ship.slot === 1);
  state.cannonballs.push(new Cannonball(ally.x, ally.y, 1, 0, 0, false, 1, 'blue'));
  stepBattlePhysics(0);
  assert.equal(ally.health, ally.maxHealth);
  state.cannonballs.push(new Cannonball(enemy.x, enemy.y, 1, 0, 0, false, 1, 'blue'));
  stepBattlePhysics(0);
  assert.equal(enemy.health, enemy.maxHealth - 1);
  enemy.isAlive = false;
  modes.updateBattle(0);
  assert.deepEqual(state.teamScores, { blue: 1, red: 0 });
});

test('Horda escala los piratas por oleada y añade un jefe cada diez', () => {
  start(config.MODE_HORDE);
  assert.equal(state.waveEnemiesToSpawn, 3);
  function nextWave(current) {
    state.currentWave = current;
    state.waveEnemiesToSpawn = 0;
    state.pirateShips.length = 0;
    state.bossGalleon = null;
    state.waveIntermissionTimer = 4.49;
    modes.updateHorde(0.02);
  }
  nextWave(8);
  assert.equal(state.currentWave, 9);
  assert.equal(state.waveEnemiesToSpawn, 11);
  assert.equal(state.bossGalleon, null);
  nextWave(9);
  assert.equal(state.currentWave, 10);
  assert.equal(state.waveEnemiesToSpawn, 2);
  assert.equal(state.bossGalleon.rank, 1);
  const firstBossHealth = state.bossGalleon.maxHealth;
  nextWave(19);
  assert.equal(state.currentWave, 20);
  assert.equal(state.bossGalleon.rank, 2);
  assert.ok(state.bossGalleon.maxHealth > firstBossHealth);
});

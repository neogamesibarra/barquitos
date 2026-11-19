const { test, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

let state, initialState, config, modes, Cannonball, stepBattlePhysics;
before(async () => {
  global.window = { location: { search: '' }, addEventListener() {} };
  global.document = { getElementById: () => null };
  ({ state } = await import('../js/engine/state.js'));
  ({ Cannonball } = await import('../js/engine/entities.js'));
  ({ stepBattlePhysics } = await import('../js/engine/physics.js'));
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

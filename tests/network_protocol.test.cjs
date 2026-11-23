const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let protocol;
before(async () => { protocol = await import('../js/engine/network_protocol.js'); });

test('el protocolo rechaza JSON inválido y mensajes sin un tipo de texto', () => {
  for (const input of ['{', 'null', '[]', '42', '{}', '{"type":1}']) {
    assert.equal(protocol.decodeMessage(input), null, input);
  }
  assert.deepEqual(protocol.decodeMessage('{"type":"join"}'), { type: 'join' });
});

test('los controles normalizan ángulos, cotas y timestamps inválidos', () => {
  assert.deepEqual(protocol.decodeInput({ type: 'input', heading: '0', t: {}, firePress: Infinity }), {
    heading: null, thrust: false, shoot: false, turn: 0, firePress: undefined
  });
  assert.deepEqual(protocol.decodeInput({ type: 'input', heading: -Math.PI, th: 1, sh: 1, turn: -25, firePress: 100 }), {
    heading: Math.PI, thrust: true, shoot: true, turn: -1, firePress: 100
  });
  assert.equal(protocol.syncCoord(Infinity), 0);
  assert.equal(protocol.syncCoord(-1e9), -20000);
  assert.equal(protocol.syncCoord(1e9), 20000);
  assert.equal(protocol.sanitizeUuid('__ bad'), '');
  assert.equal(protocol.sanitizeNickname('  Mar\u0000   Azul   '), 'Mar Azul');
  assert.equal(protocol.sanitizeNickname('abcdefghijklmnop'), 'abcdefghijklmnop');
  assert.equal(protocol.sanitizeNickname('  abcdefghijklmnopq  '), 'abcdefghijklmnop');
});

test('un snapshot inválido no crea colecciones falsas y acepta el estado legado', () => {
  assert.equal(protocol.decodeSnapshot([]), null);
  const missing = protocol.decodeSnapshot({});
  assert.equal(missing.sh, undefined);
  assert.equal(missing.rw, null);
  const normalized = protocol.decodeSnapshot({
    st: 'playing', sh: [null, [], {}, [0, 5, 6]], cb: 'incorrecto', ts: [], up: 5, rw: 4
  });
  assert.equal(normalized.st, 1);
  assert.deepEqual(normalized.sh, [[0, 5, 6]]);
  assert.equal(normalized.cb, undefined);
  assert.equal(normalized.ts, null);
  assert.equal(normalized.up, null);
  assert.equal(normalized.rw, null);
  assert.equal(protocol.decodeSnapshot({ st: 999 }).st, undefined);
});

test('un snapshot de Horda conserva el formato compacto tras serializar y leer', async () => {
  const { state } = await import('../js/engine/state.js');
  const input = {
    ...state, waveAnim: 1.236, currentWave: 100,
    cannonballs: [
      { x: 10.9, y: -1.4, dx: 0.333, dy: -0.666, isPirate: true, isBossShot: true },
      { isDead: true }
    ]
  };
  const encoded = protocol.encodeSnapshot(input);
  const packet = protocol.decodeMessage(protocol.encodeMessage(encoded));
  assert.equal(packet.type, 'sync');
  assert.equal(packet.swellTime, 1.24);
  assert.equal(packet.w, 100);
  assert.deepEqual(packet.cb, [[11, -1, 0.33, -0.67, 1, 'blue', 1]]);
  assert.deepEqual(protocol.decodeSnapshot(packet).up, state.hordeUpgrades);
});

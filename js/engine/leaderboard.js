import { HORDE_LEADERBOARD_URL } from "./config.js";

const STORAGE_KEY = "barquitos_horde_top10";
const LIMIT = 10;

/** @typedef {{id: string, wave: number, score: number, players: string[], date: string}} Entry */

function topScores(...collections) {
  /** @type {Map<string, Entry>} */
  const unique = new Map();
  for (const collection of collections) {
    if (!collection || typeof collection !== "object") continue;
    for (const item of Object.values(collection)) {
      if (!item || !Number.isSafeInteger(item.wave) || item.wave < 1 ||
          !Number.isSafeInteger(item.score) || item.score < 0 || !Array.isArray(item.players)) continue;
      const players = item.players.filter(name => typeof name === "string")
        .slice(0, 8).map(name => name.trim().slice(0, 32)).filter(Boolean);
      if (!players.length) continue;
      const date = typeof item.date === "string" ? item.date.slice(0, 32) : "";
      const id = typeof item.id === "string" && item.id ? item.id.slice(0, 128) :
        JSON.stringify([date, item.wave, item.score, players]);
      unique.set(id, { id, wave: item.wave, score: item.score, players, date });
    }
  }
  return [...unique.values()].sort((a, b) =>
    b.wave - a.wave || b.score - a.score || a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
  ).slice(0, LIMIT);
}

function readLocal() {
  try { return topScores(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null")); }
  catch { return []; }
}

/** @param {Entry[]} entries */
function saveLocal(entries) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }
  catch { /* Storage may be blocked. The current results stay available in memory. */ }
}

function requestOptions() {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? { signal: AbortSignal.timeout(4000) } : {};
}

async function getHordeLeaderboard() {
  if (HORDE_LEADERBOARD_URL) {
    try {
      const response = await fetch(HORDE_LEADERBOARD_URL, { ...requestOptions(), cache: "no-store" });
      if (response.ok) {
        const entries = topScores(await response.json());
        saveLocal(topScores(readLocal(), entries));
        return entries;
      }
    } catch { /* Use the offline copy. */ }
  }
  return readLocal();
}

/** @param {{wave: number, score: number, players: string[]}} result */
async function recordHordeScore(result) {
  const date = new Date().toISOString();
  const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID() : date + "-" + Math.random().toString(36).slice(2);
  const entry = { ...result, id, date };
  const local = topScores(readLocal(), [entry]);
  saveLocal(local);

  if (HORDE_LEADERBOARD_URL) {
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await fetch(HORDE_LEADERBOARD_URL, {
          ...requestOptions(), cache: "no-store", headers: { "X-Firebase-ETag": "true" }
        });
        if (!response.ok) break;
        const entries = topScores(await response.json(), local, readLocal(), [entry]);
        const etag = response.headers?.get("ETag");
        const headers = { "Content-Type": "application/json", ...(etag ? { "If-Match": etag } : {}) };
        const saved = await fetch(HORDE_LEADERBOARD_URL, {
          ...requestOptions(), method: "PUT", headers, body: JSON.stringify(entries)
        });
        if (saved.status === 412) continue;
        if (!saved.ok) break;
        saveLocal(topScores(readLocal(), entries));
        return { entries, entry, global: true };
      }
    } catch { /* Keep the locally recorded score when Firebase is unavailable. */ }
  }
  return { entries: topScores(local, readLocal()), entry, global: false };
}

export { getHordeLeaderboard, recordHordeScore };

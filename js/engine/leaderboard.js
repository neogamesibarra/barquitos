import { HORDE_LEADERBOARD_URL } from "./config.js";

import { sanitizeNickname } from "./network_protocol.js";

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
      const players = item.players.map(sanitizeNickname).filter(Boolean).slice(0, 8);
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

function getLocalHordeLeaderboard() {
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
        saveLocal(topScores(getLocalHordeLeaderboard(), entries));
        return entries;
      }
      console.warn("[Horda Pirata] Firebase GET HTTP " + response.status);
    } catch { /* Use the offline copy. */ }
  }
  return getLocalHordeLeaderboard();
}

/** @param {{wave: number, score: number, players: string[]}} result */
async function recordHordeScore(result) {
  const date = new Date().toISOString();
  const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID() : date + "-" + Math.random().toString(36).slice(2);
  const entry = { ...result, id, date };
  const local = topScores(getLocalHordeLeaderboard(), [entry]);
  saveLocal(local);

  if (HORDE_LEADERBOARD_URL) {
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await fetch(HORDE_LEADERBOARD_URL, {
          ...requestOptions(), cache: "no-store", headers: { "X-Firebase-ETag": "true" }
        });
        if (!response.ok) {
          console.warn("[Horda Pirata] Firebase GET HTTP " + response.status);
          break;
        }
        const entries = topScores(await response.json(), local, getLocalHordeLeaderboard(), [entry]);
        const etag = response.headers?.get("ETag");
        const headers = { "Content-Type": "application/json", ...(etag ? { "If-Match": etag } : {}) };
        const saved = await fetch(HORDE_LEADERBOARD_URL, {
          ...requestOptions(), method: "PUT", headers, body: JSON.stringify(entries)
        });
        if (saved.status === 412 && attempt < 2) continue;
        if (!saved.ok) {
          console.warn("[Horda Pirata] Firebase PUT HTTP " + saved.status);
          break;
        }
        saveLocal(topScores(getLocalHordeLeaderboard(), entries));
        return { entries, entry, global: true };
      }
    } catch { /* Keep the locally recorded score when Firebase is unavailable. */ }
  }
  return { entries: topScores(local, getLocalHordeLeaderboard()), entry, global: false };
}

export { getHordeLeaderboard, getLocalHordeLeaderboard, recordHordeScore };

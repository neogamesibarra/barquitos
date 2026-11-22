import { CloudNet } from "../cloud_network.js";
import { MODE_BATTLE, MODE_HORDE, MODE_TEAMS, STATE_ARENA, STATE_LOBBY, STATE_PODIUM } from "./config.js";
import { ensureLocalPlayer, releaseLocalInputs, updateLocalPlayerButton } from "./controls.js";
import { updateLobbyShips } from "./entities.js";
import { startNewMatch } from "./modes.js";
import { broadcastCurrentMode, sendTvAction, setGamePaused, withBrokerParam } from "./multiplayer.js";
import { updateHordeLeaderboardVisibility, updateShipHUD } from "./hud.js";
import { state } from "./state.js";
import { fitLobby } from "./viewport.js";
import { sanitizeNickname } from "./network_protocol.js";

function updateRemoteTeamUI() {
  const btnB = document.getElementById("remote-btn-blue");
  const btnR = document.getElementById("remote-btn-red");
  if (btnB) btnB.className = "remote-team-btn blue" + (state.mySelectedTeam === "blue" ? " active" : "");
  if (btnR) btnR.className = "remote-team-btn red" + (state.mySelectedTeam === "red" ? " active" : "");
}

function updateRemoteTeamVisibility() {
  const toggleBox = document.getElementById("remote-team-toggle");
  if (toggleBox) {
    toggleBox.style.display = (state.selectedMode === MODE_TEAMS) ? "flex" : "none";
  }
}

function setupFullscreenButton() {
  const fsBtn = document.getElementById("btn-fullscreen-toggle");
  if (!fsBtn) return;
  const fsIcon = document.getElementById("fs-icon");
  const fsLabel = fsBtn.querySelector ? fsBtn.querySelector(".fs-label") : (document.querySelector ? document.querySelector("#btn-fullscreen-toggle .fs-label") : null);

  function isFullscreen() {
    return Boolean(document.fullscreenElement);
  }

  function updateFsState() {
    if (isFullscreen()) {
      if (fsBtn.classList && fsBtn.classList.add) fsBtn.classList.add("is-fullscreen");
      if (fsIcon) fsIcon.textContent = "🗗";
      if (fsLabel) fsLabel.textContent = "SALIR PANTALLA";
    } else {
      if (fsBtn.classList && fsBtn.classList.remove) fsBtn.classList.remove("is-fullscreen");
      if (fsIcon) fsIcon.textContent = "⛶";
      if (fsLabel) fsLabel.textContent = "PANTALLA COMPLETA";
    }
  }

  async function toggleFullscreen() {
    try {
      if (isFullscreen()) await document.exitFullscreen?.();
      else await document.documentElement.requestFullscreen?.();
    } catch (error) {
      console.warn("Fullscreen toggle failed:", error);
    }
    updateFsState();
  }

  fsBtn.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", updateFsState);

  updateFsState();
}

function setupRemotePlayerBarEvents() {
  const inpNick = /** @type {HTMLInputElement|null} */ (document.getElementById("remote-nickname-input"));
  if (inpNick) {
    try {
      const sNick = window.localStorage.getItem("barquitos_nickname") || "";
      if (sNick) {
        state.myCustomNickname = sNick;
        inpNick.value = sNick;
      }
    } catch(e){}

    function syncNick() {
      const val = (inpNick.value || "").trim().slice(0, 12);
      state.myCustomNickname = val;
      try { window.localStorage.setItem("barquitos_nickname", val); } catch(e){}
      if (CloudNet && CloudNet.isConnected()) {
        CloudNet.sendToHost({
          type: "set_name",
          uuid: state.myPlayerUUID,
          name: val
        });
      }
    }
    inpNick.addEventListener("input", syncNick, false);
    inpNick.addEventListener("change", syncNick, false);
  }

  const btnBlue = document.getElementById("remote-btn-blue");
  const btnRed = document.getElementById("remote-btn-red");
  function chooseTeam(team) {
    state.mySelectedTeam = team;
    try { window.localStorage.setItem("barquitos_team", team); } catch(e){}
    updateRemoteTeamUI();
    if (CloudNet && CloudNet.isConnected()) {
      CloudNet.sendToHost({
        type: "set_team",
        uuid: state.myPlayerUUID,
        slot: state.remoteSlot,
        team: team
      });
    }
  }
  if (btnBlue) {
    btnBlue.onclick = () => { chooseTeam("blue"); };
  }
  if (btnRed) {
    btnRed.onclick = () => { chooseTeam("red"); };
  }

  const btnReady = document.getElementById("remote-btn-ready");
  if (btnReady) {
    btnReady.onclick = () => {
      state.isClientReady = !state.isClientReady;
      btnReady.className = "remote-ready-btn" + (state.isClientReady ? " active" : "");
      btnReady.textContent = state.isClientReady ? "LISTO ✓" : "PREPARARSE";
      if (CloudNet && CloudNet.isConnected()) {
        CloudNet.sendToHost({
          type: "ready",
          uuid: state.myPlayerUUID,
          ready: state.isClientReady
        });
      }
    };
  }

  const btnBecomeHost = document.getElementById("btn-become-host");
  if (btnBecomeHost) {
    btnBecomeHost.onclick = () => {
      window.location.href = window.location.pathname;
    };
  }

  const btnOpenCtl = document.getElementById("btn-open-controller-quick");
  if (btnOpenCtl) {
    btnOpenCtl.onclick = () => {
      window.location.href = "controller.html?room=" + encodeURIComponent(state.currentRoomCode);
    };
  }
}

function setupInviteButtons() {
  let baseHref = window.location.href.split("?")[0].split("#")[0];
  if (baseHref.indexOf("/controller.html") !== -1) {
    baseHref = baseHref.replace("/controller.html", "/index.html");
  }
  const onlineInviteUrl = withBrokerParam(baseHref + "?sala=" + state.currentRoomCode);

  const btnCopy = document.getElementById("btn-copy-invite");
  const copyFeed = document.getElementById("copy-feedback");

  if (btnCopy) {
    btnCopy.onclick = async () => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(onlineInviteUrl);
          showCopyResult(true);
          return;
        }
        // El acceso por HTTP en una red local puede carecer de Clipboard API.
        const field = document.createElement("textarea");
        field.value = onlineInviteUrl;
        document.body.appendChild(field);
        try {
          field.select();
          showCopyResult(document.execCommand("copy"));
        } finally {
          field.remove();
        }
      } catch {
        showCopyResult(false);
      }
    };
    function showCopyResult(copied) {
      if (copyFeed) {
        copyFeed.textContent = copied ? "¡Enlace copiado!" : "Copia este enlace: " + onlineInviteUrl;
        copyFeed.style.display = "block";
        setTimeout(() => {
          copyFeed.style.display = "none";
        }, copied ? 3500 : 15000);
      }
    }
  }

  const btnOpenJoin = document.getElementById("btn-open-join-modal");
  const joinModal = document.getElementById("join-modal");
  const btnConfirmJoin = document.getElementById("btn-confirm-join");
  const btnJoinCtl = document.getElementById("btn-join-controller");
  const btnCancelJoin = document.getElementById("btn-cancel-join");
  const inputJoinRoom = /** @type {HTMLInputElement|null} */ (document.getElementById("input-join-room"));
  const inputJoinName = /** @type {HTMLInputElement|null} */ (document.getElementById("input-join-name"));

  if (btnOpenJoin && joinModal) {
    btnOpenJoin.onclick = () => {
      joinModal.style.display = "flex";
      if (inputJoinRoom) {
        inputJoinRoom.value = "";
        inputJoinRoom.focus();
      }
    };
  }

  if (btnCancelJoin && joinModal) {
    btnCancelJoin.onclick = () => {
      joinModal.style.display = "none";
    };
  }

  function doJoin(asController) {
    const codeVal = (inputJoinRoom.value || "").trim().toUpperCase();
    if (codeVal.length >= 3) {
      const nameVal = (inputJoinName ? inputJoinName.value : "").trim();
      if (nameVal) {
        try { window.localStorage.setItem("barquitos_nickname", nameVal); } catch(e){}
      }
      if (asController) {
        window.location.href = "controller.html?room=" + encodeURIComponent(codeVal);
      } else {
        window.location.href = "index.html?sala=" + encodeURIComponent(codeVal);
      }
    } else {
      alert("Por favor ingresa un código de sala válido de 4 letras");
    }
  }

  if (btnConfirmJoin && joinModal && inputJoinRoom) {
    btnConfirmJoin.onclick = () => {
      doJoin(false);
    };
  }

  if (btnJoinCtl && joinModal && inputJoinRoom) {
    btnJoinCtl.onclick = () => {
      doJoin(true);
    };
  }
}

/** @type {Map<number, {row: HTMLLIElement, name: HTMLSpanElement, team: HTMLSpanElement, ready: HTMLSpanElement}>} */
const rosterRows = new Map();

/** @param {number} slot */
function createRosterRow(slot) {
  const row = document.createElement("li");
  row.className = "lobby-player";
  row.innerHTML = '<svg class="lobby-player-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11 3h2v13h9l-4 5H6l-4-5h9zm3 1 5 10h-5zM9 7v7H5z"/></svg>';
  const name = document.createElement("span");
  name.className = "lobby-player-name";
  const team = document.createElement("span");
  team.className = "lobby-player-team";
  const ready = document.createElement("span");
  ready.className = "lobby-player-ready";
  ready.textContent = "Listo";
  row.append(name, team, ready);
  const card = { row, name, team, ready };
  rosterRows.set(slot, card);
  return card;
}

/** Updates the roster in place so its entrance animation runs only for new cards. */
function updateLobbyRoster() {
  const list = document.getElementById("lobby-roster-list");
  if (!list) return;
  let count = 0;
  for (const profile of state.playersData) {
    const remoteShip = state.isRemoteClient ? state.activeShips.find(ship => ship.slot === profile.slot) : null;
    const captain = state.isRemoteClient ? remoteShip?.data : profile.connected ? profile : null;
    let card = rosterRows.get(profile.slot);
    if (!captain) {
      if (card) {
        card.row.remove();
        rosterRows.delete(profile.slot);
      }
      continue;
    }
    count++;
    if (!card) {
      card = createRosterRow(profile.slot);
      list.append(card.row);
    }
    const name = captain.customName || captain.name;
    const team = captain.team === "red" ? "Rojo" : "Azul";
    if (card.name.textContent !== name) card.name.textContent = name;
    if (card.team.textContent !== team) card.team.textContent = team;
    if (card.team.dataset.team !== captain.team) card.team.dataset.team = captain.team;
    const hideTeam = state.selectedMode !== MODE_TEAMS;
    if (card.team.hidden !== hideTeam) card.team.hidden = hideTeam;
    const hideReady = state.isRemoteClient || !captain.ready;
    if (card.ready.hidden !== hideReady) card.ready.hidden = hideReady;
    if (card.row.style.getPropertyValue("--captain-color") !== captain.hull) {
      card.row.style.setProperty("--captain-color", captain.hull);
    }
  }
  const empty = document.getElementById("lobby-roster-empty");
  if (empty && empty.hidden !== (count > 0)) empty.hidden = count > 0;
}

function updateLobbyModeUI() {
  const b1 = document.getElementById("btn-mode-battle");
  const b2 = document.getElementById("btn-mode-teams");
  const b3 = document.getElementById("btn-mode-horde");
  if (b1) {
    const selected = state.selectedMode === MODE_BATTLE;
    b1.className = selected ? "mode-btn active" : "mode-btn";
    b1.setAttribute?.("aria-pressed", String(selected));
  }
  if (b2) {
    const selected = state.selectedMode === MODE_TEAMS;
    b2.className = selected ? "mode-btn active" : "mode-btn";
    b2.setAttribute?.("aria-pressed", String(selected));
  }
  if (b3) {
    const selected = state.selectedMode === MODE_HORDE;
    b3.className = selected ? "mode-btn active" : "mode-btn";
    b3.setAttribute?.("aria-pressed", String(selected));
  }
}

function updateLobbyPermissions() {
  const canManage = !state.isRemoteClient || state.remoteIsHost;
  const start = /** @type {HTMLButtonElement|null} */ (document.getElementById("btn-start-game"));
  if (start) {
    start.style.display = canManage ? "" : "none";
    start.disabled = !canManage;
  }
  const ids = ["btn-mode-battle", "btn-mode-teams", "btn-mode-horde"];
  for (let i = 0; i < ids.length; i++) {
    const modeButton = /** @type {HTMLButtonElement|null} */ (document.getElementById(ids[i]));
    if (modeButton) modeButton.disabled = !canManage;
  }
}

function requestLobbyAction(action, mode) {
  const leavingPause = !state.isRemoteClient && state.currentState === STATE_ARENA &&
    state.isPaused && action === "lobby";
  if (!leavingPause && state.currentState !== STATE_LOBBY && state.currentState !== STATE_PODIUM) return;
  if (state.isRemoteClient) {
    if (!state.remoteIsHost || !CloudNet) return;
    CloudNet.sendToHost({ type: "host_action", uuid: state.myPlayerUUID, action: action, mode: mode });
  } else if (action === "start") {
    startNewMatch();
  } else if (action === "set_mode") {
    state.selectedMode = mode;
    updateHordeLeaderboardVisibility();
    updateLobbyModeUI();
    broadcastCurrentMode();
  } else if (action === "lobby") {
    setGamePaused(false);
    releaseLocalInputs();
    state.currentState = STATE_LOBBY;
    updateHordeLeaderboardVisibility();
    updateLobbyShips();
    sendTvAction("state_change", null, STATE_LOBBY);
  }
}

function updatePodiumActions() {
  const panel = document.getElementById("podium-actions");
  if (panel) panel.style.display = state.currentState === STATE_PODIUM && (!state.isRemoteClient || state.remoteIsHost) ? "flex" : "none";
}

function openPlayMenu(choice) {
  const menu = document.getElementById("play-menu");
  const options = document.getElementById("play-options");
  if (!menu || !options) return;
  state.playMenuChoice = choice;
  options.hidden = false;
  const buttons = menu.querySelectorAll("button");
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].setAttribute("aria-expanded", buttons[i].getAttribute("data-play") === choice ? "true" : "false");
  }
  const solo = choice === "solo";
  document.getElementById("play-heading").textContent = solo ? "Un Jugador" :
    choice === "local" ? "Multijugador Local" : "Multijugador Online";
  document.getElementById("play-online-tools").hidden = choice !== "online" || state.isRemoteClient;
  document.getElementById("play-local-help").hidden = choice !== "local";
  document.getElementById("play-solo-help").hidden = !solo;
  document.getElementById("btn-mode-battle").hidden = solo;
  document.getElementById("btn-mode-teams").hidden = solo;
  document.getElementById("btn-local-player").hidden = solo || state.isRemoteClient;
  updateLocalPlayerButton();
  if (solo) requestLobbyAction("set_mode", MODE_HORDE);
  if (state.canvas) fitLobby(state.canvas.width, state.canvas.height);
}

function bindLobbyButtons() {
  const nickname = /** @type {HTMLInputElement|null} */ (document.getElementById("local-nickname-input"));
  if (nickname) {
    const applyLocalName = () => {
      state.localNickname = sanitizeNickname(nickname.value);
      const player = state.playersData[state.localPlayerSlot];
      if (player) {
        player.customName = state.localNickname;
        for (const ship of state.activeShips) {
          if (ship.slot === state.localPlayerSlot) ship.data.customName = state.localNickname;
        }
        updateShipHUD(state.localPlayerSlot);
      }
    };
    try { nickname.value = window.localStorage.getItem("barquitos_nickname") ?? ""; } catch {}
    applyLocalName();
    nickname.value = state.localNickname;
    const saveLocalName = () => {
      if (state.isRemoteClient) return;
      applyLocalName();
      try { window.localStorage.setItem("barquitos_nickname", state.localNickname); } catch {}
    };
    nickname.addEventListener("input", saveLocalName);
    nickname.addEventListener("change", () => {
      saveLocalName();
      nickname.value = state.localNickname;
    });
  }
  updateLocalPlayerButton();
  document.getElementById("btn-pause-resume")?.addEventListener("click", () => setGamePaused(false));
  document.getElementById("btn-pause-lobby")?.addEventListener("click", () => requestLobbyAction("lobby"));
  const menu = document.getElementById("play-menu");
  if (menu) {
    menu.addEventListener("click", (event) => {
      const choice = /** @type {Element|null} */ (event.target)?.getAttribute("data-play");
      if (choice) openPlayMenu(choice);
    }, false);
  }
  const localButton = document.getElementById("btn-local-player");
  if (localButton) localButton.addEventListener("click", () => { ensureLocalPlayer(); }, false);
  const playAgain = document.getElementById("btn-play-again");
  if (playAgain) playAgain.addEventListener("click", () => { requestLobbyAction("start"); }, false);
  const backToLobby = document.getElementById("btn-back-lobby");
  if (backToLobby) backToLobby.addEventListener("click", () => { requestLobbyAction("lobby"); }, false);
  const bBattle = document.getElementById("btn-mode-battle");
  const bTeams = document.getElementById("btn-mode-teams");
  const bHorde = document.getElementById("btn-mode-horde");
  const bStart = document.getElementById("btn-start-game");

  function setupModeBtn(btn, modeVal) {
    if (!btn) return;
    let lastTap = 0;
    function setModeAction(e) {
      const now = Date.now();
      if (now - lastTap < 300) return;
      lastTap = now;
      if (e && e.preventDefault) e.preventDefault();
      requestLobbyAction("set_mode", modeVal);
    }
    btn.addEventListener("pointerup", setModeAction, false);
    btn.addEventListener("click", setModeAction, false);
  }

  setupModeBtn(bBattle, MODE_BATTLE);
  setupModeBtn(bTeams, MODE_TEAMS);
  setupModeBtn(bHorde, MODE_HORDE);

  if (bStart) {
    let lastStartTap = 0;
    function triggerStart(e) {
      const now = Date.now();
      if (now - lastStartTap < 400) return;
      lastStartTap = now;
      if (e && e.preventDefault) e.preventDefault();
      requestLobbyAction("start");
    }
    bStart.addEventListener("pointerup", triggerStart, false);
    bStart.addEventListener("click", triggerStart, false);
  }
}

export { updateLobbyRoster, bindLobbyButtons, openPlayMenu, requestLobbyAction, setupFullscreenButton, setupInviteButtons, setupRemotePlayerBarEvents, updateLobbyModeUI, updateLobbyPermissions, updatePodiumActions, updateRemoteTeamUI, updateRemoteTeamVisibility };

/**
 * BARQUITOS - Mando Móvil Multijugador Online (GitHub Pages)
 * Compatible con iOS Safari, Android Chrome y navegadores modernos.
 */

(function (window) {
  'use strict';

  function getQueryParam(name) {
    try {
      var params = new URLSearchParams(window.location.search);
      return (params.get(name) || '').toUpperCase();
    } catch (e) {
      return '';
    }
  }

  function getOrCreateUUID() {
    var key = 'barquitos_cloud_uuid';
    var saved = null;
    try {
      saved = window.localStorage.getItem(key);
    } catch (e) {}

    if (saved && saved.length > 8) {
      return saved;
    }

    var newUuid = 'u-';
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      newUuid += crypto.randomUUID().replace(/-/g, '').substr(0, 12);
    } else {
      var chars = '0123456789abcdef';
      for (var i = 0; i < 12; i++) {
        newUuid += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      newUuid += '-' + Date.now().toString(36);
    }

    try {
      window.localStorage.setItem(key, newUuid);
    } catch (e) {}

    return newUuid;
  }

  var playerUUID = getOrCreateUUID();
  var currentRoom = (getQueryParam('room') || getQueryParam('sala') || getQueryParam('join')).trim().toUpperCase();
  var mySlot = -1;
  var isReady = false;
  var currentGameState = 'lobby';

  var inputState = {
    turn: 0,
    thrust: false,
    shoot: false
  };

  var lastSentInput = {
    turn: 999,
    thrust: false,
    shoot: false
  };

  // Elementos DOM
  var elContainer = null;
  var elConnDot = null;
  var elConnText = null;
  var elPlayerBadge = null;
  var elPlayerName = null;
  var elPlayerSymbol = null;
  var elBtnReady = null;
  var elBtnFullscreen = null;
  var elSteeringZone = null;
  var elWheelOuter = null;
  var elWheelKnob = null;
  var elBtnThrust = null;
  var elBtnShoot = null;
  var elBtnStyleToggle = null;
  var elStyleText = null;

  var currentControlStyle = 'classic';

  var elHostPanel = null;
  var elBtnHostStart = null;
  var elBtnHostMode = null;

  var elRoomOverlay = null;
  var elRoomInput = null;
  var elBtnJoin = null;

  var elLobbyConfigBar = null;
  var elInputNickname = null;
  var elTeamSelector = null;
  var elBtnTeamBlue = null;
  var elBtnTeamRed = null;

  var currentMode = 0; // 0: Clásico, 1: Equipos, 2: Horda
  var myTeam = 'blue';
  var myCustomName = '';

  var touchSteerId = null;

  var SYMBOL_GLYPHS = {
    circle: '●',
    square: '■',
    triangle: '▲',
    diamond: '◆',
    star: '★',
    heart: '♥',
    crown: '👑',
    bolt: '⚡'
  };

  var joinRetryTimer = null;
  var joinRetryCount = 0;
  function startJoinRetry() {
    stopJoinRetry();
    joinRetryCount = 0;
    joinRetryTimer = setInterval(function () {
      if (mySlot !== -1 || !window.CloudNet || !window.CloudNet.isConnected()) {
        stopJoinRetry();
        return;
      }
      joinRetryCount++;
      console.log('[Controller] Reintentando solicitud join a sala:', currentRoom, 'intento:', joinRetryCount);
      window.CloudNet.sendToHost({
        type: 'join',
        uuid: playerUUID,
        name: myCustomName,
        team: myTeam
      });
      if (joinRetryCount >= 4 && mySlot === -1 && elPlayerName) {
        elPlayerName.textContent = 'ESPERANDO AL ANFITRIÓN (SALA ' + currentRoom + ')...';
      }
    }, 1500);
  }

  function stopJoinRetry() {
    if (joinRetryTimer) {
      clearInterval(joinRetryTimer);
      joinRetryTimer = null;
    }
    joinRetryCount = 0;
  }

  function connectToRoom(roomCode) {
    currentRoom = roomCode.trim().toUpperCase();
    if (!currentRoom) return;

    if (elRoomOverlay) {
      elRoomOverlay.style.display = 'none';
    }

    if (elConnText) {
      elConnText.textContent = 'Conectando a ' + currentRoom + '...';
    }

    if (window.CloudNet) {
      window.CloudNet.initClient(currentRoom, playerUUID, {
        receiveGameState: false,
        onReady: function () {
          if (elConnDot) elConnDot.className = 'conn-dot online';
          if (elConnText) elConnText.textContent = 'Sala: ' + currentRoom;

          // Enviar solicitud de unirse a la partida con apodo y equipo con reintentos
          window.CloudNet.sendToHost({
            type: 'join',
            uuid: playerUUID,
            name: myCustomName,
            team: myTeam
          });
          startJoinRetry();
        },
        onStatus: function (status, text) {
          if (elConnDot) elConnDot.className = 'conn-dot ' + (status === 'online' ? 'online' : (status === 'offline' ? 'offline' : ''));
          if (elConnText) elConnText.textContent = text;
          if (status !== 'online') {
            releaseInputs();
            stopJoinRetry();
          }
        },
        onMessage: function (topic, msg) {
          handleServerMessage(msg);
        }
      });
    }
  }

  function setGameState(state) {
    if (typeof state === 'number') {
      currentGameState = (state === 1) ? 'playing' : (state === 3 ? 'podium' : 'lobby');
    } else if (typeof state === 'string') {
      currentGameState = state;
    }
  }

  function handleServerMessage(msg) {
    if (!msg || !msg.type) return;

    if (msg.type === 'init') {
      stopJoinRetry();
      mySlot = msg.slot;
      setGameState(msg.state);
      isReady = !!msg.ready;
      if (msg.mode !== undefined) currentMode = msg.mode;
      if (msg.team) myTeam = msg.team;

      // Si el jugador tenía una preferencia de equipo guardada localmente, re-sincronizar con el anfitrión
      try {
        var localTeam = window.localStorage.getItem('barquitos_team');
        if ((localTeam === 'red' || localTeam === 'blue') && localTeam !== myTeam) {
          myTeam = localTeam;
          if (window.CloudNet && window.CloudNet.isConnected()) {
            window.CloudNet.sendToHost({
              type: 'set_team',
              uuid: playerUUID,
              slot: mySlot,
              team: myTeam
            });
          }
        }
      } catch (eTeamInit) {}

      var displayName = msg.customName || ('JUGADOR ' + (mySlot + 1));
      if (elPlayerName) {
        elPlayerName.textContent = displayName.toUpperCase() + ' (' + msg.name.toUpperCase() + ')';
      }
      if (elPlayerSymbol && msg.symbol) {
        elPlayerSymbol.textContent = SYMBOL_GLYPHS[msg.symbol] || '●';
      }
      if (elContainer && msg.hull) {
        elContainer.style.backgroundColor = msg.hull;
      }

      updateTeamButtonsUI();
      updateReadyUI();
      updateHostControls();
      updateLobbyConfigBarVisibility();
    } else if (msg.type === 'team_confirmed') {
      if (msg.team) {
        myTeam = msg.team;
        updateTeamButtonsUI();
      }
    } else if (msg.type === 'state_change') {
      setGameState(msg.state);
      updateHostControls();
      updateLobbyConfigBarVisibility();
    } else if (msg.type === 'mode_change') {
      currentMode = msg.mode;
      updateHostModeBtnText();
      updateTeamButtonsUI();
    } else if (msg.type === 'powerup') {
      triggerVibration([70, 50, 70]);
    } else if (msg.type === 'vibrate') {
      triggerVibration(msg.duration || 80);
    } else if (msg.type === 'error') {
      alert(msg.message || 'Error al conectar');
    }
  }

  function updateHostModeBtnText() {
    if (!elBtnHostMode) return;
    var modeLabels = ['⚔️ CLÁSICO', '🚩 EQUIPOS', '💀 HORDA'];
    elBtnHostMode.textContent = '🔄 ' + (modeLabels[currentMode] || 'MODO');
  }

  function updateTeamButtonsUI() {
    if (!elTeamSelector) return;
    // El selector de equipo solo se muestra si el modo es 1 (Batalla por Equipos)
    if (currentMode === 1 && (currentGameState === 'lobby' || currentGameState === 'podium')) {
      elTeamSelector.style.display = 'flex';
    } else {
      elTeamSelector.style.display = 'none';
    }

    if (elBtnTeamBlue) {
      elBtnTeamBlue.className = 'team-choice-btn blue' + (myTeam === 'blue' ? ' active' : '');
    }
    if (elBtnTeamRed) {
      elBtnTeamRed.className = 'team-choice-btn red' + (myTeam === 'red' ? ' active' : '');
    }
  }

  function updateLobbyConfigBarVisibility() {
    if (!elLobbyConfigBar) return;
    // Ocultar barra de configuración durante la ronda de juego
    if (currentGameState === 'playing') {
      elLobbyConfigBar.style.display = 'none';
    } else {
      elLobbyConfigBar.style.display = 'flex';
      updateTeamButtonsUI();
    }
  }

  function updateHostControls() {
    if (!elHostPanel) return;

    // Solo el Mando 1 (mySlot === 0) muestra controles de anfitrión en podio o lobby
    if (mySlot === 0 && (currentGameState === 'podium' || currentGameState === 'lobby')) {
      elHostPanel.style.display = 'flex';
      if (elBtnThrust) elBtnThrust.style.display = 'none';
      if (elBtnShoot) elBtnShoot.style.display = 'none';
      if (elBtnHostStart) {
        elBtnHostStart.textContent = (currentGameState === 'podium') ? '⚓ OTRA PARTIDA' : '⚓ INICIAR PARTIDA';
      }
      updateHostModeBtnText();
    } else {
      // Durante la ronda activa o en mandos 2-8: botones táctiles normales de acción
      elHostPanel.style.display = 'none';
      if (elBtnThrust) elBtnThrust.style.display = 'flex';
      if (elBtnShoot) elBtnShoot.style.display = 'flex';
    }
  }

  function triggerVibration(pattern) {
    if (window.navigator && window.navigator.vibrate) {
      try {
        window.navigator.vibrate(pattern);
      } catch (e) {}
    }
  }

  function updateReadyUI() {
    if (!elBtnReady) return;
    if (isReady) {
      elBtnReady.className = 'ready-btn active';
      elBtnReady.textContent = 'LISTO ✓';
    } else {
      elBtnReady.className = 'ready-btn';
      elBtnReady.textContent = 'PREPARARSE';
    }
  }

  function toggleReady() {
    isReady = !isReady;
    updateReadyUI();
    triggerVibration(40);

    if (window.CloudNet) {
      window.CloudNet.sendToHost({
        type: 'ready',
        uuid: playerUUID,
        ready: isReady
      });
    }
  }

  function isDocumentFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
  }

  function getViewportSize() {
    var vv = window.visualViewport;
    if (vv && vv.width && vv.height) {
      return {
        w: Math.floor(vv.width),
        h: Math.floor(vv.height)
      };
    }
    return {
      w: window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth || 360,
      h: window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight || 640
    };
  }

  var controllerRotated = false;

  function updateLayoutDimensions() {
    var container = document.getElementById("gamepad-container");
    if (!container) return;

    var vp = getViewportSize();
    var w = vp.w;
    var h = vp.h;

    document.documentElement.style.width = w + "px";
    document.documentElement.style.height = h + "px";
    document.documentElement.style.maxWidth = w + "px";
    document.documentElement.style.maxHeight = h + "px";
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.margin = "0";
    document.documentElement.style.padding = "0";

    document.body.style.width = w + "px";
    document.body.style.height = h + "px";
    document.body.style.maxWidth = w + "px";
    document.body.style.maxHeight = h + "px";
    document.body.style.overflow = "hidden";
    document.body.style.margin = "0";
    document.body.style.padding = "0";

    var rotate = h > w;
    container.setAttribute("data-rotated", rotate ? "true" : "false");
    if (controllerRotated !== rotate) {
      controllerRotated = rotate;
      releaseInputs();
    }
    var layoutWidth = rotate ? h : w;
    var layoutHeight = rotate ? w : h;

    // El mando conserva un plano horizontal dentro del viewport visible.
    container.style.position = "fixed";
    container.style.top = "0px";
    container.style.left = "0px";
    container.style.right = "auto";
    container.style.bottom = "auto";
    container.style.width = layoutWidth + "px";
    container.style.height = layoutHeight + "px";
    container.style.maxWidth = layoutWidth + "px";
    container.style.maxHeight = layoutHeight + "px";
    container.style.overflow = "hidden";
    container.style.transformOrigin = "0 0";
    container.style.transform = rotate ? "translateX(" + w + "px) rotate(90deg)" : "none";

    var controlsArea = document.querySelector(".controls-area");
    if (controlsArea) {
      controlsArea.style.height = "";
      controlsArea.style.maxHeight = "";
    }

    var overlay = document.getElementById("room-overlay");
    if (overlay) {
      overlay.style.position = "fixed";
      overlay.style.top = "0px";
      overlay.style.left = "0px";
      overlay.style.right = "0px";
      overlay.style.bottom = "0px";
      overlay.style.width = w + "px";
      overlay.style.height = h + "px";
      overlay.style.transform = "none";
      overlay.style.transformOrigin = "initial";
    }
  }

  function toggleFullscreen() {
    var doc = window.document;
    var docEl = doc.documentElement;
    var req = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
    var exit = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen;

    if (!doc.fullscreenElement && !doc.mozFullScreenElement && !doc.webkitFullscreenElement && !doc.msFullscreenElement) {
      if (req) {
        try {
          var p = req.call(docEl);
          if (p && p.then) {
            p.then(function () {
              var orientation = window.screen && window.screen.orientation;
              if (isDocumentFullscreen() && orientation && orientation.lock) {
                try {
                  var lock = orientation.lock("landscape");
                  if (lock && lock.catch) lock.catch(function () {});
                } catch (eLock) {}
              }
              updateLayoutDimensions();
            }, function () { updateLayoutDimensions(); });
          }
        } catch (e) {}
      }
    } else {
      if (exit) {
        try { exit.call(doc); } catch (e2) {}
      }
    }

    var delays = [20, 60, 120, 250, 400, 600, 850, 1200];
    for (var d = 0; d < delays.length; d++) {
      setTimeout(updateLayoutDimensions, delays[d]);
    }
  }

  // Envío controlado y optimizado por red MQTT (15-20 Hz / 50ms-66ms)
  var lastSentInputTime = 0;
  var lastHeartbeatTime = 0;
  var MIN_INPUT_INTERVAL_MS = 55; // Throttle estricto ~18 Hz

  function sendInputUpdate(isImmediate) {
    if (mySlot === -1 || !window.CloudNet || !window.CloudNet.isConnected()) return;

    var now = Date.now();
    var turnDiff = Math.abs(inputState.turn - lastSentInput.turn);
    var thrustDiff = inputState.thrust !== lastSentInput.thrust;
    var shootDiff = inputState.shoot !== lastSentInput.shoot;
    var stateChanged = (turnDiff > 0.04) || thrustDiff || shootDiff;
    var needsHeartbeat = (now - lastHeartbeatTime > 350);

    if (!isImmediate && !stateChanged && !needsHeartbeat) {
      return;
    }

    if (!isImmediate && (now - lastSentInputTime < MIN_INPUT_INTERVAL_MS)) {
      return;
    }

    lastSentInputTime = now;
    lastHeartbeatTime = now;
    lastSentInput.turn = inputState.turn;
    lastSentInput.thrust = inputState.thrust;
    lastSentInput.shoot = inputState.shoot;

    // Payload ultraligero con claves compactas y redondeo a 2 decimales
    window.CloudNet.sendToHost({
      type: 'input',
      uuid: playerUUID,
      slot: mySlot,
      t: inputState.turn,
      th: inputState.thrust ? 1 : 0,
      sh: inputState.shoot ? 1 : 0,
      turn: inputState.turn,
      thrust: inputState.thrust,
      shoot: inputState.shoot
    });
  }

  function setupSteeringControls() {
    if (!elSteeringZone || !elWheelOuter || !elWheelKnob) return;

    function handleSteerTouch(touch) {
      var rect = elWheelOuter.getBoundingClientRect();
      var length = controllerRotated ? rect.height : rect.width;
      var offset = controllerRotated ? touch.clientY - rect.top : touch.clientX - rect.left;
      var maxDistX = Math.max(30, length / 2 - 8);
      var deltaX = offset - length / 2;
      var normalized = Math.max(-1, Math.min(1, deltaX / maxDistX));

      // Deadzone de 0.05 y redondeo a 2 decimales
      if (Math.abs(normalized) < 0.05) {
        normalized = 0;
      }
      inputState.turn = Math.round(normalized * 100) / 100;

      // Actualizar knob a 60 FPS sin saturar MQTT
      var maxTravel = maxDistX * 0.7;
      var knobOffset = normalized * maxTravel;
      elWheelKnob.style.transform = "translate(" + knobOffset + "px, 0px)";
    }

    function resetSteer() {
      inputState.turn = 0;
      elWheelKnob.style.transform = "translate(0px, 0px)";
      touchSteerId = null;
      sendInputUpdate(true);
    }

    elSteeringZone.addEventListener("touchstart", function (e) {
      e.preventDefault();
      if (touchSteerId !== null) return;
      var t = e.changedTouches[0];
      touchSteerId = t.identifier;
      handleSteerTouch(t);
    }, false);

    elSteeringZone.addEventListener("touchmove", function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === touchSteerId) {
          handleSteerTouch(t);
          break;
        }
      }
    }, false);

    elSteeringZone.addEventListener("touchend", function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchSteerId) {
          resetSteer();
          break;
        }
      }
    }, false);

    elSteeringZone.addEventListener("touchcancel", function (e) {
      e.preventDefault();
      resetSteer();
    }, false);

    // Soporte con ratón para pruebas en PC
    var isMouseDown = false;
    elSteeringZone.addEventListener("mousedown", function (e) {
      isMouseDown = true;
      handleSteerTouch(e);
    });
    window.addEventListener("mousemove", function (e) {
      if (isMouseDown) {
        handleSteerTouch(e);
      }
    });
    window.addEventListener("mouseup", function () {
      if (isMouseDown) {
        isMouseDown = false;
        resetSteer();
      }
    });
  }

  function setControlStyle(style) {
    currentControlStyle = (style === 'compact') ? 'compact' : 'classic';
    try {
      window.localStorage.setItem('barquitos_control_style', currentControlStyle);
    } catch (eStyleSave) {}

    if (elContainer) {
      if (currentControlStyle === 'compact') {
        if (elContainer.className.indexOf('style-compact') === -1) {
          elContainer.className += ' style-compact';
        }
      } else {
        elContainer.className = elContainer.className.replace(/\bstyle-compact\b/g, '').replace(/\s+/g, ' ').trim();
      }
    }

    if (elStyleText) {
      elStyleText.textContent = (currentControlStyle === 'compact') ? 'COMPACTO' : 'CLÁSICO';
    }

    resetSteering();
    sendInputUpdate();
  }

  function resetSteering() {
    touchSteerId = null;
    inputState.turn = 0;
    if (elWheelKnob) {
      elWheelKnob.style.transform = 'translate(0px, 0px)';
    }
  }

  function releaseInputs() {
    resetSteering();
    inputState.thrust = false;
    inputState.shoot = false;
    if (elBtnThrust) elBtnThrust.className = 'touch-btn thrust-btn';
    if (elBtnShoot) elBtnShoot.className = 'touch-btn shoot-btn';
    sendInputUpdate(true);
  }

  function toggleControlStyle() {
    var nextStyle = (currentControlStyle === 'classic') ? 'compact' : 'classic';
    setControlStyle(nextStyle);
    triggerVibration(35);
  }


  function setupActionButtons() {
    // Acelerar (Velas)
    if (elBtnThrust) {
      function setThrust(active) {
        if (inputState.thrust === active) return;
        inputState.thrust = active;
        if (active) {
          elBtnThrust.className = 'touch-btn thrust-btn pressed';
          triggerVibration(30);
        } else {
          elBtnThrust.className = 'touch-btn thrust-btn';
        }
        sendInputUpdate(true); // Envío inmediato al presionar o soltar
      }

      elBtnThrust.addEventListener('touchstart', function (e) {
        e.preventDefault();
        setThrust(true);
      }, false);

      elBtnThrust.addEventListener('touchend', function (e) {
        e.preventDefault();
        setThrust(false);
      }, false);

      elBtnThrust.addEventListener('touchcancel', function (e) {
        e.preventDefault();
        setThrust(false);
      }, false);

      elBtnThrust.addEventListener('mousedown', function (e) {
        e.preventDefault();
        setThrust(true);
      });
      elBtnThrust.addEventListener('mouseup', function (e) {
        e.preventDefault();
        setThrust(false);
      });
    }

    // El estado evita eventos duplicados sin descartar pulsaciones rápidas.
    if (elBtnShoot) {
      function setShoot(active) {
        if (inputState.shoot === active) return;
        inputState.shoot = active;
        if (active) {
          elBtnShoot.className = 'touch-btn shoot-btn pressed';
          triggerVibration(50);
        } else {
          elBtnShoot.className = 'touch-btn shoot-btn';
        }
        sendInputUpdate(true); // Envío inmediato
      }

      elBtnShoot.addEventListener('touchstart', function (e) {
        e.preventDefault();
        setShoot(true);
      }, false);

      elBtnShoot.addEventListener('touchend', function (e) {
        e.preventDefault();
        setShoot(false);
      }, false);

      elBtnShoot.addEventListener('touchcancel', function (e) {
        e.preventDefault();
        setShoot(false);
      }, false);

      elBtnShoot.addEventListener('mousedown', function (e) {
        e.preventDefault();
        setShoot(true);
      });
      elBtnShoot.addEventListener('mouseup', function (e) {
        e.preventDefault();
        setShoot(false);
      });
    }

    // Botones del Anfitrión (Mando 1) con soporte para click y touch
    if (elBtnHostStart) {
      var lastHostStartTap = 0;
      function handleHostStart(e) {
        var now = Date.now();
        if (now - lastHostStartTap < 350) return;
        lastHostStartTap = now;
        if (e && e.preventDefault) e.preventDefault();
        triggerVibration(50);
        if (window.CloudNet) {
          window.CloudNet.sendToHost({
            type: "host_action",
            uuid: playerUUID,
            action: "start"
          });
        }
      }
      elBtnHostStart.addEventListener("click", handleHostStart, false);
      elBtnHostStart.addEventListener("touchend", handleHostStart, false);
    }

    if (elBtnHostMode) {
      var lastHostModeTap = 0;
      function handleHostMode(e) {
        var now = Date.now();
        if (now - lastHostModeTap < 300) return;
        lastHostModeTap = now;
        if (e && e.preventDefault) e.preventDefault();
        triggerVibration(40);
        if (window.CloudNet) {
          window.CloudNet.sendToHost({
            type: "host_action",
            uuid: playerUUID,
            action: "toggle_mode"
          });
        }
      }
      elBtnHostMode.addEventListener("click", handleHostMode, false);
      elBtnHostMode.addEventListener("touchend", handleHostMode, false);
    }

    // Listo
    if (elBtnReady) {
      elBtnReady.addEventListener("click", function (e) {
        e.preventDefault();
        toggleReady();
      });
      elBtnReady.addEventListener("touchend", function (e) {
        e.preventDefault();
        toggleReady();
      });
    }

    // Pantalla Completa
    if (elBtnFullscreen) {
      var lastFsTap = 0;
      function handleFsTap(e) {
        var now = Date.now();
        if (now - lastFsTap < 400) return;
        lastFsTap = now;
        if (e && e.preventDefault) e.preventDefault();
        toggleFullscreen();
      }
      elBtnFullscreen.addEventListener("click", handleFsTap, false);
      elBtnFullscreen.addEventListener("touchend", handleFsTap, false);
    }

    // Diálogo de Sala Manual
    if (elBtnJoin && elRoomInput) {
      function submitRoom() {
        var val = elRoomInput.value.trim().toUpperCase();
        if (val.length >= 3) {
          connectToRoom(val);
        } else {
          alert('Por favor introduce el código de sala que aparece en la TV');
        }
      }

      elBtnJoin.addEventListener('click', submitRoom);
      elRoomInput.addEventListener('keyup', function (e) {
        if (e.keyCode === 13) submitRoom();
      });
    }
  }

  function preventPageZoom() {
    document.addEventListener('gesturestart', function (e) {
      e.preventDefault();
    }, false);

    document.addEventListener('touchmove', function (e) {
      if (e.scale !== undefined && e.scale !== 1) {
        e.preventDefault();
      }
    }, { passive: false });
  }

  window.onload = function () {
    elContainer = document.getElementById('gamepad-container');
    elConnDot = document.getElementById('conn-dot');
    elConnText = document.getElementById('conn-text');
    elPlayerBadge = document.getElementById('player-badge');
    elPlayerName = document.getElementById('player-name');
    elPlayerSymbol = document.getElementById('player-symbol');
    elBtnReady = document.getElementById('btn-ready');
    elBtnFullscreen = document.getElementById('btn-fullscreen');

    elSteeringZone = document.getElementById('steering-zone');
    elWheelOuter = document.getElementById('wheel-outer');
    elWheelKnob = document.getElementById('wheel-knob');
    elBtnThrust = document.getElementById('btn-thrust');
    elBtnShoot = document.getElementById('btn-shoot');

    elBtnStyleToggle = document.getElementById('btn-style-toggle');
    elStyleText = document.getElementById('style-text');

    elHostPanel = document.getElementById('host-panel');
    elBtnHostStart = document.getElementById('btn-host-start');
    elBtnHostMode = document.getElementById('btn-host-mode');

    elRoomOverlay = document.getElementById('room-overlay');
    elRoomInput = document.getElementById('room-input');
    elBtnJoin = document.getElementById('btn-join-room');

    elLobbyConfigBar = document.getElementById('lobby-config-bar');
    elInputNickname = document.getElementById('input-nickname');
    elTeamSelector = document.getElementById('team-selector');
    elBtnTeamBlue = document.getElementById('btn-team-blue');
    elBtnTeamRed = document.getElementById('btn-team-red');

    // Recuperar apodo guardado previamente
    try {
      myCustomName = window.localStorage.getItem('barquitos_nickname') || '';
      if (elInputNickname && myCustomName) {
        elInputNickname.value = myCustomName;
      }
    } catch (e) {}

    // Sincronizar cambio de apodo con debounce para no saturar la red al escribir
    if (elInputNickname) {
      var nicknameDebounceTimer = null;
      function syncNickname(isImmediate) {
        var name = (elInputNickname.value || '').trim().substr(0, 12);
        myCustomName = name;
        try { window.localStorage.setItem('barquitos_nickname', name); } catch(e){}
        if (nicknameDebounceTimer) {
          clearTimeout(nicknameDebounceTimer);
          nicknameDebounceTimer = null;
        }
        function sendNick() {
          if (window.CloudNet && window.CloudNet.isConnected()) {
            window.CloudNet.sendToHost({
              type: 'set_name',
              uuid: playerUUID,
              name: name
            });
          }
        }
        if (isImmediate) {
          sendNick();
        } else {
          nicknameDebounceTimer = setTimeout(sendNick, 250);
        }
      }
      elInputNickname.addEventListener('input', function () { syncNickname(false); }, false);
      elInputNickname.addEventListener('change', function () { syncNickname(true); }, false);
    }

    // Selección de equipo (Batalla por Equipos)
    try {
      var savedTeam = window.localStorage.getItem('barquitos_team');
      if (savedTeam === 'blue' || savedTeam === 'red') {
        myTeam = savedTeam;
      }
    } catch (eTeamLoad) {}

    function chooseTeam(team) {
      myTeam = team;
      try { window.localStorage.setItem('barquitos_team', team); } catch(e){}
      updateTeamButtonsUI();
      triggerVibration(40);
      if (window.CloudNet && window.CloudNet.isConnected()) {
        window.CloudNet.sendToHost({
          type: 'set_team',
          uuid: playerUUID,
          slot: mySlot,
          team: team
        });
      }
    }

    function bindTeamButton(btn, team) {
      if (!btn) return;
      var lastTouch = 0;
      function handleTeamTap(e) {
        var now = Date.now();
        if (now - lastTouch < 300) return;
        lastTouch = now;
        if (e && e.preventDefault) e.preventDefault();
        chooseTeam(team);
      }
      btn.addEventListener('touchend', handleTeamTap, false);
      btn.addEventListener('click', handleTeamTap, false);
    }

    bindTeamButton(elBtnTeamBlue, 'blue');
    bindTeamButton(elBtnTeamRed, 'red');

    preventPageZoom();
    updateLayoutDimensions();
    setupSteeringControls();
    setupActionButtons();

    if (elBtnStyleToggle) {
      var lastStyleTap = 0;
      function handleStyleToggle(e) {
        var now = Date.now();
        if (now - lastStyleTap < 300) return;
        lastStyleTap = now;
        if (e && e.preventDefault) e.preventDefault();
        toggleControlStyle();
      }
      elBtnStyleToggle.addEventListener('click', handleStyleToggle, false);
      elBtnStyleToggle.addEventListener('touchend', handleStyleToggle, false);
    }

    try {
      var savedStyle = window.localStorage.getItem('barquitos_control_style');
      if (savedStyle === 'compact' || savedStyle === 'classic') {
        currentControlStyle = savedStyle;
      }
    } catch (eStyleLoad) {}
    setControlStyle(currentControlStyle);

    window.addEventListener('blur', releaseInputs, false);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) releaseInputs();
    }, false);
    window.addEventListener('resize', updateLayoutDimensions, false);
    window.addEventListener('orientationchange', function () {
      setTimeout(updateLayoutDimensions, 50);
      setTimeout(updateLayoutDimensions, 250);
      setTimeout(updateLayoutDimensions, 600);
    }, false);
    if (window.screen && window.screen.orientation) {
      try {
        window.screen.orientation.addEventListener('change', function () {
          setTimeout(updateLayoutDimensions, 50);
          setTimeout(updateLayoutDimensions, 250);
          setTimeout(updateLayoutDimensions, 600);
        });
      } catch (eOriListener) {}
    }
    document.addEventListener('fullscreenchange', function () {
      setTimeout(updateLayoutDimensions, 50);
      setTimeout(updateLayoutDimensions, 250);
      setTimeout(updateLayoutDimensions, 600);
    }, false);
    document.addEventListener('webkitfullscreenchange', function () {
      setTimeout(updateLayoutDimensions, 50);
      setTimeout(updateLayoutDimensions, 250);
      setTimeout(updateLayoutDimensions, 600);
    }, false);
    if (window.visualViewport) {
      try {
        window.visualViewport.addEventListener('resize', function () {
          updateLayoutDimensions();
        }, false);
        window.visualViewport.addEventListener('scroll', function () {
          updateLayoutDimensions();
        }, false);
      } catch (eVvListener) {}
    }

    if (currentRoom) {
      connectToRoom(currentRoom);
    } else {
      if (elRoomOverlay) elRoomOverlay.style.display = 'flex';
    }

    setInterval(sendInputUpdate, 55);
  };

})(window);

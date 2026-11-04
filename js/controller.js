/**
 * BARQUITOS - Controlador Web para GitHub Pages / Neocities (Sin Computadora)
 * Compatible con iOS Safari y Android Chrome en ES5 estricto.
 */

(function (window) {
  'use strict';

  function getQueryParam(name) {
    var search = window.location.search.substring(1);
    var parts = search.split('&');
    for (var i = 0; i < parts.length; i++) {
      var pair = parts[i].split('=');
      if (decodeURIComponent(pair[0]).toLowerCase() === name.toLowerCase()) {
        return decodeURIComponent(pair[1] || '').toUpperCase();
      }
    }
    return '';
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

    var chars = '0123456789abcdef';
    var newUuid = 'u-';
    for (var i = 0; i < 12; i++) {
      newUuid += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    newUuid += '-' + Date.now().toString(36);

    try {
      window.localStorage.setItem(key, newUuid);
    } catch (e) {}

    return newUuid;
  }

  var playerUUID = getOrCreateUUID();
  var currentRoom = getQueryParam('room');
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
        onReady: function () {
          if (elConnDot) elConnDot.className = 'conn-dot online';
          if (elConnText) elConnText.textContent = 'Sala: ' + currentRoom;

          // Enviar solicitud de unirse a la partida con apodo y equipo
          window.CloudNet.sendToHost({
            type: 'join',
            uuid: playerUUID,
            name: myCustomName,
            team: myTeam
          });
        },
        onStatus: function (status, text) {
          if (elConnDot) elConnDot.className = 'conn-dot ' + (status === 'online' ? 'online' : (status === 'offline' ? 'offline' : ''));
          if (elConnText) elConnText.textContent = text;
        },
        onMessage: function (topic, msg) {
          handleServerMessage(msg);
        }
      });
    }
  }

  function handleServerMessage(msg) {
    if (!msg || !msg.type) return;

    if (msg.type === 'init') {
      mySlot = msg.slot;
      isReady = !!msg.ready;
      if (msg.mode !== undefined) currentMode = msg.mode;
      if (msg.team) myTeam = msg.team;

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
    } else if (msg.type === 'state_change') {
      currentGameState = msg.state;
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

  function updateLayoutDimensions() {
    var winW = window.innerWidth || document.documentElement.clientWidth;
    var winH = window.innerHeight || document.documentElement.clientHeight;
    if (!winW || !winH) return;
    var isPortrait = (winH > winW);

    var container = document.getElementById('gamepad-container');
    if (!container) return;

    // Limpiar estilos forzados en html y body para permitir redimensionamiento natural
    document.documentElement.style.width = '';
    document.documentElement.style.height = '';
    document.body.style.width = '';
    document.body.style.height = '';

    if (isPortrait) {
      // Teléfono vertical: rotar 90° horario
      // El ancho visual del mando es el alto físico de la ventana (winH)
      // El alto visual del mando es el ancho físico de la ventana (winW)
      container.style.position = 'fixed';
      container.style.top = '0px';
      container.style.left = winW + 'px';
      container.style.right = 'auto';
      container.style.bottom = 'auto';
      container.style.width = winH + 'px';
      container.style.height = winW + 'px';
      container.style.maxWidth = winH + 'px';
      container.style.maxHeight = winW + 'px';
      container.style.transform = 'rotate(90deg)';
      container.style.transformOrigin = 'top left';
    } else {
      // Modo horizontal (landscape) nativo o tras pantalla completa:
      // Sin rotación, anclado al 100% exacto de la pantalla sin desbordar
      container.style.position = 'fixed';
      container.style.top = '0px';
      container.style.left = '0px';
      container.style.right = '0px';
      container.style.bottom = '0px';
      container.style.width = '100%';
      container.style.height = '100%';
      container.style.maxWidth = '100%';
      container.style.maxHeight = '100%';
      container.style.transform = 'none';
      container.style.transformOrigin = 'initial';
    }

    // Dejar que Flexbox gestione el alto exacto de la zona de controles táctiles sin desbordar
    var controlsArea = document.querySelector('.controls-area');
    if (controlsArea) {
      controlsArea.style.height = '';
      controlsArea.style.maxHeight = '';
    }

    var overlay = document.getElementById('room-overlay');
    if (overlay && overlay.style.display !== 'none') {
      if (isPortrait) {
        overlay.style.position = 'fixed';
        overlay.style.top = '0px';
        overlay.style.left = winW + 'px';
        overlay.style.right = 'auto';
        overlay.style.bottom = 'auto';
        overlay.style.width = winH + 'px';
        overlay.style.height = winW + 'px';
        overlay.style.transform = 'rotate(90deg)';
        overlay.style.transformOrigin = 'top left';
      } else {
        overlay.style.position = 'fixed';
        overlay.style.top = '0px';
        overlay.style.left = '0px';
        overlay.style.right = '0px';
        overlay.style.bottom = '0px';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.transform = 'none';
        overlay.style.transformOrigin = 'initial';
      }
    }
  }

  function toggleFullscreen() {
    var doc = window.document;
    var docEl = doc.documentElement;
    var req = docEl.requestFullscreen || docEl.mozRequestFullScreen || docEl.webkitRequestFullScreen || docEl.msRequestFullscreen;
    var exit = doc.exitFullscreen || doc.mozCancelFullScreen || doc.webkitExitFullscreen || doc.msExitFullscreen;

    if (!doc.fullscreenElement && !doc.mozFullScreenElement && !doc.webkitFullscreenElement && !doc.msFullscreenElement) {
      if (req) {
        try {
          var p = req.call(docEl);
          if (p && p.catch) p.catch(function () {});
        } catch (e) {}
      }
      try {
        if (window.screen && window.screen.orientation && window.screen.orientation.lock) {
          var lockP = window.screen.orientation.lock('landscape');
          if (lockP && lockP.catch) lockP.catch(function () {});
        } else if (window.screen && window.screen.lockOrientation) {
          window.screen.lockOrientation('landscape');
        }
      } catch (eOri) {}
    } else {
      if (exit) {
        try { exit.call(doc); } catch (e2) {}
      }
      try {
        if (window.screen && window.screen.orientation && window.screen.orientation.unlock) {
          window.screen.orientation.unlock();
        } else if (window.screen && window.screen.unlockOrientation) {
          window.screen.unlockOrientation();
        }
      } catch (eUn) {}
    }

    var delays = [20, 60, 120, 250, 400, 600, 850];
    for (var d = 0; d < delays.length; d++) {
      setTimeout(updateLayoutDimensions, delays[d]);
    }
  }

  // Envío constante a 60 Hz al host (TV)
  function sendInputUpdate() {
    if (mySlot === -1 || !window.CloudNet || !window.CloudNet.isConnected()) return;

    var diff = Math.abs(inputState.turn - lastSentInput.turn) > 0.02 ||
               inputState.thrust !== lastSentInput.thrust ||
               inputState.shoot !== lastSentInput.shoot;

    if (diff) {
      lastSentInput.turn = inputState.turn;
      lastSentInput.thrust = inputState.thrust;
      lastSentInput.shoot = inputState.shoot;

      window.CloudNet.sendToHost({
        type: 'input',
        uuid: playerUUID,
        turn: inputState.turn,
        thrust: inputState.thrust,
        shoot: inputState.shoot
      });
    }
  }

  function setupSteeringControls() {
    if (!elSteeringZone || !elWheelOuter || !elWheelKnob) return;

    function handleSteerTouch(touch) {
      var isPortraitRotated = (window.innerHeight > window.innerWidth);
      var rect = elWheelOuter.getBoundingClientRect();
      var normalized = 0;

      if (isPortraitRotated) {
        // En portrait rotado 90° horario: el eje visual X corresponde al eje Y de la pantalla (clientY)
        var centerY = rect.top + rect.height / 2;
        var maxDistY = rect.height / 2 - 10;
        var deltaY = touch.clientY - centerY;
        normalized = Math.max(-1, Math.min(1, deltaY / maxDistY));
      } else {
        // En landscape nativo: eje X normal (clientX)
        var centerX = rect.left + rect.width / 2;
        var maxDistX = rect.width / 2 - 10;
        var deltaX = touch.clientX - centerX;
        normalized = Math.max(-1, Math.min(1, deltaX / maxDistX));
      }

      inputState.turn = Math.round(normalized * 100) / 100;

      var knobOffset = normalized * ((rect.width / 2 - 10) * 0.7);
      elWheelKnob.style.transform = 'translate(' + knobOffset + 'px, 0px)';
    }

    function resetSteer() {
      inputState.turn = 0;
      elWheelKnob.style.transform = 'translate(0px, 0px)';
      touchSteerId = null;
    }

    elSteeringZone.addEventListener('touchstart', function (e) {
      e.preventDefault();
      if (touchSteerId !== null) return;
      var t = e.changedTouches[0];
      touchSteerId = t.identifier;
      handleSteerTouch(t);
    }, false);

    elSteeringZone.addEventListener('touchmove', function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === touchSteerId) {
          handleSteerTouch(t);
          break;
        }
      }
    }, false);

    elSteeringZone.addEventListener('touchend', function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchSteerId) {
          resetSteer();
          break;
        }
      }
    }, false);

    elSteeringZone.addEventListener('touchcancel', function (e) {
      e.preventDefault();
      resetSteer();
    }, false);

    // Soporte con ratón para pruebas en PC
    var isMouseDown = false;
    elSteeringZone.addEventListener('mousedown', function (e) {
      isMouseDown = true;
      handleSteerTouch(e);
    });
    window.addEventListener('mousemove', function (e) {
      if (isMouseDown) {
        handleSteerTouch(e);
      }
    });
    window.addEventListener('mouseup', function () {
      if (isMouseDown) {
        isMouseDown = false;
        resetSteer();
      }
    });
  }

  function setupActionButtons() {
    // Acelerar
    if (elBtnThrust) {
      function setThrust(active) {
        inputState.thrust = active;
        if (active) {
          elBtnThrust.className = 'touch-btn thrust-btn pressed';
          triggerVibration(30);
        } else {
          elBtnThrust.className = 'touch-btn thrust-btn';
        }
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

    // Disparar
    if (elBtnShoot) {
      function setShoot(active) {
        inputState.shoot = active;
        if (active) {
          elBtnShoot.className = 'touch-btn shoot-btn pressed';
          triggerVibration(50);
        } else {
          elBtnShoot.className = 'touch-btn shoot-btn';
        }
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

    // Botones del Anfitrión (Mando 1)
    if (elBtnHostStart) {
      elBtnHostStart.addEventListener('click', function (e) {
        e.preventDefault();
        triggerVibration(50);
        if (window.CloudNet) {
          window.CloudNet.sendToHost({
            type: 'host_action',
            action: 'start'
          });
        }
      });
    }

    if (elBtnHostMode) {
      elBtnHostMode.addEventListener('click', function (e) {
        e.preventDefault();
        triggerVibration(40);
        if (window.CloudNet) {
          window.CloudNet.sendToHost({
            type: 'host_action',
            action: 'toggle_mode'
          });
        }
      });
    }

    // Listo
    if (elBtnReady) {
      elBtnReady.addEventListener('click', function (e) {
        e.preventDefault();
        toggleReady();
      });
      elBtnReady.addEventListener('touchend', function (e) {
        e.preventDefault();
        toggleReady();
      });
    }

    // Pantalla Completa
    if (elBtnFullscreen) {
      elBtnFullscreen.addEventListener('click', function (e) {
        e.preventDefault();
        toggleFullscreen();
      });
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

    // Sincronizar cambio de apodo en tiempo real
    if (elInputNickname) {
      function syncNickname() {
        var name = (elInputNickname.value || '').trim().substr(0, 12);
        myCustomName = name;
        try { window.localStorage.setItem('barquitos_nickname', name); } catch(e){}
        if (window.CloudNet && window.CloudNet.isConnected()) {
          window.CloudNet.sendToHost({
            type: 'set_name',
            uuid: playerUUID,
            name: name
          });
        }
      }
      elInputNickname.addEventListener('input', syncNickname, false);
      elInputNickname.addEventListener('change', syncNickname, false);
    }

    // Selección de equipo (Batalla por Equipos)
    function chooseTeam(team) {
      myTeam = team;
      updateTeamButtonsUI();
      triggerVibration(40);
      if (window.CloudNet && window.CloudNet.isConnected()) {
        window.CloudNet.sendToHost({
          type: 'set_team',
          uuid: playerUUID,
          team: team
        });
      }
    }

    if (elBtnTeamBlue) {
      elBtnTeamBlue.addEventListener('click', function(e) {
        e.preventDefault();
        chooseTeam('blue');
      }, false);
    }
    if (elBtnTeamRed) {
      elBtnTeamRed.addEventListener('click', function(e) {
        e.preventDefault();
        chooseTeam('red');
      }, false);
    }

    preventPageZoom();
    updateLayoutDimensions();
    setupSteeringControls();
    setupActionButtons();

    window.addEventListener('resize', updateLayoutDimensions, false);
    window.addEventListener('orientationchange', function () {
      setTimeout(updateLayoutDimensions, 50);
      setTimeout(updateLayoutDimensions, 250);
    }, false);
    document.addEventListener('fullscreenchange', function () {
      setTimeout(updateLayoutDimensions, 50);
      setTimeout(updateLayoutDimensions, 250);
    }, false);
    document.addEventListener('webkitfullscreenchange', function () {
      setTimeout(updateLayoutDimensions, 50);
      setTimeout(updateLayoutDimensions, 250);
    }, false);

    if (currentRoom) {
      connectToRoom(currentRoom);
    } else {
      if (elRoomOverlay) elRoomOverlay.style.display = 'flex';
    }

    setInterval(sendInputUpdate, 16);
  };

})(window);

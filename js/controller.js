/**
 * SHIPPED - Controlador Web para Neocities (Sin Computadora)
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
    var key = 'shipped_cloud_uuid';
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
  var elSteeringZone = null;
  var elWheelOuter = null;
  var elWheelKnob = null;
  var elBtnThrust = null;
  var elBtnShoot = null;

  var elRoomOverlay = null;
  var elRoomInput = null;
  var elBtnJoin = null;

  var touchSteerId = null;

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

          // Enviar solicitud de unirse a la partida
          window.CloudNet.sendToHost({
            type: 'join',
            uuid: playerUUID
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

      if (elPlayerName) {
        elPlayerName.textContent = 'JUGADOR ' + (mySlot + 1) + ' (' + msg.name + ')';
      }
      if (elPlayerSymbol && msg.symbol) {
        elPlayerSymbol.textContent = msg.symbol;
      }
      if (elContainer && msg.hull) {
        elContainer.style.backgroundColor = msg.hull;
      }

      updateReadyUI();
    } else if (msg.type === 'vibrate') {
      triggerVibration(msg.duration || 80);
    } else if (msg.type === 'error') {
      alert(msg.message || 'Error al conectar');
    }
  }

  function triggerVibration(ms) {
    if (window.navigator && window.navigator.vibrate) {
      try {
        window.navigator.vibrate(ms);
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
      var rect = elWheelOuter.getBoundingClientRect();
      var centerX = rect.left + rect.width / 2;
      var maxDist = rect.width / 2 - 10;

      var deltaX = touch.clientX - centerX;
      var normalized = Math.max(-1, Math.min(1, deltaX / maxDist));

      inputState.turn = Math.round(normalized * 100) / 100;

      var knobX = normalized * (maxDist * 0.7);
      elWheelKnob.style.transform = 'translate(' + knobX + 'px, 0px)';
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

    // Soporte con ratón para PC
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
    elSteeringZone = document.getElementById('steering-zone');
    elWheelOuter = document.getElementById('wheel-outer');
    elWheelKnob = document.getElementById('wheel-knob');
    elBtnThrust = document.getElementById('btn-thrust');
    elBtnShoot = document.getElementById('btn-shoot');

    elRoomOverlay = document.getElementById('room-overlay');
    elRoomInput = document.getElementById('room-input');
    elBtnJoin = document.getElementById('btn-join-room');

    preventPageZoom();
    setupSteeringControls();
    setupActionButtons();

    // Si viene el parámetro ?room=XXXX en la URL (por escanear el QR)
    if (currentRoom) {
      connectToRoom(currentRoom);
    } else {
      // Mostrar pantalla para ingresar el código manualmente
      if (elRoomOverlay) elRoomOverlay.style.display = 'flex';
    }

    setInterval(sendInputUpdate, 16);
  };

})(window);

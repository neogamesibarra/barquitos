/**
 * BARQUITOS - Capa de Red en la Nube (Sin Computadora)
 * Utiliza MQTT seguro sobre WebSockets (WSS) a traves de brokers publicos gratuitos.
 * Compatible al 100% con Tizen 2015 (ES5 estricto).
 */

(function (window) {
  'use strict';

  var BROKERS = [
    { host: 'broker.emqx.io', port: 8084, path: '/mqtt' },
    { host: 'broker.hivemq.com', port: 8884, path: '/mqtt' }
  ];

  function getPreferredBrokerIdx() {
    if (typeof window !== 'undefined' && window.location && window.location.search) {
      var s = window.location.search;
      if (s.indexOf('b=1') !== -1 || s.indexOf('b=hivemq') !== -1) return 1;
      if (s.indexOf('b=0') !== -1 || s.indexOf('b=emqx') !== -1) return 0;
    }
    return 0;
  }

  var currentBrokerIdx = getPreferredBrokerIdx();
  var brokerLocked = false;
  var hostConnectFailures = 0;
  var client = null;
  var isConnected = false;
  var activeRoom = '';
  var myId = '';
  var isHost = false;
  var onMessageCb = null;
  var onStatusCb = null;
  var savedCallbacks = null;
  var fallbackTimeout = null;

  function generateId(prefix) {
    return prefix + '_' + Math.random().toString(36).substr(2, 8) + '_' + Date.now().toString(36);
  }

  function connect(callbacks) {
    if (callbacks) {
      savedCallbacks = callbacks;
    }
    if (typeof Paho === 'undefined' || !Paho.MQTT) {
      if (onStatusCb) onStatusCb('error', 'Biblioteca Paho MQTT no cargada');
      return;
    }

    if (client) {
      try {
        client.onConnectionLost = null;
        client.onMessageArrived = null;
        if (client.isConnected && client.isConnected()) {
          client.disconnect();
        }
      } catch (eClean) {}
      client = null;
    }

    var broker = BROKERS[currentBrokerIdx];
    var clientId = generateId(isHost ? 'tv' : 'ctl');

    if (onStatusCb) onStatusCb('connecting', 'Conectando con la nube (' + broker.host + ')...');

    try {
      client = new Paho.MQTT.Client(broker.host, broker.port, broker.path, clientId);
    } catch (e) {
      handleConnectionError('Error inicializando cliente MQTT');
      return;
    }

    client.onConnectionLost = function (responseObject) {
      isConnected = false;
      var errReason = (responseObject && responseObject.errorMessage) ? responseObject.errorMessage : 'Conexión interrumpida';
      if (onStatusCb) onStatusCb('offline', 'Conexión perdida (' + errReason + '). Reconectando...');
      scheduleReconnect(broker.host);
    };

    client.onMessageArrived = function (message) {
      var topic = message.destinationName;
      var payloadStr = message.payloadString;
      var data = null;

      try {
        data = JSON.parse(payloadStr);
      } catch (e) {
        return;
      }

      if (onMessageCb) {
        onMessageCb(topic, data);
      }
    };

    var options = {
      timeout: 5,
      useSSL: true,
      keepAliveInterval: 20,
      cleanSession: true,
      onSuccess: function () {
        isConnected = true;
        brokerLocked = true;
        hostConnectFailures = 0;
        if (onStatusCb) onStatusCb('online', 'Conectado a la nube (' + broker.host + ')');

        // Suscribirse a los canales de la sala
        if (isHost) {
          // El Host (TV) escucha a todos los mandos de esta sala
          var subTopic = 'barquitos/v1/' + activeRoom + '/in/#';
          client.subscribe(subTopic, { qos: 0 });
        } else {
          // El Mando o Jugador Remoto escucha mensajes personales, difusiones y sincronización de estado
          var mySub = 'barquitos/v1/' + activeRoom + '/out/' + myId;
          var broadSub = 'barquitos/v1/' + activeRoom + '/broadcast';
          var stateSub = 'barquitos/v1/' + activeRoom + '/state';
          client.subscribe(mySub, { qos: 0 });
          client.subscribe(broadSub, { qos: 0 });
          client.subscribe(stateSub, { qos: 0 });
        }

        if (callbacks && callbacks.onConnected) {
          callbacks.onConnected();
        }
      },
      onFailure: function (err) {
        isConnected = false;
        var errMsg = (err && err.errorMessage) ? err.errorMessage : 'Error de enlace';
        handleConnectionError(errMsg);
      }
    };

    try {
      client.connect(options);
    } catch (err) {
      handleConnectionError('Fallo de conexión');
    }
  }

  function scheduleReconnect(brokerHost) {
    if (fallbackTimeout) {
      clearTimeout(fallbackTimeout);
      fallbackTimeout = null;
    }
    if (onStatusCb) onStatusCb('connecting', 'Reconectando con ' + brokerHost + '...');
    fallbackTimeout = setTimeout(function () {
      fallbackTimeout = null;
      connect(savedCallbacks);
    }, 1500);
  }

  function handleConnectionError(errMsg) {
    if (fallbackTimeout) {
      clearTimeout(fallbackTimeout);
      fallbackTimeout = null;
    }
    // Solo el Host puede alternar de broker si el inicial falla antes de conectar
    if (!brokerLocked && isHost) {
      hostConnectFailures++;
      if (hostConnectFailures >= 2) {
        currentBrokerIdx = (currentBrokerIdx + 1) % BROKERS.length;
        hostConnectFailures = 0;
      }
    }
    var nextBroker = BROKERS[currentBrokerIdx];
    if (onStatusCb) onStatusCb('connecting', 'Reintentando con ' + nextBroker.host + ' (' + errMsg + ')...');
    fallbackTimeout = setTimeout(function () {
      fallbackTimeout = null;
      connect(savedCallbacks);
    }, 1500);
  }

  function publish(topic, data) {
    if (!client || !isConnected) return;
    try {
      var msg = new Paho.MQTT.Message(JSON.stringify(data));
      msg.destinationName = topic;
      msg.qos = 0;
      client.send(msg);
    } catch (e) {}
  }

  window.CloudNet = {
    // Inicializar la TV como anfitrion (Host)
    initHost: function (roomCode, callbacks) {
      isHost = true;
      currentBrokerIdx = getPreferredBrokerIdx();
      hostConnectFailures = 0;
      activeRoom = roomCode.toUpperCase();
      myId = 'tv_host';
      onMessageCb = callbacks.onMessage;
      onStatusCb = callbacks.onStatus;

      connect({
        onConnected: function () {
          brokerLocked = true;
          if (callbacks.onReady) callbacks.onReady();
        }
      });
    },

    // Inicializar el telefono como mando (Cliente)
    initClient: function (roomCode, playerUuid, callbacks) {
      isHost = false;
      brokerLocked = true;
      currentBrokerIdx = getPreferredBrokerIdx();
      activeRoom = roomCode.toUpperCase();
      myId = playerUuid;
      onMessageCb = callbacks.onMessage;
      onStatusCb = callbacks.onStatus;

      connect({
        onConnected: function () {
          if (callbacks.onReady) callbacks.onReady();
        }
      });
    },

    // Enviar mensaje directo a un jugador
    sendToPlayer: function (playerUuid, data) {
      var topic = 'barquitos/v1/' + activeRoom + '/out/' + playerUuid;
      publish(topic, data);
    },

    // Enviar mensaje al televisor desde el telefono
    sendToHost: function (data) {
      var topic = 'barquitos/v1/' + activeRoom + '/in/' + myId;
      publish(topic, data);
    },

    // Difundir a todos los telefonos de la sala
    broadcast: function (data) {
      var topic = 'barquitos/v1/' + activeRoom + '/broadcast';
      publish(topic, data);
    },

    // Difundir estado de la partida a jugadores remotos online (pantalla completa)
    broadcastState: function (data) {
      var topic = 'barquitos/v1/' + activeRoom + '/state';
      publish(topic, data);
    },

    isHostMode: function () {
      return isHost;
    },

    getRoomCode: function () {
      return activeRoom;
    },

    getCurrentBrokerIdx: function () {
      return currentBrokerIdx;
    },

    getCurrentBrokerHost: function () {
      return BROKERS[currentBrokerIdx].host;
    },

    disconnect: function () {
      if (client && isConnected) {
        try { client.disconnect(); } catch (e) {}
      }
      isConnected = false;
    },

    isConnected: function () {
      return isConnected;
    }
  };
})(window);

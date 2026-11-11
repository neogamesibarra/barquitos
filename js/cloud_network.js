/**
 * BARQUITOS - Capa de Red en la Nube (Sin Computadora)
 * Utiliza MQTT seguro sobre WebSockets (WSS) a traves de brokers publicos gratuitos.
 * Compatible al 100% con Tizen 2015 (ES5 estricto).
 */

(function (window) {
  'use strict';

  var BROKERS = [
    { host: 'broker.hivemq.com', port: 8884, path: '/mqtt' },
    { host: 'broker.emqx.io', port: 8084, path: '/mqtt' }
  ];

  function getPreferredBrokerIdx() {
    try {
      if (typeof window !== 'undefined' && window.location && window.location.search) {
        var params = new URLSearchParams(window.location.search);
        var b = params.get('b');
        if (b === 'emqx' || b === '1') return 1;
        if (b === 'hivemq' || b === '0') return 0;
      }
    } catch (e) {}
    return 0; // HiveMQ como broker principal por defecto
  }

  var currentBrokerIdx = getPreferredBrokerIdx();
  var brokerLocked = false;
  var consecutiveFailures = 0;
  var client = null;
  var isConnected = false;
  var activeRoom = '';
  var myId = '';
  var isHost = false;
  var onMessageCb = null;
  var onStatusCb = null;
  var receiveGameState = true;
  var savedCallbacks = null;
  var fallbackTimeout = null;

  function generateId(prefix) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return prefix + '_' + crypto.randomUUID().replace(/-/g, '').substr(0, 12);
    }
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
      timeout: 10,
      useSSL: true,
      keepAliveInterval: 30,
      cleanSession: true,
      onSuccess: function () {
        isConnected = true;
        brokerLocked = true;
        consecutiveFailures = 0;
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
          if (receiveGameState) client.subscribe(stateSub, { qos: 0 });
        }

        // Dar un pequeño respiro de 60ms para que el broker registre las suscripciones antes de enviar join/inputs
        setTimeout(function () {
          if (callbacks && callbacks.onConnected) {
            callbacks.onConnected();
          }
        }, 60);
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
    var bHost = brokerHost || BROKERS[currentBrokerIdx].host;
    if (onStatusCb) onStatusCb('connecting', 'Reconectando con ' + bHost + '...');
    fallbackTimeout = setTimeout(function () {
      fallbackTimeout = null;
      connect(savedCallbacks);
    }, 1200);
  }

  function handleConnectionError(errMsg) {
    if (fallbackTimeout) {
      clearTimeout(fallbackTimeout);
      fallbackTimeout = null;
    }
    consecutiveFailures++;
    // Solo alternar de broker si la conexión inicial jamás se estableció y no hay sala activa bloqueada
    if (!brokerLocked && !activeRoom && consecutiveFailures >= 3) {
      currentBrokerIdx = (currentBrokerIdx + 1) % BROKERS.length;
      consecutiveFailures = 0;
    }
    var nextBroker = BROKERS[currentBrokerIdx];
    if (onStatusCb) onStatusCb('connecting', 'Reintentando con ' + nextBroker.host + ' (' + errMsg + ')...');
    fallbackTimeout = setTimeout(function () {
      fallbackTimeout = null;
      connect(savedCallbacks);
    }, 1200);
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
      consecutiveFailures = 0;
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
      receiveGameState = callbacks.receiveGameState !== false;
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

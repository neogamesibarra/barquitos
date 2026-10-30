/**
 * SHIPPED - Capa de Red en la Nube para Neocities (Sin Computadora)
 * Utiliza MQTT seguro sobre WebSockets (WSS) a traves de brokers publicos gratuitos.
 * Compatible al 100% con Tizen 2015 (ES5 estricto).
 */

(function (window) {
  'use strict';

  var BROKERS = [
    { host: 'broker.hivemq.com', port: 8884, path: '/mqtt' },
    { host: 'broker.emqx.io', port: 8084, path: '/mqtt' }
  ];

  var currentBrokerIdx = 0;
  var client = null;
  var isConnected = false;
  var activeRoom = '';
  var myId = '';
  var isHost = false;
  var onMessageCb = null;
  var onStatusCb = null;

  function generateId(prefix) {
    return prefix + '_' + Math.random().toString(36).substr(2, 8) + '_' + Date.now().toString(36);
  }

  function connect(callbacks) {
    if (typeof Paho === 'undefined' || !Paho.MQTT) {
      if (onStatusCb) onStatusCb('error', 'Biblioteca Paho MQTT no cargada');
      return;
    }

    var broker = BROKERS[currentBrokerIdx];
    var clientId = generateId(isHost ? 'tv' : 'ctl');

    if (onStatusCb) onStatusCb('connecting', 'Conectando con la nube (' + broker.host + ')...');

    try {
      client = new Paho.MQTT.Client(broker.host, broker.port, broker.path, clientId);
    } catch (e) {
      fallbackConnect();
      return;
    }

    client.onConnectionLost = function (responseObject) {
      isConnected = false;
      if (onStatusCb) onStatusCb('offline', 'Conexion perdida. Reconectando...');
      setTimeout(function () {
        connect(callbacks);
      }, 2000);
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
      timeout: 6,
      useSSL: true,
      keepAliveInterval: 20,
      cleanSession: true,
      onSuccess: function () {
        isConnected = true;
        if (onStatusCb) onStatusCb('online', 'Conectado a la nube');

        // Suscribirse a los canales de la sala
        if (isHost) {
          // El Host (TV) escucha a todos los mandos de esta sala
          var subTopic = 'shipped/v1/' + activeRoom + '/in/#';
          client.subscribe(subTopic, { qos: 0 });
        } else {
          // El Mando escucha mensajes personales y difusiones
          var mySub = 'shipped/v1/' + activeRoom + '/out/' + myId;
          var broadSub = 'shipped/v1/' + activeRoom + '/broadcast';
          client.subscribe(mySub, { qos: 0 });
          client.subscribe(broadSub, { qos: 0 });
        }

        if (callbacks && callbacks.onConnected) {
          callbacks.onConnected();
        }
      },
      onFailure: function () {
        isConnected = false;
        fallbackConnect();
      }
    };

    try {
      client.connect(options);
    } catch (err) {
      fallbackConnect();
    }
  }

  function fallbackConnect() {
    currentBrokerIdx = (currentBrokerIdx + 1) % BROKERS.length;
    setTimeout(function () {
      connect();
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
      activeRoom = roomCode.toUpperCase();
      myId = 'tv_host';
      onMessageCb = callbacks.onMessage;
      onStatusCb = callbacks.onStatus;

      connect({
        onConnected: function () {
          if (callbacks.onReady) callbacks.onReady();
        }
      });
    },

    // Inicializar el telefono como mando (Cliente)
    initClient: function (roomCode, playerUuid, callbacks) {
      isHost = false;
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
      var topic = 'shipped/v1/' + activeRoom + '/out/' + playerUuid;
      publish(topic, data);
    },

    // Enviar mensaje al televisor desde el telefono
    sendToHost: function (data) {
      var topic = 'shipped/v1/' + activeRoom + '/in/' + myId;
      publish(topic, data);
    },

    // Difundir a todos los telefonos de la sala
    broadcast: function (data) {
      var topic = 'shipped/v1/' + activeRoom + '/broadcast';
      publish(topic, data);
    },

    isConnected: function () {
      return isConnected;
    }
  };
})(window);

import { decodeMessage, encodeMessage } from "./engine/network_protocol.js";

/**
 * BARQUITOS - Capa de Red en la Nube (Sin Computadora)
 * Utiliza MQTT seguro sobre WebSockets (WSS) a traves de brokers publicos gratuitos.
 */


const BROKERS = [
  { host: 'broker.hivemq.com', port: 8884, path: '/mqtt' },
  { host: 'broker.emqx.io', port: 8084, path: '/mqtt' }
];

function getPreferredBrokerIdx() {
  const broker = new URLSearchParams(window.location.search).get('b');
  return broker === 'emqx' || broker === '1' ? 1 : 0;
}

let currentBrokerIdx = getPreferredBrokerIdx();
let consecutiveFailures = 0;
let retryAttempts = 0;
let networkOffline = window.navigator?.onLine === false;
let client = null;
let isConnected = false;
let activeRoom = '';
let myId = '';
let isHost = false;
let onMessageCb = null;
let onStatusCb = null;
let receiveGameState = true;
let savedCallbacks = null;
let fallbackTimeout = null;

function clearRetry() {
  if (fallbackTimeout !== null) clearTimeout(fallbackTimeout);
  fallbackTimeout = null;
}

function stopClient() {
  clearRetry();
  const previous = client;
  client = null;
  isConnected = false;
  if (!previous) return;
  previous.onConnectionLost = null;
  previous.onMessageArrived = null;
  try { previous.disconnect(); } catch {}
}

function generateId(prefix) {
  const randomId = globalThis.crypto?.randomUUID?.().replaceAll('-', '').slice(0, 12);
  return randomId ? `${prefix}_${randomId}` : `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function connect(callbacks) {
  if (callbacks) {
    savedCallbacks = callbacks;
  }
  if (networkOffline) {
    onStatusCb?.('offline', 'Sin conexión a Internet');
    return;
  }
  if (typeof Paho === 'undefined' || !Paho.MQTT) {
    if (onStatusCb) onStatusCb('error', 'Biblioteca Paho MQTT no cargada');
    return;
  }

  stopClient();

  const broker = BROKERS[currentBrokerIdx];
  const clientId = generateId(isHost ? 'tv' : 'ctl');

  if (onStatusCb) onStatusCb('connecting', 'Conectando con la nube (' + broker.host + ')...');

  try {
    client = new Paho.MQTT.Client(broker.host, broker.port, broker.path, clientId);
  } catch (e) {
    handleConnectionError('Error inicializando cliente MQTT');
    return;
  }

  const attempt = client;
  attempt.onConnectionLost = (responseObject) => {
    if (client !== attempt) return;
    isConnected = false;
    const errReason = (responseObject && responseObject.errorMessage) ? responseObject.errorMessage : 'Conexión interrumpida';
    // Una caida ya establecida tambien cuenta: si el broker muere de verdad,
    // reintentar contra el mismo servidor en bucle no recupera la partida.
    if (noteFailure()) {
      if (onStatusCb) onStatusCb('offline', 'Conexión perdida (' + errReason + '). Buscando otro servidor...');
    } else if (onStatusCb) {
      onStatusCb('offline', 'Conexión perdida (' + errReason + '). Reconectando...');
    }
    scheduleReconnect(broker.host);
  };

  attempt.onMessageArrived = (message) => {
    if (client !== attempt) return;
    const topic = message.destinationName;
    const data = decodeMessage(message.payloadString);
    if (data) onMessageCb?.(topic, data);
  };

  const options = {
    timeout: 10,
    useSSL: true,
    keepAliveInterval: 30,
    cleanSession: true,
    onSuccess: () => {
      if (client !== attempt) return;
      isConnected = true;
      consecutiveFailures = 0;
      retryAttempts = 0;
      if (onStatusCb) onStatusCb('online', 'Conectado a la nube (' + broker.host + ')');

      // Suscribirse a los canales de la sala
      if (isHost) {
        // El Host (TV) escucha a todos los mandos de esta sala
        const subTopic = 'barquitos/v1/' + activeRoom + '/in/#';
        client.subscribe(subTopic, { qos: 0 });
      } else {
        // El Mando o Jugador Remoto escucha mensajes personales, difusiones y sincronización de estado
        const mySub = 'barquitos/v1/' + activeRoom + '/out/' + myId;
        const broadSub = 'barquitos/v1/' + activeRoom + '/broadcast';
        const stateSub = 'barquitos/v1/' + activeRoom + '/state';
        client.subscribe(mySub, { qos: 0 });
        client.subscribe(broadSub, { qos: 0 });
        if (receiveGameState) client.subscribe(stateSub, { qos: 0 });
      }

      // Dar un pequeño respiro de 60ms para que el broker registre las suscripciones antes de enviar join/inputs
      setTimeout(() => {
        if (client === attempt && isConnected && callbacks?.onConnected) {
          callbacks.onConnected();
        }
      }, 60);
    },
    onFailure: (err) => {
      if (client !== attempt) return;
      isConnected = false;
      const errMsg = (err && err.errorMessage) ? err.errorMessage : 'Error de enlace';
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
  clearRetry();
  const bHost = brokerHost || BROKERS[currentBrokerIdx].host;
  if (onStatusCb) onStatusCb('connecting', 'Reconectando con ' + bHost + '...');
  scheduleRetry();
}

function scheduleRetry() {
  clearRetry();
  if (networkOffline || !savedCallbacks) return;
  const delay = Math.min(1000 * 2 ** Math.min(retryAttempts++, 4), 15000);
  fallbackTimeout = setTimeout(() => {
    fallbackTimeout = null;
    connect(savedCallbacks);
  }, delay);
}

// Registra un fallo y cambia de broker si la racha llega al limite.
// Devuelve true cuando efectivamente se cambio de servidor: ambos extremos
// de la sala avanzan en el mismo orden, asi que tienden a reencontrarse.
function noteFailure() {
  consecutiveFailures++;
  if (consecutiveFailures < 3) return false;
  currentBrokerIdx = (currentBrokerIdx + 1) % BROKERS.length;
  consecutiveFailures = 0;
  return true;
}

function handleConnectionError(errMsg) {
  if (noteFailure()) {
    if (onStatusCb) onStatusCb('connecting', 'Cambiando a ' + BROKERS[currentBrokerIdx].host + '...');
  } else if (onStatusCb) {
    onStatusCb('connecting', 'Reintentando con ' + BROKERS[currentBrokerIdx].host + ' (' + errMsg + ')...');
  }
  scheduleRetry();
}

function publish(topic, data) {
  if (!client || !isConnected) return;
  try {
    const msg = new Paho.MQTT.Message(encodeMessage(data));
    msg.destinationName = topic;
    msg.qos = 0;
    client.send(msg);
  } catch (e) {}
}

export const CloudNet = {
  // Inicializar la TV como anfitrion (Host)
  initHost: (roomCode, callbacks) => {
    isHost = true;
    currentBrokerIdx = getPreferredBrokerIdx();
    consecutiveFailures = 0;
    retryAttempts = 0;
    activeRoom = roomCode.toUpperCase();
    myId = 'tv_host';
    onMessageCb = callbacks.onMessage;
    onStatusCb = callbacks.onStatus;

    connect({ onConnected: callbacks.onReady });
  },

  // Inicializar el telefono como mando (Cliente)
  initClient: (roomCode, playerUuid, callbacks) => {
    isHost = false;
    const preferred = callbacks.preferredBroker;
    currentBrokerIdx = preferred === 'emqx' ? 1 : preferred === 'hivemq' ? 0 : getPreferredBrokerIdx();
    consecutiveFailures = 0;
    retryAttempts = 0;
    activeRoom = roomCode.toUpperCase();
    myId = playerUuid;
    receiveGameState = callbacks.receiveGameState !== false;
    onMessageCb = callbacks.onMessage;
    onStatusCb = callbacks.onStatus;

    connect({ onConnected: callbacks.onReady });
  },

  // Enviar mensaje directo a un jugador
  sendToPlayer: (playerUuid, data) => {
    const topic = 'barquitos/v1/' + activeRoom + '/out/' + playerUuid;
    publish(topic, data);
  },

  // Enviar mensaje al televisor desde el telefono
  sendToHost: (data) => {
    const topic = 'barquitos/v1/' + activeRoom + '/in/' + myId;
    publish(topic, data);
  },

  // Difundir a todos los telefonos de la sala
  broadcast: (data) => {
    const topic = 'barquitos/v1/' + activeRoom + '/broadcast';
    publish(topic, data);
  },

  // Difundir estado de la partida a jugadores remotos online (pantalla completa)
  broadcastState: (data) => {
    const topic = 'barquitos/v1/' + activeRoom + '/state';
    publish(topic, data);
  },

  isHostMode: () => {
    return isHost;
  },

  getRoomCode: () => {
    return activeRoom;
  },

  getCurrentBrokerIdx: () => {
    return currentBrokerIdx;
  },

  // Identificador corto del broker actual para enlaces de invitacion (?b=)
  getBrokerParam: () => {
    return currentBrokerIdx === 1 ? 'emqx' : 'hivemq';
  },

  getCurrentBrokerHost: () => {
    return BROKERS[currentBrokerIdx].host;
  },

  disconnect: () => {
    savedCallbacks = null;
    stopClient();
  },

  retryNow: () => {
    if (!networkOffline && fallbackTimeout !== null && !isConnected && savedCallbacks) connect(savedCallbacks);
  },

  isConnected: () => {
    return isConnected;
  }
};

window.addEventListener('offline', () => {
  networkOffline = true;
  stopClient();
  if (savedCallbacks) onStatusCb?.('offline', 'Sin conexión a Internet');
});

window.addEventListener('online', () => {
  const shouldReconnect = networkOffline || fallbackTimeout !== null;
  networkOffline = false;
  if (!shouldReconnect || isConnected || !savedCallbacks) return;
  retryAttempts = 0;
  connect(savedCallbacks);
});

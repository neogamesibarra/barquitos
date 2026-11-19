interface BarquitosMqttMessage {
  payloadString: string;
  destinationName: string;
  qos: number;
}

interface BarquitosMqttClient {
  onConnectionLost: (result: { errorMessage?: string }) => void;
  onMessageArrived: (message: BarquitosMqttMessage) => void;
  connect(options: {
    timeout: number;
    useSSL: boolean;
    keepAliveInterval: number;
    cleanSession: boolean;
    onSuccess: () => void;
    onFailure: (result: { errorMessage?: string }) => void;
  }): void;
  disconnect(): void;
  subscribe(topic: string, options: { qos: number }): void;
  send(message: BarquitosMqttMessage): void;
}

declare const Paho: {
  MQTT: {
    Client: new (host: string, port: number, path: string, id: string) => BarquitosMqttClient;
    Message: new (payload: string) => BarquitosMqttMessage;
  };
};

interface Window {
  drawQRCodeToCanvas?: (canvas: HTMLCanvasElement, text: string, size: number) => void;
  BarquitosGame: {
    startRound(): void;
    startNewMatch(): void;
    setMode(mode: number): void;
  };
}

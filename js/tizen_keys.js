// tizen_keys.js - Manejador de teclas de control remoto Samsung Smart TV (Tizen 2.3 / 2.4 - año 2015).
(function(window) {
  var TizenKeys = {
    KEY_ENTER: 13,
    KEY_RETURN: 10009,
    KEY_LEFT: 37,
    KEY_UP: 38,
    KEY_RIGHT: 39,
    KEY_DOWN: 40,
    KEY_RED: 403,
    KEY_GREEN: 404,
    KEY_YELLOW: 405,
    KEY_BLUE: 406,
    KEY_PLAY: 415,
    KEY_PAUSE: 19,
    KEY_SPACE: 32,
    KEY_M: 77,
    KEY_P: 80,

    init: function() {
      // Si corre en la app de Tizen, registrar las teclas del mando
      if (window.tizen && window.tizen.tvinputdevice) {
        try {
          var keysToRegister = [
            'MediaPlay', 'MediaPause', 'MediaPlayPause',
            'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue'
          ];
          for (var i = 0; i < keysToRegister.length; i++) {
            window.tizen.tvinputdevice.registerKey(keysToRegister[i]);
          }
        } catch (e) {
          console.log("No se pudieron registrar teclas especiales de Tizen:", e);
        }
      }
    }
  };

  TizenKeys.init();
  window.TizenKeys = TizenKeys;
})(window);

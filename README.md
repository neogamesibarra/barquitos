# Batalla de Barquitos

Esta edición especial permite jugar abriendo la página web directamente desde la Smart TV Samsung Tizen (o cualquier televisor) y usar los teléfonos móviles como mandos **sin necesidad de encender ninguna computadora en casa**.

---

## ⚡ ¿Cómo funciona sin computadora?

Normalmente, los juegos multijugador web requieren un servidor local ejecutándose en una PC. Neocities solo aloja archivos estáticos (HTML/CSS/JS) y no permite ejecutar servidores Node.js ni Python.

Para resolver esto:
1. **La TV actúa como Anfitrión (Host):** Todo el motor de física, colisiones y dibujo en Canvas 2D corre directamente en el navegador de la Smart TV en JavaScript ES5 estricto.
2. **Red en la Nube mediante MQTT sobre WebSockets Seguros (WSS):**
   - El juego se conecta a un broker MQTT público gratuito (`broker.hivemq.com` / `broker.emqx.io`) a través de `wss://`.
   - La TV genera automáticamente un **Código de Sala** único de 4 caracteres (ejemplo: `8421`) y dibuja su **Código QR** correspondiente.
   - Los teléfonos móviles (2 a 8 jugadores) se conectan al mismo canal de la sala instantáneamente al escanear el QR o ingresar el código.
   - Latencia ultra baja (~30-50 ms), ideal para partidas multijugador fluidas.

---

## 🎮 Cómo Jugar desde la Smart TV

1. **En tu televisor (Samsung Tizen 2015 o cualquier Smart TV):**
   - Abre la aplicación **"Navegador Web"**.
   - Entra a tu enlace de Neocities:
     ```
     https://tu-usuario.neocities.org/tv.html
     ```
     *(O entra a `https://tu-usuario.neocities.org/` y pulsa "Abrir Pantalla de Juego").*
   - Pulsa el botón de **Pantalla Completa** del navegador.
   - En pantalla aparecerá el gran título **SHIPPED**, el **Código de Sala (ej. 8421)** y el **Código QR**.

2. **En los teléfonos móviles (2 a 8 jugadores):**
   - Cada jugador escanea el código QR con la cámara de su teléfono móvil (iPhone o Android).
   - El mando táctil se abrirá automáticamente en pantalla completa horizontal, y el fondo se pintará del **color exacto de su barco**.
   - *(Si alguien no puede escanear el QR, puede entrar a `https://tu-usuario.neocities.org/controller.html` e ingresar el código de 4 caracteres de la sala).*

3. **¡A Jugar!**
   - Pulsa **OK / ENTER** en el mando a distancia del televisor para iniciar la ronda.
   - Usa las flechas del mando de la TV para alternar entre **Modo Batalla** y **Carrera de Obstáculos**.
   - Pulsa el **Botón Azul** del mando de la TV (o la tecla `P`) para activar la sorpresa festiva.

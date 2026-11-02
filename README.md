# BARQUITOS - Multijugador Web en la Nube (GitHub Pages / Neocities)

Esta edición especial de **BARQUITOS** está preparada para ejecutarse en GitHub Pages o Neocities (alojamiento web estático 100% gratuito). Permite jugar abriendo la página web directamente desde la Smart TV Samsung Tizen (o cualquier televisor) y usar los teléfonos móviles como mandos **sin necesidad de computadoras en casa**. Cada partida consta de **5 rondas**.

---

## ⚡ ¿Cómo funciona sin computadora?

Normalmente, los juegos multijugador web requieren un servidor local ejecutándose en una PC. GitHub Pages y Neocities solo alojan archivos estáticos (HTML/CSS/JS) y no ejecutan servidores Node.js ni Python.

Para resolver esto:
1. **La TV actúa como Anfitrión (Host):** Todo el motor de física, colisiones y dibujo en Canvas 2D corre directamente en el navegador de la Smart TV en JavaScript ES5 estricto.
2. **Red en la Nube mediante MQTT sobre WebSockets Seguros (WSS):**
   - El juego se conecta a brokers MQTT públicos seguros (`broker.hivemq.com` / `broker.emqx.io`) a través de `wss://`.
   - La TV genera automáticamente un **Código de Sala** único de 4 caracteres (ejemplo: `8421`) y dibuja su **Código QR** correspondiente.
   - Los teléfonos móviles (2 a 8 jugadores) se conectan al canal de la sala instantáneamente al escanear el QR o ingresar el código.
   - Latencia ultra baja (~30-50 ms), ideal para partidas multijugador fluidas.
3. **Estructura del Torneo:**
   - Cada partida consta de **5 rondas**.
   - En la pantalla se muestra el progreso de la ronda actual (`RONDA X DE 5`) y los puntos acumulados por cada jugador.
   - Al finalizar la 5ta ronda, se celebra la ceremonia del podio proclamando al campeón.

---

## 🎮 Cómo Jugar desde la Smart TV

1. **En tu televisor (Samsung Tizen 2015 o cualquier Smart TV):**
   - Abre la aplicación **"Navegador Web"**.
   - Entra al enlace del juego:
     ```
     https://neogamesibarra.github.io/barquitos/tv.html
     ```
   - Pulsa el botón de **Pantalla Completa** del navegador.
   - En pantalla aparecerá el gran título **BARQUITOS**, el **Código de Sala (ej. 8421)** y el **Código QR**.

2. **En los teléfonos móviles (2 a 8 jugadores):**
   - Cada jugador escanea el código QR con la cámara de su teléfono móvil (iPhone o Android).
   - El mando táctil se abrirá automáticamente en pantalla completa horizontal, y el fondo se pintará del **color exacto de su barco**.
   - *(Si alguien no puede escanear el QR, puede entrar directamente a `https://neogamesibarra.github.io/barquitos/controller.html` e ingresar el código de 4 caracteres de la sala).*

3. **Controles y Menús:**
   - El **Jugador 1 (Anfitrión)** tiene controles en su teléfono para cambiar de modo e iniciar la partida o volver a jugar desde el podio.
   - También se puede presionar **OK / ENTER** en el control remoto de la TV para iniciar la partida.

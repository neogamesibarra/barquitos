# ⛵ BARQUITOS - ¡Batallas Navales Multijugador en Pantalla Grande!

¡Bienvenido a **BARQUITOS**, el juego de combate naval donde tu televisor o monitor se convierte en el campo de batalla y los celulares de tus amigos en los timones de mando! 

Sin descargas, sin aplicaciones pesadas y sin configuraciones complicadas: solo abre el juego en tu pantalla, escanea el código QR con tu celular y ¡que comience la batalla! 🌊💣

## Desarrollo y despliegue

Barquitos está orientado a navegadores modernos con módulos ES nativos, Canvas 2D, Web Audio y WebSocket. GitHub Pages sirve los archivos directamente, sin instalar dependencias ni ejecutar una compilación.

Desde la raíz del proyecto puedes iniciar un servidor estático con Python:

```sh
python -m http.server 8080
```

Abre [el juego](http://localhost:8080/index.html) o [el mando táctil](http://localhost:8080/controller.html). La ruta `tv.html` conserva los enlaces existentes y reenvía los parámetros de sala y el fragmento de la URL.

| Ruta | Responsabilidad |
| --- | --- |
| `index.html`, `controller.html`, `tv.html` | Pantalla de juego, mando y redirección |
| `js/game_engine.js`, `js/engine/bootstrap.js` | Entrada del juego e inicialización del navegador |
| `js/engine/config.js`, `state.js` | Configuración de la arena y estado de la partida |
| `js/engine/entities.js`, `physics.js` | Entidades, movimiento, colisiones y límites |
| `js/engine/modes.js`, `game_loop.js`, `events.js` | Modos, rondas, simulación a 60 Hz y eventos del juego |
| `js/engine/renderer.js`, `entity_renderer.js`, `effects.js`, `hud.js` | Canvas, efectos y marcadores |
| `js/engine/controls.js`, `lobby.js`, `viewport.js` | Entrada local, interfaz de sala y ajuste de pantalla |
| `js/engine/multiplayer.js`, `js/cloud_network.js` | Sincronización y transporte MQTT sobre WebSocket |
| `js/controller.js`, `js/controller/`, `js/sound_synth.js` | Entrada del mando, módulos del mando y audio procedural |
| `css/tv/` | Hojas de base, lobby, HUD y modales enlazadas desde `index.html` |
| `manifest.json`, `sw.js`, `icons/` | Mando instalable y caché de recursos estáticos |
| `tests/` | Pruebas de física, modos y multijugador |

El mando se puede instalar en navegadores compatibles al abrirlo por HTTPS o desde localhost. Conserva la sesión de la pestaña tras recargar y el botón Atrás del navegador cierra la sesión del mando. La caché permite abrir el mando si falla el servidor estático. Una partida multijugador sigue requiriendo conexión al broker MQTT. Durante la partida el mando solicita mantener encendida la pantalla en navegadores compatibles. Las plazas de mandos que dejan de enviar señales durante 45 segundos se liberan en la sala de espera.

Ejecuta la misma suite que GitHub Actions con Node.js 24. Las pruebas usan un broker MQTT simulado y cargan los módulos del navegador en contextos aislados:

```sh
node --experimental-vm-modules tests/validate_repo.cjs
node --experimental-vm-modules --test "tests/*.test.cjs"
```

---

## 🚀 Cómo Jugar en 3 Sencillos Pasos

### 1. Abre el Juego en la Pantalla Grande 📺
Entra al juego desde el navegador de un televisor con navegador moderno o desde una computadora conectada a la pantalla:
👉 **[https://neogamesibarra.github.io/barquitos/](https://neogamesibarra.github.io/barquitos/)**

Coloca el navegador en **Pantalla Completa** para disfrutar de toda la acción. En pantalla verás el código de sala y un **Código QR**.

### 2. Conecta tu Celular como Mando 📱
- Abre la cámara de tu teléfono (iPhone o Android) y **escanea el código QR**.
- Se abrirá automáticamente el mando virtual táctil con el color asignado a tu barco.
- *(Opcional)*: Escribe tu propio **Apodo de Capitán** en la casilla del mando.
- Pulsa el botón **LISTO ✓**.

### 3. ¡A Navegar y Combatir! ⚔️
El Capitán del **Mando 1** (o el anfitrión desde la pantalla principal) puede seleccionar el modo de juego y presionar **INICIAR PARTIDA**.

---

## 🌐 Jugar Online con Amigos en Otros Países

¡Ahora puedes jugar a distancia con tus amigos sin importar en qué país o ciudad se encuentren!

### 📤 Si tú creas la partida (Anfitrión):
1. Abre el juego en tu pantalla o computadora: **[https://neogamesibarra.github.io/barquitos/](https://neogamesibarra.github.io/barquitos/)**
2. Haz clic en **📋 Copiar Enlace Online** o en **🟢 WhatsApp**.
3. Envía el enlace a tus amigos por WhatsApp, Discord, Telegram o redes sociales.

### 📥 Si un amigo te invitó:
1. Simplemente **abre el enlace de invitación** que te enviaron (o entra a la web y haz clic en **🌐 ¿Unirse a la sala de un amigo?** e introduce su código de 4 letras).
2. **Si estás en Computadora / Laptop:**
   - Verás todo el océano y los barcos en tu monitor en tiempo real.
   - Juegas directamente con tu **teclado**:
     - `A` / `D` o `◄` / `►`: Girar timón (babor / estribor)
     - `W` o `▲`: Desplegar velas (acelerar)
     - `Espacio` o `J`: Disparar cañón
     - `Shift` o `K`: Turbo y embestida con espolón metálico
3. **Si estás en Teléfono o Tablet:**
   - Verás toda la batalla en tu pantalla con **controles táctiles integrados** en las esquinas inferiores (dirección a la izquierda, velas y cañón a la derecha).
   - O si prefieres usar solo el mando táctil tradicional, puedes pulsar el botón **Mando Móvil**.

---

## 🎮 Modos de Juego

### ⚔️ 1. Todos contra Todos (Torneo a 10 Rondas)
¡El clásico combate naval de supervivencia!
- Hasta 8 capitanes en el agua luchando por ser el último barco a flote.
- Cada impacto de cañón resta una vida (3 vidas por ronda).
- ¡Cuidado con encallar contra las islas o salir del perímetro letal del océano!
- El torneo dura **10 intensas rondas**; al finalizar, se corona al gran campeón en el Podio.

### 🚩 2. Batalla por Equipos (10 Rondas)
Estrategia y combate en escuadra: **Equipo Azul 🔵 vs. Equipo Rojo 🔴**.
- Antes de iniciar la partida, cada jugador puede tocar el botón de su equipo favorito en su celular.
- **Fuego amigo desactivado:** ¡Tus cañones no dañarán a tus compañeros de equipo!
- Suma puntos por equipo en cada ronda ganada a lo largo de las 10 rondas del campeonato.

### 💀 3. Horda Pirata (Supervivencia Cooperativa)
¡Inspirado en el modo Zombies, todos los jugadores son aliados contra la flota de Barcos Piratas Fantasma!
- **Oleadas Infinitas:** En cada oleada aparecen más barcos piratas con mayor velocidad y puntería.
- **💚 Recuperación Total al Completar Oleada:** Al superar con éxito cada oleada, ¡todos los barcos aliados recuperan automáticamente el 100% de su salud máxima y los capitanes caídos son revividos para la siguiente ronda!
- **☠️ Galeón Jefe cada 10 Rondas:** En las oleadas 10, 20, 30... surgirá un colosal Galeón Jefe Pirata con ataques en abanico y ráfagas laterales. ¡Concéntrense en derrotarlo!
- **⭐ Mejoras Globales y Acumulables (Power-ups):**
  Al destruir barcos piratas aparecerán cajas de botín flotantes. Cuando **cualquier** jugador recoge una mejora, **¡se aplica inmediatamente a todo el equipo!**:
  - 💚 **Reparación Total:** Restaura todas las vidas de la flota y revive a todos los capitanes caídos.
  - 📦 **Bodega Ampliada:** Aumenta permanentemente la capacidad máxima de munición.
  - ⚡ **Munición Máxima:** Rellena al 100% las balas de todos los barcos al instante.
  - 💥 **Pack-a-Punch:** Mejora el armamento (disparo doble, triple o cañonazos de alto impacto).
  - 🛡️ **Casco Reforzado:** Aumenta permanentemente la resistencia y vidas máximas de los barcos.

---

## 🕹️ Controles del Mando Móvil

- **Dos Estilos de Control a Elegir (🎮 Botón Superior):** Puedes alternar en cualquier momento entre dos modos de manejo según el tamaño de tu celular y comodidad:
  - **Estilo Clásico:** Con un timón naval analógico para girar deslizando el dedo suavemente a babor o estribor.
  - **Estilo Compacto / Ergonómico:** Diseñado especialmente para personas con teléfonos de pantalla grande o manos pequeñas, con botones directos y amplios de dirección (**◀ BABOR** y **ESTRIBOR ▶**) colocados en la zona inferior cómoda para no tener que estirar el pulgar. Tu elección se guarda automáticamente.
- **Acelerar / Impulso 💨:** Mantén presionado para desplegar velas y ganar velocidad de embestida.
- **Espolón Metálico Frontal (Embestida con Velocidad) 🛡️⚔️:** Todos los barcos cuentan con una afilada punta de acero al frente. Si aceleras a gran velocidad y embistes de frente a un barco rival o a los barcos de la Horda Pirata (incluido el Galeón Jefe), le causarás la mitad del daño de una bala (0.5 de vida) con chispas metálicas, retroceso y vibración.
- **Disparar Cañón 💣:** Dispara una salva de cañonazos hacia adelante.
- **Recoger Munición:** Pasa por encima de las cajas flotantes en el mar para recargar tus cañones.
- **Pantalla Completa ⛶:** Toca el botón superior para jugar cómodamente en posición horizontal con vibración táctil.

---

*¡Reúne a tus amigos, enciende la pantalla y demuestra quién es el verdadero rey de los mares!* ⚓🌊

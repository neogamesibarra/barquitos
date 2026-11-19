import { initJoystick } from "./controller/joystick.js";
import { initPWA } from "./controller/pwa.js";
import { bindSessionEvents, connectToRoom, loadPreferences, session } from "./controller/session.js";
import { elements, initUI } from "./controller/ui.js";

function initController() {
  loadPreferences();
  initUI();
  initJoystick();
  bindSessionEvents();
  initPWA();
  if (session.currentRoom) {
    if (session.mySlot === -1) connectToRoom(session.currentRoom);
  } else if (elements.elRoomOverlay) {
    elements.elRoomOverlay.style.display = 'flex';
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initController, { once: true });
} else {
  initController();
}

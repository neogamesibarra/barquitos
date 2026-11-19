import { V_WIDTH, V_HEIGHT, arenaBounds } from "./config.js";

const HEX_COS = [];

const HEX_SIN = [];

for (let hi = 0; hi < 6; hi++) {
  const hAngle = (Math.PI * 2 / 6) * hi - (Math.PI / 6);
  HEX_COS.push(Math.cos(hAngle));
  HEX_SIN.push(Math.sin(hAngle));
}

function drawHexagon(c, cx, cy, radius, fillCol, strokeCol, strokeW) {
  c.beginPath();
  c.moveTo(cx + HEX_COS[0] * radius, cy + HEX_SIN[0] * radius);
  for (let i = 1; i < 6; i++) {
    c.lineTo(cx + HEX_COS[i] * radius, cy + HEX_SIN[i] * radius);
  }
  c.closePath();
  if (fillCol) {
    c.fillStyle = fillCol;
    c.fill();
  }
  if (strokeCol) {
    c.strokeStyle = strokeCol;
    c.lineWidth = strokeW || 2;
    c.stroke();
  }
}

function drawBase(mapOffscreenCtx, islands) {
  // 1. Océano base
  const grad = mapOffscreenCtx.createLinearGradient(0, 0, 0, V_HEIGHT);
  grad.addColorStop(0, "#29c4ef");
  grad.addColorStop(1, "#176bd8");
  mapOffscreenCtx.fillStyle = grad;
  mapOffscreenCtx.fillRect(0, 0, V_WIDTH, V_HEIGHT);

  // 2. Islas hexagonales pre-renderizadas
  for (let i = 0; i < islands.length; i++) {
    renderHexIslandToCtx(mapOffscreenCtx, islands[i].x, islands[i].y, islands[i].rad);
  }

  // 3. Fondos y bordes divisorios de los paneles laterales
  const panelW = 270;
  const rightPanelX = 1650;

  const leftGrad = mapOffscreenCtx.createLinearGradient(0, 0, panelW, 0);
  leftGrad.addColorStop(0, "#142557");
  leftGrad.addColorStop(1, "#243f83");
  mapOffscreenCtx.fillStyle = leftGrad;
  mapOffscreenCtx.fillRect(0, 0, panelW, V_HEIGHT);

  mapOffscreenCtx.strokeStyle = "rgba(0, 229, 255, 0.55)";
  mapOffscreenCtx.lineWidth = 3;
  mapOffscreenCtx.beginPath();
  mapOffscreenCtx.moveTo(panelW, 0);
  mapOffscreenCtx.lineTo(panelW, V_HEIGHT);
  mapOffscreenCtx.stroke();

  mapOffscreenCtx.strokeStyle = "rgba(255, 215, 0, 0.7)";
  mapOffscreenCtx.lineWidth = 1;
  mapOffscreenCtx.beginPath();
  mapOffscreenCtx.moveTo(panelW - 2, 0);
  mapOffscreenCtx.lineTo(panelW - 2, V_HEIGHT);
  mapOffscreenCtx.stroke();

  const rightGrad = mapOffscreenCtx.createLinearGradient(rightPanelX, 0, V_WIDTH, 0);
  rightGrad.addColorStop(0, "#243f83");
  rightGrad.addColorStop(1, "#142557");
  mapOffscreenCtx.fillStyle = rightGrad;
  mapOffscreenCtx.fillRect(rightPanelX, 0, panelW, V_HEIGHT);

  mapOffscreenCtx.strokeStyle = "rgba(0, 229, 255, 0.55)";
  mapOffscreenCtx.lineWidth = 3;
  mapOffscreenCtx.beginPath();
  mapOffscreenCtx.moveTo(rightPanelX, 0);
  mapOffscreenCtx.lineTo(rightPanelX, V_HEIGHT);
  mapOffscreenCtx.stroke();

  mapOffscreenCtx.strokeStyle = "rgba(255, 215, 0, 0.7)";
  mapOffscreenCtx.lineWidth = 1;
  mapOffscreenCtx.beginPath();
  mapOffscreenCtx.moveTo(rightPanelX + 2, 0);
  mapOffscreenCtx.lineTo(rightPanelX + 2, V_HEIGHT);
  mapOffscreenCtx.stroke();

  // 4. Borde delimitador de la arena central
  mapOffscreenCtx.strokeStyle = "rgba(0, 229, 255, 0.35)";
  mapOffscreenCtx.lineWidth = 2.5;
  mapOffscreenCtx.strokeRect(arenaBounds.x, arenaBounds.y, arenaBounds.w, arenaBounds.h);
}

function renderHexIslandToCtx(c, cx, cy, radius) {
  const shallows = c.createRadialGradient(cx, cy, radius * 0.7, cx, cy, radius * 1.95);
  shallows.addColorStop(0, "rgba(87,255,209,0.92)");
  shallows.addColorStop(1, "rgba(87,255,209,0)");
  c.fillStyle = shallows;
  c.fillRect(cx - radius * 2, cy - radius * 2, radius * 4, radius * 4);
  drawHexagon(c, cx, cy + 6, radius + 4, "rgba(4, 18, 30, 0.45)", null);
  drawHexagon(c, cx, cy, radius, "#ffe283", "#e29b42", 4);
  drawHexagon(c, cx, cy, radius - 8, "#ffc65a", null);
  drawHexagon(c, cx, cy, radius - 16, "#52cb54", "#218957", 3);
  drawHexagon(c, cx, cy, radius - 28, "#218957", null);
  drawHexagon(c, cx, cy, radius - 38, "#b8e4ee", "#578bb0", 2);
}

function drawIslandFront(ctx, cx, cy, radius) {
  // Sombra
  drawHexagon(ctx, cx, cy + 6, radius + 4, "rgba(4, 18, 30, 0.45)", null);
  // Arena exterior
  drawHexagon(ctx, cx, cy, radius, "#ffe283", "#e29b42", 4);
  // Césped interior
  drawHexagon(ctx, cx, cy, radius * 0.72, "#75e363", "#52cb54", 3);
  // Rocas centrales
  drawHexagon(ctx, cx, cy, radius * 0.34, "#b8e4ee", "#578bb0", 2);
}

let cache = null;
let cachedIslands;
let cachedWidth;
let cachedHeight;
let cachedRound;

function createLayer() {
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(V_WIDTH, V_HEIGHT);
      const context = canvas.getContext('2d');
      if (context) return { canvas, context };
    }
  } catch {
    // Algunos navegadores exponen OffscreenCanvas sin un contexto 2D usable.
  }
  const canvas = document.createElement('canvas');
  canvas.width = V_WIDTH;
  canvas.height = V_HEIGHT;
  const context = canvas.getContext('2d');
  return context ? { canvas, context } : null;
}

function drawForeground(context, islands) {
  for (const { x, y, rad } of islands) drawIslandFront(context, x, y, rad);
}

function getMapCache(islands, width, height, round) {
  if (cachedIslands === islands && cachedWidth === width &&
      cachedHeight === height && cachedRound === round) return cache;

  const layers = cache ?? { base: createLayer(), foreground: createLayer() };
  if (layers.base) {
    layers.base.context.clearRect(0, 0, V_WIDTH, V_HEIGHT);
    drawBase(layers.base.context, islands);
  }
  if (layers.foreground) {
    layers.foreground.context.clearRect(0, 0, V_WIDTH, V_HEIGHT);
    drawForeground(layers.foreground.context, islands);
  }
  cachedIslands = islands;
  cachedWidth = width;
  cachedHeight = height;
  cachedRound = round;
  cache = layers;
  return cache;
}

function drawMapBase(context, layers, islands) {
  if (layers.base) context.drawImage(layers.base.canvas, 0, 0);
  else drawBase(context, islands);
}

function drawMapForeground(context, layers, islands) {
  if (layers.foreground) context.drawImage(layers.foreground.canvas, 0, 0);
  else drawForeground(context, islands);
}

export { drawMapBase, drawMapForeground, getMapCache };

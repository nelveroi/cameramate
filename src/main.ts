import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import './style.css';
import { SynthEngine } from './synth/engine';
import { mountSynth, type JackId } from './synth/panel';
import { buildRetroCamera, type CameraActionId, type CameraPortId } from './camera';
import { createTerminalBackdrop } from './terminalBg';

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const synthHost = document.querySelector<HTMLElement>('#synth')!;

const engine = new SynthEngine();
const panel = mountSynth(synthHost, engine);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.86;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040b07);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.25;
pmrem.dispose();

scene.add(createTerminalBackdrop());

const CAMERA_FOV = 42;
const CAMERA_DIST = 6.4;
const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 60);
camera.position.set(0, 0.12, CAMERA_DIST);
camera.lookAt(0, 0, 0);
const fov = THREE.MathUtils.degToRad(CAMERA_FOV);

const hemi = new THREE.HemisphereLight(0xf0e7d4, 0x071009, 0.44);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xffe9c6, 1.6);
key.position.set(4.2, 6.4, 5.2);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -6;
key.shadow.camera.right = 6;
key.shadow.camera.top = 6;
key.shadow.camera.bottom = -6;
key.shadow.camera.near = 0.5;
key.shadow.camera.far = 24;
key.shadow.bias = -0.0006;
key.shadow.normalBias = 0.02;
key.shadow.radius = 3;
scene.add(key);
scene.add(key.target);

const fill = new THREE.DirectionalLight(0x66ffa8, 0.28);
fill.position.set(-5.4, 1.6, 3.2);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xffc46e, 0.95);
rim.position.set(-1.8, 2.8, -5.2);
scene.add(rim);

const glint = new THREE.PointLight(0x63ffa0, 1.2, 6, 2);
glint.position.set(1.4, -0.6, 3);
scene.add(glint);

const retro = buildRetroCamera();

const stage = new THREE.Group();
stage.add(retro.root);
scene.add(stage);

const shadow = new THREE.Mesh(
  new THREE.PlaneGeometry(9, 9),
  new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.45 }),
);
shadow.rotation.x = -Math.PI / 2;
shadow.receiveShadow = true;
stage.add(shadow);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.17, 0.45, 0.84);
composer.addPass(bloom);
composer.addPass(new OutputPass());

let halfHeight = 1;
let cameraBaseScale = 1;
let cameraHover = 0;
let cameraHoverTarget = 0;
let cameraHoverRadius = 220;
let cameraCenterX = 0;
let cameraCenterY = 0;
const stageBase = new THREE.Vector3();

function updateCameraCenter(): void {
  const p = stageBase.clone();
  p.y += 0.02 * cameraBaseScale;
  camera.updateMatrixWorld();
  p.project(camera);
  cameraCenterX = ((p.x + 1) / 2) * window.innerWidth;
  cameraCenterY = ((1 - p.y) / 2) * window.innerHeight;
}

function applyStageTransform(): void {
  retro.root.scale.setScalar(cameraBaseScale * (1 + cameraHover * 0.36));
  stage.position.set(
    stageBase.x - cameraHover * 0.1,
    stageBase.y - cameraHover * 0.16,
    stageBase.z + cameraHover * 0.75,
  );
  shadow.position.y = -1.52 * retro.root.scale.x - 0.03;
}

function layout(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  composer.setSize(w, h);

  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  halfHeight = Math.tan(fov / 2) * CAMERA_DIST;
  const halfWidth = halfHeight * camera.aspect;
  const synthRect = synthHost.getBoundingClientRect();

  if (w > 900) {
    const synthEdge = synthRect.right || Math.min(w * 0.48, 680) + 18;
    const centerX = (synthEdge + w) / 2;
    const ndcX = (centerX / w) * 2 - 1;
    cameraBaseScale = THREE.MathUtils.clamp(h / 680, 1.1, 1.62);
    stageBase.set(ndcX * halfWidth * 0.92, -0.03, 0);
  } else {
    const panelBottom = synthRect.bottom || h * 0.54;
    const freePx = Math.max(0, h - panelBottom);
    const freeWorld = Math.max(0.2, (freePx / h) * halfHeight * 2);
    cameraBaseScale = THREE.MathUtils.clamp(
      Math.min((freeWorld * 0.9) / 2.25, (halfWidth * 1.85) / 1.55),
      0.26,
      1.0,
    );
    const centerNdcY = -(panelBottom / h);
    stageBase.set(0, centerNdcY * halfHeight + 0.38 * cameraBaseScale, 0);
  }

  const heightPx = ((2.4 * cameraBaseScale) / (halfHeight * 2)) * h;
  cameraHoverRadius = THREE.MathUtils.clamp(heightPx * 0.42, 80, 330);
  updateCameraCenter();
  applyStageTransform();
  shadow.position.y = -1.52 * retro.root.scale.x - 0.03;
}

layout();
window.addEventListener('resize', layout);

let layoutQueued = false;
window.addEventListener(
  'scroll',
  () => {
    if (layoutQueued) return;
    layoutQueued = true;
    requestAnimationFrame(() => {
      layoutQueued = false;
      layout();
    });
  },
  { passive: true },
);

/* ── кабели синтезатор → камера ─────────────────────────── */
const svgNS = 'http://www.w3.org/2000/svg';
const overlay = document.createElementNS(svgNS, 'svg');
overlay.setAttribute('class', 'camera-cables');
overlay.setAttribute('aria-hidden', 'true');
document.body.appendChild(overlay);

const CAMERA_CUT_MS = 560;
const CAMERA_PALETTE = ['#d98a3f', '#3f9fd6', '#6f5fc4', '#4faa5f', '#c4553f', '#a4bd55'];
const OUT_IDS = new Set<JackId>([
  'vcoA.out',
  'vcoB.out',
  'vcf.out',
  'vca.out',
  'mix.out',
  'master.out',
  'eg.out',
]);

interface CameraCable {
  from: JackId;
  port: CameraPortId;
  glow: SVGPathElement;
  line: SVGPathElement;
  hit: SVGPathElement;
  plugA: SVGCircleElement;
  plugB: SVGCircleElement;
}

const cameraCables: CameraCable[] = [];
let cameraColor = 0;
let hatchTimer = 0;
let cutting: CameraCable | null = null;
let cutTimer = 0;
let dragPreview: {
  from: JackId;
  glow: SVGPathElement;
  line: SVGPathElement;
  plug: SVGCircleElement;
} | null = null;

const portNdc = new THREE.Vector3();

function portPoint(port: CameraPortId): { x: number; y: number } {
  portNdc.copy(retro.portWorld(port)).project(camera);
  return {
    x: ((portNdc.x + 1) / 2) * window.innerWidth,
    y: ((1 - portNdc.y) / 2) * window.innerHeight,
  };
}

function cablePath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const sag = Math.min(150, 26 + dist * 0.16);
  const c1x = a.x + dx * 0.18;
  const c1y = a.y + sag + Math.max(0, -dy) * 0.08;
  const c2x = b.x - dx * 0.18;
  const c2y = b.y + sag + Math.max(0, dy) * 0.08;
  return `M ${a.x} ${a.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${b.x} ${b.y}`;
}

function nearestPort(x: number, y: number, radius: number): CameraPortId | null {
  let best: CameraPortId | null = null;
  let bestDist = radius;
  for (const port of ['video', 'sync'] as CameraPortId[]) {
    const p = portPoint(port);
    const dist = Math.hypot(p.x - x, p.y - y);
    if (dist < bestDist) {
      bestDist = dist;
      best = port;
    }
  }
  return best;
}

function drawCameraCables(): void {
  for (const cable of cameraCables) {
    const a = panel.jackClientPoint(cable.from);
    const b = portPoint(cable.port);
    const d = cablePath(a, b);
    cable.line.setAttribute('d', d);
    cable.glow.setAttribute('d', d);
    cable.hit.setAttribute('d', d);
    cable.plugA.setAttribute('cx', String(a.x));
    cable.plugA.setAttribute('cy', String(a.y));
    cable.plugB.setAttribute('cx', String(b.x));
    cable.plugB.setAttribute('cy', String(b.y));
  }
}

function scheduleHatchClose(): void {
  window.clearTimeout(hatchTimer);
  hatchTimer = window.setTimeout(() => {
    if (!retro.isPortConnected('video') && !retro.isPortConnected('sync')) retro.openHatch(false);
  }, 6500);
}

function stopCut(): void {
  window.clearTimeout(cutTimer);
  cutTimer = 0;
  if (cutting) {
    cutting.line.classList.remove('cutting');
    cutting = null;
  }
}

function removeCameraCable(cable: CameraCable): void {
  const i = cameraCables.indexOf(cable);
  if (i >= 0) cameraCables.splice(i, 1);
  cable.glow.remove();
  cable.line.remove();
  cable.hit.remove();
  cable.plugA.remove();
  cable.plugB.remove();
  retro.setPortConnected(cable.port, false);
  scheduleHatchClose();
}

function startCut(cable: CameraCable): void {
  stopCut();
  cutting = cable;
  cable.line.classList.add('cutting');
  cutTimer = window.setTimeout(() => {
    cutTimer = 0;
    if (cutting !== cable) return;
    cutting.line.classList.remove('cutting');
    cutting = null;
    removeCameraCable(cable);
    engine.click('button');
  }, CAMERA_CUT_MS);
}

function connectCameraCable(from: JackId, port: CameraPortId): void {
  if (!OUT_IDS.has(from)) return;
  const occupied = cameraCables.find((c) => c.port === port);
  if (occupied) removeCameraCable(occupied);

  const color = CAMERA_PALETTE[cameraColor++ % CAMERA_PALETTE.length];
  const glow = document.createElementNS(svgNS, 'path');
  glow.setAttribute('class', 'camera-cable-glow');
  glow.setAttribute('stroke', color);
  const line = document.createElementNS(svgNS, 'path');
  line.setAttribute('class', 'camera-cable');
  line.setAttribute('stroke', color);
  const hit = document.createElementNS(svgNS, 'path');
  hit.setAttribute('class', 'camera-cable-hit');
  hit.setAttribute('pathLength', '100');
  const title = document.createElementNS(svgNS, 'title');
  title.textContent = 'Hold to unplug';
  hit.appendChild(title);
  const plugA = document.createElementNS(svgNS, 'circle');
  plugA.setAttribute('class', 'camera-plug');
  plugA.setAttribute('r', '6.8');
  const plugB = document.createElementNS(svgNS, 'circle');
  plugB.setAttribute('class', 'camera-plug');
  plugB.setAttribute('r', '6.8');
  overlay.append(glow, line, hit, plugA, plugB);

  const cable: CameraCable = { from, port, glow, line, hit, plugA, plugB };
  hit.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const beneath = document
      .elementsFromPoint(e.clientX, e.clientY)
      .find((el): el is HTMLButtonElement => el instanceof HTMLButtonElement && el.classList.contains('jack'));
    if (beneath) {
      e.preventDefault();
      beneath.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          buttons: 1,
          clientX: e.clientX,
          clientY: e.clientY,
          pointerId: e.pointerId,
          pointerType: 'mouse',
        }),
      );
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    startCut(cable);
  });
  cameraCables.push(cable);
  retro.setPortConnected(port, true);
  retro.openHatch(true);
  engine.click('trigger');
  drawCameraCables();
}

function hidePreview(): void {
  if (!dragPreview) return;
  dragPreview.glow.remove();
  dragPreview.line.remove();
  dragPreview.plug.remove();
  dragPreview = null;
}

function showPreview(from: JackId): void {
  hidePreview();
  const glow = document.createElementNS(svgNS, 'path');
  glow.setAttribute('class', 'camera-preview-glow');
  const line = document.createElementNS(svgNS, 'path');
  line.setAttribute('class', 'camera-preview');
  const plug = document.createElementNS(svgNS, 'circle');
  plug.setAttribute('class', 'camera-plug');
  plug.setAttribute('r', '6.8');
  overlay.append(glow, line, plug);
  dragPreview = { from, glow, line, plug };
}

function updatePreview(x: number, y: number): void {
  if (!dragPreview) return;
  const a = panel.jackClientPoint(dragPreview.from);
  const b = { x, y };
  const d = cablePath(a, b);
  dragPreview.line.setAttribute('d', d);
  dragPreview.glow.setAttribute('d', d);
  dragPreview.plug.setAttribute('cx', String(b.x));
  dragPreview.plug.setAttribute('cy', String(b.y));

  const rect = synthHost.getBoundingClientRect();
  const inside = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  const visibility = inside ? 'hidden' : 'visible';
  dragPreview.line.style.visibility = visibility;
  dragPreview.glow.style.visibility = visibility;
  dragPreview.plug.style.visibility = visibility;
}

panel.setPatchHooks({
  onStart: (from) => {
    window.clearTimeout(hatchTimer);
    retro.openHatch(true);
    showPreview(from);
  },
  onMove: (from, x, y) => {
    updatePreview(x, y);
    retro.setPortHover(nearestPort(x, y, 46));
    if (!OUT_IDS.has(from)) return;
    const rect = synthHost.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return;
    const overCamera =
      cameraUnder(x, y) || Math.hypot(x - cameraCenterX, y - cameraCenterY) < cameraHoverRadius * 1.35;
    if (!overCamera) return;
    const port = nearestPort(x, y, Number.POSITIVE_INFINITY) ?? 'video';
    connectCameraCable(from, port);
    panel.cancelPatchDrag();
  },
  onEnd: () => {
    hidePreview();
    retro.setPortHover(null);
    scheduleHatchClose();
  },
  onCameraDrop: (from, x, y) => {
    const port = nearestPort(x, y, 54);
    if (!port || !OUT_IDS.has(from)) return false;
    connectCameraCable(from, port);
    return true;
  },
});

window.addEventListener('pointerup', stopCut);

/* ── наведение и клики по камере ─────────────────────────── */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const pointer = { x: 0.12, y: 0.04 };
let hoverId: CameraActionId | null = null;

const actionPoints: Array<{ id: CameraActionId; mesh: THREE.Mesh }> = [];
for (const mesh of retro.interactive) {
  const id = mesh.userData.action as CameraActionId | undefined;
  if (id && !actionPoints.some((entry) => entry.id === id)) actionPoints.push({ id, mesh });
}
const projected = new THREE.Vector3();
let cameraDrag: { pointerId: number; lastX: number; lastY: number; moved: number } | null = null;
let pendingAction: { id: CameraActionId; pointerId: number } | null = null;

function cameraUnder(x: number, y: number): boolean {
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  scene.updateMatrixWorld();
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObject(retro.root, true).length > 0;
}

function nearestAction(e: PointerEvent, radius: number): CameraActionId | null {
  scene.updateMatrixWorld();
  let best: CameraActionId | null = null;
  let bestDist = radius;
  for (const { id, mesh } of actionPoints) {
    mesh.getWorldPosition(projected).project(camera);
    if (projected.z > 1) continue;
    const x = ((projected.x + 1) / 2) * window.innerWidth;
    const y = ((1 - projected.y) / 2) * window.innerHeight;
    const dist = Math.hypot(x - e.clientX, y - e.clientY);
    if (dist < bestDist) {
      bestDist = dist;
      best = id;
    }
  }
  return best;
}

function overSynth(e: PointerEvent): boolean {
  const rect = synthHost.getBoundingClientRect();
  return e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
}

function nearCamera(e: PointerEvent): boolean {
  const reach = cameraHoverTarget === 1 ? 1.85 : 1 + cameraHover * 0.7;
  return Math.hypot(e.clientX - cameraCenterX, e.clientY - cameraCenterY) < cameraHoverRadius * reach;
}

function refreshCursor(): void {
  if (cameraDrag) {
    canvas.style.cursor = 'grabbing';
  } else if (hoverId) {
    canvas.style.cursor = 'pointer';
  } else {
    canvas.style.cursor = cameraHoverTarget === 1 ? 'grab' : 'default';
  }
}

function setHover(id: CameraActionId | null): void {
  if (id !== hoverId) {
    hoverId = id;
    retro.setHover(id);
  }
  refreshCursor();
}

function pick(e: PointerEvent): CameraActionId | null {
  const overPanel = e.target instanceof Element && e.target.closest('#synth');
  if (overPanel) return null;
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  scene.updateMatrixWorld();
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(retro.interactive, false)[0];
  return (hit?.object.userData.action as CameraActionId | undefined) ?? null;
}

function updatePointer(e: PointerEvent): void {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
}

window.addEventListener('pointermove', (e) => {
  updatePointer(e);
  if (cameraDrag) {
    if (e.pointerId !== cameraDrag.pointerId) return;
    const dx = e.clientX - cameraDrag.lastX;
    const dy = e.clientY - cameraDrag.lastY;
    cameraDrag.lastX = e.clientX;
    cameraDrag.lastY = e.clientY;
    cameraDrag.moved += Math.hypot(dx, dy);
    retro.spin(dx * 0.0058, dy * 0.0046);
    return;
  }
  const id = pick(e) ?? (overSynth(e) ? null : nearestAction(e, 38));
  setHover(id);
  cameraHoverTarget = !overSynth(e) && nearCamera(e) ? 1 : 0;
  refreshCursor();
});

function endCameraDrag(e: PointerEvent): void {
  if (!cameraDrag || e.pointerId !== cameraDrag.pointerId) return;
  const drag = cameraDrag;
  cameraDrag = null;
  if (canvas.hasPointerCapture(drag.pointerId)) canvas.releasePointerCapture(drag.pointerId);
  if (drag.moved < 7 && pendingAction && pendingAction.pointerId === e.pointerId) activate(pendingAction.id);
  pendingAction = null;
  refreshCursor();
}

function cancelCameraDrag(e: PointerEvent): void {
  if (!cameraDrag || e.pointerId !== cameraDrag.pointerId) return;
  if (canvas.hasPointerCapture(cameraDrag.pointerId)) canvas.releasePointerCapture(cameraDrag.pointerId);
  cameraDrag = null;
  pendingAction = null;
  refreshCursor();
}

window.addEventListener('pointerup', endCameraDrag);
window.addEventListener('pointercancel', cancelCameraDrag);

window.addEventListener('wheel', (e) => {
  if (e.target instanceof Element && e.target.closest('#synth')) return;
  if (cameraHoverTarget !== 1 || cameraDrag) return;
  e.preventDefault();
  retro.spin(e.deltaY * 0.0024, (e.shiftKey ? e.deltaY : 0) * 0.0012);
}, { passive: false });

window.addEventListener('pointerleave', () => {
  setHover(null);
  cameraHoverTarget = 0;
  cameraDrag = null;
  pendingAction = null;
  refreshCursor();
});

function clickKind(id: CameraActionId): 'button' | 'trigger' | 'dial' {
  if (id === 'trigger') return 'trigger';
  if (id === 'iris' || id === 'zoomIn' || id === 'zoomOut') return 'dial';
  return 'button';
}

function activate(id: CameraActionId): void {
  retro.press(id);
  if (id === 'rec' || id === 'trigger') {
    engine.click('trigger');
    engine.film(retro.state.rec && retro.state.power);
  } else if (id === 'power') {
    engine.click('button');
    engine.film(retro.state.rec && retro.state.power);
  } else {
    engine.click(clickKind(id));
  }
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  updatePointer(e);
  const id = pick(e) ?? nearestAction(e, 64);
  if (!overSynth(e) && e.pointerType === 'mouse' && (cameraUnder(e.clientX, e.clientY) || nearCamera(e))) {
    cameraDrag = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY, moved: 0 };
    pendingAction = id ? { id, pointerId: e.pointerId } : null;
    cameraHoverTarget = 1;
    retro.setInspect(true);
    if (id) setHover(id);
    if (e.pointerId !== undefined) canvas.setPointerCapture(e.pointerId);
    refreshCursor();
    e.preventDefault();
    return;
  }
  if (id) {
    setHover(id);
    activate(id);
  }
});

/* ── цикл ───────────────────────────────────────────────── */
let last = performance.now();
let frame = 0;

function tick(now: number): void {
  const dt = THREE.MathUtils.clamp((now - last) / 1000, 0, 0.05);
  last = now;
  const time = now / 1000;

  cameraHover = THREE.MathUtils.damp(cameraHover, cameraHoverTarget, 5, dt);
  const inspect = cameraHoverTarget === 1;
  retro.setInspect(inspect);
  const follow = 1 - cameraHover;
  retro.update(dt, pointer.x * follow, pointer.y * follow, time);
  applyStageTransform();
  key.position.x = 4.2 + Math.sin(time * 0.17) * 0.25;

  if ((frame++ & 1) === 0) {
    panel.updateVu();
  }

  drawCameraCables();

  composer.render();
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);

Object.assign(window, {
  __lab: {
    engine,
    retro,
    panel,
    renderer,
    scene,
    camera,
    activate,
    getState: () => ({ ...retro.state }),
    getCameraCables: () => cameraCables.map((c) => ({ from: c.from, port: c.port })),
    connectCameraCable,
    projection: () => retro.glowAmount(),
    setHover: (id: CameraActionId | null) => {
      retro.setHover(id);
      hoverId = id;
    },
  },
});

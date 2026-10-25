import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type CameraActionId = 'power' | 'rec' | 'zoomIn' | 'zoomOut' | 'iris' | 'trigger' | 'hatch';
export type CameraPortId = 'video' | 'sync';

export interface CameraState {
  power: boolean;
  rec: boolean;
  zoom: number;
  iris: number;
  hatchOpen: boolean;
}

export interface RetroCameraApi {
  root: THREE.Group;
  interactive: THREE.Mesh[];
  state: CameraState;
  setHover: (id: CameraActionId | null) => void;
  press: (id: CameraActionId) => void;
  update: (dt: number, lookX: number, lookY: number, time: number) => void;
  portWorld: (id: CameraPortId) => THREE.Vector3;
  setPortConnected: (id: CameraPortId, connected: boolean) => void;
  setPortHover: (id: CameraPortId | null) => void;
  openHatch: (open: boolean) => void;
  isPortConnected: (id: CameraPortId) => boolean;
  glowAmount: () => number;
  spin: (deltaYaw: number, deltaPitch?: number) => void;
  setInspect: (on: boolean) => void;
}

interface ButtonRef {
  mesh: THREE.Mesh;
  baseScale: THREE.Vector3;
  material: THREE.MeshStandardMaterial;
}

function makeTextPlane(text: string, width: number, height: number, color: string): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.max(32, Math.round((512 * height) / width));
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  ctx.font = `${Math.round(canvas.height * 0.62)}px "Share Tech Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + canvas.height * 0.03);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
}

export function buildRetroCamera(): RetroCameraApi {
  const root = new THREE.Group();
  root.name = 'retro-camera';

  const cream = new THREE.MeshStandardMaterial({ color: 0xd6cbae, roughness: 0.62, metalness: 0.04 });
  const creamTrim = new THREE.MeshStandardMaterial({ color: 0xc3b898, roughness: 0.76, metalness: 0.05 });
  const black = new THREE.MeshStandardMaterial({ color: 0x151713, roughness: 0.42, metalness: 0.35 });
  const blackFlat = new THREE.MeshStandardMaterial({
    color: 0x161814,
    roughness: 0.44,
    metalness: 0.4,
    flatShading: true,
  });
  const blackMatte = new THREE.MeshStandardMaterial({ color: 0x0b0d0a, roughness: 0.9, metalness: 0.06 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xb9b4a2, roughness: 0.26, metalness: 0.92 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x77746a, roughness: 0.34, metalness: 0.88 });
  const red = new THREE.MeshStandardMaterial({ color: 0xb93a2e, roughness: 0.36, metalness: 0.16 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x0a0b0a, roughness: 0.96, metalness: 0.02 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x040c08,
    roughness: 0.11,
    metalness: 0.5,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    emissive: new THREE.Color(0x2c8f58),
    emissiveIntensity: 0.04,
  });
  const amber = new THREE.MeshStandardMaterial({
    color: 0x3a2708,
    roughness: 0.4,
    metalness: 0,
    emissive: new THREE.Color(0xe2a83c),
    emissiveIntensity: 1.35,
  });
  const greenLed = new THREE.MeshStandardMaterial({
    color: 0x0b1f10,
    roughness: 0.4,
    metalness: 0,
    emissive: new THREE.Color(0x63ffa0),
    emissiveIntensity: 1.45,
  });
  const recLamp = new THREE.MeshStandardMaterial({
    color: 0x2a0704,
    roughness: 0.35,
    metalness: 0.1,
    emissive: new THREE.Color(0xff3b2f),
    emissiveIntensity: 0.04,
  });
  const irisBlack = new THREE.MeshStandardMaterial({ color: 0x1b1d18, roughness: 0.48, metalness: 0.45 });

  const box = (w: number, h: number, d: number, radius: number, material: THREE.Material): THREE.Mesh =>
    new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, radius), material);
  const zCyl = (r1: number, r2: number, h: number, material: THREE.Material, open = false, seg = 40): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg, 1, open), material);
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  };
  const xCyl = (r: number, h: number, material: THREE.Material, seg = 36): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), material);
    mesh.rotation.z = Math.PI / 2;
    return mesh;
  };
  const ring = (r: number, tube: number, material: THREE.Material, seg = 48, arc = Math.PI * 2): THREE.Mesh =>
    new THREE.Mesh(new THREE.TorusGeometry(r, tube, 10, seg, arc), material);
  const disc = (r: number, material: THREE.Material, seg = 48): THREE.Mesh =>
    new THREE.Mesh(new THREE.CircleGeometry(r, seg), material);

  /* ── корпус: плоский по ширине объектива, вытянутый вперёд ── */
  const body = new THREE.Group();
  root.add(body);

  const shell = box(0.74, 1.2, 0.62, 0.06, cream);
  shell.position.z = -0.02;
  body.add(shell);

  const lower = box(0.72, 0.15, 0.64, 0.05, creamTrim);
  lower.position.set(0, -0.555, -0.02);
  body.add(lower);

  const facePanel = box(0.68, 0.96, 0.05, 0.03, cream);
  facePanel.position.set(0, 0, 0.3);
  body.add(facePanel);

  const frontWindow = box(0.2, 0.11, 0.03, 0.018, blackMatte);
  frontWindow.position.set(-0.18, -0.2, 0.333);
  body.add(frontWindow);

  const badge = makeTextPlane('AD-8000', 0.34, 0.065, '#2c2f25');
  badge.position.set(0, -0.45, 0.331);
  body.add(badge);

  const frontDial = new THREE.Group();
  frontDial.position.set(0.18, -0.2, 0.333);
  body.add(frontDial);
  frontDial.add(zCyl(0.125, 0.125, 0.04, chrome));
  const frontDialFace = disc(0.098, black);
  frontDialFace.position.z = 0.024;
  frontDial.add(frontDialFace);
  const frontDialMark = box(0.008, 0.06, 0.012, 0.002, creamTrim);
  frontDialMark.position.set(0, 0.062, 0.031);
  frontDial.add(frontDialMark);
  frontDial.rotation.z = -0.55;

  const hump = box(0.56, 0.14, 0.46, 0.05, cream);
  hump.position.set(0, 0.665, -0.1);
  body.add(hump);

  const topRail = box(0.62, 0.028, 0.07, 0.01, chrome);
  topRail.position.set(0, 0.607, 0.16);
  body.add(topRail);

  /* ── боковая панель с приборами ─────────────────────────── */
  const sidePlate = box(0.035, 0.92, 0.54, 0.02, blackMatte);
  sidePlate.position.set(0.372, -0.02, -0.02);
  body.add(sidePlate);

  const screwPositions: Array<[number, number]> = [
    [-0.35, -0.18],
    [-0.35, 0.18],
    [0.35, -0.18],
    [0.35, 0.18],
  ];
  for (const [y, z] of screwPositions) {
    const screw = xCyl(0.022, 0.014, chrome);
    screw.position.set(0.392, y, z);
    body.add(screw);
  }

  const dial = new THREE.Group();
  dial.position.set(0.392, 0.17, 0.18);
  body.add(dial);
  dial.add(xCyl(0.15, 0.06, chrome));
  const dialFace = disc(0.118, creamTrim);
  dialFace.rotation.y = Math.PI / 2;
  dialFace.position.x = 0.032;
  dial.add(dialFace);
  const dialMark = box(0.007, 0.05, 0.01, 0.002, black);
  dialMark.position.set(0.04, 0.08, 0);
  dial.add(dialMark);
  dial.rotation.x = -0.6;

  const smallDial = new THREE.Group();
  smallDial.position.set(0.391, -0.17, -0.2);
  body.add(smallDial);
  smallDial.add(xCyl(0.095, 0.05, chrome));
  const smallFace = disc(0.074, creamTrim);
  smallFace.rotation.y = Math.PI / 2;
  smallFace.position.x = 0.028;
  smallDial.add(smallFace);
  const smallMark = box(0.006, 0.036, 0.009, 0.002, black);
  smallMark.position.set(0.034, 0.048, 0);
  smallDial.add(smallMark);
  smallDial.rotation.x = 1.1;

  const amberRing = ring(0.05, 0.01, black, 32);
  amberRing.rotation.y = Math.PI / 2;
  amberRing.position.set(0.394, 0.34, -0.17);
  body.add(amberRing);
  const amberLamp = disc(0.034, amber, 32);
  amberLamp.rotation.y = Math.PI / 2;
  amberLamp.position.set(0.398, 0.34, -0.17);
  body.add(amberLamp);

  const powerLed = new THREE.Mesh(new THREE.SphereGeometry(0.024, 16, 12), greenLed);
  powerLed.position.set(0.394, 0.44, -0.18);
  body.add(powerLed);

  const sideLabel = makeTextPlane('A.DOKIN / 8MM', 0.4, 0.065, '#d8d1bb');
  sideLabel.rotation.y = Math.PI / 2;
  sideLabel.position.set(0.394, -0.37, 0.14);
  body.add(sideLabel);

  /* ── кнопки на корпусе ──────────────────────────────────── */
  const recBase = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.028, 32), black);
  recBase.position.set(-0.2, 0.607, 0.22);
  body.add(recBase);
  const recButton = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.07, 32), red);
  recButton.position.set(-0.2, 0.644, 0.22);
  recButton.userData.action = 'rec';
  body.add(recButton);

  const powerBase = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.025, 32), black);
  powerBase.position.set(0.02, 0.607, 0.22);
  body.add(powerBase);
  const powerButton = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.05, 28), chrome);
  powerButton.position.set(0.02, 0.639, 0.22);
  body.add(powerButton);

  const tallyRing = ring(0.05, 0.01, black, 32);
  tallyRing.position.set(-0.26, 0.55, 0.331);
  body.add(tallyRing);
  const tallyLamp = disc(0.036, recLamp, 32);
  tallyLamp.position.set(-0.26, 0.55, 0.335);
  body.add(tallyLamp);

  /* ── верхний люк с патч-портами ─────────────────────────── */
  const hatchX = 0;
  const hatchZ = -0.14;
  const hatchW = 0.38;
  const hatchD = 0.32;
  const hatchTop = 0.737;

  const hatchBay = box(hatchW, 0.02, hatchD, 0.006, blackMatte);
  hatchBay.position.set(hatchX, hatchTop - 0.004, hatchZ);
  body.add(hatchBay);

  const lipMat = chrome;
  const lipF = box(hatchW + 0.024, 0.012, 0.014, 0.004, lipMat);
  lipF.position.set(hatchX, hatchTop + 0.004, hatchZ + hatchD / 2 + 0.006);
  body.add(lipF);
  const lipB = box(hatchW + 0.024, 0.012, 0.014, 0.004, lipMat);
  lipB.position.set(hatchX, hatchTop + 0.004, hatchZ - hatchD / 2 - 0.006);
  body.add(lipB);
  const lipL = box(0.014, 0.012, hatchD + 0.024, 0.004, lipMat);
  lipL.position.set(hatchX - hatchW / 2 - 0.006, hatchTop + 0.004, hatchZ);
  body.add(lipL);
  const lipR = box(0.014, 0.012, hatchD + 0.024, 0.004, lipMat);
  lipR.position.set(hatchX + hatchW / 2 + 0.006, hatchTop + 0.004, hatchZ);
  body.add(lipR);

  const doorW = hatchW - 0.018;
  const doorD = hatchD - 0.014;

  const hatchPivot = new THREE.Group();
  hatchPivot.position.set(hatchX, hatchTop + 0.033, hatchZ - hatchD / 2);
  body.add(hatchPivot);

  const hatchDoor = box(doorW, 0.016, doorD, 0.006, cream);
  hatchDoor.position.set(0, 0.008, doorD / 2);
  hatchPivot.add(hatchDoor);

  const hatchLabel = makeTextPlane('PATCH', 0.14, 0.03, '#3a3d32');
  hatchLabel.rotation.x = -Math.PI / 2;
  hatchLabel.position.set(0, 0.0165, doorD / 2);
  hatchPivot.add(hatchLabel);

  const hatchInner = box(doorW - 0.03, 0.006, doorD - 0.04, 0.004, creamTrim);
  hatchInner.position.set(0, -0.007, doorD / 2);
  hatchPivot.add(hatchInner);

  const hatchInnerPlate = box(doorW - 0.06, 0.004, doorD - 0.085, 0.002, blackMatte);
  hatchInnerPlate.position.set(0, -0.0105, doorD / 2);
  hatchPivot.add(hatchInnerPlate);

  for (const bz of [0.035, doorD - 0.035]) {
    const bar = box(doorW - 0.06, 0.005, 0.012, 0.002, chrome);
    bar.position.set(0, -0.0135, bz);
    hatchPivot.add(bar);
  }

  const hatchInnerLabel = makeTextPlane('PATCH BAY', 0.14, 0.024, '#9aa08a');
  hatchInnerLabel.rotation.x = Math.PI / 2;
  hatchInnerLabel.position.set(0, -0.0145, doorD / 2 + 0.075);
  hatchPivot.add(hatchInnerLabel);

  const hatchInnerHint = makeTextPlane('SIGNAL IN', 0.12, 0.019, '#7c856f');
  hatchInnerHint.rotation.x = Math.PI / 2;
  hatchInnerHint.position.set(0, -0.0145, doorD / 2 - 0.075);
  hatchPivot.add(hatchInnerHint);

  const hatchLatch = new THREE.Mesh(new THREE.SphereGeometry(0.012, 14, 10), chrome);
  hatchLatch.position.set(0, 0.016, doorD - 0.024);
  hatchPivot.add(hatchLatch);

  const hatchHinge = xCyl(0.012, hatchW + 0.016, steel, 20);
  hatchHinge.position.set(hatchX, hatchTop + 0.043, hatchZ - hatchD / 2);
  body.add(hatchHinge);

  const hatchHit = new THREE.Mesh(
    new THREE.PlaneGeometry(hatchW + 0.08, hatchD + 0.08),
    new THREE.MeshStandardMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
  );
  hatchHit.rotation.x = -Math.PI / 2;
  hatchHit.position.set(hatchX, hatchTop + 0.07, hatchZ);
  body.add(hatchHit);

  const bayLampMat = new THREE.MeshStandardMaterial({
    color: 0x0c1a10,
    roughness: 0.6,
    metalness: 0,
    emissive: new THREE.Color(0x63ffa0),
    emissiveIntensity: 0.08,
  });
  const bayLamp = box(hatchW - 0.06, 0.005, 0.024, 0.002, bayLampMat);
  bayLamp.position.set(hatchX, hatchTop + 0.009, hatchZ + hatchD / 2 - 0.035);
  body.add(bayLamp);

  const bayGlowCanvas = document.createElement('canvas');
  bayGlowCanvas.width = 128;
  bayGlowCanvas.height = 128;
  const bayGlowCtx = bayGlowCanvas.getContext('2d')!;
  const bayGlowGrad = bayGlowCtx.createRadialGradient(64, 54, 4, 64, 64, 72);
  bayGlowGrad.addColorStop(0, 'rgba(126, 255, 184, 0.6)');
  bayGlowGrad.addColorStop(1, 'rgba(18, 70, 44, 0)');
  bayGlowCtx.fillStyle = bayGlowGrad;
  bayGlowCtx.fillRect(0, 0, 128, 128);
  const bayGlowTex = new THREE.CanvasTexture(bayGlowCanvas);
  bayGlowTex.colorSpace = THREE.SRGBColorSpace;
  const bayGlowMat = new THREE.MeshBasicMaterial({
    map: bayGlowTex,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const bayGlow = new THREE.Mesh(new THREE.PlaneGeometry(hatchW - 0.02, hatchD - 0.03), bayGlowMat);
  bayGlow.rotation.x = -Math.PI / 2;
  bayGlow.position.set(hatchX, hatchTop + 0.007, hatchZ);
  bayGlow.renderOrder = 2;
  body.add(bayGlow);

  const portAnchors = {} as Record<CameraPortId, THREE.Object3D>;
  const portMats = {} as Record<CameraPortId, { collar: THREE.MeshStandardMaterial; led: THREE.MeshStandardMaterial }>;
  const portConnected: Record<CameraPortId, boolean> = { video: false, sync: false };
  const portHover: Record<CameraPortId, number> = { video: 0, sync: 0 };

  const makePort = (id: CameraPortId, dx: number, label: string): void => {
    const group = new THREE.Group();
    group.position.set(hatchX + dx, hatchTop + 0.012, hatchZ);
    group.rotation.x = -Math.PI / 2;
    body.add(group);

    const collarMat = chrome.clone();
    collarMat.emissive = new THREE.Color(0x63ffa0);
    collarMat.emissiveIntensity = 0;
    const collar = ring(0.034, 0.007, collarMat, 28);
    group.add(collar);

    const bore = disc(0.024, black, 24);
    bore.position.z = 0.003;
    group.add(bore);

    const pin = new THREE.Mesh(new THREE.CircleGeometry(0.007, 14), steel);
    pin.position.z = 0.005;
    group.add(pin);

    const ledMat = greenLed.clone();
    ledMat.emissiveIntensity = 0.06;
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.007, 10, 8), ledMat);
    led.position.set(0, 0.052, 0.004);
    group.add(led);

    const text = makeTextPlane(label, 0.075, 0.018, '#d8d1bb');
    text.position.set(0, -0.058, 0.004);
    group.add(text);

    const anchor = new THREE.Object3D();
    anchor.position.set(0, 0, 0.012);
    group.add(anchor);

    portAnchors[id] = anchor;
    portMats[id] = { collar: collarMat, led: ledMat };
  };

  makePort('video', -0.055, 'VIDEO');
  makePort('sync', 0.055, 'SYNC');

  /* ── пистолетная рукоятка ───────────────────────────────── */
  const grip = new THREE.Group();
  grip.position.set(0.02, -0.66, 0);
  grip.rotation.x = 0.22;
  body.add(grip);

  const gripBody = box(0.3, 0.9, 0.34, 0.1, cream);
  gripBody.position.set(0, -0.35, 0);
  grip.add(gripBody);

  const gripPad = box(0.26, 0.54, 0.06, 0.03, rubber);
  gripPad.position.set(0, -0.43, 0.19);
  grip.add(gripPad);

  const gripCap = box(0.33, 0.08, 0.37, 0.03, blackMatte);
  gripCap.position.set(0, -0.8, 0);
  grip.add(gripCap);

  const triggerHousing = box(0.17, 0.34, 0.12, 0.035, blackMatte);
  triggerHousing.position.set(0, -0.03, 0.19);
  grip.add(triggerHousing);

  const triggerPivot = new THREE.Group();
  triggerPivot.position.set(0, 0.1, 0.245);
  grip.add(triggerPivot);

  const trigger = box(0.095, 0.27, 0.075, 0.028, red);
  trigger.position.set(0, -0.14, 0.012);
  trigger.userData.action = 'trigger';
  triggerPivot.add(trigger);

  const pivotPin = xCyl(0.026, 0.2, chrome, 20);
  pivotPin.position.set(0, 0.1, 0.245);
  grip.add(pivotPin);

  /* ── объектив ───────────────────────────────────────────── */
  const lens = new THREE.Group();
  lens.position.set(0, 0.3, -0.02);
  body.add(lens);

  const mount = zCyl(0.33, 0.33, 0.14, cream);
  mount.position.z = 0.32;
  lens.add(mount);

  const mountRing = ring(0.32, 0.012, chrome, 56);
  mountRing.position.z = 0.385;
  lens.add(mountRing);

  const barrel = zCyl(0.295, 0.295, 0.2, black);
  barrel.position.z = 0.48;
  lens.add(barrel);

  const focusRing = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.1, 28, 1, true), blackFlat);
  focusRing.rotation.x = Math.PI / 2;
  focusRing.position.z = 0.58;
  lens.add(focusRing);

  const focusTrimA = ring(0.311, 0.008, steel, 48);
  focusTrimA.position.z = 0.525;
  lens.add(focusTrimA);

  const focusTrimB = ring(0.311, 0.008, steel, 48);
  focusTrimB.position.z = 0.635;
  lens.add(focusTrimB);

  const midBarrel = zCyl(0.278, 0.278, 0.16, black);
  midBarrel.position.z = 0.7;
  lens.add(midBarrel);

  const iris = new THREE.Group();
  iris.position.z = 0.655;
  iris.add(ring(0.31, 0.03, irisBlack, 56));
  const irisMark = box(0.022, 0.022, 0.03, 0.006, creamTrim);
  irisMark.position.set(0.292, 0, 0.028);
  iris.add(irisMark);
  lens.add(iris);

  const front = new THREE.Group();
  lens.add(front);

  const frontRing = new THREE.Mesh(new THREE.CylinderGeometry(0.297, 0.297, 0.09, 30, 1, true), blackFlat);
  frontRing.rotation.x = Math.PI / 2;
  frontRing.position.z = 0.765;
  front.add(frontRing);

  const frontTrim = ring(0.299, 0.008, steel, 48);
  frontTrim.position.z = 0.812;
  front.add(frontTrim);

  const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.355, 0.3, 0.15, 56, 1, true), blackFlat);
  hood.rotation.x = Math.PI / 2;
  hood.position.z = 0.9;
  front.add(hood);

  const hoodRim = ring(0.352, 0.011, steel, 60);
  hoodRim.position.z = 0.978;
  front.add(hoodRim);

  const hoodInner = new THREE.Mesh(new THREE.CylinderGeometry(0.298, 0.32, 0.15, 48, 1, true), blackMatte);
  hoodInner.rotation.x = Math.PI / 2;
  hoodInner.position.z = 0.91;
  front.add(hoodInner);

  const hoodFace = new THREE.Mesh(new THREE.RingGeometry(0.246, 0.352, 64), blackFlat);
  hoodFace.position.z = 0.952;
  front.add(hoodFace);

  const optic = disc(0.246, glass);
  optic.position.z = 0.944;
  front.add(optic);

  const opticRingA = ring(0.248, 0.005, steel, 48);
  opticRingA.position.z = 0.957;
  front.add(opticRingA);

  const opticRingB = ring(0.16, 0.004, steel, 40);
  opticRingB.position.z = 0.958;
  front.add(opticRingB);

  /* ── диафрагма: canvas-лепестки поверх оптики ───────────── */
  const apertureCanvas = document.createElement('canvas');
  apertureCanvas.width = 256;
  apertureCanvas.height = 256;
  const apertureCtx = apertureCanvas.getContext('2d')!;
  const apertureTex = new THREE.CanvasTexture(apertureCanvas);
  apertureTex.colorSpace = THREE.SRGBColorSpace;
  const aperture = new THREE.Mesh(
    new THREE.CircleGeometry(0.244, 64),
    new THREE.MeshBasicMaterial({ map: apertureTex, transparent: true, depthWrite: false }),
  );
  aperture.position.z = 0.9475;
  aperture.renderOrder = 2;
  front.add(aperture);

  let apertureDrawn = -1;
  const drawAperture = (amount: number): void => {
    const size = apertureCanvas.width;
    const c = apertureCtx;
    const cx = size / 2;
    const cy = size / 2;
    const outer = size * 0.5;
    const hole = outer * (0.93 - amount * 0.34);
    c.clearRect(0, 0, size, size);
    c.fillStyle = '#0b0e09';
    c.beginPath();
    c.arc(cx, cy, outer, 0, Math.PI * 2);
    c.fill();

    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * Math.PI * 2 + amount * 0.06;
      const a1 = a0 + Math.PI / 3;
      const mid = (a0 + a1) / 2;
      c.fillStyle = i % 2 === 0 ? '#151a12' : '#1e241b';
      c.beginPath();
      c.moveTo(cx + Math.cos(mid) * hole * 0.94, cy + Math.sin(mid) * hole * 0.94);
      c.lineTo(cx + Math.cos(a0) * outer, cy + Math.sin(a0) * outer);
      c.arc(cx, cy, outer, a0, a1);
      c.closePath();
      c.fill();
    }

    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i / 6) * Math.PI * 2;
      const x = cx + Math.cos(a) * hole;
      const y = cy + Math.sin(a) * hole;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
    c.fill();
    c.globalCompositeOperation = 'source-over';

    c.strokeStyle = 'rgba(198, 192, 172, 0.3)';
    c.lineWidth = 1.6;
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i / 6) * Math.PI * 2;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * hole, cy + Math.sin(a) * hole);
      c.lineTo(cx + Math.cos(a + 0.42) * outer, cy + Math.sin(a + 0.42) * outer);
      c.stroke();
    }

    c.strokeStyle = 'rgba(230, 224, 204, 0.42)';
    c.lineWidth = 2;
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i / 6) * Math.PI * 2;
      const x = cx + Math.cos(a) * hole;
      const y = cy + Math.sin(a) * hole;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
    c.stroke();
    apertureTex.needsUpdate = true;
  };
  drawAperture(0);
  apertureDrawn = 0;

  const lensLabel = makeTextPlane('1:1.8 / 8-64', 0.32, 0.055, '#b9b29d');
  lensLabel.rotation.y = Math.PI / 2;
  lensLabel.position.set(0.3, 0.02, 0.47);
  lens.add(lensLabel);

  /* ── видоискатель ───────────────────────────────────────── */
  const eyepiece = new THREE.Group();
  eyepiece.position.set(0.26, 0.3, -0.34);
  eyepiece.rotation.x = -0.12;
  body.add(eyepiece);

  const eyeTube = zCyl(0.105, 0.095, 0.26, blackMatte);
  eyeTube.position.z = -0.09;
  eyepiece.add(eyeTube);

  const eyeCup = ring(0.118, 0.04, rubber, 32);
  eyeCup.position.z = -0.23;
  eyepiece.add(eyeCup);

  const eyeGlassMat = new THREE.MeshStandardMaterial({
    color: 0x06110c,
    roughness: 0.12,
    metalness: 0.7,
    emissive: new THREE.Color(0x2a8a55),
    emissiveIntensity: 0.45,
  });
  const eyeGlass = disc(0.062, eyeGlassMat, 32);
  eyeGlass.rotation.y = Math.PI;
  eyeGlass.position.z = -0.245;
  eyepiece.add(eyeGlass);

  /* ── свечение объектива ─────────────────────────────────── */
  const lensGlowCanvas = document.createElement('canvas');
  lensGlowCanvas.width = 128;
  lensGlowCanvas.height = 128;
  const lensGlowCtx = lensGlowCanvas.getContext('2d')!;
  const lensGlowGrad = lensGlowCtx.createRadialGradient(64, 64, 2, 64, 64, 62);
  lensGlowGrad.addColorStop(0, 'rgba(220,255,235,0.95)');
  lensGlowGrad.addColorStop(0.25, 'rgba(120,255,175,0.5)');
  lensGlowGrad.addColorStop(1, 'rgba(40,120,70,0)');
  lensGlowCtx.fillStyle = lensGlowGrad;
  lensGlowCtx.fillRect(0, 0, 128, 128);
  const lensGlowTexture = new THREE.CanvasTexture(lensGlowCanvas);
  lensGlowTexture.colorSpace = THREE.SRGBColorSpace;
  const lensGlowMat = new THREE.MeshBasicMaterial({
    map: lensGlowTexture,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const lensGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.56), lensGlowMat);
  lensGlow.position.z = 0.995;
  front.add(lensGlow);

  const lensLight = new THREE.PointLight(0x7dffb2, 0, 2.6, 2);
  lensLight.position.z = 1.18;
  front.add(lensLight);

  /* ── интерактивные элементы ─────────────────────────────── */
  const interactive: THREE.Mesh[] = [];
  const buttons: Array<ButtonRef & { id: CameraActionId }> = [];
  const hoverAmt = new Map<CameraActionId, number>();
  const pressAmt = new Map<CameraActionId, number>();

  const register = (mesh: THREE.Mesh, id: CameraActionId): void => {
    const source = mesh.material as THREE.MeshStandardMaterial;
    const material = source.clone();
    material.emissive = new THREE.Color(0x63ffa0);
    material.emissiveIntensity = 0;
    mesh.material = material;
    mesh.userData.action = id;
    interactive.push(mesh);
    buttons.push({ id, mesh, baseScale: mesh.scale.clone(), material });
    hoverAmt.set(id, 0);
    pressAmt.set(id, 0);
  };

  const irisHit = new THREE.Mesh(
    new THREE.CircleGeometry(0.255, 48),
    new THREE.MeshStandardMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
  );
  irisHit.position.z = 0.965;
  front.add(irisHit);

  register(recButton, 'rec');
  register(powerButton, 'power');
  register(trigger, 'trigger');
  register(iris.children[0] as THREE.Mesh, 'iris');
  register(irisHit, 'iris');

  const zoomButton = (z: number, plus: boolean): THREE.Mesh => {
    const base = box(0.12, 0.045, 0.12, 0.015, black);
    base.position.set(0.24, 0.607, z);
    body.add(base);
    const button = box(0.088, 0.04, 0.088, 0.012, chrome);
    button.position.set(0.24, 0.635, z);
    body.add(button);
    const barH = box(0.04, 0.005, 0.005, 0.001, black);
    barH.position.y = 0.021;
    button.add(barH);
    if (plus) {
      const barV = box(0.005, 0.005, 0.04, 0.001, black);
      barV.position.y = 0.021;
      button.add(barV);
    }
    return button;
  };

  register(zoomButton(0.26, true), 'zoomIn');
  register(zoomButton(0.12, false), 'zoomOut');
  register(hatchHit, 'hatch');

  const state: CameraState = { power: true, rec: false, zoom: 0.32, iris: 0, hatchOpen: false };
  let hovered: CameraActionId | null = null;
  const triggerBase = triggerPivot.rotation.x;
  let inspecting = false;
  let manualYaw = 0;
  let manualPitch = 0;

  const setInspect = (on: boolean): void => {
    inspecting = on;
  };

  const spin = (deltaYaw: number, deltaPitch = 0): void => {
    manualYaw = THREE.MathUtils.clamp(manualYaw + deltaYaw, -1.45, 1.45);
    manualPitch = THREE.MathUtils.clamp(manualPitch + deltaPitch, -0.6, 1.1);
  };

  const setHover = (id: CameraActionId | null): void => {
    hovered = id;
  };

  const press = (id: CameraActionId): void => {
    pressAmt.set(id, 1);
    switch (id) {
      case 'power':
        state.power = !state.power;
        if (!state.power) state.rec = false;
        break;
      case 'rec':
        state.power = true;
        state.rec = !state.rec;
        break;
      case 'trigger':
        state.power = true;
        state.rec = !state.rec;
        break;
      case 'zoomIn':
        state.zoom = Math.min(1, state.zoom + 0.25);
        break;
      case 'zoomOut':
        state.zoom = Math.max(0, state.zoom - 0.25);
        break;
      case 'iris':
        state.iris = (state.iris + 1) % 3;
        break;
      case 'hatch':
        state.hatchOpen = !state.hatchOpen;
        break;
    }
  };

  let lookYaw = -0.13;
  let lookPitch = -0.04;
  let hatchAmt = 0;
  let projectAmt = 0;
  let hoveredPort: CameraPortId | null = null;

  const openHatch = (open: boolean): void => {
    state.hatchOpen = open;
  };

  const setPortConnected = (id: CameraPortId, connected: boolean): void => {
    portConnected[id] = connected;
    if (connected) state.hatchOpen = true;
  };

  const setPortHover = (id: CameraPortId | null): void => {
    hoveredPort = id;
  };

  const isPortConnected = (id: CameraPortId): boolean => portConnected[id];

  const portWorld = (id: CameraPortId): THREE.Vector3 => {
    portAnchors[id].updateWorldMatrix(true, false);
    return portAnchors[id].getWorldPosition(new THREE.Vector3());
  };

  const glowAmount = (): number => projectAmt;

  const update = (dt: number, lookX: number, lookY: number, time: number): void => {
    const targetYaw = -0.13 + lookX * 0.68;
    const targetPitch = -0.04 + lookY * 0.42;
    lookYaw = THREE.MathUtils.damp(lookYaw, targetYaw, 10.5, dt);
    lookPitch = THREE.MathUtils.damp(lookPitch, targetPitch, 10, dt);

    if (!inspecting) {
      manualYaw = THREE.MathUtils.damp(manualYaw, 0, 4, dt);
      manualPitch = THREE.MathUtils.damp(manualPitch, 0, 4, dt);
    }

    const sway = inspecting ? 0.3 : 1;
    root.rotation.y = lookYaw + manualYaw + Math.sin(time * 0.31) * 0.012 * sway;
    root.rotation.x = lookPitch + manualPitch + Math.sin(time * 0.27) * 0.006 * sway;
    root.rotation.z = -lookX * 0.09 + Math.sin(time * 0.23) * 0.005 * sway;
    root.position.y = Math.sin(time * 0.55) * 0.02;

    for (const entry of buttons) {
      const id = entry.id;
      const hoverTarget = hovered === id ? 1 : 0;
      const hover = THREE.MathUtils.damp(hoverAmt.get(id) ?? 0, hoverTarget, 16, dt);
      hoverAmt.set(id, hover);

      const pressValue = THREE.MathUtils.damp(pressAmt.get(id) ?? 0, 0, 14, dt);
      pressAmt.set(id, pressValue);

      entry.mesh.scale.copy(entry.baseScale).multiplyScalar(1 + hover * 0.055 - pressValue * 0.12);
      entry.material.emissiveIntensity = hover * 0.8 + pressValue * 0.35;
    }

    triggerPivot.rotation.x = triggerBase + (pressAmt.get('trigger') ?? 0) * 0.5;

    front.position.z = THREE.MathUtils.damp(front.position.z, state.zoom * 0.12, 8, dt);
    iris.rotation.z = THREE.MathUtils.damp(iris.rotation.z, state.iris * 2.094, 9, dt);

    const apertureAmt = THREE.MathUtils.damp(apertureDrawn, state.iris, 7, dt);
    if (Math.abs(apertureAmt - apertureDrawn) > 0.01) {
      apertureDrawn = apertureAmt;
      drawAperture(apertureAmt);
    }
    aperture.rotation.z = apertureAmt * 0.16;

    /* люк и патч-порты */
    hatchAmt = THREE.MathUtils.damp(hatchAmt, state.hatchOpen ? 1 : 0, 8, dt);
    hatchPivot.rotation.x = -hatchAmt * 1.95;
    const bayOn = portConnected.video || portConnected.sync;
    bayLampMat.emissiveIntensity = 0.06 + hatchAmt * (bayOn ? 1.15 + Math.sin(time * 4.6) * 0.2 : 0.7);
    bayGlowMat.opacity = hatchAmt * (bayOn ? 0.68 : 0.38);

    for (const id of ['video', 'sync'] as CameraPortId[]) {
      portHover[id] = THREE.MathUtils.damp(portHover[id], hoveredPort === id ? 1 : 0, 16, dt);
      const mats = portMats[id];
      mats.collar.emissiveIntensity = portHover[id] * 0.9 + (portConnected[id] ? 0.22 : 0.02);
      const ledTarget = portConnected[id] ? 1.7 : 0.05 + portHover[id] * 0.5;
      mats.led.emissiveIntensity = THREE.MathUtils.damp(mats.led.emissiveIntensity, ledTarget, 9, dt);
    }

    /* кабель в камере — только свечение объектива */
    const projecting = state.power && portConnected.video;
    projectAmt = THREE.MathUtils.damp(projectAmt, projecting ? 1 : 0, projecting ? 3 : 6, dt);

    const glowPulse = 0.82 + Math.sin(time * 26) * 0.18;
    lensGlowMat.opacity = THREE.MathUtils.damp(lensGlowMat.opacity, projectAmt * glowPulse, 10, dt);
    lensLight.intensity = projectAmt * glowPulse * 2.1;

    amber.emissiveIntensity = THREE.MathUtils.damp(amber.emissiveIntensity, state.power ? 1.35 : 0.05, 8, dt);
    greenLed.emissiveIntensity = THREE.MathUtils.damp(greenLed.emissiveIntensity, state.power ? 1.5 : 0.03, 8, dt);

    const glassTarget = !state.power
      ? 0.008
      : projectAmt > 0.02
        ? 0.4 + Math.sin(time * 23) * 0.1
        : 0.07 + Math.sin(time * 1.7) * 0.012;
    glass.emissiveIntensity = THREE.MathUtils.damp(glass.emissiveIntensity, glassTarget, 7, dt);

    const blink = Math.sin(time * 7.4) > -0.25;
    const recording = state.power && state.rec;
    recLamp.emissive.setHex(recording ? 0xff3b2f : 0x63ffa0);
    recLamp.emissiveIntensity = recording
      ? (blink ? 2.1 : 0.12)
      : projecting
        ? 0.62 + Math.sin(time * 3.2) * 0.28
        : 0.04;
  };

  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  optic.castShadow = false;
  powerLed.castShadow = false;
  tallyLamp.castShadow = false;
  amberLamp.castShadow = false;

  return {
    root,
    interactive,
    state,
    setHover,
    press,
    update,
    portWorld,
    setPortConnected,
    setPortHover,
    openHatch,
    isPortConnected,
    glowAmount,
    spin,
    setInspect,
  };
}

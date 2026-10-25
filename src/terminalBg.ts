import * as THREE from 'three';

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#040b07';
  ctx.fillRect(0, 0, w, h);

  // техническая графика по углам
  ctx.strokeStyle = 'rgba(99, 255, 160, 0.13)';
  ctx.lineWidth = 1.5;

  const bracket = (x: number, y: number, sx: number, sy: number, size: number): void => {
    ctx.beginPath();
    ctx.moveTo(x, y + sy * size);
    ctx.lineTo(x, y);
    ctx.lineTo(x + sx * size, y);
    ctx.stroke();
  };
  bracket(70, 70, 1, 1, 120);
  bracket(w - 70, 70, -1, 1, 120);
  bracket(70, h - 70, 1, -1, 120);
  bracket(w - 70, h - 70, -1, -1, 120);

  ctx.beginPath();
  ctx.arc(250, h - 250, 96, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(250, h - 250, 62, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(99, 255, 160, 0.08)';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(250, h - 380);
  ctx.lineTo(250, h - 120);
  ctx.moveTo(120, h - 250);
  ctx.lineTo(380, h - 250);
  ctx.strokeStyle = 'rgba(99, 255, 160, 0.07)';
  ctx.stroke();

  ctx.strokeStyle = 'rgba(226, 168, 60, 0.16)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 7; i++) {
    const r = 20 + i * 12;
    ctx.beginPath();
    ctx.arc(w - 240, 240, r, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(99, 255, 160, 0.16)';
  ctx.beginPath();
  let px = w - 620;
  let py = h - 150;
  ctx.moveTo(px, py);
  for (let i = 0; i < 90; i++) {
    px += 5.5;
    py = h - 150 + Math.sin(i * 0.45) * (i % 3 === 0 ? 26 : 12) * Math.random();
    ctx.lineTo(px, py);
  }
  ctx.stroke();

  ctx.fillStyle = 'rgba(226, 168, 60, 0.3)';
  for (let i = 0; i < 46; i++) {
    ctx.fillRect(96 + i * 7, h - 46, 3, 3);
  }
}

export function createTerminalBackdrop(): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1152;
  const ctx = canvas.getContext('2d')!;
  drawBackground(ctx, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(27.5, 15.5), material);
  mesh.position.set(0, 0.4, -8);
  mesh.renderOrder = -2;
  mesh.name = 'terminal-backdrop';
  return mesh;
}

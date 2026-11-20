import * as THREE from 'three';
import type { WeatherCondition } from '../sim/types';

/**
 * Builds a dynamic procedural HDR-equivalent lighting environment scene and compiles
 * a prefiltered radiance environment map (PMREM) tailored for dry São Paulo daylight
 * or overcast rainy racing conditions — zero external .hdr files, zero white haze.
 */
export function createProceduralHdri(
  renderer: THREE.WebGLRenderer,
  weather: WeatherCondition,
): THREE.WebGLRenderTarget {
  const envScene = new THREE.Scene();
  const disposables: Array<{ dispose: () => void }> = [];

  const isWet = weather === 'wet';

  // 1. Equirectangular procedural sky dome canvas with high-contrast horizon, soft clouds & sun disc
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
  if (isWet) {
    skyGrad.addColorStop(0.0, '#1e293b');
    skyGrad.addColorStop(0.32, '#475569');
    skyGrad.addColorStop(0.49, '#94a3b8');
    skyGrad.addColorStop(0.51, '#334155');
    skyGrad.addColorStop(1.0, '#0f172a');
  } else {
    skyGrad.addColorStop(0.0, '#0c4a6e');
    skyGrad.addColorStop(0.28, '#2563eb');
    skyGrad.addColorStop(0.47, '#bae6fd');
    skyGrad.addColorStop(0.50, '#475569');
    skyGrad.addColorStop(0.68, '#1e293b');
    skyGrad.addColorStop(1.0, '#0f172a');
  }
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h);

  // Soft atmospheric cloud streaks in upper hemisphere for rich car-paint & puddle reflections
  for (let i = 0; i < 24; i++) {
    const cx = ((i * 83 + 29) % w);
    const cy = 22 + ((i * 37) % 88);
    const rx = 38 + (i % 5) * 22;
    const ry = 7 + (i % 3) * 5;
    const cg = ctx.createRadialGradient(cx, cy, 2, cx, cy, rx);
    if (isWet) {
      cg.addColorStop(0, 'rgba(226, 232, 240, 0.42)');
      cg.addColorStop(1, 'rgba(148, 163, 184, 0)');
    } else {
      cg.addColorStop(0, 'rgba(255, 255, 255, 0.52)');
      cg.addColorStop(1, 'rgba(255, 255, 255, 0)');
    }
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Intense solar highlight spot for realistic specular crispness on clearcoat & wet puddles
  const sunX = w * 0.28;
  const sunY = isWet ? h * 0.34 : h * 0.24;
  const sunRad = isWet ? 56 : 36;
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, sunRad);
  if (isWet) {
    sunGrad.addColorStop(0, 'rgba(241, 245, 249, 0.95)');
    sunGrad.addColorStop(0.35, 'rgba(203, 213, 225, 0.45)');
    sunGrad.addColorStop(1, 'rgba(148, 163, 184, 0)');
  } else {
    sunGrad.addColorStop(0, 'rgba(255, 252, 235, 1.0)');
    sunGrad.addColorStop(0.28, 'rgba(255, 236, 179, 0.72)');
    sunGrad.addColorStop(1, 'rgba(255, 224, 150, 0)');
  }
  ctx.fillStyle = sunGrad;
  ctx.fillRect(sunX - sunRad, sunY - sunRad, sunRad * 2, sunRad * 2);

  const skyTex = new THREE.CanvasTexture(canvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  skyTex.mapping = THREE.EquirectangularReflectionMapping;
  disposables.push(skyTex);

  const domeGeo = new THREE.SphereGeometry(28, 32, 16);
  const domeMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide });
  disposables.push(domeGeo, domeMat);
  envScene.add(new THREE.Mesh(domeGeo, domeMat));

  // Emissive sun & trackside floodlight panels inside envScene so PMREM captures HDR energy (> 1.0)
  const panelGeo = new THREE.PlaneGeometry(8, 2.2);
  const sunPanelMat = new THREE.MeshBasicMaterial({
    color: isWet ? new THREE.Color(2.2, 2.4, 2.7) : new THREE.Color(4.5, 4.1, 3.3),
    side: THREE.DoubleSide,
  });
  const rimPanelMat = new THREE.MeshBasicMaterial({
    color: isWet ? new THREE.Color(1.4, 1.7, 2.1) : new THREE.Color(1.8, 2.2, 2.8),
    side: THREE.DoubleSide,
  });
  disposables.push(panelGeo, sunPanelMat, rimPanelMat);

  const sunPanel = new THREE.Mesh(panelGeo, sunPanelMat);
  sunPanel.position.set(12, isWet ? 10 : 14, 10);
  sunPanel.lookAt(0, 0, 0);
  envScene.add(sunPanel);

  const rimPanel = new THREE.Mesh(panelGeo, rimPanelMat);
  rimPanel.position.set(-14, 7, -12);
  rimPanel.lookAt(0, 0, 0);
  envScene.add(rimPanel);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const target = pmrem.fromScene(envScene, 0.025);
  pmrem.dispose();

  for (const d of disposables) {
    d.dispose();
  }

  return target;
}

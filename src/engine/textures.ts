import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

import type { KerbPaletteStyle } from '../sim/track';

export interface ProceduralTextures {
  asphaltMap: THREE.CanvasTexture;
  asphaltNormalMap: THREE.DataTexture;
  asphaltBump: THREE.CanvasTexture;
  asphaltRoughnessMap: THREE.DataTexture;
  asphaltAoMap: THREE.DataTexture;
  carbonMap: THREE.CanvasTexture;
  carbonNormalMap: THREE.DataTexture;
  carbonRoughnessMap: THREE.DataTexture;
  kerbMap: THREE.CanvasTexture;
  kerbNormalMap: THREE.DataTexture;
  kerbRoughnessMap: THREE.DataTexture;
  getKerbTexture: (style: KerbPaletteStyle) => THREE.CanvasTexture;
  grassMap: THREE.CanvasTexture;
  grassNormalMap: THREE.DataTexture;
  tireDryMap: THREE.CanvasTexture;
  tireWetMap: THREE.CanvasTexture;
  tireDryNormalMap: THREE.DataTexture;
  tireWetNormalMap: THREE.DataTexture;
  tireSidewallDryMap: THREE.CanvasTexture;
  tireSidewallWetMap: THREE.CanvasTexture;
  tireSidewallBlurMap: THREE.CanvasTexture;
  gridLineMap: THREE.CanvasTexture;
  gantryBannerMap: THREE.CanvasTexture;
  getGantryBannerTexture: (text: string, style: KerbPaletteStyle) => THREE.CanvasTexture;
  brake100Map: THREE.CanvasTexture;
  brake50Map: THREE.CanvasTexture;
  drsBoardMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  particleMap: THREE.CanvasTexture;
  createCarNumberTexture: (carNumber: number, primaryColor: string, accentColor: string) => THREE.CanvasTexture;
  dispose: () => void;
}

function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Tileable 2D FBM noise in [0, 1] using cross-faded wrapped coordinates
 * so repeating road/grass/carbon maps have zero seams.
 */
function sampleTileableFbm(
  noise2D: (x: number, y: number) => number,
  u: number,
  v: number,
  freq: number,
  octaves = 3,
): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = freq;

  for (let o = 0; o < octaves; o++) {
    const x1 = u * f;
    const y1 = v * f;
    const x2 = (u - 1) * f;
    const y2 = (v - 1) * f;

    const n00 = noise2D(x1, y1);
    const n10 = noise2D(x2, y1);
    const n01 = noise2D(x1, y2);
    const n11 = noise2D(x2, y2);

    const wu = u * u * (3 - 2 * u);
    const wv = v * v * (3 - 2 * v);
    const nx0 = n00 * (1 - wu) + n10 * wu;
    const nx1 = n01 * (1 - wu) + n11 * wu;
    const val = nx0 * (1 - wv) + nx1 * wv;

    sum += (val * 0.5 + 0.5) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.0;
  }
  return sum / norm;
}

/**
 * Converts a scalar [0, 1] height buffer into a linear tangent-space Normal DataTexture.
 */
function heightBufferToNormalTexture(
  heights: Float32Array,
  size: number,
  strength: number,
  aniso: number,
  wrapS: THREE.Wrapping = THREE.RepeatWrapping,
  wrapT: THREE.Wrapping = THREE.RepeatWrapping,
): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;

      const hL = heights[y * size + xm];
      const hR = heights[y * size + xp];
      const hU = heights[ym * size + x];
      const hD = heights[yp * size + x];

      const dx = (hL - hR) * strength;
      const dy = (hU - hD) * strength;
      const dz = 1.0;
      const invLen = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);

      const idx = (y * size + x) * 4;
      data[idx] = Math.round((dx * invLen * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((dy * invLen * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((dz * invLen * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = wrapS;
  tex.wrapT = wrapT;
  tex.anisotropy = aniso;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function makeDistanceBoard(label: string, bg: string, fg: string, aniso: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 160);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, 240, 144);
  ctx.fillStyle = fg;
  ctx.font = 'bold 92px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, 84);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  return tex;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextures {
  const aniso = Math.min(8, Math.max(1, maxAnisotropy));
  const rand = createRng(19901104);
  const noiseAsp = createNoise2D(createRng(4041991));
  const noiseGrass = createNoise2D(createRng(7712026));
  const noiseKerb = createNoise2D(createRng(8821993));
  const extraDisposables: THREE.Texture[] = [];

  // 1. High-Definition 1024px Racing Asphalt + Mineral Aggregate Normal/Roughness/AO Maps
  const aspSize = 1024;
  const aspCanvas = document.createElement('canvas');
  aspCanvas.width = aspSize;
  aspCanvas.height = aspSize;
  const actx = aspCanvas.getContext('2d')!;
  const aspImg = actx.createImageData(aspSize, aspSize);
  const aspPixels = aspImg.data;

  // Compute physical 512px data grid for Normal / Roughness / AO (sharply mipmapped, fast init)
  const pbrSize = 512;
  const aspHeights = new Float32Array(pbrSize * pbrSize);
  const roughBytes = new Uint8Array(pbrSize * pbrSize * 4);
  const aoBytes = new Uint8Array(pbrSize * pbrSize * 4);

  for (let y = 0; y < pbrSize; y++) {
    const v = y / pbrSize;
    for (let x = 0; x < pbrSize; x++) {
      const u = x / pbrSize;
      const macro = sampleTileableFbm(noiseAsp, u, v, 6, 3);
      const micro = sampleTileableFbm(noiseAsp, u + 0.37, v + 0.19, 34, 2);
      const grain = rand();

      // Racing rubber groove concentration around center [0.22..0.78]
      const centerDist = Math.abs(u - 0.5) * 2.0; // 0 center .. 1 edge
      const rubberFactor = Math.max(0, 1 - Math.pow(centerDist / 0.82, 2.2));
      const hVal = macro * 0.38 + micro * 0.44 + grain * 0.18;
      aspHeights[y * pbrSize + x] = hVal;

      const idx = (y * pbrSize + x) * 4;
      // Roughness: smoother (0.48) on rubbered line, rougher (0.92) near shoulders
      const roughNorm = Math.max(0.42, Math.min(0.95, 0.88 - rubberFactor * 0.32 + (micro - 0.5) * 0.18));
      const rByte = Math.round(roughNorm * 255);
      roughBytes[idx] = rByte;
      roughBytes[idx + 1] = rByte;
      roughBytes[idx + 2] = rByte;
      roughBytes[idx + 3] = 255;

      // AO: darker in fine aggregate pits & drainage boundary near white lines
      const aoVal = Math.max(0.65, Math.min(1.0, 0.78 + hVal * 0.24 - (centerDist > 0.92 ? 0.08 : 0)));
      const aoByte = Math.round(aoVal * 255);
      aoBytes[idx] = aoByte;
      aoBytes[idx + 1] = aoByte;
      aoBytes[idx + 2] = aoByte;
      aoBytes[idx + 3] = 255;
    }
  }

  for (let y = 0; y < aspSize; y++) {
    const v = y / aspSize;
    const py = Math.min(pbrSize - 1, y >> 1);
    for (let x = 0; x < aspSize; x++) {
      const u = x / aspSize;
      const px = Math.min(pbrSize - 1, x >> 1);
      const baseH = aspHeights[py * pbrSize + px];
      const speckle = rand();
      const centerDist = Math.abs(u - 0.5) * 2.0;
      const rubberGroove = Math.max(0, 1 - Math.pow(centerDist / 0.78, 2.0));

      // Basalt/granite mineral aggregate variation + subtle darker rubbered racing path
      const lum = 38 + baseH * 28 + (speckle > 0.88 ? 14 : speckle < 0.14 ? -9 : 0) - rubberGroove * 16;
      const warmTint = speckle > 0.72 ? 2 : 0;
      const idx = (y * aspSize + x) * 4;
      aspPixels[idx] = Math.max(12, Math.min(92, Math.round(lum + warmTint)));
      aspPixels[idx + 1] = Math.max(13, Math.min(94, Math.round(lum + 1)));
      aspPixels[idx + 2] = Math.max(15, Math.min(98, Math.round(lum + 4)));
      aspPixels[idx + 3] = 255;
    }
  }
  actx.putImageData(aspImg, 0, 0);

  // Longitudinal tire track striations + outer track rubber marbles
  for (let i = 0; i < 84; i++) {
    const lx = 175 + rand() * 674;
    const w = 1.5 + rand() * 4.5;
    actx.fillStyle = `rgba(9,11,14,${(0.05 + rand() * 0.09).toFixed(3)})`;
    actx.fillRect(lx, 0, w, aspSize);
  }
  for (let i = 0; i < 720; i++) {
    const side = rand() < 0.5 ? 46 + rand() * 116 : 860 + rand() * 116;
    const my = rand() * aspSize;
    actx.fillStyle = 'rgba(10,11,14,0.34)';
    actx.fillRect(side, my, 2 + rand() * 2, 3 + rand() * 4);
  }

  // Crisp FIA white track boundary lines with slight weathered edge
  actx.fillStyle = '#e8edf3';
  actx.fillRect(18, 0, 15, aspSize);
  actx.fillRect(aspSize - 33, 0, 15, aspSize);

  const asphaltMap = new THREE.CanvasTexture(aspCanvas);
  asphaltMap.colorSpace = THREE.SRGBColorSpace;
  asphaltMap.wrapS = THREE.ClampToEdgeWrapping;
  asphaltMap.wrapT = THREE.RepeatWrapping;
  asphaltMap.anisotropy = aniso;

  const asphaltNormalMap = heightBufferToNormalTexture(
    aspHeights,
    pbrSize,
    2.6,
    aniso,
    THREE.ClampToEdgeWrapping,
    THREE.RepeatWrapping,
  );

  const asphaltRoughnessMap = new THREE.DataTexture(roughBytes, pbrSize, pbrSize, THREE.RGBAFormat);
  asphaltRoughnessMap.wrapS = THREE.ClampToEdgeWrapping;
  asphaltRoughnessMap.wrapT = THREE.RepeatWrapping;
  asphaltRoughnessMap.anisotropy = aniso;
  asphaltRoughnessMap.generateMipmaps = true;
  asphaltRoughnessMap.minFilter = THREE.LinearMipmapLinearFilter;
  asphaltRoughnessMap.magFilter = THREE.LinearFilter;
  asphaltRoughnessMap.needsUpdate = true;

  const asphaltAoMap = new THREE.DataTexture(aoBytes, pbrSize, pbrSize, THREE.RGBAFormat);
  asphaltAoMap.wrapS = THREE.ClampToEdgeWrapping;
  asphaltAoMap.wrapT = THREE.RepeatWrapping;
  asphaltAoMap.anisotropy = aniso;
  asphaltAoMap.generateMipmaps = true;
  asphaltAoMap.minFilter = THREE.LinearMipmapLinearFilter;
  asphaltAoMap.magFilter = THREE.LinearFilter;
  asphaltAoMap.needsUpdate = true;

  // Retained compact bump canvas for compatibility
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 256;
  bumpCanvas.height = 256;
  const bctx = bumpCanvas.getContext('2d')!;
  const bImg = bctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const h = aspHeights[(y * 2) * pbrSize + (x * 2)];
      const v = Math.round(h * 255);
      const i = (y * 256 + x) * 4;
      bImg.data[i] = v;
      bImg.data[i + 1] = v;
      bImg.data[i + 2] = v;
      bImg.data[i + 3] = 255;
    }
  }
  bctx.putImageData(bImg, 0, 0);
  const asphaltBump = new THREE.CanvasTexture(bumpCanvas);
  asphaltBump.wrapS = THREE.RepeatWrapping;
  asphaltBump.wrapT = THREE.RepeatWrapping;
  asphaltBump.anisotropy = aniso;

  // 2. High-Detail 256px 2x2 Twill Carbon Fiber + Normal + Anisotropic Roughness
  const carbSize = 256;
  const carbCanvas = document.createElement('canvas');
  carbCanvas.width = carbSize;
  carbCanvas.height = carbSize;
  const cctx = carbCanvas.getContext('2d')!;
  const cImg = cctx.createImageData(carbSize, carbSize);
  const carbHeights = new Float32Array(carbSize * carbSize);
  const carbRough = new Uint8Array(carbSize * carbSize * 4);

  for (let y = 0; y < carbSize; y++) {
    for (let x = 0; x < carbSize; x++) {
      // 2x2 diagonal twill weave period = 16px
      const tx = Math.floor(x / 4);
      const ty = Math.floor(y / 4);
      const phase = (tx + ty) % 4;
      const isWarp = phase < 2;
      const fx = (x % 4) / 4;
      const fy = (y % 4) / 4;
      const strandCurve = isWarp
        ? Math.sin(fy * Math.PI) * 0.85 + Math.sin(fx * Math.PI) * 0.15
        : Math.sin(fx * Math.PI) * 0.85 + Math.sin(fy * Math.PI) * 0.15;

      carbHeights[y * carbSize + x] = strandCurve;
      const baseShade = isWarp ? 28 + strandCurve * 24 : 18 + strandCurve * 16;
      const idx = (y * carbSize + x) * 4;
      cImg.data[idx] = Math.round(baseShade);
      cImg.data[idx + 1] = Math.round(baseShade + 2);
      cImg.data[idx + 2] = Math.round(baseShade + 6);
      cImg.data[idx + 3] = 255;

      // Clear-resin matrix vs woven sheen alternation
      const roughVal = Math.round((isWarp ? 0.34 + (1 - strandCurve) * 0.2 : 0.48 + (1 - strandCurve) * 0.22) * 255);
      carbRough[idx] = roughVal;
      carbRough[idx + 1] = roughVal;
      carbRough[idx + 2] = roughVal;
      carbRough[idx + 3] = 255;
    }
  }
  cctx.putImageData(cImg, 0, 0);

  const carbonMap = new THREE.CanvasTexture(carbCanvas);
  carbonMap.colorSpace = THREE.SRGBColorSpace;
  carbonMap.wrapS = THREE.RepeatWrapping;
  carbonMap.wrapT = THREE.RepeatWrapping;
  carbonMap.repeat.set(5, 5);
  carbonMap.anisotropy = aniso;

  const carbonNormalMap = heightBufferToNormalTexture(carbHeights, carbSize, 3.2, aniso);
  carbonNormalMap.repeat.set(5, 5);

  const carbonRoughnessMap = new THREE.DataTexture(carbRough, carbSize, carbSize, THREE.RGBAFormat);
  carbonRoughnessMap.wrapS = THREE.RepeatWrapping;
  carbonRoughnessMap.wrapT = THREE.RepeatWrapping;
  carbonRoughnessMap.repeat.set(5, 5);
  carbonRoughnessMap.anisotropy = aniso;
  carbonRoughnessMap.generateMipmaps = true;
  carbonRoughnessMap.minFilter = THREE.LinearMipmapLinearFilter;
  carbonRoughnessMap.needsUpdate = true;

  // 3. Circuit-Specific HD Painted Kerbs (256x1024) + Serrated 3D Kerb Normal & Roughness
  const buildKerbTexture = (colors: [string, string, string]): THREE.CanvasTexture => {
    const kerbCanvas = document.createElement('canvas');
    kerbCanvas.width = 256;
    kerbCanvas.height = 1024;
    const kctx = kerbCanvas.getContext('2d')!;
    const stripeH = 128;
    for (let y = 0; y < 1024; y += stripeH) {
      kctx.fillStyle = colors[(y / stripeH) % colors.length];
      kctx.fillRect(0, y, 256, stripeH);
      // Concrete mortar shadow + subtle wear
      kctx.fillStyle = 'rgba(0,0,0,0.22)';
      kctx.fillRect(0, y, 256, 6);
    }
    // Tire scuff rubber streaks along kerb edge
    for (let i = 0; i < 120; i++) {
      kctx.fillStyle = `rgba(12,14,18,${(0.08 + rand() * 0.22).toFixed(2)})`;
      kctx.fillRect(28 + rand() * 145, rand() * 1024, 5 + rand() * 9, 24 + rand() * 44);
    }
    const tex = new THREE.CanvasTexture(kerbCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = aniso;
    extraDisposables.push(tex);
    return tex;
  };

  const kerbMap = buildKerbTexture(['#15803d', '#facc15', '#f8fafc']);
  const kerbCache: Partial<Record<KerbPaletteStyle, THREE.CanvasTexture>> = {
    brazil: kerbMap,
  };
  const getKerbTexture = (style: KerbPaletteStyle): THREE.CanvasTexture => {
    if (kerbCache[style]) return kerbCache[style]!;
    const palette: [string, string, string] =
      style === 'italy'
        ? ['#dc2626', '#f8fafc', '#15803d']
        : style === 'belgium'
        ? ['#dc2626', '#facc15', '#18181b']
        : ['#15803d', '#facc15', '#f8fafc'];
    const tex = buildKerbTexture(palette);
    kerbCache[style] = tex;
    return tex;
  };

  // Serrated FIA kerb ridge normal/roughness (256x256 repeating along V)
  const kPbrSize = 256;
  const kHeights = new Float32Array(kPbrSize * kPbrSize);
  const kRough = new Uint8Array(kPbrSize * kPbrSize * 4);
  for (let y = 0; y < kPbrSize; y++) {
    const v = y / kPbrSize;
    // 8 serrated rumble ridges per tile
    const ridgePhase = (v * 8) % 1;
    const saw = ridgePhase < 0.72 ? ridgePhase / 0.72 : (1 - ridgePhase) / 0.28;
    for (let x = 0; x < kPbrSize; x++) {
      const u = x / kPbrSize;
      const grit = sampleTileableFbm(noiseKerb, u, v, 14, 2);
      const ridgeH = saw * (u > 0.14 ? 0.75 : 0.25) + grit * 0.25;
      kHeights[y * kPbrSize + x] = ridgeH;
      const rVal = Math.round((0.52 + (1 - saw) * 0.24 + grit * 0.14) * 255);
      const idx = (y * kPbrSize + x) * 4;
      kRough[idx] = rVal;
      kRough[idx + 1] = rVal;
      kRough[idx + 2] = rVal;
      kRough[idx + 3] = 255;
    }
  }
  const kerbNormalMap = heightBufferToNormalTexture(
    kHeights,
    kPbrSize,
    4.2,
    aniso,
    THREE.ClampToEdgeWrapping,
    THREE.RepeatWrapping,
  );
  const kerbRoughnessMap = new THREE.DataTexture(kRough, kPbrSize, kPbrSize, THREE.RGBAFormat);
  kerbRoughnessMap.wrapS = THREE.ClampToEdgeWrapping;
  kerbRoughnessMap.wrapT = THREE.RepeatWrapping;
  kerbRoughnessMap.anisotropy = aniso;
  kerbRoughnessMap.generateMipmaps = true;
  kerbRoughnessMap.minFilter = THREE.LinearMipmapLinearFilter;
  kerbRoughnessMap.needsUpdate = true;

  // 4. Natural São Paulo Grass & Soil Terrain (512x512 seamless FBM + Normal)
  const grassSize = 512;
  const grassCanvas = document.createElement('canvas');
  grassCanvas.width = grassSize;
  grassCanvas.height = grassSize;
  const gctx = grassCanvas.getContext('2d')!;
  const gImg = gctx.createImageData(grassSize, grassSize);
  const grassHeights = new Float32Array(grassSize * grassSize);

  for (let y = 0; y < grassSize; y++) {
    const v = y / grassSize;
    for (let x = 0; x < grassSize; x++) {
      const u = x / grassSize;
      const macro = sampleTileableFbm(noiseGrass, u, v, 5, 3);
      const blade = sampleTileableFbm(noiseGrass, u + 0.53, v + 0.21, 36, 2);
      const h = macro * 0.45 + blade * 0.55;
      grassHeights[y * grassSize + x] = h;

      const idx = (y * grassSize + x) * 4;
      const green = 62 + h * 58 + (rand() - 0.5) * 14;
      gImg.data[idx] = Math.max(24, Math.min(110, Math.round(green * 0.58 + (1 - macro) * 16)));
      gImg.data[idx + 1] = Math.max(42, Math.min(148, Math.round(green)));
      gImg.data[idx + 2] = Math.max(22, Math.min(86, Math.round(green * 0.42)));
      gImg.data[idx + 3] = 255;
    }
  }
  gctx.putImageData(gImg, 0, 0);

  // Fine straw and blades over the tileable soil/grass base, baked once.
  gctx.lineWidth = .55;
  for (let i=0;i<10000;i++) {
    const x=rand()*grassSize, y=rand()*grassSize, len=1.5+rand()*7;
    gctx.strokeStyle = i%5===0?'rgba(151,134,67,0.35)':'rgba(82,116,49,0.34)';
    gctx.beginPath();gctx.moveTo(x,y);gctx.quadraticCurveTo(x+1,y-len*.55,x+(rand()-.5)*4,y-len);gctx.stroke();
  }
  const grassMap = new THREE.CanvasTexture(grassCanvas);
  grassMap.colorSpace = THREE.SRGBColorSpace;
  grassMap.wrapS = THREE.RepeatWrapping;
  grassMap.wrapT = THREE.RepeatWrapping;
  grassMap.repeat.set(1, 1);
  grassMap.anisotropy = aniso;

  const grassNormalMap = heightBufferToNormalTexture(grassHeights, grassSize, 2.2, aniso);
  grassNormalMap.repeat.set(1, 1);

  // 5. Pirelli Slick (Dry) & Grooved Intermediate/Wet Tire Treads + Normals
  const buildTireMaps = (wet: boolean): { map: THREE.CanvasTexture; normalMap: THREE.DataTexture } => {
    const tSize = 256;
    const tc = document.createElement('canvas');
    tc.width = tSize;
    tc.height = tSize;
    const tctx = tc.getContext('2d')!;
    const tImg = tctx.createImageData(tSize, tSize);
    const heights = new Float32Array(tSize * tSize);

    for (let y = 0; y < tSize; y++) {
      const v = y / tSize;
      for (let x = 0; x < tSize; x++) {
        const u = x / tSize; // across tire tread width
        let h = 0.85 + (rand() - 0.5) * 0.12;
        if (wet) {
          // 3 longitudinal drainage channels + directional chevron water sipes
          const latChannel =
            Math.abs(u - 0.3) < 0.032 || Math.abs(u - 0.5) < 0.036 || Math.abs(u - 0.7) < 0.032;
          const distFromCenter = Math.abs(u - 0.5);
          const chevron = ((v * 14 - distFromCenter * 3.8 + 10) % 1);
          const sipe = distFromCenter > 0.14 && distFromCenter < 0.88 && chevron < 0.18;
          if (latChannel || sipe) {
            h = 0.15;
          }
        } else {
          // Subtle longitudinal rubber grain & center mold seam
          h -= Math.abs(Math.sin(u * Math.PI * 18)) * 0.06;
        }
        heights[y * tSize + x] = h;
        const shade = Math.round(14 + h * 18);
        const idx = (y * tSize + x) * 4;
        tImg.data[idx] = shade;
        tImg.data[idx + 1] = shade;
        tImg.data[idx + 2] = shade + 2;
        tImg.data[idx + 3] = 255;
      }
    }
    tctx.putImageData(tImg, 0, 0);
    const map = new THREE.CanvasTexture(tc);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = THREE.ClampToEdgeWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = aniso;

    const normalMap = heightBufferToNormalTexture(
      heights,
      tSize,
      wet ? 4.8 : 1.4,
      aniso,
      THREE.ClampToEdgeWrapping,
      THREE.RepeatWrapping,
    );
    return { map, normalMap };
  };

  const dryTire = buildTireMaps(false);
  const wetTire = buildTireMaps(true);

  const buildTireSidewallMap = (wet: boolean): THREE.CanvasTexture => {
    const sSize = 256;
    const sc = document.createElement('canvas');
    sc.width = sSize;
    sc.height = sSize;
    const sctx = sc.getContext('2d')!;
    const cx = sSize / 2;
    const cy = sSize / 2;

    // Dark matte molded rubber sidewall background
    sctx.fillStyle = '#14171d';
    sctx.fillRect(0, 0, sSize, sSize);

    // Subtle concentric molded rubber rings & sidewall ribbing
    for (let r = 84; r <= 124; r += 4) {
      sctx.strokeStyle = r % 8 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.35)';
      sctx.lineWidth = 1.4;
      sctx.beginPath();
      sctx.arc(cx, cy, r, 0, Math.PI * 2);
      sctx.stroke();
    }

    // Compound color stripe arcs (top & bottom Pirelli style)
    const accentColor = wet ? '#38bdf8' : '#ef4444';
    sctx.strokeStyle = accentColor;
    sctx.lineWidth = 6.5;
    sctx.lineCap = 'round';
    sctx.beginPath();
    sctx.arc(cx, cy, 94, -Math.PI * 0.34, Math.PI * 0.34);
    sctx.stroke();
    sctx.beginPath();
    sctx.arc(cx, cy, 94, Math.PI * 0.66, Math.PI * 1.34);
    sctx.stroke();

    // Crisp brand & compound text along top & bottom arcs
    sctx.fillStyle = '#f8fafc';
    sctx.font = 'bold 14px Inter, Arial, sans-serif';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.save();
    sctx.translate(cx, cy - 107);
    sctx.fillText(wet ? 'CINTURATO' : 'P ZERO', 0, 0);
    sctx.restore();

    sctx.save();
    sctx.translate(cx, cy + 107);
    sctx.rotate(Math.PI);
    sctx.fillText(wet ? 'WET F1' : 'SOFT F1', 0, 0);
    sctx.restore();

    const tex = new THREE.CanvasTexture(sc);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = aniso;
    return tex;
  };

  const tireSidewallDryMap = buildTireSidewallMap(false);
  const tireSidewallWetMap = buildTireSidewallMap(true);

  // Radial motion-blurred tire sidewall & rim-spoke streak disc for high-speed rotation (>26 rad/s)
  const buildTireSidewallBlurMap = (): THREE.CanvasTexture => {
    const sSize = 256;
    const sc = document.createElement('canvas');
    sc.width = sSize;
    sc.height = sSize;
    const sctx = sc.getContext('2d')!;
    const cx = sSize / 2;
    const cy = sSize / 2;

    sctx.clearRect(0, 0, sSize, sSize);

    // Soft radial translucent rubber streak over molded shoulder + smeared compound arc
    const grad = sctx.createRadialGradient(cx, cy, 42, cx, cy, 126);
    grad.addColorStop(0.0, 'rgba(20, 23, 29, 0.0)');
    grad.addColorStop(0.32, 'rgba(28, 32, 42, 0.58)');
    grad.addColorStop(0.62, 'rgba(20, 23, 29, 0.88)');
    grad.addColorStop(0.84, 'rgba(235, 240, 248, 0.24)');
    grad.addColorStop(1.0, 'rgba(18, 20, 26, 0.0)');
    sctx.fillStyle = grad;
    sctx.beginPath();
    sctx.arc(cx, cy, 126, 0, Math.PI * 2);
    sctx.fill();

    // Motion-smeared red compound ring & subtle titanium spoke sweep blur
    sctx.strokeStyle = 'rgba(239, 68, 68, 0.52)';
    sctx.lineWidth = 6;
    sctx.beginPath();
    sctx.arc(cx, cy, 95, 0, Math.PI * 2);
    sctx.stroke();

    sctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    sctx.lineWidth = 18;
    sctx.beginPath();
    sctx.arc(cx, cy, 62, 0, Math.PI * 2);
    sctx.stroke();

    const tex = new THREE.CanvasTexture(sc);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = aniso;
    return tex;
  };
  const tireSidewallBlurMap = buildTireSidewallBlurMap();

  // 6. Start/Finish Checkered Strip
  const gridCanvas = document.createElement('canvas');
  gridCanvas.width = 512;
  gridCanvas.height = 128;
  const fctx = gridCanvas.getContext('2d')!;
  const cell = 32;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 16; c++) {
      fctx.fillStyle = (r + c) % 2 === 0 ? '#f8fafc' : '#111827';
      fctx.fillRect(c * cell, r * cell, cell, cell);
    }
  }
  const gridLineMap = new THREE.CanvasTexture(gridCanvas);
  gridLineMap.colorSpace = THREE.SRGBColorSpace;
  gridLineMap.anisotropy = aniso;

  // 8. FIA Start/Finish Gantry Banner
  const bannerCache = new Map<string, THREE.CanvasTexture>();
  const buildGantryBanner = (text: string, style: KerbPaletteStyle): THREE.CanvasTexture => {
    const key = `${style}:${text}`;
    const existing = bannerCache.get(key);
    if (existing) return existing;
    const banCanvas = document.createElement('canvas');
    banCanvas.width = 1024;
    banCanvas.height = 128;
    const bnctx = banCanvas.getContext('2d')!;
    const bgHex = style === 'italy' ? '#7f1d1d' : style === 'belgium' ? '#1e293b' : '#064e3b';
    const stripeHex = style === 'italy' ? '#16a34a' : style === 'belgium' ? '#eab308' : '#facc15';
    bnctx.fillStyle = bgHex;
    bnctx.fillRect(0, 0, 1024, 128);
    bnctx.fillStyle = stripeHex;
    bnctx.fillRect(0, 0, 1024, 14);
    bnctx.fillRect(0, 114, 1024, 14);
    bnctx.fillStyle = '#f8fafc';
    bnctx.font = 'bold 50px Inter, Arial, sans-serif';
    bnctx.textAlign = 'center';
    bnctx.textBaseline = 'middle';
    bnctx.fillText(text, 512, 66);
    const tex = new THREE.CanvasTexture(banCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = aniso;
    extraDisposables.push(tex);
    bannerCache.set(key, tex);
    return tex;
  };
  const gantryBannerMap = buildGantryBanner('GP SÃO PAULO  ·  INTERLAGOS', 'brazil');

  // 9. Distance & DRS Trackside Boards
  const brake100Map = makeDistanceBoard('100', '#dc2626', '#ffffff', aniso);
  const brake50Map = makeDistanceBoard('50', '#dc2626', '#ffffff', aniso);
  const drsBoardMap = makeDistanceBoard('DRS', '#059669', '#ecfdf5', aniso);

  // 10. Soft Radial Contact Shadow Disc
  const shadCanvas = document.createElement('canvas');
  shadCanvas.width = 128;
  shadCanvas.height = 128;
  const sctx = shadCanvas.getContext('2d')!;
  const grad = sctx.createRadialGradient(64, 64, 12, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.82)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.38)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 128, 128);
  const contactShadowMap = new THREE.CanvasTexture(shadCanvas);

  // 11. Soft Spray / Smoke Particle Sprite
  const partCanvas = document.createElement('canvas');
  partCanvas.width = 64;
  partCanvas.height = 64;
  const pctx = partCanvas.getContext('2d')!;
  const pgrad = pctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  pgrad.addColorStop(0, 'rgba(255,255,255,0.85)');
  pgrad.addColorStop(0.5, 'rgba(235,245,255,0.35)');
  pgrad.addColorStop(1, 'rgba(255,255,255,0)');
  pctx.fillStyle = pgrad;
  pctx.fillRect(0, 0, 64, 64);
  const particleMap = new THREE.CanvasTexture(partCanvas);

  const createCarNumberTexture = (
    carNumber: number,
    primaryColor: string,
    accentColor: string,
  ): THREE.CanvasTexture => {
    const nc = document.createElement('canvas');
    nc.width = 128;
    nc.height = 128;
    const nctx = nc.getContext('2d')!;
    nctx.fillStyle = primaryColor;
    nctx.fillRect(0, 0, 128, 128);
    nctx.fillStyle = accentColor;
    nctx.fillRect(0, 102, 128, 26);
    nctx.fillStyle = '#ffffff';
    nctx.font = 'bold 74px Inter, Arial, sans-serif';
    nctx.textAlign = 'center';
    nctx.textBaseline = 'middle';
    nctx.fillText(String(carNumber), 64, 54);
    const tex = new THREE.CanvasTexture(nc);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = aniso;
    extraDisposables.push(tex);
    return tex;
  };

  return {
    asphaltMap,
    asphaltNormalMap,
    asphaltBump,
    asphaltRoughnessMap,
    asphaltAoMap,
    carbonMap,
    carbonNormalMap,
    carbonRoughnessMap,
    kerbMap,
    kerbNormalMap,
    kerbRoughnessMap,
    getKerbTexture,
    grassMap,
    grassNormalMap,
    tireDryMap: dryTire.map,
    tireWetMap: wetTire.map,
    tireDryNormalMap: dryTire.normalMap,
    tireWetNormalMap: wetTire.normalMap,
    tireSidewallDryMap,
    tireSidewallWetMap,
    tireSidewallBlurMap,
    gridLineMap,
    gantryBannerMap,
    getGantryBannerTexture: buildGantryBanner,
    brake100Map,
    brake50Map,
    drsBoardMap,
    contactShadowMap,
    particleMap,
    createCarNumberTexture,
    dispose: () => {
      asphaltMap.dispose();
      asphaltNormalMap.dispose();
      asphaltBump.dispose();
      asphaltRoughnessMap.dispose();
      asphaltAoMap.dispose();
      carbonMap.dispose();
      carbonNormalMap.dispose();
      carbonRoughnessMap.dispose();
      kerbMap.dispose();
      kerbNormalMap.dispose();
      kerbRoughnessMap.dispose();
      grassMap.dispose();
      grassNormalMap.dispose();
      dryTire.map.dispose();
      dryTire.normalMap.dispose();
      wetTire.map.dispose();
      wetTire.normalMap.dispose();
      tireSidewallDryMap.dispose();
      tireSidewallWetMap.dispose();
      tireSidewallBlurMap.dispose();
      gridLineMap.dispose();
      gantryBannerMap.dispose();
      brake100Map.dispose();
      brake50Map.dispose();
      drsBoardMap.dispose();
      contactShadowMap.dispose();
      particleMap.dispose();
      for (const tex of extraDisposables) tex.dispose();
    },
  };
}

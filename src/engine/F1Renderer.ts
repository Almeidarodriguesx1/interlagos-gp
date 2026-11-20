import * as THREE from 'three';
import type {RivalLodGrid} from './rivalLodGrid';
import {studyFromQuery, type VehicleStudy} from '../sim/vehicleStudies';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import type { SpatialRivalAudioInput } from '../audio/F1AudioEngine';
import { RecordedAudioEngine } from '../audio/RecordedAudioEngine';
import { createWheelContacts, wheelContacts } from '../audio/surfaces';
import { FixedStepClock, PHYSICS_DT, PHYSICS_HZ } from '../sim/fixedStep';
import {
  createGamepadEdgeState,
  mapGamepadState,
  type RawGamepadState,
} from '../sim/gamepad';
import {
  computeKerbParticleSide,
  computeMotionBlurIntensity,
  MAX_RPM,
  WHEEL_RADIUS,
} from '../sim/physics';
import {
  buildTelemetrySnapshot,
  createRaceSession,

  stepRaceSession,
  type RaceSession,
} from '../sim/raceDirector';
import { getTrack } from '../sim/track';
import type {
  CameraMode,
  CarState,
  ControlInputs,
  GamePhase,
  GhostLapData,
  RaceConfig,
  TelemetrySnapshot,
  TrackId,
  WeatherCondition,
} from '../sim/types';
import { MultiCameraRig } from './cameraRig';
import { buildF1CarVisual, type F1CarVisual } from './carBuilder';
import { createProceduralHdri } from './hdrEnv';
import { createProceduralTextures, type ProceduralTextures } from './textures';
import { buildInterlagosScene, type InterlagosEnvironment } from './trackBuilder';

import {teams2026} from '../sim/grid2026';
const rosterModels: Record<string, string | undefined> = {...Object.fromEntries(teams2026.map(t=>[t.name,t.model])), 'Oracle Racing':'rb22','Scuderia Rosso':'sf26','Papaya GP':'mcl40'};

export const CAMERA_ORDER: CameraMode[] = ['chase', 'cockpit', 'tcam', 'trackside', 'helicopter'];

interface ParticleSlot {
  active: boolean;
  life: number;
  maxLife: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  scale: number;
  rotX?: number;
  rotY?: number;
}

const PARTICLE_POOL_SIZE = 220;
const SPARK_POOL_SIZE = 160;
const KERB_POOL_SIZE = 140;
const EXHAUST_POOL_SIZE = 32;
const SKIDMARK_POOL_SIZE = 480;
const SPEED_STREAK_COUNT = 52;
const RAIN_COUNT = 220;
const _dummyMatrix = new THREE.Object3D();
const _sunTargetVec = new THREE.Vector3();
const _kerbColor = new THREE.Color();
const _particleColor = new THREE.Color();
const _exhaustColor = new THREE.Color();
const _streakOffset = new THREE.Vector3();
const _camFwdVec = new THREE.Vector3();
const _camUpVec = new THREE.Vector3(0, 1, 0);
const _rivalAudioSlots: SpatialRivalAudioInput[] = Array.from({ length: 21 }, () => ({
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vz: 0,
  rpm: 4000,
  throttle: 0,
}));

const RadialMotionBlurShader = {
  uniforms: {
    tDiffuse: { value: null },
    uIntensity: { value: 0.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uIntensity;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      if (uIntensity <= 0.002) {
        gl_FragColor = base;
        return;
      }
      vec2 center = vec2(0.5, 0.48);
      vec2 dir = vUv - center;
      float dist = length(dir);
      // Keep center focal zone sharp; softly streak periphery at high speed
      float mask = smoothstep(0.18, 0.90, dist);
      float blurAmt = uIntensity * 0.022 * mask;
      vec4 accum = base;
      float weightSum = 1.0;
      for (int i = 1; i <= 5; i++) {
        float t = float(i) / 5.0;
        float w = 1.0 - t * 0.5;
        vec2 sampleUv = clamp(vUv - dir * (blurAmt * t), 0.001, 0.999);
        accum += texture2D(tDiffuse, sampleUv) * w;
        weightSum += w;
      }
      gl_FragColor = accum / weightSum;
    }
  `,
};

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class F1EngineController {
  private container: HTMLElement;
  private onTelemetry: (snap: TelemetrySnapshot) => void;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private readonly vehicleStudy: VehicleStudy|undefined;

  private textures: ProceduralTextures;
  private env: InterlagosEnvironment;
  private modelsSettled = false;
  private preparedStages = 0;
  private gridHoldUntil = 0;
  private rivalGrid?: RivalLodGrid;
  private gridError?: string;
  private carVisuals: F1CarVisual[] = [];
  private ghostVisual: F1CarVisual;
  private cameraRig = new MultiCameraRig();
  private audio = new RecordedAudioEngine();

  private sky: Sky;
  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private pmremTex: THREE.Texture | null = null;
  private activeHdriWeather: WeatherCondition | null = null;

  // Pooled particle ring buffer (spray / tire smoke / off-track dust)
  private particleMesh: THREE.InstancedMesh;
  private particles: ParticleSlot[] = [];
  private particleCursor = 0;

  // Pooled titanium skid-block & collision sparks
  private sparkMesh: THREE.InstancedMesh;
  private sparks: Array<ParticleSlot & { floorY: number }> = [];
  private sparkCursor = 0;

  // Pooled kerb gravel, rubber marbles & paint chip particles
  private kerbMesh: THREE.InstancedMesh;
  private kerbParticles: ParticleSlot[] = [];
  private kerbCursor = 0;

  // Pooled exhaust shift / overrun flame pops
  private exhaustMesh: THREE.InstancedMesh;
  private exhaustFlames: Array<ParticleSlot & { yaw: number }> = [];
  private exhaustCursor = 0;

  private particleColorDirty = false;
  private exhaustColorDirty = false;
  private kerbColorDirty = false;

  // Pooled permanent asphalt tire skidmark segments (ring buffer)
  private skidmarkMesh: THREE.InstancedMesh;
  private skidmarkCursor = 0;
  private lastSkidPos = new Map<string, { x: number; z: number }>();

  // Camera-space subtle peripheral air streaks at high speed
  private speedStreakMesh: THREE.InstancedMesh;
  private speedStreakMat: THREE.MeshBasicMaterial;
  private speedStreaks: Array<{ angle: number; radius: number; z: number; speedMult: number }> = [];
  private smoothedBlur = 0;

  // GPU-only Radial Motion Blur post-processing pipeline
  private composer: EffectComposer | null = null;
  private motionBlurPass: ShaderPass | null = null;
  private outputPass: OutputPass | null = null;

  // Wet weather 3D rain streaks around camera
  private rainMesh: THREE.InstancedMesh;
  private rainDrops: Array<{ x: number; y: number; z: number; speed: number }> = [];

  private session: RaceSession;
  private keysHeld = new Set<string>();
  private gamepadEdge = createGamepadEdgeState();
  private lastRumbleMs = 0;
  private drsJustPressed = false;
  private lastInputs: ControlInputs = {
    throttle: 0,
    brake: 0,
    steer: 0,
    ersBoost: false,
    drsToggleJustPressed: false,
  };

  private prevCarStates: CarState[] = [];
  private interpCarStates: CarState[] = [];
  private simTimeSec = 0;
  private debugOverlayVisible = false;
  private debugOverlayEl: HTMLDivElement | null = null;
  private debugFrozen = false;
  private fpsFrames = 0;
  private fpsLastSampleMs = 0;
  private currentFps = 60;

  private frameId = 0;
  private disposed = false;
  private lastTimeMs = 0;
  private physicsClock = new FixedStepClock();
  private pendingDrsToggle = false;
  private pendingIgnition = false;
  private pendingUp = false;
  private pendingDown = false;
  private phaseBeforePause: GamePhase = 'playing';
  private wheelAudioContacts = createWheelContacts();
  private lastHudPushMs = 0;
  private lastWheelScreenMs = 0;
  private numberTexCache = new Map<string, THREE.CanvasTexture>();
  private contextLost = false;
  private resizeObserver: ResizeObserver;

  constructor(
    container: HTMLElement,
    initialConfig: RaceConfig,
    autostart: boolean,
    onTelemetry: (snap: TelemetrySnapshot) => void,
  ) {
    this.vehicleStudy = studyFromQuery(new URLSearchParams(window.location.search).get('car') ?? 'mcl40');
    initialConfig = {...initialConfig, playerVehicle: this.vehicleStudy?.config};
    this.container = container;
    this.onTelemetry = onTelemetry;
    this.isSoftwareGl = detectSoftwareWebGL();
    this.debugOverlayVisible =
      new URLSearchParams(window.location.search).get('debug') === 'cam';

    // 1. Renderer Setup
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: this.isSoftwareGl,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.setAttribute('data-testid', 'f1-canvas');
    container.appendChild(this.renderer.domElement);

    // WebGL context recovery safety
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
    });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
    });

    // 2. Scene, Environment & Atmospheric Sky
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9bc4e2);
    this.scene.fog = new THREE.FogExp2(0xaecce0, 0.00022);

    this.pmremTex = createProceduralHdri(this.renderer, initialConfig.weather);
    this.activeHdriWeather = initialConfig.weather;
    this.scene.environment = this.pmremTex;
    this.scene.environmentIntensity = initialConfig.weather === 'wet' ? 0.62 : 0.42;

    this.camera = new THREE.PerspectiveCamera(62, w / h, 0.15, 2400);

    // Procedural Sky
    this.sky = new Sky();
    this.sky.scale.setScalar(4500);
    this.scene.add(this.sky);

    // Warm/Cool Outdoor Sunlight Rig
    this.hemiLight = new THREE.HemisphereLight(0xcbe4ff, 0x3b4d32, 0.72);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xffeacc, 2.35);
    this.sunLight.position.set(160, 210, 120);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(this.isSoftwareGl ? 512 : 1024, this.isSoftwareGl ? 512 : 1024);
    this.sunLight.shadow.camera.near = 20;
    this.sunLight.shadow.camera.far = 360;
    const d = 48;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // 3. Textures & Circuit World
    const initialTrack = getTrack(initialConfig.trackId ?? 'interlagos');
    this.textures = createProceduralTextures(this.renderer.capabilities.getMaxAnisotropy());
    this.env = buildInterlagosScene(this.textures, initialTrack);
    this.scene.add(this.env.group);

    // 4. Pooled Spray/Smoke/Dirt Particles (with instanceColor tinting)
    const pGeo = new THREE.SphereGeometry(0.46, 7, 7);
    const pMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, PARTICLE_POOL_SIZE);
    this.particleMesh.frustumCulled = false;
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      this.particles.push({ active: false, life: 0, maxLife: 1, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, scale: 0 });
      _dummyMatrix.position.set(0, -999, 0);
      _dummyMatrix.scale.setScalar(0.001);
      _dummyMatrix.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummyMatrix.matrix);
      _particleColor.setHex(0xe2e8f0);
      this.particleMesh.setColorAt(i, _particleColor);
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.particleMesh);

    // Pooled Titanium Skid-Block & Collision Sparks
    const sGeo = new THREE.BoxGeometry(0.045, 0.045, 0.62);
    const sMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    this.sparkMesh = new THREE.InstancedMesh(sGeo, sMat, SPARK_POOL_SIZE);
    this.sparkMesh.frustumCulled = false;
    for (let i = 0; i < SPARK_POOL_SIZE; i++) {
      this.sparks.push({ active: false, life: 0, maxLife: 1, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, scale: 0, floorY: 0 });
      _dummyMatrix.position.set(0, -999, 0);
      _dummyMatrix.scale.setScalar(0.001);
      _dummyMatrix.updateMatrix();
      this.sparkMesh.setMatrixAt(i, _dummyMatrix.matrix);
    }
    this.sparkMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.sparkMesh);

    // Pooled Exhaust Shift / Overrun Flame Pops
    const exGeo = new THREE.ConeGeometry(0.11, 0.68, 7);
    exGeo.rotateX(-Math.PI / 2);
    const exMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });
    this.exhaustMesh = new THREE.InstancedMesh(exGeo, exMat, EXHAUST_POOL_SIZE);
    this.exhaustMesh.frustumCulled = false;
    for (let i = 0; i < EXHAUST_POOL_SIZE; i++) {
      this.exhaustFlames.push({
        active: false,
        life: 0,
        maxLife: 0.09,
        x: 0,
        y: -999,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        scale: 1,
        yaw: 0,
      });
      _dummyMatrix.position.set(0, -999, 0);
      _dummyMatrix.scale.setScalar(0.001);
      _dummyMatrix.updateMatrix();
      this.exhaustMesh.setMatrixAt(i, _dummyMatrix.matrix);
      _exhaustColor.setHex(0xf97316);
      this.exhaustMesh.setColorAt(i, _exhaustColor);
    }
    this.exhaustMesh.instanceMatrix.needsUpdate = true;
    if (this.exhaustMesh.instanceColor) this.exhaustMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.exhaustMesh);

    // Pooled Kerb Grit, Rubber Marbles & Paint Flecks
    const kGeo = new THREE.DodecahedronGeometry(0.068, 0);
    const kMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.88,
      metalness: 0.04,
    });
    this.kerbMesh = new THREE.InstancedMesh(kGeo, kMat, KERB_POOL_SIZE);
    this.kerbMesh.frustumCulled = false;
    for (let i = 0; i < KERB_POOL_SIZE; i++) {
      this.kerbParticles.push({
        active: false,
        life: 0,
        maxLife: 1,
        x: 0,
        y: -999,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        scale: 0,
        rotX: 0,
        rotY: 0,
      });
      _dummyMatrix.position.set(0, -999, 0);
      _dummyMatrix.scale.setScalar(0.001);
      _dummyMatrix.updateMatrix();
      this.kerbMesh.setMatrixAt(i, _dummyMatrix.matrix);
      _kerbColor.setHex(0x475569);
      this.kerbMesh.setColorAt(i, _kerbColor);
    }
    this.kerbMesh.instanceMatrix.needsUpdate = true;
    if (this.kerbMesh.instanceColor) this.kerbMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.kerbMesh);

    // Pooled Asphalt Skidmark Ring Buffer (laid under sliding/locked tires)
    const skidGeo = new THREE.PlaneGeometry(0.38, 1.35);
    skidGeo.rotateX(-Math.PI / 2);
    const skidMat = new THREE.MeshBasicMaterial({
      color: 0x0b0d11,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    this.skidmarkMesh = new THREE.InstancedMesh(skidGeo, skidMat, SKIDMARK_POOL_SIZE);
    this.skidmarkMesh.frustumCulled = false;
    this.clearSkidmarks();
    this.scene.add(this.skidmarkMesh);

    // Subtle Peripheral Speed Streaks in Camera Frustum Edges
    const stGeo = new THREE.BoxGeometry(0.0085, 0.0085, 1.0);
    this.speedStreakMat = new THREE.MeshBasicMaterial({
      color: 0xe2e8f0,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    this.speedStreakMesh = new THREE.InstancedMesh(stGeo, this.speedStreakMat, SPEED_STREAK_COUNT);
    this.speedStreakMesh.frustumCulled = false;
    this.speedStreakMesh.visible = false;
    for (let i = 0; i < SPEED_STREAK_COUNT; i++) {
      const angle = (i / SPEED_STREAK_COUNT) * Math.PI * 2 + (i % 3) * 0.14;
      this.speedStreaks.push({
        angle,
        radius: 2.35 + ((i * 29) % 19) * 0.11,
        z: -1.5 - ((i * 41) % 140) * 0.1,
        speedMult: 0.85 + ((i * 17) % 35) * 0.01,
      });
      _dummyMatrix.position.set(0, -999, 0);
      _dummyMatrix.scale.setScalar(0.001);
      _dummyMatrix.updateMatrix();
      this.speedStreakMesh.setMatrixAt(i, _dummyMatrix.matrix);
    }
    this.speedStreakMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.speedStreakMesh);

    // GPU-Only Radial Motion Blur Post-Processing Pipeline (skipped on software WebGL)
    if (!this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.motionBlurPass = new ShaderPass(RadialMotionBlurShader);
      this.composer.addPass(this.motionBlurPass);
      this.outputPass = new OutputPass();
      this.composer.addPass(this.outputPass);
    }

    // Wet Weather 3D Rain Streaks
    const rGeo = new THREE.BoxGeometry(0.02, 1.35, 0.02);
    const rMat = new THREE.MeshBasicMaterial({
      color: 0xcbd5e1,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    this.rainMesh = new THREE.InstancedMesh(rGeo, rMat, RAIN_COUNT);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.visible = initialConfig.weather === 'wet';
    for (let i = 0; i < RAIN_COUNT; i++) {
      this.rainDrops.push({
        x: (Math.random() - 0.5) * 68,
        y: Math.random() * 28,
        z: (Math.random() - 0.5) * 68,
        speed: 26 + Math.random() * 14,
      });
    }
    this.scene.add(this.rainMesh);

    // 5. Create Race Session & 10 Composite F1 Cars (pre-allocated pool, hidden when < 10 cars in Time Trial)
    
    const passDemo = autostart && new URLSearchParams(location.search).get('demo') === 'pass' && new URLSearchParams(location.search).get('grid') === 'teams';
    const startPhase: GamePhase = passDemo ? 'playing' : autostart ? 'countdown' : 'title';
    if (autostart) this.gridHoldUntil = performance.now() + 2500;
    this.session = createRaceSession(passDemo ? {...initialConfig, mode:'race'} : initialConfig, startPhase, passDemo ? 'tcam' : 'chase', false, initialTrack, null, null, passDemo);
    this.debugFrozen = passDemo;

    const rosterCars =
      this.session.cars.length > 3
        ? this.session.cars
        : createRaceSession({ ...initialConfig, mode: 'race' }, 'title', 'chase', false, initialTrack).cars;

    for (let slot = 0; slot < rosterCars.length; slot++) {
      // Build full 10-car roster visuals upfront so switching Race <-> Time Trial is zero-alloc
      const sampleCar = rosterCars[slot];
      const numberDecalMap = this.getOrCreateNumberTexture(
        sampleCar.number,
        sampleCar.primaryColor,
        sampleCar.accentColor,
      );
      const visual = buildF1CarVisual({
        primaryColor: sampleCar.primaryColor,
        accentColor: sampleCar.accentColor,
        helmetColor: sampleCar.helmetColor,
        carNumber: sampleCar.number,
        carbonMap: this.textures.carbonMap,
        carbonNormalMap: this.textures.carbonNormalMap,
        carbonRoughnessMap: this.textures.carbonRoughnessMap,
        tireDryMap: this.textures.tireDryMap,
        tireDryNormalMap: this.textures.tireDryNormalMap,
        tireSidewallDryMap: this.textures.tireSidewallDryMap,
        tireSidewallBlurMap: this.textures.tireSidewallBlurMap,
        numberDecalMap,
        contactShadowMap: this.textures.contactShadowMap,
        enableSteeringScreen: slot === rosterCars.length - 1,
        pilotDetail: slot === rosterCars.length - 1,
      });
      this.scene.add(visual.root);
      this.carVisuals.push(visual);
    }

    // Translucent Cyan Holographic Ghost Car for Time Trial
    const ghostDecal = this.getOrCreateNumberTexture(0, '#0284c7', '#38bdf8');
    this.ghostVisual = buildF1CarVisual({
      primaryColor: '#0284c7',
      accentColor: '#38bdf8',
      helmetColor: '#e0f2fe',
      carNumber: 0,
      carbonMap: this.textures.carbonMap,
      numberDecalMap: ghostDecal,
      contactShadowMap: this.textures.contactShadowMap,
      enableSteeringScreen: false,
    });
    const ghostMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: new THREE.Color(0x0284c7),
      emissiveIntensity: 0.55,
      roughness: 0.25,
      metalness: 0.2,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
    });
    this.ghostVisual.root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.material = ghostMat;
      }
    });
    this.ghostVisual.root.visible = false;
    this.scene.add(this.ghostVisual.root);

    this.syncCarVisualPool();
    const gridMode = new URLSearchParams(location.search).get('grid');
    let gridLoad: Promise<void> = Promise.resolve();
    if (this.vehicleStudy || gridMode === 'teams') {
      const teams = (passDemo ? this.session.cars : rosterCars).filter(car => !car.isPlayer).map(car => gridMode === 'mcl40-lod' ? 'mcl40' : rosterModels[car.teamName]);
      gridLoad = import('./rivalLodGrid').then(({RivalLodGrid}) => RivalLodGrid.load(teams)).then(grid => {
        if (this.disposed) { grid.dispose(); return; }
        this.rivalGrid = grid;
        this.scene.add(grid.root);
        if (passDemo) void pilotPromise.finally(() => { this.debugFrozen = false; }).catch(() => {});
      }).catch(error => {
        if (!this.disposed) {
          if (passDemo) this.debugFrozen = false;
          this.gridError = String(error);
          console.error('[MCL40 grid]', error);
        }
      });
    }
    const pilotPromise = this.vehicleStudy
      ? import('./mcl40Pilot').then(({loadStudyPilot}) => loadStudyPilot(this.carVisuals[this.carVisuals.length - 1],this.vehicleStudy!))
      : import('./blenderPilot').then(({loadBlenderPilot}) => loadBlenderPilot(this.carVisuals[this.carVisuals.length - 1]));
    const pilotLoad = pilotPromise.then(visual=>{
      if(this.disposed){visual.dispose();return;}
      this.scene.remove(this.carVisuals[this.carVisuals.length - 1].root);this.carVisuals[this.carVisuals.length - 1]=visual;this.scene.add(visual.root);
      this.syncCarVisualPool();this.applyWeatherAtmosphere(this.session.config.weather);
      (window as any).interlagosPilot={ready:true,source:this.vehicleStudy?.label ?? 'Blender',inspection:visual.root.userData.inspection};
    }).catch(error=>{if(!this.disposed){console.error('[Blender pilot]',error);(window as any).interlagosPilot={ready:false,error:String(error)};}});

    void Promise.all([gridLoad, pilotLoad, this.env.ready].map(task => task.then(() => { this.preparedStages++; }))).then(async () => {
      if (!this.disposed) await this.renderer.compileAsync(this.scene, this.camera);
    }).catch(error => console.warn('Pré-carregamento de shaders', error))
      .finally(() => { this.modelsSettled = true; });
    this.applyWeatherAtmosphere(initialConfig.weather);
    this.env.setRacingLineVisible(initialConfig.racingLineEnabled);



    // 6. Bind Listeners & Start Loop
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    window.addEventListener('gamepadconnected', this.handleGamepadChange);
    window.addEventListener('gamepaddisconnected', this.handleGamepadChange);
    document.addEventListener('visibilitychange', this.handleVisibility);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.syncGamepadStatus();
    this.syncInterpolationSnapshots();
    this.syncBodyState();
    this.pushTelemetry(true);
    this.sync3DVisuals(0.016, 1);
    this.renderScene();

    if (this.debugOverlayVisible) {
      this.ensureDebugOverlay();
    }
    this.registerDebugHook();
    (window as any).interlagosDriving = {
      status: () => { const car=this.session.cars[this.session.playerIndex]; return { running:car.engineRunning, starting:car.engineStartTimer>0, manual:car.manualTransmission, gear:car.gear }; },
      manual: (value:boolean) => { this.session.cars[this.session.playerIndex].manualTransmission=value; },
      ignition: () => { this.pendingIgnition=true; },
      shift: (up:boolean) => { if(up)this.pendingUp=true;else this.pendingDown=true; },
    };
    if (autostart) this.audio.init();

    this.lastTimeMs = performance.now();
    this.fpsLastSampleMs = this.lastTimeMs;
    this.tick();
  }

  private syncInterpolationSnapshots(): void {
    this.prevCarStates = this.session.cars.map((c) => ({ ...c, sectorTimes: [...c.sectorTimes] as [number | null, number | null, number | null] }));
    this.interpCarStates = this.session.cars.map((c) => ({ ...c, sectorTimes: [...c.sectorTimes] as [number | null, number | null, number | null] }));
  }

  private copyCarsInto(src: CarState[], dst: CarState[]): void {
    if (dst.length !== src.length) {
      dst.length = 0;
      for (let i = 0; i < src.length; i++) {
        dst.push({ ...src[i], sectorTimes: [...src[i].sectorTimes] as [number | null, number | null, number | null] });
      }
      return;
    }
    for (let i = 0; i < src.length; i++) {
      Object.assign(dst[i], src[i]);
    }
  }

  private interpolateCars(alpha: number): void {
    const cars = this.session.cars;
    if (this.interpCarStates.length !== cars.length || this.prevCarStates.length !== cars.length) {
      this.syncInterpolationSnapshots();
    }
    const a = Math.max(0, Math.min(1, alpha));
    for (let i = 0; i < cars.length; i++) {
      const curr = cars[i];
      const prev = this.prevCarStates[i];
      const out = this.interpCarStates[i];
      Object.assign(out, curr);
      out.x = prev.x + (curr.x - prev.x) * a;
      out.y = prev.y + (curr.y - prev.y) * a;
      out.z = prev.z + (curr.z - prev.z) * a;
      out.vx = prev.vx + (curr.vx - prev.vx) * a;
      out.vz = prev.vz + (curr.vz - prev.vz) * a;
      out.speed = prev.speed + (curr.speed - prev.speed) * a;
      out.forwardSpeed = prev.forwardSpeed + (curr.forwardSpeed - prev.forwardSpeed) * a;
      const yawDiff = ((curr.yaw - prev.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      out.yaw = prev.yaw + yawDiff * a;
      out.pitch = prev.pitch + (curr.pitch - prev.pitch) * a;
      out.roll = prev.roll + (curr.roll - prev.roll) * a;
      out.trackPitch = prev.trackPitch + (curr.trackPitch - prev.trackPitch) * a;
      out.trackBank = prev.trackBank + (curr.trackBank - prev.trackBank) * a;
      out.steerAngle = prev.steerAngle + (curr.steerAngle - prev.steerAngle) * a;
      const spinPeriod = Math.PI * 200;
      const delta = curr.wheelSpin - prev.wheelSpin;
      out.wheelSpin = prev.wheelSpin + (delta - Math.round(delta / spinPeriod) * spinPeriod) * a;
      out.brakeTemp = prev.brakeTemp + (curr.brakeTemp - prev.brakeTemp) * a;
    }
  }

  private ensureDebugOverlay(): void {
    if (this.debugOverlayEl) return;
    const el = document.createElement('div');
    el.style.position = 'fixed';
    el.style.top = '8px';
    el.style.left = '8px';
    el.style.zIndex = '50';
    el.style.padding = '6px 10px';
    el.style.borderRadius = '6px';
    el.style.background = 'rgba(10, 14, 22, 0.88)';
    el.style.border = '1px solid rgba(255,255,255,0.16)';
    el.style.color = '#e2e8f0';
    el.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
    el.style.fontSize = '11px';
    el.style.pointerEvents = 'none';
    el.style.whiteSpace = 'nowrap';
    el.textContent = 'FPS: -- | Calls: -- | Tris: --';
    this.container.appendChild(el);
    this.debugOverlayEl = el;
  }

  private toggleDebugOverlay(): void {
    this.debugOverlayVisible = !this.debugOverlayVisible;
    if (this.debugOverlayVisible) {
      this.ensureDebugOverlay();
      if (this.debugOverlayEl) this.debugOverlayEl.style.display = 'block';
    } else if (this.debugOverlayEl) {
      this.debugOverlayEl.style.display = 'none';
    }
  }

  private registerDebugHook(): void {
    const win = window as unknown as Record<string, unknown>;
    win.__f1Debug = {
      setCamera: (mode: CameraMode) => {
        this.setCamera(mode);
        this.sync3DVisuals(0.016, 1);
        this.renderScene();
      },
      setTrack: (trackId: TrackId) => {
        this.setTrack(trackId);
      },
      freeze: (frozen: boolean) => {
        this.debugFrozen = frozen;
      },
      getStats: () => ({
        fps: this.currentFps,
        physicsHz: PHYSICS_HZ,
        physicsSteps: this.physicsClock.totalSteps,
        physicsDroppedSeconds: this.physicsClock.droppedSeconds,
        calls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        camera: this.session.activeCamera,
        track: this.session.track.id,
        near: this.camera.near,
        fov: this.camera.fov,
      }),
    };
    if(new URLSearchParams(location.search).has('debug')) {
      Object.assign(win.__f1Debug as object,{scene:this.scene,renderer:this.renderer,camera:this.camera,getSession:()=>this.session,getPilotVisual:()=>this.carVisuals[this.carVisuals.length - 1],setWeather:(weather:WeatherCondition)=>this.setWeather(weather),
        getGridTest: () => ({ready: !!this.rivalGrid, enabled: this.rivalGrid?.root.visible, levels: this.rivalGrid?.levels(), error:this.gridError}),
        setGridTest: (enabled: boolean) => { if (this.rivalGrid) this.rivalGrid.root.visible = enabled; },
        exportPilot:async()=>{
          const {exportPilot}=await import('./exportPilot');
          return exportPilot(this.carVisuals[this.carVisuals.length - 1].root);
        }});
    }
  }

  private applyWeatherAtmosphere(weather: WeatherCondition): void {
    this.env.setWeatherVisuals(weather);
    if (this.activeHdriWeather !== weather) {
      const nextHdri = createProceduralHdri(this.renderer, weather);
      this.scene.environment = nextHdri;
      this.pmremTex?.dispose();
      this.pmremTex = nextHdri;
      this.activeHdriWeather = weather;
    }
    if (this.rainMesh) {
      this.rainMesh.visible = weather === 'wet';
    }
    for (const vis of this.carVisuals) {
      if (!vis.root.userData.vehicleStudy) vis.sidewallMat.map =
        weather === 'wet' ? this.textures.tireSidewallWetMap : this.textures.tireSidewallDryMap;
      vis.sidewallMat.needsUpdate = true;
      vis.rubberMat.map = weather === 'wet' ? this.textures.tireWetMap : this.textures.tireDryMap;
      vis.rubberMat.normalMap =
        weather === 'wet' ? this.textures.tireWetNormalMap : this.textures.tireDryNormalMap;
      vis.rubberMat.roughness = weather === 'wet' ? 0.44 : 0.84;
      vis.rubberMat.needsUpdate = true;
    }
    const skyUniforms = this.sky.material.uniforms;
    if (weather === 'wet') {
      skyUniforms['turbidity'].value = 6.2;
      skyUniforms['rayleigh'].value = 0.72;
      skyUniforms['mieCoefficient'].value = 0.0075;
      skyUniforms['mieDirectionalG'].value = 0.68;
      const phi = THREE.MathUtils.degToRad(90 - 28);
      const theta = THREE.MathUtils.degToRad(145);
      const sunPos = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
      skyUniforms['sunPosition'].value.copy(sunPos);

      this.scene.background = new THREE.Color(0x64748b);
      this.scene.environmentIntensity = 0.62;
      (this.scene.fog as THREE.FogExp2).color.setHex(0x748599);
      (this.scene.fog as THREE.FogExp2).density = 0.00048;
      this.sunLight.intensity = 1.35;
      this.sunLight.color.setHex(0xdce7f5);
      this.hemiLight.intensity = 0.85;
    } else {
      skyUniforms['turbidity'].value = 3.2;
      skyUniforms['rayleigh'].value = 1.6;
      skyUniforms['mieCoefficient'].value = 0.0032;
      skyUniforms['mieDirectionalG'].value = 0.78;
      const phi = THREE.MathUtils.degToRad(90 - 42);
      const theta = THREE.MathUtils.degToRad(142);
      const sunPos = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
      skyUniforms['sunPosition'].value.copy(sunPos);

      this.scene.background = new THREE.Color(0x8ec5ea);
      this.scene.environmentIntensity = 0.42;
      (this.scene.fog as THREE.FogExp2).color.setHex(0xa6cee8);
      (this.scene.fog as THREE.FogExp2).density = 0.00022;
      this.sunLight.intensity = 2.25;
      this.sunLight.color.setHex(0xffeacc);
      this.hemiLight.intensity = 0.72;
    }
  }

  private syncBodyState(): void {
    const mapped =
      this.session.phase === 'countdown' ? 'playing' : this.session.phase;
    document.body.dataset.state = mapped;
  }

  // --- Public Actions from React Shell ---

  private rebuildTrackEnvironment(trackId: TrackId): void {
    const nextTrack = getTrack(trackId);
    if (nextTrack.id === this.session.track.id) return;
    this.scene.remove(this.env.group);
    this.env.dispose();
    this.env = buildInterlagosScene(this.textures, nextTrack);
    this.scene.add(this.env.group);
    this.applyWeatherAtmosphere(this.session.config.weather);
    this.env.setRacingLineVisible(this.session.config.racingLineEnabled);
  }

  private getOrCreateNumberTexture(
    carNumber: number,
    primaryColor: string,
    accentColor: string,
  ): THREE.CanvasTexture {
    const key = `${carNumber}:${primaryColor}:${accentColor}`;
    const cached = this.numberTexCache.get(key);
    if (cached) return cached;
    const tex = this.textures.createCarNumberTexture(carNumber, primaryColor, accentColor);
    this.numberTexCache.set(key, tex);
    return tex;
  }

  private syncRosterLiveries(): void {
    for (let i = 0; i < this.session.cars.length; i++) {
      const car = this.session.cars[i];
      const visIdx = car.isPlayer ? this.carVisuals.length - 1 : i;
      const vis = this.carVisuals[visIdx];
      if (!vis) continue;
      const decal = this.getOrCreateNumberTexture(car.number, car.primaryColor, car.accentColor);
      vis.updateLivery(car.primaryColor, car.accentColor, car.helmetColor, decal);
    }
  }

  private syncCarVisualPool(): void {
    // In Time Trial, player is the only entry in session.cars (index 0); in Race, player is last entry (index 9)
    // Map car visuals cleanly by car id or order so player always uses player visual slot 9
    for (let i = 0; i < this.carVisuals.length; i++) {
      this.carVisuals[i].root.visible = false;
    }
    for (let i = 0; i < this.session.cars.length; i++) {
      const car = this.session.cars[i];
      const visIdx = car.isPlayer ? this.carVisuals.length - 1 : i;
      if (this.carVisuals[visIdx]) {
        this.carVisuals[visIdx].root.visible = true;
      }
    }
    this.syncRosterLiveries();
  }

  private clearSkidmarks(): void {
    this.skidmarkCursor = 0;
    this.lastSkidPos.clear();
    if (!this.skidmarkMesh) return;
    _dummyMatrix.position.set(0, -999, 0);
    _dummyMatrix.rotation.set(0, 0, 0);
    _dummyMatrix.scale.setScalar(0.001);
    _dummyMatrix.updateMatrix();
    for (let i = 0; i < SKIDMARK_POOL_SIZE; i++) {
      this.skidmarkMesh.setMatrixAt(i, _dummyMatrix.matrix);
    }
    this.skidmarkMesh.instanceMatrix.needsUpdate = true;
  }

  public setTrack(
    trackId: TrackId,
    personalRecordTime: number | null = null,
    initialGhost: GhostLapData | null = null,
  ): void {
    this.rebuildTrackEnvironment(trackId);
    this.clearSkidmarks();
    const nextConfig: RaceConfig = { ...this.session.config, trackId };
    this.cameraRig.reset();
    const nextTrack = getTrack(trackId);
    this.session = createRaceSession(
      nextConfig,
      this.session.phase,
      this.session.activeCamera,
      this.session.muted,
      nextTrack,
      personalRecordTime,
      initialGhost,
    );
    this.syncGamepadStatus();
    this.syncInterpolationSnapshots();
    this.syncCarVisualPool();
    this.sync3DVisuals(0.016, 1);
    this.pushTelemetry(true);
  }

  public startRace(
    config: RaceConfig,
    personalRecordTime: number | null = null,
    initialGhost: GhostLapData | null = null,
  ): void {
    this.gridHoldUntil = performance.now() + 2500;
    config = {...config, playerVehicle: this.vehicleStudy?.config};
    this.audio.init();
    this.audio.setPaused(false);
    this.physicsClock = new FixedStepClock();
    this.pendingDrsToggle = false;
    this.pendingIgnition = this.pendingUp = this.pendingDown = false;
    this.keysHeld.clear();
    this.drsJustPressed = false;
    this.cameraRig.reset();
    this.clearSkidmarks();
    const trackId = config.trackId ?? 'interlagos';
    this.rebuildTrackEnvironment(trackId);
    const track = getTrack(trackId);
    this.session = createRaceSession(
      config,
      'countdown',
      this.session.activeCamera,
      this.session.muted,
      track,
      personalRecordTime,
      initialGhost,
    );
    this.syncGamepadStatus();
    this.syncInterpolationSnapshots();
    this.syncCarVisualPool();
    this.applyWeatherAtmosphere(config.weather);
    this.env.setRacingLineVisible(config.racingLineEnabled);
    this.syncBodyState();
    this.pushTelemetry(true);
  }

  public restartRace(): void {
    this.startRace(
      this.session.config,
      this.session.personalRecordTime,
      this.session.bestGhostLap,
    );
  }

  public finishSessionToResults(): void {
    this.audio.setPaused(true);
    this.keysHeld.clear();
    this.session.phase = 'gameover';
    this.syncBodyState();
    this.pushTelemetry(true);
  }

  public pauseRace(): void {
    if (this.session.phase === 'playing' || this.session.phase === 'countdown') {
      this.phaseBeforePause = this.session.phase;
      this.session.phase = 'paused';
      this.audio.setPaused(true);
      this.keysHeld.clear();
      this.syncBodyState();
      this.pushTelemetry(true);
    }
  }

  public resumeRace(): void {
    if (this.session.phase === 'paused') {
      this.audio.init();
      this.audio.setPaused(false);
      this.session.phase = this.phaseBeforePause;
      this.lastTimeMs = performance.now();
      this.syncBodyState();
      this.pushTelemetry(true);
    }
  }

  public returnToTitle(): void {
    this.audio.setPaused(true);
    this.keysHeld.clear();
    this.cameraRig.reset();
    this.clearSkidmarks();
    this.session = createRaceSession(
      this.session.config,
      'title',
      this.session.activeCamera,
      this.session.muted,
      this.session.track,
      this.session.personalRecordTime,
      this.session.bestGhostLap,
    );
    this.syncGamepadStatus();
    this.syncInterpolationSnapshots();
    this.syncCarVisualPool();
    this.syncBodyState();
    this.pushTelemetry(true);
  }

  public setCamera(mode: CameraMode): void {
    this.session.activeCamera = mode;
    this.pushTelemetry(true);
  }

  public cycleCamera(): void {
    const idx = CAMERA_ORDER.indexOf(this.session.activeCamera);
    const next = CAMERA_ORDER[(idx + 1) % CAMERA_ORDER.length];
    this.setCamera(next);
  }

  public setWeather(weather: WeatherCondition, record:number|null=null, ghost:GhostLapData|null=null): void {
    if(this.session.config.weather !== weather){
      for(const car of this.session.cars){car.bestLapTime=null;car.lastLapTime=null;car.lapValid=false;}
      this.session.personalRecordTime=record;this.session.fastestLap=null;
      this.session.bestGhostLap=ghost;this.session.bestLapBins=null;this.session.currentLapBins.fill(0);
    }
    this.session.config.weather = weather;
    this.applyWeatherAtmosphere(weather);
    this.pushTelemetry(true);
  }

  public setAssists(absEnabled: boolean, tcEnabled: boolean): void {
    this.session.config.absEnabled = absEnabled;
    this.session.config.tcEnabled = tcEnabled;
    this.pushTelemetry(true);
  }

  public setRacingLine(enabled: boolean): void {
    this.session.config.racingLineEnabled = enabled;
    this.env.setRacingLineVisible(enabled);
    this.pushTelemetry(true);
  }

  public setTireWear(enabled: boolean): void {
    this.session.config.tireWearEnabled = this.session.config.mode !== 'practice' && enabled;
    this.pushTelemetry(true);
  }

  public setCameraSettings(cockpitFov: number, horizonLock: number): void {
    this.session.config.cockpitFov = cockpitFov;
    this.session.config.horizonLock = horizonLock;
    this.pushTelemetry(true);
  }

  public setPlayerTeam(teamId: string): void {
    this.session.config.teamId = teamId;
    if (this.session.phase === 'title') {
      const nextSession = createRaceSession(
        { ...this.session.config, teamId },
        'title',
        this.session.activeCamera,
        this.session.muted,
        this.session.track,
        this.session.personalRecordTime,
        this.session.bestGhostLap,
      );
      this.session = nextSession;
      this.syncGamepadStatus();
      this.syncInterpolationSnapshots();
      this.syncCarVisualPool();
      this.sync3DVisuals(0.016, 1);
    }
    this.pushTelemetry(true);
  }

  public getBestGhostLap(): GhostLapData | null {
    return this.session.bestGhostLap;
  }

  public toggleMute(): void {
    this.audio.init();
    this.session.muted = !this.session.muted;
    this.audio.setMuted(this.session.muted);
    this.pushTelemetry(true);
  }

  // --- Input Handling ---

  private handleKeyDown = (e: KeyboardEvent): void => {
    const code = e.code;

    // Title screen Enter/Space handshake
    if (this.session.phase === 'title') {
      if (code === 'Enter' || code === 'Space') {
        e.preventDefault();
        this.startRace(
          this.session.config,
          this.session.personalRecordTime,
          this.session.bestGhostLap,
        );
      }
      return;
    }

    if (code === 'Escape' || code === 'KeyP') {
      e.preventDefault();
      if (this.session.phase === 'playing' || this.session.phase === 'countdown') {
        this.pauseRace();
      } else if (this.session.phase === 'paused') {
        this.resumeRace();
      }
      return;
    }

    if (!e.repeat && code === 'KeyI') { this.pendingIgnition=true; return; }
    if (!e.repeat && code === 'KeyT') { const c=this.session.cars[this.session.playerIndex];c.manualTransmission=!c.manualTransmission;return; }
    if (!e.repeat && code === 'KeyE') { this.pendingUp=true;return; }
    if (!e.repeat && code === 'KeyQ') { this.pendingDown=true;return; }

    if (code === 'KeyC' && !e.repeat) {
      this.cycleCamera();
      return;
    }
    if (code === 'Digit1') this.setCamera('cockpit');
    if (code === 'Digit2') this.setCamera('tcam');
    if (code === 'Digit3') this.setCamera('chase');
    if (code === 'Digit4') this.setCamera('trackside');
    if (code === 'Digit5') this.setCamera('helicopter');

    if (code === 'KeyM' && !e.repeat) {
      this.toggleMute();
      return;
    }

    if (code === 'KeyL' && !e.repeat) {
      this.setRacingLine(!this.session.config.racingLineEnabled);
      return;
    }

    if (code === 'F8' && !e.repeat) {
      e.preventDefault();
      this.toggleDebugOverlay();
      return;
    }

    if (code === 'Space' || code === 'ArrowUp' || code === 'ArrowDown' || code === 'ArrowLeft' || code === 'ArrowRight') {
      e.preventDefault();
    }

    if ((code === 'Space' || code === 'KeyF') && !e.repeat) {
      this.drsJustPressed = true;
    }

    this.keysHeld.add(code);
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keysHeld.delete(e.code);
  };

  private handleGamepadChange = (): void => {
    this.syncGamepadStatus();
    this.pushTelemetry(true);
  };

  private syncGamepadStatus(): void {
    const pad = this.getActiveGamepad();
    this.session.gamepadConnected = Boolean(pad);
    this.session.gamepadName = pad ? pad.id : null;
  }

  private getActiveGamepad(): Gamepad | null {
    try {
      const pads = navigator.getGamepads?.();
      if (!pads) return null;
      for (const p of pads) {
        if (p && p.connected) return p;
      }
      return null;
    } catch {
      return null;
    }
  }

  private triggerGamepadRumble(weak: number, strong: number, durationMs = 75): void {
    const now = performance.now();
    if (now - this.lastRumbleMs < 70) return;
    const pad = this.getActiveGamepad() as (Gamepad & {
      vibrationActuator?: {
        playEffect?: (
          type: string,
          params: { startDelay: number; duration: number; weakMagnitude: number; strongMagnitude: number },
        ) => Promise<void>;
      };
    }) | null;
    if (!pad?.vibrationActuator?.playEffect) return;
    this.lastRumbleMs = now;
    void pad.vibrationActuator
      .playEffect('dual-rumble', {
        startDelay: 0,
        duration: durationMs,
        weakMagnitude: Math.min(1, Math.max(0, weak)),
        strongMagnitude: Math.min(1, Math.max(0, strong)),
      })
      .catch(() => {});
  }

  private handleBlur = (): void => {
    this.keysHeld.clear();
  };

  private handleVisibility = (): void => {
    if (document.hidden) {
      this.keysHeld.clear();
    }
  };

  private handleResize(): void {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    if (w <= 0 || h <= 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
    if (!this.contextLost) {
      this.renderScene();
    }
  }

  private samplePlayerInputs(): ControlInputs {
    let throttle = this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp') ? 1 : 0;
    let brake = this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown') ? 1 : 0;
    const left = this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft') ? 1 : 0;
    const right = this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight') ? 1 : 0;
    let steer = left - right;
    let ersBoost = this.keysHeld.has('ShiftLeft') || this.keysHeld.has('ShiftRight');

    let drsToggleJustPressed = this.drsJustPressed;
    this.drsJustPressed = false;

    // Full Gamepad API analog + button + utility support
    const pad = this.getActiveGamepad();
    if (Boolean(pad) !== this.session.gamepadConnected) {
      this.syncGamepadStatus();
      this.pushTelemetry(true);
    }

    if (pad) {
      const mapped = mapGamepadState(pad as unknown as RawGamepadState, this.gamepadEdge);
      if (Math.abs(mapped.inputs.steer) > Math.abs(steer)) {
        steer = mapped.inputs.steer;
      }
      if (mapped.inputs.throttle > throttle) throttle = mapped.inputs.throttle;
      if (mapped.inputs.brake > brake) brake = mapped.inputs.brake;
      if (mapped.inputs.ersBoost) ersBoost = true;
      if (mapped.inputs.drsToggleJustPressed) drsToggleJustPressed = true;

      if (mapped.cameraCycleJustPressed && this.session.phase !== 'title') {
        this.cycleCamera();
      }
      if (mapped.racingLineToggleJustPressed && this.session.phase !== 'title') {
        this.setRacingLine(!this.session.config.racingLineEnabled);
      }
      if (mapped.pauseJustPressed) {
        if (this.session.phase === 'playing' || this.session.phase === 'countdown') {
          this.pauseRace();
        } else if (this.session.phase === 'paused') {
          this.resumeRace();
        } else if (this.session.phase === 'title') {
          this.startRace(this.session.config, this.session.personalRecordTime);
        }
      }
    }

    const inputs: ControlInputs = {
      throttle,
      brake,
      steer,
      ersBoost,
      drsToggleJustPressed,
    };
    this.lastInputs = inputs;
    return inputs;
  }

  private spawnParticle(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    scale: number,
    maxLife: number,
    hexColor = 0xe2e8f0,
  ): void {
    const idx = this.particleCursor;
    this.particleCursor = (this.particleCursor + 1) % PARTICLE_POOL_SIZE;
    const slot = this.particles[idx];
    slot.active = true;
    slot.life = 0;
    slot.maxLife = maxLife;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.vx = vx;
    slot.vy = vy;
    slot.vz = vz;
    slot.scale = scale;
    _particleColor.setHex(hexColor);
    this.particleMesh.setColorAt(idx, _particleColor);
    this.particleColorDirty = true;
  }

  private spawnSpark(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    maxLife: number,
    floorY: number,
  ): void {
    const slot = this.sparks[this.sparkCursor];
    this.sparkCursor = (this.sparkCursor + 1) % SPARK_POOL_SIZE;
    slot.active = true;
    slot.life = 0;
    slot.maxLife = maxLife;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.vx = vx;
    slot.vy = vy;
    slot.vz = vz;
    slot.scale = 1;
    slot.floorY = floorY;
  }

  private spawnExhaustFlame(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    yaw: number,
    scale: number,
    hexColor: number,
  ): void {
    const idx = this.exhaustCursor;
    this.exhaustCursor = (this.exhaustCursor + 1) % EXHAUST_POOL_SIZE;
    const slot = this.exhaustFlames[idx];
    slot.active = true;
    slot.life = 0;
    slot.maxLife = 0.085;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.vx = vx;
    slot.vy = vy;
    slot.vz = vz;
    slot.yaw = yaw;
    slot.scale = scale;
    _exhaustColor.setHex(hexColor);
    this.exhaustMesh.setColorAt(idx, _exhaustColor);
    this.exhaustColorDirty = true;
  }

  private spawnKerbParticle(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    scale: number,
    maxLife: number,
    hexColor: number,
  ): void {
    const idx = this.kerbCursor;
    this.kerbCursor = (this.kerbCursor + 1) % KERB_POOL_SIZE;
    const slot = this.kerbParticles[idx];
    slot.active = true;
    slot.life = 0;
    slot.maxLife = maxLife;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.vx = vx;
    slot.vy = vy;
    slot.vz = vz;
    slot.scale = scale;
    slot.rotX = Math.random() * Math.PI * 2;
    slot.rotY = Math.random() * Math.PI * 2;
    _kerbColor.setHex(hexColor);
    this.kerbMesh.setColorAt(idx, _kerbColor);
    this.kerbColorDirty = true;
  }

  private updateParticles(dt: number): void {
    const wet = this.session.config.weather === 'wet';
    const player = this.session.cars[this.session.playerIndex];

    // Emit wet spray, lockup tire smoke, off-track dirt dust, kerb grit/chips, exhaust flames, and sparks
    for (const car of this.session.cars) {
      if (car.speed < 8) continue;
      const distToPlayer = car.isPlayer ? 0 : Math.hypot(car.x - player.x, car.z - player.z);
      if (distToPlayer > 140) continue;

      const fx = Math.sin(car.yaw);
      const fz = Math.cos(car.yaw);

      const emitWet = wet && car.speed > 12 && Math.random() < (car.isPlayer ? 0.96 : 0.52);
      const emitSmoke = car.speed > 14 && car.slipRatio > 0.34 && Math.random() < 0.72;
      const emitOffTrackDust = !car.onTrack && !wet && car.speed > 10 && Math.random() < (car.isPlayer ? 0.85 : 0.45);

      if (emitWet || emitSmoke || emitOffTrackDust) {
        const side = (Math.random() < 0.5 ? -1 : 1) * 0.85;
        const rx = -fz * side;
        const rz = fx * side;
        const pColor = emitOffTrackDust ? 0x856847 : emitWet ? 0xdbeafe : 0xe2e8f0;
        this.spawnParticle(
          car.x - fx * 1.9 + rx,
          car.y + 0.24,
          car.z - fz * 1.9 + rz,
          -fx * car.speed * 0.14 + (Math.random() - 0.5) * 1.6,
          0.95 + Math.random() * 1.5,
          -fz * car.speed * 0.14 + (Math.random() - 0.5) * 1.6,
          emitWet ? 0.65 + (car.speed / 85) * 0.95 : emitOffTrackDust ? 0.58 : 0.48,
          emitWet ? 0.56 : 0.65,
          pColor,
        );
        // High-speed central rear diffuser rain rooster-tail plume
        if (emitWet && car.speed > 34 && Math.random() < 0.65) {
          this.spawnParticle(
            car.x - fx * 2.4,
            car.y + 0.42,
            car.z - fz * 2.4,
            -fx * car.speed * 0.22 + (Math.random() - 0.5) * 0.9,
            1.45 + (car.speed / 90) * 1.6,
            -fz * car.speed * 0.22 + (Math.random() - 0.5) * 0.9,
            0.85 + (car.speed / 90) * 0.8,
            0.48,
            0xe0f2fe,
          );
        }
      }

      // Kerb tire kickup: tumbling rubber marbles, dusty grit & kerb paint flecks + light dust puff
      const kerbSide = computeKerbParticleSide(car);
      if (kerbSide !== 0) {
        const rx = -fz * kerbSide;
        const rz = fx * kerbSide;
        const emitCount = car.isPlayer ? (car.speed > 35 ? 3 : 2) : 1;
        for (let k = 0; k < emitCount; k++) {
          const isFrontWheel = Math.random() < 0.28;
          const lonOffset = isFrontWheel ? 1.55 : -1.75;
          const latOffset = 0.78 + (Math.random() - 0.5) * 0.22;
          const kerbStyle = this.session.track.meta.kerbStyle;
          const accentA = kerbStyle === 'brazil' ? 0x10b981 : 0xdc2626;
          const accentB = kerbStyle === 'italy' ? 0x16a34a : 0xfacc15;
          const r = Math.random();
          const colorHex =
            r < 0.42 ? 0x334155 : r < 0.74 ? 0xcbd5e1 : r < 0.89 ? accentA : accentB;
          const kickBack = car.speed * (0.14 + Math.random() * 0.15);
          const kickOut = 0.75 + Math.random() * 1.9;
          this.spawnKerbParticle(
            car.x + fx * lonOffset + rx * latOffset,
            car.y + 0.11,
            car.z + fz * lonOffset + rz * latOffset,
            -fx * kickBack + rx * kickOut + (Math.random() - 0.5) * 1.4,
            1.35 + Math.random() * 2.4 + (car.speed / 90) * 1.1,
            -fz * kickBack + rz * kickOut + (Math.random() - 0.5) * 1.4,
            0.72 + Math.random() * 0.75,
            0.34 + Math.random() * 0.28,
            colorHex,
          );
        }

        if (!wet && car.speed > 26 && Math.random() < (car.isPlayer ? 0.55 : 0.2)) {
          this.spawnParticle(
            car.x - fx * 1.8 + rx * 0.82,
            car.y + 0.16,
            car.z - fz * 1.8 + rz * 0.82,
            -fx * car.speed * 0.09 + rx * 0.65,
            0.6 + Math.random() * 0.85,
            -fz * car.speed * 0.09 + rz * 0.65,
            0.34 + (car.speed / 95) * 0.28,
            0.38,
            0xd1d5db,
          );
        }
      }

      // Titanium skid-block sparks + collision/wall sparks
      const emitContactSparks = car.impactIntensity > 0.16;
      if ((!wet && car.skidSparks && Math.random() < (car.isPlayer ? 0.85 : 0.4)) || emitContactSparks) {
        const sparkBurst = emitContactSparks ? 3 : 1;
        for (let sb = 0; sb < sparkBurst; sb++) {
          const rx = -fz * (Math.random() - 0.5) * (emitContactSparks ? 1.3 : 0.5);
          const rz = fx * (Math.random() - 0.5) * (emitContactSparks ? 1.3 : 0.5);
          this.spawnSpark(
            car.x - fx * 1.85 + rx,
            car.y + (emitContactSparks ? 0.35 : 0.12),
            car.z - fz * 1.85 + rz,
            -fx * car.speed * 0.25 + (Math.random() - 0.5) * 3.6,
            0.9 + Math.random() * 2.2,
            -fz * car.speed * 0.25 + (Math.random() - 0.5) * 3.6,
            0.22 + Math.random() * 0.16,
            car.y + 0.05,
          );
        }
      }

      // Exhaust shift flame pop or ERS hot tailpipe flash
      if (car.shiftFlashTimer > 0 && Math.random() < 0.78) {
        const flameColor = car.ersActive ? 0x38bdf8 : Math.random() < 0.5 ? 0xf97316 : 0xfacc15;
        this.spawnExhaustFlame(
          car.x - fx * 2.55,
          car.y + 0.42,
          car.z - fz * 2.55,
          car.vx * 0.85 - fx * 8,
          0.15,
          car.vz * 0.85 - fz * 8,
          car.yaw,
          0.85 + Math.random() * 0.45,
          flameColor,
        );
      }

      // Lay twin asphalt tire skidmarks under lockup, hard slip, or wheelspin
      const isLockup =
        !this.session.config.absEnabled && car.isPlayer && this.lastInputs.brake > 0.72 && car.speed > 24;
      if (!wet && car.onTrack && car.speed > 14 && (car.slipRatio > 0.30 || car.absTriggered || isLockup)) {
        const prevSkid = this.lastSkidPos.get(car.id);
        const distSinceSkid = prevSkid ? Math.hypot(car.x - prevSkid.x, car.z - prevSkid.z) : 99;
        if (distSinceSkid >= 1.2) {
          this.lastSkidPos.set(car.id, { x: car.x, z: car.z });
          const rx = -fz;
          const rz = fx;
          let updatedSkid = false;
          for (const side of [-0.82, 0.82]) {
            const idx = this.skidmarkCursor;
            this.skidmarkCursor = (this.skidmarkCursor + 1) % SKIDMARK_POOL_SIZE;
            _dummyMatrix.position.set(
              car.x - fx * 1.65 + rx * side,
              car.y + 0.042,
              car.z - fz * 1.65 + rz * side,
            );
            _dummyMatrix.rotation.set(car.trackPitch, car.yaw, 0, 'YXZ');
            _dummyMatrix.scale.set(1, 1, 1);
            _dummyMatrix.updateMatrix();
            this.skidmarkMesh.setMatrixAt(idx, _dummyMatrix.matrix);
            updatedSkid = true;
          }
          if (updatedSkid) {
            this.skidmarkMesh.instanceMatrix.needsUpdate = true;
          }
        }
      }
    }

    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        _dummyMatrix.position.set(0, -999, 0);
        _dummyMatrix.rotation.set(0, 0, 0);
        _dummyMatrix.scale.setScalar(0.001);
        _dummyMatrix.updateMatrix();
        this.particleMesh.setMatrixAt(i, _dummyMatrix.matrix);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const t = p.life / p.maxLife;
      const s = p.scale * (0.6 + t * 1.65) * (1 - t * 0.45);
      _dummyMatrix.position.set(p.x, p.y, p.z);
      _dummyMatrix.rotation.set(0, 0, 0);
      _dummyMatrix.scale.setScalar(Math.max(0.01, s));
      _dummyMatrix.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummyMatrix.matrix);
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < SPARK_POOL_SIZE; i++) {
      const sp = this.sparks[i];
      if (!sp.active) continue;
      sp.life += dt;
      if (sp.life >= sp.maxLife) {
        sp.active = false;
        _dummyMatrix.position.set(0, -999, 0);
        _dummyMatrix.rotation.set(0, 0, 0);
        _dummyMatrix.scale.setScalar(0.001);
        _dummyMatrix.updateMatrix();
        this.sparkMesh.setMatrixAt(i, _dummyMatrix.matrix);
        continue;
      }
      sp.vy -= 11.0 * dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.z += sp.vz * dt;
      if (sp.y < sp.floorY && sp.vy < 0) {
        sp.y = sp.floorY;
        sp.vy = -sp.vy * 0.45;
      }
      const t = sp.life / sp.maxLife;
      _dummyMatrix.position.set(sp.x, sp.y, sp.z);
      _dummyMatrix.rotation.set(0, Math.atan2(sp.vx, sp.vz), 0);
      _dummyMatrix.scale.set(1, 1, Math.max(0.15, 1 - t));
      _dummyMatrix.updateMatrix();
      this.sparkMesh.setMatrixAt(i, _dummyMatrix.matrix);
    }
    this.sparkMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < KERB_POOL_SIZE; i++) {
      const kp = this.kerbParticles[i];
      if (!kp.active) continue;
      kp.life += dt;
      if (kp.life >= kp.maxLife) {
        kp.active = false;
        _dummyMatrix.position.set(0, -999, 0);
        _dummyMatrix.rotation.set(0, 0, 0);
        _dummyMatrix.scale.setScalar(0.001);
        _dummyMatrix.updateMatrix();
        this.kerbMesh.setMatrixAt(i, _dummyMatrix.matrix);
        continue;
      }
      kp.vy -= 13.5 * dt;
      kp.x += kp.vx * dt;
      kp.y += kp.vy * dt;
      kp.z += kp.vz * dt;
      kp.rotX = (kp.rotX ?? 0) + 12 * dt;
      kp.rotY = (kp.rotY ?? 0) + 9 * dt;
      const t = kp.life / kp.maxLife;
      const s = kp.scale * (1 - t * 0.65);
      _dummyMatrix.position.set(kp.x, kp.y, kp.z);
      _dummyMatrix.rotation.set(kp.rotX, kp.rotY, 0);
      _dummyMatrix.scale.setScalar(Math.max(0.05, s));
      _dummyMatrix.updateMatrix();
      this.kerbMesh.setMatrixAt(i, _dummyMatrix.matrix);
    }
    this.kerbMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < EXHAUST_POOL_SIZE; i++) {
      const ex = this.exhaustFlames[i];
      if (!ex.active) continue;
      ex.life += dt;
      if (ex.life >= ex.maxLife) {
        ex.active = false;
        _dummyMatrix.position.set(0, -999, 0);
        _dummyMatrix.rotation.set(0, 0, 0);
        _dummyMatrix.scale.setScalar(0.001);
        _dummyMatrix.updateMatrix();
        this.exhaustMesh.setMatrixAt(i, _dummyMatrix.matrix);
        continue;
      }
      ex.x += ex.vx * dt;
      ex.y += ex.vy * dt;
      ex.z += ex.vz * dt;
      const t = ex.life / ex.maxLife;
      const s = ex.scale * (1 - t * 0.75);
      _dummyMatrix.position.set(ex.x, ex.y, ex.z);
      _dummyMatrix.rotation.set(0, ex.yaw, 0);
      _dummyMatrix.scale.set(s, s, s * (1 + t * 0.6));
      _dummyMatrix.updateMatrix();
      this.exhaustMesh.setMatrixAt(i, _dummyMatrix.matrix);
    }
    this.exhaustMesh.instanceMatrix.needsUpdate = true;

    if (wet && this.rainMesh.visible) {
      const cx = this.camera.position.x;
      const cy = this.camera.position.y;
      const cz = this.camera.position.z;
      for (let i = 0; i < RAIN_COUNT; i++) {
        const drop = this.rainDrops[i];
        drop.y -= drop.speed * dt;
        if (drop.y < -4) {
          drop.y = 22 + Math.random() * 8;
        }
        _dummyMatrix.position.set(cx + drop.x, cy - 6 + drop.y, cz + drop.z);
        _dummyMatrix.rotation.set(0.08, 0, 0.04);
        _dummyMatrix.scale.setScalar(1);
        _dummyMatrix.updateMatrix();
        this.rainMesh.setMatrixAt(i, _dummyMatrix.matrix);
      }
      this.rainMesh.instanceMatrix.needsUpdate = true;
    }

    if (this.particleColorDirty && this.particleMesh.instanceColor) {
      this.particleMesh.instanceColor.needsUpdate = true;
      this.particleColorDirty = false;
    }
    if (this.kerbColorDirty && this.kerbMesh.instanceColor) {
      this.kerbMesh.instanceColor.needsUpdate = true;
      this.kerbColorDirty = false;
    }
    if (this.exhaustColorDirty && this.exhaustMesh.instanceColor) {
      this.exhaustMesh.instanceColor.needsUpdate = true;
      this.exhaustColorDirty = false;
    }
  }

  private sync3DVisuals(dt: number, alpha = 1): void {
    const wet = this.session.config.weather === 'wet';
    const timeSec = this.simTimeSec;
    this.env.setWeatherTime(timeSec);

    this.interpolateCars(alpha);

    // 1. FIA Gantry 5 Red Lights
    for (let i = 0; i < this.env.gantryLights.length; i++) {
      const mat = this.env.gantryLights[i].material as THREE.MeshStandardMaterial;
      const lit = this.session.phase === 'countdown' && i < this.session.countdownLights;
      mat.emissiveIntensity = lit ? 3.2 : 0.05;
      mat.color.setHex(lit ? 0xef4444 : 0x3f1010);
    }

    this.env.syncScenery(this.session.scenery);

    // 2. Sync active F1 Car 3D Groups using interpolated 180 Hz -> display frames (player maps to slot 9)
    for (let i = 0; i < this.interpCarStates.length; i++) {
      const car = this.interpCarStates[i];
      const visIdx = car.isPlayer ? this.carVisuals.length - 1 : i;
      const vis = this.carVisuals[visIdx];
      if (!vis) continue;
      if (!car.isPlayer && this.rivalGrid?.handles(visIdx)) {
        vis.root.visible = false;
        continue;
      }
      vis.root.visible = true;
      vis.root.position.set(car.x, car.y, car.z);
      vis.root.rotation.y = car.yaw;
      vis.root.rotation.x = car.trackPitch;
      vis.root.rotation.z = car.trackBank;

      vis.bodyGroup.rotation.x = car.pitch;
      vis.bodyGroup.rotation.z = car.roll;

      vis.frontLeftSteering.rotation.y = car.steerAngle;
      vis.frontRightSteering.rotation.y = car.steerAngle;
      for (const w of vis.wheels) {
        w.rotation.x = car.wheelSpin;
      }

      const wheelOmega = (car.speed / (car.geometry?.wheelRadiusM ?? WHEEL_RADIUS)) * (car.forwardSpeed >= -0.2 ? 1 : -1);
      vis.setWheelMotionBlur(wheelOmega);
      vis.updateSuspension(car.pitch, car.roll, car.steerAngle);
      vis.setDamage(car.frontAeroDamage ?? 0, car.rearAeroDamage ?? 0);

      const glow = car.brakeTemp > 0.22 ? Math.pow((car.brakeTemp - 0.22) / 0.78, 1.3) * 3.4 : 0;
      for (const dm of vis.brakeDiscMats) {
        dm.emissiveIntensity = glow;
      }

      if (vis.updateActiveAero) vis.updateActiveAero(car.drsActive,dt);
      else {
        const targetFlapRot = car.drsActive ? 0.04 : 0.42;
        vis.drsFlap.rotation.x = THREE.MathUtils.damp(vis.drsFlap.rotation.x, targetFlapRot, 18, dt);
      }

      const blink = wet || (!car.ersActive && this.lastInputs.brake > 0.2);
      vis.rainLightMat.emissiveIntensity = blink && Math.sin(timeSec * 18) > 0 ? 2.6 : 0.25;

      if (car.isPlayer) {
        vis.setHelmetVisible(this.session.activeCamera !== 'cockpit');
        const rpmRatio = Math.max(0, (car.rpm - 7200) / (MAX_RPM - 7200));
        const litLeds = Math.round(rpmRatio * vis.steeringShiftLeds.length);
        for (let l = 0; l < vis.steeringShiftLeds.length; l++) {
          vis.steeringShiftLeds[l].visible = l < litLeds;
        }
        // Interactive F1 steering wheel rotation synchronized with steerAngle (+steer = left turn = negative Z rot)
        const targetWheelZ = -car.steerAngle * 3.1;
        vis.steeringWheelGroup.rotation.z = THREE.MathUtils.damp(
          vis.steeringWheelGroup.rotation.z,
          targetWheelZ,
          24,
          dt,
        );

        const isCockpitOrTcam =
          this.session.activeCamera === 'cockpit' || this.session.activeCamera === 'tcam';
        const nowMs = performance.now();
        if (isCockpitOrTcam && nowMs - this.lastWheelScreenMs >= 66) {
          this.lastWheelScreenMs = nowMs;
          vis.updateSteeringTelemetry(
            car.gear,
            Math.round(car.speed * 3.6),
            car.rpm,
            MAX_RPM,
            car.ersCharge,
            car.ersActive,
            car.drsActive,
            car.drsEligible,
          );
        }
      } else {
        vis.setHelmetVisible(true);
      }
    }

    // 2B. Sync Holographic Ghost Car in Time Trial (velocity-coupled wheel spin)
    if (
      this.session.phase === 'playing' &&
      this.session.config.mode === 'timetrial' &&
      this.session.ghostPose
    ) {
      const gp = this.session.ghostPose;
      this.ghostVisual.root.visible = true;
      this.ghostVisual.root.position.set(gp.x, gp.y, gp.z);
      this.ghostVisual.root.rotation.y = gp.yaw;
      this.ghostVisual.root.rotation.x = gp.pitch;
      this.ghostVisual.drsFlap.rotation.x = gp.drsActive ? 0.04 : 0.42;
      const ghostOmega = (gp.speed ?? 55) / WHEEL_RADIUS;
      for (const w of this.ghostVisual.wheels) {
        w.rotation.x += ghostOmega * dt;
      }
    } else {
      this.ghostVisual.root.visible = false;
    }

    // 3. Follow interpolated player car with tight shadow frustum
    const playerCar = this.interpCarStates[this.session.playerIndex] ?? this.session.cars[this.session.playerIndex];
    _sunTargetVec.set(playerCar.x, playerCar.y, playerCar.z);
    this.sunLight.target.position.copy(_sunTargetVec);
    this.sunLight.position.set(playerCar.x + 85, playerCar.y + 115, playerCar.z + 60);

    // 4. Update Camera Rig (circuit-aware for TV Trackside Towers & Title Flyover)
    if (this.session.phase === 'title') {
      this.cameraRig.updateTitleFlyover(this.camera, dt, this.session.track);
    } else {
      const playerVisual = this.carVisuals[this.carVisuals.length - 1];
      this.cameraRig.updateGameplayCamera(
        this.camera,
        this.session.activeCamera,
        playerCar,
        playerVisual,
        dt,
        false,
        this.session.track,
        this.simTimeSec,
        this.session.config.cockpitFov ?? 76,
        this.session.config.horizonLock ?? 0.72,
      );
    }

    this.rivalGrid?.update(this.interpCarStates, this.camera);

    // 5. Update Speed-Scaled Motion Blur & Peripheral Air Streaks
    const targetBlur =
      this.session.phase === 'playing'
        ? computeMotionBlurIntensity(playerCar.speed, this.session.activeCamera)
        : 0;
    this.smoothedBlur = THREE.MathUtils.damp(this.smoothedBlur, targetBlur, 10, dt);

    if (this.motionBlurPass) {
      this.motionBlurPass.uniforms['uIntensity'].value = this.smoothedBlur;
    }

    if (this.smoothedBlur > 0.06 && this.session.phase === 'playing') {
      this.speedStreakMesh.visible = true;
      this.speedStreakMat.opacity = Math.min(0.16, this.smoothedBlur * 0.16);
      const streamSpeed = 14 + playerCar.speed * 0.72;
      const streakLen = 0.75 + this.smoothedBlur * 1.7;
      for (let i = 0; i < SPEED_STREAK_COUNT; i++) {
        const st = this.speedStreaks[i];
        st.z += streamSpeed * st.speedMult * dt;
        if (st.z > 0.4) {
          st.z = -14.5 - (i % 5) * 0.6;
        }
        const depth = Math.max(1.5, -st.z);
        const lx = Math.cos(st.angle) * st.radius * 0.22 * depth;
        const ly = Math.sin(st.angle) * st.radius * 0.14 * depth;
        _streakOffset.set(lx, ly, st.z).applyQuaternion(this.camera.quaternion);
        _dummyMatrix.position.copy(this.camera.position).add(_streakOffset);
        _dummyMatrix.quaternion.copy(this.camera.quaternion);
        _dummyMatrix.scale.set(1, 1, streakLen);
        _dummyMatrix.updateMatrix();
        this.speedStreakMesh.setMatrixAt(i, _dummyMatrix.matrix);
      }
      this.speedStreakMesh.instanceMatrix.needsUpdate = true;
    } else {
      this.speedStreakMesh.visible = false;
    }
  }

  private renderScene(): void {
    if (this.composer && !this.isSoftwareGl && this.smoothedBlur > 0.025) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private pushTelemetry(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastHudPushMs < 80) return; // <= 12.5 Hz HUD updates
    this.lastHudPushMs = now;
    const snapshot = buildTelemetrySnapshot(this.session, this.lastInputs);
    snapshot.loadingProgress = this.modelsSettled ? 1 : this.preparedStages / 4;
    snapshot.preparingGrid = this.session.phase === 'countdown' && (!this.modelsSettled || now < this.gridHoldUntil);
    this.onTelemetry(snapshot);
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (gl && typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private tick = (): void => {
    if (this.disposed) return;

    const nowMs = performance.now();
    const rawDt = (nowMs - this.lastTimeMs) / 1000;
    this.lastTimeMs = nowMs;
    const dt = this.debugFrozen ? 0 : Math.min(Math.max(rawDt, 0.001), 0.05);

    const prevPhase = this.session.phase;
    const playerInputs = this.samplePlayerInputs();

    // Real-time fixed 180 Hz, bounded recovery after a stall; interpolate display frames.
    this.pendingDrsToggle ||= playerInputs.drsToggleJustPressed;
    const preparingGrid = this.session.phase === 'countdown' && (!this.modelsSettled || nowMs < this.gridHoldUntil);
    const stepCount = this.debugFrozen || preparingGrid ? 0 : this.physicsClock.advance(Math.max(0, rawDt));
    if (this.session.phase !== 'paused') this.simTimeSec += stepCount * PHYSICS_DT;
    let lightChangedTo: number | null = null;
    let lightsOut = false;
    let newRecord = false;
    for (let stepIndex = 0; stepIndex < stepCount; stepIndex++) {
      this.copyCarsInto(this.session.cars, this.prevCarStates);
      playerInputs.drsToggleJustPressed = stepIndex === 0 && this.pendingDrsToggle;
      const canDrive = this.session.phase === 'playing' || this.session.phase === 'countdown';
      playerInputs.ignitionToggleJustPressed = canDrive && this.pendingIgnition;
      playerInputs.shiftUpJustPressed = canDrive && this.pendingUp;
      playerInputs.shiftDownJustPressed = canDrive && this.pendingDown;
      if(canDrive){this.pendingIgnition=false;this.pendingUp=false;this.pendingDown=false;}
      const res = stepRaceSession(this.session, playerInputs, PHYSICS_DT);
      if (res.lightChangedTo !== null) lightChangedTo = res.lightChangedTo;
      if (res.lightsOutJustTriggered) lightsOut = true;
      if (res.newRecordAchieved) newRecord = true;

    }

    if (stepCount > 0) this.pendingDrsToggle = false;
    const interpAlpha = this.debugFrozen ? 1 : this.physicsClock.alpha;

    if (lightChangedTo !== null) this.audio.playCountdownBeep(false);
    if (lightsOut) this.audio.playCountdownBeep(true, this.session.config.mode !== 'timetrial');
    if (newRecord) this.audio.playRecordChime();

    if (this.session.phase !== prevPhase || newRecord) {
      this.syncBodyState();
      this.pushTelemetry(true);
    } else {
      this.pushTelemetry(false);
    }

    // Update Recorded Web Audio Engine (with 3D spatial rival Doppler) & Controller Haptic Rumble
    const playerCar = this.session.cars[this.session.playerIndex];
    const audioActive =
      this.session.phase === 'countdown' || this.session.phase === 'playing';
    const isOnboard =
      this.session.activeCamera === 'cockpit' || this.session.activeCamera === 'tcam';

    this.camera.getWorldDirection(_camFwdVec);
    let rivalCount = 0;
    for (let i = 0; i < this.session.cars.length && rivalCount < _rivalAudioSlots.length; i++) {
      const c = this.session.cars[i];
      if (c.isPlayer) continue;
      const slot = _rivalAudioSlots[rivalCount++];
      slot.x = c.x;
      slot.y = c.y;
      slot.z = c.z;
      slot.vx = c.vx;
      slot.vz = c.vz;
      slot.modelId = rosterModels[c.teamName];
      slot.gear = c.gear;
      slot.rpm = c.rpm;
      slot.throttle = c.speed > 10 ? 0.82 : 0.25;
    }

    this.audio.update({
      modelId: this.vehicleStudy?.id,
      active: audioActive,
      crowdSources: this.env.crowdSources,
      contacts: wheelContacts(playerCar, this.session.track, undefined, this.wheelAudioContacts),
      engineRunning: playerCar.engineRunning,
      rpm: playerCar.rpm,
      gear: playerCar.gear,
      throttle: playerInputs.throttle,
      brake: playerInputs.brake,
      speedMs: playerCar.speed,
      slipRatio: playerCar.slipRatio,
      ersActive: playerCar.ersActive,
      onKerb: playerCar.onKerb,
      onTrack: playerCar.onTrack,
      wet: this.session.config.weather === 'wet',
      isOnboard,
      drsActive: playerCar.drsActive,
      skidSparks: playerCar.skidSparks,
      absTriggered: playerCar.absTriggered,
      tcTriggered: playerCar.tcTriggered,
      brakeTemp: playerCar.brakeTemp,
      impactIntensity: playerCar.impactIntensity,
      playerPos: { x: playerCar.x, y: playerCar.y, z: playerCar.z },
      playerVel: { vx: playerCar.vx, vz: playerCar.vz },
      cameraPos: this.camera.position,
      cameraForward: _camFwdVec,
      cameraUp: _camUpVec,
      rivals: rivalCount > 0 ? _rivalAudioSlots.slice(0, rivalCount) : undefined,
    });

    if (this.session.phase === 'playing' && this.session.gamepadConnected) {
      if (playerCar.impactIntensity > 0.16) {
        this.triggerGamepadRumble(playerCar.impactIntensity * 0.7, playerCar.impactIntensity * 0.95, 110);
      } else if (playerCar.onKerb && playerCar.speed > 12) {
        this.triggerGamepadRumble(0.32, 0.18, 65);
      } else if (playerCar.absTriggered) {
        this.triggerGamepadRumble(0.24, 0.10, 55);
      } else if (!playerCar.onTrack && playerCar.speed > 14) {
        this.triggerGamepadRumble(0.28, 0.22, 70);
      }
    }

    if (!this.debugFrozen && this.session.phase !== 'paused') {
      this.updateParticles(dt);
    }

    if (!preparingGrid) {
      this.sync3DVisuals(dt, interpAlpha);
      if (!this.contextLost) this.renderScene();
    }

    this.fpsFrames++;
    if (nowMs - this.fpsLastSampleMs >= 250) {
      this.currentFps = Math.round((this.fpsFrames * 1000) / Math.max(1, nowMs - this.fpsLastSampleMs));
      this.fpsFrames = 0;
      this.fpsLastSampleMs = nowMs;
      if (this.debugOverlayVisible && this.debugOverlayEl) {
        const info = this.renderer.info.render;
        this.debugOverlayEl.textContent =
          `${this.currentFps} FPS · física ${PHYSICS_HZ} Hz · descarte ${this.physicsClock.droppedSeconds.toFixed(2)}s · ${info.calls} draws · ${(info.triangles / 1000).toFixed(1)}k tris · ${this.session.track.id} · ${this.session.activeCamera}`;
      }
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    window.removeEventListener('gamepadconnected', this.handleGamepadChange);
    window.removeEventListener('gamepaddisconnected', this.handleGamepadChange);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.resizeObserver.disconnect();

    if (this.debugOverlayEl && this.debugOverlayEl.parentElement === this.container) {
      this.container.removeChild(this.debugOverlayEl);
    }
    delete (window as unknown as Record<string, unknown>).__f1Debug;

    delete (window as any).interlagosDriving;
    delete (window as any).interlagosPilot;
    this.audio.dispose();
    this.textures.dispose();
    this.env.dispose();
    this.pmremTex?.dispose();
    this.rivalGrid?.dispose();
    for (const vis of this.carVisuals) vis.dispose();
    this.ghostVisual.dispose();
    this.particleMesh.geometry.dispose();
    (this.particleMesh.material as THREE.Material).dispose();
    this.sparkMesh.geometry.dispose();
    (this.sparkMesh.material as THREE.Material).dispose();
    this.kerbMesh.geometry.dispose();
    (this.kerbMesh.material as THREE.Material).dispose();
    this.exhaustMesh.geometry.dispose();
    (this.exhaustMesh.material as THREE.Material).dispose();
    this.skidmarkMesh.geometry.dispose();
    (this.skidmarkMesh.material as THREE.Material).dispose();
    this.speedStreakMesh.geometry.dispose();
    this.speedStreakMat.dispose();
    this.rainMesh.geometry.dispose();
    (this.rainMesh.material as THREE.Material).dispose();
    this.motionBlurPass?.dispose();
    this.outputPass?.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

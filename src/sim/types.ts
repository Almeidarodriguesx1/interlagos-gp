export type GamePhase = 'title' | 'countdown' | 'playing' | 'paused' | 'gameover';

export type CameraMode = 'cockpit' | 'tcam' | 'chase' | 'trackside' | 'helicopter';

export type WeatherCondition = 'dry' | 'wet';

export type TrackId = 'interlagos' | 'monza' | 'spa';

export type DifficultyLevel = 'iniciante' | 'competitivo' | 'pro' | 'lendario';

export type RaceMode = 'race' | 'timetrial' | 'practice';

export interface RaceConfig {
  playerVehicle?: import('./vehicleStudies').VehicleStudyConfig;
  startEngineOff?: boolean;
  manualTransmission?: boolean;
  trackId?: TrackId;
  mode?: RaceMode;
  difficulty?: DifficultyLevel;
  teamId?: string;
  totalLaps: number;
  weather: WeatherCondition;
  absEnabled: boolean;
  tcEnabled: boolean;
  racingLineEnabled: boolean;
  tireWearEnabled?: boolean;
  cockpitFov?: number; // degrees (68..86), default 76
  horizonLock?: number; // 0..1 horizon stability (1 = locked level, 0 = locked to chassis), default 0.72
}

export interface GhostSample {
  time: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  drsActive: boolean;
  speed?: number;
}

export interface GhostLapData {
  trackId: TrackId;
  weather: WeatherCondition;
  lapTime: number;
  samples: GhostSample[];
}

export interface ControlInputs {
  ignitionToggleJustPressed?: boolean;
  shiftUpJustPressed?: boolean;
  shiftDownJustPressed?: boolean;
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1 (right) .. +1 (left)
  ersBoost: boolean;
  drsToggleJustPressed: boolean;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface TrackSample {
  index: number;
  s: number; // meters along track [0, totalLength)
  tNorm: number; // [0, 1)
  pos: Vec3;
  tangent: Vec3; // unit forward vector
  right: Vec3; // unit surface right vector (tilted by banking)
  up: Vec3; // unit surface normal vector
  widthLeft: number;
  widthRight: number;
  curvature: number; // signed horizontal curvature (1/m), + = left, - = right
  absCurvature: number;
  drivingCurvature: number; // geometric curvature for driving only, separate from legacy visual authoring
  grade: number; // dy/ds
  bank: number; // track camber radians (+ = left inside lower / right outside higher)
  sector: 1 | 2 | 3;
  drsZone: 0 | 1 | 2;
  drsDetection: 0 | 1 | 2;
  kerbLeft: boolean;
  kerbRight: boolean;
  cornerName: string;
  racingLineOffset: number;
  racingLinePhase: 'accel' | 'coast' | 'brake';
}

export interface TrackProjection {
  apronWidth?: number;
  sampleIndex: number;
  s: number;
  tNorm: number;
  lateralOffset: number; // positive = right of centerline, negative = left
  nearestPoint: Vec3;
  tangent: Vec3;
  right: Vec3;
  up: Vec3;
  elevation: number;
  grade: number;
  bank: number;
  sector: 1 | 2 | 3;
  drsZone: 0 | 1 | 2;
  drsDetection: 0 | 1 | 2;
  widthLeft: number;
  widthRight: number;
  onTrack: boolean;
  onKerb: boolean;
  cornerName: string;
}

export interface TracksideCameraTower {
  id: number;
  name: string;
  sCenter: number;
  pos: Vec3;
  minFov: number;
  maxFov: number;
}

export interface CarState {
  geometry?: import('./vehicleGeometry').VehicleGeometry;
  id: string;
  name: string;
  shortCode: string;
  teamName: string;
  primaryColor: string;
  accentColor: string;
  helmetColor: string;
  number: number;
  isPlayer: boolean;

  // Spatial state
  x: number;
  y: number;
  z: number;
  yaw: number; // radians, 0 = +Z, +yaw turns left (+X when sin(yaw)) -> forward = (sin(yaw), 0, cos(yaw))
  vx: number; // world velocity X (m/s)
  vz: number; // world velocity Z (m/s)
  speed: number; // m/s scalar
  forwardSpeed: number; // m/s along car nose
  lateralSpeed: number; // m/s sideways
  yawRate: number; // rad/s
  steerAngle: number; // front wheel angle (radians)
  pitch: number; // visual suspension dive/squat
  roll: number; // visual body roll
  trackPitch: number; // visual track elevation slope alignment (radians)
  trackBank: number; // visual track banking camber alignment (radians)

  // Powertrain & chassis
  frontAeroDamage?: number; // 0..1; empirical impact damage, not structural simulation
  rearAeroDamage?: number;
  lapValid?: boolean;
  engineRunning: boolean;
  engineStartTimer: number;
  manualTransmission: boolean;
  gear: number; // -1 = R, 0 = N, 1..8
  rpm: number; // 3500..13000
  ersCharge: number; // 0..100 (%)
  ersActive: boolean;
  drsEligible: boolean;
  drsActive: boolean;
  drsArmedZone: 0 | 1 | 2;
  absTriggered: boolean;
  tcTriggered: boolean;
  slipstreamActive: boolean;
  brakeTemp: number; // 0..1 normalized rotor heat
  skidSparks: boolean; // titanium skid-block bottoming sparks
  wheelSpin: number; // accumulated wheel rotation rad
  slipRatio: number; // 0..1+ for audio & smoke
  tireTempFront: number; // °C front axle core temperature
  tireTempRear: number; // °C rear axle core temperature
  tireWear: number; // 1.0 fresh -> 0.15 worn out
  onTrack: boolean;
  onKerb: boolean;
  offTrackTime: number;
  impactIntensity: number; // transient collision/wall scrape intensity (0..1)
  shiftFlashTimer: number; // transient exhaust pop/flame timer (seconds)

  // Race progress
  trackIndex: number;
  s: number;
  tNorm: number;
  lateralOffset: number;
  brakeHeldFromMotion?: boolean;
  reverseHoldTime: number;
  lap: number; // 1-based current lap (0 before crossing start on formation/launch)
  totalProgress: number; // lap + tNorm (monotonic progress metric)
  sector: 1 | 2 | 3;
  lapStartTime: number;
  sectorStartTime: number;
  currentLapTime: number;
  lastLapTime: number | null;
  bestLapTime: number | null;
  sectorTimes: [number | null, number | null, number | null];
  finished: boolean;
  finishTime: number | null;
  position: number;

  // AI parameters
  aiSkill: number;
  aiAggression: number;
  aiPreferredOffset: number;
  aiTargetOffset: number;
}

export interface RaceStanding {
  id: string;
  name: string;
  shortCode: string;
  teamName: string;
  primaryColor: string;
  position: number;
  lap: number;
  gapSeconds: number;
  bestLapTime: number | null;
  lastLapTime: number | null;
  isPlayer: boolean;
  finished: boolean;
}

export interface TelemetrySnapshot {
  phase: GamePhase;
  trackId: TrackId;
  trackName: string;
  mode: RaceMode;
  difficulty: DifficultyLevel;
  loadingProgress?: number;
  preparingGrid?: boolean;
  countdownLights: number; // 0..5 during countdown
  countdownGoFlash: boolean;
  raceTime: number;
  totalLaps: number;
  weather: WeatherCondition;
  absEnabled: boolean;
  tcEnabled: boolean;
  racingLineEnabled: boolean;
  tireWearEnabled: boolean;
  ghostActive: boolean;
  activeCamera: CameraMode;
  cockpitFov: number;
  horizonLock: number;
  muted: boolean;
  gamepadConnected: boolean;
  gamepadName: string | null;
  personalRecordTime: number | null;
  liveDeltaSeconds: number | null;
  newRecordBannerTimer: number;
  player: {
    speedKmh: number;
    gear: number;
    rpm: number;
    maxRpm: number;
    throttle: number;
    brake: number;
    ersCharge: number;
    ersActive: boolean;
    drsEligible: boolean;
    drsActive: boolean;
    absTriggered: boolean;
    tcTriggered: boolean;
    slipstreamActive: boolean;
    brakeTemp: number;
    tireTempFront: number;
    tireTempRear: number;
    tireWearPct: number;
    frontAeroDamagePct: number;
    rearAeroDamagePct: number;
    onTrack: boolean;
    lap: number;
    position: number;
    totalCars: number;
    currentLapTime: number;
    lastLapTime: number | null;
    bestLapTime: number | null;
    sector: 1 | 2 | 3;
    sectorTimes: [number | null, number | null, number | null];
    cornerName: string;
    brakingCue: boolean;
    motionBlurIntensity: number;
  };
  standings: RaceStanding[];
  minimapCars: Array<{
    id: string;
    x: number;
    z: number;
    color: string;
    isPlayer: boolean;
  }>;
  fastestLap: {
    driverName: string;
    time: number;
  } | null;
}

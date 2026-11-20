import { createSceneryWorld, stepScenery, type SceneryWorld } from './scenery';
import { studyFromConfig, type VehicleStudyConfig } from './vehicleStudies';
import { computeAiInputs } from './ai';
import {
  createGhostRecorder,
  finalizeGhostLap,
  recordGhostFrame,
  sampleGhostPose,
  type GhostRecorder,
} from './ghost';
import {
  computeCornerBrakingCue,
  computeMotionBlurIntensity,
  computeSlipstreamIntensity,
  IDLE_RPM,
  MAX_RPM,
  resolveCarCollisions,
  stepVehiclePhysics,
} from './physics';
import { getSampleAtDistance, getTrack, INTERLAGOS_TRACK, type TrackData } from './track';
import type {
  CameraMode,
  CarState,
  ControlInputs,
  DifficultyLevel,
  GamePhase,
  GhostLapData,
  GhostSample,
  RaceConfig,
  RaceMode,
  RaceStanding,
  TelemetrySnapshot,
  TrackId,
} from './types';

import {gridRoster} from './grid2026';

export interface DriverRosterEntry {
  id: string;
  name: string;
  shortCode: string;
  teamName: string;
  primaryColor: string;
  accentColor: string;
  helmetColor: string;
  number: number;
  aiSkill: number;
  aiAggression: number;
}

export const DRIVER_ROSTER: DriverRosterEntry[] = [
  {
    id: 'ai-1',
    name: 'M. Verstappen',
    shortCode: 'VER',
    teamName: 'Oracle Racing',
    primaryColor: '#1e3a8a',
    accentColor: '#facc15',
    helmetColor: '#f8fafc',
    number: 1,
    aiSkill: 0.99,
    aiAggression: 0.92,
  },
  {
    id: 'ai-2',
    name: 'C. Leclerc',
    shortCode: 'LEC',
    teamName: 'Scuderia Rosso',
    primaryColor: '#dc2626',
    accentColor: '#f8fafc',
    helmetColor: '#ef4444',
    number: 16,
    aiSkill: 0.975,
    aiAggression: 0.88,
  },
  {
    id: 'ai-3',
    name: 'L. Norris',
    shortCode: 'NOR',
    teamName: 'Papaya GP',
    primaryColor: '#f97316',
    accentColor: '#0f172a',
    helmetColor: '#a3e635',
    number: 4,
    aiSkill: 0.97,
    aiAggression: 0.85,
  },
  {
    id: 'ai-4',
    name: 'L. Hamilton',
    shortCode: 'HAM',
    teamName: 'Silver Arrows',
    primaryColor: '#b91c1c',
    accentColor: '#facc15',
    helmetColor: '#facc15',
    number: 44,
    aiSkill: 0.965,
    aiAggression: 0.84,
  },
  {
    id: 'ai-5',
    name: 'G. Russell',
    shortCode: 'RUS',
    teamName: 'Silver Arrows',
    primaryColor: '#334155',
    accentColor: '#06b6d4',
    helmetColor: '#38bdf8',
    number: 63,
    aiSkill: 0.955,
    aiAggression: 0.80,
  },
  {
    id: 'ai-6',
    name: 'O. Piastri',
    shortCode: 'PIA',
    teamName: 'Papaya GP',
    primaryColor: '#ea580c',
    accentColor: '#1e293b',
    helmetColor: '#f8fafc',
    number: 81,
    aiSkill: 0.95,
    aiAggression: 0.78,
  },
  {
    id: 'ai-7',
    name: 'G. Bortoleto',
    shortCode: 'BOR',
    teamName: 'Sauber Verde',
    primaryColor: '#16a34a',
    accentColor: '#09090b',
    helmetColor: '#facc15',
    number: 5,
    aiSkill: 0.94,
    aiAggression: 0.82,
  },
  {
    id: 'ai-8',
    name: 'F. Alonso',
    shortCode: 'ALO',
    teamName: 'Emerald Aston',
    primaryColor: '#047857',
    accentColor: '#bef264',
    helmetColor: '#0ea5e9',
    number: 14,
    aiSkill: 0.935,
    aiAggression: 0.86,
  },
  {
    id: 'ai-9',
    name: 'K. Antonelli',
    shortCode: 'ANT',
    teamName: 'Trident Works',
    primaryColor: '#1d4ed8',
    accentColor: '#38bdf8',
    helmetColor: '#e2e8f0',
    number: 12,
    aiSkill: 0.925,
    aiAggression: 0.80,
  },
  {
    id: 'player',
    name: 'Você (Brasil GP)',
    shortCode: 'BRA',
    teamName: 'Auriverde F1',
    primaryColor: '#059669',
    accentColor: '#facc15',
    helmetColor: '#facc15',
    number: 27,
    aiSkill: 1.0,
    aiAggression: 1.0,
  },
];

const CHECKPOINT_BINS = 50;

export interface RaceSession {
  phase: GamePhase;
  config: RaceConfig & {
    trackId: TrackId;
    mode: RaceMode;
    difficulty: DifficultyLevel;
    tireWearEnabled: boolean;
  };
  track: TrackData;
  scenery: SceneryWorld;
  cars: CarState[];
  playerIndex: number;
  raceTime: number;
  countdownTimer: number;
  countdownLights: number;
  countdownGoFlash: boolean;
  goFlashTimer: number;
  activeCamera: CameraMode;
  muted: boolean;
  gamepadConnected: boolean;
  gamepadName: string | null;
  personalRecordTime: number | null;
  newRecordBannerTimer: number;
  currentLapBins: number[];
  bestLapBins: number[] | null;
  ghostRecorder: GhostRecorder;
  bestGhostLap: GhostLapData | null;
  ghostPose: GhostSample | null;
  fastestLap: { driverName: string; time: number } | null;
}

export interface PlayerTeamPreset {
  id: string;
  teamName: string;
  shortCode: string;
  driverLabel: string;
  primaryColor: string;
  accentColor: string;
  helmetColor: string;
  number: number;
}

export const PLAYER_TEAMS: PlayerTeamPreset[] = [
  {
    id: 'auriverde',
    teamName: 'Auriverde F1',
    shortCode: 'BRA',
    driverLabel: 'Você (Brasil GP)',
    primaryColor: '#059669',
    accentColor: '#facc15',
    helmetColor: '#facc15',
    number: 27,
  },
  {
    id: 'oracle',
    teamName: 'Oracle Racing',
    shortCode: 'RBR',
    driverLabel: 'Você (Oracle)',
    primaryColor: '#1e3a8a',
    accentColor: '#facc15',
    helmetColor: '#f8fafc',
    number: 1,
  },
  {
    id: 'ferrari',
    teamName: 'Scuderia Rosso',
    shortCode: 'FER',
    driverLabel: 'Você (Rosso)',
    primaryColor: '#dc2626',
    accentColor: '#f8fafc',
    helmetColor: '#ef4444',
    number: 16,
  },
  {
    id: 'mclaren',
    teamName: 'Papaya GP',
    shortCode: 'MCL',
    driverLabel: 'Você (Papaya)',
    primaryColor: '#f97316',
    accentColor: '#0f172a',
    helmetColor: '#a3e635',
    number: 4,
  },
  {
    id: 'mercedes',
    teamName: 'Silver Arrows',
    shortCode: 'MER',
    driverLabel: 'Você (Silver)',
    primaryColor: '#334155',
    accentColor: '#06b6d4',
    helmetColor: '#38bdf8',
    number: 63,
  },
  {
    id: 'aston',
    teamName: 'Emerald Aston',
    shortCode: 'AMR',
    driverLabel: 'Você (Emerald)',
    primaryColor: '#047857',
    accentColor: '#bef264',
    helmetColor: '#0ea5e9',
    number: 14,
  },
  {
    id: 'sauber',
    teamName: 'Sauber Verde',
    shortCode: 'SAU',
    driverLabel: 'Você (Sauber)',
    primaryColor: '#16a34a',
    accentColor: '#09090b',
    helmetColor: '#facc15',
    number: 5,
  },
  {
    id: 'trident',
    teamName: 'Trident Works',
    shortCode: 'TRI',
    driverLabel: 'Você (Trident)',
    primaryColor: '#1d4ed8',
    accentColor: '#38bdf8',
    helmetColor: '#e2e8f0',
    number: 12,
  },
];

export function getPlayerTeamPreset(teamId?: string): PlayerTeamPreset {
  return PLAYER_TEAMS.find((t) => t.id === teamId) ?? PLAYER_TEAMS[0];
}

export function createGridCars(
  track: TrackData = INTERLAGOS_TRACK,
  mode: RaceMode = 'race',
  teamId?: string,
  playerVehicle?: VehicleStudyConfig,
  passDemo = false,
): CarState[] {
  const cars: CarState[] = [];
  const study = studyFromConfig(playerVehicle);
  const team = study ? {...getPlayerTeamPreset(study.teamId), number:study.number, shortCode:study.shortCode, teamName:study.label.split(' · ')[0]} : getPlayerTeamPreset(teamId);
  const reserveNumbers = [2, 22, 23, 30, 31, 50, 77, 88, 99];
  const usedNumbers = new Set<number>([team.number]);

  const season = study && !passDemo ? gridRoster(study.id, study.number) : undefined;
  const entries = season ? (mode !== "race" ? season.slice(-1) : season) :
    mode !== 'race'
      ? DRIVER_ROSTER.filter((e) => e.id === 'player')
      : passDemo ? DRIVER_ROSTER.filter(e => ['ai-1','ai-2','player'].includes(e.id)) : DRIVER_ROSTER;

  for (let slot = 0; slot < entries.length; slot++) {
    const entry = entries[slot];
    const isPlayer = entry.id === 'player';
    let carNumber = isPlayer ? team.number : entry.number;
    if (!isPlayer) {
      if (usedNumbers.has(carNumber)) {
        carNumber = reserveNumbers.find((n) => !usedNumbers.has(n)) ?? 99;
      }
      usedNumbers.add(carNumber);
    }

    // In Time Trial, start ~175m before finish line so player reaches flying lap speed cleanly
    const sBack = passDemo ? [145, 85, 30][slot] : mode !== 'race' ? 175 : 14 + slot * 9.5;
    const sample = getSampleAtDistance(track.totalLength - sBack, track);
    const latOffset = passDemo ? [2.6,-2.6,0][slot] : mode !== 'race' ? 0 : slot % 2 === 0 ? -2.8 : 2.8;
    const x = sample.pos.x + sample.right.x * latOffset;
    const z = sample.pos.z + sample.right.z * latOffset;
    const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);

    const initialSpeed = passDemo && !isPlayer ? 35 : 0;
    cars.push({
      id: entry.id,
      name: isPlayer && !season ? team.driverLabel : entry.name,
      shortCode: isPlayer && !season ? team.shortCode : entry.shortCode,
      teamName: isPlayer && !season ? team.teamName : entry.teamName,
      primaryColor: isPlayer && !season ? team.primaryColor : entry.primaryColor,
      accentColor: isPlayer && !season ? team.accentColor : entry.accentColor,
      helmetColor: isPlayer && !season ? team.helmetColor : entry.helmetColor,
      number: carNumber,
      isPlayer,

      x,
      y: sample.pos.y,
      z,
      yaw,
      vx: Math.sin(yaw)*initialSpeed,
      vz: Math.cos(yaw)*initialSpeed,
      speed: initialSpeed,
      forwardSpeed: initialSpeed,
      lateralSpeed: 0,
      yawRate: 0,
      steerAngle: 0,
      pitch: 0,
      roll: 0,
      trackPitch: -Math.atan(sample.grade),
      trackBank: sample.bank,

      frontAeroDamage: 0,
      rearAeroDamage: 0,
      engineRunning: true,
      engineStartTimer: 0,
      manualTransmission: false,
      gear: initialSpeed ? 3 : 1,
      rpm: initialSpeed ? 9000 : IDLE_RPM,
      ersCharge: 100,
      ersActive: false,
      drsEligible: false,
      drsActive: false,
      drsArmedZone: 0,
      absTriggered: false,
      tcTriggered: false,
      slipstreamActive: false,
      brakeTemp: 0,
      skidSparks: false,
      wheelSpin: 0,
      slipRatio: 0,
      tireTempFront: 84,
      tireTempRear: 86,
      tireWear: 1.0,
      onTrack: true,
      onKerb: false,
      offTrackTime: 0,
      impactIntensity: 0,
      shiftFlashTimer: 0,

      trackIndex: sample.index,
      s: sample.s,
      tNorm: sample.tNorm,
      lateralOffset: latOffset,
      reverseHoldTime: 0,
      lap: 0,
      totalProgress: sample.tNorm - 1,
      sector: sample.sector,
      lapStartTime: 0,
      sectorStartTime: 0,
      currentLapTime: 0,
      lastLapTime: null,
      bestLapTime: null,
      sectorTimes: [null, null, null],
      finished: false,
      finishTime: null,
      position: slot + 1,

      aiSkill: entry.aiSkill,
      aiAggression: entry.aiAggression,
      aiPreferredOffset: latOffset * 0.45,
      aiTargetOffset: latOffset * 0.45,
    });
  }

  return cars;
}

export function createRaceSession(
  config: RaceConfig,
  startPhase: GamePhase = 'title',
  activeCamera: CameraMode = 'chase',
  muted = false,
  trackArg?: TrackData,
  personalRecordTime: number | null = null,
  initialGhost: GhostLapData | null = null,
  passDemo = false,
): RaceSession {
  const trackId: TrackId = config.trackId ?? 'interlagos';
  const mode: RaceMode = config.mode ?? 'race';
  const difficulty: DifficultyLevel = config.difficulty ?? 'competitivo';
  const teamId = getPlayerTeamPreset(config.teamId).id;
  const tireWearEnabled = mode !== 'practice' && config.tireWearEnabled !== false;
  const track = trackArg ?? getTrack(trackId);
  const effectiveModeForGrid: RaceMode = startPhase === 'title' ? 'race' : mode;
  const cars = createGridCars(track, effectiveModeForGrid, teamId, config.playerVehicle, passDemo);
  const playerIndex = cars.findIndex((c) => c.isPlayer);
  const study = studyFromConfig(config.playerVehicle);
  if (playerIndex >= 0 && study) cars[playerIndex].geometry = study.geometry;
  if (playerIndex >= 0 && startPhase !== 'title') {
    cars[playerIndex].engineRunning = !config.startEngineOff;
    cars[playerIndex].manualTransmission = config.manualTransmission === true;
    if(config.startEngineOff)cars[playerIndex].rpm=0;
  }

  return {
    phase: startPhase,
    config: {
      ...config,
      trackId: track.id,
      mode,
      difficulty,
      teamId,
      tireWearEnabled,
      cockpitFov: config.cockpitFov ?? 76,
      horizonLock: config.horizonLock ?? 0.72,
    },
    track,
    scenery: createSceneryWorld(track),
    cars,
    playerIndex: playerIndex >= 0 ? playerIndex : cars.length - 1,
    raceTime: 0,
    countdownTimer: 0,
    countdownLights: 0,
    countdownGoFlash: false,
    goFlashTimer: 0,
    activeCamera,
    muted,
    gamepadConnected: false,
    gamepadName: null,
    personalRecordTime,
    newRecordBannerTimer: 0,
    currentLapBins: new Array<number>(CHECKPOINT_BINS).fill(0),
    bestLapBins: null,
    ghostRecorder: createGhostRecorder(),
    bestGhostLap:
      initialGhost && initialGhost.trackId === track.id && initialGhost.weather === config.weather
        ? initialGhost
        : null,
    ghostPose: null,
    fastestLap: null,
  };
}

function updateLapAndSectors(
  car: CarState,
  prevTNorm: number,
  prevSector: 1 | 2 | 3,
  session: RaceSession,
): { brokeRecord: boolean } {
  let brokeRecord = false;

  // Record checkpoint split times during active lap for live delta
  if (car.isPlayer && car.lap >= 1) {
    const bin = Math.min(CHECKPOINT_BINS - 1, Math.floor(car.tNorm * CHECKPOINT_BINS));
    if (session.currentLapBins[bin] === 0) {
      session.currentLapBins[bin] = session.raceTime - car.lapStartTime;
    }
  }

  // Detect crossing start/finish line forward
  if (prevTNorm > 0.85 && car.tNorm < 0.15) {
    if (car.lap >= 1 && session.config.mode !== 'practice' && session.phase !== 'title' && car.lapValid !== false) {
      const lapDuration = session.raceTime - car.lapStartTime;
      if (lapDuration > 25) {
        car.lastLapTime = lapDuration;
        if (car.bestLapTime === null || lapDuration < car.bestLapTime) {
          car.bestLapTime = lapDuration;
          if (car.isPlayer) {
            session.bestLapBins = [...session.currentLapBins];
          }
        }
        if (session.fastestLap === null || lapDuration < session.fastestLap.time) {
          session.fastestLap = { driverName: car.shortCode, time: lapDuration };
        }
        if (
          car.isPlayer &&
          (session.personalRecordTime === null || lapDuration < session.personalRecordTime)
        ) {
          session.personalRecordTime = lapDuration;
          session.newRecordBannerTimer = 4.5;
          brokeRecord = true;
        }
        if (
          car.isPlayer &&
          session.config.mode === 'timetrial' &&
          (session.bestGhostLap === null || lapDuration < session.bestGhostLap.lapTime)
        ) {
          const captured = finalizeGhostLap(
            session.ghostRecorder,
            session.track.id,
            session.config.weather,
            lapDuration,
          );
          if (captured) session.bestGhostLap = captured;
        }
      }
      car.sectorTimes[2] = session.raceTime - car.sectorStartTime;
    }

    car.lap += 1;
    car.lapValid = true;
    car.lapStartTime = session.raceTime;
    car.sectorStartTime = session.raceTime;
    if (car.isPlayer) {
      session.currentLapBins.fill(0);
      if (session.config.mode === 'timetrial') {
        session.ghostRecorder = createGhostRecorder();
        recordGhostFrame(session.ghostRecorder, car, 0, true);
      }
    }

    // Time trial runs continuous flying laps; Race finishes after configured laps
    if (session.config.mode === 'race' && car.lap > session.config.totalLaps && !car.finished) {
      car.finished = true;
      car.finishTime = session.raceTime;
    }
  } else if (prevTNorm < 0.15 && car.tNorm > 0.85 && car.lap > 0) {
    car.lap -= 1;
  }

  // Sector transitions (1 -> 2, 2 -> 3)
  if (car.lap >= 1 && car.sector !== prevSector) {
    if (prevSector === 1 && car.sector === 2) {
      car.sectorTimes[0] = session.raceTime - car.sectorStartTime;
      car.sectorStartTime = session.raceTime;
    } else if (prevSector === 2 && car.sector === 3) {
      car.sectorTimes[1] = session.raceTime - car.sectorStartTime;
      car.sectorStartTime = session.raceTime;
    }
  }

  if (car.lap >= 1) {
    car.currentLapTime = session.raceTime - car.lapStartTime;
  } else {
    car.currentLapTime = 0;
  }

  const effectiveT = car.lap === 0 && car.tNorm > 0.5 ? car.tNorm - 1 : car.tNorm;
  car.totalProgress = Math.max(0, car.lap - 1) + (car.lap === 0 ? effectiveT : car.tNorm);

  return { brokeRecord };
}

/**
 * Advances the entire race session by `dt` seconds.
 * Handles FIA 5-light countdown, player + AI physics, collisions, lap counting, Time Trial records, and standings.
 */
export function stepRaceSession(
  session: RaceSession,
  playerInputs: ControlInputs,
  dt: number,
  trackOverride?: TrackData,
): {
  lightChangedTo: number | null;
  lightsOutJustTriggered: boolean;
  lapCompleted: boolean;
  newRecordAchieved: boolean;
} {
  const track = trackOverride ?? session.track ?? INTERLAGOS_TRACK;
  let lightChangedTo: number | null = null;
  let lightsOutJustTriggered = false;
  let lapCompleted = false;
  let newRecordAchieved = false;

  if (session.phase === 'paused' || session.phase === 'gameover') {
    return { lightChangedTo, lightsOutJustTriggered, lapCompleted, newRecordAchieved };
  }

  if (session.newRecordBannerTimer > 0) {
    session.newRecordBannerTimer = Math.max(0, session.newRecordBannerTimer - dt);
  }

  stepScenery(session.scenery, dt);

  // Title screen: AI drives live demo cars around the selected circuit
  if (session.phase === 'title') {
    session.raceTime += dt;
    for (const car of session.cars) {
      const aiIn = computeAiInputs(car, session.cars, session.config, dt, track);
      const slip = computeSlipstreamIntensity(car, session.cars, track);
      const prevT = car.tNorm;
      const prevS = car.sector;
      stepVehiclePhysics(car, aiIn, session.config, dt, track, true, slip, session.scenery);
      updateLapAndSectors(car, prevT, prevS, session);
    }
    resolveCarCollisions(session.cars);
    return { lightChangedTo, lightsOutJustTriggered, lapCompleted, newRecordAchieved };
  }

  // FIA 5-Red-Lights Countdown (faster single-green launch in Time Trial)
  if (session.phase === 'countdown') {
    if (session.config.mode === 'practice') {
      session.phase = 'playing';
      return { lightChangedTo, lightsOutJustTriggered, lapCompleted, newRecordAchieved };
    }
    const countdownDuration = session.config.mode === 'timetrial' ? 1.4 : 5.35;
    session.countdownTimer += dt;
    const prevLights = session.countdownLights;
    const nextLights =
      session.config.mode === 'timetrial'
        ? Math.min(5, Math.floor(session.countdownTimer / 0.25) + 1)
        : Math.min(5, Math.floor(session.countdownTimer / 1.0) + 1);
    if (nextLights > prevLights) {
      session.countdownLights = nextLights;
      lightChangedTo = nextLights;
    }

    const playerCar = session.cars[session.playerIndex];
    stepVehiclePhysics(playerCar, playerInputs, session.config, dt, track, false);
    for (let i = 0; i < session.cars.length; i++) {
      if (i === session.playerIndex) continue;
      const aiCar = session.cars[i];
      const holdRev: ControlInputs = {
        throttle: 0.72 + 0.12 * Math.sin(session.countdownTimer * 6 + i),
        brake: 1,
        steer: 0,
        ersBoost: false,
        drsToggleJustPressed: false,
      };
      stepVehiclePhysics(aiCar, holdRev, session.config, dt, track, false);
    }

    if (session.countdownTimer >= countdownDuration) {
      session.phase = 'playing';
      session.countdownLights = 0;
      session.countdownGoFlash = true;
      session.goFlashTimer = 1.2;
      lightsOutJustTriggered = true;
    }
    return { lightChangedTo, lightsOutJustTriggered, lapCompleted, newRecordAchieved };
  }

  // Active Playing Session
  if (session.goFlashTimer > 0) {
    session.goFlashTimer -= dt;
    if (session.goFlashTimer <= 0) {
      session.countdownGoFlash = false;
    }
  }

  session.raceTime += dt;
  const playerCar = session.cars[session.playerIndex];
  const prevPlayerLap = playerCar.lap;

  for (let i = 0; i < session.cars.length; i++) {
    const car = session.cars[i];
    const prevT = car.tNorm;
    const prevS = car.sector;

    const inputs =
      i === session.playerIndex && !car.finished
        ? playerInputs
        : computeAiInputs(car, session.cars, session.config, dt, track);

    const slip = computeSlipstreamIntensity(car, session.cars, track);
    stepVehiclePhysics(car, inputs, session.config, dt, track, true, slip, session.scenery);
    const { brokeRecord } = updateLapAndSectors(car, prevT, prevS, session);
    if (brokeRecord) newRecordAchieved = true;
  }

  if (playerCar.lap > prevPlayerLap && prevPlayerLap >= 1) {
    lapCompleted = true;
  }

  if (session.config.mode === 'timetrial' && playerCar.lap >= 1) {
    recordGhostFrame(session.ghostRecorder, playerCar, playerCar.currentLapTime);
    session.ghostPose = sampleGhostPose(session.bestGhostLap, playerCar.currentLapTime);
  } else {
    session.ghostPose = null;
  }

  if (session.cars.length > 1) {
    resolveCarCollisions(session.cars);
  }

  const sorted = [...session.cars].sort((a, b) => {
    if (a.finished && b.finished) {
      return (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity);
    }
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return b.totalProgress - a.totalProgress;
  });

  for (let pos = 0; pos < sorted.length; pos++) {
    sorted[pos].position = pos + 1;
  }

  if (playerCar.finished && session.config.mode === 'race') {
    session.phase = 'gameover';
  }

  return { lightChangedTo, lightsOutJustTriggered, lapCompleted, newRecordAchieved };
}

function computeLiveDelta(session: RaceSession, player: CarState): number | null {
  if (player.lap < 1) return null;
  const bin = Math.min(CHECKPOINT_BINS - 1, Math.floor(player.tNorm * CHECKPOINT_BINS));
  if (session.bestLapBins && session.bestLapBins[bin] > 0) {
    return player.currentLapTime - session.bestLapBins[bin];
  }
  if (session.personalRecordTime !== null) {
    return player.currentLapTime - session.personalRecordTime * player.tNorm;
  }
  return null;
}

export function buildTelemetrySnapshot(
  session: RaceSession,
  lastInputs: ControlInputs,
  trackOverride?: TrackData,
): TelemetrySnapshot {
  const track = trackOverride ?? session.track ?? INTERLAGOS_TRACK;
  const player = session.cars[session.playerIndex];
  const sorted = [...session.cars].sort((a, b) => a.position - b.position);
  const leader = sorted[0];

  const standings: RaceStanding[] = sorted.map((c) => {
    let gapSeconds = 0;
    if (c.id !== leader.id) {
      const progressDiff = Math.max(0, leader.totalProgress - c.totalProgress);
      const distDiff = progressDiff * track.totalLength;
      const refSpeed = Math.max(30, leader.speed || 55);
      gapSeconds = distDiff / refSpeed;
    }
    return {
      id: c.id,
      name: c.name,
      shortCode: c.shortCode,
      teamName: c.teamName,
      primaryColor: c.primaryColor,
      position: c.position,
      lap:
        session.config.mode === 'timetrial'
          ? Math.max(1, c.lap || 1)
          : Math.max(1, Math.min(session.config.totalLaps, c.lap || 1)),
      gapSeconds,
      bestLapTime: c.bestLapTime,
      lastLapTime: c.lastLapTime,
      isPlayer: c.isPlayer,
      finished: c.finished,
    };
  });

  const sample = getSampleAtDistance(player.s, track);

  return {
    phase: session.phase,
    trackId: track.id,
    trackName: track.meta.shortName,
    mode: session.config.mode,
    difficulty: session.config.difficulty,
    countdownLights: session.countdownLights,
    countdownGoFlash: session.countdownGoFlash,
    raceTime: session.raceTime,
    totalLaps: session.config.totalLaps,
    weather: session.config.weather,
    absEnabled: session.config.absEnabled,
    tcEnabled: session.config.tcEnabled,
    racingLineEnabled: session.config.racingLineEnabled,
    tireWearEnabled: session.config.tireWearEnabled,
    ghostActive: Boolean(session.ghostPose),
    activeCamera: session.activeCamera,
    cockpitFov: session.config.cockpitFov ?? 76,
    horizonLock: session.config.horizonLock ?? 0.72,
    muted: session.muted,
    gamepadConnected: session.gamepadConnected,
    gamepadName: session.gamepadName,
    personalRecordTime: session.personalRecordTime,
    liveDeltaSeconds: computeLiveDelta(session, player),
    newRecordBannerTimer: session.newRecordBannerTimer,
    player: {
      speedKmh: Math.round(player.speed * 3.6),
      gear: player.gear,
      rpm: Math.round(player.rpm),
      maxRpm: MAX_RPM,
      throttle: lastInputs.throttle,
      brake: lastInputs.brake,
      ersCharge: Math.round(player.ersCharge),
      ersActive: player.ersActive,
      drsEligible: player.drsEligible,
      drsActive: player.drsActive,
      absTriggered: player.absTriggered,
      tcTriggered: player.tcTriggered,
      slipstreamActive: player.slipstreamActive,
      brakeTemp: player.brakeTemp,
      tireTempFront: Math.round(player.tireTempFront),
      tireTempRear: Math.round(player.tireTempRear),
      tireWearPct: Math.round(player.tireWear * 100),
      frontAeroDamagePct: Math.round((player.frontAeroDamage ?? 0) * 100),
      rearAeroDamagePct: Math.round((player.rearAeroDamage ?? 0) * 100),
      onTrack: player.onTrack,
      lap:
        session.config.mode === 'timetrial'
          ? Math.max(1, player.lap || 1)
          : Math.max(1, Math.min(session.config.totalLaps, player.lap || 1)),
      position: player.position,
      totalCars: session.cars.length,
      currentLapTime: player.currentLapTime,
      lastLapTime: player.lastLapTime,
      bestLapTime: player.bestLapTime,
      sector: player.sector,
      sectorTimes: [...player.sectorTimes] as [number | null, number | null, number | null],
      cornerName: sample.cornerName,
      brakingCue: computeCornerBrakingCue(player, session.config, track),
      motionBlurIntensity: computeMotionBlurIntensity(player.speed, session.activeCamera),
    },
    standings,
    minimapCars: session.cars.map((c) => ({
      id: c.id,
      x: c.x,
      z: c.z,
      color: c.isPlayer ? '#facc15' : c.primaryColor,
      isPlayer: c.isPlayer,
    })),
    fastestLap: session.fastestLap,
  };
}

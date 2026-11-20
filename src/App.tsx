import { surveyedInterlagos } from './sim/track';
import {DYNAMICS_VERSION} from './sim/dynamics';
import { AudioStatus } from './components/AudioStatus';
import { useEffect, useRef, useState } from 'react';
import { PauseModal } from './components/PauseModal';
import { ResultsModal } from './components/ResultsModal';
import { TelemetryHud } from './components/TelemetryHud';
import { TitleOverlay } from './components/TitleOverlay';
import type { F1EngineController } from './engine/F1Renderer';
import type {
  CameraMode,
  GhostLapData,
  RaceConfig,
  TelemetrySnapshot,
  TrackId,
  WeatherCondition,
} from './sim/types';

const STORAGE_KEY = 'f1_gp_prefs_v2';
const LEGACY_STORAGE_KEY = 'interlagos_gp_prefs_v1';
const STORAGE_GHOST_KEY = 'f1_gp_ghosts_v1';

interface StoredPrefs {
  config: RaceConfig;
  records: Record<string, number>;
}

export function getRecordKey(trackId: TrackId, weather: WeatherCondition): string {
  return `${trackId}:${weather}:${DYNAMICS_VERSION}${trackId === "interlagos" && surveyedInterlagos ? ":geo1" : ""}`;
}

function loadPrefs(): StoredPrefs {
  const defaultConfig: RaceConfig = {
    trackId: 'interlagos',
    mode: 'race',
    difficulty: 'competitivo',
    teamId: 'auriverde',
    totalLaps: 3,
    weather: 'dry',
    absEnabled: true,
    tcEnabled: true,
    racingLineEnabled: true,
    tireWearEnabled: true,
    cockpitFov: 76,
    horizonLock: 0.72,
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredPrefs>;
      return {
        config: {
          ...defaultConfig,
          ...parsed.config,
        },
        records: parsed.records ?? {},
      };
    }

    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as {
        config?: Partial<RaceConfig>;
        bestLapDry?: number | null;
        bestLapWet?: number | null;
      };
      const records: Record<string, number> = {};
      if (typeof legacy.bestLapDry === 'number') records['interlagos:dry'] = legacy.bestLapDry;
      if (typeof legacy.bestLapWet === 'number') records['interlagos:wet'] = legacy.bestLapWet;
      return {
        config: {
          ...defaultConfig,
          ...legacy.config,
        },
        records,
      };
    }
  } catch {
    // Ignore storage errors
  }
  return {
    config: defaultConfig,
    records: {},
  };
}

function savePrefs(config: RaceConfig, records: Record<string, number>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ config, records }));
  } catch {
    // Ignore storage errors
  }
}

function loadGhosts(): Record<string, GhostLapData> {
  try {
    const raw = localStorage.getItem(STORAGE_GHOST_KEY);
    if (raw) {
      return JSON.parse(raw) as Record<string, GhostLapData>;
    }
  } catch {
    // Ignore storage errors
  }
  return {};
}

function saveGhosts(ghosts: Record<string, GhostLapData>): void {
  try {
    localStorage.setItem(STORAGE_GHOST_KEY, JSON.stringify(ghosts));
  } catch {
    // Ignore quota/storage errors
  }
}

export default function App() {
  const initialPrefs = useRef<StoredPrefs>(loadPrefs());
  const ghostsRef = useRef<Record<string, GhostLapData>>(loadGhosts());
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<F1EngineController | null>(null);

  const [config, setConfig] = useState<RaceConfig>(initialPrefs.current.config);
  const configRef = useRef<RaceConfig>(initialPrefs.current.config);
  const [records, setRecords] = useState<Record<string, number>>(initialPrefs.current.records);
  const recordsRef = useRef<Record<string, number>>(initialPrefs.current.records);
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const params = new URLSearchParams(window.location.search);
    const autostart = params.get('autostart') === '1';

    let cancelled = false;
    async function initialize() {
    try {
      const { F1EngineController } = await import('./engine/F1Renderer');
      if (cancelled || !mount) return;
      const ctrl = new F1EngineController(mount, initialPrefs.current.config, autostart, (snap) => {
        setTelemetry(snap);
      });
      engineRef.current = ctrl;

      const initTrack = initialPrefs.current.config.trackId ?? 'interlagos';
      const initKey = getRecordKey(initTrack, initialPrefs.current.config.weather);
      const initRec = initialPrefs.current.records[initKey] ?? null;
      const initGhost = ghostsRef.current[initKey] ?? null;
      if (autostart) {
        if (initRec !== null || initGhost !== null) {
          ctrl.startRace(initialPrefs.current.config, initRec, initGhost);
        }
      } else if (initRec !== null || initGhost !== null) {
        ctrl.setTrack(initTrack, initRec, initGhost);
      }


    } catch (err) {
      if (!cancelled) setWebglError(
        err instanceof Error ? err.message : 'Não foi possível inicializar o renderizador 3D WebGL.',
      );
    }
    }
    const frame = requestAnimationFrame(() => { void initialize(); });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  // Persist personal best lap times and Time Trial Ghost Laps per track + weather
  useEffect(() => {
    if (!telemetry) return;
    const pBest = telemetry.player.bestLapTime;
    if (pBest === null) return;

    const key = getRecordKey(telemetry.trackId, telemetry.weather);
    const prevBest = recordsRef.current[key];
    if (prevBest === undefined || pBest < prevBest) {
      const nextRecords = { ...recordsRef.current, [key]: pBest };
      recordsRef.current = nextRecords;
      setRecords(nextRecords);
      savePrefs(configRef.current, nextRecords);
    }

    const capturedGhost = engineRef.current?.getBestGhostLap();
    if (capturedGhost) {
      const prevGhost = ghostsRef.current[key];
      if (!prevGhost || capturedGhost.lapTime < prevGhost.lapTime) {
        ghostsRef.current = { ...ghostsRef.current, [key]: capturedGhost };
        saveGhosts(ghostsRef.current);
      }
    }
  }, [telemetry?.player.bestLapTime, telemetry?.trackId, telemetry?.weather]);

  const handleConfigChange = (next: RaceConfig) => {
    const prevTrack = configRef.current.trackId ?? 'interlagos';
    const prevWeather = configRef.current.weather;
    const prevTeam = configRef.current.teamId ?? 'auriverde';
    const nextTrack = next.trackId ?? 'interlagos';
    const nextTeam = next.teamId ?? 'auriverde';
    configRef.current = next;
    setConfig(next);

    if (nextTrack !== prevTrack || next.weather !== prevWeather) {
      const key = getRecordKey(nextTrack, next.weather);
      const rec = recordsRef.current[key] ?? null;
      const ghost = ghostsRef.current[key] ?? null;
      engineRef.current?.setTrack(nextTrack, rec, ghost);
    }
    if (nextTeam !== prevTeam) {
      engineRef.current?.setPlayerTeam(nextTeam);
    }
    engineRef.current?.setWeather(next.weather, recordsRef.current[getRecordKey(nextTrack,next.weather)]??null, ghostsRef.current[getRecordKey(nextTrack,next.weather)]??null);
    engineRef.current?.setAssists(next.absEnabled, next.tcEnabled);
    engineRef.current?.setRacingLine(next.racingLineEnabled);
    engineRef.current?.setTireWear(next.tireWearEnabled !== false);
    savePrefs(next, recordsRef.current);
  };

  const handleStartRace = () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    const cfg = configRef.current;
    const trackId = cfg.trackId ?? 'interlagos';
    const key = getRecordKey(trackId, cfg.weather);
    const personalRecord = recordsRef.current[key] ?? null;
    const ghostLap = ghostsRef.current[key] ?? null;
    engineRef.current?.startRace(cfg, personalRecord, ghostLap);
  };

  const handleRestartRace = () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    const cfg = configRef.current;
    const trackId = cfg.trackId ?? 'interlagos';
    const key = getRecordKey(trackId, cfg.weather);
    const personalRecord = recordsRef.current[key] ?? null;
    const ghostLap = ghostsRef.current[key] ?? null;
    engineRef.current?.startRace(cfg, personalRecord, ghostLap);
  };

  const handleResume = () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    engineRef.current?.resumeRace();
  };

  const handleFinishSession = () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    engineRef.current?.finishSessionToResults();
  };

  const handleReturnTitle = () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    engineRef.current?.returnToTitle();
  };

  const handleSelectCamera = (mode: CameraMode) => {
    engineRef.current?.setCamera(mode);
  };

  const handleToggleAssists = (abs: boolean, tc: boolean) => {
    const next = { ...configRef.current, absEnabled: abs, tcEnabled: tc };
    configRef.current = next;
    setConfig(next);
    engineRef.current?.setAssists(abs, tc);
    savePrefs(next, recordsRef.current);
  };

  const handleToggleRacingLine = (enabled: boolean) => {
    const next = { ...configRef.current, racingLineEnabled: enabled };
    configRef.current = next;
    setConfig(next);
    engineRef.current?.setRacingLine(enabled);
    savePrefs(next, recordsRef.current);
  };

  const handleToggleTireWear = (enabled: boolean) => {
    const next = { ...configRef.current, tireWearEnabled: enabled };
    configRef.current = next;
    setConfig(next);
    engineRef.current?.setTireWear(enabled);
    savePrefs(next, recordsRef.current);
  };

  const handleChangeWeather = (weather: WeatherCondition) => {
    const next = { ...configRef.current, weather };
    configRef.current = next;
    setConfig(next);
    engineRef.current?.setWeather(weather, recordsRef.current[getRecordKey(next.trackId??'interlagos',weather)]??null, ghostsRef.current[getRecordKey(next.trackId??'interlagos',weather)]??null);
    savePrefs(next, recordsRef.current);
  };

  const handleChangeCameraSettings = (cockpitFov: number, horizonLock: number) => {
    const next = { ...configRef.current, cockpitFov, horizonLock };
    configRef.current = next;
    setConfig(next);
    engineRef.current?.setCameraSettings(cockpitFov, horizonLock);
    savePrefs(next, recordsRef.current);
  };

  const phase = telemetry?.phase ?? 'title';
  const activeTrackId = config.trackId ?? 'interlagos';
  const bestLapDry = records[getRecordKey(activeTrackId, 'dry')] ?? null;
  const bestLapWet = records[getRecordKey(activeTrackId, 'wet')] ?? null;

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0b0d11]">
      {/* Isolated WebGL Mount Container (never re-rendered by HUD state) */}
      <div ref={canvasMountRef} className="fixed inset-0 z-0" />

      {webglError && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0b0d11] p-6">
          <div className="max-w-md bg-[#12161f] border border-white/12 rounded-xl p-6 text-center">
            <h1 className="font-display text-xl font-bold text-white mb-2">
              WebGL Indisponível
            </h1>
            <p className="text-sm text-slate-300">{webglError}</p>
          </div>
        </div>
      )}

      {!webglError && (!telemetry || telemetry.preparingGrid) && (
        <div role="status" className="session-loader">
          <div><span className="loader-track" /><h2>{telemetry ? 'Preparando o grid' : 'Carregando o circuito'}</h2><progress aria-label="Preparação da sessão" max={1} value={telemetry?.loadingProgress} /></div>
        </div>
      )}
      {telemetry && phase === 'title' && (
        <TitleOverlay
          config={config}
          bestLapDry={bestLapDry}
          bestLapWet={bestLapWet}
          gamepadConnected={telemetry?.gamepadConnected ?? false}
          gamepadName={telemetry?.gamepadName ?? ''}
          onChangeConfig={handleConfigChange}
          onStartRace={handleStartRace}
        />
      )}

      {telemetry && (phase === 'countdown' || phase === 'playing') && (
        <>
        <AudioStatus />
        <TelemetryHud
          telemetry={telemetry}
          onSelectCamera={handleSelectCamera}
          onToggleMute={() => engineRef.current?.toggleMute()}
          onPause={() => engineRef.current?.pauseRace()}
        />
        </>
      )}

      {telemetry && phase === 'paused' && (
        <PauseModal
          telemetry={telemetry}
          onResume={handleResume}
          onRestart={handleRestartRace}
          onFinishSession={handleFinishSession}
          onReturnTitle={handleReturnTitle}
          onToggleAssists={handleToggleAssists}
          onToggleRacingLine={handleToggleRacingLine}
          onToggleTireWear={handleToggleTireWear}
          onChangeWeather={handleChangeWeather}
          onSelectCamera={handleSelectCamera}
          onChangeCameraSettings={handleChangeCameraSettings}
        />
      )}

      {telemetry && phase === 'gameover' && (
        <ResultsModal
          telemetry={telemetry}
          onRestart={handleRestartRace}
          onReturnTitle={handleReturnTitle}
        />
      )}
    </main>
  );
}

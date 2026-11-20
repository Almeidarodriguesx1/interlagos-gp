import { Camera, Gamepad2, Pause, Volume2, VolumeX } from 'lucide-react';
import { getTrack, type TrackData } from '../sim/track';
import type { CameraMode, TelemetrySnapshot, TrackId } from '../sim/types';
import { formatGap, formatLapTime } from '../utils/formatTime';

interface TelemetryHudProps {
  telemetry: TelemetrySnapshot;
  onSelectCamera: (mode: CameraMode) => void;
  onToggleMute: () => void;
  onPause: () => void;
}

const CAMERA_LABELS: Array<{ id: CameraMode; label: string; keyHint: string }> = [
  { id: 'cockpit', label: 'Cockpit', keyHint: '1' },
  { id: 'tcam', label: 'T-Cam', keyHint: '2' },
  { id: 'chase', label: 'Chase', keyHint: '3' },
  { id: 'trackside', label: 'TV Pista', keyHint: '4' },
  { id: 'helicopter', label: 'Heli', keyHint: '5' },
];

interface MinimapGeometry {
  path: string;
  startX: number;
  startY: number;
  toMapX: (x: number) => number;
  toMapY: (z: number) => number;
}

function buildMinimapGeometry(track: TrackData): MinimapGeometry {
  const { minX, maxX, minZ, maxZ } = track.bounds;
  const scale = 124 / Math.max(maxX - minX || 1, maxZ - minZ || 1);
  const ox = (148 - (maxX - minX) * scale) * 0.5;
  const oy = (116 - (maxZ - minZ) * scale) * 0.5;
  const toMapX = (x: number) => ox + (x - minX) * scale;
  const toMapY = (z: number) => oy + (z - minZ) * scale;

  const step = Math.max(4, Math.floor(track.samples.length / 220));
  const pts: string[] = [];
  for (let i = 0; i < track.samples.length; i += step) {
    const p = track.samples[i].pos;
    pts.push(`${i === 0 ? 'M' : 'L'}${toMapX(p.x).toFixed(1)},${toMapY(p.z).toFixed(1)}`);
  }

  return {
    path: `${pts.join(' ')} Z`,
    startX: toMapX(track.samples[0].pos.x),
    startY: toMapY(track.samples[0].pos.z),
    toMapX,
    toMapY,
  };
}

const minimaps: Partial<Record<TrackId, MinimapGeometry>> = {};

function formatDelta(delta: number | null): string {
  if (delta === null || !Number.isFinite(delta)) return '--.---';
  const sign = delta >= 0 ? '+' : '-';
  return `${sign}${Math.abs(delta).toFixed(3)}s`;
}

export function TelemetryHud({
  telemetry,
  onSelectCamera,
  onToggleMute,
  onPause,
}: TelemetryHudProps) {
  const {
    player,
    standings,
    minimapCars,
    activeCamera,
    muted,
    phase,
    countdownLights,
    countdownGoFlash,
    mode,
    trackId,
    trackName,
    personalRecordTime,
    liveDeltaSeconds,
    newRecordBannerTimer,
    gamepadConnected,
  } = telemetry;

  const minimap = minimaps[trackId] ??= buildMinimapGeometry(getTrack(trackId));
  const rpmRatio = Math.max(0, Math.min(1, (player.rpm - 4500) / (player.maxRpm - 4500)));
  const totalLeds = 15;
  const activeLeds = Math.round(rpmRatio * totalLeds);

  // Show top 4 + player window in compact broadcast timing tower
  const visibleStandings = standings.slice(0, 5);
  const playerIncluded = visibleStandings.some((s) => s.isPlayer);
  if (!playerIncluded) {
    const pRow = standings.find((s) => s.isPlayer);
    if (pRow) visibleStandings[4] = pRow;
  }

  const vignetteAlpha =
    phase === 'playing' ? Math.min(0.26, player.motionBlurIntensity * 0.26) : 0;

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 md:p-5">
      {(player.frontAeroDamagePct > 0 || player.rearAeroDamagePct > 0) && (
        <div role="status" className="absolute bottom-64 right-5 bg-amber-950/95 border border-amber-500/50 text-amber-100 px-3 py-2 rounded-lg text-xs">
          Dano aerodinâmico · Frente {player.frontAeroDamagePct}% · Traseira {player.rearAeroDamagePct}%
          <div className="text-amber-200/70 mt-1">Reinicie a sessão para reparar.</div>
        </div>
      )}
      {/* Subtle peripheral radial speed framing at high velocity */}
      {vignetteAlpha > 0.01 && (
        <div
          aria-hidden="true"
          className="fixed inset-0 pointer-events-none transition-opacity duration-100"
          style={{
            background: `radial-gradient(ellipse at 50% 48%, rgba(6,9,14,0) 58%, rgba(6,9,14,${vignetteAlpha.toFixed(
              3,
            )}) 100%)`,
          }}
        />
      )}

      {/* FIA 5-Red-Lights Countdown Gantry */}
      {(phase === 'countdown' || countdownGoFlash) && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2">
          <div className="flex items-center gap-3 px-5 py-3 bg-[#090b0f]/95 border border-white/15 rounded-lg shadow-xl">
            {[1, 2, 3, 4, 5].map((idx) => {
              const isLit = phase === 'countdown' && idx <= countdownLights;
              return (
                <div
                  key={idx}
                  className={`w-6 h-6 rounded-full border transition-colors ${
                    isLit
                      ? 'bg-[#ef4444] border-red-300 shadow-[0_0_14px_rgba(239,68,68,0.85)]'
                      : countdownGoFlash
                      ? 'bg-emerald-500 border-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.7)]'
                      : 'bg-[#2a1215] border-white/10'
                  }`}
                />
              );
            })}
          </div>
          <span className="font-display text-xs font-bold tracking-[0.2em] uppercase text-white hud-text-stroke">
            {countdownGoFlash
              ? mode === 'timetrial'
                ? 'Pista Livre · Acelere!'
                : 'Luzes apagadas · Largada!'
              : telemetry.preparingGrid ? 'Preparando o grid…' : 'Prepare-se para largar'}
          </span>
        </div>
      )}

      {/* New Personal Record Banner */}
      {newRecordBannerTimer > 0 && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-30 bg-[#090b0f]/95 border border-emerald-400/60 rounded-lg px-5 py-2.5 shadow-xl text-center">
          <p className="font-display text-xs font-bold tracking-[0.2em] uppercase text-emerald-300">
            Novo Recorde Pessoal · {trackName}
          </p>
          <p className="font-mono-tabular text-lg font-extrabold text-white mt-0.5">
            {formatLapTime(personalRecordTime)}
          </p>
        </div>
      )}

      {/* TOP ROW: Timing Cluster (Left) + Camera & Utility Bar (Right) */}
      <div className="flex items-start justify-between gap-4">
        {/* Corner Cluster 1: Position/Time Trial Header, Lap, Sector & Standings or Delta */}
        <div className="bg-[#0c0e12]/88 border border-white/12 rounded-lg px-3.5 py-3 min-w-[238px]">
          <div className="flex items-baseline justify-between gap-4 pb-2 border-b border-white/10">
            {mode !== 'race' ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-cyan-300 uppercase tracking-wider">
                  {mode === 'practice' ? 'Treino livre' : 'Contra o Relógio'}
                </span>
                {telemetry.ghostActive && (
                  <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-[9px] font-bold text-cyan-200 tracking-wider">
                    FANTASMA
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Pos
                </span>
                <span className="font-display text-2xl font-extrabold text-white tabular-nums">
                  {player.position}
                </span>
                <span className="text-xs text-slate-400 tabular-nums">/{player.totalCars}</span>
              </div>
            )}
            <div className="flex items-baseline gap-1.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Volta
              </span>
              <span className="font-display text-xl font-bold text-white tabular-nums">
                {player.lap}
              </span>
              {mode === 'race' && (
                <span className="text-xs text-slate-400 tabular-nums">/{telemetry.totalLaps}</span>
              )}
            </div>
          </div>

          <div className="mt-2 space-y-1 text-xs font-mono-tabular">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Atual</span>
              <span className="text-white font-semibold">{formatLapTime(player.currentLapTime)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">{mode === 'timetrial' ? 'Recorde' : 'Melhor'}</span>
              <span className="text-cyan-300 font-semibold">
                {formatLapTime(personalRecordTime ?? player.bestLapTime)}
              </span>
            </div>
            {mode === 'timetrial' && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Delta</span>
                <span
                  className={`font-semibold ${
                    liveDeltaSeconds === null
                      ? 'text-slate-400'
                      : liveDeltaSeconds <= 0
                      ? 'text-emerald-400'
                      : 'text-red-400'
                  }`}
                >
                  {formatDelta(liveDeltaSeconds)}
                </span>
              </div>
            )}
          </div>

          <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-300">
            <span className="truncate max-w-[140px]">{player.cornerName}</span>
            {player.brakingCue ? (
              <span className="px-1.5 py-0.5 rounded bg-red-500 text-white font-display font-bold tracking-wider text-[10px]">
                FREAR
              </span>
            ) : (
              <span className="font-mono-tabular text-amber-400 font-semibold">S{player.sector}</span>
            )}
          </div>

          {/* Compact Top-5 Broadcast Tower (Race Mode only) */}
          {mode === 'race' && (
            <div className="mt-2 pt-2 border-t border-white/10 space-y-1">
              {visibleStandings.map((row) => (
                <div
                  key={row.id}
                  className={`flex items-center justify-between text-[11px] px-1.5 py-0.5 rounded ${
                    row.isPlayer ? 'bg-white/12 text-white font-semibold' : 'text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-3.5 text-slate-400 tabular-nums">{row.position}</span>
                    <span
                      className="w-1 h-3 rounded-xs shrink-0"
                      style={{ backgroundColor: row.primaryColor }}
                    />
                    <span className="font-mono-tabular">{row.shortCode}</span>
                  </div>
                  <span className="font-mono-tabular text-slate-400">{formatGap(row.gapSeconds)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Corner Cluster 2: Multi-Camera Switcher + Gamepad Status + Mute + Pause */}
        <div className="pointer-events-auto flex items-center gap-2 bg-[#0c0e12]/88 border border-white/12 rounded-lg p-1.5">
          <div className="hidden sm:flex items-center gap-1 pr-1.5 border-r border-white/10">
            <Camera className="w-3.5 h-3.5 text-slate-400 ml-1 mr-0.5" aria-hidden="true" />
            {CAMERA_LABELS.map((cam) => (
              <button
                key={cam.id}
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onSelectCamera(cam.id);
                }}
                aria-label={`Câmera ${cam.label} (Tecla ${cam.keyHint})`}
                className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeCamera === cam.id
                    ? 'bg-[#ef4444] text-white'
                    : 'text-slate-300 hover:text-white hover:bg-white/8'
                }`}
              >
                {cam.label}
              </button>
            ))}
          </div>

          {gamepadConnected && (
            <div
              title={telemetry.gamepadName || 'Controle conectado'}
              className="w-8 h-9 flex items-center justify-center text-emerald-400"
              aria-label="Controle conectado"
            >
              <Gamepad2 className="w-4 h-4" />
            </div>
          )}

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            aria-label={muted ? 'Ativar Som (M)' : 'Silenciar Som (M)'}
            className="w-9 h-9 flex items-center justify-center rounded bg-white/5 hover:bg-white/12 text-slate-200 transition-colors cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            aria-label="Pausar Corrida (P)"
            className="w-9 h-9 flex items-center justify-center rounded bg-white/5 hover:bg-white/12 text-slate-200 transition-colors cursor-pointer"
          >
            <Pause className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* BOTTOM ROW: Dynamic Circuit Minimap (Left) + F1 Telemetry Pod (Right) */}
      <div className="flex items-end justify-between gap-4">
        {/* Corner Cluster 3A: Dynamic Circuit Live Minimap */}
        <div className="bg-[#0c0e12]/88 border border-white/12 rounded-lg p-2.5 hidden sm:block">
          <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase tracking-wider mb-1 px-0.5">
            <span>{trackName}</span>
            <span>{telemetry.weather === 'wet' ? 'Molhado' : 'Seco'}</span>
          </div>
          <svg viewBox="0 0 148 116" className="w-[148px] h-[116px]" aria-label={`Minimapa de ${trackName}`}>
            <path
              d={minimap.path}
              fill="none"
              stroke="#334155"
              strokeWidth="4.5"
              strokeLinejoin="round"
            />
            <circle cx={minimap.startX} cy={minimap.startY} r="3" fill="#ffffff" />
            {minimapCars.map((mc) => (
              <circle
                key={mc.id}
                cx={minimap.toMapX(mc.x)}
                cy={minimap.toMapY(mc.z)}
                r={mc.isPlayer ? 4.2 : 2.6}
                fill={mc.color}
                stroke={mc.isPlayer ? '#090b0f' : 'none'}
                strokeWidth="1.2"
              />
            ))}
          </svg>
        </div>

        {/* Corner Cluster 3B: Speedometer, Gear, RPM LEDs, ERS & DRS */}
        <div className="bg-[#0c0e12]/90 border border-white/12 rounded-lg px-4 py-3 min-w-[270px] ml-auto">
          {/* 15-LED Shift Strip */}
          <div className="grid grid-cols-15 gap-1 mb-2.5" aria-hidden="true">
            {Array.from({ length: totalLeds }).map((_, i) => {
              const lit = i < activeLeds;
              const colorClass =
                i < 5
                  ? 'bg-emerald-400'
                  : i < 10
                  ? 'bg-red-500'
                  : 'bg-cyan-400';
              return (
                <div
                  key={i}
                  className={`h-1.5 rounded-xs ${lit ? colorClass : 'bg-white/10'}`}
                />
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-4">
            {/* Speed + RPM */}
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-4xl font-extrabold text-white tabular-nums leading-none">
                  {player.speedKmh}
                </span>
                <span className="text-xs font-semibold text-slate-400">KM/H</span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono-tabular mt-1">
                {player.rpm} RPM
              </div>
            </div>

            {/* Gear Indicator */}
            <div className="flex flex-col items-center justify-center w-14 h-14 rounded-md bg-white/6 border border-white/10">
              <span className="text-[9px] text-slate-400 uppercase tracking-wider">Marcha</span>
              <span className="font-display text-2xl font-extrabold text-amber-400 tabular-nums leading-none mt-0.5">
                {player.gear === -1 ? 'R' : player.gear === 0 ? 'N' : player.gear}
              </span>
            </div>

            {/* Throttle & Brake Bars */}
            <div className="flex items-end gap-1.5 h-14" aria-hidden="true">
              <div className="w-2.5 h-full bg-white/10 rounded-xs overflow-hidden flex flex-col justify-end">
                <div
                  className="w-full bg-red-500 transition-[height] duration-75"
                  style={{ height: `${Math.round(player.brake * 100)}%` }}
                />
              </div>
              <div className="w-2.5 h-full bg-white/10 rounded-xs overflow-hidden flex flex-col justify-end">
                <div
                  className="w-full bg-emerald-400 transition-[height] duration-75"
                  style={{ height: `${Math.round(player.throttle * 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* ERS Battery + DRS + Assist Status */}
          <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className={player.ersActive ? 'text-cyan-300 font-bold' : 'text-slate-400'}>
                  ERS {player.ersActive ? 'ATIVO' : ''}
                </span>
                <span className="font-mono-tabular text-slate-300">{player.ersCharge}%</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-xs overflow-hidden">
                <div
                  className={`h-full transition-[width] duration-100 ${
                    player.ersActive ? 'bg-cyan-300' : 'bg-cyan-500'
                  }`}
                  style={{ width: `${player.ersCharge}%` }}
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] font-bold">
              {player.slipstreamActive && (
                <span className="px-1.5 py-0.5 rounded border bg-cyan-500/25 text-cyan-300 border-cyan-400/50 text-[10px]">
                  VÁCUO
                </span>
              )}
              <span
                className={`px-2 py-0.5 rounded border ${
                  player.drsActive
                    ? 'bg-emerald-500 text-[#090b0f] border-emerald-300'
                    : player.drsEligible
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50'
                    : 'bg-white/5 text-slate-500 border-white/10'
                }`}
              >
                DRS
              </span>
              <span
                className={`px-1.5 py-0.5 rounded border text-[10px] ${
                  player.absTriggered
                    ? 'bg-amber-500 text-[#090b0f] border-amber-300'
                    : telemetry.absEnabled
                    ? 'text-slate-300 border-white/12'
                    : 'text-slate-600 border-white/5'
                }`}
              >
                ABS
              </span>
              <span
                className={`px-1.5 py-0.5 rounded border text-[10px] ${
                  player.tcTriggered
                    ? 'bg-amber-500 text-[#090b0f] border-amber-300'
                    : telemetry.tcEnabled
                    ? 'text-slate-300 border-white/12'
                    : 'text-slate-600 border-white/5'
                }`}
              >
                TC
              </span>
            </div>
          </div>

          {/* Tire Thermal Window & Progressive Wear */}
          <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between gap-3 text-[10px] font-mono-tabular">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-sans uppercase tracking-wider">Pneus</span>
              <span
                className={`font-semibold ${
                  player.tireTempFront < 75
                    ? 'text-cyan-300'
                    : player.tireTempFront <= 108
                    ? 'text-emerald-300'
                    : 'text-amber-300'
                }`}
              >
                D {player.tireTempFront}°C
              </span>
              <span
                className={`font-semibold ${
                  player.tireTempRear < 75
                    ? 'text-cyan-300'
                    : player.tireTempRear <= 108
                    ? 'text-emerald-300'
                    : 'text-amber-300'
                }`}
              >
                T {player.tireTempRear}°C
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {telemetry.tireWearEnabled ? (
                <>
                  <div className="w-12 h-1.5 bg-white/10 rounded-xs overflow-hidden">
                    <div
                      className={`h-full ${
                        player.tireWearPct > 65
                          ? 'bg-emerald-400'
                          : player.tireWearPct > 35
                          ? 'bg-amber-400'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${player.tireWearPct}%` }}
                    />
                  </div>
                  <span className="text-slate-300 font-semibold">{player.tireWearPct}%</span>
                </>
              ) : (
                <span className="text-slate-500">Desgaste Off</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import {VEHICLE_STUDIES, studyFromQuery} from '../sim/vehicleStudies';
import { gridRoster } from '../sim/grid2026';
import { Gamepad2 } from 'lucide-react';
import { PLAYER_TEAMS, getPlayerTeamPreset } from '../sim/raceDirector';
import { TRACK_MENU, getTrack, type TrackData } from '../sim/track';
import type { DifficultyLevel, RaceConfig, RaceMode, TrackId, WeatherCondition } from '../sim/types';
import { formatLapTime } from '../utils/formatTime';

interface TitleOverlayProps {
  config: RaceConfig;
  bestLapDry: number | null;
  bestLapWet: number | null;
  gamepadConnected: boolean;
  gamepadName: string;
  onChangeConfig: (next: RaceConfig) => void;
  onStartRace: () => void;
}

function buildCircuitSvgPath(track: TrackData): string {
  const { minX, maxX, minZ, maxZ } = track.bounds;
  const w = maxX - minX || 1;
  const h = maxZ - minZ || 1;
  const scale = Math.min(118 / w, 88 / h);
  const ox = (130 - w * scale) * 0.5;
  const oy = (100 - h * scale) * 0.5;
  const step = Math.max(4, Math.floor(track.samples.length / 180));
  const pts: string[] = [];
  for (let i = 0; i < track.samples.length; i += step) {
    const p = track.samples[i].pos;
    const x = ox + (p.x - minX) * scale;
    const y = oy + (p.z - minZ) * scale;
    pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `${pts.join(' ')} Z`;
}

const CIRCUIT_PATHS: Record<TrackId, string> = {
  interlagos: buildCircuitSvgPath(getTrack('interlagos')),
  monza: buildCircuitSvgPath(getTrack('monza')),
  spa: buildCircuitSvgPath(getTrack('spa')),
};

const DIFFICULTY_OPTIONS: Array<{ id: DifficultyLevel; label: string }> = [
  { id: 'iniciante', label: 'Iniciante' },
  { id: 'competitivo', label: 'Competitivo' },
  { id: 'pro', label: 'Pro' },
  { id: 'lendario', label: 'Lendário' },
];

export function TitleOverlay({
  config,
  bestLapDry,
  bestLapWet,
  gamepadConnected,
  gamepadName,
  onChangeConfig,
  onStartRace,
}: TitleOverlayProps) {
  const [panel, setPanel] = useState('Sessão');
  const trackId: TrackId = config.trackId ?? 'interlagos';
  const mode: RaceMode = config.mode ?? 'race';
  const difficulty: DifficultyLevel = config.difficulty ?? 'competitivo';
  const selectedStudy=studyFromQuery(new URLSearchParams(window.location.search).get('car') ?? 'mcl40');
  const selectedTeam = getPlayerTeamPreset(selectedStudy?.teamId ?? config.teamId);
  const activeTrack = getTrack(trackId);
  const circuitPath = CIRCUIT_PATHS[trackId];

  const grid = selectedStudy && mode === 'race'
    ? gridRoster(selectedStudy.id, selectedStudy.number)
    : [];

  const setWeather = (weather: WeatherCondition) => {
    onChangeConfig({ ...config, weather });
  };

  return (
    <div className="paddock-menu fixed inset-0 z-20 flex flex-col justify-between pointer-events-none bg-gradient-to-r from-[#090b0f]/95 via-[#090b0f]/75 to-transparent overflow-y-auto">
      <div className="flex-1 flex items-center px-6 sm:px-10 md:px-14 lg:px-20 py-6">
        <div className="session-card w-full max-w-[620px] pointer-events-auto">
          {/* Dynamic Circuit Silhouette & Lockup */}
          <div className="flex items-center gap-4 mb-4">
            <svg
              viewBox="0 0 130 100"
              className="w-20 h-16 shrink-0"
              aria-hidden="true"
            >
              <path
                d={circuitPath}
                fill="none"
                stroke="#1e293b"
                strokeWidth="7"
                strokeLinejoin="round"
              />
              <path
                d={circuitPath}
                fill="none"
                stroke="#ef4444"
                strokeWidth="3.2"
                strokeLinejoin="round"
              />
            </svg>
            <div className="min-w-0">
              <p className="text-[11px] font-medium tracking-[0.18em] text-slate-400 uppercase truncate">
                {activeTrack.meta.name} · {activeTrack.meta.lengthMeters.toLocaleString('pt-BR')} m
              </p>
              <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-none mt-1 uppercase">
                {activeTrack.meta.shortName} <span className="text-[#ef4444]">GP</span>
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                {activeTrack.meta.country} · Desnível {activeTrack.meta.elevationSpan} m · {activeTrack.meta.subtitle}
              </p>
            </div>
          </div>

          <p className="text-sm text-slate-300 mb-4">
            {mode === 'race' ? 'Corrida GP' : mode === 'practice' ? 'Treino livre' : 'Contra o relógio'} · {config.weather === 'wet' ? 'Pista molhada' : 'Pista seca'} · {selectedStudy?.label.split(' · ')[0] ?? selectedTeam.teamName}
          </p>

          <nav aria-label="Configuração da sessão" className="session-nav">
            {['Sessão','Garagem','Pilotagem'].map(name => <button key={name} type="button" aria-pressed={panel === name} onClick={() => setPanel(name)}>{name}</button>)}
          </nav>
          {/* Circuit, Mode, Difficulty & Assist Controls */}
          <div className="space-y-3 mb-5 bg-[#0d1016]/90 border border-white/10 rounded-lg p-4">
            <section hidden={panel !== 'Sessão'}>{/* Circuit Picker */}
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-slate-300 shrink-0">Circuito</span>
              <div className="flex items-center gap-1 p-1 bg-[#161a23] rounded-md">
                {TRACK_MENU.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    data-track={t.id}
                    onClick={() => onChangeConfig({ ...config, trackId: t.id })}
                    className={`px-2.5 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      trackId === t.id
                        ? 'bg-[#ef4444] text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {t.shortName}
                  </button>
                ))}
              </div>
            </div>

            </section><section hidden={panel !== 'Garagem'} className="space-y-3"><div className="space-y-1.5">
              <label htmlFor="vehicle-model" className="text-xs font-medium text-slate-300">Modelo 3D do jogador</label>
              <select id="vehicle-model" value={selectedStudy?.id ?? 'original'} className="w-full bg-[#161a23] text-white text-sm rounded border border-white/20 p-2 cursor-pointer"
                onChange={event=>{const url=new URL(window.location.href); if(event.target.value)url.searchParams.set('car',event.target.value);else url.searchParams.delete('car');url.searchParams.delete('autostart');window.location.assign(url.href);}}>
                <option value="original">Original · pintura personalizável</option>
                {VEHICLE_STUDIES.map(study=><option key={study.id} value={study.id}>{study.label}</option>)}
              </select>
              {grid.length > 0 && (
                <details className="text-xs text-slate-300">
                  <summary className="cursor-pointer py-2">Grid de largada · {grid.length} pilotos</summary>
                  <ol className="grid grid-cols-2 gap-x-4 gap-y-1 py-2">
                    {grid.map((driver, i) => (
                      <li key={driver.id} className="border-l-2 pl-2" style={{borderColor: driver.primaryColor}}>
                        {i + 1}. {driver.shortCode} #{driver.number}{driver.id === 'player' ? ' · Você' : ''}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </div>
            {/* Car / Team Picker */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-slate-300 shrink-0">Equipe / Carro</span>
                <span className="text-xs font-semibold text-white truncate">
                  #{selectedStudy?.number ?? selectedTeam.number} · {selectedStudy ? selectedStudy.label.split(' · ')[0] : selectedTeam.teamName}
                </span>
              </div>
              {!selectedStudy && <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Equipe e carro">
                {PLAYER_TEAMS.map((team) => {
                  const active = selectedTeam.id === team.id;
                  return (
                    <button
                      key={team.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      data-team={team.id}
                      onClick={() => onChangeConfig({ ...config, teamId: team.id })}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded border text-left transition-colors cursor-pointer ${
                        active
                          ? 'bg-white/12 border-white/60 text-white'
                          : 'bg-[#161a23] border-white/8 text-slate-300 hover:text-white hover:border-white/25'
                      }`}
                    >
                      <span
                        className="w-2.5 h-4 rounded-xs shrink-0 flex flex-col overflow-hidden border border-white/15"
                        aria-hidden="true"
                      >
                        <span className="flex-1" style={{ backgroundColor: team.primaryColor }} />
                        <span className="h-1" style={{ backgroundColor: team.accentColor }} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[10px] font-bold leading-tight truncate">
                          {team.shortCode} #{team.number}
                        </span>
                        <span className="block text-[9px] text-slate-400 leading-tight truncate">
                          {team.teamName}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>}
            </div>

            </section><section hidden={panel !== 'Sessão'} className="space-y-3">{/* Game Mode */}
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-slate-300 shrink-0">Modo de Jogo</span>
              <div className="flex items-center gap-1 p-1 bg-[#161a23] rounded-md">
                <button
                  type="button"
                  data-mode="race"
                  onClick={() => onChangeConfig({ ...config, mode: 'race' })}
                  className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    mode === 'race'
                      ? 'bg-[#f8fafc] text-[#090b0f]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  GP · Regras FIA
                </button>
                <button
                  type="button"
                  data-mode="timetrial"
                  onClick={() => onChangeConfig({ ...config, mode: 'timetrial' })}
                  className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    mode === 'timetrial'
                      ? 'bg-[#06b6d4] text-[#090b0f]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Contra o Relógio
                </button>
                <button type="button" data-mode="practice" aria-pressed={mode === 'practice'} onClick={() => onChangeConfig({...config, mode:'practice'})} className={`px-3 py-1.5 text-xs rounded font-semibold ${mode === 'practice' ? 'bg-white text-black' : 'text-slate-300'}`}>Treino livre</button>
              </div>
            </div>

            {/* Difficulty (Race Mode) OR Time Trial Info */}
            {mode === 'race' ? (
              <>
                <p className="text-xs text-slate-400">Cinco luzes na largada. Sair com as quatro rodas invalida o tempo da volta. A chegada define a classificação.</p>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-slate-300 shrink-0">Dificuldade IA</span>
                  <div className="flex items-center gap-1 p-1 bg-[#161a23] rounded-md">
                    {DIFFICULTY_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        data-difficulty={opt.id}
                        onClick={() => onChangeConfig({ ...config, difficulty: opt.id })}
                        className={`px-2 py-1.5 text-[11px] font-semibold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          difficulty === opt.id
                            ? 'bg-amber-400 text-[#090b0f]'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-slate-300 shrink-0">Distância</span>
                  <div className="flex items-center gap-1 p-1 bg-[#161a23] rounded-md">
                    {[3, 5, 10].map((laps) => (
                      <button
                        key={laps}
                        type="button"
                        onClick={() => onChangeConfig({ ...config, totalLaps: laps })}
                        className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                          config.totalLaps === laps
                            ? 'bg-[#ef4444] text-white'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {laps} Voltas
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between gap-3 py-1 px-2.5 rounded bg-[#161a23]/80 border border-cyan-500/20 text-xs">
                <span className="text-cyan-300 font-medium">Pista Livre · Voltas Contínuas</span>
                <span className="text-slate-400">{mode === 'practice' ? 'Solo · Sem danos ou desgaste' : 'Quebre seu recorde com delta ao vivo'}</span>
              </div>
            )}

            {/* Weather */}
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-slate-300 shrink-0">Condição da Pista</span>
              <div className="flex items-center gap-1 p-1 bg-[#161a23] rounded-md">
                <button
                  type="button"
                  onClick={() => setWeather('dry')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    config.weather === 'dry'
                      ? 'bg-[#f8fafc] text-[#090b0f]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Ensolarado
                </button>
                <button
                  type="button"
                  onClick={() => setWeather('wet')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    config.weather === 'wet'
                      ? 'bg-[#06b6d4] text-[#090b0f]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Pista Molhada
                </button>
              </div>
            </div>

            </section><section hidden={panel !== 'Pilotagem'} className="text-slate-300">
              
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-slate-300 shrink-0">Assistências & Pneus</span>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => onChangeConfig({ ...config, absEnabled: !config.absEnabled })}
                  aria-pressed={config.absEnabled}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    config.absEnabled
                      ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                      : 'bg-[#161a23] border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  ABS {config.absEnabled ? 'On' : 'Off'}
                </button>
                <button
                  type="button"
                  onClick={() => onChangeConfig({ ...config, tcEnabled: !config.tcEnabled })}
                  aria-pressed={config.tcEnabled}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    config.tcEnabled
                      ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                      : 'bg-[#161a23] border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  TC {config.tcEnabled ? 'On' : 'Off'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChangeConfig({ ...config, racingLineEnabled: !config.racingLineEnabled })
                  }
                  aria-pressed={config.racingLineEnabled}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    config.racingLineEnabled
                      ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                      : 'bg-[#161a23] border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  Linha Ideal
                </button>
                <button
                  type="button"
                  disabled={mode === 'practice'} data-tire-wear="true"
                  onClick={() =>
                    onChangeConfig({
                      ...config,
                      tireWearEnabled: config.tireWearEnabled === false,
                    })
                  }
                  aria-pressed={config.tireWearEnabled !== false}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    config.tireWearEnabled !== false
                      ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                      : 'bg-[#161a23] border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  Desgaste {mode !== 'practice' && config.tireWearEnabled !== false ? 'On' : 'Off'}
                </button>
              </div>
            </div>
              <div className="my-3 space-y-2 text-sm"><label className="block"><input type="checkbox" checked={config.startEngineOff??false} onChange={e=>onChangeConfig({...config,startEngineOff:e.target.checked})}/> Começar com motor desligado (I)</label><label className="block"><input type="checkbox" checked={config.manualTransmission??false} onChange={e=>onChangeConfig({...config,manualTransmission:e.target.checked})}/> Câmbio manual (Q / E)</label></div>
            </section>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              data-start="true"
              onClick={onStartRace}
              className="px-7 py-3.5 bg-[#ef4444] hover:bg-[#dc2626] active:scale-[0.99] text-white font-display font-bold text-base tracking-wide rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 shadow-lg"
            >
              {mode === 'timetrial' ? 'Iniciar Contra o Relógio' : mode === 'practice' ? 'Entrar na pista' : 'Iniciar Corrida'}
            </button>

            <div className="text-xs text-slate-400 font-mono-tabular space-y-0.5">
              {bestLapDry !== null && (
                <div>
                  Recorde Seco ({activeTrack.meta.name}):{' '}
                  <span className="text-slate-100 font-semibold">{formatLapTime(bestLapDry)}</span>
                </div>
              )}
              {bestLapWet !== null && (
                <div>
                  Recorde Chuva ({activeTrack.meta.name}):{' '}
                  <span className="text-cyan-300 font-semibold">{formatLapTime(bestLapWet)}</span>
                </div>
              )}
              {gamepadConnected && (
                <div className="flex items-center gap-1.5 text-emerald-300 font-sans pt-0.5">
                  <Gamepad2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate max-w-[230px]">Controle: {gamepadName || 'Conectado'}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Single flat bottom control-hint line */}
      <div className="px-6 sm:px-10 md:px-14 lg:px-20 pb-4">
        <p className="text-xs text-slate-400 tracking-wide">
          Teclado: W/S Acelerar e Frear · A/D Esterçar · Espaço DRS · Shift ERS · L Linha Ideal · C ou 1–5 Câmeras · P Pausar
          {' · '}
          Controle: Analógico Esterçar · RT/LT Acelerar/Frear · Y/RB DRS · B/LB ERS · Start Pausar
        </p>
      </div>
    </div>
  );
}

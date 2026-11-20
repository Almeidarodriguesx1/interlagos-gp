import {useState} from 'react';
import {DrivingControls} from './DrivingControls';
import { AudioControls } from './AudioControls';
import type { CameraMode, TelemetrySnapshot, WeatherCondition } from '../sim/types';
import { formatLapTime } from '../utils/formatTime';

interface PauseModalProps {
  telemetry: TelemetrySnapshot;
  onResume: () => void;
  onRestart: () => void;
  onFinishSession: () => void;
  onReturnTitle: () => void;
  onToggleAssists: (abs: boolean, tc: boolean) => void;
  onToggleRacingLine: (enabled: boolean) => void;
  onToggleTireWear: (enabled: boolean) => void;
  onChangeWeather: (weather: WeatherCondition) => void;
  onSelectCamera: (mode: CameraMode) => void;
  onChangeCameraSettings: (cockpitFov: number, horizonLock: number) => void;
}

export function PauseModal({
  telemetry,
  onResume,
  onRestart,
  onFinishSession,
  onReturnTitle,
  onToggleAssists,
  onToggleRacingLine,
  onToggleTireWear,
  onChangeWeather,
  onSelectCamera,
  onChangeCameraSettings,
}: PauseModalProps) {
  const [panel, setPanel] = useState('Sessão');
  const solo = telemetry.mode !== 'race';
  const isTimeTrial = telemetry.mode === 'timetrial';

  return (
    <div
      className="paddock-menu fixed inset-0 z-30 flex items-center px-4 md:px-14 lg:px-20 py-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-title"
    >
      <div className="session-card w-full max-w-[620px] max-h-[92dvh] overflow-y-auto">
        <div className="flex items-baseline justify-between border-b border-white/10 pb-3 mb-5">
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              {telemetry.trackName} GP · {isTimeTrial ? 'Contra o Relógio' : solo ? 'Treino livre' : telemetry.difficulty}
            </p>
            <h2 id="pause-title" className="font-display text-2xl font-bold text-white mt-0.5">
              {solo ? 'Sessão Pausada' : 'Corrida Pausada'}
            </h2>
          </div>
          <span className="font-mono-tabular text-xs text-slate-300">
            {solo
              ? `Volta ${telemetry.player.lap}`
              : `Volta ${telemetry.player.lap}/${telemetry.totalLaps}`}
          </span>
        </div>

        <nav aria-label="Menu de pausa" className="session-nav flex-wrap">
          {['Sessão','Pilotagem','Câmera','Áudio'].map(name => <button key={name} aria-pressed={panel === name} onClick={() => setPanel(name)}>{name}</button>)}
        </nav>
        <section hidden={panel !== 'Sessão'}>
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          <div className="bg-[#151922] border border-white/8 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">
              {isTimeTrial ? 'Recorde Pessoal' : 'Posição'}
            </div>
            <div className="font-display text-lg font-bold text-white tabular-nums mt-0.5">
              {isTimeTrial
                ? formatLapTime(telemetry.personalRecordTime)
                : `P${telemetry.player.position}`}
            </div>
          </div>
          <div className="bg-[#151922] border border-white/8 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Volta Atual</div>
            <div className="font-mono-tabular text-sm font-semibold text-white mt-1">
              {formatLapTime(telemetry.player.currentLapTime)}
            </div>
          </div>
          <div className="bg-[#151922] border border-white/8 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Melhor da Sessão</div>
            <div className="font-mono-tabular text-sm font-semibold text-cyan-300 mt-1">
              {formatLapTime(telemetry.player.bestLapTime)}
            </div>
          </div>
        </div>

        </section>
        <section hidden={panel !== 'Pilotagem'}>
        <div className="space-y-3 mb-6 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-300">Assistências</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onToggleAssists(!telemetry.absEnabled, telemetry.tcEnabled)}
                className={`px-3 py-1.5 rounded border font-semibold cursor-pointer ${
                  telemetry.absEnabled
                    ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                    : 'bg-[#151922] border-white/10 text-slate-400'
                }`}
              >
                ABS {telemetry.absEnabled ? 'On' : 'Off'}
              </button>
              <button
                type="button"
                onClick={() => onToggleAssists(telemetry.absEnabled, !telemetry.tcEnabled)}
                className={`px-3 py-1.5 rounded border font-semibold cursor-pointer ${
                  telemetry.tcEnabled
                    ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                    : 'bg-[#151922] border-white/10 text-slate-400'
                }`}
              >
                TC {telemetry.tcEnabled ? 'On' : 'Off'}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-300">Linha Ideal (Tracejada)</span>
            <button
              type="button"
              onClick={() => onToggleRacingLine(!telemetry.racingLineEnabled)}
              className={`px-3 py-1.5 rounded border font-semibold cursor-pointer ${
                telemetry.racingLineEnabled
                  ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                  : 'bg-[#151922] border-white/10 text-slate-400'
              }`}
            >
              {telemetry.racingLineEnabled ? 'Ligada' : 'Desligada'}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-300">Desgaste de Pneus</span>
            <button
              type="button"
              disabled={telemetry.mode === 'practice'} onClick={() => onToggleTireWear(!telemetry.tireWearEnabled)}
              className={`px-3 py-1.5 rounded border font-semibold cursor-pointer ${
                telemetry.tireWearEnabled
                  ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                  : 'bg-[#151922] border-white/10 text-slate-400'
              }`}
            >
              {telemetry.tireWearEnabled ? 'Simulação' : 'Desligado'}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-300">Condição</span>
            <div className="flex items-center gap-1 p-1 bg-[#151922] rounded-md">
              <button
                type="button"
                onClick={() => onChangeWeather('dry')}
                className={`px-3 py-1 rounded font-semibold cursor-pointer ${
                  telemetry.weather === 'dry' ? 'bg-white text-[#090b0f]' : 'text-slate-400'
                }`}
              >
                Seco
              </button>
              <button
                type="button"
                onClick={() => onChangeWeather('wet')}
                className={`px-3 py-1 rounded font-semibold cursor-pointer ${
                  telemetry.weather === 'wet' ? 'bg-cyan-400 text-[#090b0f]' : 'text-slate-400'
                }`}
              >
                Molhado
              </button>
            </div>
          </div>

          <DrivingControls/>
        </div></section>
        <section hidden={panel !== 'Câmera'}><div className="space-y-3 mb-5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-300">Câmera Ativa</span>
            <select
              aria-label="Selecionar Câmera"
              value={telemetry.activeCamera}
              onChange={(e) => onSelectCamera(e.target.value as CameraMode)}
              className="bg-[#151922] border border-white/12 text-white rounded px-2.5 py-1.5 text-xs"
            >
              <option value="cockpit">1 · Cockpit Halo</option>
              <option value="tcam">2 · T-Cam Onboard</option>
              <option value="chase">3 · Chase Dinâmica</option>
              <option value="trackside">4 · TV Trackside</option>
              <option value="helicopter">5 · Helicóptero</option>
            </select>
          </div>


          <div className="pt-1 border-t border-white/8 space-y-2.5">
            <div>
              <div className="flex items-center justify-between text-slate-300 mb-1">
                <span>FOV Cockpit</span>
                <span className="font-mono-tabular text-cyan-300 font-semibold">
                  {Math.round(telemetry.cockpitFov)}°
                </span>
              </div>
              <input
                type="range"
                aria-label="FOV Cockpit"
                min={68}
                max={86}
                step={1}
                value={telemetry.cockpitFov}
                onChange={(e) =>
                  onChangeCameraSettings(Number(e.target.value), telemetry.horizonLock)
                }
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-slate-300 mb-1">
                <span>Estabilização do Horizonte</span>
                <span className="font-mono-tabular text-emerald-300 font-semibold">
                  {Math.round(telemetry.horizonLock * 100)}%
                </span>
              </div>
              <input
                type="range"
                aria-label="Estabilização do Horizonte"
                min={0}
                max={100}
                step={5}
                value={Math.round(telemetry.horizonLock * 100)}
                onChange={(e) =>
                  onChangeCameraSettings(telemetry.cockpitFov, Number(e.target.value) / 100)
                }
                className="w-full accent-emerald-400 cursor-pointer"
              />
            </div>
          </div>
        </div>

        </section>
        {panel === 'Áudio' && <div className="mb-5"><AudioControls /></div>}
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="w-full py-2.5 bg-[#ef4444] hover:bg-[#dc2626] text-white font-display font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Continuar
          </button>
          {isTimeTrial && (
            <button
              type="button"
              onClick={onFinishSession}
              className="w-full py-2.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 text-xs font-semibold rounded-lg border border-cyan-400/40 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Encerrar Sessão & Ver Tempos
            </button>
          )}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onRestart}
              className="py-2.5 bg-[#191e28] hover:bg-[#232a38] text-slate-200 text-xs font-semibold rounded-lg border border-white/10 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Reiniciar
            </button>
            <button
              type="button"
              onClick={onReturnTitle}
              className="py-2.5 bg-[#191e28] hover:bg-[#232a38] text-slate-200 text-xs font-semibold rounded-lg border border-white/10 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Voltar ao Menu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

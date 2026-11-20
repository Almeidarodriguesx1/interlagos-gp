import type { TelemetrySnapshot } from '../sim/types';
import { formatGap, formatLapTime } from '../utils/formatTime';

interface ResultsModalProps {
  telemetry: TelemetrySnapshot;
  onRestart: () => void;
  onReturnTitle: () => void;
}

export function ResultsModal({ telemetry, onRestart, onReturnTitle }: ResultsModalProps) {
  const { player, standings, fastestLap, raceTime, mode, trackName, personalRecordTime } = telemetry;
  const isTimeTrial = mode === 'timetrial';
  const beatRecord =
    player.bestLapTime !== null &&
    personalRecordTime !== null &&
    player.bestLapTime <= personalRecordTime + 1e-4;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-[#06080b]/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="results-title"
    >
      <div className="w-full max-w-xl bg-[#0e1117] border border-white/14 rounded-xl p-6 shadow-2xl">
        <div className="flex items-baseline justify-between border-b border-white/10 pb-3 mb-4">
          <div>
            <p className="text-xs font-medium text-emerald-400 uppercase tracking-wider">
              {isTimeTrial
                ? `Contra o Relógio · ${trackName}`
                : `Bandeira Quadriculada · ${trackName}`}
            </p>
            <h2 id="results-title" className="font-display text-2xl font-extrabold text-white mt-0.5">
              {isTimeTrial
                ? beatRecord
                  ? 'Novo Recorde Pessoal!'
                  : 'Resumo da Sessão'
                : `Resultado Oficial · P${player.position}`}
            </h2>
          </div>
          <div className="text-right font-mono-tabular text-xs text-slate-300">
            <div>Tempo Total: {formatLapTime(raceTime)}</div>
            {!isTimeTrial && fastestLap && (
              <div className="text-cyan-300">
                Volta Mais Rápida: {fastestLap.driverName} ({formatLapTime(fastestLap.time)})
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5 mb-4">
          <div className="bg-[#151922] border border-white/8 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">
              {isTimeTrial ? 'Recorde da Pista' : 'Posição Final'}
            </div>
            <div className="font-display text-xl font-extrabold text-white tabular-nums mt-1">
              {isTimeTrial ? (
                formatLapTime(personalRecordTime)
              ) : (
                <>
                  P{player.position} <span className="text-xs text-slate-400">/ {player.totalCars}</span>
                </>
              )}
            </div>
          </div>
          <div className="bg-[#151922] border border-white/8 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Sua Melhor Volta</div>
            <div className="font-mono-tabular text-sm font-semibold text-cyan-300 mt-1.5">
              {formatLapTime(player.bestLapTime)}
            </div>
          </div>
          <div className="bg-[#151922] border border-white/8 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Última Volta</div>
            <div className="font-mono-tabular text-sm font-semibold text-white mt-1.5">
              {formatLapTime(player.lastLapTime)}
            </div>
          </div>
        </div>

        {/* Standings Table (Race) or Time Trial Summary */}
        {!isTimeTrial ? (
          <div className="max-h-56 overflow-y-auto border border-white/10 rounded-lg mb-5">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#151922] text-slate-400 sticky top-0">
                <tr>
                  <th className="py-2 px-3 font-medium">Pos</th>
                  <th className="py-2 px-3 font-medium">Piloto</th>
                  <th className="py-2 px-3 font-medium">Equipe</th>
                  <th className="py-2 px-3 font-medium text-right">Melhor Volta</th>
                  <th className="py-2 px-3 font-medium text-right">Diferença</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8 font-mono-tabular">
                {standings.map((row) => (
                  <tr
                    key={row.id}
                    className={row.isPlayer ? 'bg-red-500/15 text-white font-semibold' : 'text-slate-300'}
                  >
                    <td className="py-1.5 px-3">{row.position}</td>
                    <td className="py-1.5 px-3 font-sans">
                      <span
                        className="inline-block w-1.5 h-3 rounded-xs mr-2 align-middle"
                        style={{ backgroundColor: row.primaryColor }}
                      />
                      {row.name}
                    </td>
                    <td className="py-1.5 px-3 font-sans text-slate-400">{row.teamName}</td>
                    <td className="py-1.5 px-3 text-right">{formatLapTime(row.bestLapTime)}</td>
                    <td className="py-1.5 px-3 text-right">{formatGap(row.gapSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-[#151922] border border-white/10 rounded-lg p-4 mb-5 text-xs text-slate-300 flex items-center justify-between">
            <span>
              Condição: <strong className="text-white">{telemetry.weather === 'wet' ? 'Pista Molhada' : 'Ensolarado'}</strong>
            </span>
            <span>
              Voltas Completas: <strong className="text-white tabular-nums">{Math.max(0, player.lap - 1)}</strong>
            </span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            data-start="true"
            onClick={onRestart}
            className="flex-1 py-3 bg-[#ef4444] hover:bg-[#dc2626] text-white font-display font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {isTimeTrial ? 'Nova Sessão' : 'Correr Novamente'}
          </button>
          <button
            type="button"
            onClick={onReturnTitle}
            className="px-5 py-3 bg-[#191e28] hover:bg-[#232a38] text-slate-200 text-xs font-semibold rounded-lg border border-white/10 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Menu Inicial
          </button>
        </div>
      </div>
    </div>
  );
}

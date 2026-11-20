export function formatLapTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    return '--:--.---';
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

export function formatGap(seconds: number): string {
  if (seconds <= 0.01) return 'LÍDER';
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const rem = (seconds % 60).toFixed(1);
    return `+${mins}m${rem}s`;
  }
  return `+${seconds.toFixed(1)}s`;
}

import type { DriverRosterEntry } from "./raceDirector";

export const teams2026 = [
  { model: 'rb22', name: 'Red Bull', color: '#20396a', drivers: [['Max Verstappen', 'VER', 3], ['Isack Hadjar', 'HAD', 6]] },
  { model: 'sf26', name: 'Ferrari', color: '#df2228', drivers: [['Charles Leclerc', 'LEC', 16], ['Lewis Hamilton', 'HAM', 44]] },
  { model: 'mcl40', name: 'McLaren', color: '#ff8000', drivers: [['Lando Norris', 'NOR', 1], ['Oscar Piastri', 'PIA', 81]] },
  { model: 'w17', name: 'Mercedes', color: '#23cbb7', drivers: [['George Russell', 'RUS', 63], ['Kimi Antonelli', 'ANT', 12]] },
  { model: 'amr26', name: 'Aston Martin', color: '#00765c', drivers: [['Fernando Alonso', 'ALO', 14], ['Lance Stroll', 'STR', 18]] },
  { model: 'fw48', name: 'Williams', color: '#2262cf', drivers: [['Alex Albon', 'ALB', 23], ['Carlos Sainz', 'SAI', 55]] },
  { model: 'vf26', name: 'Haas', color: '#eeeeee', drivers: [['Oliver Bearman', 'BEA', 87], ['Esteban Ocon', 'OCO', 31]] },
  { model: 'a526', name: 'Alpine', color: '#259ddb', drivers: [['Pierre Gasly', 'GAS', 10], ['Franco Colapinto', 'COL', 43]] },
  { model: 'vcarb03', name: 'Racing Bulls', color: '#8694ff', drivers: [['Liam Lawson', 'LAW', 30], ['Arvid Lindblad', 'LIN', 41]] },
  { model: 'r26', name: 'Audi', color: '#e34030', drivers: [['Nico Hülkenberg', 'HUL', 27], ['Gabriel Bortoleto', 'BOR', 5]] },
  { model: 'mac26', name: 'Cadillac', color: '#aaaaae', drivers: [['Sergio Pérez', 'PER', 11], ['Valtteri Bottas', 'BOT', 77]] },
] as const;

export function gridRoster(playerModel: string, playerNumber: number): DriverRosterEntry[] {
  const cars: DriverRosterEntry[] = [];
  for (const seat of [0, 1] as const) {
    for (const team of teams2026) {
      const [name, shortCode, number] = team.drivers[seat];
      cars.push({ id: number === playerNumber && team.model === playerModel ? 'player' : 'ai-' + number,
        name, shortCode, number, teamName: team.name, primaryColor: team.color,
        accentColor: '#202328', helmetColor: seat ? '#f5d542' : '#f2f2ef',
        aiSkill: .99 - cars.length * .003, aiAggression: .88 - cars.length * .005 });
    }
  }
  return [...cars.filter(car => car.id !== 'player'), ...cars.filter(car => car.id === 'player')];
}

// scripts/prepare-audio.ts
// Rode com: bun run scripts/prepare-audio.ts
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, parse } from 'node:path';

const RAW_DIR = './raw-audio';
const OUT_DIR = './public/audio';

const REQUIRED_FILES = [
  'engine_idle.ogg',
  'engine_low.ogg',
  'engine_mid.ogg',
  'engine_high.ogg',
  'engine_limiter.ogg',
  'engine_off_throttle.ogg',
  'gear_upshift.ogg',
  'gear_downshift.ogg',
  'exhaust_backfire.ogg',
  'tire_screech.ogg',
  'kerb_rumble.ogg',
  'gravel_grass.ogg',
  'wind_aero.ogg',
  'collision_carbon.ogg',
];

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

if (existsSync(RAW_DIR)) {
  for (const file of readdirSync(RAW_DIR)) {
    const { name, ext } = parse(file);
    if (!['.wav', '.mp3', '.flac', '.ogg'].includes(ext.toLowerCase())) continue;

    const input = join(RAW_DIR, file);
    const output = join(OUT_DIR, `${name}.ogg`);

    // Converte para OGG Vorbis 44.1kHz Mono e normaliza pico em -6dB
    Bun.spawnSync([
      'ffmpeg',
      '-y',
      '-i',
      input,
      '-ac',
      '1',
      '-ar',
      '44100',
      '-af',
      'loudnorm=I=-16:TP=-6:LRA=11',
      '-c:a',
      'libvorbis',
      '-q:a',
      '6',
      output,
    ]);
    console.log(`Convertido: ${output}`);
  }
}

const missing = REQUIRED_FILES.filter((f) => !existsSync(join(OUT_DIR, f)));
if (missing.length > 0) {
  console.warn('\nArquivos pendentes em public/audio/:');
  missing.forEach((f) => console.warn(` - ${f}`));
} else {
  console.log('\nTodos os 14 efeitos sonoros estão prontos em public/audio/!');
}

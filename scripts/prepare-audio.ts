import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, parse } from 'node:path';
import { spawnSync } from 'node:child_process';
// Preserve source dynamics; edit level and loop boundaries before export.
const input='raw-audio', output='public/audio';
mkdirSync(output,{recursive:true});
if(!existsSync(input)) { console.error('Adicione gravações licenciadas em raw-audio/.'); process.exit(1); }
let count=0;
for(const file of readdirSync(input)) {
 const {name,ext}=parse(file);
 if(!['.wav','.flac','.mp3','.ogg'].includes(ext.toLowerCase()))continue;
 if(!/^[a-z0-9_-]+$/.test(name))throw new Error('Nome inválido: '+name);
 const result=spawnSync('ffmpeg',['-v','error','-y','-i',join(input,file),'-ac','1','-ar','48000','-c:a','pcm_s16le',join(output,name+'.wav')],{stdio:'inherit'});
 if(result.error || result.status!==0) { console.error('Falhou:',file,result.error?.message??'');process.exit(1); }
 console.log('Convertido:',name+'.wav');count++;
}
if(count===0) {console.error('Nenhum arquivo de áudio encontrado.');process.exit(1);}

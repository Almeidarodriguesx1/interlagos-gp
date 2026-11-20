import {onboardRate,onboardWeights} from './onboardTuning';
import { provisionalMotor, perspective } from './audioTuning';
import { calibrationErrors, mixInto, type BandMix } from './engineCalibration';
import { readMix } from './mixerSettings';
import type { AudioUpdateParams } from './F1AudioEngine';
import type { WheelContact } from './surfaces';
import approval from './engine-approval.json';
const ONBOARD_IDS=['engine_onboard','engine_onboard_alt1','engine_onboard_alt2'];
const BANDS = [4200,6300,8400,10500,12300];
const ENGINE = ['engine_idle','engine_low','engine_mid','engine_high','engine_limiter'];
const IDS = [...ENGINE,'engine_off_throttle','engine_provisional','engine_onboard','engine_onboard_alt1','engine_onboard_alt2','rain_ambient','asphalt','kerb_rumble','grass','dirt','gravel','water','tire_screech','wind_aero','gear_upshift','gear_downshift','gravel_brake','collision_carbon','countdown','race_start','record','crowd_stands','crowd_start','radio_start'];

type Voice = { source: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode; filter: BiquadFilterNode; frame: number };
export function engineMix(rpm:number) { return mixInto(rpm,BANDS,Array.from({length:5},()=>({gain:0,rate:1}))); }
/** Only recorded buffers enter this graph. Missing categories remain silent. */
export class RecordedAudioEngine {
 private ctx: AudioContext | null=null;
 private master: GainNode | null=null;
 private buses=new Map<string,GainNode>();
 private buffers=new Map<string,AudioBuffer>();
 private voices=new Map<string,Voice>();
 private shots=new Set<AudioBufferSourceNode>();
 private selectedMotor='engine_onboard';
 private readonly onboardMix=new Float32Array(3);
 private previewUntil=0; private previewId=''; private previewBus=''; private previewOnboard=true;
 private launchCheerPending=false;
 private shiftUntil=0; private gravelBrakeAt=-1; private shiftDirection=0;
 private rivalGears = new Map<number,number>();
 private frame=0;
 private readonly centers=approval.bands.map(b=>b.nativeRpm);
 private readonly playerMix:BandMix[]=Array.from({length:5},()=>({gain:0,rate:1}));
 private readonly rivalMix:BandMix[]=Array.from({length:5},()=>({gain:0,rate:1}));
 private readonly abort=new AbortController();
 private lastCamera: {x:number;z:number;time:number} | null=null;
 private muted=false; private paused=false; private gear=0; private impactAt=-1; private disposed=false;
 public readonly status={loaded:[] as string[],missing:[] as string[],engineReady:false,decodedBytes:0,contacts:[] as WheelContact[],loading:true,errors:{} as Record<string,string>,engineIssues:[] as string[],activeLoops:0,enginePlayable:false,engineMode:'unavailable',contextState:'uninitialized',playbackError:'',motorRate:1,motorCutoff:16000};
 public init() {
  if(this.disposed)return;
  if(this.ctx){void this.resumeAudio();return;}
  const ctx=this.ctx=new AudioContext();
  this.master=ctx.createGain();this.master.gain.value=.65;
  const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-6;limiter.knee.value=3;limiter.ratio.value=12;
  this.master.connect(limiter);limiter.connect(ctx.destination);
  for(const name of ['engine','surfaces','wind','impacts','ui','rain','rivals','crowd']){const bus=ctx.createGain();bus.connect(this.master);this.buses.set(name,bus);}
  for(const [bus,value] of Object.entries(readMix()))this.setVolume(bus,value);
  void this.resumeAudio();void this.load(ctx);
  // Opt-in developer inspection, never a claim that missing assets are installed.
  (window as unknown as {interlagosAudio:unknown}).interlagosAudio=this;
 }
 private async load(ctx:AudioContext) {
  let cursor=0;
  const loadOne=async(id:string)=>{
   for(const extension of id.startsWith('engine_ext_') ? ['ogg'] : ['wav','ogg']){
    try{
     const response=await fetch(`${(import.meta.env?.BASE_URL ?? '/')}audio/${id}.${extension}`,{signal:this.abort.signal});
     if(!response.ok || response.headers.get('content-type')?.includes('text/html'))continue;
     const bytes=await response.arrayBuffer();
     if(bytes.byteLength>25*1024*1024)throw new Error('Arquivo excede 25 MB');
     const buffer=await ctx.decodeAudioData(bytes);
     if(this.disposed)return;
     const size=buffer.length*buffer.numberOfChannels*4;
     if(buffer.duration<=0 || this.status.decodedBytes+size>64*1024*1024)throw new Error('Banco excede orçamento de 64 MiB');
     delete this.status.errors[id];this.buffers.set(id,buffer);this.status.loaded.push(id);this.status.decodedBytes+=size;return;
    }catch(error){if(this.disposed)return;this.status.errors[id]=String(error);}
   }
   this.status.missing.push(id);
  };
  const bank = await fetch((import.meta.env?.BASE_URL ?? '/')+'audio/team-banks.json',{signal:this.abort.signal})
    .then(r=>r.ok?r.json():[]).catch(()=>[]);
  const entries: string[] = Array.isArray(bank) ? bank.filter((id: unknown): id is string =>
    typeof id==='string' && /^teams\/[a-z0-9-]+\/(cockpit|external|gear_upshift|gear_downshift)$/.test(id)) : [];
  const ids=[...IDS,...new Set(entries),'engine_ext_on_7900','engine_ext_off_8500'];
  const worker=async()=>{while(cursor<ids.length&&!this.disposed)await loadOne(ids[cursor++]);};
  await Promise.all([worker(),worker(),worker()]);
  if(this.disposed)return;
  this.status.engineIssues=calibrationErrors(approval);
  for(const id of [...ENGINE,'engine_off_throttle'])if(!this.buffers.has(id))this.status.engineIssues.push('Amostra ausente: '+id);
  this.status.engineReady=this.status.engineIssues.length===0;
  this.status.enginePlayable=this.status.engineReady||this.buffers.has('engine_onboard')||this.buffers.has('engine_provisional');
  if(!this.buffers.has('engine_onboard'))this.selectedMotor='engine_provisional';
  this.status.engineMode=this.status.engineReady?'recorded-calibrated':this.selectedMotor==='engine_onboard'?'recorded-onboard-experimental':this.buffers.has('engine_provisional')?'recorded-provisional':'unavailable';
  // Prepare all persistent voices before declaring loading complete.
  for(const wheel of ['FL','FR','RL','RR']){
   for(const id of ['asphalt','kerb_rumble','grass','dirt','gravel'])this.loop(wheel+id,id,'surfaces',0);
   this.loop(wheel+'water','water','surfaces',0);this.loop(wheel+'slip','tire_screech','surfaces',0);
  }
  this.loop('wind','wind_aero','wind',0);
  this.loop('rain','rain_ambient','rain',0);
  this.loop('onboard','engine_onboard','engine',0);
  this.loop('onboard:1','engine_onboard_alt1','engine',0);this.loop('onboard:2','engine_onboard_alt2','engine',0);
  if(!this.status.engineReady)this.loop(this.selectedMotor==='engine_onboard'?'onboard':'provisional',this.selectedMotor,'engine',0);
  if(this.status.engineReady){for(let i=0;i<5;i++){
   this.loop(ENGINE[i],ENGINE[i],'engine',0);
   for(let rival=0;rival<3;rival++)this.loop(`rival${rival}:${i}`,ENGINE[i],'rivals',0);
  }this.loop('overrun','engine_off_throttle','engine',0);}
  this.status.loading=false;
  if(!this.disposed)console.info('[Áudio gravado]',this.status);
 }
 private async resumeAudio(){
  if(!this.ctx)return;
  try {await this.ctx.resume();this.status.contextState=this.ctx.state;this.status.playbackError='';}
  catch(error){this.status.playbackError=String(error);}
 }
 public async testAudio(id='engine_provisional',onboard=true):Promise<string>{
  this.init();await this.resumeAudio();
  if(this.status.loading)return 'Áudio carregando. Tente novamente em instantes.';
  if(this.muted)return 'O jogo está no mudo. Desative o mudo para testar.';
  if(!this.ctx||this.ctx.state!=='running')return 'O navegador ainda não liberou o áudio. Clique novamente.';
  if(id==='rival_pass'){this.previewId=this.selectedMotor;this.previewBus='rivals';this.previewOnboard=onboard;this.previewUntil=this.ctx.currentTime+5;this.preview();return 'Prévia de passagem por 5 segundos. Ajuste Adversários / passagem.';}
  this.previewBus='';
  const allowed=['engine_onboard','rain_ambient','engine_provisional','asphalt','kerb_rumble','grass','gravel','tire_screech','gear_upshift','gear_downshift','gravel_brake','crowd_stands','crowd_start'];
  if(!allowed.includes(id)||!this.buffers.has(id))return 'Gravação indisponível para esta categoria.';
  if(id==='crowd_start'){this.event(id,'crowd',.27,1,onboard?3900:9000,undefined,true);return 'Reação gravada da torcida reproduzida.';}
  if(id.startsWith('gear')){this.event(id,'impacts',.3,1,perspective(onboard,0).surfaceCutoff,undefined,true);return 'Transiente gravado reproduzido.';}
  this.previewId=id;this.previewOnboard=onboard;this.previewUntil=this.ctx.currentTime+5;
  this.preview();
  return 'Teste reproduzido pela mesma categoria e filtragem da corrida. O motor usa a afinação original como referência.';
 }
 public getMotor(){return this.selectedMotor;}
 public selectMotor(id:string){if((id==='engine_onboard'||id==='engine_provisional')&&this.buffers.has(id)){this.selectedMotor=id;this.status.engineMode=id==='engine_onboard'?'recorded-onboard-experimental':'recorded-provisional';}}
 public stopPreview(){this.previewUntil=0;this.previewId='';this.silence();}
 private preview(){
  if(!this.ctx||this.muted||this.ctx.currentTime>=this.previewUntil)return;
  const id=this.previewId,bus=this.previewBus||(id.startsWith('engine_')?'engine':id==='rain_ambient'?'rain':id==='crowd_stands'?'crowd':id.startsWith('gear')?'impacts':'surfaces');
  const profile=perspective(this.previewOnboard,0);
  const t=this.ctx.currentTime-(this.previewUntil-5),pan=bus==='rivals'?Math.max(-1,Math.min(1,t/2.5-1)):0;
  if(id==='engine_onboard'&&bus==='engine'){this.onboard('monitor:onboard',.45,1,this.previewOnboard,profile.engineCutoff);return;}
  this.loop('monitor:'+id+bus,id,bus,bus==='rivals'?.3/(1+((t-2.5)*.6)**2):id.startsWith('engine_')?.45:.2,bus==='rivals'?1.1-t*.04:1,pan,this.previewOnboard,bus==='engine'?profile.engineCutoff:profile.surfaceCutoff);
 }
 public setVolume(bus:string,value:number){const node=bus==='master'?this.master:this.buses.get(bus);if(node&&this.ctx)node.gain.setTargetAtTime(Math.max(0,Math.min(1,value))**2,this.ctx.currentTime,.025);}
 public setMuted(value:boolean){this.muted=value;if(value){this.silence();for(const shot of this.shots)shot.stop();this.shots.clear();}}
 public setPaused(value:boolean){this.paused=value;if(value){this.silence();for(const shot of this.shots)shot.stop();this.shots.clear();}else if(this.ctx)void this.resumeAudio();}
 private silence(){this.launchCheerPending=false;if(!this.ctx)return;for(const v of this.voices.values())v.gain.gain.setTargetAtTime(0,this.ctx.currentTime,.015);}
 private loop(key:string,id:string,bus:string,gain:number,rate=1,pan=0,onboard=false,cutoff?:number){
  const ctx=this.ctx,buffer=this.buffers.get(id);if(!ctx||!buffer)return;
  let v=this.voices.get(key);
  if(!v){const source=ctx.createBufferSource(),g=ctx.createGain(),p=ctx.createStereoPanner(),filter=ctx.createBiquadFilter();source.buffer=buffer;source.loop=true;g.gain.value=0;filter.type='lowpass';source.connect(filter);filter.connect(g);g.connect(p);p.connect(this.buses.get(bus)!);source.start(0,bus==='engine'?0:(this.voices.size*.173)%buffer.duration);v={source,gain:g,pan:p,filter,frame:this.frame};this.voices.set(key,v);}
  v.frame=this.frame;
  v.gain.gain.setTargetAtTime(gain,ctx.currentTime,.03);v.source.playbackRate.setTargetAtTime(rate,ctx.currentTime,.025);v.pan.pan.setTargetAtTime(pan,ctx.currentTime,.04);v.filter.frequency.setTargetAtTime(cutoff??(bus==='engine'?perspective(onboard,0).engineCutoff:perspective(onboard,0).surfaceCutoff),ctx.currentTime,.04);
 }
 private onboard(key:string,level:number,rate:number,onboard:boolean,cutoff:number){
  if(!this.ctx)return;
  const ids=ONBOARD_IDS;
  if(!this.buffers.has(ids[1])||!this.buffers.has(ids[2])){this.loop(key,ids[0],'engine',level,rate,0,onboard,cutoff);return;}
  const weights=onboardWeights(this.ctx.currentTime,this.onboardMix);
  for(let i=0;i<3;i++)this.loop(i===0?key:key+':'+i,ids[i],'engine',level*weights[i],rate,0,onboard,cutoff);
 }
 private event(id:string,bus='ui',level=.3,rate=1,cutoff=16000,duration?:number,preview=false,panValue=0){
  const ctx=this.ctx,buffer=this.buffers.get(id);if(!ctx||!buffer||this.muted||(this.paused&&!preview)||this.shots.size>=12)return;
  const source=ctx.createBufferSource(),gain=ctx.createGain(),filter=ctx.createBiquadFilter(),pan=ctx.createStereoPanner();source.buffer=buffer;source.playbackRate.value=rate;gain.gain.value=level;filter.type='lowpass';filter.frequency.value=cutoff;
  pan.pan.value=panValue;source.connect(filter);filter.connect(gain);gain.connect(pan);pan.connect(this.buses.get(bus)!);this.shots.add(source);source.onended=()=>{this.shots.delete(source);source.disconnect();filter.disconnect();gain.disconnect();pan.disconnect();};source.start();if(duration)source.stop(ctx.currentTime+duration);
 }
 public playCountdownBeep(go:boolean, race=true){
  this.event(go?'race_start':'countdown');
  if(go && race && !this.paused && !this.muted){
   this.launchCheerPending=true;
   this.event('radio_start','ui',.30,1,3800);
  }
 }
 public playRecordChime(){this.event('record');}
 public update(p:AudioUpdateParams & {contacts:WheelContact[];crowdSources?:readonly {x:number;y:number;z:number}[]}){
  if(!this.ctx)return;
  this.status.contextState=this.ctx.state;
  if(this.status.loading||!p.active||this.paused||this.muted){this.silence();this.rivalGears.clear();this.gear=p.gear;this.lastCamera=null;this.launchCheerPending=false;this.preview();return;}
  let cameraVx=0,cameraVz=0;
  if(p.cameraPos){const previous=this.lastCamera,dt=previous?this.ctx.currentTime-previous.time:0;if(previous&&dt>0&&dt<.25){const dx=p.cameraPos.x-previous.x,dz=p.cameraPos.z-previous.z;if(Math.hypot(dx,dz)<150*dt){cameraVx=dx/dt;cameraVz=dz/dt;}}this.lastCamera={x:p.cameraPos.x,z:p.cameraPos.z,time:this.ctx.currentTime};}
  // Re-target all persistent voices each frame so a changed surface cannot stick on.
  this.frame++;this.status.contacts=p.contacts;
  if (p.cameraPos && p.crowdSources?.length) {
   let nearestDistance = Infinity, nearestPan = 0;
   for (const [i, source] of p.crowdSources.entries()) {
    const dx=source.x-p.cameraPos.x, dz=source.z-p.cameraPos.z;
    const distance=Math.max(1,Math.hypot(dx,source.y-p.cameraPos.y,dz));
    const pan=Math.max(-1,Math.min(1,(-dx*(p.cameraForward?.z??1)+dz*(p.cameraForward?.x??0))/distance));
    const level=(p.isOnboard?.09:.21)/(1+(distance/32)**2);
    if (distance<120) this.loop('stand:'+i,'crowd_stands','crowd',level,1,pan,false,Math.max(2200,10000-distance*65));
    if (distance<nearestDistance){nearestDistance=distance;nearestPan=pan;}
   }
   if(this.launchCheerPending && nearestDistance<120){
    this.event('crowd_start','crowd',.27/(1+(nearestDistance/38)**2),1,p.isOnboard?3900:9000,undefined,false,nearestPan);
   }
  }
  this.launchCheerPending=false;
  const teamMotor='teams/'+p.modelId+'/'+(p.isOnboard?'cockpit':'external');
  const hasTeamMotor=this.buffers.has(teamMotor);
  if(!hasTeamMotor && this.status.engineReady && p.engineRunning!==false){const mixes=mixInto(p.rpm,this.centers,this.playerMix);mixes.forEach((m,i)=>this.loop(ENGINE[i],ENGINE[i],'engine',m.gain*(.12+.38*p.throttle),m.rate,0,p.isOnboard));this.loop('overrun','engine_off_throttle','engine',(1-p.throttle)*.35,Math.max(.85,Math.min(1.15,p.rpm/approval.offThrottleRpm)),0,p.isOnboard);}
  const distance=p.cameraPos&&p.playerPos?Math.hypot(p.cameraPos.x-p.playerPos.x,p.cameraPos.y-p.playerPos.y,p.cameraPos.z-p.playerPos.z):0;
  const camera=perspective(p.isOnboard??true,distance);
  if(this.gear&&p.gear!==this.gear){
   this.shiftDirection=p.gear>this.gear?1:-1;this.shiftUntil=this.ctx.currentTime+.07;
   const shift=this.shiftDirection>0?'gear_upshift':'gear_downshift';
   const teamShift='teams/'+p.modelId+'/'+shift;
   this.event(this.buffers.has(teamShift)?teamShift:shift,'impacts',(p.isOnboard?.28:.14)*camera.attenuation,1,camera.surfaceCutoff);
  }
  const shiftActive=this.ctx.currentTime<this.shiftUntil;
  if(hasTeamMotor && p.engineRunning!==false){
   this.loop(teamMotor,teamMotor,'engine',provisionalMotor(p.rpm,p.throttle).gain*camera.attenuation*(shiftActive?.78:1),Math.max(.65,Math.min(1.45,p.rpm/8400)),0,p.isOnboard,camera.engineCutoff);
  }
  if(!hasTeamMotor && !this.status.engineReady && p.engineRunning!==false && this.buffers.has(this.selectedMotor)){
   const motor=provisionalMotor(p.rpm,p.throttle);
   const rate=(this.selectedMotor==='engine_onboard'?onboardRate(p.rpm):motor.rate)+(shiftActive&&this.shiftDirection<0?.025:0);
   this.status.motorRate=rate;this.status.motorCutoff=camera.engineCutoff;
   const level=motor.gain*(shiftActive?.78:1)*camera.attenuation;
   if(this.selectedMotor==='engine_onboard')this.onboard('onboard',level,rate,p.isOnboard??true,camera.engineCutoff);
   else this.loop('provisional',this.selectedMotor,'engine',level,rate,0,p.isOnboard,camera.engineCutoff);
  }
  for(const c of p.contacts){
   if(!c.grounded||c.speed<.5)continue;
   const id=c.material==='kerb'?'kerb_rumble':c.material;
   const speed=Math.min(1,c.speed/55),level=(c.material==='asphalt'?.045:c.material==='kerb'?.25:c.material==='gravel'?.32:.28)*speed*c.load*camera.attenuation;
   this.loop(c.wheel+id,id,'surfaces',level,Math.max(.85,Math.min(1.2,.85+c.speed/160)),c.side*.6,p.isOnboard);
   if(p.wet)this.loop(c.wheel+'water','water','surfaces',speed*.05,1,c.side*.6,p.isOnboard);
   if(c.material==='asphalt')this.loop(c.wheel+'slip','tire_screech','surfaces',Math.min(.12,Math.max(0,c.slip-.15)*.16+(p.brake>.35&&c.speed>10?p.brake*.045:0))*speed*camera.attenuation,1,c.side*.6,p.isOnboard);
  }
  if(p.wet)this.loop('rain','rain_ambient','rain',p.isOnboard?.12:.2,1,0,p.isOnboard,11000);
  this.loop('wind','wind_aero','wind',Math.min(.15,p.speedMs*p.speedMs/80000),1,0,p.isOnboard);
  if(p.brake>.4&&p.speedMs>5&&p.contacts.some(c=>c.grounded&&c.material==='gravel')&&this.ctx.currentTime-this.gravelBrakeAt>.45){this.event('gravel_brake','surfaces',.20*camera.attenuation,1,camera.surfaceCutoff);this.gravelBrakeAt=this.ctx.currentTime;}
  this.gear=p.gear;
  if((p.impactIntensity??0)>.15&&this.ctx.currentTime-this.impactAt>.15){this.event('collision_carbon','impacts',Math.min(.5,p.impactIntensity!));this.impactAt=this.ctx.currentTime;}
  // Reuse the same licensed bands for at most three nearby rivals.
  // Bounded nearest-three selection; persistent rival keys belong to the source car, not rank.
  const nearby=(p.rivals??[]).map((r,i)=>({r,i,d:Math.hypot(r.x-(p.cameraPos?.x??0),r.y-(p.cameraPos?.y??0),r.z-(p.cameraPos?.z??0))})).filter(x=>x.d<150).sort((a,b)=>a.d-b.d).slice(0,3);
  for(const {r,i,d} of nearby){
    const dx=r.x-(p.cameraPos?.x??0),dz=r.z-(p.cameraPos?.z??0),dist=Math.max(1,d);
    const towards=-(r.vx*dx+r.vz*dz)/dist;
    const listener=(cameraVx*dx+cameraVz*dz)/dist;
    const doppler=Math.max(.75,Math.min(1.3,(343+listener)/Math.max(180,343-towards)));
    const pan=Math.max(-1,Math.min(1,(-dx*(p.cameraForward?.z??1)+dz*(p.cameraForward?.x??0))/dist));
    const level=.27/(1+(d/18)**2)*(p.isOnboard?.65:1);
    const teamExternal='teams/'+r.modelId+'/external';
    const oldGear=this.rivalGears.get(i);
    if(r.gear!==undefined){
     if(oldGear!==undefined && r.gear!==oldGear){
      const shift=r.gear>oldGear?'gear_upshift':'gear_downshift';
      const teamShift='teams/'+r.modelId+'/'+shift;
      this.event(this.buffers.has(teamShift)?teamShift:shift,'rivals',level*.65,doppler,12000,undefined,false,pan);
     }
     this.rivalGears.set(i,r.gear);
    }
    if(this.buffers.has(teamExternal))this.loop('rival'+i+teamExternal,teamExternal,'rivals',level,Math.max(.65,Math.min(1.45,r.rpm/8400))*doppler,pan,false,Math.max(3500,14000-d*55));
    else if(this.buffers.has('engine_ext_on_7900') && this.buffers.has('engine_ext_off_8500')){
      const slot = nearby.findIndex(entry => entry.i === i);
      const load = Math.max(0, Math.min(1, r.throttle));
      const cutoff = Math.max(3500, 14000 - d * 55);
      this.loop('external-on:'+slot,'engine_ext_on_7900','rivals',level*Math.sqrt(load),r.rpm/7900*doppler,pan,false,cutoff);
      this.loop('external-off:'+slot,'engine_ext_off_8500','rivals',level*Math.sqrt(1-load),r.rpm/8500*doppler,pan,false,cutoff);
    }
    else if(!this.status.engineReady)this.loop('rivalRecorded'+i+this.selectedMotor,this.selectedMotor,'rivals',level,(this.selectedMotor==='engine_onboard'?onboardRate(r.rpm):Math.max(.8,Math.min(1.15,r.rpm/10500)))*doppler,pan,false,Math.max(3500,14000-d*55));
    else {const mix=mixInto(r.rpm,this.centers,this.rivalMix);for(let j=0;j<5;j++)this.loop(`rival${i}:${j}`,ENGINE[j],'rivals',mix[j].gain*level,mix[j].rate*doppler,pan);}
  }
  let active=0;for(const v of this.voices.values()){if(v.frame!==this.frame)v.gain.gain.setTargetAtTime(0,this.ctx.currentTime,.03);else active++;}this.status.activeLoops=active;
 }
 public dispose(){if((window as any).interlagosAudio===this)delete (window as any).interlagosAudio;this.disposed=true;this.abort.abort();for(const v of this.voices.values()){v.source.stop();v.source.disconnect();v.gain.disconnect();v.pan.disconnect();v.filter.disconnect();}for(const s of this.shots)s.stop();this.shots.clear();this.voices.clear();this.buffers.clear();this.status.decodedBytes=0;this.status.activeLoops=0;void this.ctx?.close();this.ctx=null;}
}

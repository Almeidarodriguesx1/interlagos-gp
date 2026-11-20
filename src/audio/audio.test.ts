import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySurface, wheelContacts } from './surfaces';
import { engineMix } from './RecordedAudioEngine';
import { INTERLAGOS_TRACK } from '../sim/track';
import type { CarState } from '../sim/types';
const projection={onKerb:false,lateralOffset:0,widthLeft:7,widthRight:6,tNorm:.2};
test('runoff asphalt does not trigger gravel, including asymmetric widths',()=>{
 for(const lateralOffset of [0,7,12,-13])assert.equal(classifySurface({...projection,lateralOffset}),'asphalt');
 assert.equal(classifySurface({...projection,lateralOffset:14}),'grass');
 assert.equal(classifySurface({...projection,lateralOffset:-15}),'grass');
 assert.equal(classifySurface({...projection,lateralOffset:7,onKerb:true}),'kerb');
});
test('explicit material zones wrap at start/finish and respect side',()=>{
 const zones=[{start:.9,end:.1,side:'right' as const,minOffset:7,maxOffset:20,material:'gravel' as const}];
 assert.equal(classifySurface({...projection,tNorm:.02,lateralOffset:14},zones),'gravel');
 assert.equal(classifySurface({...projection,tNorm:.5,lateralOffset:14},zones),'grass');
 assert.equal(classifySurface({...projection,tNorm:.02,lateralOffset:-15},zones),'grass');
});
test('engine crossfades retain constant energy across full RPM range',()=>{
 for(let rpm=3000;rpm<=13200;rpm+=25){const mix=engineMix(rpm);assert.ok(Math.abs(mix.reduce((s,m)=>s+m.gain**2,0)-1)<1e-9);assert.ok(mix.every(m=>m.rate>=.85&&m.rate<=1.15));}
});
test('wheel sampling separates left kerb and right asphalt; airborne contacts are silent',()=>{
 const sample=INTERLAGOS_TRACK.samples.find(s=>s.kerbLeft)!;
 const centerOffset=-sample.widthLeft+1;
 const car={x:sample.pos.x+sample.right.x*centerOffset,z:sample.pos.z+sample.right.z*centerOffset,y:sample.pos.y,yaw:Math.atan2(sample.tangent.x,sample.tangent.z),trackIndex:INTERLAGOS_TRACK.samples.indexOf(sample),speed:30,slipRatio:.2,roll:0} as CarState;
 const contacts=wheelContacts(car,INTERLAGOS_TRACK);
 assert.equal(contacts.length,4);assert.ok(contacts.some(c=>c.material==='kerb'));assert.ok(contacts.some(c=>c.material==='asphalt'));
 assert.ok(wheelContacts({...car,y:car.y+3},INTERLAGOS_TRACK).every(c=>!c.grounded));
});

test('recorded graph loads assets and silences loops on pause without synthesis',async()=>{
 const saved={window:globalThis.window,AudioContext:globalThis.AudioContext,fetch:globalThis.fetch};
 const nodes:any[]=[];
 const param=()=>({value:0,setTargetAtTime(value:number){this.value=value;}});
 const node=()=>{const n:any={gain:param(),pan:param(),frequency:param(),playbackRate:param(),threshold:param(),knee:param(),ratio:param(),connect(){},disconnect(){},start(){},stop(){this.stopped=true;},stopped:false};nodes.push(n);return n;};
 class Context {
  currentTime=0;destination=node();state='running';
  createGain=node;createBufferSource=node;createStereoPanner=node;createBiquadFilter=node;createDynamicsCompressor=node;
  createOscillator(){throw new Error('Synthesis prohibited');}
  async resume(){} async close(){this.state='closed';}
  async decodeAudioData(){return {duration:2,length:96000,numberOfChannels:1};}
 }
 try{
  (globalThis as any).window={};(globalThis as any).AudioContext=Context;
  globalThis.fetch=async(input:any)=>new Response(new Uint8Array(100),{status:/\/(asphalt|kerb_rumble|gravel|engine_provisional)\.wav$/.test(String(input))?200:404,headers:{'content-type':'audio/wav'}});
  const {RecordedAudioEngine}=await import('./RecordedAudioEngine');const engine=new RecordedAudioEngine();engine.init();
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.deepEqual([...engine.status.loaded].sort(),['asphalt','engine_provisional','gravel','kerb_rumble']);assert.equal(engine.status.engineReady,false);assert.equal(engine.status.enginePlayable,true);assert.equal(engine.status.engineMode,'recorded-provisional');
  engine.update({active:true,rpm:8000,gear:3,throttle:1,brake:0,speedMs:40,slipRatio:0,ersActive:false,onKerb:true,onTrack:true,wet:false,contacts:[{wheel:'FL',side:-1,material:'kerb',grounded:true,speed:40,slip:0,load:1}]});
  assert.ok(nodes.some(n=>n.buffer));
  engine.setPaused(true);engine.dispose();assert.ok(nodes.filter(n=>n.buffer).every(n=>n.stopped));
 }finally{Object.assign(globalThis,saved);}
});

test('calibration rejects missing approval and invalid RPM; accepts complete ordered bands',async()=>{
 const {calibrationErrors,mixInto}=await import('./engineCalibration');
 const config={approved:true,source:'Licensed recording',license:'Test permission',bands:['engine_idle','engine_low','engine_mid','engine_high','engine_limiter'].map((id,i)=>({id,nativeRpm:[4200,6300,8400,10500,12300][i]})),offThrottleRpm:8800};
 assert.deepEqual(calibrationErrors(config),[]);
 assert.ok(calibrationErrors({...config,approved:false}).length>0);
 assert.ok(calibrationErrors({...config,bands:config.bands.map(b=>({...b,nativeRpm:4200}))}).length>0);
 assert.ok(calibrationErrors({...config,offThrottleRpm:NaN}).length>0);
 const output=Array.from({length:5},()=>({gain:0,rate:1}));
 assert.equal(mixInto(8400,config.bands.map(b=>b.nativeRpm),output),output);
 mixInto(NaN,config.bands.map(b=>b.nativeRpm),output);assert.ok(output.every(m=>Number.isFinite(m.gain)&&Number.isFinite(m.rate)));
});

test('original motor timbre is anchored at preview pitch and camera filtering stays bright',async()=>{
 const {provisionalMotor,perspective}=await import('./audioTuning');
 assert.equal(provisionalMotor(8500,1).rate,1);assert.ok(Math.abs(provisionalMotor(8500,1).gain-.45)<1e-12);
 for(let rpm=4000;rpm<=12800;rpm+=100)assert.ok(Math.abs(provisionalMotor(rpm,1).rate-1)<=.041);
 assert.ok(perspective(true,0).engineCutoff>=15000);
 assert.ok(perspective(false,100).attenuation<perspective(false,5).attenuation);
 assert.ok(perspective(true,100).surfaceCutoff<perspective(false,100).surfaceCutoff);
});

import test from 'node:test';import assert from 'node:assert/strict';
import {createRaceSession,stepRaceSession} from './raceDirector';
import {stepVehiclePhysics,slopeAcceleration} from './physics';
import {getSampleAtNorm} from './track';
import {F1EngineController} from '../engine/F1Renderer';
const cfg={totalLaps:3,weather:'dry' as const,absEnabled:true,tcEnabled:true,racingLineEnabled:true};
const input={throttle:0,brake:0,steer:0,ersBoost:false,drsToggleJustPressed:false};
const make=()=>{const s=createRaceSession(cfg,'playing');return s.cars[s.playerIndex];};
test('ignition cuts RPM and traction, restart waits before delivering torque',()=>{
 const car=make();stepVehiclePhysics(car,{...input,throttle:1,ignitionToggleJustPressed:true},cfg,1/180);assert.equal(car.engineRunning,false);assert.equal(car.rpm,0);
 stepVehiclePhysics(car,{...input,throttle:1,ignitionToggleJustPressed:true},cfg,1/180);assert.equal(car.engineRunning,true);assert.ok(car.engineStartTimer>.6);
 for(let i=0;i<140;i++)stepVehiclePhysics(car,input,cfg,1/180);assert.equal(car.engineStartTimer,0);assert.ok(car.rpm>=3900);
});
test('manual gearbox stays in gear, shifts once, rejects unsafe reverse and overrev',()=>{
 const car=make();car.manualTransmission=true;car.gear=3;car.rpm=12500;car.speed=60;car.forwardSpeed=60;
 stepVehiclePhysics(car,input,cfg,1/180);assert.equal(car.gear,3);
 stepVehiclePhysics(car,{...input,shiftUpJustPressed:true},cfg,1/180);assert.equal(car.gear,4);
 const s=getSampleAtNorm(.22);Object.assign(car,{x:s.pos.x,z:s.pos.z,y:s.pos.y,yaw:Math.atan2(s.tangent.x,s.tangent.z),trackIndex:s.index,vx:s.tangent.x*90,vz:s.tangent.z*90,speed:90,forwardSpeed:90,gear:2});
 stepVehiclePhysics(car,{...input,shiftDownJustPressed:true},cfg,1/180);assert.equal(car.gear,2);
 car.gear=1;stepVehiclePhysics(car,{...input,shiftDownJustPressed:true},cfg,1/180);assert.equal(car.gear,1);
});
test('slope gravity reverses in car coordinates, retains the same world downhill direction',()=>{
 const forward=slopeAcceleration(.1,0,Math.sqrt(.99),0,1),backward=slopeAcceleration(.1,0,Math.sqrt(.99),0,-1);
 assert.ok(forward<0&&backward>0);assert.equal(forward,-backward);assert.ok(slopeAcceleration(0,0,1,0,1) === 0);
 const car=make(),s=getSampleAtNorm(.15);Object.assign(car,{x:s.pos.x,z:s.pos.z,y:s.pos.y,yaw:Math.atan2(s.tangent.x,s.tangent.z),trackIndex:s.index,engineRunning:false,vx:0,vz:0,speed:0});
 for(let i=0;i<180;i++)stepVehiclePhysics(car,{...input,brake:1},cfg,1/180);assert.ok(Math.hypot(car.vx,car.vz)<.02);
});
test('pausing before first countdown step preserves countdown when resumed',()=>{
 const session=createRaceSession(cfg,'countdown');const obj:any={session,audio:{init(){},setPaused(){}},keysHeld:new Set(),syncBodyState(){},pushTelemetry(){}};
 F1EngineController.prototype.pauseRace.call(obj);F1EngineController.prototype.resumeRace.call(obj);assert.equal(session.phase,'countdown');
});
test('title demonstration never records the AI-driven player lap',()=>{
 const s=createRaceSession(cfg,'title');for(let i=0;i<180*140;i++)stepRaceSession(s,input,1/180);
 assert.equal(s.personalRecordTime,null);assert.equal(s.cars[s.playerIndex].bestLapTime,null);
});

test('start preferences and climate changes isolate records and invalidate the current lap',()=>{
 const session=createRaceSession({...cfg,startEngineOff:true,manualTransmission:true},'playing');const car=session.cars[session.playerIndex];assert.equal(car.engineRunning,false);assert.equal(car.rpm,0);assert.equal(car.manualTransmission,true);
 car.bestLapTime=70;session.personalRecordTime=70;
 F1EngineController.prototype.setWeather.call({session,applyWeatherAtmosphere(){},pushTelemetry(){}} as any,'wet',90,null);
 assert.equal(car.bestLapTime,null);assert.equal(car.lapValid,false);assert.equal(session.personalRecordTime,90);
});

test('an unpowered car rolls downhill in either orientation without throttle',()=>{
 const speeds=[];
 for(const backwards of [false,true]){
  const c=make(),s=getSampleAtNorm(.15);const yaw=Math.atan2(s.tangent.x,s.tangent.z)+(backwards?Math.PI:0);
  Object.assign(c,{x:s.pos.x,z:s.pos.z,y:s.pos.y,yaw,trackIndex:s.index,engineRunning:false,manualTransmission:true,gear:0,vx:0,vz:0,speed:0});
  for(let i=0;i<30;i++)stepVehiclePhysics(c,input,cfg,1/180);
  speeds.push(c.vx*s.tangent.x+c.vz*s.tangent.z);
 }
 assert.ok(speeds[0]*speeds[1]>0);assert.ok(Math.abs(speeds[0]-speeds[1])<.02);
});

import {measureBraking} from '../../scripts/benchmark-dynamics';
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyContactImpulse, CONTACT_OFFSETS, CONTACT_RADIUS, resolveBarrierContacts, resolveSceneryContacts, sweepDiskCircle } from './collisions';
import { createRaceSession, stepRaceSession, buildTelemetrySnapshot } from './raceDirector';
import { createSceneryWorld, stepScenery, type SceneryWorld } from './scenery';
import { getSampleAtDistance, INTERLAGOS_TRACK, projectPointToTrack } from './track';
import { BARRIER_OFFSET } from './surfaceModel';
const config = {totalLaps:3,weather:'dry' as const,absEnabled:true,tcEnabled:true,racingLineEnabled:true};
const input = {throttle:0,brake:0,steer:0,ersBoost:false,drsToggleJustPressed:false};
const car = () => createRaceSession(config,'playing').cars[0];
const energy = (c:ReturnType<typeof car>) => .5*798*(c.vx*c.vx+c.vz*c.vz)+.5*(798*(5.3**2+1.96**2)/12)*c.yawRate*c.yawRate;
function world(mass:number):SceneryWorld {return {objects:[{prop:{id:'fixture',kind:mass?'brake50':'gantry-pillar',x:0,y:0,z:0,yaw:0,radius:.06,height:3,breakawayMass:mass},broken:false,age:0,fallYaw:0}]};}

test('contact impulses dissipate energy, distinguish tangential scraping and rotate off-center impacts',()=>{
  const c=car(); Object.assign(c,{vx:20,vz:35,yawRate:0,yaw:0});const before=energy(c);
  const impulse=applyContactImpulse(c,0,-1,.7,2.5,.035,0);
  assert.ok(impulse>0 && energy(c)<before);
  assert.ok(Math.abs(c.yawRate)>.1,'off-center contact must create rotation');
  const tangent=car();Object.assign(tangent,{vx:20,vz:0,yawRate:0});
  assert.equal(applyContactImpulse(tangent,0,-1,0,2.5),0);
  assert.equal(tangent.vx,20,'parallel motion must not receive arbitrary damping');
});

test('swept disks catch thin posts at racing speed, including a full crossing in one step',()=>{
  assert.ok(sweepDiskCircle(0,-10,0,10,0,0,1)>0);
  assert.equal(sweepDiskCircle(2,-10,2,10,0,0,1),-1);
  const c=car();Object.assign(c,{x:0,z:10,y:0,yaw:0,vx:0,vz:100,yawRate:0});
  resolveSceneryContacts(c,world(0),0,-10,0);
  assert.ok(c.z < -2.5,'solid post must stop the hull before it passes through');
  assert.ok(Math.abs(c.vz)<5);
  assert.ok((c.frontAeroDamage??0)>0);
});

test('lightweight signs yield with small momentum loss, fall and reset with a new session',()=>{
  const c=car(), w=world(3);Object.assign(c,{x:0,z:10,y:0,yaw:0,vx:0,vz:100,yawRate:0});
  resolveSceneryContacts(c,w,0,-10,0);
  assert.equal(w.objects[0].broken,true);
  assert.ok(c.vz>99 && c.vz<100,'3kg prop cannot stop an entire race car');
  stepScenery(w,.2);assert.equal(w.objects[0].age,.2);
  const a=createSceneryWorld(INTERLAGOS_TRACK), b=createSceneryWorld(INTERLAGOS_TRACK);
  a.objects[0].broken=true;assert.equal(b.objects[0].broken,false);
  const session=createRaceSession(config,'paused');session.scenery.objects[0].broken=true;
  stepRaceSession(session,input,.1);assert.equal(session.scenery.objects[0].age,0);
});

test('wall contacts contain the full hull, with nose contact before the center crosses the wall',()=>{
  const c=car(), sp=getSampleAtDistance(INTERLAGOS_TRACK.totalLength*.03);
  const yaw=Math.atan2(sp.right.x,sp.right.z);
  Object.assign(c,{x:sp.pos.x+sp.right.x*(sp.widthRight+BARRIER_OFFSET-1.2),z:sp.pos.z+sp.right.z*(sp.widthRight+BARRIER_OFFSET-1.2),yaw,y:sp.pos.y,trackIndex:sp.index,vx:sp.right.x*35,vz:sp.right.z*35,yawRate:0});
  resolveBarrierContacts(c,INTERLAGOS_TRACK);
  for(const offset of CONTACT_OFFSETS){
    const p=projectPointToTrack(c.x+Math.sin(yaw)*offset,c.z+Math.cos(yaw)*offset,c.trackIndex);
    const limit=(p.lateralOffset>0?p.widthRight:p.widthLeft)+BARRIER_OFFSET;
    assert.ok(Math.abs(p.lateralOffset)+CONTACT_RADIUS<=limit+.005);
  }
  assert.ok(c.vx*sp.right.x+c.vz*sp.right.z<3);
  assert.ok((c.frontAeroDamage??0)>0);
});

test('collision damage is bounded, reported in telemetry and repaired on session restart',()=>{
  const session=createRaceSession(config,'playing'), c=session.cars[session.playerIndex];
  Object.assign(c,{vx:0,vz:80,yawRate:0,yaw:0});applyContactImpulse(c,0,-1,0,2.5);
  assert.ok(c.frontAeroDamage!>0 && c.frontAeroDamage!<=1);
  const snapshot=buildTelemetrySnapshot(session,input);assert.ok(snapshot.player.frontAeroDamagePct>0);
  assert.equal(createRaceSession(config,'playing').cars[0].frontAeroDamage,0);
});


test('aero damage lengthens braking distance through reduced aerodynamic load',()=>{
  const damagedCreate=(...args:Parameters<typeof createRaceSession>)=>{
    const session=createRaceSession(...args),c=session.cars[session.playerIndex];c.frontAeroDamage=1;c.rearAeroDamage=1;return session;
  };
  const fresh=measureBraking('dry'),damaged=measureBraking('dry',damagedCreate);
  assert.equal(damaged.impactSteps,0);assert.equal(damaged.offTrackSteps,0);
  assert.ok(damaged.distance>fresh.distance*1.10);
  assert.ok(damaged.peakG<fresh.peakG);
});

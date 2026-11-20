import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Matrix4,Vector3,Quaternion} from 'three';
import {createRaceSession} from '../sim/raceDirector';
import type {RaceConfig} from '../sim/types';
import {MCL40_STUDY_GEOMETRY} from '../sim/vehicleGeometry';
const config: RaceConfig={totalLaps:3,weather:'dry',absEnabled:true,tcEnabled:true,racingLineEnabled:true};
const bytes=readFileSync(new URL('../../public/models/mcl40-v02.glb',import.meta.url));
const asset=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
const parents=new Map<number,number>();asset.nodes.forEach((n:any,i:number)=>(n.children??[]).forEach((c:number)=>parents.set(c,i)));
function world(i:number):Matrix4 {
 const n=asset.nodes[i];const local=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3().fromArray(n.translation??[0,0,0]),new Quaternion().fromArray(n.rotation??[0,0,0,1]),new Vector3().fromArray(n.scale??[1,1,1]));
 return parents.has(i)?world(parents.get(i)!).multiply(local):local;
}
const position=(name:string)=>new Vector3().setFromMatrixPosition(world(asset.nodes.findIndex((n:any)=>n.name===name)));
test('MCL40 player geometry agrees with exported axles and does not modify rivals or the normal session',()=>{
 const session=createRaceSession({...config,playerVehicle:'mcl40-study'},'playing');
 assert.equal(session.cars[session.playerIndex].geometry,MCL40_STUDY_GEOMETRY);
 assert.ok(session.cars.filter(c=>!c.isPlayer).every(c=>c.geometry===undefined));
 const front=position('Wheel_FL'),rear=position('Wheel_RL');
 assert.ok(Math.abs(front.z-rear.z-MCL40_STUDY_GEOMETRY.wheelbaseM)<.002);
 assert.ok(Math.abs(Math.abs(front.x)-MCL40_STUDY_GEOMETRY.frontHalfTrackM)<.002);
 assert.ok(Math.abs(front.y-MCL40_STUDY_GEOMETRY.wheelRadiusM)<.002);
 assert.ok(createRaceSession(config,'playing').cars.every(c=>c.geometry===undefined));
 const restarted=createRaceSession(session.config,'playing');assert.equal(restarted.cars[restarted.playerIndex].geometry,MCL40_STUDY_GEOMETRY);
});
test('optimized MCL40 retains both sides of every articulated link, camera anchors and fixed uprights',()=>{
 assert.equal(bytes.readUInt32LE(8),bytes.length);
 const links=asset.nodes.filter((n:any)=>n.extras?.suspensionLink);assert.equal(links.length,24);
 for(const link of links){const data=JSON.parse(link.extras.suspensionLink);assert.ok(data.restLength>0);for(const name of[data.a,data.b])assert.ok(asset.nodes.some((n:any)=>n.name===name),`Lost endpoint ${name}`);}
 for(const n of['FL','FR','RL','RR']){
  const upright=asset.nodes.findIndex((a:any)=>a.name==='Upright_'+n),spin=asset.nodes.findIndex((a:any)=>a.name==='Wheel_'+n);
  assert.notEqual(upright,-1);assert.notEqual(spin,-1);assert.notEqual(parents.get(upright),spin,'Caliper must not spin with rim');
 }
 for(const name of['CockpitAnchor','TcamAnchor','OLED','SteeringWheel','FrontFlap_0','FrontFlap_1','RearFlap'])assert.ok(asset.nodes.some((n:any)=>n.name===name));
 const screen=asset.nodes.find((n:any)=>n.name==='OLED');assert.ok(asset.meshes[screen.mesh].primitives[0].attributes.TEXCOORD_0!==undefined);
});

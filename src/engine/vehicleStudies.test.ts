import {teams2026} from '../sim/grid2026';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Box3,Matrix4,Quaternion,Vector3} from 'three';
import {createRaceSession} from '../sim/raceDirector';
import {VEHICLE_STUDIES,studyFromQuery} from '../sim/vehicleStudies';
import {PIT_EQUIPMENT_LAYOUT} from './pitEquipment';
import type {RaceConfig} from '../sim/types';
const config:RaceConfig={totalLaps:3,weather:'dry',absEnabled:true,tcEnabled:true,racingLineEnabled:true};
function asset(file:string){
 const bytes=readFileSync(new URL('../../public/models/'+file,import.meta.url));assert.equal(bytes.readUInt32LE(8),bytes.length);
 const length=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+length).toString()),bin=bytes.subarray(28+length);const parents=new Map<number,number>();doc.nodes.forEach((n:any,i:number)=>(n.children??[]).forEach((c:number)=>parents.set(c,i)));
 function world(i:number):Matrix4 {const n=doc.nodes[i];const local=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3().fromArray(n.translation??[0,0,0]),new Quaternion().fromArray(n.rotation??[0,0,0,1]),new Vector3().fromArray(n.scale??[1,1,1]));return parents.has(i)?world(parents.get(i)!).multiply(local):local;}
 const index=(name:string)=>{const i=doc.nodes.findIndex((n:any)=>n.name===name);assert.ok(i>=0,'Missing '+name);return i;};
 const position=(name:string)=>new Vector3().setFromMatrixPosition(world(index(name)));
 function positions(i:number):Vector3[]{const n=doc.nodes[i],m=world(i),result:Vector3[]=[];if(n.mesh!==undefined)for(const p of doc.meshes[n.mesh].primitives){const a=doc.accessors[p.attributes.POSITION],v=doc.bufferViews[a.bufferView];assert.equal(a.componentType,5126);for(let j=0;j<a.count;j++){const offset=(v.byteOffset??0)+(a.byteOffset??0)+j*(v.byteStride??12);result.push(new Vector3(bin.readFloatLE(offset),bin.readFloatLE(offset+4),bin.readFloatLE(offset+8)).applyMatrix4(m));}}for(const c of n.children??[])result.push(...positions(c));return result;}
 return {doc,position,index,world,positions};
}
test('every study preserves player-only geometry, HUD identity, unique grid numbers and restart settings',()=>{
 for(const study of VEHICLE_STUDIES){const s=createRaceSession({...config,playerVehicle:study.config},'playing'),p=s.cars[s.playerIndex];assert.equal(p.geometry,study.geometry);assert.equal(p.number,study.number);assert.equal(new Set(s.cars.map(c=>c.number)).size,s.cars.length);assert.ok(s.cars.filter(c=>!c.isPlayer).every(c=>!c.geometry));const restart=createRaceSession(s.config,'playing');assert.equal(restart.cars[restart.playerIndex].number,study.number);}
 assert.equal(studyFromQuery('bogus'),undefined);assert.ok(createRaceSession(config,'playing').cars.every(c=>!c.geometry));
});
test('SF26 and RB22 axles and articulated link endpoints agree with their exported geometry',()=>{
 for(const study of VEHICLE_STUDIES.slice(1)){
  const a=asset(study.file);assert.ok(Math.abs(a.position('Wheel_FL').z-a.position('Wheel_RL').z-study.geometry.wheelbaseM)<1e-5);
  for(const name of ['Papaya',study.id==='sf26'?'TeamWhite':'Teal','HelmetPaint','RainLight','Sidewall','TireTread'])assert.ok(a.doc.materials.some((m:any)=>m.name===name),'Missing runtime material '+name);
  const links=a.doc.nodes.filter((n:any)=>n.extras?.suspensionLink);assert.equal(links.length,24);
  for(const n of links){const d=JSON.parse(n.extras.suspensionLink),m=a.world(a.index(n.name));assert.ok(new Vector3(0,-d.restLength/2,0).applyMatrix4(m).distanceTo(a.position(d.a))<1e-5);assert.ok(new Vector3(0,d.restLength/2,0).applyMatrix4(m).distanceTo(a.position(d.b))<1e-5);}
  for(const name of['CockpitAnchor','TcamAnchor','OLED','FrontFlap_0','FrontFlap_1','RearFlap'])a.index(name);
  const points=a.positions(a.doc.scenes[a.doc.scene??0].nodes[0]);const size=new Box3().setFromPoints(points).getSize(new Vector3());assert.ok(size.x<1.96&&size.y<1.25&&size.z<5.5);
 }
});
test('new team cars have different nose, sidepod and engine-cover geometry, beyond paint changes',()=>{
 const a=asset('sf26-v01.glb'),b=asset('rb22-v01.glb');
 for(const name of['Nose_Main','Sidepod_1','Engine_Cover'])assert.notDeepEqual(a.positions(a.index(name)).map(p=>p.toArray()),b.positions(b.index(name)).map(p=>p.toArray()),name);
});
test('every pit prop rests on the foundation and stays clear of the closed garage fronts and track boundary',()=>{
 const a=asset('pit-kit-v01.glb');
 for(const entry of PIT_EQUIPMENT_LAYOUT){const local=a.position(entry.asset);const points=a.positions(a.index(entry.asset)).map(p=>p.sub(local).add(new Vector3(entry.x,entry.y,entry.z)));const box=new Box3().setFromPoints(points);assert.ok(Math.abs(box.min.y+1.4)<.002,entry.asset+' floating');assert.ok(box.min.x>-10.7&&box.max.x<-7.23,entry.asset+' leaves the garage apron');assert.ok(box.min.z>-80&&box.max.z<80);}
});

test('distance models fit triangle budgets and keep the four player wheel pivots', () => {
  const hero = asset('mcl40-v02.glb');
  const budgets = [[35000, 60000], [12000, 25000], [3000, 8000]];
  for (const [index, [min, max]] of budgets.entries()) {
    const level = index + 1;
    const model = asset('mcl40-grid/mcl40-lod' + level + '.glb');
    let triangles = 0;
    for (const mesh of model.doc.meshes) {
      for (const primitive of mesh.primitives) triangles += model.doc.accessors[primitive.indices].count / 3;
    }
    assert.ok(triangles >= min && triangles <= max, 'LOD ' + level + ': ' + triangles);
    for (const corner of ['FL', 'FR', 'RL', 'RR']) {
      const name = 'Wheel_' + corner;
      assert.ok(model.position('L' + level + '_' + name).distanceTo(hero.position(name)) < 0.001);
    }
  }
});

test('season grid seats, garage equipment and loadable wheel pivots cover every constructor', () => {
  for (const study of VEHICLE_STUDIES) {
    const session = createRaceSession({...config, playerVehicle: study.config}, 'playing');
    assert.equal(session.cars.length, 22);
    assert.equal(new Set(session.cars.map(car => car.id)).size, 22);
    for (const team of teams2026) {
      assert.equal(session.cars.filter(car => car.teamName === team.name).length, 2);
    }
  }
  for (const team of teams2026) {
    assert.equal(PIT_EQUIPMENT_LAYOUT.filter(item => item.team === team.name).length, 4);
    for (const level of [1, 2, 3]) {
      const model = asset(team.model + '-grid/' + team.model + '-lod' + level + '.glb');
      for (const corner of ['FL', 'FR', 'RL', 'RR']) {
        const pivot = 'Wheel_' + corner;
        assert.ok(model.doc.nodes.some((node: {name?: string}) =>
          node.name === pivot || node.name === 'L' + level + '_' + pivot));
      }
    }
  }
});

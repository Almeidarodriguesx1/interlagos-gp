import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildSeatedCrowd,buildGrassTufts} from './circuitDetails';
import {buildPilotNose,buildPilotDetails,buildPilotBodywork} from './carDetails';
import {buildTrackGeometryBundle} from './trackBuilder';
import {INTERLAGOS_TRACK,projectPointToTrack} from '../sim/track';
import {APRON_WIDTH} from '../sim/surfaceModel';
function dispose(group:THREE.Group){const unique=new Set<any>();group.traverse(o=>{if(o instanceof THREE.Mesh){unique.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])unique.add(m);}if(o instanceof THREE.InstancedMesh)o.dispose();});for(const resource of unique)resource.dispose();}

test('spectators are individual seated instances within tiers and beneath the roof',()=>{
  const group=buildSeatedCrowd(112),matrix=new THREE.Matrix4(),pos=new THREE.Vector3();
  const bodies=group.children[0] as THREE.InstancedMesh,heads=group.children[1] as THREE.InstancedMesh;
  assert.equal(group.children.length,2);assert.ok(bodies.count>700);assert.equal(bodies.count,heads.count);
  for(let i=0;i<heads.count;i++){
    heads.getMatrixAt(i,matrix);pos.setFromMatrixPosition(matrix);
    assert.ok(group.userData.tierTopY.some((y:number)=>Math.abs(y-pos.y)<1e-5));
    assert.ok(pos.y+1.1<12.3 && Math.abs(pos.z)<55 && pos.x<4.2 && pos.x> -8.1);
  }
  dispose(group);
});

test('grass tufts stay outside the existing asphalt apron, use bounded instancing and have rooted transforms',()=>{
  const track=INTERLAGOS_TRACK,bundle=buildTrackGeometryBundle(track);
  const group=buildGrassTufts(bundle.corridorSkirtGeo,track.samples.length,bundle.terrainGeo,track),matrix=new THREE.Matrix4(),pos=new THREE.Vector3();
  assert.ok(group.children.length<=24 && group.userData.tufts>3000 && group.userData.tufts<8000);
  for(const child of group.children){const mesh=child as THREE.InstancedMesh;for(let i=0;i<mesh.count;i+=11){mesh.getMatrixAt(i,matrix);pos.setFromMatrixPosition(matrix);const p=projectPointToTrack(pos.x,pos.z);assert.ok(Math.abs(p.lateralOffset)>(p.lateralOffset<0?p.widthLeft:p.widthRight)+APRON_WIDTH);assert.ok(Number.isFinite(pos.y));}}
  dispose(group);for(const value of Object.values(bundle))if(value instanceof THREE.BufferGeometry)value.dispose();
});

test('pilot nose normals face outward and merged detail kit keeps the material budget',()=>{
  const nose=buildPilotNose(),pos=nose.attributes.position,norm=nose.attributes.normal;
  for(let i=0;i<25*25;i+=25)assert.ok(pos.getX(i)*norm.getX(i)>0,'nose must face outward instead of vanishing behind back-face culling');
  const mat=new THREE.MeshStandardMaterial(),group=buildPilotDetails(mat,mat,mat);
  assert.equal(group.children.length,3);assert.ok(group.userData.triangles<6000);
  assert.ok(group.children.every(child=>child instanceof THREE.Mesh));dispose(group);nose.dispose();
});


test('pilot bodywork has valid rounded shells and intake frames in three material batches',()=>{
  const mat=new THREE.MeshStandardMaterial(),group=buildPilotBodywork(mat,mat,mat);
  assert.equal(group.children.length,3);
  let triangles=0;
  group.traverse(o=>{if(o instanceof THREE.Mesh){const pos=o.geometry.attributes.position;triangles+=pos.count/3;for(let i=0;i<pos.count;i++)assert.ok(Number.isFinite(pos.getX(i))&&Number.isFinite(pos.getY(i))&&Number.isFinite(pos.getZ(i)));}});
  assert.ok(triangles>3000&&triangles<7000);dispose(group);
});

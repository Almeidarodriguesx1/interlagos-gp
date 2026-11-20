import test from 'node:test';import assert from 'node:assert/strict';
import {TRACK_LIST}from'../sim/track';
import {structurePlacements,skylinePlacements,footprintClearance,supportHeight,terrainSampler,localToWorld}from'./sceneryPlacement';
import {buildTrackGeometryBundle}from'./trackBuilder';import{BufferGeometry}from'three';
test('the full footprint of every pit, grandstand and skyline building clears each circuit',()=>{
 for(const track of TRACK_LIST){
  const structures=structurePlacements(track);assert.equal(structures.length,track.id === 'interlagos' ? 8 : 5);
  for(const f of structures)assert.ok(footprintClearance(f,track)>0,`${track.id} ${f.kind}`);
  if(track.meta.hasSkyline)for(const f of skylinePlacements(track))assert.ok(footprintClearance(f,track)>0);
 }
});
test('structure supports sample the rendered terrain and reach the foundation deck on sloping circuits',()=>{
 for(const track of TRACK_LIST){const bundle=buildTrackGeometryBundle(track),height=terrainSampler(bundle.terrainGeo);
  for(const f of structurePlacements(track)){const top=supportHeight(f,height);assert.ok(Number.isFinite(top));
   for(const x of[f.localCenterX-f.halfX,f.localCenterX,f.localCenterX+f.halfX])for(let i=0;i<=24;i++){const [wx,wz]=localToWorld(f,x,-f.halfZ+i*f.halfZ/12);assert.ok(height(wx,wz)<=top+.001);}
  }
  for(const value of Object.values(bundle))if(value instanceof BufferGeometry)value.dispose();
 }
});

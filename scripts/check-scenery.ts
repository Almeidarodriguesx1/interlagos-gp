import{writeFileSync}from'node:fs';import{TRACK_LIST,getSampleAtDistance}from'../src/sim/track';import{structurePlacements,skylinePlacements,footprintClearance,terrainSampler,supportHeight,type Footprint}from'../src/engine/sceneryPlacement';import{buildTrackGeometryBundle}from'../src/engine/trackBuilder';import{BufferGeometry}from'three';
const rows=[];
for(const track of TRACK_LIST){
 const legacy:Footprint[]=[];
 const specs=[{dist:track.totalLength-70,side:-1,offset:26.5,len:166,cx:-1.5,hx:9.2},...[[track.totalLength-130,1,28,112],[160,1,28,92],[460,-1,30,82],[track.totalLength-460,1,28,88]].map(([dist,side,offset,len])=>({dist,side,offset,len,cx:-1.2,hx:8.6}))];
 for(const [i,s]of specs.entries()){const p=getSampleAtDistance(s.dist,track),yaw=Math.atan2(p.tangent.x,p.tangent.z)+(i>0&&s.side<0?Math.PI:0),x=p.pos.x+p.right.x*s.side*s.offset,z=p.pos.z+p.right.z*s.side*s.offset;legacy.push({x:x+Math.cos(yaw)*s.cx,z:z-Math.sin(yaw)*s.cx,yaw,halfX:s.hx,halfZ:s.len/2+1.2});}
 if(track.meta.hasSkyline)for(let i=0;i<68;i++){const a=-.75+i/68*3.1,r=640+(i*73)%260,w=18+(i*19)%24;legacy.push({x:-180+Math.cos(a)*r,z:-20+Math.sin(a)*r,yaw:(i*.43)%Math.PI,halfX:w/2,halfZ:w*.85/2});}
 const current=[...structurePlacements(track),...(track.meta.hasSkyline?skylinePlacements(track):[])];const oldUnsafe=legacy.map((p,i)=>({index:i,clearance:footprintClearance(p,track)})).filter(p=>p.clearance<=0);
 const geometry=buildTrackGeometryBundle(track),height=terrainSampler(geometry.terrainGeo);
 const row={circuit:track.id,legacyUnsafeFootprints:oldUnsafe,currentMinimumClearance:Math.min(...current.map(f=>footprintClearance(f,track))),structures:structurePlacements(track).map(f=>({...f,groundTop:supportHeight(f,height)}))};rows.push(row);for(const g of Object.values(geometry))if(g instanceof BufferGeometry)g.dispose();
}
const pass=rows.every(r=>r.currentMinimumClearance>0);const result={method:'Conservative complete-footprint clearance against road/apron/barrier corridor, sampled at track resolution with additional 2m margin. Decorative placements are not surveyed real locations.',pass,rows};console.log(JSON.stringify(result,null,2));if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(result,null,2));if(!pass)process.exitCode=1;

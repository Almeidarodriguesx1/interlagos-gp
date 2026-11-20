import type {TrackData} from '../sim/track';
import {getSampleAtDistance} from '../sim/track';
import {APRON_WIDTH, runoffExtension} from '../sim/surfaceModel';
import type {BufferGeometry} from 'three';
export interface Footprint { x:number;z:number;yaw:number;halfX:number;halfZ:number; }
export interface StructurePlacement extends Footprint {rootX:number;rootZ:number;localCenterX:number;length:number;kind:'pit'|'stand';}
/** Conservative sampled-curve clearance, including apron, wall and half the maximum sample gap. */
export function footprintClearance(f:Footprint,track:TrackData):number {
 let gap=Infinity;const c=Math.cos(f.yaw),s=Math.sin(f.yaw);
 for(const p of track.samples){const dx=p.pos.x-f.x,dz=p.pos.z-f.z;
  const x=c*dx-s*dz,z=s*dx+c*dz;
  const distance=Math.hypot(Math.max(0,Math.abs(x)-f.halfX),Math.max(0,Math.abs(z)-f.halfZ));
  gap=Math.min(gap,distance-Math.max(p.widthLeft,p.widthRight)-APRON_WIDTH-runoffExtension(track,p.s,1)-2);
 }
 return gap;
}
function overlap(a:Footprint,b:Footprint):boolean{
 const axes=[[Math.cos(a.yaw),-Math.sin(a.yaw)],[Math.sin(a.yaw),Math.cos(a.yaw)],[Math.cos(b.yaw),-Math.sin(b.yaw)],[Math.sin(b.yaw),Math.cos(b.yaw)]];
 for(const [x,z] of axes){const radius=(p:Footprint)=>p.halfX*Math.abs(x*Math.cos(p.yaw)-z*Math.sin(p.yaw))+p.halfZ*Math.abs(x*Math.sin(p.yaw)+z*Math.cos(p.yaw));if(Math.abs((b.x-a.x)*x+(b.z-a.z)*z)>radius(a)+radius(b)+2)return false;}
 return true;
}
export function structurePlacements(track:TrackData):StructurePlacement[]{
 const specs=[{kind:'pit' as const,dist:track.totalLength-70,side:-1,offset:26.5,length:166,cx:-1.5,hx:9.2},
  ...[{dist:track.totalLength-130,side:1,length:112},{dist:160,side:1,length:92},{dist:460,side:-1,length:82},{dist:track.totalLength-460,side:1,length:88}].map(s=>({...s,kind:'stand' as const,offset:30,cx:-1.2,hx:8.6}))];
 // Additional decorative viewing sectors distributed around the legacy lap.
 if (track.id === 'interlagos') {
  for (const [progress, side, length] of [[.34,1,72],[.60,-1,62],[.88,1,64]]) {
   specs.push({kind:'stand',dist:track.totalLength*progress,side,offset:36,length,cx:-1.2,hx:8.6});
  }
 }
 const placed:StructurePlacement[]=[];
 for(const spec of specs){const p=getSampleAtDistance(spec.dist,track),yaw=Math.atan2(p.tangent.x,p.tangent.z)+(spec.kind==='stand'&&spec.side<0?Math.PI:0);let found:StructurePlacement|undefined;
  for(let extra=0;extra<=360;extra+=4){const rootX=p.pos.x+p.right.x*spec.side*(spec.offset+extra),rootZ=p.pos.z+p.right.z*spec.side*(spec.offset+extra);
   const candidate={rootX,rootZ,x:rootX+Math.cos(yaw)*spec.cx,z:rootZ-Math.sin(yaw)*spec.cx,yaw,halfX:spec.hx,halfZ:spec.length/2+1.2,localCenterX:spec.cx,length:spec.length,kind:spec.kind};
   if(footprintClearance(candidate,track)>0&&!placed.some(other=>overlap(candidate,other))){found=candidate;break;}
  }
  if(!found)throw new Error(`No safe ${spec.kind} placement on ${track.id}`);placed.push(found);
 }
 return placed;
}
/** Height of the actual rendered terrain triangles, rather than only the analytic terrain function. */
export function terrainSampler(geo:BufferGeometry):(x:number,z:number)=>number {
 const p=geo.attributes.position,n=Math.round(Math.sqrt(p.count)),minX=p.getX(0),minZ=p.getZ(0),step=(p.getX(n-1)-minX)/(n-1);
 return (x,z)=>{const gx=Math.max(0,Math.min(n-1.00001,(x-minX)/step)),gz=Math.max(0,Math.min(n-1.00001,(z-minZ)/step)),ix=Math.floor(gx),iz=Math.floor(gz),u=gx-ix,v=gz-iz,i=iz*n+ix;
  const a=p.getY(i),b=p.getY(i+1),c=p.getY(i+n),d=p.getY(i+n+1);return u+v<=1?a+u*(b-a)+v*(c-a):d+(1-u)*(c-d)+(1-v)*(b-d);
 };
}
export function localToWorld(f:StructurePlacement,x:number,z:number):[number,number]{return[f.rootX+Math.cos(f.yaw)*x+Math.sin(f.yaw)*z,f.rootZ-Math.sin(f.yaw)*x+Math.cos(f.yaw)*z];}
export function supportHeight(f:StructurePlacement,height:(x:number,z:number)=>number):number{
 let top=-Infinity;for(let x=f.localCenterX-f.halfX;x<=f.localCenterX+f.halfX+.01;x+=f.halfX/2)for(let z=-f.halfZ;z<=f.halfZ+.01;z+=f.halfZ/12){const [wx,wz]=localToWorld(f,x,z);top=Math.max(top,height(wx,wz));}return top+.15;
}
export function skylinePlacements(track:TrackData):Array<Footprint&{height:number}>{
 const {minX,maxX,minZ,maxZ}=track.bounds,cx=(minX+maxX)/2,cz=(minZ+maxZ)/2,radius=Math.hypot(maxX-minX,maxZ-minZ)/2+180;
 const terrainHalf=Math.max(2400,Math.max(maxX-minX,maxZ-minZ)+1400)/2-65;
 return Array.from({length:68},(_,i)=>{const a=-.75+i/68*3.1,edge=Math.min(terrainHalf/Math.max(.001,Math.abs(Math.cos(a))),terrainHalf/Math.max(.001,Math.abs(Math.sin(a)))),r=Math.min(edge,radius+(i*73)%260),w=18+(i*19)%24;return{x:cx+Math.cos(a)*r,z:cz+Math.sin(a)*r,yaw:(i*.43)%Math.PI,halfX:w/2,halfZ:w*.85/2,height:32+(i*41)%78};});
}

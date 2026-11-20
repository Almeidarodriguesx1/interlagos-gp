import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** Smooth closed nose loft; preserves the prototype car's envelope and wheelbase. */
export function buildPilotNose(): THREE.BufferGeometry {
  const pos:number[]=[],uv:number[]=[],indices:number[]=[];
  const rings=24,segments=24;
  for(let r=0;r<=rings;r++){
    const t=r/rings,rx=.34*Math.pow(1-t,.8)+.075*t,ry=.15*(1-.5*t);
    for(let j=0;j<=segments;j++){
      const a=j/segments*Math.PI*2;
      pos.push(Math.cos(a)*rx,.43-.10*t+Math.sin(a)*ry,.58+t*1.98);uv.push(j/segments,t);
      if(r<rings&&j<segments){const i=r*(segments+1)+j;indices.push(i,i+1,i+segments+1,i+1,i+segments+2,i+segments+1);}
    }
  }
  // Caps are hidden at the tub and underneath the rounded nose tip, but close the mesh.
  for(const r of[0,rings]){const center=pos.length/3,t=r/rings;pos.push(0,.43-.1*t,.58+t*1.98);uv.push(.5,t);for(let j=0;j<segments;j++){const a=r*(segments+1)+j;indices.push(center,r===0?a+1:a,r===0?a:a+1);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}

/** Pilot only. Static parts are merged into three material batches. */
export function buildPilotDetails(carbon:THREE.Material,metal:THREE.Material,black:THREE.Material):THREE.Group {
  const group=new THREE.Group();group.name='pilot-detail-kit';
  const buckets:THREE.BufferGeometry[][]=[[],[],[]];
  const add=(g:THREE.BufferGeometry,bucket:number,x:number,y:number,z:number,rx=0,ry=0,rz=0)=>{
    g.rotateX(rx);g.rotateY(ry);g.rotateZ(rz);g.translate(x,y,z);buckets[bucket].push(g.toNonIndexed());g.dispose();
  };
  const rod=(a:THREE.Vector3,b:THREE.Vector3,radius:number,bucket:number)=>{
    const curve=new THREE.LineCurve3(a,b), tube=new THREE.TubeGeometry(curve,1,radius,6,false);buckets[bucket].push(tube.toNonIndexed());tube.dispose();
  };
  for(const side of[-1,1]){
    // Twin pickup rods, cooling ducts, louvres and front-wing supports.
    rod(new THREE.Vector3(side*.22,.64,1.20),new THREE.Vector3(side*.73,.28,1.58),.013,0);
    rod(new THREE.Vector3(side*.23,.46,-1.18),new THREE.Vector3(side*.72,.28,-1.52),.016,0);
    add(new THREE.BoxGeometry(.13,.17,.20),2,side*.61,.34,1.53,0,side*.12);
    for(let i=0;i<12;i++)add(new THREE.BoxGeometry(.18,.013,.034),2,side*.56,.579,-.08-i*.052,.25,side*.08);
    for(let i=0;i<4;i++)add(new THREE.BoxGeometry(.018,.065,.18),0,side*(.72+i*.055),.18,-.58-i*.15,.2,side*.14);
    for(let i=0;i<3;i++)add(new THREE.BoxGeometry(.015,.035,.10),0,side*(.55+i*.14),.19,2.31,-.12,side*.06);
    add(new THREE.BoxGeometry(.04,.19,.11),0,side*.17,.25,2.24,-.16);
    // Fasteners around accessible front bodywork and mirror camera lenses.
    for(let i=0;i<5;i++)add(new THREE.CylinderGeometry(.009,.009,.006,6),1,side*(.25-i*.018),.537-i*.009,.68+i*.13);
    add(new THREE.CylinderGeometry(.022,.022,.012,10),2,side*.64,.636,.61,Math.PI/2);
    rod(new THREE.Vector3(side*.30,.49,.26),new THREE.Vector3(side*.32,.51,-.26),.035,2);
  }
  add(new THREE.CylinderGeometry(.006,.009,.21,6),1,.055,.68,.96);
  add(new THREE.CylinderGeometry(.006,.008,.13,6),1,-.075,.62,1.13);
  rod(new THREE.Vector3(0,.77,-.63),new THREE.Vector3(0,.82,-.85),.014,1);
  for(let i=0;i<8;i++)add(new THREE.BoxGeometry(.30,.025,.018),2,0,.44+i*.006,-1.12-i*.06);
  const materials=[carbon,metal,black];let triangles=0;
  for(let i=0;i<buckets.length;i++){
    const geo=mergeGeometries(buckets[i],false)!;for(const piece of buckets[i])piece.dispose();
    const mesh=new THREE.Mesh(geo,materials[i]);mesh.castShadow=true;mesh.receiveShadow=true;mesh.name=['pilot-carbon-hardware','pilot-metal-hardware','pilot-intakes-and-vents'][i];group.add(mesh);triangles+=geo.attributes.position.count/3;
  }
  group.userData={triangles,drawBatches:3,source:'procedural prototype inspired by technical references; not a scanned team car'};
  return group;
}

/** Rounded downwash sidepods and tapering engine cover, only for the pilot prototype. */
export function buildPilotBodywork(paint:THREE.Material,accent:THREE.Material,black:THREE.Material):THREE.Group {
  const group=new THREE.Group();group.name='pilot-sculpted-bodywork';
  const painted:THREE.BufferGeometry[]=[],trim:THREE.BufferGeometry[]=[],cavities:THREE.BufferGeometry[]=[];
  function loft(profile:(t:number)=>{x:number;y:number;z:number;rx:number;ry:number},reverse:boolean):THREE.BufferGeometry{
    const p:number[]=[],uv:number[]=[],idx:number[]=[],rings=24,segments=24;
    for(let i=0;i<=rings;i++){const t=i/rings,s=profile(t);for(let j=0;j<=segments;j++){const a=j/segments*Math.PI*2;p.push(s.x+Math.cos(a)*s.rx,s.y+Math.sin(a)*s.ry,s.z);uv.push(j/segments,t);if(i<rings&&j<segments){const k=i*(segments+1)+j;idx.push(k,k+1,k+segments+1,k+1,k+segments+2,k+segments+1);}}}
    if(reverse)for(let i=0;i<idx.length;i+=3){const a=idx[i+1];idx[i+1]=idx[i+2];idx[i+2]=a;}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();return geo;
  }
  for(const side of[-1,1]){
    const profile=(t:number)=>({x:side*(.54-.20*t),y:.365+.025*Math.sin(t*Math.PI),z:.62-2.05*t,rx:.34*(1-.65*t),ry:.215-.09*t});
    const pod=loft(profile,true);painted.push(pod.toNonIndexed());pod.dispose();
    const outer=new THREE.Shape();outer.absellipse(side*.54,.365,.34,.215,0,Math.PI*2,false,0);
    const hole=new THREE.Path();hole.absellipse(side*.57,.422,.19,.073,0,Math.PI*2,true,0);outer.holes.push(hole);
    const frame=new THREE.ShapeGeometry(outer,32);frame.translate(0,0,.62);painted.push(frame.toNonIndexed());frame.dispose();
    const cavity=new THREE.CircleGeometry(1,32);cavity.scale(.19,.073,1);cavity.translate(side*.57,.422,.602);cavities.push(cavity.toNonIndexed());cavity.dispose();
    const points:THREE.Vector3[]=[];for(let i=0;i<=16;i++){const s=profile(i/16);points.push(new THREE.Vector3(s.x+side*s.rx*.87,s.y+s.ry*.51,s.z));}
    const curve=new THREE.CatmullRomCurve3(points),tube=new THREE.TubeGeometry(curve,28,.008,5,false);trim.push(tube.toNonIndexed());tube.dispose();
  }
  const cover=loft(t=>({x:0,y:.55-.20*t,z:-.35-1.48*t,rx:.27-.20*t,ry:.34-.21*t}),true);painted.push(cover.toNonIndexed());cover.dispose();
  // Thin spine follows the cover, rather than a tall rectangular block.
  const fin=new THREE.BufferGeometry();fin.setAttribute('position',new THREE.Float32BufferAttribute([0,.88,-.40,0,.51,-1.70,0,.68,-1.15],3));fin.setAttribute('uv',new THREE.Float32BufferAttribute([0,1,1,0,.5,.7],2));fin.computeVertexNormals();trim.push(fin);
  for(const [parts,mat] of [[painted,paint],[trim,accent],[cavities,black]] as const){
    const geo=mergeGeometries(parts,false)!;for(const g of parts)g.dispose();const mesh=new THREE.Mesh(geo,mat);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  }
  return group;
}

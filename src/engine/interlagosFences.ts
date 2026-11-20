import * as THREE from 'three';
import { BARRIER_OFFSET, runoffExtension } from '../sim/surfaceModel';
import { getSampleAtDistance, type TrackData } from '../sim/track';

/** Fence accents on existing barriers. Visual steel above the wall shares its footing. */
export function buildInterlagosFences(track: TrackData): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Alambrados sobre barreiras de Interlagos';
  // Approximate showcase locations, in legacy lap progress rather than surveyed positions.
  const sections: [number, number, number][] = [[.955, 1, 1], [0, .175, 1], [.255, .478, 1], [.49, .68, -1], [.8, .945, 1]];
  const lake = track.samples.filter(s => s.cornerName.startsWith('Descida do Lago'));
  if (lake.length > 1) {
    const start = Math.max(0, lake[0].s - 60) / track.totalLength;
    const end = lake[lake.length - 1].s / track.totalLength;
    // Fill the opposite side only where it does not already have a fence.
    const nextFence = sections.find(([a, , side]) => side === -1 && a >= start);
    const stop = Math.min(end, nextFence?.[0] ?? 1);
    if (stop > start) sections.push([start, stop, -1]);
  }
  const geometry = new THREE.BoxGeometry(.075, 2.05, .075);
  const steel = new THREE.MeshStandardMaterial({ color: 0x49545a, roughness: .55, metalness: .45 });
  const divisions = sections.map(([a,b]) => Math.ceil((b-a)*track.totalLength/4));
  const posts = new THREE.InstancedMesh(geometry, steel, divisions.reduce((sum,i)=>sum+i+1,0));
  const dummy = new THREE.Object3D();
  const wires: number[] = [];
  let slot = 0;
  for (const [index,[start,end,side]] of sections.entries()) {
    let previous: THREE.Vector3 | undefined;
    const count = divisions[index];
    for (let i=0; i<=count; i++) {
      const s = getSampleAtDistance((start + (end-start)*i/count)*track.totalLength,track);
      const lat = side * ((side < 0 ? s.widthLeft : s.widthRight) + BARRIER_OFFSET + runoffExtension(track,s.s,side) + .12);
      const point = new THREE.Vector3(s.pos.x+s.right.x*lat,s.pos.y+s.right.y*lat+.98,s.pos.z+s.right.z*lat);
      dummy.position.copy(point);
      dummy.position.y += .99;
      dummy.updateMatrix();
      posts.setMatrixAt(slot++,dummy.matrix);
      if (previous) {
        for (const h of [.08,.6,1.2,1.98]) wires.push(previous.x,previous.y+h,previous.z,point.x,point.y+h,point.z);
        for (let k=0;k<8;k++) {
          const x=THREE.MathUtils.lerp(previous.x,point.x,k/8), y=THREE.MathUtils.lerp(previous.y,point.y,k/8),z=THREE.MathUtils.lerp(previous.z,point.z,k/8);
          wires.push(x,y+.08,z,x,y+1.98,z);
        }
      }
      previous = point;
    }
  }
  const rails = new THREE.BufferGeometry();
  rails.setAttribute('position',new THREE.Float32BufferAttribute(wires,3));
  group.add(posts,new THREE.LineSegments(rails,new THREE.LineBasicMaterial({color:0x657077,transparent:true,opacity:.55,depthWrite:false})));
  return group;
}

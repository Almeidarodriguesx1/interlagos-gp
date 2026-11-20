import * as THREE from 'three';
import {DecalGeometry} from 'three/addons/geometries/DecalGeometry.js';

// Project into the source shell before it is fitted to the gameplay axles.
export function addPapayaLivery(shell:THREE.Group,ferrari=false){
  shell.updateMatrixWorld(true);
  const panels:THREE.Mesh[]=[];
  shell.traverse(node=>{
    if(node instanceof THREE.Mesh && node.material.name.startsWith(ferrari?'redbull_paint':'EXT_PAINT')) panels.push(node);
  });
  for(const side of [-1,1]){
    const ray=new THREE.Raycaster(new THREE.Vector3(side*2,.49,-.47),new THREE.Vector3(-side,0,0));
    const hit=ray.intersectObjects(panels,false)[0];
    if(!hit)continue;
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
    const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='#151719';ctx.font='italic bold 164px Arial';ctx.textAlign='center';
    if(ferrari){
      ctx.fillStyle='#ffffff';ctx.font='bold italic 128px Arial';ctx.fillText('Scuderia Ferrari HP',512,125,990);
      ctx.font='bold 83px Arial';ctx.fillText('Shell     UniCredit',512,228);
    }else ctx.fillText('McLaren',512,181);
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.MeshStandardMaterial({map,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,roughness:.42});
    for(const panel of panels){
      const geometry=new DecalGeometry(panel,hit.point,new THREE.Euler(0,side*Math.PI/2,0),new THREE.Vector3(.89,.23,.30));
      if(!geometry.attributes.position.count){geometry.dispose();continue;}
      const decal=new THREE.Mesh(geometry,material);decal.name=ferrari?'Ferrari sponsor panel':'McLaren side graphic';shell.add(decal);
    }
  }
}

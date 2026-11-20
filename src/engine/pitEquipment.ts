import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
/** Estimated decorative garage apron layout, entirely inside the existing pit foundation.
 * Coordinates are local to pit-complex; floor top = pitGround+.1, root = pitGround+1.5.
 */
import {teams2026} from '../sim/grid2026';
export const PIT_EQUIPMENT_LAYOUT = teams2026.flatMap((team,index)=>{
  const bay = -68 + index * 13.6;
  return [
  {asset:'Pit_TireStack',x:-8.4,y:-1.4,z:bay-2},
  {asset:'Pit_ToolTrolley',x:-8.4,y:-1.4,z:bay},
  {asset:'Pit_FrontJack',x:-9.5,y:-1.4,z:bay+2},
  {asset:'Pit_RearJack',x:-8.4,y:-1.4,z:bay+3.4},
].map(item=>({...item,team:team.name}));
});
export function attachPitEquipment(pit:THREE.Group):()=>void {
  const group=new THREE.Group();group.name='pit-equipment';pit.add(group);
  let disposed=false;
  const resources=new Set<{dispose:()=>void}>();
  function collect(scene:THREE.Object3D) {
    scene.traverse(o=>{if(o instanceof THREE.Mesh){resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){resources.add(m);for(const value of Object.values(m))if(value instanceof THREE.Texture)resources.add(value);}}});
  }
  const release=()=>{for(const r of resources)r.dispose();resources.clear();};
  const dispose=()=>{if(disposed)return;disposed=true;group.removeFromParent();group.clear();release();};
  void new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/pit-kit-v01.glb`).then(gltf=>{
    collect(gltf.scene);
    if(disposed){release();return;}
    try {
      for(const entry of PIT_EQUIPMENT_LAYOUT){
        const source=gltf.scene.getObjectByName(entry.asset);if(!source)throw Error('Missing pit asset '+entry.asset);
        // Ordinary clones intentionally share static geometry and materials within this environment.
        const copy=source.clone(true);copy.position.set(entry.x,entry.y,entry.z);copy.userData.team=entry.team;copy.userData.decorative=true;
        copy.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=o.receiveShadow=true;});group.add(copy);
      }
      group.userData.status={ready:true,count:group.children.length,collision:'decorative'};
    } catch(error){group.clear();release();group.userData.status={ready:false,error:String(error)};console.warn('[Pit equipment]',error);}
  }).catch(error=>{if(!disposed){group.userData.status={ready:false,error:String(error)};console.warn('[Pit equipment]',error);}});
  return dispose;
}

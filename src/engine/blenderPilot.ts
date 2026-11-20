import * as THREE from 'three';
import {createModelLoader} from './modelLoader';
import type {F1CarVisual} from './carBuilder';

export const PILOT_NODES=['Body','Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR','FrontWing','RearWing','RearFlap','SteeringWheel','Helmet','Visor','CockpitAnchor','TcamAnchor','OLED','Number_Nose'] as const;
export function inspectPilot(scene:THREE.Object3D):{triangles:number;size:number[];missing:string[]}{
 scene.updateMatrixWorld(true);let triangles=0;scene.traverse(o=>{if(o instanceof THREE.Mesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
 const bounds=new THREE.Box3().setFromObject(scene),size=bounds.getSize(new THREE.Vector3());
 return {triangles,size:size.toArray(),missing:PILOT_NODES.filter(name=>!scene.getObjectByName(name))};
}
/** All controls are rebased to a game-axis pivot; DCC axis conversion stays inside the model. */
export function adaptBlenderPilot(scene:THREE.Group,base:F1CarVisual):F1CarVisual {
 const inspection=inspectPilot(scene);
 if(inspection.missing.length||inspection.triangles>180000||inspection.size[0]>2.15||inspection.size[2]>5.8||inspection.size[2]<4)throw new Error(`Invalid pilot asset: ${JSON.stringify(inspection)}`);
 const root=new THREE.Group(),bodyGroup=new THREE.Group();root.name='blender-pilot-v8';root.userData={pilotDetail:true,modelSource:'Blender 5.3 / pilot-v8.glb',inspection};root.rotation.order='YXZ';root.add(bodyGroup);bodyGroup.add(scene);root.updateMatrixWorld(true);
 const originalGeometries=new Set<THREE.BufferGeometry>(),originalMaterials=new Set<THREE.Material>(),originalTextures=new Set<THREE.Texture>();
 scene.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;originalGeometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){originalMaterials.add(m);for(const value of Object.values(m))if(value instanceof THREE.Texture)originalTextures.add(value);}}});
 const find=(name:string)=>root.getObjectByName(name)!;
 const contactShadow=base.root.getObjectByName('contact-shadow');if(contactShadow)root.attach(contactShadow);
 const makePivot=(node:THREE.Object3D,parent:THREE.Group)=>{const position=node.getWorldPosition(new THREE.Vector3());const pivot=new THREE.Group();parent.add(pivot);pivot.position.copy(parent.worldToLocal(position));parent.updateMatrixWorld(true);pivot.attach(node);return pivot;};
 const wheels:THREE.Group[]=[],steering:THREE.Group[]=[];
 for(const [index,name]of ['Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR'].entries()){
  const node=find(name),steer=makePivot(node,root),spin=new THREE.Group();steer.name='ControlSteer_'+name.slice(6);spin.name='ControlSpin_'+name.slice(6);steer.add(spin);spin.attach(node);wheels.push(spin);steering.push(steer);
  // Calipers stay fixed relative to the steering upright, rather than spinning with the rim.
  node.traverse(o=>{if(o instanceof THREE.Mesh&&!Array.isArray(o.material)&&o.material.name==='Caliper')steer.attach(o);});

 }
 const frontWing=makePivot(find('FrontWing'),bodyGroup),rearWing=makePivot(find('RearWing'),bodyGroup);
 const flap=find('RearFlap');flap.rotation.order='XYZ';
 const steeringWheelGroup=makePivot(find('SteeringWheel'),bodyGroup);
 const material=(name:string)=>{const value=[...originalMaterials].find(m=>m.name===name);if(!value)throw new Error(`Material ${name} missing`);return value as THREE.MeshStandardMaterial;};
 const paintMat=material('Paint'),accentMat=material('Accent'),helmetMat=material('HelmetPaint');
 const number=find('Number_Nose') as THREE.Mesh;number.material=base.numberPlateMat;
 let oledTexture:THREE.Texture|undefined;
 base.steeringWheelGroup.traverse(o=>{if(o instanceof THREE.Mesh&&!Array.isArray(o.material)&&o.material.map)oledTexture=o.material.map;});
 const screenMat=new THREE.MeshBasicMaterial({map:oledTexture??null});(find('OLED')as THREE.Mesh).material=screenMat;
 const blurMeshes:THREE.Mesh[]=[];
 for(let i=0;i<4;i++)base.wheels[i].traverse(o=>{if(o instanceof THREE.Mesh&&!Array.isArray(o.material)&&o.material.transparent&&o.material.type==='MeshBasicMaterial'&&o.material.map){const copy=o.clone();copy.visible=false;wheels[i].add(copy);blurMeshes.push(copy);}});
 const spokes=material('WheelSpokes');spokes.transparent=true;
 const helmets=[find('Helmet'),find('Visor')];
 const arms=[71,73,75,77,79,81,83,85].map((id,i)=>{const object=find(`Part_${id.toString().padStart(3,'0')}`);return object?{object,z:object.rotation.z,y:object.rotation.y,front:i<4,side:(i%4)<2?-1:1}:null;}).filter(Boolean);
 const steeringShiftLeds=Array.from({length:15},(_,i)=>find(`LED_${i.toString().padStart(2,'0')}`) as THREE.Mesh).filter(Boolean);
 const cockpitCameraAnchor=find('CockpitAnchor'),tcamCameraAnchor=find('TcamAnchor');
 // Anchors also use the game body frame, without inherited import transforms.
 for(const anchor of[cockpitCameraAnchor,tcamCameraAnchor])bodyGroup.attach(anchor);
 return {root,bodyGroup,frontLeftSteering:steering[0],frontRightSteering:steering[1],wheels,
  drsFlap:flap,rainLightMat:material('RainLight'),brakeDiscMats:[...originalMaterials].filter(m=>m.name.startsWith('Brake_')) as THREE.MeshStandardMaterial[],
  sidewallMat:material('Sidewall'),rubberMat:material('TireTread'),paintMat,accentMat,helmetMat,numberPlateMat:base.numberPlateMat,
  steeringWheelGroup,steeringShiftLeds,cockpitCameraAnchor,tcamCameraAnchor,
  setHelmetVisible(visible){for(const h of helmets)h.visible=visible;},setWheelMotionBlur(omega){base.setWheelMotionBlur(omega);const t=Math.max(0,Math.min(1,(Math.abs(omega)-26)/48));for(const mesh of blurMeshes)mesh.visible=t>.02;spokes.opacity=1-t*.72;},updateSuspension(pitch,roll,steerAngle){for(const arm of arms){const rel=(arm!.front?pitch*1.8:-pitch*1.8)-roll*arm!.side*.62;arm!.object.rotation.z=arm!.z+rel*arm!.side*1.25;arm!.object.rotation.y=arm!.y+(arm!.front?steerAngle*.14:0);}},
  updateSteeringTelemetry:base.updateSteeringTelemetry,
  updateLivery(primary,accent,helmet,numberMap){paintMat.color.set(primary);accentMat.color.set(accent);helmetMat.color.set(helmet);base.numberPlateMat.map=numberMap;base.numberPlateMat.needsUpdate=true;},
  setDamage(front,rear){frontWing.rotation.z=front*.13;frontWing.rotation.x=-front*.10;rearWing.rotation.z=-rear*.09;},
  dispose(){screenMat.dispose();for(const g of originalGeometries)g.dispose();for(const m of originalMaterials)m.dispose();for(const t of originalTextures)t.dispose();base.dispose();},
 };
}
export async function loadBlenderPilot(base:F1CarVisual):Promise<F1CarVisual>{
 const gltf=await createModelLoader().loadAsync(`${import.meta.env.BASE_URL}models/pilot-v8.glb`);
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
 gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const v of Object.values(m))if(v instanceof THREE.Texture)textures.add(v);}}});
 try{return adaptBlenderPilot(gltf.scene,base);}catch(error){
  for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();throw error;
 }
}

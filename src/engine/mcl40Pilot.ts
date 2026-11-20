import {teams2026} from '../sim/grid2026';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import type {F1CarVisual} from './carBuilder';
import {inspectPilot} from './blenderPilot';
import {VEHICLE_STUDIES, type VehicleStudy} from '../sim/vehicleStudies';

export function adaptMcl40(scene: THREE.Group, base: F1CarVisual, study:VehicleStudy=VEHICLE_STUDIES[0]): F1CarVisual {
  const inspection = inspectPilot(scene);
  // Joined, rotated meshes have conservative bounding boxes; use vertices for the import measurement.
  inspection.size = new THREE.Box3().setFromObject(scene,true).getSize(new THREE.Vector3()).toArray();
  if (inspection.missing.length || inspection.triangles > 180000 || inspection.size[0] > 1.96 || inspection.size[2] > 5.5) {
    throw new Error(`Invalid vehicle study: ${JSON.stringify(inspection)}`);
  }
  const find = (name: string): THREE.Object3D => {
    const node = scene.getObjectByName(name);
    if (!node) throw new Error(`Vehicle study node missing: ${name}`);
    return node;
  };
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  scene.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    geometries.add(node.geometry);
    node.castShadow = node.receiveShadow = true;
    for (const m of Array.isArray(node.material) ? node.material : [node.material]) {
      materials.add(m);
      if (m instanceof THREE.MeshStandardMaterial && m.name === 'Papaya') {
        if (study.id === 'amr26') {
          m.color.setHex(0x006c55);
          m.metalness = .58;
        }
        m.roughness = study.id === 'amr26' ? .24 : .32;
        m.envMapIntensity = 1.2;
      }
      for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value);
      if (m.name.startsWith('Sponsors_') || m.name === 'TireLettering') {
        node.castShadow = false; m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -2;
      }
    }
  });
  const material = (name: string): THREE.MeshStandardMaterial => {
    const m = [...materials].find(value => value.name === name);
    if (!m) throw new Error(`Vehicle study material missing: ${name}`);
    return m as THREE.MeshStandardMaterial;
  };
  const accentName=study.id==='sf26' ? 'TeamWhite' : 'Teal';
  for (const name of ['Papaya',accentName,'HelmetPaint','RainLight','Sidewall','TireTread']) material(name);
  for (const name of ['Steer_FL','Steer_FR','Steer_RL','Steer_RR','FrontFlap_0','FrontFlap_1']) find(name);
  let linkCount = 0;
  scene.traverse(node => {
    if (node.userData.suspensionLink) {
      const data = JSON.parse(node.userData.suspensionLink); find(data.a); find(data.b); linkCount++;
      if (!(data.restLength > 0)) throw new Error('Invalid suspension rest length');
    }
  });
  if (linkCount !== 24) throw new Error(`Expected 24 articulated suspension links, got ${linkCount}`);
  const root = new THREE.Group(); root.name = study.id+'-study'; root.rotation.order = 'YXZ'; root.add(scene);
  root.userData = {mcl40: study.id==='mcl40', vehicleStudy:study.id, modelSource:study.label, inspection};
  const bodyGroup = find('Body') as THREE.Group;
  const steering = ['FL','FR','RL','RR'].map(n => find('Steer_'+n) as THREE.Group);
  const wheels = ['FL','FR','RL','RR'].map(n => find('Wheel_'+n) as THREE.Group);
  const frontWing = find('FrontWing'), rearWing = find('RearWing'), rearFlap = find('RearFlap');
  const frontFlaps = [find('FrontFlap_0'),find('FrontFlap_1')];
  const constructor = teams2026.find(team => team.model === study.id);
  if (constructor) base.configureDisplay?.(constructor.color, study.id === 'rb22', study.id === 'amr26' ? 'AMR26' : undefined);
  let screenTexture: THREE.Texture | null = null;
  base.steeringWheelGroup.traverse(o => {
    if (o instanceof THREE.Mesh && !Array.isArray(o.material) && o.material.map) screenTexture = o.material.map;
  });
  // GLB UV convention: canvas textures default to flipY=true, while GLTFLoader textures use false.
  if (screenTexture) { (screenTexture as THREE.Texture).flipY = false; (screenTexture as THREE.Texture).needsUpdate = true; }
  const screenMat = new THREE.MeshBasicMaterial({map: screenTexture, side: THREE.DoubleSide, toneMapped: false});
  (find('OLED') as THREE.Mesh).material = screenMat;
  // The native pivots retain their upright/caliper siblings. Only the wheel children spin.
  const links: Array<{node: THREE.Object3D; a: THREE.Object3D; b: THREE.Object3D; length: number}> = [];
  scene.traverse(node => {
    if (!node.userData.suspensionLink) return;
    const data = JSON.parse(node.userData.suspensionLink);
    links.push({node, a: find(data.a), b: find(data.b), length: data.restLength});
  });
  if (links.length !== 24) throw new Error(`Expected 24 articulated suspension links, got ${links.length}`);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), delta = new THREE.Vector3(), localY = new THREE.Vector3(0,1,0);
  const shadow = base.root.getObjectByName('contact-shadow'); if (shadow) root.add(shadow);
  const frontRest = frontWing.rotation.clone(), rearRest = rearWing.rotation.clone();
  const helmet = find('Helmet'), visor = find('Visor');
  let disposed = false;
  return {
    root, bodyGroup, frontLeftSteering: steering[0], frontRightSteering: steering[1], wheels,
    drsFlap: rearFlap, rainLightMat: material('RainLight'),
    brakeDiscMats: [...materials].filter(m => m.name.startsWith('Brake_')) as THREE.MeshStandardMaterial[],
    sidewallMat: material('Sidewall'), rubberMat: material('TireTread'),
    paintMat: material('Papaya'), accentMat: material(accentName), helmetMat: material('HelmetPaint'),
    numberPlateMat: base.numberPlateMat, steeringWheelGroup: find('SteeringWheel') as THREE.Group,
    steeringShiftLeds: Array.from({length:15},(_,i) => find('LED_'+String(i).padStart(2,'0')) as THREE.Mesh),
    cockpitCameraAnchor: find('CockpitAnchor'), tcamCameraAnchor: find('TcamAnchor'),
    setHelmetVisible(visible) { helmet.visible = visor.visible = visible; },
    setWheelMotionBlur() { /* Accurate wheel pivots retained; no stretched prototype blur meshes. */ },
    updateSuspension() {
      root.updateWorldMatrix(true,true);
      for (const link of links) {
        link.a.getWorldPosition(a); link.b.getWorldPosition(b);
        bodyGroup.worldToLocal(a); bodyGroup.worldToLocal(b);
        delta.subVectors(b,a); const length = delta.length();
        if (length < 1e-6) continue;
        link.node.position.copy(a).add(b).multiplyScalar(.5);
        link.node.quaternion.setFromUnitVectors(localY,delta.multiplyScalar(1/length));
        link.node.scale.y = length/link.length;
      }
    },
    updateActiveAero(active,dt) {
      // Visual demonstration uses existing game activation; this does not certify 2026 sporting rules.
      rearFlap.rotation.x = THREE.MathUtils.damp(rearFlap.rotation.x,active ? -.28 : 0,18,dt);
      for (const flap of frontFlaps) flap.rotation.x = THREE.MathUtils.damp(flap.rotation.x,active ? -.20 : 0,18,dt);
    },
    updateSteeringTelemetry: base.updateSteeringTelemetry,
    updateLivery() { /* Preserve the selected study materials and decals across team/session changes. */ },
    setDamage(front,rear) {
      frontWing.rotation.set(frontRest.x-front*.08,frontRest.y,frontRest.z+front*.10);
      rearWing.rotation.set(rearRest.x,rearRest.y,rearRest.z-rear*.08);
    },
    dispose() {
      if (disposed) return; disposed = true; screenMat.dispose();
      for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); for (const t of textures) t.dispose();
      base.dispose();
    },
  };
}

export async function loadStudyPilot(base: F1CarVisual, study:VehicleStudy): Promise<F1CarVisual> {
  const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/${study.file}`);
  try {
    const visual = adaptMcl40(gltf.scene,base,study);
    const aston = study.id === 'amr26';
    const papaya = study.id === 'mcl40';
    const {loadRB22Template} = await import('./rb22Donor.js');
    const donor = papaya ? (await new GLTFLoader().loadAsync(import.meta.env.BASE_URL+'models/mcl-papaya-shell.glb')).scene : await loadRB22Template();
    if(papaya)(await import('./papayaLivery')).addPapayaLivery(donor);
    if(!papaya && study.id !== 'rb22'){
      const paint = aston ? 0x006c55 : study.id === 'sf26' ? 0xda151f : visual.paintMat.color.getHex();
      const trim = aston ? 0xb7df45 : study.id === 'sf26' ? 0xf6f3ed : visual.accentMat.color.getHex();
      donor.traverse(node=>{
        if(!(node instanceof THREE.Mesh))return;
        const mat=node.material;
        if(mat.name.startsWith('redbull_decals') || mat.name.startsWith('redbull_number'))node.visible=false;
        if(mat.name.startsWith('redbull_paint') || mat.name.startsWith('redbull_color')){
          mat.map=null;mat.color.setHex(mat.name.startsWith('redbull_paint')?paint:trim);
          if (aston) mat.metalness = .53;
          mat.roughness=aston ? .26 : .37;mat.needsUpdate=true;
        }
      });
      if (study.id === 'sf26') (await import('./papayaLivery')).addPapayaLivery(donor,true);
    }
    const keep = papaya ? ['Helmet','Visor','OLED'] : ['Helmet','Visor','SteeringWheel'];
    gltf.scene.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      for (let parent: THREE.Object3D | null = node; parent; parent = parent.parent)
        if (keep.includes(parent.name) || parent.name.startsWith('LED_') || parent.name.startsWith('Number_')) return;
      node.visible = false;
    });
    // Fit the imported chassis to the live axle positions, preserving individual wheel pivots.
    const corners = visual.wheels[0].getWorldPosition(new THREE.Vector3()).x > 0
      ? ['front-left','front-right','rear-left','rear-right']
      : ['front-right','front-left','rear-right','rear-left'];
    if(papaya) for(let i=0;i<4;i++) corners[i]=({'front-left':'WHEEL_LF','front-right':'WHEEL_RF','rear-left':'WHEEL_LR','rear-right':'WHEEL_RR'})[corners[i]]!;
    const center = (node:THREE.Object3D) => new THREE.Box3().setFromObject(node,true).getCenter(new THREE.Vector3());
    const original = corners.map(name => center(donor.getObjectByName(name)!));
    const target = visual.wheels.map(w => w.getWorldPosition(new THREE.Vector3()));
    const wheelbase = (target[0].z-target[2].z)/(original[0].z-original[2].z);
    donor.scale.set(Math.abs((target[0].x-target[1].x)/(original[0].x-original[1].x)),1,wheelbase);
    donor.position.copy(target[0]).sub(original[0].clone().multiply(donor.scale));
    donor.position.x = 0;
    visual.root.add(donor);
    donor.updateWorldMatrix(true,true);
    if(papaya){
      const carbon=gltf.scene.getObjectByName('Steering_Centre') as THREE.Mesh | undefined;
      const weave=carbon?.material instanceof THREE.MeshStandardMaterial ? carbon.material.map : null;
      donor.traverse(node=>{
        if(!(node instanceof THREE.Mesh) || !(node.material instanceof THREE.MeshStandardMaterial))return;
        if(node.material.name==='EXT_carbon' && weave && node.geometry.getAttribute('uv'))node.material.map=weave;
        if(node.material.name==='EXT_TYRE'){node.material.color.setHex(0x252526);node.material.roughness=.84;}
        if(node.name==='steering_wheel_vehicle_revs_type1_0')node.visible=false;
      });
    }
    const steeringModel=donor.getObjectByName(papaya?'STEER_BASE':'steering')!;
    const column=papaya?steeringModel.getWorldPosition(new THREE.Vector3()):center(steeringModel);
    visual.steeringWheelGroup.position.copy(visual.steeringWheelGroup.parent!.worldToLocal(column.clone()));
    // The LC26 halo crosses the sightline with the RB22 eye offset.
    const eyeHeight = papaya ? .145 : .22;
    const eyeSetback = papaya ? .38 : .42;
    visual.cockpitCameraAnchor.position.set(0,column.y+eyeHeight,column.z-eyeSetback);
    if(!papaya)steeringModel.visible=false;
    const imported: THREE.Mesh[] = [];
    donor.traverse(node => { if(node instanceof THREE.Mesh) {
      imported.push(node);node.castShadow=node.receiveShadow=true;
      if(node.material.name.startsWith('redbull_number')) node.visible=false;
    }});
    if(papaya){
      visual.steeringWheelGroup.attach(steeringModel);
      const screen=steeringModel.getObjectByName('steering_wheel_generic_lcd_0') as THREE.Mesh;
      const oled=gltf.scene.getObjectByName('OLED') as THREE.Mesh;
      if(screen){
        const vertices=screen.geometry.getAttribute('position');
        screen.geometry.computeBoundingBox();
        const bounds=screen.geometry.boundingBox!,uv=[];
        for(let i=0;i<vertices.count;i++)uv.push(
          (bounds.max.x-vertices.getX(i))/(bounds.max.x-bounds.min.x),
          (bounds.max.y-vertices.getY(i))/(bounds.max.y-bounds.min.y));
        screen.geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
        imported.push(new THREE.Mesh(screen.geometry,screen.material));
        screen.material=oled.material;oled.visible=false;
      }
      for(const mesh of imported){
        const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
        for(const m of mats){
          if(!(m instanceof THREE.MeshStandardMaterial))continue;
          if(m.name==='EXT_PAINT_PRIMARY')m.color.setHex(0xff8000);
          if(m.name==='EXT_PAINT_SECONDARY')m.color.setHex(0x191919);
          if(m.name==='EXT_PAINT_ACCENT')m.color.setHex(0xf25e04);
        }
      }
    }
    for(let i=0;i<4;i++) {
      const corner=corners[i], tyre=donor.getObjectByName(corner)!;
      const hub=papaya?tyre.getWorldPosition(new THREE.Vector3()):center(tyre);
      const offset=target[i].clone().sub(hub);
      const rolling=new THREE.Group();
      visual.root.add(rolling);rolling.position.copy(hub);rolling.updateMatrixWorld(true);
      rolling.attach(tyre);
      if(!papaya){
        rolling.attach(donor.getObjectByName(corner+'-drum')!);
        // Align the inclined donor disc normal to the game's transverse spin axis.
        const disc=tyre.children.find(n=>n instanceof THREE.Mesh && n.material.name.startsWith('discs')) as THREE.Mesh;
        if(disc){
          const pos=disc.geometry.getAttribute('position'),axis=new THREE.Vector3();
          const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
          for(let k=0;k+2<pos.count;k+=3){
            a.fromBufferAttribute(pos,k).applyMatrix4(disc.matrixWorld);
            b.fromBufferAttribute(pos,k+1).applyMatrix4(disc.matrixWorld).sub(a);
            c.fromBufferAttribute(pos,k+2).applyMatrix4(disc.matrixWorld).sub(a);
            b.cross(c);axis.addScaledVector(b,Math.sign(b.x)||1);
          }
          if(axis.lengthSq()>1e-10)rolling.quaternion.setFromUnitVectors(axis.normalize(),new THREE.Vector3(1,0,0));
        }
        const upright=donor.getObjectByName(corner+'-upright')!;
        visual.wheels[i].parent!.attach(upright);
      }
      if(papaya){
        const lettering=gltf.scene.getObjectByName('TireText_'+['FL','FR','RL','RR'][i]) as THREE.Mesh;
        const tread=tyre.getObjectByName(corner+'_TYRE') as THREE.Mesh;
        if(lettering && tread){
          lettering.geometry=lettering.geometry.clone();
          lettering.updateWorldMatrix(true,false);tread.updateWorldMatrix(true,false);
          const pos=lettering.geometry.getAttribute('position'),v=new THREE.Vector3();
          const dir=new THREE.Vector3(-Math.sign(target[i].x),0,0);
          const ray=new THREE.Raycaster();
          for(let k=0;k<pos.count;k++){
            v.fromBufferAttribute(pos,k);lettering.localToWorld(v);v.x=2*Math.sign(target[i].x);
            ray.set(v,dir);const hit=ray.intersectObject(tread,false)[0];
            if(hit){v.copy(hit.point).addScaledVector(dir,-.001);lettering.worldToLocal(v);pos.setXYZ(k,v.x,v.y,v.z);}
          }
          lettering.geometry.computeBoundingSphere();pos.needsUpdate=true;lettering.visible=true;
          imported.push(lettering);
        }
      }
      rolling.position.add(offset);rolling.updateMatrixWorld(true);
      visual.wheels[i].attach(rolling);
    }
    if(papaya){
      const flaps=['WING_REAR_2','FRONTWINGMOVING_FL_2','FRONTWINGMOVING_FR_2'].map(n=>donor.getObjectByName(n)).filter(n=>!!n);
      const rest=flaps.map(n=>n.rotation.x);
      visual.updateActiveAero=(active,dt)=>flaps.forEach((n,i)=>{n.rotation.x=THREE.MathUtils.damp(n.rotation.x,rest[i]-(active?.2:0),18,dt);});
    }
    const disposeWheel = (!aston && study.id !== 'rb22')
      ? (await import('./teamSteeringWheel')).mountTeamWheel(visual.steeringWheelGroup,visual.steeringShiftLeds,
          (gltf.scene.getObjectByName('OLED') as THREE.Mesh).material as THREE.Material,study.id === 'sf26',study.id)
      : undefined;
    const dispose = visual.dispose;
    visual.dispose = () => {
      disposeWheel?.();
      const mats = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
      for(const mesh of imported){mesh.geometry.dispose();mats.add(mesh.material as THREE.Material);}
      for(const mat of mats){for(const value of Object.values(mat)) if(value instanceof THREE.Texture) textures.add(value);mat.dispose();}
      for(const texture of textures)texture.dispose();
      dispose();
    };
    return visual;
  }
  catch (error) {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    gltf.scene.traverse(o => { if (o instanceof THREE.Mesh) {geometries.add(o.geometry); for (const m of Array.isArray(o.material)?o.material:[o.material]) {materials.add(m); for (const v of Object.values(m)) if (v instanceof THREE.Texture) textures.add(v);}} });
    for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); for (const t of textures) t.dispose(); throw error;
  }
}

/** Backward-compatible entry point for the approved MCL40 kit. */
export function loadMcl40Pilot(base:F1CarVisual):Promise<F1CarVisual> {return loadStudyPilot(base,VEHICLE_STUDIES[0]);}

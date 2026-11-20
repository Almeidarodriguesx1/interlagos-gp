import * as THREE from 'three';
import {createModelLoader} from './modelLoader';
import type { CarState } from '../sim/types';

const distances = [0, 32, 75];
const corners = ['FL', 'FR', 'RL', 'RR'];

function disposeTemplates(templates: THREE.Group[]) {
  const resources = new Set<THREE.Texture | THREE.Material | THREE.BufferGeometry>();
  for (const scene of templates) scene.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    resources.add(node.geometry);
    for (const mat of Array.isArray(node.material) ? node.material : [node.material]) {
      resources.add(mat);
      for (const value of Object.values(mat)) if (value instanceof THREE.Texture) resources.add(value);
    }
  });
  for (const resource of resources) resource.dispose();
}

export class RivalLodGrid {
  readonly root = new THREE.Group();
  private readonly slots: {lod: THREE.LOD; wheels: THREE.Object3D[][]}[] = [];

  private constructor(private readonly templates: THREE.Group[], private readonly teams: (string | undefined)[], banks: Map<string, THREE.Group[]>) {
    this.root.name = 'MCL40-grid-test';
    for (let i = 0; i < teams.length; i++) {
      const lod = new THREE.LOD();
      lod.name = (teams[i] ?? 'original') + '-' + i;
      lod.autoUpdate = false;
      lod.rotation.order = 'YXZ';
      const wheels = (banks.get(teams[i] ?? "") ?? []).map((template, level) => {
        const model = template.clone(true);
        lod.addLevel(model, distances[level], 0.1);
        return corners.map(corner => {
          const wheel = model.getObjectByName('L' + (level + 1) + '_Wheel_' + corner) ?? model.getObjectByName('Wheel_' + corner);
          if (!wheel) throw Error('Missing wheel pivot ' + corner);
          wheel.rotation.order = 'YXZ';
          return wheel;
        });
      });
      this.slots.push({lod, wheels});
      this.root.add(lod);
    }
  }

  handles(slot: number) { return this.root.visible && !!this.teams[slot]; }

  static async load(teams: (string | undefined)[]) {
    const loader = createModelLoader();
    const templates: THREE.Group[] = [];
    try {
      const banks = new Map<string, THREE.Group[]>();
      const urls = ['rb22-grid/rb22-lod1.glb','grid-shell-lod2.glb','grid-shell-lod3.glb'];
      const loads = await Promise.allSettled(urls.map(async (url, level) => {
        const {scene} = await loader.loadAsync(import.meta.env.BASE_URL + 'models/' + url);
        templates.push(scene);
        scene.traverse(node => {
          if (node instanceof THREE.Mesh) {
            node.castShadow = level < 2;
            node.receiveShadow = true;
          }
        });
        return scene;
      }));
      const shells = loads.map(result => {
        if (result.status === 'rejected') throw result.reason;
        return result.value;
      });
      const colors: Record<string, [number,number]> = {
        sf26:[0xda151f,0xf6f3ed], mcl40:[0xff8000,0x222225], amr26:[0x006c55,0xb7df45],
        fw48:[0x1045ac,0x53bdff], vf26:[0xf2efec,0xc62332], w17:[0xbcc2c4,0x23cbb7],
        a526:[0x197bd2,0xf897c8], vcarb03:[0xf7f7fa,0x2356da], r26:[0xb7b7ba,0xf43c24],
        mac26:[0x27282b,0xedeeee],
      };
      for (const team of new Set(teams)) {
        if (!team) continue;
        const palette = colors[team];
        const bank = shells.map(shell => {
          if (!palette) return shell;
          const model = shell.clone(true);
          templates.push(model);
          const paint = new Map<THREE.Material, THREE.MeshStandardMaterial>();
          model.traverse(mesh => {
            if (!(mesh instanceof THREE.Mesh)) return;
            const mat = mesh.material;
            if (!(mat instanceof THREE.MeshStandardMaterial)) return;
            if (mat.name.startsWith('redbull_decals')) mesh.visible = false;
            if (!/^redbull_(paint|color)/.test(mat.name)) return;
            if (!paint.has(mat)) {
              const finish = mat.clone();
              finish.map = null;
              finish.color.setHex(palette[mat.name.startsWith('redbull_paint') ? 0 : 1]);
              paint.set(mat,finish);
            }
            mesh.material = paint.get(mat)!;
          });
          return model;
        });
        banks.set(team,bank);
      }
      return new RivalLodGrid(templates, teams, banks);
    } catch (error) {
      disposeTemplates(templates);
      throw error;
    }
  }

  update(cars: CarState[], camera: THREE.PerspectiveCamera) {
    if (!this.root.visible) return;
    camera.updateWorldMatrix(true, false);
    for (let i = 0; i < this.slots.length; i++) {
      const {lod, wheels} = this.slots[i];
      const car = cars[i];
      lod.visible = this.handles(i) && !!car && !car.isPlayer;
      if (!lod.visible) continue;
      lod.position.set(car.x, car.y, car.z);
      lod.rotation.set(car.trackPitch, car.yaw, car.trackBank, 'YXZ');
      lod.updateWorldMatrix(true, false);
      lod.update(camera);
      const level = lod.getCurrentLevel();
      for (let w = 0; w < 4; w++) {
        wheels[level][w].rotation.set(car.wheelSpin, w < 2 ? car.steerAngle : 0, 0, 'YXZ');
      }
    }
  }

  levels() {
    return this.slots.filter(s => this.root.visible && s.lod.visible).map(s => s.lod.getCurrentLevel() + 1);
  }

  dispose() {
    this.root.removeFromParent();
    disposeTemplates(this.templates);
  }
}

import * as THREE from 'three';
import {createModelLoader} from './modelLoader';

export function attachStandPreview(stand: THREE.Group, length: number, sector: 'a' | 'd', manager?: THREE.LoadingManager): () => void {
  const original = stand.children.slice(3).filter(object => object.name !== 'seated-spectators');
  let disposed = false;
  let model: THREE.Group | undefined;
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();
  const disposeResources = () => {
    model?.removeFromParent();
    model?.traverse(node => { if (node instanceof THREE.InstancedMesh) node.dispose(); });
    for (const material of materials) material.dispose();
    for (const geometry of geometries) geometry.dispose();
  };

  const file = `${import.meta.env.BASE_URL}models/interlagos-trecho1-setor-${sector}.glb`;
  void createModelLoader(manager).loadAsync(file).then(({scene}) => {
    scene.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
      node.castShadow = node.receiveShadow = true;
    });
    if (disposed) {
      disposeResources();
      return;
    }
    const bounds = new THREE.Box3().setFromObject(scene);
    const size = bounds.getSize(new THREE.Vector3());
    if (!(size.x > 0 && size.y > 0 && size.z > 0)) throw new Error('Invalid stand dimensions.');
    const center = bounds.getCenter(new THREE.Vector3());
    const count = Math.ceil(length / 14);
    const span = length / count;
    model = new THREE.Group();
    model.name = 'Interlagos Blender ' + sector.toUpperCase();
    scene.updateMatrixWorld(true);
    const placement = new THREE.Object3D();
    placement.scale.set(14 / size.x, 10 / size.y, (span - .24) / size.z);
    const matrix = new THREE.Matrix4();
    scene.traverse(mesh => {
      if (!(mesh instanceof THREE.Mesh)) return;
      const bays = new THREE.InstancedMesh(mesh.geometry, mesh.material, count);
      bays.castShadow = bays.receiveShadow = true;
      for (let i = 0; i < count; i++) {
        placement.position.set(-1.8 - center.x * placement.scale.x, 1 - bounds.min.y * placement.scale.y,
          -length / 2 + (i + .5) * span - center.z * placement.scale.z);
        placement.updateMatrix();
        bays.setMatrixAt(i, matrix.multiplyMatrices(placement.matrix, mesh.matrixWorld));
      }
      model!.add(bays);
    });
    stand.add(model);
    for (const object of original) object.visible = false;
  }).catch(error => {
    disposeResources();
    if (!disposed) console.warn('Arquibancada de prévia indisponível', error);
  });

  return () => {
    disposed = true;
    disposeResources();
  };
}

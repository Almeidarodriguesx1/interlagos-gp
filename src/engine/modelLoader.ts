import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';

import type {LoadingManager} from 'three';

export function createModelLoader(manager?: LoadingManager) {
  return new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
}

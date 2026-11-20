import * as THREE from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';

/** Export a clone; game materials and GPU resources remain owned by the renderer. */
export async function exportPilot(root:THREE.Group):Promise<string> {
  const model=root.clone(true);model.position.set(0,0,0);model.rotation.set(0,0,0);
  const materials=new Map<THREE.Material,THREE.Material>(),textures=new Map<THREE.Texture,THREE.Texture>();
  const convert=(source:THREE.Texture):THREE.Texture=>{
    if(!(source as THREE.DataTexture).isDataTexture)return source;
    const cached=textures.get(source);if(cached)return cached;
    const image=source.image as {width:number;height:number;data:Uint8Array};
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d')!,pixels=ctx.createImageData(image.width,image.height);
    pixels.data.set(image.data);ctx.putImageData(pixels,0,0);
    const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=source.colorSpace;tex.flipY=source.flipY;
    tex.wrapS=source.wrapS;tex.wrapT=source.wrapT;tex.repeat.copy(source.repeat);tex.offset.copy(source.offset);tex.rotation=source.rotation;
    textures.set(source,tex);return tex;
  };
  const cloneMaterial=(source:THREE.Material):THREE.Material=>{
    let copy=materials.get(source);if(copy)return copy;
    copy=source.clone();materials.set(source,copy);
    const fields=copy as unknown as Record<string,THREE.Texture>;
    for(const field of ['map','normalMap','roughnessMap','metalnessMap','aoMap','bumpMap'])if(fields[field]?.isTexture)fields[field]=convert(fields[field]);
    return copy;
  };
  model.traverse(object=>{
    if(object.name==='contact-shadow')object.visible=false;
    if(object instanceof THREE.Mesh)object.material=Array.isArray(object.material)?object.material.map(cloneMaterial):cloneMaterial(object.material);
  });
  model.updateMatrixWorld(true);
  try{
    const buffer=await new GLTFExporter().parseAsync(model,{binary:true,onlyVisible:true,maxTextureSize:1024}) as ArrayBuffer;
    const bytes=new Uint8Array(buffer);let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
    return btoa(binary);
  }finally{for(const material of materials.values())material.dispose();for(const texture of textures.values())texture.dispose();}
}

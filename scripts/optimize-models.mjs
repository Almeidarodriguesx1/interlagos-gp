import {globSync, mkdirSync, copyFileSync, existsSync, writeFileSync, statSync, constants} from 'node:fs';
import {dirname} from 'node:path';
import {NodeIO, PropertyType, VertexLayout} from '@gltf-transform/core';
import {ALL_EXTENSIONS, EXTMeshoptCompression} from '@gltf-transform/extensions';
import {reorder, weld, quantize, prune, textureCompress} from '@gltf-transform/functions';
import {MeshoptEncoder, MeshoptDecoder} from 'meshoptimizer';
import sharp from 'sharp';

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().setVertexLayout(VertexLayout.SEPARATE).registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
// The donor splitter reads raw attribute arrays. Keep raw float attributes on the papaya shell.
const selected = globSync('**/*.glb',{cwd:'public/models'}).filter(name =>
  /^mcl-papaya-shell|-grid\/|^grid-shell|-(study|v0[12])\.glb$|^pilot-v8/.test(name) && !name.startsWith('pit-'));
for (const name of selected.sort()) {
  const target = 'public/models/'+name;
  const original = 'assets-source/models/'+name;
  mkdirSync(dirname(original),{recursive:true});
  if (!existsSync(original)) copyFileSync(target,original,constants.COPYFILE_EXCL);
  const doc = await io.read(original);
  for (const mesh of doc.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
    if (!primitive.getMaterial()?.getNormalTexture()) primitive.setAttribute('TANGENT',null);
  }
  // Snap local render coordinates before lossless encoding, without moving object pivots.
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    if (name.includes('papaya-shell')) continue;
    const positions = prim.getAttribute('POSITION')?.getArray();
    if (positions instanceof Float32Array) for (let i=0;i<positions.length;i++) {
      positions[i] = Math.round(positions[i]*32768)/32768;
    }
  }
  if (!name.includes('papaya-shell')) await doc.transform(weld(), reorder({encoder:MeshoptEncoder,cleanup:false}), quantize({pattern:/^(NORMAL|COLOR_0)$/,cleanup:false}),
    prune({propertyTypes:[PropertyType.ACCESSOR],keepAttributes:true}),
    textureCompress({encoder:sharp,targetFormat:'webp',resize:name.includes('lod')?[1024,1024]:[2048,2048],quality:92}));
  doc.createExtension(EXTMeshoptCompression).setRequired(true);
  const bytes = await io.writeBinary(doc);
  if (bytes.length < statSync(original).size) writeFileSync(target,bytes);
  else copyFileSync(original,target);
}

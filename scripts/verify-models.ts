import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {globSync, statSync, readFileSync} from 'node:fs';
import {BufferGeometry} from 'three';
import {buildTrackGeometryBundle} from '../src/engine/trackBuilder';
import {getTrack, buildSurveyedInterlagos} from '../src/sim/track';

const hash = createHash('sha256');
for (const track of [getTrack('interlagos'),getTrack('monza'),getTrack('spa'),buildSurveyedInterlagos()]) {
  hash.update(JSON.stringify(track.samples));
  for (const geometry of Object.values(buildTrackGeometryBundle(track))) {
    if (!(geometry instanceof BufferGeometry)) continue;
    for (const attr of [geometry.getAttribute('position'), geometry.index]) {
      if (attr) hash.update(Buffer.from(attr.array.buffer, attr.array.byteOffset, attr.array.byteLength));
    }
    geometry.dispose();
  }
}
const digest=hash.digest('hex');
if(process.argv.includes('--print')) console.log(digest);
else {
  assert.equal(digest,readFileSync('docs/otimizacao/geometry.sha256','utf8').trim());
  const bytes=globSync('public/models/**/*').map(path=>statSync(path)).filter(s=>s.isFile()).reduce((n,s)=>n+s.size,0);
  console.log('Modelos em bytes',bytes);
  assert.ok(bytes<=51592000,'Orçamento de modelos excedido');
}

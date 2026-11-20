import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{Matrix4,Quaternion,Vector3}from'three';import{PILOT_NODES}from'./blenderPilot';
test('Blender runtime asset preserves named controls, embedded images and the current physical wheelbase',()=>{
 const bytes=readFileSync(new URL('../../public/models/pilot-v8.glb',import.meta.url));assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
 const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 for(const name of PILOT_NODES)assert.ok(json.nodes.some((n:any)=>n.name===name),`Missing ${name}`);
 for(let i=0;i<15;i++)assert.ok(json.nodes.some((n:any)=>n.name===`LED_${i.toString().padStart(2,'0')}`));
 assert.ok(json.images.length>=8&&json.images.every((image:any)=>image.bufferView!==undefined&&!image.uri));
 const parents=new Map<number,number>();json.nodes.forEach((node:any,index:number)=>(node.children??[]).forEach((child:number)=>parents.set(child,index)));
 const world=(i:number):Matrix4=>{const n=json.nodes[i];const m=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3().fromArray(n.translation??[0,0,0]),new Quaternion().fromArray(n.rotation??[0,0,0,1]),new Vector3().fromArray(n.scale??[1,1,1]));const parent=parents.get(i);return parent===undefined?m:world(parent).multiply(m);};
 const position=(name:string)=>new Vector3().setFromMatrixPosition(world(json.nodes.findIndex((n:any)=>n.name===name)));
 const front=position('Wheel_FL'),rear=position('Wheel_RL');assert.ok(Math.abs(front.z-rear.z-3.6)<.002);assert.ok(Math.abs(front.y-.36)<.002&&Math.abs(rear.y-.36)<.002);
 let triangles=0;for(const mesh of json.meshes)for(const p of mesh.primitives)triangles+=(p.indices===undefined?json.accessors[p.attributes.POSITION].count:json.accessors[p.indices].count)/3;
 assert.ok(triangles>20000&&triangles<180000);
});

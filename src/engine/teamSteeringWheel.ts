import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

// Visual studies from the supplied guide. Width, grip and switch spacing are estimated.
const layouts: Record<string, {name:string; width:number; open:boolean; spacing:number; colors:number[]}> = {
  w17:{name:'Mercedes',width:1.05,open:true,spacing:57,colors:[0x66ded3,0xf5a6aa,0xbcbbff]},
  fw48:{name:'Williams',width:.99,open:false,spacing:48,colors:[0x287ad3,0xf0f4fa,0x64caff]},
  vcarb03:{name:'Racing Bulls',width:1.09,open:false,spacing:55,colors:[0x2457db,0xf4f4f4,0xe74944]},
  a526:{name:'Alpine',width:1.03,open:false,spacing:46,colors:[0x308bed,0xf09dc7,0xf5d64a]},
  vf26:{name:'Haas',width:.98,open:true,spacing:50,colors:[0xbb1923,0xeceff0,0x75777c]},
  r26:{name:'Audi',width:1,open:true,spacing:45,colors:[0xc32829,0xb6bbc2,0x585e65]},
  mac26:{name:'Cadillac',width:1.04,open:false,spacing:54,colors:[0xeeeeee,0x888e96,0x363b42]},
};

/** Cockpit studies in millimetres, based on the supplied SF and MCL36 replica dimensions. */
export function mountTeamWheel(pivot:THREE.Group, leds:THREE.Mesh[], display:THREE.Material, ferrari:boolean, model = ''){
  const layout = layouts[model];
  const open = layout?.open ?? ferrari;
  for(const child of pivot.children) if(!leds.includes(child as THREE.Mesh))child.visible=false;
  const wheel=new THREE.Group();wheel.name=ferrari?'SF open-grip wheel':'MCL sculpted wheel';
  if(layout) wheel.name = layout.name + ' steering wheel';
  wheel.scale.set(.001*(layout?.width ?? 1),.001,.001);pivot.add(wheel);
  const resources=new Set<{dispose():void}>();
  const material=(color:number,roughness:number)=>{
    const m=new THREE.MeshStandardMaterial({color,roughness});resources.add(m);return m;
  };
  const carbon=material(0x25292e,.43),rubber=material(0x17191c,.88),metal=material(0x70757a,.4);
  const accent=material(layout?.colors[0] ?? (ferrari?0xce192a:0xff821f),.4);
  function part(geo:THREE.BufferGeometry,mat:THREE.Material,x:number,y:number,z:number){
    const mesh=new THREE.Mesh(geo,mat);mesh.position.set(x,y,z);wheel.add(mesh);resources.add(geo);return mesh;
  }
  function block(w:number,h:number,d:number,x:number,y:number,z:number,mat:THREE.Material,r=3){
    return part(new RoundedBoxGeometry(w,h,d,2,r),mat,x,y,z);
  }
  function dial(r:number,d:number,x:number,y:number,z:number,mat:THREE.Material){
    const m=part(new THREE.CylinderGeometry(r,r,d,24),mat,x,y,z);m.rotation.x=Math.PI/2;return m;
  }
  const face=new THREE.Shape();
  const outline=open?[[96,78],[117,63],[111,-34],[85,-72],[52,-84],[-52,-84],[-85,-72],[-111,-34],[-117,63],[-96,78]]:
    [[70,79],[108,68],[124,42],[103,5],[88,-28],[65,-65],[36,-81],[-36,-81],[-65,-65],[-88,-28],[-103,5],[-124,42],[-108,68],[-70,79]];
  outline.forEach(([x,y],i)=>i?face.lineTo(x,y):face.moveTo(x,y));face.closePath();
  part(new THREE.ExtrudeGeometry(face,{depth:19,bevelThickness:2,bevelSize:2,bevelSegments:3}),carbon,0,0,-19);
  for(const side of [-1,1]){
    const path=(open?[[100,62],[124,72],[130,43],[130,-15],[119,-65]]:[[99,55],[120,58],[127,30],[119,-15],[108,-60],[87,-50]])
      .map(([x,y])=>new THREE.Vector3(x*side,y,0));
    part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path),24,13,12,false),rubber,0,0,-3);
    block(48,22,5,side*83,-50,34,carbon).rotation.z=side*.23;
    if(!ferrari)block(54,31,5,side*87,25,33,carbon).rotation.z=side*.18;
    else for(const y of [26,-18]) block(10,22,12,side*108,y,-21,metal);
  }
  if(ferrari)block(205,24,6,0,23,32,carbon);
  else dial(15,9,0,-49,34,metal);
  dial(34,49,0,0,26,metal);
  block(130,81,10,0,28,-21,carbon,5);
  const lcd=part(new THREE.PlaneGeometry(95,54),display,0,27,-27);
  lcd.rotation.y=Math.PI;
  const uv=lcd.geometry.getAttribute('uv');
  for(let i=0;i<uv.count;i++)uv.setY(i,1-uv.getY(i));
  leds.forEach((led,i)=>{pivot.attach(led);led.position.set((7-i)*.007,.066,-.029);});
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
  const ctx=canvas.getContext('2d')!;
  const label=(s:string,x:number,y:number,size:number,color='white')=>{
    ctx.fillStyle=color;ctx.font='bold '+size+'px Arial';ctx.textAlign='center';ctx.fillText(s,(.5-x/240)*1024,(.5-y/152)*512);
  };
  label(layout?.name ?? (ferrari?'FERRARI':'McLaren'),0,-9,25,ferrari?'#ffe958':'#ff902a');
  const colors=(layout?.colors ?? [0xe84233,0x2794de,0xfccf28,0x29b684,0xeef2f2,0xaa69c7]).map(c=>material(c,.42));
  for(const side of [-1,1])for(let i=0;i<(open || model==='vcarb03'?6:5);i++){
    const x=side*(74+20*(i%2)),y=51-23*Math.floor(i/2);
    dial(6.4,6,x,y,-25,colors[(i+(side===1?0:2))%colors.length]);
    label(!ferrari&&side===1&&i===0?'X':['N','P','R','+','−','B'][i],x,y-2,17);
  }
  for(let i=-1;i<=1;i++){
    const x=i*(layout?.spacing ?? 52),y=ferrari?-43:-38-Math.abs(i)*7;
    dial(i===0?15:12,9,x,y,-25,i===0?accent:rubber);
    block(2,10,2,x,y+4,-31,metal,1);
    label((ferrari?['DIFF','MANETTINO','ERS']:['DIFF','MODE','STRAT'])[i+1],x,y-20,20);
  }
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;resources.add(map);
  const ink=new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false});resources.add(ink);
  part(new THREE.PlaneGeometry(240,152),ink,0,0,-32).rotation.y=Math.PI;
  return ()=>{wheel.removeFromParent();for(const resource of resources)resource.dispose();};
}

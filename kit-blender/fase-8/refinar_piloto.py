"""Blender 5.3: refine the approved pilot prototype; save native source and runtime GLB.
Run: Blender --background --python refinar_piloto.py -- PROJECT_ROOT SOURCE_GLB [PREVIEW_PNG]
"""
import bpy,bmesh,sys,math,json
from pathlib import Path
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:];root=Path(args[0]);source=Path(args[1]);out=root/'kit-blender/fase-8';out.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
model=bpy.data.objects['PilotRoot'];body=bpy.data.objects['Body'];steering=bpy.data.objects['SteeringWheel'];model['asset_phase']=8;model['units']='metres';model['wheelbase_m']=3.6;model['authoring']='Blender refinement of the approved Part 7 procedural pilot; not a scanned team replica'
# Blender import converts the game Y-up frame to Blender Z-up.
def game(v):return Vector((v[0],-v[2],v[1]))
def set_world(o,p):m=o.matrix_world.copy();m.translation=game(p);o.matrix_world=m
bpy.context.view_layer.update()
for name,x,z in [('WheelSteer_FL',.805,1.8),('WheelSteer_FR',-.805,1.8),('Wheel_RL',.775,-1.8),('Wheel_RR',-.775,-1.8)]:set_world(bpy.data.objects[name],(x,.36,z))
# Match suspension pickup positions to the new axle centers.
bpy.context.view_layer.update()
for i,node in enumerate([71,73,75,77,79,81,83,85]):
 o=bpy.data.objects.get('Part_%03d'%node)
 if o:
  w=o.matrix_world.copy();w.translation.y-=.22 if i<4 else -.28;o.matrix_world=w
for name in ['pilot-carbon-hardware','pilot-intakes-and-vents']:
 o=bpy.data.objects.get(name)
 if o and o.type=='MESH':
  for v in o.data.vertices:
   x=abs(v.co.x);z=-v.co.y;weight=max(0,min(1,(x-.22)/.5))
   if 1.1<z<1.72:v.co.y-=.22*weight
   elif -1.62<z<-1.1:v.co.y+=.28*weight
# Controlled bevels on wing plates and selected cockpit hardware. Tire topology stays intact.
wing=bpy.data.objects['FrontWing']
for o in list(wing.children_recursive)+list(bpy.data.objects['RearWing'].children_recursive):
 if o.type=='MESH' and len(o.data.polygons)<1000:
  mod=o.modifiers.new('Edge finish - editable','BEVEL');mod.width=.003;mod.segments=3;mod.limit_method='ANGLE';mod.angle_limit=.55
for o in model.children_recursive:
 if o.type=='MESH':
  for p in o.data.polygons:p.use_smooth=True
# Paint/metal/carbon remain separate editable PBR materials and embedded textures.
for name,rough in [('Paint',.24),('Accent',.28),('Carbon',.48),('Titanium',.22)]:
 mat=bpy.data.materials.get(name)
 if mat and mat.use_nodes:
  bs=next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
  if bs:
   bs.inputs['Roughness'].default_value=rough
   if name in ['Paint','Accent']:
    bs.inputs['Coat Weight'].default_value=.6;bs.inputs['Coat Roughness'].default_value=.14
# Close the open engine-cover ends left by the prototype loft; intake holes remain open.
for obj in bpy.data.objects['pilot-sculpted-bodywork'].children:
 if obj.type=='MESH' and any(m and m.name=='Paint' for m in obj.data.materials):
  bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
  for plane in [.35,1.83]:
   edges=[e for e in bm.edges if e.is_boundary and all(abs(v.co.y-plane)<.003 for v in e.verts)]
   if edges:bmesh.ops.holes_fill(bm,edges=edges,sides=0)
  bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
carbon=bpy.data.materials.get('Carbon')
if carbon and carbon.use_nodes:
 bs=carbon.node_tree.nodes.get('Principled BSDF')
 if bs and bs.inputs['Base Color'].is_linked:
  node=bs.inputs['Base Color'].links[0].from_node
  if node.type=='TEX_IMAGE' and node.image:
   import numpy as np
   img=node.image.copy();pixels=np.array(img.pixels[:],dtype=np.float32).reshape(-1,4);pixels[:,:3]*=.55;img.pixels.foreach_set(pixels.ravel());img.update();img.pack();node.image=img
# Add LED lenses that were omitted by the previous visible-only runtime export.
def material(name,color,metal=0,rough=.4,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
 if emission:bs.inputs['Emission Color'].default_value=(*color,1);bs.inputs['Emission Strength'].default_value=emission
 return m
def cube(name,pos,scale,mat,parent):
 bpy.ops.mesh.primitive_cube_add(size=1,location=game(pos));o=bpy.context.object;o.name=name;o.dimensions=scale[0],scale[2],scale[1];bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat);world=o.matrix_world.copy();o.parent=parent;o.matrix_world=world;return o
ledm=[material('LED_Green',(.03,.8,.12),emission=1),material('LED_Red',(.9,.02,.01),emission=1),material('LED_Blue',(.02,.3,1),emission=1)]
for i in range(15):
 x=-(i-7)*.0086;y=.048+math.cos((i-7)/7*.65)*.0035;z=-.0155
 wy=.675+math.cos(-.3)*y-math.sin(-.3)*z;wz=.49+math.sin(-.3)*y+math.cos(-.3)*z
 cube('LED_%02d'%i,(x,wy,wz),(.006,.004,.004),ledm[i//5],steering)
# Service panel seams and fasteners are modelled pieces, not painted fake lighting.
metal=bpy.data.materials['Titanium'];dark=bpy.data.materials['Cavity']
for side in [-1,1]:
 for i in range(5):
  x=side*(.28-.014*i);z=.72+i*.135;y=.545-i*.009
  bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=4,radius=.008,location=game((x,y,z)));o=bpy.context.object;o.name='Service_fastener';o.data.materials.append(metal);world=o.matrix_world.copy();o.parent=body;o.matrix_world=world
# Native collision reference, intentionally excluded from runtime export.
collection=bpy.data.collections.new('Collision reference - not exported');bpy.context.scene.collection.children.link(collection)
proxy=cube('Proxy_Capsule_Envelope',(0,.35,0),(1.96,.7,5.26),dark,None)
for c in list(proxy.users_collection):c.objects.unlink(proxy)
collection.objects.link(proxy);proxy.display_type='WIRE';proxy.hide_render=True;proxy.hide_set(True)
# A studio, native camera and lighting make the .blend immediately useful for editing.
world=bpy.context.scene.world or bpy.data.worlds.new('Studio');bpy.context.scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.12,.14,.18,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
studio=bpy.data.collections.new('Studio - not exported');bpy.context.scene.collection.children.link(studio)
def to_studio(o):
 for c in list(o.users_collection):c.objects.unlink(o)
 studio.objects.link(o)
floor_mat=material('Studio_floor',(.035,.04,.05),rough=.48);bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.015));floor=bpy.context.object;floor.name='StudioFloor';floor.data.materials.append(floor_mat);to_studio(floor)
for name,pos,power,size in [('Key',(3,-3,6),1200,5),('Fill',(-4,-1,3),900,4),('Rim',(1,4,5),1500,4)]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;o=bpy.data.objects.new(name,data);studio.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,.4))-o.location).to_track_quat('-Z','Y').to_euler()
camdata=bpy.data.cameras.new('StudioCamera');cam=bpy.data.objects.new('StudioCamera',camdata);studio.objects.link(cam);cam.location=game((4.0,2.6,6.5));cam.rotation_euler=(game((0,.45,0))-cam.location).to_track_quat('-Z','Y').to_euler();camdata.lens=48;bpy.context.scene.camera=cam
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True;scene.render.resolution_x=1400;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
bpy.ops.object.select_all(action='DESELECT');model.select_set(True)
for o in model.children_recursive:o.select_set(True)
bpy.context.view_layer.objects.active=model
# Tangent export is computed from deterministic triangles; modifiers keep source editing non-destructive.
for o in model.children_recursive:
 if o.type=='MESH':o.modifiers.new('Runtime triangulation','TRIANGULATE')
# Export only the vehicle, retaining the node names required by the game adapter.
runtime=root/'public/models/pilot-v8.glb';runtime.parent.mkdir(exist_ok=True,parents=True)
bpy.ops.export_scene.gltf(filepath=str(runtime),export_format='GLB',use_selection=True,export_apply=True,export_animations=False,export_tangents=True,export_cameras=False,export_lights=False,export_yup=True)
sys.path.insert(0,str(out));from sanear_glb import repair_tangents
repaired=repair_tangents(runtime)
scene.unit_settings.system='METRIC';scene.unit_settings.length_unit='METERS';scene.unit_settings.scale_length=1
bpy.ops.wm.save_as_mainfile(filepath=str(out/'Auriverde-Piloto-Fase8.blend'))
report={'blenderVersion':bpy.app.version_string,'source':source.name,'output':'public/models/pilot-v8.glb','wheelbaseMeters':3.6,'widthMeters':1.96,'kind':'Native Blender refinement of Part 7 prototype, current game dimensions; not a 2026 team replica','repairedUvPoleTangents':repaired,'runtimeMeshObjects':sum(o.type=='MESH'for o in model.children_recursive),'requiredNodes':['Body','Wheel_FL','Wheel_FR','Wheel_RL','Wheel_RR','FrontWing','RearWing','RearFlap','SteeringWheel','Helmet','Visor','CockpitAnchor','TcamAnchor']};(out/'manifest.json').write_text(json.dumps(report,indent=2))
if len(args)>2:scene.render.filepath=args[2];bpy.ops.render.render(write_still=True)

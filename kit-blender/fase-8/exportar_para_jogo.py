"""Run in Blender with this project's .blend open. Export the named vehicle only.
CLI: Blender --background Auriverde-Piloto-Fase8.blend --python exportar_para_jogo.py -- PROJECT_ROOT
"""
import bpy,sys,json
from pathlib import Path
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
project=Path(args[0]).resolve() if args else Path(bpy.data.filepath).resolve().parents[2]
if not (project/'package.json').is_file():raise RuntimeError('Informe a raiz do projeto após -- ou mantenha o .blend em kit-blender/fase-8.')
model=bpy.data.objects.get('PilotRoot')
if not model:raise RuntimeError('PilotRoot não encontrado. Preserve a hierarquia de controle do carro.')
bpy.ops.object.select_all(action='DESELECT');model.select_set(True)
for obj in model.children_recursive:obj.select_set(True)
bpy.context.view_layer.objects.active=model
file=project/'public/models/pilot-v8.glb';file.parent.mkdir(exist_ok=True,parents=True)
bpy.ops.export_scene.gltf(filepath=str(file),export_format='GLB',use_selection=True,export_apply=True,export_animations=False,export_tangents=True,export_cameras=False,export_lights=False,export_yup=True)
sys.path.insert(0,str(project/'kit-blender/fase-8'))
from sanear_glb import repair_tangents
print({'exported':str(file),'repairedDegenerateTangents':repair_tangents(file)})

class_name GlbPropLoader
extends RefCounted

## Pipeline de ativos 3D em .glb (compatível com modelos gerados por IA via Meshy/Tripo/Luma + Blender).
## Coloque arquivos .glb em res://assets/glb/ com nomes:
## - grandstand.glb
## - pit_building.glb
## - tree_atlantic.glb
## - timing_tower.glb
## - f1_chassis.glb

const GLB_BASE_DIR := "res://assets/glb/"

static func try_load_glb_scene(prop_name: String, max_draw_dist: float = 420.0) -> Node3D:
	var path := GLB_BASE_DIR + prop_name + ".glb"
	if not ResourceLoader.exists(path):
		return null

	var packed := ResourceLoader.load(path)
	if not (packed is PackedScene):
		return null

	var instance := (packed as PackedScene).instantiate()
	if not (instance is Node3D):
		return null

	var root := instance as Node3D
	_normalize_bottom_pivot_and_pbr(root, max_draw_dist)
	return root

static func extract_first_mesh_for_multimesh(prop_name: String) -> Mesh:
	var node := try_load_glb_scene(prop_name, 520.0)
	if node == null:
		return null
	var found := _find_mesh_recursive(node)
	node.queue_free()
	return found

static func _find_mesh_recursive(node: Node) -> Mesh:
	if node is MeshInstance3D and (node as MeshInstance3D).mesh != null:
		return (node as MeshInstance3D).mesh
	for child in node.get_children():
		var m := _find_mesh_recursive(child)
		if m != null:
			return m
	return null

static func _normalize_bottom_pivot_and_pbr(root: Node3D, max_draw_dist: float) -> void:
	var min_y := INF
	var meshes: Array[MeshInstance3D] = []
	_collect_meshes(root, meshes)

	for mi in meshes:
		var aabb := mi.get_aabb()
		var world_bottom := mi.transform.origin.y + aabb.position.y
		if world_bottom < min_y:
			min_y = world_bottom

		# Configura LOD por distância para evitar travamentos em cena aberta
		mi.visibility_range_begin = 0.0
		mi.visibility_range_end = max_draw_dist
		mi.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF

		# Garante configurações PBR consistentes para Apple Metal Forward+
		var surf_count := mi.get_surface_override_material_count()
		for s_idx in range(surf_count):
			var mat := mi.get_active_material(s_idx)
			if mat is StandardMaterial3D:
				var std := mat as StandardMaterial3D
				std.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC

	# Alinha pivô inferior exatamente em Y = 0 para evitar árvores/prédios flutuando
	if is_finite(min_y) and absf(min_y) > 0.005:
		for child in root.get_children():
			if child is Node3D:
				(child as Node3D).position.y -= min_y

static func _collect_meshes(node: Node, out: Array[MeshInstance3D]) -> void:
	if node is MeshInstance3D:
		out.append(node as MeshInstance3D)
	for child in node.get_children():
		_collect_meshes(child, out)

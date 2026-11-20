class_name TrackBuilder
extends Node3D

signal pit_zone_entered(car: F1CarController)
signal pit_zone_exited(car: F1CarController)
signal pit_box_stopped(car: F1CarController)

var active_track: TrackData.TrackInfo
var terrain_body: StaticBody3D
var pit_lane_area: Area3D
var pit_box_area: Area3D
var gantry_lights: Array[StandardMaterial3D] = []

func build_circuit(track_id: String = "interlagos") -> TrackData.TrackInfo:
	for child in get_children():
		child.queue_free()
	gantry_lights.clear()

	active_track = TrackData.build_track(track_id)

	_build_terrain_first()
	_build_road_and_kerbs()
	_build_safety_barriers_and_gantry()
	_build_playable_pit_lane_and_boxes()
	_build_hd_grandstands()
	_build_ground_snapped_trees()

	return active_track

func _build_terrain_first() -> void:
	# Terreno esculpido construído primeiro para permitir Raycast Ground-Snap das árvores e arquibancadas
	terrain_body = StaticBody3D.new()
	terrain_body.set_meta("surface_type", TrackData.SurfaceType.GRASS)
	add_child(terrain_body)

	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var span: float = maxf(active_track.bounds_max.x - active_track.bounds_min.x, active_track.bounds_max.z - active_track.bounds_min.z) + 1200.0
	var center := (active_track.bounds_min + active_track.bounds_max) * 0.5
	var grid := 72
	var step := span / float(grid)

	for gz in range(grid):
		for gx in range(grid):
			var x0 := center.x - span * 0.5 + float(gx) * step
			var z0 := center.z - span * 0.5 + float(gz) * step
			var x1 := x0 + step
			var z1 := z0 + step
			var y00 := TrackData.sample_terrain_height(x0, z0, active_track)
			var y10 := TrackData.sample_terrain_height(x1, z0, active_track)
			var y01 := TrackData.sample_terrain_height(x0, z1, active_track)
			var y11 := TrackData.sample_terrain_height(x1, z1, active_track)
			st.add_vertex(Vector3(x0, y00, z0))
			st.add_vertex(Vector3(x1, y10, z0))
			st.add_vertex(Vector3(x1, y11, z1))
			st.add_vertex(Vector3(x0, y00, z0))
			st.add_vertex(Vector3(x1, y11, z1))
			st.add_vertex(Vector3(x0, y01, z1))

	st.generate_normals()
	var mesh := st.commit()
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color("#2e4f34")
	mat.roughness = 0.94
	mi.material_override = mat
	terrain_body.add_child(mi)

	var col := CollisionShape3D.new()
	col.shape = mesh.create_trimesh_shape()
	terrain_body.add_child(col)

func _build_road_and_kerbs() -> void:
	var samples := active_track.samples
	var n := samples.size()

	# Malha de asfalto com colisão própria (SurfaceType.ASPHALT)
	var road_body := StaticBody3D.new()
	road_body.set_meta("surface_type", TrackData.SurfaceType.ASPHALT)
	add_child(road_body)

	var st_road := SurfaceTool.new()
	st_road.begin(Mesh.PRIMITIVE_TRIANGLES)

	var st_kerb := SurfaceTool.new()
	st_kerb.begin(Mesh.PRIMITIVE_TRIANGLES)

	for i in range(n):
		var s0 := samples[i]
		var s1 := samples[(i + 1) % n]
		var l0 := s0.pos - s0.right * s0.width_left + Vector3(0, 0.03, 0)
		var r0 := s0.pos + s0.right * s0.width_right + Vector3(0, 0.03, 0)
		var l1 := s1.pos - s1.right * s1.width_left + Vector3(0, 0.03, 0)
		var r1 := s1.pos + s1.right * s1.width_right + Vector3(0, 0.03, 0)

		st_road.add_vertex(l0)
		st_road.add_vertex(r0)
		st_road.add_vertex(l1)
		st_road.add_vertex(r0)
		st_road.add_vertex(r1)
		st_road.add_vertex(l1)

		# Zebras físicas 3D com elevação real (+0.04m a +0.095m)
		if s0.kerb_left or s1.kerb_left:
			var ki0 := s0.pos - s0.right * (s0.width_left - 0.1) + Vector3(0, 0.04, 0)
			var ko0 := s0.pos - s0.right * (s0.width_left + 1.65) + Vector3(0, 0.095, 0)
			var ki1 := s1.pos - s1.right * (s1.width_left - 0.1) + Vector3(0, 0.04, 0)
			var ko1 := s1.pos - s1.right * (s1.width_left + 1.65) + Vector3(0, 0.095, 0)
			st_kerb.set_color(active_track.kerb_colors[i % active_track.kerb_colors.size()])
			st_kerb.add_vertex(ko0)
			st_kerb.add_vertex(ki0)
			st_kerb.add_vertex(ko1)
			st_kerb.add_vertex(ki0)
			st_kerb.add_vertex(ki1)
			st_kerb.add_vertex(ko1)

		if s0.kerb_right or s1.kerb_right:
			var rki0 := s0.pos + s0.right * (s0.width_right - 0.1) + Vector3(0, 0.04, 0)
			var rko0 := s0.pos + s0.right * (s0.width_right + 1.65) + Vector3(0, 0.095, 0)
			var rki1 := s1.pos + s1.right * (s1.width_right - 0.1) + Vector3(0, 0.04, 0)
			var rko1 := s1.pos + s1.right * (s1.width_right + 1.65) + Vector3(0, 0.095, 0)
			st_kerb.set_color(active_track.kerb_colors[i % active_track.kerb_colors.size()])
			st_kerb.add_vertex(rki0)
			st_kerb.add_vertex(rko0)
			st_kerb.add_vertex(rki1)
			st_kerb.add_vertex(rko0)
			st_kerb.add_vertex(rko1)
			st_kerb.add_vertex(rki1)

	st_road.generate_normals()
	var road_mesh := st_road.commit()
	var road_mi := MeshInstance3D.new()
	road_mi.mesh = road_mesh
	var road_mat := StandardMaterial3D.new()
	road_mat.albedo_color = Color("#242830")
	road_mat.roughness = 0.82
	road_mi.material_override = road_mat
	road_body.add_child(road_mi)
	var road_col := CollisionShape3D.new()
	road_col.shape = road_mesh.create_trimesh_shape()
	road_body.add_child(road_col)

	st_kerb.generate_normals()
	var kerb_mesh := st_kerb.commit()
	var kerb_body := StaticBody3D.new()
	kerb_body.set_meta("surface_type", TrackData.SurfaceType.KERB)
	add_child(kerb_body)
	var kerb_mi := MeshInstance3D.new()
	kerb_mi.mesh = kerb_mesh
	var kerb_mat := StandardMaterial3D.new()
	kerb_mat.vertex_color_use_as_albedo = true
	kerb_mat.roughness = 0.65
	kerb_mi.material_override = kerb_mat
	kerb_body.add_child(kerb_mi)
	var kerb_col := CollisionShape3D.new()
	kerb_col.shape = kerb_mesh.create_trimesh_shape()
	kerb_body.add_child(kerb_col)

func _build_safety_barriers_and_gantry() -> void:
	var samples := active_track.samples
	var n := samples.size()

	# Área de escape (Runoff) + Muros de proteção físicos em ambos os lados da pista
	var runoff_body := StaticBody3D.new()
	runoff_body.set_meta("surface_type", TrackData.SurfaceType.RUNOFF)
	add_child(runoff_body)

	var barrier_body := StaticBody3D.new()
	add_child(barrier_body)

	var st_runoff := SurfaceTool.new()
	st_runoff.begin(Mesh.PRIMITIVE_TRIANGLES)

	var st_wall := SurfaceTool.new()
	st_wall.begin(Mesh.PRIMITIVE_TRIANGLES)

	for i in range(n):
		var s0 := samples[i]
		var s1 := samples[(i + 1) % n]

		# Escape lateral até +6.4m
		var rl0 := s0.pos - s0.right * (s0.width_left + 6.4) + Vector3(0, 0.01, 0)
		var rr0 := s0.pos + s0.right * (s0.width_right + 6.4) + Vector3(0, 0.01, 0)
		var rl1 := s1.pos - s1.right * (s1.width_left + 6.4) + Vector3(0, 0.01, 0)
		var rr1 := s1.pos + s1.right * (s1.width_right + 6.4) + Vector3(0, 0.01, 0)
		var al0 := s0.pos - s0.right * s0.width_left + Vector3(0, 0.01, 0)
		var ar0 := s0.pos + s0.right * s0.width_right + Vector3(0, 0.01, 0)
		var al1 := s1.pos - s1.right * s1.width_left + Vector3(0, 0.01, 0)
		var ar1 := s1.pos + s1.right * s1.width_right + Vector3(0, 0.01, 0)

		st_runoff.add_vertex(rl0)
		st_runoff.add_vertex(al0)
		st_runoff.add_vertex(rl1)
		st_runoff.add_vertex(al0)
		st_runoff.add_vertex(al1)
		st_runoff.add_vertex(rl1)

		st_runoff.add_vertex(ar0)
		st_runoff.add_vertex(rr0)
		st_runoff.add_vertex(ar1)
		st_runoff.add_vertex(rr0)
		st_runoff.add_vertex(rr1)
		st_runoff.add_vertex(ar1)

		# Muro direito contínuo (+6.4m)
		var wb_r0 := rr0 + Vector3(0, -0.4, 0)
		var wt_r0 := rr0 + Vector3(0, 1.35, 0)
		var wb_r1 := rr1 + Vector3(0, -0.4, 0)
		var wt_r1 := rr1 + Vector3(0, 1.35, 0)
		st_wall.add_vertex(wb_r0)
		st_wall.add_vertex(wt_r0)
		st_wall.add_vertex(wb_r1)
		st_wall.add_vertex(wt_r0)
		st_wall.add_vertex(wt_r1)
		st_wall.add_vertex(wb_r1)

		# Muro esquerdo aberto apenas na janela de entrada/saída do Pit Lane
		var in_pit_opening := s0.t_norm >= 0.89 or s0.t_norm <= 0.09
		if not in_pit_opening:
			var wb_l0 := rl0 + Vector3(0, -0.4, 0)
			var wt_l0 := rl0 + Vector3(0, 1.35, 0)
			var wb_l1 := rl1 + Vector3(0, -0.4, 0)
			var wt_l1 := rl1 + Vector3(0, 1.35, 0)
			st_wall.add_vertex(wt_l0)
			st_wall.add_vertex(wb_l0)
			st_wall.add_vertex(wt_l1)
			st_wall.add_vertex(wb_l0)
			st_wall.add_vertex(wb_l1)
			st_wall.add_vertex(wt_l1)

	st_runoff.generate_normals()
	var runoff_mesh := st_runoff.commit()
	var runoff_mi := MeshInstance3D.new()
	runoff_mi.mesh = runoff_mesh
	var runoff_mat := StandardMaterial3D.new()
	runoff_mat.albedo_color = Color("#343c47")
	runoff_mat.roughness = 0.88
	runoff_mi.material_override = runoff_mat
	runoff_body.add_child(runoff_mi)
	var runoff_col := CollisionShape3D.new()
	runoff_col.shape = runoff_mesh.create_trimesh_shape()
	runoff_body.add_child(runoff_col)

	st_wall.generate_normals()
	var wall_mesh := st_wall.commit()
	var wall_mi := MeshInstance3D.new()
	wall_mi.mesh = wall_mesh
	var wall_mat := StandardMaterial3D.new()
	wall_mat.albedo_color = Color("#cbd5e1")
	wall_mat.roughness = 0.72
	wall_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	wall_mi.material_override = wall_mat
	barrier_body.add_child(wall_mi)
	var wall_col := CollisionShape3D.new()
	wall_col.shape = wall_mesh.create_trimesh_shape()
	barrier_body.add_child(wall_col)

	# Pórtico FIA de Largada com 5 luzes vermelhas
	var start_sp := samples[0]
	var gantry := Node3D.new()
	gantry.position = start_sp.pos
	gantry.rotation.y = atan2(start_sp.tangent.x, start_sp.tangent.z)
	add_child(gantry)

	var steel_mat := StandardMaterial3D.new()
	steel_mat.albedo_color = Color("#1e293b")
	steel_mat.metallic = 0.65
	steel_mat.roughness = 0.35

	var span_w := start_sp.width_left + start_sp.width_right + 3.0
	for side: float in [-1.0, 1.0]:
		var pillar := MeshInstance3D.new()
		var pb := BoxMesh.new()
		pb.size = Vector3(0.55, 6.8, 0.55)
		pillar.mesh = pb
		pillar.position = Vector3(side * (span_w * 0.5), 3.4, 0.0)
		pillar.material_override = steel_mat
		gantry.add_child(pillar)

	var bridge := MeshInstance3D.new()
	var bb := BoxMesh.new()
	bb.size = Vector3(span_w + 0.6, 1.15, 0.85)
	bridge.mesh = bb
	bridge.position = Vector3(0.0, 6.4, 0.0)
	bridge.material_override = steel_mat
	gantry.add_child(bridge)

	for l_idx in range(5):
		var light_mat := StandardMaterial3D.new()
		light_mat.albedo_color = Color("#450a0a")
		light_mat.emission_enabled = true
		light_mat.emission = Color("#ef4444")
		light_mat.emission_energy_multiplier = 0.1
		gantry_lights.append(light_mat)

		var pod := MeshInstance3D.new()
		var sph := SphereMesh.new()
		sph.radius = 0.22
		sph.height = 0.44
		pod.mesh = sph
		pod.position = Vector3((float(l_idx) - 2.0) * 1.1, 5.95, -0.45)
		pod.material_override = light_mat
		gantry.add_child(pod)

func _build_playable_pit_lane_and_boxes() -> void:
	# Faixa de asfalto dirigível do Pit Lane + Zona de Limitador 80 km/h + Box do Jogador
	var pts := active_track.pit_points
	if pts.size() < 4:
		return

	var pit_body := StaticBody3D.new()
	pit_body.set_meta("surface_type", TrackData.SurfaceType.PIT_LANE)
	add_child(pit_body)

	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in range(pts.size() - 1):
		var fwd := (pts[i + 1] - pts[i]).normalized()
		var right := Vector3(-fwd.z, 0.0, fwd.x).normalized() * 3.8
		st.add_vertex(pts[i] - right)
		st.add_vertex(pts[i] + right)
		st.add_vertex(pts[i + 1] - right)
		st.add_vertex(pts[i] + right)
		st.add_vertex(pts[i + 1] + right)
		st.add_vertex(pts[i + 1] - right)
	st.generate_normals()
	var pit_mesh := st.commit()
	var pit_mi := MeshInstance3D.new()
	pit_mi.mesh = pit_mesh
	var pit_mat := StandardMaterial3D.new()
	pit_mat.albedo_color = Color("#1e242c")
	pit_mat.roughness = 0.78
	pit_mi.material_override = pit_mat
	pit_body.add_child(pit_mi)
	var pit_col := CollisionShape3D.new()
	pit_col.shape = pit_mesh.create_trimesh_shape()
	pit_body.add_child(pit_col)

	# Área de detecção do limitador de velocidade dos boxes (80 km/h)
	var mid_pit := pts[pts.size() / 2]
	var pit_dir := (pts[pts.size() - 1] - pts[0]).normalized()
	pit_lane_area = Area3D.new()
	pit_lane_area.transform = Transform3D(Basis.looking_at(pit_dir, Vector3.UP), mid_pit + Vector3(0, 1.5, 0))
	var lane_shape := CollisionShape3D.new()
	var lane_box := BoxShape3D.new()
	lane_box.size = Vector3(8.0, 4.0, 175.0)
	lane_shape.shape = lane_box
	pit_lane_area.add_child(lane_shape)
	pit_lane_area.body_entered.connect(func(b: Node3D) -> void:
		if b is F1CarController:
			pit_zone_entered.emit(b as F1CarController)
	)
	pit_lane_area.body_exited.connect(func(b: Node3D) -> void:
		if b is F1CarController:
			pit_zone_exited.emit(b as F1CarController)
	)
	add_child(pit_lane_area)

	# Box iluminado do Jogador + Prédio dos Boxes (GLB de IA ou procedural detalhado)
	if active_track.pit_box_positions.size() > 3:
		var box_xf: Transform3D = active_track.pit_box_positions[3]
		pit_box_area = Area3D.new()
		pit_box_area.transform = box_xf
		var b_shape := CollisionShape3D.new()
		var b_box := BoxShape3D.new()
		b_box.size = Vector3(3.6, 3.0, 7.2)
		b_shape.shape = b_box
		pit_box_area.add_child(b_shape)
		pit_box_area.body_entered.connect(func(b: Node3D) -> void:
			if b is F1CarController and (b as F1CarController).is_player:
				pit_box_stopped.emit(b as F1CarController)
		)
		add_child(pit_box_area)

		# Marca verde luminosa de parada do box
		var marker := MeshInstance3D.new()
		var q := QuadMesh.new()
		q.size = Vector2(2.8, 5.6)
		marker.mesh = q
		marker.rotation.x = -PI * 0.5
		marker.position = Vector3(0, 0.04, 0)
		var m_mat := StandardMaterial3D.new()
		m_mat.albedo_color = Color("#10b981")
		m_mat.emission_enabled = true
		m_mat.emission = Color("#10b981")
		m_mat.emission_energy_multiplier = 1.6
		marker.material_override = m_mat
		pit_box_area.add_child(marker)

	# Carrega prédio dos boxes .glb ou gera complexo modular aterrado
	var pit_glb := GlbPropLoader.try_load_glb_scene("pit_building", 520.0)
	var pit_anchor := active_track.pit_box_positions[3] if active_track.pit_box_positions.size() > 3 else Transform3D.IDENTITY
	if pit_glb != null:
		pit_glb.global_transform = pit_anchor.translated_local(Vector3(-12.5, -0.5, 0))
		add_child(pit_glb)
	else:
		_build_procedural_pit_building(pit_anchor)

func _build_procedural_pit_building(anchor: Transform3D) -> void:
	var building := Node3D.new()
	building.transform = anchor.translated_local(Vector3(-11.5, -1.2, 0))
	add_child(building)

	var concrete := StandardMaterial3D.new()
	concrete.albedo_color = Color("#94a3b8")
	concrete.roughness = 0.82
	var accent := StandardMaterial3D.new()
	accent.albedo_color = active_track.barrier_color

	var block := MeshInstance3D.new()
	var b := BoxMesh.new()
	b.size = Vector3(13.0, 9.5, 165.0)
	block.mesh = b
	block.position = Vector3(0, 4.75, 0)
	block.material_override = concrete
	building.add_child(block)

	var fascia := MeshInstance3D.new()
	var fb := BoxMesh.new()
	fb.size = Vector3(0.4, 1.2, 165.0)
	fascia.mesh = fb
	fascia.position = Vector3(6.6, 8.2, 0)
	fascia.material_override = accent
	building.add_child(fascia)

func _build_hd_grandstands() -> void:
	# Arquibancadas HD em múltiplos degraus proporcionais (0.48m) + fundação profunda aterrada
	var placements: Array[Dictionary] = [
		{"t": 0.94, "side": 1.0, "off": 29.0, "len": 105.0},
		{"t": 0.04, "side": 1.0, "off": 29.0, "len": 88.0},
		{"t": 0.12, "side": -1.0, "off": 31.0, "len": 84.0},
	]
	var glb_template := GlbPropLoader.try_load_glb_scene("grandstand", 460.0)
	var concrete := StandardMaterial3D.new()
	concrete.albedo_color = Color("#475569")
	concrete.roughness = 0.85
	var roof_mat := StandardMaterial3D.new()
	roof_mat.albedo_color = Color("#e2e8f0")
	roof_mat.roughness = 0.45

	for spec: Dictionary in placements:
		var sp := TrackData.sample_at_norm(active_track, float(spec["t"]))
		var pos := sp.pos + sp.right * (float(spec["side"]) * float(spec["off"]))
		pos.y = TrackData.sample_terrain_height(pos.x, pos.z, active_track)
		var yaw := atan2(sp.tangent.x, sp.tangent.z) + (PI if float(spec["side"]) < 0.0 else 0.0)

		if glb_template != null:
			var stand := glb_template.duplicate() as Node3D
			stand.position = pos
			stand.rotation.y = yaw
			add_child(stand)
			continue

		var sg := Node3D.new()
		sg.position = pos
		sg.rotation.y = yaw
		add_child(sg)

		# Fundação de concreto estendida -2.5m abaixo do solo para nunca flutuar em declives
		var plinth := MeshInstance3D.new()
		var p_box := BoxMesh.new()
		p_box.size = Vector3(14.0, 3.2, float(spec["len"]))
		plinth.mesh = p_box
		plinth.position = Vector3(-1.5, -0.8, 0.0)
		plinth.material_override = concrete
		sg.add_child(plinth)

		for tier in range(8):
			var step := MeshInstance3D.new()
			var sb := BoxMesh.new()
			sb.size = Vector3(1.4, 0.55, float(spec["len"]))
			step.mesh = sb
			step.position = Vector3(4.2 - float(tier) * 1.35, 1.1 + float(tier) * 0.52, 0.0)
			step.material_override = concrete
			sg.add_child(step)

		var roof := MeshInstance3D.new()
		var rb := BoxMesh.new()
		rb.size = Vector3(15.5, 0.42, float(spec["len"]) + 2.0)
		roof.mesh = rb
		roof.position = Vector3(-1.0, 11.2, 0.0)
		roof.rotation.z = -0.06
		roof.material_override = roof_mat
		sg.add_child(roof)

	if glb_template != null:
		glb_template.queue_free()

func _build_ground_snapped_trees() -> void:
	# MultiMesh GPU de árvores com Raycast Ground-Snap para ZERO árvores voando
	var tree_count := 280
	var glb_mesh := GlbPropLoader.extract_first_mesh_for_multimesh("tree_atlantic")

	var canopy_mesh: Mesh
	if glb_mesh != null:
		canopy_mesh = glb_mesh
	else:
		var sph := SphereMesh.new()
		sph.radius = 2.6
		sph.height = 5.4
		sph.radial_segments = 10
		sph.rings = 6
		canopy_mesh = sph

	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color("#2f6f3e")
	mat.roughness = 0.88

	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.mesh = canopy_mesh
	mm.instance_count = tree_count

	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.material_override = mat
	mmi.visibility_range_end = 480.0
	add_child(mmi)

	var placed := 0
	var samples := active_track.samples
	var n := samples.size()

	for i in range(tree_count * 3):
		if placed >= tree_count:
			break
		var sp := samples[(i * 11) % n]
		var side: float = 1.0 if (i % 2 == 0) else -1.0
		var dist_out: float = 30.0 + float((i * 37) % 125)
		var tx := sp.pos.x + sp.right.x * side * dist_out
		var tz := sp.pos.z + sp.right.z * side * dist_out

		var too_close := false
		for k in range(0, n, 6):
			var p := samples[k].pos
			if Vector2(tx - p.x, tz - p.z).length_squared() < 26.0 * 26.0:
				too_close = true
				break
		if too_close:
			continue

		# Amostra a altura REAL do terreno neste (tx, tz) + embute a base -0.45m (zero árvores voando!)
		var ground_y := TrackData.sample_terrain_height(tx, tz, active_track)
		var sc: float = 0.85 + float((i * 17) % 35) / 100.0
		var xf := Transform3D(Basis(Vector3.UP, float(i) * 1.37).scaled(Vector3(sc, sc * 1.15, sc)), Vector3(tx, ground_y + (2.1 * sc if glb_mesh == null else -0.45), tz))
		mm.set_instance_transform(placed, xf)
		var shade := 0.72 + float((i * 13) % 28) / 100.0
		mm.set_instance_color(placed, Color(0.75 * shade, shade, 0.72 * shade))
		placed += 1

	mm.visible_instance_count = placed

class_name ProceduralCarMesh
extends Node3D

var primary_color: Color = Color("#059669")
var accent_color: Color = Color("#facc15")
var helmet_color: Color = Color("#facc15")
var car_number: int = 27

var body_pivot: Node3D
var wheel_nodes: Array[Node3D] = []
var front_steering_pivots: Array[Node3D] = []
var drs_flap: MeshInstance3D
var steering_wheel_pivot: Node3D
var brake_disc_mats: Array[StandardMaterial3D] = []
var tire_sidewall_mat: StandardMaterial3D
var tire_tread_mat: StandardMaterial3D
var shift_leds: Array[MeshInstance3D] = []
var oled_label_speed: Label
var oled_label_gear: Label
var oled_label_rpm: Label
var oled_label_ers: Label
var oled_label_drs: Label
var oled_viewport: SubViewport

var _paint_mat: StandardMaterial3D
var _accent_mat: StandardMaterial3D
var _carbon_mat: StandardMaterial3D
var _oled_last_key: String = ""

func build_car(p_primary: Color, p_accent: Color, p_helmet: Color, p_num: int, is_player: bool) -> void:
	primary_color = p_primary
	accent_color = p_accent
	helmet_color = p_helmet
	car_number = p_num

	for child in get_children():
		child.queue_free()
	wheel_nodes.clear()
	front_steering_pivots.clear()
	brake_disc_mats.clear()
	shift_leds.clear()

	body_pivot = Node3D.new()
	add_child(body_pivot)

	_paint_mat = StandardMaterial3D.new()
	_paint_mat.albedo_color = primary_color
	_paint_mat.metallic = 0.58
	_paint_mat.roughness = 0.2
	_paint_mat.clearcoat_enabled = true
	_paint_mat.clearcoat = 1.0
	_paint_mat.clearcoat_roughness = 0.06

	_accent_mat = StandardMaterial3D.new()
	_accent_mat.albedo_color = accent_color
	_accent_mat.metallic = 0.35
	_accent_mat.roughness = 0.25

	_carbon_mat = StandardMaterial3D.new()
	_carbon_mat.albedo_color = Color("#181b20")
	_carbon_mat.metallic = 0.28
	_carbon_mat.roughness = 0.62

	# Suporte a chassi .glb gerado por IA (se existir em res://assets/glb/f1_chassis.glb)
	var custom_glb := GlbPropLoader.try_load_glb_scene("f1_chassis", 320.0)
	if custom_glb != null:
		body_pivot.add_child(custom_glb)
	else:
		_build_procedural_chassis(p_helmet)

	if is_player:
		_build_interactive_steering_wheel()

	_build_smooth_f1_wheels()

func _build_procedural_chassis(p_helmet: Color) -> void:
	# Assoalho Venturi e difusor
	var floor_mesh := _add_box(body_pivot, Vector3(1.88, 0.05, 4.35), Vector3(0, 0.11, -0.15), _carbon_mat)
	floor_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON

	# Monocoque & Nariz afilado
	_add_box(body_pivot, Vector3(0.68, 0.38, 2.2), Vector3(0, 0.34, 0.6), _paint_mat)
	_add_box(body_pivot, Vector3(0.32, 0.22, 1.55), Vector3(0, 0.28, 1.85), _paint_mat)

	# Sidepods laterais com listra de equipe
	for side in [-1.0, 1.0]:
		_add_box(body_pivot, Vector3(0.56, 0.34, 1.85), Vector3(side * 0.56, 0.32, -0.35), _paint_mat)
		_add_box(body_pivot, Vector3(0.12, 0.04, 1.6), Vector3(side * 0.64, 0.50, -0.35), _accent_mat)

	# Cobertura do motor & barbatana dorsal
	_add_box(body_pivot, Vector3(0.42, 0.44, 1.55), Vector3(0, 0.56, -0.85), _paint_mat)
	_add_box(body_pivot, Vector3(0.04, 0.34, 1.25), Vector3(0, 0.78, -0.95), _accent_mat)

	# Asa dianteira 3 elementos
	_add_box(body_pivot, Vector3(1.98, 0.04, 0.42), Vector3(0, 0.14, 2.42), _carbon_mat)
	_add_box(body_pivot, Vector3(1.92, 0.035, 0.24), Vector3(0, 0.19, 2.24), _paint_mat)
	for side in [-1.0, 1.0]:
		_add_box(body_pivot, Vector3(0.04, 0.28, 0.52), Vector3(side * 0.99, 0.23, 2.34), _paint_mat)

	# Asa traseira + flap móvel DRS
	_add_box(body_pivot, Vector3(1.04, 0.045, 0.28), Vector3(0, 0.76, -2.14), _carbon_mat)
	drs_flap = _add_box(body_pivot, Vector3(1.02, 0.035, 0.20), Vector3(0, 0.89, -2.20), _accent_mat)
	drs_flap.rotation.x = 0.40
	for side in [-1.0, 1.0]:
		_add_box(body_pivot, Vector3(0.04, 0.54, 0.42), Vector3(side * 0.52, 0.72, -2.15), _paint_mat)

	# Halo & Capacete do piloto
	var halo_mat := _carbon_mat
	for side in [-1.0, 1.0]:
		var rail := _add_box(body_pivot, Vector3(0.045, 0.045, 0.78), Vector3(side * 0.26, 0.70, 0.24), halo_mat)
		rail.rotation.y = side * -0.32
	_add_box(body_pivot, Vector3(0.045, 0.26, 0.05), Vector3(0, 0.62, 0.65), halo_mat)

	var helmet_mat := StandardMaterial3D.new()
	helmet_mat.albedo_color = p_helmet
	helmet_mat.clearcoat_enabled = true
	helmet_mat.roughness = 0.15
	var helmet := MeshInstance3D.new()
	var sph := SphereMesh.new()
	sph.radius = 0.155
	sph.height = 0.31
	helmet.mesh = sph
	helmet.material_override = helmet_mat
	helmet.position = Vector3(0, 0.57, 0.06)
	body_pivot.add_child(helmet)

func _build_interactive_steering_wheel() -> void:
	var mount := Node3D.new()
	mount.position = Vector3(0, 0.655, 0.50)
	mount.rotation.x = 0.32
	body_pivot.add_child(mount)

	steering_wheel_pivot = Node3D.new()
	mount.add_child(steering_wheel_pivot)

	# Corpo do volante em carbono
	_add_box(steering_wheel_pivot, Vector3(0.28, 0.145, 0.022), Vector3.ZERO, _carbon_mat)
	# Empunhaduras laterais ergonômicas
	var grip_mat := StandardMaterial3D.new()
	grip_mat.albedo_color = Color("#11141a")
	grip_mat.roughness = 0.94
	for side in [-1.0, 1.0]:
		_add_box(steering_wheel_pivot, Vector3(0.036, 0.12, 0.032), Vector3(side * 0.138, -0.005, 0.0), grip_mat)
		_add_box(steering_wheel_pivot, Vector3(0.05, 0.03, 0.008), Vector3(side * 0.09, 0.01, -0.022), _carbon_mat)

	# SubViewport 2D -> Tela OLED real no volante
	oled_viewport = SubViewport.new()
	oled_viewport.size = Vector2i(256, 128)
	oled_viewport.render_target_update_mode = SubViewport.UPDATE_WHEN_VISIBLE
	add_child(oled_viewport)

	var bg := ColorRect.new()
	bg.color = Color("#070a10")
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	oled_viewport.add_child(bg)

	oled_label_speed = _make_oled_label(Vector2(14, 24), 30, Color.WHITE)
	oled_label_gear = _make_oled_label(Vector2(114, 20), 46, Color("#facc15"))
	oled_label_rpm = _make_oled_label(Vector2(174, 30), 20, Color("#e2e8f0"))
	oled_label_ers = _make_oled_label(Vector2(14, 92), 16, Color("#38bdf8"))
	oled_label_drs = _make_oled_label(Vector2(182, 92), 18, Color("#10b981"))
	for lbl: Label in [oled_label_speed, oled_label_gear, oled_label_rpm, oled_label_ers, oled_label_drs]:
		oled_viewport.add_child(lbl)

	var screen_mat := StandardMaterial3D.new()
	screen_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	screen_mat.albedo_texture = oled_viewport.get_texture()
	var screen_mesh := MeshInstance3D.new()
	var quad := QuadMesh.new()
	quad.size = Vector2(0.118, 0.062)
	screen_mesh.mesh = quad
	screen_mesh.material_override = screen_mat
	screen_mesh.position = Vector3(0, 0.005, 0.014)
	steering_wheel_pivot.add_child(screen_mesh)

	# 15 LEDs sequenciais de troca de marcha (esquerda -> direita no ponto de vista do piloto)
	for i in range(15):
		var led := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = Vector3(0.007, 0.008, 0.008)
		led.mesh = box
		var lm := StandardMaterial3D.new()
		lm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		lm.albedo_color = Color("#22c55e") if i < 5 else (Color("#ef4444") if i < 10 else Color("#38bdf8"))
		led.material_override = lm
		led.position = Vector3(-(float(i - 7)) * 0.0086, 0.052, 0.015)
		steering_wheel_pivot.add_child(led)
		shift_leds.append(led)

func _build_smooth_f1_wheels() -> void:
	# Textura Pirelli única aplicada em pneu de 64 segmentos sem facetas poligonais
	tire_tread_mat = StandardMaterial3D.new()
	tire_tread_mat.albedo_color = Color("#15181f")
	tire_tread_mat.roughness = 0.84
	tire_tread_mat.metallic = 0.04

	tire_sidewall_mat = StandardMaterial3D.new()
	tire_sidewall_mat.albedo_texture = _generate_pirelli_sidewall_texture(false)
	tire_sidewall_mat.roughness = 0.72
	tire_sidewall_mat.metallic = 0.06

	var cover_mat := StandardMaterial3D.new()
	cover_mat.albedo_color = Color("#161a22")
	cover_mat.metallic = 0.74
	cover_mat.roughness = 0.28

	var specs: Array[Dictionary] = [
		{"pos": Vector3(0.84, 0.36, 1.58), "front": true, "side": 1.0, "w": 0.33},
		{"pos": Vector3(-0.84, 0.36, 1.58), "front": true, "side": -1.0, "w": 0.33},
		{"pos": Vector3(0.84, 0.36, -1.52), "front": false, "side": 1.0, "w": 0.41},
		{"pos": Vector3(-0.84, 0.36, -1.52), "front": false, "side": -1.0, "w": 0.41},
	]

	for spec: Dictionary in specs:
		var pivot := Node3D.new()
		pivot.position = spec["pos"] as Vector3
		add_child(pivot)
		if bool(spec["front"]):
			front_steering_pivots.append(pivot)

		var spin_node := Node3D.new()
		pivot.add_child(spin_node)
		wheel_nodes.append(spin_node)

		# Malha suave 64-segmentos toroidal com ombro arredondado contínuo (sem bordas quadradas!)
		var tire_w: float = float(spec["w"])
		var tire_side: float = float(spec["side"])
		var tire_mesh := MeshInstance3D.new()
		tire_mesh.mesh = _build_toroidal_tire_mesh(tire_w, 0.36, 64)
		tire_mesh.material_override = tire_tread_mat
		tire_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		spin_node.add_child(tire_mesh)

		# Laterais integradas rentes à curva do ombro (anéis com 64 segmentos perfeitos)
		for s_dir: float in [-1.0, 1.0]:
			var sw := MeshInstance3D.new()
			var disc := CylinderMesh.new()
			disc.top_radius = 0.344
			disc.bottom_radius = 0.344
			disc.height = 0.004
			disc.radial_segments = 64
			sw.mesh = disc
			sw.rotation.z = PI * 0.5
			sw.position.x = s_dir * (tire_w * 0.495)
			sw.material_override = tire_sidewall_mat
			spin_node.add_child(sw)

		# Calota aero 18" embutida + porca central em titânio
		var cover := MeshInstance3D.new()
		var cyl := CylinderMesh.new()
		cyl.top_radius = 0.222
		cyl.bottom_radius = 0.222
		cyl.height = tire_w + 0.008
		cyl.radial_segments = 48
		cover.mesh = cyl
		cover.rotation.z = PI * 0.5
		cover.material_override = cover_mat
		spin_node.add_child(cover)

		# Disco de freio interno com brilho térmico
		var disc_mat := StandardMaterial3D.new()
		disc_mat.albedo_color = Color("#262930")
		disc_mat.metallic = 0.72
		disc_mat.roughness = 0.36
		disc_mat.emission_enabled = true
		disc_mat.emission = Color("#ff4500")
		disc_mat.emission_energy_multiplier = 0.0
		brake_disc_mats.append(disc_mat)

		var rotor := MeshInstance3D.new()
		var r_cyl := CylinderMesh.new()
		r_cyl.top_radius = 0.195
		r_cyl.bottom_radius = 0.195
		r_cyl.height = 0.035
		r_cyl.radial_segments = 32
		rotor.mesh = r_cyl
		rotor.rotation.z = PI * 0.5
		rotor.position.x = -tire_side * (tire_w * 0.42)
		rotor.material_override = disc_mat
		spin_node.add_child(rotor)

func _build_toroidal_tire_mesh(width: float, outer_r: float, segments: int) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var half_w := width * 0.5
	var profile: Array[Vector2] = [
		Vector2(0.224, -half_w + 0.008),
		Vector2(0.295, -half_w - 0.005),
		Vector2(0.340, -half_w + 0.005),
		Vector2(outer_r - 0.004, -half_w + 0.036),
		Vector2(outer_r, 0.0),
		Vector2(outer_r - 0.004, half_w - 0.036),
		Vector2(0.340, half_w - 0.005),
		Vector2(0.295, half_w + 0.005),
		Vector2(0.224, half_w - 0.008),
	]
	for s in range(segments):
		var a0 := (float(s) / float(segments)) * TAU
		var a1 := (float(s + 1) / float(segments)) * TAU
		for p in range(profile.size() - 1):
			var r0 := profile[p].x
			var x0 := profile[p].y
			var r1 := profile[p + 1].x
			var x1 := profile[p + 1].y
			var v00 := Vector3(x0, cos(a0) * r0, sin(a0) * r0)
			var v01 := Vector3(x0, cos(a1) * r0, sin(a1) * r0)
			var v10 := Vector3(x1, cos(a0) * r1, sin(a0) * r1)
			var v11 := Vector3(x1, cos(a1) * r1, sin(a1) * r1)
			st.add_vertex(v00)
			st.add_vertex(v10)
			st.add_vertex(v11)
			st.add_vertex(v00)
			st.add_vertex(v11)
			st.add_vertex(v01)
	st.generate_normals()
	return st.commit()

func update_telemetry_visuals(speed_kmh: int, gear: int, rpm: float, max_rpm: float, ers_pct: int, drs_active: bool, steer_rad: float, wheel_spin_delta: float, brake_temp: float, compound: int) -> void:
	for p in front_steering_pivots:
		p.rotation.y = steer_rad
	for w in wheel_nodes:
		w.rotation.x += wheel_spin_delta

	if drs_flap != null:
		drs_flap.rotation.x = lerpf(drs_flap.rotation.x, 0.04 if drs_active else 0.40, 0.25)

	var glow := pow(clampf((brake_temp - 0.22) / 0.78, 0.0, 1.0), 1.3) * 3.2
	for dm in brake_disc_mats:
		dm.emission_energy_multiplier = glow

	if steering_wheel_pivot != null:
		steering_wheel_pivot.rotation.z = lerpf(steering_wheel_pivot.rotation.z, -steer_rad * 3.1, 0.35)
		var rpm_ratio := clampf((rpm - 7200.0) / maxf(100.0, max_rpm - 7200.0), 0.0, 1.0)
		var lit := roundi(rpm_ratio * float(shift_leds.size()))
		for i in range(shift_leds.size()):
			shift_leds[i].visible = i < lit

		var key := "%d_%d_%d_%d_%s" % [speed_kmh, gear, int(rpm / 50.0), ers_pct, str(drs_active)]
		if key != _oled_last_key:
			_oled_last_key = key
			oled_label_speed.text = "%d KM/H" % speed_kmh
			oled_label_gear.text = "R" if gear == -1 else str(gear)
			oled_label_rpm.text = "%d" % roundi(rpm)
			oled_label_ers.text = "ERS %d%%" % ers_pct
			oled_label_drs.text = "DRS ON" if drs_active else "DRS"
			oled_label_drs.modulate = Color("#10b981") if drs_active else Color("#64748b")

	if tire_sidewall_mat != null:
		tire_sidewall_mat.albedo_color = Color.WHITE.lerp(PacejkaTireModel.compound_color(compound), 0.16)

func _generate_pirelli_sidewall_texture(is_wet: bool) -> ImageTexture:
	var size := 256
	var img := Image.create(size, size, false, Image.FORMAT_RGBA8)
	img.fill(Color("#13161c"))
	var center := Vector2(128, 128)
	var ring_col := Color("#38bdf8") if is_wet else Color("#ef4444")
	for y in range(size):
		for x in range(size):
			var d := Vector2(x, y).distance_to(center)
			var ang := atan2(float(y) - 128.0, float(x) - 128.0)
			if d >= 90.0 and d <= 97.0 and (absf(ang) < 1.1 or absf(ang) > 2.05):
				img.set_pixel(x, y, ring_col)
			elif int(d) % 8 == 0 and d > 82.0 and d < 122.0:
				img.set_pixel(x, y, Color("#1f242e"))
	return ImageTexture.create_from_image(img)

func _add_box(parent: Node3D, sz: Vector3, pos: Vector3, mat: Material) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var b := BoxMesh.new()
	b.size = sz
	mi.mesh = b
	mi.material_override = mat
	mi.position = pos
	parent.add_child(mi)
	return mi

func _make_oled_label(pos: Vector2, fsize: int, col: Color) -> Label:
	var lbl := Label.new()
	lbl.position = pos
	lbl.add_theme_font_size_override("font_size", fsize)
	lbl.modulate = col
	return lbl

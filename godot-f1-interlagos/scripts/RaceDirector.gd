extends Node3D

@onready var track_builder: TrackBuilder = $TrackBuilder
@onready var pit_manager: PitStopManager = $PitStopManager
@onready var main_camera: Camera3D = $Camera3D
@onready var sun_light: DirectionalLight3D = $DirectionalLight3D
@onready var world_env: WorldEnvironment = $WorldEnvironment

@onready var hud_speed: Label = $HudLayer/TelemetryPanel/SpeedLabel
@onready var hud_gear: Label = $HudLayer/TelemetryPanel/GearLabel
@onready var hud_tires: Label = $HudLayer/TelemetryPanel/TireLabel
@onready var hud_pit_banner: Label = $HudLayer/PitBanner

var cars: Array[F1CarController] = []
var player_car: F1CarController
var audio_synth: F1AudioSynth
var active_track: TrackData.TrackInfo
var active_track_id: String = "interlagos"
var camera_mode: int = 0 # 0 = Chase, 1 = Cockpit, 2 = T-Cam
var is_wet: bool = false
var is_muted: bool = false
var countdown_timer: float = 3.2
var countdown_lights: int = 0
var _signals_bound: bool = false

const TRACK_ORDER := ["interlagos", "monza", "spa"]

func _ready() -> void:
	_prewarm_shaders_once()
	audio_synth = F1AudioSynth.new()
	add_child(audio_synth)
	_load_circuit(active_track_id)

func _prewarm_shaders_once() -> void:
	# Compila materiais PBR básicos no primeiro frame para evitar engasgos na largada
	var warm := MeshInstance3D.new()
	var box := BoxMesh.new()
	warm.mesh = box
	var mat := StandardMaterial3D.new()
	mat.roughness = 0.25
	mat.clearcoat_enabled = true
	warm.material_override = mat
	warm.position = Vector3(0, -500, 0)
	add_child(warm)
	await get_tree().process_frame
	warm.queue_free()

func _load_circuit(track_id: String) -> void:
	active_track_id = track_id
	active_track = track_builder.build_circuit(track_id)
	if not _signals_bound:
		track_builder.pit_zone_entered.connect(_on_pit_entered)
		track_builder.pit_zone_exited.connect(_on_pit_exited)
		track_builder.pit_box_stopped.connect(_on_pit_box_stopped)
		pit_manager.pitstop_started.connect(_on_pitstop_started)
		pit_manager.pitstop_completed.connect(_on_pitstop_completed)
		_signals_bound = true
	_apply_weather_atmosphere()
	_spawn_grid()

func _apply_weather_atmosphere() -> void:
	if sun_light != null:
		sun_light.light_energy = 1.25 if is_wet else 2.25
		sun_light.light_color = Color("#dce7f5") if is_wet else Color("#fff0d4")
	if world_env != null and world_env.environment != null:
		var env := world_env.environment
		env.fog_enabled = true
		env.fog_density = 0.00048 if is_wet else 0.00018
		env.fog_light_color = Color("#64748b") if is_wet else Color("#a6cee8")

func _spawn_grid() -> void:
	for c in cars:
		c.queue_free()
	cars.clear()
	countdown_timer = 3.2
	countdown_lights = 0

	var teams: Array[Dictionary] = [
		{"code": "VER", "p": Color("#1e3a8a"), "a": Color("#facc15"), "h": Color("#f8fafc"), "n": 1},
		{"code": "LEC", "p": Color("#dc2626"), "a": Color("#f8fafc"), "h": Color("#ef4444"), "n": 16},
		{"code": "NOR", "p": Color("#f97316"), "a": Color("#0f172a"), "h": Color("#a3e635"), "n": 4},
		{"code": "HAM", "p": Color("#b91c1c"), "a": Color("#fef08a"), "h": Color("#facc15"), "n": 44},
		{"code": "RUS", "p": Color("#0f172a"), "a": Color("#2dd4bf"), "h": Color("#38bdf8"), "n": 63},
		{"code": "BRA", "p": Color("#059669"), "a": Color("#facc15"), "h": Color("#facc15"), "n": 27},
	]

	for slot in range(teams.size()):
		var t: Dictionary = teams[slot]
		var sp: TrackData.TrackSample = TrackData.sample_at_norm(active_track, 1.0 - (0.008 + float(slot) * 0.0028))
		var lat := -2.6 if slot % 2 == 0 else 2.6
		var car := F1CarController.new()
		car.car_id = "car_%d" % slot
		car.short_code = String(t["code"])
		car.is_player = (slot == teams.size() - 1)
		car.primary_color = t["p"] as Color
		car.accent_color = t["a"] as Color
		car.helmet_color = t["h"] as Color
		car.car_number = int(t["n"])
		car.is_wet_weather = is_wet
		car.last_track_idx = sp.index
		car.launch_allowed = false

		var spawn_pos := sp.pos + sp.right * lat + Vector3(0, 0.35, 0)
		var yaw := atan2(sp.tangent.x, sp.tangent.z)
		car.position = spawn_pos
		car.rotation.y = yaw
		add_child(car)
		cars.append(car)
		if car.is_player:
			player_car = car

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey:
		var ke := event as InputEventKey
		if ke.pressed and not ke.echo:
			if ke.keycode == KEY_F2:
				var next_idx := (TRACK_ORDER.find(active_track_id) + 1) % TRACK_ORDER.size()
				_load_circuit(String(TRACK_ORDER[next_idx]))
			elif ke.keycode == KEY_F3:
				is_wet = not is_wet
				_apply_weather_atmosphere()
				for c in cars:
					c.is_wet_weather = is_wet
					c.compound = PacejkaTireModel.Compound.WET if is_wet else PacejkaTireModel.Compound.SOFT
			elif ke.keycode == KEY_R:
				_spawn_grid()
			elif ke.keycode == KEY_M:
				is_muted = not is_muted

func _process(delta: float) -> void:
	if player_car == null:
		return

	if countdown_timer > 0.0:
		countdown_timer = maxf(0.0, countdown_timer - delta)
		var elapsed := 3.2 - countdown_timer
		countdown_lights = clampi(int(elapsed / 0.55) + 1, 1, 5)
		if countdown_timer <= 0.0:
			countdown_lights = 0
			for c in cars:
				c.launch_allowed = true
	else:
		countdown_lights = 0

	for i in range(track_builder.gantry_lights.size()):
		var mat := track_builder.gantry_lights[i]
		var lit := countdown_lights > 0 and i < countdown_lights
		mat.emission_energy_multiplier = 3.2 if lit else 0.08
		mat.albedo_color = Color("#ef4444") if lit else Color("#450a0a")

	if Input.is_action_just_pressed("camera_cycle"):
		camera_mode = (camera_mode + 1) % 3

	var thr := Input.get_action_strength("throttle")
	var brk := Input.get_action_strength("brake")
	var st := Input.get_action_strength("steer_left") - Input.get_action_strength("steer_right")
	var ers := Input.is_action_pressed("ers_boost")
	var drs := Input.is_action_just_pressed("drs_toggle")
	var lim := Input.is_action_just_pressed("pit_limiter")
	player_car.set_player_inputs(thr, brk, st, ers, drs, lim)

	# IA competitiva orientada pelo traçado com leitura de curvas à frente
	for slot in range(cars.size()):
		var c := cars[slot]
		if c.is_player:
			continue
		_drive_ai_car(c, slot)

	if audio_synth != null:
		audio_synth.update_params(player_car.rpm, thr, player_car.speed_ms, player_car.is_on_kerb, is_muted)

	_update_camera(delta)
	_update_hud()

func _drive_ai_car(car: F1CarController, slot_idx: int) -> void:
	var n := active_track.samples.size()
	var best_idx := car.last_track_idx
	var best_d := INF
	for off in range(-25, 36):
		var idx := (car.last_track_idx + off + n) % n
		var d := car.global_position.distance_squared_to(active_track.samples[idx].pos)
		if d < best_d:
			best_d = d
			best_idx = idx
	car.last_track_idx = best_idx

	var look_idx := (best_idx + 14) % n
	var target_sp := active_track.samples[look_idx]
	var lane_off := ((float(slot_idx % 3) - 1.0) * 2.2)
	var target_pt := target_sp.pos + target_sp.right * lane_off

	var to_target := (target_pt - car.global_position)
	to_target.y = 0.0
	var right := car.global_transform.basis.x
	right.y = 0.0
	var lat_err := 0.0
	if to_target.length_squared() > 0.001 and right.length_squared() > 0.001:
		lat_err = to_target.normalized().dot(right.normalized())
	# Em Godot com frente em +Z, basis.x aponta para a esquerda (+steer_in)
	var steer_cmd := clampf(lat_err * 2.8, -1.0, 1.0)

	# Avalia curvatura nos próximos ~90m para frear com realismo antes da zebra
	var max_curv := 0.0
	for ahead: int in [8, 16, 26]:
		max_curv = maxf(max_curv, absf(active_track.samples[(best_idx + ahead) % n].curvature))
	var safe_speed := sqrt((17.0 if is_wet else 21.0) / maxf(0.0008, max_curv))
	var pace_scale := 0.88 + float(slot_idx % 4) * 0.03
	var thr_cmd := 1.0 if car.speed_ms < safe_speed * pace_scale else 0.15
	var brk_cmd := clampf((car.speed_ms - safe_speed * pace_scale) / 14.0, 0.0, 0.9)
	car.set_player_inputs(thr_cmd, brk_cmd, steer_cmd, false, target_sp.drs_zone != 0, false)

func _update_camera(delta: float) -> void:
	var xf := player_car.global_transform
	var target_xf: Transform3D
	if camera_mode == 1: # Cockpit
		var eye := xf.origin + xf.basis.y * 0.88 + xf.basis.z * 0.08
		target_xf = Transform3D(Basis.looking_at(xf.basis.z - xf.basis.y * 0.08, Vector3.UP), eye)
		main_camera.fov = 68.0
	elif camera_mode == 2: # T-Cam
		var eye := xf.origin + xf.basis.y * 1.24 - xf.basis.z * 0.15
		target_xf = Transform3D(Basis.looking_at(xf.basis.z - xf.basis.y * 0.12, Vector3.UP), eye)
		main_camera.fov = 64.0
	else: # Chase dinâmica
		var eye := xf.origin + xf.basis.y * 2.15 - xf.basis.z * 5.6
		var look_at_pt := xf.origin + xf.basis.z * 4.5 + Vector3(0, 0.8, 0)
		target_xf = Transform3D(Basis.looking_at((look_at_pt - eye).normalized(), Vector3.UP), eye)
		main_camera.fov = 62.0 + clampf(player_car.speed_ms / 90.0, 0.0, 1.0) * 10.0

	main_camera.global_transform = main_camera.global_transform.interpolate_with(target_xf, 1.0 - exp(-18.0 * delta))

func _update_hud() -> void:
	var kmh := roundi(player_car.speed_ms * 3.6)
	hud_speed.text = "%d KM/H | %d RPM  (%s)" % [kmh, roundi(player_car.rpm), active_track.id.to_upper()]
	hud_gear.text = "M%d  |  ERS %d%%  |  [F2] Pista · [F3] %s" % [
		player_car.gear,
		roundi(player_car.ers_charge),
		"Chuva" if is_wet else "Seco",
	]
	hud_tires.text = "%s · %d%%" % [PacejkaTireModel.compound_name(player_car.compound), roundi(player_car.tire_wear * 100.0)]

	if countdown_timer > 0.0:
		hud_pit_banner.visible = true
		hud_pit_banner.text = "LARGADA FIA · %d/5 LUZES" % countdown_lights
	elif pit_manager.is_servicing:
		hud_pit_banner.visible = true
		hud_pit_banner.text = "PITSTOP %.1fs · [1] Macio  [2] Médio  [3] Chuva (%s)" % [
			maxf(0.0, pit_manager.service_timer),
			PacejkaTireModel.compound_name(pit_manager.selected_compound),
		]
	elif player_car.in_pit_lane or player_car.pit_limiter_active:
		hud_pit_banner.visible = true
		hud_pit_banner.text = "PIT LIMITER ATIVO (80 KM/H)"
	else:
		hud_pit_banner.visible = false

func _on_pit_entered(car: F1CarController) -> void:
	car.in_pit_lane = true
	car.pit_limiter_active = true

func _on_pit_exited(car: F1CarController) -> void:
	car.in_pit_lane = false
	car.pit_limiter_active = false

func _on_pit_box_stopped(car: F1CarController) -> void:
	if car.speed_ms < 22.5:
		pit_manager.begin_pitstop(car)

func _on_pitstop_started(_car: F1CarController) -> void:
	pass

func _on_pitstop_completed(_car: F1CarController, _new_compound: int) -> void:
	pass

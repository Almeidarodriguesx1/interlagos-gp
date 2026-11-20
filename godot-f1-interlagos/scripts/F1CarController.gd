class_name F1CarController
extends RigidBody3D

@export var car_id: String = "player"
@export var short_code: String = "BRA"
@export var is_player: bool = false
@export var primary_color: Color = Color("#059669")
@export var accent_color: Color = Color("#facc15")
@export var helmet_color: Color = Color("#facc15")
@export var car_number: int = 27

const WHEEL_RADIUS: float = 0.36
const REST_LEN: float = 0.46
const SPRING_K: float = 215000.0
const DAMPER_C: float = 16500.0
const MAX_RPM: float = 12800.0
const IDLE_RPM: float = 4000.0
const GEAR_RATIOS: PackedFloat32Array = PackedFloat32Array([0.0, 2.85, 2.22, 1.80, 1.50, 1.28, 1.12, 0.99, 0.89])

var visuals: ProceduralCarMesh
var wheel_rays: Array[RayCast3D] = []
var wheel_surfaces: PackedInt32Array = PackedInt32Array([0, 0, 0, 0])

var gear: int = 1
var rpm: float = IDLE_RPM
var steer_angle: float = 0.0
var speed_ms: float = 0.0
var drs_active: bool = false
var drs_eligible: bool = false
var ers_charge: float = 100.0
var ers_active: bool = false
var brake_temp: float = 0.0
var tire_temp_front: float = 85.0
var tire_temp_rear: float = 87.0
var tire_wear: float = 1.0
var compound: int = PacejkaTireModel.Compound.SOFT
var in_pit_lane: bool = false
var pit_limiter_active: bool = false
var is_wet_weather: bool = false
var is_on_kerb: bool = false
var last_track_idx: int = 0
var launch_allowed: bool = true

var _throttle_in: float = 0.0
var _brake_in: float = 0.0
var _steer_in: float = 0.0
var _ers_in: bool = false
var _lap_dist_s: float = 0.0
var _kerb_phase: float = 0.0

func _ready() -> void:
	mass = 798.0
	center_of_mass_mode = RigidBody3D.CENTER_OF_MASS_MODE_CUSTOM
	center_of_mass = Vector3(0.0, 0.28, -0.05)
	linear_damp = 0.04
	angular_damp = 1.65
	continuous_cd = true # Evita atravessar outros carros a 330+ km/h no Jolt Physics
	contact_monitor = true
	max_contacts_reported = 6

	if is_wet_weather:
		compound = PacejkaTireModel.Compound.WET

	_setup_compound_colliders()
	_setup_four_wheel_raycasts()

	visuals = ProceduralCarMesh.new()
	add_child(visuals)
	visuals.build_car(primary_color, accent_color, helmet_color, car_number, is_player)

func _setup_compound_colliders() -> void:
	# Colisor composto real de F1 (2,0m largura x 5,5m comprimento): elimina parede invisível lateral
	var chassis_col := CollisionShape3D.new()
	var chassis_box := BoxShape3D.new()
	chassis_box.size = Vector3(1.88, 0.62, 3.65)
	chassis_col.shape = chassis_box
	chassis_col.position = Vector3(0.0, 0.46, -0.05)
	add_child(chassis_col)

	var nose_col := CollisionShape3D.new()
	var nose_box := BoxShape3D.new()
	nose_box.size = Vector3(1.96, 0.24, 0.85)
	nose_col.shape = nose_box
	nose_col.position = Vector3(0.0, 0.24, 2.18)
	add_child(nose_col)

	var rear_col := CollisionShape3D.new()
	var rear_box := BoxShape3D.new()
	rear_box.size = Vector3(1.12, 0.68, 0.68)
	rear_col.shape = rear_box
	rear_col.position = Vector3(0.0, 0.56, -2.14)
	add_child(rear_col)

func _setup_four_wheel_raycasts() -> void:
	var corners: Array[Vector3] = [
		Vector3(0.84, 0.52, 1.58),
		Vector3(-0.84, 0.52, 1.58),
		Vector3(0.84, 0.52, -1.52),
		Vector3(-0.84, 0.52, -1.52),
	]
	for pos: Vector3 in corners:
		var ray := RayCast3D.new()
		ray.position = pos
		ray.target_position = Vector3(0.0, -(REST_LEN + WHEEL_RADIUS), 0.0)
		ray.enabled = true
		add_child(ray)
		wheel_rays.append(ray)

func set_player_inputs(throttle: float, brake: float, steer: float, ers: bool, toggle_drs: bool, toggle_limiter: bool) -> void:
	_throttle_in = clampf(throttle, 0.0, 1.0)
	_brake_in = clampf(brake, 0.0, 1.0)
	_steer_in = clampf(steer, -1.0, 1.0)
	_ers_in = ers
	if toggle_drs and drs_eligible:
		drs_active = not drs_active
	if not drs_eligible or _brake_in > 0.15:
		drs_active = false
	if toggle_limiter:
		pit_limiter_active = not pit_limiter_active

func _physics_process(delta: float) -> void:
	if not launch_allowed:
		linear_velocity = Vector3(0.0, linear_velocity.y, 0.0)
		angular_velocity = Vector3.ZERO
		speed_ms = 0.0
		var target_rev := IDLE_RPM + _throttle_in * 7400.0
		rpm = lerpf(rpm, target_rev, 1.0 - exp(-14.0 * delta))
		steer_angle = lerpf(steer_angle, _steer_in * 0.25, 1.0 - exp(-12.0 * delta))
		if visuals != null:
			visuals.update_telemetry_visuals(0, 1, rpm, MAX_RPM, roundi(ers_charge), false, steer_angle, 0.0, 0.0, compound)
		return

	var fwd_dir := global_transform.basis.z.normalized()
	var right_dir := global_transform.basis.x.normalized()
	var v_fwd := linear_velocity.dot(fwd_dir)
	var v_lat := linear_velocity.dot(right_dir)
	speed_ms = linear_velocity.length()
	_lap_dist_s += absf(v_fwd) * delta
	_kerb_phase += absf(v_fwd) * delta * 14.0

	# Limitador automático dos Boxes (80 km/h = 22.22 m/s) quando ativo ou dentro do Pit Lane
	var effective_throttle := _throttle_in
	if (in_pit_lane or pit_limiter_active) and v_fwd > 22.2:
		effective_throttle = 0.0

	# Esterçamento progressivo dependente da velocidade
	var speed_norm := clampf(speed_ms / 88.0, 0.0, 1.0)
	var max_steer := 0.44 * pow(1.0 - speed_norm, 1.25) + 0.068
	steer_angle = lerpf(steer_angle, _steer_in * max_steer, 1.0 - exp(-18.0 * delta))

	# Downforce de efeito solo + arrasto aerodinâmico
	var cl_a := 3.25 if drs_active else 4.25
	var cd_a := 1.02 if drs_active else 1.32
	var q := 0.5 * 1.225 * v_fwd * v_fwd
	apply_central_force(-global_transform.basis.y * (q * cl_a))
	apply_central_force(-linear_velocity.normalized() * (0.5 * 1.225 * speed_ms * speed_ms * cd_a))

	# Suspensão independente nas 4 rodas + leitura real de Zebra / Asfalto / Grama
	var on_kerb_left := false
	var on_kerb_right := false
	var grounded_wheels := 0

	for i in range(4):
		var ray := wheel_rays[i]
		ray.force_raycast_update()
		if not ray.is_colliding():
			continue
		grounded_wheels += 1
		var collider := ray.get_collider()
		var surf: int = TrackData.SurfaceType.ASPHALT
		if collider != null and collider.has_meta("surface_type"):
			surf = int(collider.get_meta("surface_type"))
		wheel_surfaces[i] = surf

		var hit_dist := ray.global_position.distance_to(ray.get_collision_point()) - WHEEL_RADIUS
		var kerb_bump := 0.0
		if surf == TrackData.SurfaceType.KERB:
			# Ondulação serrilhada física APENAS na roda que pisa na zebra (gera rolagem lateral real!)
			kerb_bump = sin(_kerb_phase + float(i) * 1.1) * 0.028
			if i == 0 or i == 2:
				on_kerb_left = true
			else:
				on_kerb_right = true

		var compression := clampf(REST_LEN - (hit_dist - kerb_bump), 0.0, REST_LEN)
		var wheel_vel := linear_velocity + angular_velocity.cross(ray.global_position - global_position)
		var spring_f := compression * SPRING_K - wheel_vel.y * DAMPER_C
		var up_force := global_transform.basis.y * maxf(0.0, spring_f)
		apply_force(up_force, ray.global_position - global_position)

		# Tração, frenagem e força lateral Pacejka por eixo
		var grip := PacejkaTireModel.surface_friction(surf, is_wet_weather, compound)
		grip *= PacejkaTireModel.wear_multiplier(tire_wear, compound)
		var temp_c := tire_temp_front if i < 2 else tire_temp_rear
		grip *= PacejkaTireModel.thermal_multiplier(temp_c, compound, is_wet_weather)

		var wheel_fwd := fwd_dir
		var wheel_right := right_dir
		if i < 2:
			wheel_fwd = fwd_dir.rotated(global_transform.basis.y, steer_angle)
			wheel_right = right_dir.rotated(global_transform.basis.y, steer_angle)

		var lat_slip := clampf(atan2(wheel_vel.dot(wheel_right), maxf(2.5, absf(v_fwd))), -0.45, 0.45)
		var pacejka_lat := PacejkaTireModel.magic_formula(absf(lat_slip))
		var lat_force := -wheel_right * signf(lat_slip) * pacejka_lat * maxf(2000.0, spring_f) * 2.15 * grip
		apply_force(lat_force, ray.global_position - global_position)

		if i >= 2:
			var torque_nm := _engine_torque(rpm, ers_active)
			var ratio: float = GEAR_RATIOS[clampi(gear, 1, 8)]
			var drive_f := ((torque_nm * ratio * 5.45 * 0.92) / WHEEL_RADIUS) * effective_throttle * 0.5
			apply_force(wheel_fwd * drive_f * minf(1.15, grip), ray.global_position - global_position)

		var brake_f := _brake_in * (13800.0 + q * cl_a * 0.4) * 0.25
		if brake_f > 10.0 and absf(v_fwd) > 0.2:
			apply_force(-wheel_fwd * signf(v_fwd) * brake_f * grip, ray.global_position - global_position)

	# Puxão sutil no volante quando apenas um lado monta na zebra
	is_on_kerb = on_kerb_left or on_kerb_right
	if on_kerb_left != on_kerb_right and speed_ms > 15.0:
		var pull_dir := 1.0 if on_kerb_left else -1.0
		apply_torque(global_transform.basis.y * pull_dir * 420.0)

	_update_gearbox_and_temps(v_fwd, effective_throttle, delta)

	if visuals != null:
		visuals.update_telemetry_visuals(
			roundi(speed_ms * 3.6),
			gear,
			rpm,
			MAX_RPM,
			roundi(ers_charge),
			drs_active,
			steer_angle,
			(v_fwd / WHEEL_RADIUS) * delta,
			brake_temp,
			compound
		)

func _engine_torque(cur_rpm: float, ers_on: bool) -> float:
	var n := clampf((cur_rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM), 0.0, 1.0)
	var ice := 625.0 * (0.72 + 0.28 * sin(minf(1.0, n * 1.12) * PI * 0.7))
	var mgu_k := 135.0 if ers_on else 0.0
	return ice + mgu_k

func _update_gearbox_and_temps(v_fwd: float, thr: float, dt: float) -> void:
	if _ers_in and thr > 0.4 and ers_charge > 1.0:
		ers_active = true
		ers_charge = maxf(0.0, ers_charge - 11.0 * dt)
	else:
		ers_active = false
		ers_charge = minf(100.0, ers_charge + (0.9 + _brake_in * 8.5) * dt)

	var wheel_omega := absf(v_fwd) / WHEEL_RADIUS
	var ratio: float = GEAR_RATIOS[clampi(gear, 1, 8)]
	var target_rpm := maxf(IDLE_RPM, (wheel_omega * ratio * 5.45 * 60.0) / TAU)
	rpm = lerpf(rpm, minf(MAX_RPM, target_rpm), 1.0 - exp(-20.0 * dt))

	if gear < 8 and rpm > 12150.0 and thr > 0.3:
		gear += 1
	elif gear > 1 and rpm < 9100.0:
		var prev_rpm: float = (wheel_omega * GEAR_RATIOS[gear - 1] * 5.45 * 60.0) / TAU
		if prev_rpm < 12050.0:
			gear -= 1

	var brake_heat := _brake_in * (speed_ms / 68.0) * 1.65 if speed_ms > 12.0 else 0.0
	brake_temp = clampf(brake_temp + (brake_heat - (0.20 + speed_ms * 0.008) * brake_temp) * dt, 0.0, 1.0)
	if speed_ms > 10.0:
		var wear_rate := (0.00055 if compound == PacejkaTireModel.Compound.SOFT else 0.00034)
		tire_wear = maxf(0.15, tire_wear - wear_rate * dt)

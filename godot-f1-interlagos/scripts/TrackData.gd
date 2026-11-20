class_name TrackData
extends RefCounted

enum SurfaceType {
	ASPHALT = 0,
	KERB = 1,
	RUNOFF = 2,
	GRASS = 3,
	PIT_LANE = 4,
}

class TrackSample:
	var index: int
	var s: float
	var t_norm: float
	var pos: Vector3
	var tangent: Vector3
	var right: Vector3
	var grade: float
	var curvature: float
	var width_left: float
	var width_right: float
	var kerb_left: bool
	var kerb_right: bool
	var drs_zone: int
	var sector: int
	var corner_name: String

class TrackInfo:
	var id: String
	var display_name: String
	var length_meters: float
	var elevation_span: float
	var barrier_color: Color
	var kerb_colors: PackedColorArray
	var samples: Array[TrackSample] = []
	var pit_points: Array[Vector3] = []
	var pit_box_positions: Array[Transform3D] = []
	var bounds_min: Vector3
	var bounds_max: Vector3

const SAMPLE_COUNT: int = 900

static func build_track(track_id: String = "interlagos") -> TrackInfo:
	var info := TrackInfo.new()
	info.id = track_id

	var ctrl: Array[Dictionary] = []
	var drs1 := Vector2(0.22, 0.36)
	var drs2 := Vector2(0.90, 0.065)
	var sector_bounds := Vector2(0.24, 0.72)

	match track_id:
		"monza":
			info.display_name = "Autodromo Nazionale Monza"
			info.length_meters = 5793.0
			info.elevation_span = 8.5
			info.barrier_color = Color("#dc2626")
			info.kerb_colors = PackedColorArray([Color("#dc2626"), Color("#f8fafc"), Color("#15803d")])
			drs1 = Vector2(0.75, 0.87)
			drs2 = Vector2(0.94, 0.10)
			sector_bounds = Vector2(0.34, 0.69)
			ctrl = _monza_points()
		"spa":
			info.display_name = "Circuit de Spa-Francorchamps"
			info.length_meters = 7004.0
			info.elevation_span = 102.0
			info.barrier_color = Color("#eab308")
			info.kerb_colors = PackedColorArray([Color("#dc2626"), Color("#facc15"), Color("#18181b")])
			drs1 = Vector2(0.21, 0.32)
			drs2 = Vector2(0.95, 0.06)
			sector_bounds = Vector2(0.34, 0.71)
			ctrl = _spa_points()
		_:
			info.id = "interlagos"
			info.display_name = "Autódromo José Carlos Pace (Interlagos)"
			info.length_meters = 4309.0
			info.elevation_span = 43.0
			info.barrier_color = Color("#059669")
			info.kerb_colors = PackedColorArray([Color("#15803d"), Color("#facc15"), Color("#f8fafc")])
			ctrl = _interlagos_points()

	var raw_pts: Array[Vector3] = []
	var raw_widths: Array[float] = []
	var raw_names: Array[String] = []
	var n_ctrl := ctrl.size()

	for i in range(SAMPLE_COUNT):
		var u: float = (float(i) / float(SAMPLE_COUNT)) * float(n_ctrl)
		var seg: int = int(floorf(u)) % n_ctrl
		var t: float = u - floorf(u)
		var p0: Dictionary = ctrl[(seg - 1 + n_ctrl) % n_ctrl]
		var p1: Dictionary = ctrl[seg]
		var p2: Dictionary = ctrl[(seg + 1) % n_ctrl]
		var p3: Dictionary = ctrl[(seg + 2) % n_ctrl]
		raw_pts.append(Vector3(
			_catmull(float(p0["x"]), float(p1["x"]), float(p2["x"]), float(p3["x"]), t),
			_catmull(float(p0["y"]), float(p1["y"]), float(p2["y"]), float(p3["y"]), t),
			_catmull(float(p0["z"]), float(p1["z"]), float(p2["z"]), float(p3["z"]), t)
		))
		raw_widths.append(lerpf(float(p1["w"]), float(p2["w"]), t))
		raw_names.append(String(p1["name"]))

	# Escala XZ para comprimento oficial FIA mantendo elevação real
	var raw_len: float = 0.0
	for i in range(SAMPLE_COUNT):
		var a := raw_pts[i]
		var b := raw_pts[(i + 1) % SAMPLE_COUNT]
		raw_len += Vector2(b.x - a.x, b.z - a.z).length()
	var scale_xz: float = info.length_meters / maxf(1.0, raw_len)

	var min_b := Vector3(INF, INF, INF)
	var max_b := Vector3(-INF, -INF, -INF)
	var cum_s: float = 0.0

	for i in range(SAMPLE_COUNT):
		var p_curr := raw_pts[i]
		var p_prev := raw_pts[(i - 1 + SAMPLE_COUNT) % SAMPLE_COUNT]
		var p_next := raw_pts[(i + 1) % SAMPLE_COUNT]
		var pos := Vector3(p_curr.x * scale_xz, p_curr.y, p_curr.z * scale_xz)
		var prev_pos := Vector3(p_prev.x * scale_xz, p_prev.y, p_prev.z * scale_xz)
		var next_pos := Vector3(p_next.x * scale_xz, p_next.y, p_next.z * scale_xz)

		if i > 0:
			cum_s += pos.distance_to(prev_pos)

		var tangent := (next_pos - prev_pos).normalized()
		var flat_tan := Vector3(tangent.x, 0.0, tangent.z).normalized()
		var right := Vector3(-flat_tan.z, 0.0, flat_tan.x).normalized()

		var s := TrackSample.new()
		s.index = i
		s.s = cum_s
		s.t_norm = float(i) / float(SAMPLE_COUNT)
		s.pos = pos
		s.tangent = tangent
		s.right = right
		s.grade = tangent.y
		s.width_left = raw_widths[i] * 0.5
		s.width_right = raw_widths[i] * 0.5
		s.corner_name = raw_names[i]

		var v1 := (pos - prev_pos)
		var v2 := (next_pos - pos)
		var yaw1 := atan2(v1.x, v1.z)
		var yaw2 := atan2(v2.x, v2.z)
		var dyaw := wrapf(yaw2 - yaw1, -PI, PI)
		var seg_len: float = maxf(0.5, v1.length())
		s.curvature = dyaw / seg_len
		s.kerb_left = absf(s.curvature) > 0.0085 and s.curvature < 0.0
		s.kerb_right = absf(s.curvature) > 0.0085 and s.curvature > 0.0

		if s.t_norm >= drs1.x and s.t_norm <= drs1.y:
			s.drs_zone = 1
		elif drs2.x > drs2.y and (s.t_norm >= drs2.x or s.t_norm <= drs2.y):
			s.drs_zone = 2
		elif s.t_norm >= drs2.x and s.t_norm <= drs2.y:
			s.drs_zone = 2
		else:
			s.drs_zone = 0

		if s.t_norm < sector_bounds.x:
			s.sector = 1
		elif s.t_norm < sector_bounds.y:
			s.sector = 2
		else:
			s.sector = 3

		min_b = min_b.min(pos)
		max_b = max_b.max(pos)
		info.samples.append(s)

	info.bounds_min = min_b
	info.bounds_max = max_b

	# Constrói Pit Lane paralelo na Reta dos Boxes (lado esquerdo -right * 16.5m)
	# Entrada ~92% da volta, Saída ~8% da volta
	var pit_steps := 48
	for p_i in range(pit_steps):
		var frac := float(p_i) / float(pit_steps - 1)
		var t_pit := wrapf(0.90 + frac * 0.18, 0.0, 1.0)
		var sp := sample_at_norm(info, t_pit)
		var blend := 1.0
		if frac < 0.16:
			blend = smoothstep(0.0, 0.16, frac)
		elif frac > 0.84:
			blend = 1.0 - smoothstep(0.84, 1.0, frac)
		var lateral := -sp.width_left - 6.5 * blend
		if blend > 0.25:
			lateral = lerpf(-sp.width_left + 1.5, -sp.width_left - 7.5, blend)
		info.pit_points.append(sp.pos + sp.right * lateral + Vector3(0.0, 0.02, 0.0))

	# 8 posições de box iluminados ao longo do trecho reto do Pit Lane
	for b_idx in range(8):
		var pit_frac := 0.28 + float(b_idx) * 0.055
		var p_idx := clampi(int(pit_frac * float(pit_steps - 1)), 1, pit_steps - 2)
		var p_pos := info.pit_points[p_idx]
		var p_fwd := (info.pit_points[p_idx + 1] - info.pit_points[p_idx - 1]).normalized()
		var basis := Basis.looking_at(p_fwd, Vector3.UP)
		info.pit_box_positions.append(Transform3D(basis, p_pos))

	return info

static func sample_at_norm(info: TrackInfo, t_norm: float) -> TrackSample:
	var wrapped := wrapf(t_norm, 0.0, 1.0)
	var idx := clampi(int(wrapped * float(info.samples.size())), 0, info.samples.size() - 1)
	return info.samples[idx]

static func sample_terrain_height(x: float, z: float, info: TrackInfo) -> float:
	var best_d_sq := INF
	var nearest_y := 12.0
	for i in range(0, info.samples.size(), 4):
		var sp := info.samples[i].pos
		var d_sq := (x - sp.x) * (x - sp.x) + (z - sp.z) * (z - sp.z)
		if d_sq < best_d_sq:
			best_d_sq = d_sq
			nearest_y = sp.y
	var dist := sqrt(best_d_sq)
	var blend := clampf((dist - 36.0) / 210.0, 0.0, 1.0)
	var hill := sin(x * 0.007) * cos(z * 0.007) * 14.0 + info.elevation_span * 0.32
	return lerpf(nearest_y, hill, blend) - 0.88

static func _catmull(p0: float, p1: float, p2: float, p3: float, t: float) -> float:
	var t2 := t * t
	var t3 := t2 * t
	return 0.5 * (2.0 * p1 + (-p0 + p2) * t + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3)

static func _interlagos_points() -> Array[Dictionary]:
	return [
		{"x": 0.0, "y": 38.0, "z": 180.0, "w": 19.5, "name": "Reta dos Boxes"},
		{"x": -18.0, "y": 41.0, "z": 30.0, "w": 19.5, "name": "Linha de Chegada"},
		{"x": -42.0, "y": 42.5, "z": -150.0, "w": 19.5, "name": "Freada do S"},
		{"x": -72.0, "y": 35.0, "z": -295.0, "w": 18.5, "name": "S do Senna (T1)"},
		{"x": -138.0, "y": 26.5, "z": -318.0, "w": 18.0, "name": "S do Senna (T2)"},
		{"x": -195.0, "y": 20.5, "z": -385.0, "w": 18.0, "name": "Curva do Sol"},
		{"x": -298.0, "y": 17.0, "z": -370.0, "w": 18.0, "name": "Curva do Sol"},
		{"x": -395.0, "y": 14.5, "z": -262.0, "w": 18.5, "name": "Reta Oposta"},
		{"x": -468.0, "y": 11.5, "z": -85.0, "w": 18.5, "name": "Reta Oposta"},
		{"x": -522.0, "y": 7.5, "z": 95.0, "w": 18.5, "name": "Reta Oposta"},
		{"x": -540.0, "y": 1.5, "z": 238.0, "w": 18.0, "name": "Descida do Lago (T4)"},
		{"x": -485.0, "y": 0.0, "z": 332.0, "w": 18.0, "name": "Descida do Lago (T5)"},
		{"x": -365.0, "y": 4.5, "z": 338.0, "w": 17.5, "name": "Saída do Lago"},
		{"x": -258.0, "y": 9.0, "z": 274.0, "w": 17.2, "name": "Ferradura (T6)"},
		{"x": -242.0, "y": 12.0, "z": 172.0, "w": 17.2, "name": "Ferradura (T7)"},
		{"x": -294.0, "y": 14.5, "z": 92.0, "w": 16.8, "name": "Miolo"},
		{"x": -286.0, "y": 16.5, "z": -16.0, "w": 16.8, "name": "Laranjinha (T8)"},
		{"x": -195.0, "y": 17.5, "z": -60.0, "w": 16.8, "name": "Laranjinha"},
		{"x": -115.0, "y": 16.0, "z": -18.0, "w": 16.8, "name": "Pinheirinho (T9)"},
		{"x": -116.0, "y": 14.5, "z": 72.0, "w": 16.8, "name": "Pinheirinho"},
		{"x": -158.0, "y": 12.5, "z": 132.0, "w": 17.2, "name": "Bico de Pato (T10)"},
		{"x": -146.0, "y": 10.5, "z": 222.0, "w": 17.5, "name": "Saída Bico de Pato"},
		{"x": -94.0, "y": 6.5, "z": 288.0, "w": 17.5, "name": "Mergulho (T11)"},
		{"x": -24.0, "y": 8.0, "z": 382.0, "w": 17.5, "name": "Entrada da Junção"},
		{"x": 56.0, "y": 12.5, "z": 432.0, "w": 18.0, "name": "Junção (T12)"},
		{"x": 112.0, "y": 19.5, "z": 392.0, "w": 18.5, "name": "Subida dos Boxes"},
		{"x": 86.0, "y": 26.5, "z": 318.0, "w": 19.0, "name": "Subida dos Boxes"},
		{"x": 44.0, "y": 33.0, "z": 255.0, "w": 19.0, "name": "Curva do Café (T14)"},
	]

static func _monza_points() -> Array[Dictionary]:
	return [
		{"x": 0.0, "y": 2.0, "z": 240.0, "w": 20.0, "name": "Reta Principal"},
		{"x": 0.0, "y": 2.5, "z": 20.0, "w": 20.0, "name": "Linha de Chegada"},
		{"x": 0.0, "y": 3.0, "z": -220.0, "w": 20.0, "name": "Freada Rettifilo"},
		{"x": 18.0, "y": 3.2, "z": -310.0, "w": 17.5, "name": "Variante del Rettifilo"},
		{"x": -14.0, "y": 3.5, "z": -365.0, "w": 17.5, "name": "Saída Rettifilo"},
		{"x": -10.0, "y": 4.5, "z": -500.0, "w": 18.5, "name": "Curva Grande"},
		{"x": 95.0, "y": 6.5, "z": -610.0, "w": 18.5, "name": "Biassono"},
		{"x": 255.0, "y": 8.5, "z": -595.0, "w": 18.5, "name": "Variante Roggia"},
		{"x": 350.0, "y": 9.0, "z": -535.0, "w": 17.2, "name": "Roggia (T4)"},
		{"x": 410.0, "y": 9.0, "z": -575.0, "w": 17.2, "name": "Roggia (T5)"},
		{"x": 525.0, "y": 7.5, "z": -520.0, "w": 17.5, "name": "Lesmo 1"},
		{"x": 565.0, "y": 6.0, "z": -380.0, "w": 17.5, "name": "Lesmo 2"},
		{"x": 420.0, "y": 3.5, "z": -150.0, "w": 18.5, "name": "Serraglio"},
		{"x": 320.0, "y": 2.5, "z": 185.0, "w": 18.0, "name": "Variante Ascari"},
		{"x": 245.0, "y": 2.0, "z": 245.0, "w": 18.0, "name": "Ascari (T9)"},
		{"x": 265.0, "y": 1.5, "z": 525.0, "w": 19.0, "name": "Reta Oposta"},
		{"x": 165.0, "y": 1.0, "z": 815.0, "w": 19.5, "name": "Curva Parabolica"},
		{"x": 48.0, "y": 1.2, "z": 765.0, "w": 19.5, "name": "Saída Parabolica"},
	]

static func _spa_points() -> Array[Dictionary]:
	return [
		{"x": 0.0, "y": 42.0, "z": 180.0, "w": 19.5, "name": "Reta Principal"},
		{"x": -8.0, "y": 43.5, "z": 0.0, "w": 19.5, "name": "Linha de Chegada"},
		{"x": 28.0, "y": 41.0, "z": -235.0, "w": 17.8, "name": "La Source (T1)"},
		{"x": 180.0, "y": 14.0, "z": -95.0, "w": 18.5, "name": "Eau Rouge"},
		{"x": 255.0, "y": 38.0, "z": -25.0, "w": 18.5, "name": "Raidillon"},
		{"x": 655.0, "y": 95.0, "z": 120.0, "w": 19.0, "name": "Kemmel Straight"},
		{"x": 825.0, "y": 102.0, "z": 175.0, "w": 18.0, "name": "Les Combes"},
		{"x": 965.0, "y": 74.0, "z": 410.0, "w": 17.5, "name": "Bruxelles"},
		{"x": 665.0, "y": 38.0, "z": 455.0, "w": 18.5, "name": "Pouhon"},
		{"x": 850.0, "y": 20.0, "z": 615.0, "w": 18.0, "name": "Les Fagnes"},
		{"x": 540.0, "y": 0.0, "z": 665.0, "w": 18.5, "name": "Stavelot"},
		{"x": 245.0, "y": 15.0, "z": 455.0, "w": 18.5, "name": "Blanchimont"},
		{"x": 62.0, "y": 32.0, "z": 295.0, "w": 17.5, "name": "Bus Stop Chicane"},
	]

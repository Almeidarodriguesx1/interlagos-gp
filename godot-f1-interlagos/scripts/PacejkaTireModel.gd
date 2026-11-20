class_name PacejkaTireModel
extends RefCounted

enum Compound {
	SOFT = 0,
	MEDIUM = 1,
	WET = 2,
}

static func compound_name(compound: int) -> String:
	match compound:
		Compound.SOFT:
			return "Macio (P ZERO)"
		Compound.MEDIUM:
			return "Médio (P ZERO)"
		Compound.WET:
			return "Chuva (CINTURATO)"
	return "Macio"

static func compound_color(compound: int) -> Color:
	match compound:
		Compound.SOFT:
			return Color("#ef4444")
		Compound.MEDIUM:
			return Color("#facc15")
		Compound.WET:
			return Color("#38bdf8")
	return Color("#ef4444")

static func magic_formula(slip: float, b_stiff: float = 13.5, c_shape: float = 1.65, d_peak: float = 1.0, e_curv: float = 0.65) -> float:
	var bx := b_stiff * slip
	return d_peak * sin(c_shape * atan(bx - e_curv * (bx - atan(bx))))

static func thermal_multiplier(temp_c: float, compound: int, is_wet: bool) -> float:
	var opt_low: float = 60.0 if compound == Compound.WET else (78.0 if compound == Compound.MEDIUM else 84.0)
	var opt_high: float = 92.0 if compound == Compound.WET else (112.0 if compound == Compound.MEDIUM else 108.0)
	if is_wet and compound != Compound.WET:
		return 0.62 # Slicks na pista molhada perdem aderência drástica
	if temp_c >= opt_low and temp_c <= opt_high:
		return 1.0
	if temp_c < opt_low:
		var deficit := clampf((opt_low - temp_c) / 38.0, 0.0, 1.0)
		return 1.0 - deficit * 0.12
	var overheat := clampf((temp_c - opt_high) / 35.0, 0.0, 1.0)
	return 1.0 - overheat * 0.09

static func wear_multiplier(wear: float, compound: int) -> float:
	var w := clampf(wear, 0.15, 1.0)
	var compound_bonus: float = 1.03 if compound == Compound.SOFT else (1.0 if compound == Compound.MEDIUM else 0.96)
	if w >= 0.72:
		return compound_bonus
	var t := (0.72 - w) / (0.72 - 0.15)
	return compound_bonus * (1.0 - t * 0.22)

static func surface_friction(surface_type: int, is_wet: bool, compound: int) -> float:
	var wet_factor: float = 1.0
	if is_wet:
		wet_factor = 0.84 if compound == Compound.WET else 0.56
	match surface_type:
		TrackData.SurfaceType.ASPHALT, TrackData.SurfaceType.PIT_LANE:
			return 1.0 * wet_factor
		TrackData.SurfaceType.KERB:
			# Zebra pintada molhada escorrega bastante; seca mantém ~93% com trepidação física
			return (0.71 if is_wet else 0.93)
		TrackData.SurfaceType.RUNOFF:
			return 0.85 * wet_factor
		TrackData.SurfaceType.GRASS:
			return 0.58 * wet_factor
	return 1.0

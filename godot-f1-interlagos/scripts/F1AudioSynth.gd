class_name F1AudioSynth
extends Node

var _player: AudioStreamPlayer
var _playback: AudioStreamGeneratorPlayback
var _mix_rate: float = 44100.0

var _phase_v6: float = 0.0
var _phase_sub: float = 0.0
var _phase_h2: float = 0.0
var _phase_turbo: float = 0.0
var _phase_kerb: float = 0.0

var target_rpm: float = 4000.0
var target_throttle: float = 0.0
var target_speed_ms: float = 0.0
var on_kerb: bool = false
var muted: bool = false

func _ready() -> void:
	_player = AudioStreamPlayer.new()
	var gen := AudioStreamGenerator.new()
	gen.mix_rate = _mix_rate
	gen.buffer_length = 0.08
	_player.stream = gen
	_player.volume_db = -10.0
	add_child(_player)
	_player.play()
	_playback = _player.get_stream_playback() as AudioStreamGeneratorPlayback

func update_params(rpm: float, throttle: float, speed_ms: float, kerb: bool, is_muted: bool) -> void:
	target_rpm = clampf(rpm, 3500.0, 13200.0)
	target_throttle = clampf(throttle, 0.0, 1.0)
	target_speed_ms = maxf(0.0, speed_ms)
	on_kerb = kerb
	muted = is_muted
	if _player != null:
		_player.stream_paused = muted

func _process(_delta: float) -> void:
	if _playback == null or muted:
		return

	var frames := _playback.get_frames_available()
	if frames <= 0:
		return

	# 1.6L V6 Turbo Hybrid: 3 combustões por rotação
	var f0 := (target_rpm / 60.0) * 3.0
	var turbo_freq := 1400.0 + ((target_rpm - 4000.0) / 8800.0) * 2800.0
	var inc_v6 := f0 / _mix_rate
	var inc_sub := (f0 * 0.5) / _mix_rate
	var inc_h2 := (f0 * 2.0) / _mix_rate
	var inc_turbo := turbo_freq / _mix_rate
	var inc_kerb := (48.0 + target_speed_ms * 1.4) / _mix_rate

	var load_gain := 0.28 + target_throttle * 0.48
	var turbo_gain := (0.04 + target_throttle * 0.08) * clampf((target_rpm - 5500.0) / 7000.0, 0.0, 1.0)
	var kerb_gain := 0.22 * clampf(target_speed_ms / 35.0, 0.0, 1.0) if on_kerb else 0.0

	for _i in range(frames):
		_phase_v6 = fmod(_phase_v6 + inc_v6, 1.0)
		_phase_sub = fmod(_phase_sub + inc_sub, 1.0)
		_phase_h2 = fmod(_phase_h2 + inc_h2, 1.0)
		_phase_turbo = fmod(_phase_turbo + inc_turbo, 1.0)
		_phase_kerb = fmod(_phase_kerb + inc_kerb, 1.0)

		var saw_v6 := (_phase_v6 * 2.0 - 1.0)
		var pulse_sub := sin(_phase_sub * TAU)
		var rasp_h2 := sin(_phase_h2 * TAU) * 0.45 + sin(_phase_v6 * TAU * 3.0) * 0.22
		var v6_wave := tanh((saw_v6 * 0.55 + pulse_sub * 0.35 + rasp_h2 * 0.45) * 1.8) * load_gain

		var whistle := sin(_phase_turbo * TAU) * turbo_gain
		var kerb_rumble := (1.0 if _phase_kerb < 0.5 else -1.0) * kerb_gain * 0.45

		var sample := clampf(v6_wave * 0.55 + whistle + kerb_rumble, -0.92, 0.92)
		_playback.push_frame(Vector2(sample, sample))

class_name PitStopManager
extends Node

signal pitstop_started(car: F1CarController)
signal pitstop_completed(car: F1CarController, new_compound: int)

var is_servicing: bool = false
var selected_compound: int = PacejkaTireModel.Compound.SOFT
var service_timer: float = 0.0
var service_duration: float = 2.4
var _active_car: F1CarController = null

func begin_pitstop(car: F1CarController) -> void:
	if is_servicing or car == null:
		return
	is_servicing = true
	_active_car = car
	service_timer = service_duration
	car.linear_velocity = Vector3.ZERO
	car.angular_velocity = Vector3.ZERO
	car.freeze = true
	pitstop_started.emit(car)

func select_compound(compound: int) -> void:
	selected_compound = compound

func _process(delta: float) -> void:
	if not is_servicing or _active_car == null:
		return

	if Input.is_key_pressed(KEY_1):
		selected_compound = PacejkaTireModel.Compound.SOFT
	elif Input.is_key_pressed(KEY_2):
		selected_compound = PacejkaTireModel.Compound.MEDIUM
	elif Input.is_key_pressed(KEY_3):
		selected_compound = PacejkaTireModel.Compound.WET

	service_timer -= delta
	if service_timer <= 0.0:
		_complete_pitstop()

func _complete_pitstop() -> void:
	is_servicing = false
	if _active_car != null:
		_active_car.compound = selected_compound
		_active_car.tire_wear = 1.0
		_active_car.tire_temp_front = 86.0
		_active_car.tire_temp_rear = 88.0
		_active_car.freeze = false
		pitstop_completed.emit(_active_car, selected_compound)
		_active_car = null

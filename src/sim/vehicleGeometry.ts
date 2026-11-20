/** Geometry targets of the Blender study, not measured McLaren engineering data. */
export interface VehicleGeometry {
  readonly wheelbaseM: number;
  readonly frontAxleZ: number;
  readonly rearAxleZ: number;
  readonly frontHalfTrackM: number;
  readonly rearHalfTrackM: number;
  readonly wheelRadiusM: number;
}
export const MCL40_STUDY_GEOMETRY: VehicleGeometry = Object.freeze({
  wheelbaseM: 3.4, frontAxleZ: 1.7, rearAxleZ: -1.7,
  frontHalfTrackM: .79, rearHalfTrackM: .75, wheelRadiusM: .363,
});

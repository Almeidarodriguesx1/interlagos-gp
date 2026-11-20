import {MCL40_STUDY_GEOMETRY} from './vehicleGeometry';
/** Visual studies share an estimated platform. These are not team engineering dimensions or rule presets. */
export const VEHICLE_STUDIES = [
  {id:'mcl40', config:'mcl40-study', label:'McLaren MCL40 · estudo v0.2', file:'mcl40-v02.glb', teamId:'mclaren', number:1, shortCode:'MCL', geometry:MCL40_STUDY_GEOMETRY},
  {id:'sf26', config:'sf26-study', label:'Ferrari SF-26 · estudo', file:'sf26-v01.glb', teamId:'ferrari', number:16, shortCode:'FER', geometry:MCL40_STUDY_GEOMETRY},
  {id:'rb22', config:'rb22-study', label:'Red Bull RB22 · estudo', file:'rb22-v01.glb', teamId:'oracle', number:3, shortCode:'RBR', geometry:MCL40_STUDY_GEOMETRY},
  {id:'w17', config:'w17-study', label:'Mercedes W17 · estudo', file:'w17-study.glb', teamId:'mercedes', number:63, shortCode:'RUS', geometry:MCL40_STUDY_GEOMETRY},
  {id:'amr26', config:'amr26-study', label:'Aston Martin AMR26 · estudo', file:'amr26-study.glb', teamId:'aston', number:14, shortCode:'ALO', geometry:MCL40_STUDY_GEOMETRY},
  {id:'fw48', config:'fw48-study', label:'Williams FW48 · estudo', file:'fw48-study.glb', teamId:'williams', number:23, shortCode:'ALB', geometry:MCL40_STUDY_GEOMETRY},
  {id:'vf26', config:'vf26-study', label:'Haas VF-26 · estudo', file:'vf26-study.glb', teamId:'haas', number:87, shortCode:'BEA', geometry:MCL40_STUDY_GEOMETRY},
  {id:'a526', config:'a526-study', label:'Alpine A526 · estudo', file:'a526-study.glb', teamId:'alpine', number:10, shortCode:'GAS', geometry:MCL40_STUDY_GEOMETRY},
  {id:'vcarb03', config:'vcarb03-study', label:'Racing Bulls VCARB 03 · estudo', file:'vcarb03-study.glb', teamId:'racingbulls', number:30, shortCode:'LAW', geometry:MCL40_STUDY_GEOMETRY},
  {id:'r26', config:'r26-study', label:'Audi R26 · estudo', file:'r26-study.glb', teamId:'audi', number:5, shortCode:'BOR', geometry:MCL40_STUDY_GEOMETRY},
  {id:'mac26', config:'mac26-study', label:'Cadillac MAC-26 · estudo', file:'mac26-study.glb', teamId:'cadillac', number:77, shortCode:'BOT', geometry:MCL40_STUDY_GEOMETRY},
] as const;
export type VehicleStudy = typeof VEHICLE_STUDIES[number];
export type VehicleStudyConfig = VehicleStudy['config'];
export function studyFromQuery(value:string|null):VehicleStudy|undefined {return VEHICLE_STUDIES.find(s=>s.id===value);}
export function studyFromConfig(value?:VehicleStudyConfig):VehicleStudy|undefined {return VEHICLE_STUDIES.find(s=>s.config===value);}

export const DEFAULT_MIX = {master:.8,engine:1,surfaces:1,wind:1,impacts:1,ui:1,rain:.65,rivals:.7,crowd:.8};
export type MixSettings = typeof DEFAULT_MIX;
export function readMix():MixSettings {
 try {const raw=JSON.parse(localStorage.getItem('interlagos-audio-mix')??'{}');return Object.fromEntries(Object.entries(DEFAULT_MIX).map(([k,v])=>[k,typeof raw[k]==='number' && Number.isFinite(raw[k])?Math.max(0,Math.min(1,raw[k])):v])) as MixSettings;}catch{return {...DEFAULT_MIX};}
}
export function saveMix(mix:MixSettings){try{localStorage.setItem('interlagos-audio-mix',JSON.stringify(mix));}catch{/* session settings still work */}}

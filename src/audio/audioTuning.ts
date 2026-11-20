export function provisionalMotor(rpm:number,throttle:number){
 return {rate:Math.max(.96,Math.min(1.04,1+(rpm-8500)/100000)),gain:.30+.15*Math.max(0,Math.min(1,throttle))};
}
export function perspective(onboard:boolean,distance:number){
 const d=Math.max(0,Number.isFinite(distance)?distance:0);
 return {engineCutoff:onboard?16000:Math.max(6500,18000-d*35),surfaceCutoff:onboard?6500:14000,attenuation:onboard?1:Math.max(.28,1/(1+d/70))};
}

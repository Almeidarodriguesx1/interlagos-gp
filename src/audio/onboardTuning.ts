/** Editing reference only: the supplied recording has no certified RPM metadata. */
export const ONBOARD_REFERENCE_RPM=10500;
export function onboardRate(rpm:number):number {
 const safe=Number.isFinite(rpm)?rpm:4000;
 return Math.max(.38,Math.min(1.28,safe/ONBOARD_REFERENCE_RPM));
}
export function onboardWeights(seconds:number,out:Float32Array):Float32Array {
 const cycle=(Math.max(0,Number.isFinite(seconds)?seconds:0)/5.7)%3;
 const a=Math.floor(cycle),blend=cycle-a;
 out.fill(0);out[a]=Math.cos(blend*Math.PI/2);out[(a+1)%3]=Math.sin(blend*Math.PI/2);return out;
}

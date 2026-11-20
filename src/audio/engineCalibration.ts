export const ENGINE_IDS = ['engine_idle','engine_low','engine_mid','engine_high','engine_limiter'] as const;
export interface Calibration {approved:boolean;source:string;license:string;bands:{id:string;nativeRpm:number}[];offThrottleRpm:number}
export function calibrationErrors(value:Calibration):string[]{
 const errors:string[]=[];
 if(!value.approved)errors.push('Motor aguardando aprovação');
 if(!value.source?.trim())errors.push('Origem do motor não informada');
 if(!value.license?.trim())errors.push('Licença do motor não informada');
 if(value.bands?.length!==5)errors.push('São necessárias cinco bandas');
 for(let i=0;i<5;i++){
  const band=value.bands?.[i];
  if(band?.id!==ENGINE_IDS[i] || !Number.isFinite(band?.nativeRpm) || band.nativeRpm<=0 || (i>0 && band.nativeRpm<=value.bands[i-1].nativeRpm))errors.push('Bandas inválidas: ordem e RPM devem ser crescentes');
 }
 if(!Number.isFinite(value.offThrottleRpm)||value.offThrottleRpm<=0)errors.push('RPM de desaceleração inválido');
 return errors;
}
export type BandMix={gain:number;rate:number};
export function mixInto(rpm:number,centers:readonly number[],out:BandMix[]):BandMix[]{
 const finite=Number.isFinite(rpm)?rpm:centers[0];
 const clamped=Math.max(centers[0],Math.min(centers[4],finite));let energy=0;
 for(let i=0;i<5;i++){
  const center=centers[i],span=clamped<center?center-(centers[i-1]??center-2100):(centers[i+1]??center+2100)-center;
  const weight=Math.max(0,1-Math.abs(clamped-center)/span);
  out[i].gain=weight;out[i].rate=Math.max(.85,Math.min(1.15,finite/center));energy+=weight*weight;
 }
 energy=Math.sqrt(energy)||1;for(let i=0;i<5;i++)out[i].gain/=energy;return out;
}

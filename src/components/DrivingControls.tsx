import {useEffect,useState} from 'react';
export function DrivingControls(){
 const [status,setStatus]=useState({running:true,starting:false,manual:false,gear:1});
 useEffect(()=>{const timer=setInterval(()=>{const s=(window as any).interlagosDriving?.status();if(s)setStatus(s);},150);return()=>clearInterval(timer);},[]);
 const api=()=> (window as any).interlagosDriving;
 return <fieldset className="space-y-3 border-t border-white/10 pt-3"><legend>Motor e transmissão</legend>
 <p role="status">Motor: {status.starting?'dando partida':status.running?'ligado':'desligado'} · Marcha {status.gear===0?'N':status.gear===-1?'R':status.gear}</p>
 <button className="rounded bg-slate-700 p-2" onClick={()=>api()?.ignition()}>{status.running?'Desligar motor':'Dar partida'} (I)</button>
 <label className="block"><input type="checkbox" checked={status.manual} onChange={e=>{api()?.manual(e.target.checked);setStatus({...status,manual:e.target.checked});}}/> Câmbio manual (T)</label>
 <p className="text-xs text-slate-300">Q reduz · E sobe · I liga/desliga · T alterna manual/automático. A partida leva 0,7 s após continuar. No automático, freie até parar. Para dar ré, solte o freio e pressione de novo, mantendo-o acionado. Não há som de motor de arranque nesta versão.</p>
 </fieldset>;
}

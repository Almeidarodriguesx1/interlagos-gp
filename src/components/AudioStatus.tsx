import {useEffect,useState} from 'react';
export function AudioStatus(){
 const [driving,setDriving]=useState({running:true,manual:false,starting:false});
 const [mode,setMode]=useState('unavailable');
 useEffect(()=>{const timer=setInterval(()=>{setMode((window as any).interlagosAudio?.status.engineMode??'unavailable');const s=(window as any).interlagosDriving?.status();if(s)setDriving(s);},500);return()=>clearInterval(timer);},[]);
 if(mode!=='recorded-provisional'&&mode!=='recorded-onboard-experimental')return null;
 return <div className="pointer-events-auto fixed bottom-2 left-2 z-20 rounded bg-black/80 px-3 py-2 text-xs text-slate-200">Motor: {mode==='recorded-onboard-experimental'?'seu onboard (experimental)':'gravação provisória'} · <a className="underline" href="audio/CREDITS.txt" target="_blank" rel="noreferrer">Créditos</a><span className="block text-slate-400">{driving.starting?'Dando partida…':driving.running?'Motor ligado':'Motor desligado'} · {driving.manual?'Manual Q/E':'Automático'} · I liga/desliga, T alterna câmbio. Era/RPM não certificados.</span></div>;
}

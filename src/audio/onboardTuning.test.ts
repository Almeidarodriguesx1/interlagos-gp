import test from'node:test';import assert from'node:assert/strict';import{onboardRate,onboardWeights}from'./onboardTuning';
test('onboard responds continuously from idle to limiter instead of the former low-RPM plateau',()=>{
 assert.ok(onboardRate(4000)<onboardRate(5000)&&onboardRate(5000)<onboardRate(7000));
 assert.ok(onboardRate(12300)>onboardRate(10500));assert.equal(onboardRate(10500),1);
 for(let rpm=4000;rpm<=12800;rpm+=50)assert.ok(Number.isFinite(onboardRate(rpm))&&onboardRate(rpm)>=.38&&onboardRate(rpm)<=1.28);
 assert.ok(Number.isFinite(onboardRate(NaN)));
});
test('recorded onboard texture transitions reuse storage and maintain a bounded equal-power mix',()=>{
 const out=new Float32Array(3);for(let t=0;t<60;t+=.037){assert.equal(onboardWeights(t,out),out);assert.ok(Math.abs(out.reduce((s,w)=>s+w*w,0)-1)<1e-6);assert.ok([...out].every(w=>w>=0&&w<=1));}
 assert.ok([...onboardWeights(NaN,out)].every(Number.isFinite));
});

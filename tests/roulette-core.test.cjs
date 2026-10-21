const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../assets/roulette-core.js');
const config=require('../assets/roulette-config.js');
const at=s=>Date.parse(s), hex='0123456789ABCDEF';
test('Samara expiry uses the restaurant day rather than the phone or UTC date',()=>{
 assert.equal(core.dayEndSamara(at('2026-10-22T20:10:00Z')),at('2026-10-23T20:00:00Z'));
 assert.equal(core.dayEndSamara(at('2026-10-22T19:59:59Z')),at('2026-10-22T20:00:00Z'));
});
test('Midnight, year boundary and leap day expire at the next Samara midnight',()=>{
 for(const [input,want] of [['2026-10-22T20:00:00Z','2026-10-23T20:00:00Z'],['2026-12-31T19:58:00Z','2026-12-31T20:00:00Z'],['2028-02-29T12:00:00Z','2028-02-29T20:00:00Z']]) assert.equal(core.dayEndSamara(at(input)),at(want));
});
test('An expired same-day bonus does not grant a new weekly attempt',()=>{
 const s=core.makeState(config,0,at('2026-10-22T16:00:00Z'),hex);
 assert.equal(core.canSpin(s,s.expiresAt+1),false);
 assert.equal(core.canSpin(s,s.nextAt-1),false);
 assert.equal(core.canSpin(s,s.nextAt),true);
 assert.equal(s.nextAt-s.spinAt,168*3600000);
});
test('Persisted result survives serialisation and always stays a DEMO code',()=>{
 const s=core.makeState(config,1,at('2026-10-22T12:00:00Z'),hex);
 assert.deepEqual(core.validateState(JSON.parse(JSON.stringify(s)),config),s);
 assert.match(s.code,/^DEMO-SH-/);
 assert.equal(core.couponText(config.prizes[1],s),'Заказ от 3 000 ₽ | Скидка 15% | DEMO-SH-0123456789ABCDEF');
});
test('Broken stored state is rejected rather than granting an apparently valid coupon',()=>{
 const s=core.makeState(config,0,at('2026-10-22T12:00:00Z'),hex);
 for(const patch of [{version:2},{campaign:'old'},{prizeId:'unknown'},{code:'SH-REAL'},{spinAt:NaN},{spinAt:-1},{nextAt:s.nextAt-1},{expiresAt:s.expiresAt+1}]) assert.equal(core.validateState({...s,...patch},config),null);
 for(const value of [null,{},false,'coupon']) assert.equal(core.validateState(value,config),null);
});
test('Six equal sectors select each prize and reject the modulo-bias tail',()=>{
 assert.deepEqual(Array.from({length:6},(_,i)=>core.randomIndex(6,()=>i)),[0,1,2,3,4,5]);
 const words=[4294967295,4294967294,3];let reads=0;
 assert.equal(core.randomIndex(6,()=>words[reads++]),3);assert.equal(reads,3);
});
test('Switching config to live cannot silently enable client-side real prizes',()=>{
 assert.throws(()=>core.makeState({...config,mode:'live'},0,Date.now(),hex),/Only review mode/);
 assert.throws(()=>core.makeState(config,99,Date.now(),hex));
});
test('Every proposed sector has an individual illustration and explicit conditions',()=>{
 assert.equal(new Set(config.prizes.map(p=>p.id)).size,6);
 assert.equal(new Set(config.prizes.map(p=>p.image)).size,6);
 for(const p of config.prizes){assert(p.name&&p.benefit&&p.terms&&p.image);assert(!/ничего|пусто|не повезло/i.test(p.name));}
});


import test from 'node:test';
import assert from 'node:assert/strict';
import {monthSummary,mergeState,escapeHTML,localDate} from '../finance.js';
import {tcScheduleTable,tcPaymentAtTerm,migrateRate} from '../calc.js';
test('monthly wallet and available money include base and paid debt only once',()=>{
 const s={currentMonth:'2026-09',walletBase:100,income:[{amount:1000}],expense:[{amount:200}],txns:{'2026-09':[{type:'out',amount:50}]},debts:[{id:'a',type:'td',monthly:300}],ticks:{}};
 assert.equal(monthSummary(s).wallet,850);assert.equal(monthSummary(s).available,550);
 s.ticks={'2026-09':{a:{amount:300}}};assert.equal(monthSummary(s).wallet,550);assert.equal(monthSummary(s).available,550);
 s.debts[0].settled=true;assert.equal(monthSummary(s).paidDebt,300);
});
test('loan schedules repay exact principal including zero interest and final rounding',()=>{
 for(const method of ['fixed_principal','reducing_balance'])for(const rate of [0,4,12,24]){
 const rows=tcScheduleTable(10000001,rate,36,method);
 assert.equal(rows.reduce((s,r)=>s+r.principal,0),10000001);assert.equal(rows.at(-1).balance,0);
 assert(rows.every(r=>r.total>=0&&r.principal>=0&&r.interest>=0));
 }assert.equal(tcPaymentAtTerm(100,12,12,'fixed_principal',13).total,0);
});
test('yearly rates are never guessed to be monthly',()=>{const d={type:'tc',rate:4};migrateRate(d);assert.equal(d.rate,4);});
test('independent records merge across devices',()=>{
 const base={items:[{id:'a',amount:1}],ticks:{}};
 const local={items:[{id:'a',amount:1},{id:'b',amount:2}],ticks:{}};
 const remote={items:[{id:'a',amount:3}],ticks:{sep:{x:true}}};
 const out=mergeState(base,local,remote);assert.equal(out.items.length,2);assert.equal(out.items[0].amount,3);assert.equal(out.ticks.sep.x,true);
});
test('conflicting edits are rejected; deletes preserve unrelated records',()=>{
 assert.throws(()=>mergeState({x:1},{x:2},{x:3}));
 const out=mergeState([{id:'a'},{id:'b'}],[{id:'b'}],[{id:'a'},{id:'b'},{id:'c'}]);assert.deepEqual(out,[{id:'b'},{id:'c'}]);
});
test('HTML is escaped and date uses local calendar',()=>{assert.equal(escapeHTML('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;');assert.equal(localDate(new Date(2026,0,1,0,30)),'2026-01-01');});

test('recorded payments survive deletion of the loan',()=>{const s=monthSummary({currentMonth:'2026-09',walletBase:1000,debts:[],ticks:{'2026-09':{removed:{amount:300}}}});assert.equal(s.wallet,700);assert.equal(s.available,700);});

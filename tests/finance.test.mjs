
import test from 'node:test';
import assert from 'node:assert/strict';
import {dueDate,plansForMonth,changePlan,monthSummary,mergeState,escapeHTML,localDate,balanceSummary,balanceEntries,recordedEntries} from '../finance.js';
import {tcScheduleTable,tcPaymentAtTerm,migrateRate} from '../calc.js';
test('notes and savings do not change cash flow; legacy paid debt is included once',()=>{
 const s={currentMonth:'2026-09',walletBase:100,income:[{amount:1000}],expense:[{amount:200}],savings:[{amount:800}],txns:{'2026-09':[{type:'out',amount:50}]},debts:[{id:'a',type:'td',monthly:300}],ticks:{}};
 const x=monthSummary(s);assert.equal(x.balanceTotal,100);assert.equal(x.net,-50);assert.equal(x.totalIn,0);assert.equal(x.totalOut,50);assert.equal(x.fixedIncome,1000);assert.equal(x.fixedExpense,200);assert.equal(x.savingTotal,800);
 s.ticks={'2026-09':{a:{amount:300}}};const y=monthSummary(s);assert.equal(y.balanceTotal,100);assert.equal(y.net,-350);assert.equal(y.paidDebt,300);
 s.debts=[];assert.equal(monthSummary(s).paidDebt,300);
});
test('latest note per named account is summed, not all history',()=>{
 const notes=[{id:'1',name:'VCB',kind:'bank',amount:500,date:'2026-09-01'},{id:'2',name:' vcb ',kind:'bank',amount:300,date:'2026-09-03'},{id:'3',name:'VCB',kind:'bank',amount:900,date:'2026-09-02'},{id:'4',name:'Ví',kind:'cash',amount:25,date:'2026-09-01'}];
 assert.equal(balanceSummary(notes,999).total,325);assert.equal(balanceSummary(notes).accounts.length,2);assert.equal(notes.length,4);
 assert.equal(balanceSummary([...notes,{id:'5',name:'VCB',kind:'bank',amount:0,date:'2026-09-03'}]).total,25);
});
test('legacy opening note is retained without inventing a date; deleted notes stay deleted',()=>{
 assert.equal(balanceEntries(null,100)[0].date,'');assert.equal(balanceSummary(null,100).total,100);assert.equal(balanceSummary([],100).total,0);assert.equal(balanceEntries(null,0).length,0);
});
test('old auto-generated savings transactions are kept but excluded until explicitly counted',()=>{
 const entries=[{id:'sv-txn-s1',isSaving:true,type:'out',amount:1000},{id:'manual',type:'out',amount:50},{id:'ordinary',isSaving:true,type:'out',amount:10}];
 assert.equal(recordedEntries(entries).length,2);const state={currentMonth:'2026-09',txns:{'2026-09':entries}};
 assert.equal(monthSummary(state).txnOut,60);assert.equal(entries.length,3);
 entries[0].isSaving=false;assert.equal(monthSummary(state).txnOut,1060);
});
test('monthly transactions are selected independently of notebook balances',()=>{
 const state={currentMonth:'2026-09',balanceNotes:[{id:'n',name:'Ví',kind:'cash',amount:100,date:'2026-08-01'}],txns:{'2026-08':[{type:'out',amount:80}],'2026-09':[{type:'in',amount:20}]}};
 assert.equal(monthSummary(state).net,20);assert.equal(monthSummary(state).balanceTotal,100);
 state.currentMonth='2026-08';assert.equal(monthSummary(state).net,-80);assert.equal(monthSummary(state).balanceTotal,100);
});
test('loan schedules repay exact principal including zero interest and final rounding',()=>{
 for(const method of ['fixed_principal','reducing_balance'])for(const rate of [0,4,12,24]){
 const rows=tcScheduleTable(10000001,rate,36,method);
 assert.equal(rows.reduce((s,r)=>s+r.principal,0),10000001);assert.equal(rows.at(-1).balance,0);assert(rows.every(r=>r.total>=0&&r.principal>=0&&r.interest>=0));
 }assert.equal(tcPaymentAtTerm(100,12,12,'fixed_principal',13).total,0);
});
test('yearly rates are never guessed to be monthly',()=>{const d={type:'tc',rate:4};migrateRate(d);assert.equal(d.rate,4);});
test('independent records merge across devices',()=>{
 const base={items:[{id:'a',amount:1}],ticks:{}},local={items:[{id:'a',amount:1},{id:'b',amount:2}],ticks:{}},remote={items:[{id:'a',amount:3}],ticks:{sep:{x:true}}};
 const out=mergeState(base,local,remote);assert.equal(out.items.length,2);assert.equal(out.items[0].amount,3);assert.equal(out.ticks.sep.x,true);
});
test('conflicting edits reject; deletes preserve unrelated records',()=>{
 assert.throws(()=>mergeState({x:1},{x:2},{x:3}));
 assert.deepEqual(mergeState([{id:'a'},{id:'b'}],[{id:'b'}],[{id:'a'},{id:'b'},{id:'c'}]),[{id:'b'},{id:'c'}]);
});
test('HTML is escaped and date uses local calendar',()=>{assert.equal(escapeHTML('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;');assert.equal(localDate(new Date(2026,0,1,0,30)),'2026-01-01');});

test('account ledger carries balances across months and transfers preserve total',()=>{
 const notes=[{id:'cash',name:'Cash',kind:'cash',amount:200,date:'2026-08-01',includedTxnIds:[]},{id:'bank',name:'Bank',kind:'bank',amount:800,date:'2026-08-01',includedTxnIds:[]}];
 const txns={'2026-08':[{id:'a',date:'2026-08-02',type:'out',accountId:'cash',amount:50}],'2026-09':[{id:'b',date:'2026-09-02',type:'in',accountId:'bank',amount:100},{id:'c',date:'2026-09-03',type:'transfer',accountId:'bank',toAccountId:'cash',amount:200}]};
 const s=monthSummary({balanceNotes:notes,txns,currentMonth:'2026-09',today:'2026-09-20'});
 assert.equal(s.balanceTotal,1050);assert.equal(s.accounts[0].amount,350);assert.equal(s.accounts[1].amount,700);assert.equal(s.totalIn,100);assert.equal(s.totalOut,0);
 assert.equal(monthSummary({balanceNotes:notes,txns,currentMonth:'2026-08',today:'2026-09-20'}).balanceTotal,950);
});
test('paying a plan once releases its reserve; unreceived income is not spendable',()=>{
 const state={today:'2026-09-20',currentMonth:'2026-09',balanceNotes:[{id:'a',amount:1000,date:'2026-09-01',name:'Wallet'}],income:[{id:'salary',amount:9000}],expense:[{id:'rent',amount:700}],txns:{}};
 assert.equal(monthSummary(state).available,300);
 state.txns={'2026-09':[{id:'t',type:'out',accountId:'a',planId:'rent',amount:300,date:'2026-09-02'}]};
 let s=monthSummary(state);assert.equal(s.balanceTotal,700);assert.equal(s.remainingExpense,400);assert.equal(s.available,300);
 state.txns['2026-09'][0].amount=800;s=monthSummary(state);assert.equal(s.remainingExpense,0);assert.equal(s.available,200);
 state.txns['2026-09']=[];assert.equal(monthSummary(state).available,300);
});
test('reconciliation includes existing same-day transactions but applies later entries',()=>{
 const notes=[{id:'old',accountId:'a',name:'Wallet',amount:1000,date:'2026-09-01'},{id:'new',accountId:'a',name:'Wallet',amount:750,date:'2026-09-10',includedTxnIds:['paid']}];
 const txns={'2026-09':[{id:'paid',accountId:'a',amount:250,type:'out',date:'2026-09-10'},{id:'new',accountId:'a',amount:50,type:'out',date:'2026-09-10'}]};
 assert.equal(balanceSummary(notes,0,txns,'2026-09-10').total,700);
 txns['2026-09'][1].amount=100;assert.equal(balanceSummary(notes,0,txns,'2026-09-10').total,650);
 txns['2026-09'].pop();assert.equal(balanceSummary(notes,0,txns,'2026-09-10').total,750);
 assert.equal(balanceSummary(notes,0,txns,'2026-09-09').total,1000);
});
test('debt payment releases reserve while reducing the source balance once',()=>{
 const state={today:'2026-09-20',currentMonth:'2026-09',balanceNotes:[{id:'a',name:'Wallet',amount:1000,date:'2026-09-01'}],debts:[{id:'d',monthly:300,type:'td'}]};
 assert.equal(monthSummary(state).available,700);
 state.txns={'2026-09':[{id:'t',debtId:'d',accountId:'a',amount:300,type:'out',date:'2026-09-02'}]};state.ticks={'2026-09':{d:{txnId:'t',amount:300}}};
 const s=monthSummary(state);assert.equal(s.available,700);assert.equal(s.balanceTotal,700);assert.equal(s.totalOut,300);assert.equal(s.unpaidDebt,0);
});
test('future entries are excluded and overspending remains negative',()=>{
 const state={today:'2026-09-20',currentMonth:'2026-09',balanceNotes:[{id:'a',name:'Wallet',amount:100,date:'2026-09-01'}],expense:[{id:'e',amount:200}],txns:{'2026-09':[{id:'future',accountId:'a',type:'in',amount:1000,date:'2026-09-25'}]}};
 const s=monthSummary(state);assert.equal(s.available,-100);assert.equal(s.totalIn,0);assert.equal(s.balanceTotal,100);
});

test('debt ticks, forecast and actual expenses stay aligned without double counting',()=>{
 const state={currentMonth:'2026-09',today:'2026-09-24',income:[],expense:[],debts:[{id:'d',type:'td',monthly:300}],txns:{},ticks:{}};
 let s=monthSummary(state);assert.equal(s.plannedExpense,300);assert.equal(s.reserved,300);assert.equal(s.totalOut,0);
 state.ticks={'2026-09':{d:{amount:300}}};s=monthSummary(state);
 assert.equal(s.plannedExpense,300);assert.equal(s.reserved,0);assert.equal(s.paidPlanned,300);assert.equal(s.totalOut,300);
 state.txns={'2026-09':[{id:'t',type:'out',amount:300,debtId:'d',date:'2026-09-24'}]};
 s=monthSummary(state);assert.equal(s.totalOut,300);assert.equal(s.legacyDebtCount,0);
 state.txns['2026-09'].push({id:'extra',type:'out',amount:50,date:'2026-09-24'});
 s=monthSummary(state);assert.equal(s.totalOut,350);assert.equal(s.reserved,0);assert.equal(s.paidPlanned,300);
});
test('linked debt plans are not reserved twice; unrelated living costs remain due',()=>{
 const state={currentMonth:'2026-09',today:'2026-09-24',debts:[{id:'d',type:'td',monthly:300}],expense:[{id:'mirror',debtId:'d',amount:300},{id:'rent',amount:200}],txns:{},ticks:{}};
 assert.equal(monthSummary(state).reserved,500);
 state.ticks={'2026-09':{d:{amount:300}}};
 const s=monthSummary(state);assert.equal(s.reserved,200);assert.equal(s.plannedExpense,500);assert.equal(s.paidPlanned,300);
 state.txns={'2026-09':[{id:'paid',type:'out',planId:'rent',amount:200,date:'2026-09-24'}]};
 assert.equal(monthSummary(state).reserved,0);assert.equal(monthSummary(state).totalOut,500);
});
test('recurring changes start in the selected month, retain history and repeat next month',()=>{
 let state={income:[],expense:[{id:'rent',name:'Rent',amount:200}],monthlyPlans:{},recurringPlans:{}};
 state={...state,...changePlan(state,'2026-09','expense',{id:'rent',name:'Rent',amount:250},'recurring')};
 assert.equal(plansForMonth(state,'2026-08').expense[0].amount,200);
 assert.equal(plansForMonth(state,'2026-09').expense[0].amount,250);
 assert.equal(plansForMonth(state,'2026-10').expense[0].amount,250);
 state={...state,...changePlan(state,'2026-10','expense',{id:'trip',name:'Trip',amount:100},'month')};
 assert.equal(plansForMonth(state,'2026-10').expense.length,2);
 assert.equal(plansForMonth(state,'2026-11').expense.length,1);
 state={...state,...changePlan(state,'2026-11','expense',{id:'rent'},'recurring',true)};
 assert.equal(plansForMonth(state,'2026-10').expense.length,2);
 assert.equal(plansForMonth(state,'2026-11').expense.length,0);
 assert.equal(plansForMonth(state,'2026-12').expense.length,0);
});
test('legacy monthly overrides are preserved and recurring additions update the selected month',()=>{
 let state={income:[],expense:[{id:'rent',name:'Rent',amount:200}],monthlyPlans:{'2026-09':{income:[],expense:[{id:'rent',name:'Rent',amount:220}]}},recurringPlans:{}};
 state={...state,...changePlan(state,'2026-09','income',{id:'salary',name:'Salary',amount:1000},'recurring')};
 assert.equal(plansForMonth(state,'2026-09').expense[0].amount,220);
 assert.equal(plansForMonth(state,'2026-10').expense[0].amount,200);
 assert.equal(plansForMonth(state,'2026-10').income[0].amount,1000);
});

test('month-only overrides do not block unrelated recurring additions or later edits',()=>{
 let state={income:[],expense:[{id:'rent',amount:200}],monthlyPlans:{},recurringPlans:{}};
 state={...state,...changePlan(state,'2026-10','expense',{id:'trip',amount:100},'month')};
 state={...state,...changePlan(state,'2026-09','expense',{id:'internet',amount:30},'recurring')};
 assert.deepEqual(plansForMonth(state,'2026-10').expense.map(x=>x.id).sort(),['internet','rent','trip']);
 state={...state,...changePlan(state,'2026-09','expense',{id:'rent',amount:250},'recurring')};
 assert.equal(plansForMonth(state,'2026-10').expense.find(x=>x.id==='rent').amount,250);
});
test('recurring edits flow through unrelated future versions, preserving explicit future edits',()=>{
 let state={income:[],expense:[{id:'rent',amount:200}],monthlyPlans:{},recurringPlans:{}};
 state={...state,...changePlan(state,'2026-10','income',{id:'salary',amount:1000},'recurring')};
 state={...state,...changePlan(state,'2026-11','expense',{id:'rent',amount:300},'recurring')};
 state={...state,...changePlan(state,'2026-09','expense',{id:'rent',amount:250},'recurring')};
 assert.equal(plansForMonth(state,'2026-10').expense[0].amount,250);
 assert.equal(plansForMonth(state,'2026-11').expense[0].amount,300);
 assert.equal(plansForMonth(state,'2026-10').income[0].amount,1000);
});

test('deleting a debt does not resurrect its linked recurring expense',()=>{
 const state={currentMonth:'2026-09',today:'2026-09-24',debts:[],expense:[{id:'p',debtId:'deleted',amount:300}]};
 assert.equal(monthSummary(state).reserved,0);assert.equal(monthSummary(state).plannedExpense,0);
});
test('due dates clamp to the last day of the selected month',()=>{
 assert.equal(dueDate('2026-02',31),'2026-02-28');
 assert.equal(dueDate('2028-02',31),'2028-02-29');
 assert.equal(dueDate('2026-10',15),'2026-10-15');
});

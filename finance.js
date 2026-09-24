import { tcGetMonthly, tcGetDebt } from './calc.js';
export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sum = list => list.reduce((total, item) => total + (Number(item.amount) || 0), 0);
export function dueDate(month,day){
 const [year,m]=month.split('-').map(Number),last=new Date(year,m,0).getDate();
 return month+'-'+String(Math.max(1,Math.min(last,Number(day)||1))).padStart(2,'0');
}
export function paymentAmount(debt, mark) {
  return mark && typeof mark === 'object' ? Number(mark.amount) || 0 : debt.type === 'tc' ? tcGetMonthly(debt) : Number(debt.monthly) || 0;
}

export function isLegacySavingEntry(entry) {
  return entry.isSaving === true && String(entry.id||'').startsWith('sv-txn-');
}
export function recordedEntries(entries=[]) { return entries.filter(entry=>!isLegacySavingEntry(entry)); }
export function balanceEntries(balanceNotes, walletBase=0) {
  if(Array.isArray(balanceNotes)) return balanceNotes;
  return Number(walletBase)!==0?[{id:'legacy-wallet',name:'Số dư ban đầu',kind:'other',amount:Number(walletBase),date:'',note:''}]:[];
}
export function accountEntries(balanceNotes,walletBase=0){
  const aliases=new Map();
  return balanceEntries(balanceNotes,walletBase).map(note=>{
    const key=(note.kind||'other')+':'+String(note.name||'').trim().toLocaleLowerCase('vi-VN');
    const accountId=note.accountId||aliases.get(key)||note.id;
    aliases.set(key,accountId);
    return {...note,accountId};
  });
}
export function balanceSummary(balanceNotes,walletBase=0,txns={},asOf=localDate()){
  const latest=new Map();
  for(const note of accountEntries(balanceNotes,walletBase)){
    if(note.date&&note.date>asOf)continue;
    const previous=latest.get(note.accountId);
    if(!previous||(note.date||'')>=(previous.date||''))latest.set(note.accountId,note);
  }
  const entries=recordedEntries(Object.values(txns).flat());
  const accounts=[...latest.values()].map(note=>{
    let amount=Number(note.amount)||0;
    for(const t of entries){
      if(!t.date||t.date>asOf||t.date<(note.date||''))continue;
      if(t.date===note.date&&(!Array.isArray(note.includedTxnIds)||note.includedTxnIds.includes(t.id)))continue;
      if(t.accountId===note.accountId)amount+=(t.type==='in'?1:-1)*(Number(t.amount)||0);
      if(t.type==='transfer'&&t.toAccountId===note.accountId)amount+=Number(t.amount)||0;
    }
    return {...note,openingAmount:note.amount,amount};
  });
  return {accounts,total:sum(accounts),cash:sum(accounts.filter(x=>x.kind==='cash')),bank:sum(accounts.filter(x=>x.kind==='bank'))};
}

export function recurringForMonth({income=[],expense=[],recurringPlans={}},month){
  const key=Object.keys(recurringPlans).filter(k=>k<=month).sort().at(-1);
  return key?recurringPlans[key]:{income,expense};
}
export function plansForMonth(state,month){
  const recurring=recurringForMonth(state,month),override=state.monthlyPlans?.[month];
  const result={};
  for(const mode of ['income','expense']){
    const base=recurring[mode]||[],items=override?.[mode]||[];
    if(!override)result[mode]=base;
    else if(!override.overrides)result[mode]=override[mode]??base;
    else{
      const skip=new Set([...(override.excluded?.[mode]||[]),...items.map(p=>p.id)]);
      result[mode]=[...base.filter(p=>!skip.has(p.id)),...items];
    }
  }
  return result;
}
export function isRecurringPlan(state,mode,item,month){
  const template=recurringForMonth(state,month)[mode]?.find(p=>p.id===item.id);
  return !!template&&['name','amount','note','debtId'].every(k=>(template[k]??'')===(item[k]??''));
}
export function changePlan(state,month,mode,item,scope,remove=false){
  const recurringPlans=structuredClone(state.recurringPlans||{}),monthlyPlans=structuredClone(state.monthlyPlans||{});
  const update=plan=>{
    const next=structuredClone(plan),list=next[mode]||[];
    next[mode]=list.filter(p=>p.id!==item.id);
    if(!remove){const index=list.findIndex(p=>p.id===item.id);next[mode].splice(index<0?next[mode].length:index,0,structuredClone(item));}
    return next;
  };
  const base=recurringForMonth(state,month),resolved=plansForMonth(state,month);
  const override={overrides:true,income:[],expense:[],excluded:{income:[],expense:[]}};
  for(const key of ['income','expense']){
    override[key]=(resolved[key]||[]).filter(p=>!equal(p,(base[key]||[]).find(x=>x.id===p.id)));
    override.excluded[key]=(base[key]||[]).filter(p=>!(resolved[key]||[]).some(x=>x.id===p.id)).map(p=>p.id);
  }
  if(scope==='recurring'){
    recurringPlans[month]=update(base);
    // Carry this edit through later versions until an explicit change to the same item.
    let previous=base;
    for(const key of Object.keys(state.recurringPlans||{}).filter(k=>k>month).sort()){
      const original=state.recurringPlans[key];
      if(!equal((original[mode]||[]).find(p=>p.id===item.id),(previous[mode]||[]).find(p=>p.id===item.id)))break;
      recurringPlans[key]=update(original);previous=original;
    }
    if(monthlyPlans[month]){
      override[mode]=override[mode].filter(p=>p.id!==item.id);
      override.excluded[mode]=override.excluded[mode].filter(id=>id!==item.id);
      monthlyPlans[month]=override;
    }
  }else{
    override[mode]=override[mode].filter(p=>p.id!==item.id);
    override.excluded[mode]=override.excluded[mode].filter(id=>id!==item.id);
    if(remove)override.excluded[mode].push(item.id);else override[mode].push(structuredClone(item));
    monthlyPlans[month]=override;
  }
  return {recurringPlans,monthlyPlans};
}
export function monthlyEntries({txns={},ticks={},debts=[],currentMonth,today=localDate()}){
  const asOf=currentMonth<today.slice(0,7)?currentMonth+'-31':today;
  const entries=recordedEntries(txns[currentMonth]||[]).filter(t=>!t.date||t.date<=asOf);
  const historical=[];
  for(const [id,mark] of Object.entries(ticks[currentMonth]||{})){
    if(!mark||mark.date&&mark.date>asOf)continue;
    const debt=debts.find(d=>d.id===id),amount=mark&&typeof mark==='object'?Number(mark.amount)||0:debt?paymentAmount(debt):0;
    const linked=sum(entries.filter(t=>t.type==='out'&&(t.debtId===id||(mark.txnId&&t.id===mark.txnId))));
    if(amount>linked)historical.push({id:'legacy-debt:'+id,debtId:id,name:'Trả nợ: '+(debt?.name||'Khoản nợ cũ'),amount:amount-linked,type:'out',date:mark.date||'',legacyDebt:true});
  }
  return [...entries,...historical];
}

export function planRemaining(plan,entries,type){
  return Math.max(0,(Number(plan.amount)||0)-sum(entries.filter(t=>t.type===type&&t.planId===plan.id)));
}
export function monthSummary({debts=[],income=[],expense=[],ticks={},txns={},savings=[],balanceNotes=null,walletBase=0,currentMonth,today=localDate()}){
  const month=currentMonth||today.slice(0,7);
  const asOf=month<today.slice(0,7)?month+'-31':today;
  const entries=monthlyEntries({txns,ticks,debts,currentMonth:month,today}),marks=ticks[month]||{};
  const standaloneExpense=expense.filter(p=>!p.debtId);
  const txnIn=sum(entries.filter(t=>t.type==='in')),txnOut=sum(entries.filter(t=>t.type==='out'));
  const fixedIncome=sum(income),fixedExpense=sum(standaloneExpense);
  const paidDebt=Object.entries(marks).reduce((s,[id,mark])=>{const debt=debts.find(d=>d.id===id);return s+(mark&&typeof mark==='object'?(Number(mark.amount)||0):mark&&debt?paymentAmount(debt):0);},0);
  const unpaidDebt=debts.reduce((s,d)=>s+(!d.settled&&!marks[d.id]?paymentAmount(d):0),0);
  const balances=balanceSummary(balanceNotes,walletBase,txns,asOf);
  const remainingExpense=standaloneExpense.reduce((s,p)=>s+planRemaining(p,entries,'out'),0);
  const remainingIncome=income.reduce((s,p)=>s+planRemaining(p,entries,'in'),0);
  const reserved=remainingExpense+unpaidDebt;
  const plannedExpense=fixedExpense+paidDebt+unpaidDebt,paidPlanned=plannedExpense-reserved;
  const unassigned=recordedEntries(Object.values(txns).flat()).filter(t=>(!t.date||t.date<=asOf)&&!t.accountId&&t.type!=='transfer').length;
  return {entries,plannedExpense,paidPlanned,legacyDebtCount:entries.filter(t=>t.legacyDebt).length,txnIn,txnOut,totalIn:txnIn,totalOut:txnOut,net:txnIn-txnOut,fixedIncome,fixedExpense,
    totalDebtPay:paidDebt+unpaidDebt,paidDebt,unpaidDebt,remainingExpense,remainingIncome,reserved,
    available:balances.total-reserved,accounts:balances.accounts,unassigned,
    balanceTotal:balances.total,savingTotal:sum(savings),
    debtLeft:debts.filter(d=>!d.settled).reduce((s,d)=>s+(d.type==='tc'?tcGetDebt(d):Number(d.used)||0),0)};
}
// Merge independent changes, reject competing edits instead of overwriting.
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
export function mergeState(base, local, remote, path='') {
  if(equal(local,base)) return remote;
  if(equal(remote,base) || equal(local,remote)) return local;
  if([base,local,remote].every(Array.isArray) && [base,local,remote].every(a=>a.every(x=>x && typeof x.id==='string'))) {
    const maps=[base,local,remote].map(a=>Object.fromEntries(a.map(x=>[x.id,x])));
    const merged=mergeState(...maps,path);
    return [...new Set([...local.map(x=>x.id),...remote.map(x=>x.id)])].filter(id=>merged[id]!==undefined).map(id=>merged[id]);
  }
  const object = x => x && typeof x==='object' && !Array.isArray(x);
  if(object(local) && object(remote) && (object(base) || base===undefined)) {
    const result={};
    for(const key of new Set([...Object.keys(base||{}),...Object.keys(local),...Object.keys(remote)])) {
      const value=mergeState(base?.[key],local[key],remote[key],path+'.'+key);
      if(value!==undefined) result[key]=value;
    }
    return result;
  }
  throw new Error('Dữ liệu vừa thay đổi trên thiết bị khác. Đã tải bản mới; vui lòng thực hiện lại.');
}

import { paymentAmount } from './finance.js';

function resolvePlanDebt(plan,debts,ticks) {
 const name=String(plan.name||'').trim().toLocaleLowerCase('vi-VN').replace(/\s+/g,' ');
 const matches=debts.filter(d=>{
  const amounts=[paymentAmount(d),...Object.values(ticks).filter(m=>m[d.id]).map(m=>paymentAmount(d,m[d.id]))];
  return d.id===plan.id||(name&&String(d.name||'').trim().toLocaleLowerCase('vi-VN').replace(/\s+/g,' ')===name&&amounts.includes(Number(plan.amount)));
 });
 return matches.length===1?matches[0].id:'';
}
// Adapt stored records once at the data boundary. Screens use one ledger model.
export function normalizeData(input) {
 const data=structuredClone(input);
 data.debts ||= []; data.txns ||= {}; data.ticks ||= {}; data.savings ||= [];
 for(const d of data.debts){
  if(d.type==='tc'&&d.note&&!d.rate){const m=d.note.match(/^Kỳ\s*(\d+)\/(\d+)$/);if(m){d.curTerm=Number(m[1]);d.totalTerm=Number(m[2]);d.note='';}}
  if(d.type==='tc'&&!d.principal&&d.debt)d.principal=d.debt;
  if(d.type==='td'&&!d.used&&d.debt){d.used=d.debt;d.limit=d.limit||d.debt*2;}
  if(d.type==='td'&&d.monthly==null)d.monthly=d.used||0;
 }
 // Persist unambiguous duplicate-plan links so advancing a loan term cannot recreate a reserve.
 for(const plan of [data,...Object.values(data.monthlyPlans||{}),...Object.values(data.recurringPlans||{})]){
  for(const item of plan.expense||[]){
   if(!item.debtId&&!Object.values(data.txns).flat().some(t=>t.planId===item.id)){
    const id=resolvePlanDebt(item,data.debts,data.ticks);if(id)item.debtId=id;
   }
  }
 }
 data.balanceNotes=Array.isArray(data.balanceNotes)?data.balanceNotes:Number(data.walletBase)?[{id:'legacy-wallet',name:'Số dư ban đầu',kind:'other',amount:Number(data.walletBase),date:'',note:''}]:[]; data.walletBase=0;
 for(const [month,entries] of Object.entries(data.txns)){
  data.txns[month]=entries.filter(t=>{
   if(!(t.isSaving===true&&String(t.id||'').startsWith('sv-txn-')))return true;
   const id=t.id.slice('sv-txn-'.length);
   if(!data.savings.some(s=>s.id===id))data.savings.push({id,name:t.name,amount:t.amount,date:t.date||''});
   return false;
  });
 }
 for(const [month,marks] of Object.entries(data.ticks)){
  for(const [id,raw] of Object.entries(marks)){
   if(!raw)continue;
   const debt=data.debts.find(d=>d.id===id);
   const mark=typeof raw==='object'?raw:{amount:debt?paymentAmount(debt):0};
   const entries=data.txns[month] ||= [];
   const linked=entries.filter(t=>t.type==='out'&&(t.debtId===id||(mark.txnId&&t.id===mark.txnId)));
   for(const t of linked)t.debtId=id;
   const missing=Math.max(0,(Number(mark.amount)||0)-linked.reduce((n,t)=>n+Number(t.amount||0),0));
   if(missing)entries.push({id:'payment-'+month+'-'+id,debtId:id,name:'Trả nợ: '+(debt?.name||'Khoản nợ'),type:'out',amount:missing,date:mark.date||'',accountId:''});
   if(!mark.txnId)mark.txnId=entries.find(t=>t.debtId===id)?.id||'';
   marks[id]=mark;
  }
 }
 return data;
}

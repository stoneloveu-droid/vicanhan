import {dueDate,localDate,plansForMonth,planRemaining,isDebtActive,paymentAmount} from './finance.js';
import {tcCurrentPayment} from './calc.js';
export function scheduleKey(month,kind,id){return month+'|'+kind+'|'+id;}
export function applySchedule(input,today=localDate()){
 const s=structuredClone(input),current=today.slice(0,7);
 s.automation ||= {enabled:true,fromMonth:current,skips:{}};
 if(!s.automation.enabled)return s;
 s.automation.fromMonth ||= current;s.automation.skips ||= {};
 s.txns ||= {};s.ticks ||= {};
 backfillDebtHistory(s,current);
 let month=s.automation.fromMonth;
 for(let i=0;month<=current&&i<1200;i++){
  const entries=s.txns[month] ||= [],marks=s.ticks[month] ||= {},plans=plansForMonth(s,month);
  for(const mode of ['income','expense'])for(const p of plans[mode]){
   const key=scheduleKey(month,mode,p.id),date=dueDate(month,p.payDay||1),type=mode==='income'?'in':'out';
   if(p.debtId||date>today||p.startMonth&&p.startMonth>month||s.automation.skips[key]||entries.some(t=>t.scheduleKey===key))continue;
   const amount=planRemaining(p,entries,type);
   if(amount>0)entries.push({id:'scheduled-'+key,scheduleKey:key,automatic:true,planId:p.id,name:p.name,amount,type,date,accountId:'main'});
  }
  for(const d of s.debts||[]){
   const key=scheduleKey(month,'debt',d.id),date=dueDate(month,d.payDay||1);
   if(date>today||marks[d.id]||d.settled||!isDebtActive(d,month)||d.startMonth&&d.startMonth>month||(month===current&&s.automation.skips[key]))continue;
   const amount=paymentAmount(d);if(!(amount>0))continue;
   const previousTerm=Number(d.curTerm)||0,payment=d.type==='tc'?tcCurrentPayment(d):{principal:0,interest:0};
   const id='scheduled-'+key;
   entries.push({id,scheduleKey:key,automatic:true,debtId:d.id,name:'Trả nợ: '+d.name,amount,type:'out',date,accountId:'main'});
   marks[d.id]={txnId:id,amount,date,previousTerm,advanced:d.type==='tc',principal:payment.principal,interest:payment.interest};
   if(d.type==='tc'){d.curTerm=Math.min(previousTerm+1,d.totalTerm);d.settled=d.curTerm>=d.totalTerm;}
  }
  const [y,m]=month.split('-').map(Number);month=m===12?(y+1)+'-01':y+'-'+String(m+1).padStart(2,'0');
 }
 s.automation.debtHistoryVersion=2;
 s.automation.lastRun=today;
 return s;
}

function shiftMonth(month,offset){const [y,m]=month.split('-').map(Number);const d=new Date(y,m-1+offset,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
function backfillDebtHistory(s,current){
 const cutoff=s.automation.fromMonth<current?s.automation.fromMonth:current;
 for(const d of s.debts||[]){
  const marks=Object.values(s.ticks).map(m=>m[d.id]).filter(Boolean);
  // curTerm includes periods entered in Settings, even when no ledger rows exist.
  let credited=Math.max(0,(Number(d.curTerm)||0)-marks.filter(m=>m.advanced).length);
  const known=Object.keys(s.ticks).filter(m=>s.ticks[m][d.id]).concat(Object.keys(s.txns).filter(m=>s.txns[m].some(t=>t.debtId===d.id)));
  const candidates=[d.disburseDate?.slice(0,7),d.startMonth,...known].filter(m=>/^\d{4}-(0[1-9]|1[0-2])$/.test(m||''));
  const start=candidates.sort()[0]||(credited?shiftMonth(cutoff,-credited):cutoff);
  let historicalTerm=0;
  for(let month=start,i=0;month<cutoff&&i<1200;month=shiftMonth(month,1),i++){
   if(!isDebtActive({...d,startMonth:start},month))continue;
   const entries=s.txns[month] ||= [],ticks=s.ticks[month] ||= {};
   if(ticks[d.id]){historicalTerm++;continue;}
   const covered=d.type==='tc'&&credited>0;
   if(d.settled&&!covered)continue;
   const basis=covered?{...d,curTerm:historicalTerm,settled:false}:d;
   const amount=paymentAmount(basis);if(!(amount>0))continue;
   const linked=entries.find(t=>t.debtId===d.id&&t.type==='out');
   const key=scheduleKey(month,'debt',d.id),date=dueDate(month,d.payDay||1),id=linked?.id||'scheduled-'+key;
   const payment=d.type==='tc'?tcCurrentPayment(basis):{principal:0,interest:0};
   if(!linked)entries.push({id,scheduleKey:key,automatic:true,estimated:true,debtId:d.id,name:'Trả nợ: '+d.name,amount,type:'out',date,accountId:covered?'':'main'});
   ticks[d.id]={estimated:!linked,txnId:id,amount:linked?Number(linked.amount):amount,date:linked?.date||date,previousTerm:Number(basis.curTerm)||0,advanced:d.type==='tc',principal:payment.principal,interest:payment.interest};
   if(covered)credited--;
   else if(d.type==='tc'){d.curTerm=Math.min((Number(d.curTerm)||0)+1,d.totalTerm);d.settled=d.curTerm>=d.totalTerm;}
   historicalTerm++;
  }
 }
}

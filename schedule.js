import {dueDate,localDate,plansForMonth,planRemaining,isDebtActive,paymentAmount} from './finance.js';
import {tcCurrentPayment} from './calc.js';
export function scheduleKey(month,kind,id){return month+'|'+kind+'|'+id;}
export function applySchedule(input,today=localDate()){
 const s=structuredClone(input),current=today.slice(0,7);
 s.automation ||= {enabled:true,fromMonth:current,skips:{}};
 if(!s.automation.enabled)return s;
 s.automation.fromMonth ||= current;s.automation.skips ||= {};
 s.txns ||= {};s.ticks ||= {};
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
   if(date>today||marks[d.id]||d.settled||!isDebtActive(d,month)||d.startMonth&&d.startMonth>month||s.automation.skips[key])continue;
   const amount=paymentAmount(d);if(!(amount>0))continue;
   const previousTerm=Number(d.curTerm)||0,payment=d.type==='tc'?tcCurrentPayment(d):{principal:0,interest:0};
   const id='scheduled-'+key;
   entries.push({id,scheduleKey:key,automatic:true,debtId:d.id,name:'Trả nợ: '+d.name,amount,type:'out',date,accountId:'main'});
   marks[d.id]={txnId:id,amount,date,previousTerm,advanced:d.type==='tc',principal:payment.principal,interest:payment.interest};
   if(d.type==='tc'){d.curTerm=Math.min(previousTerm+1,d.totalTerm);d.settled=d.curTerm>=d.totalTerm;}
  }
  const [y,m]=month.split('-').map(Number);month=m===12?(y+1)+'-01':y+'-'+String(m+1).padStart(2,'0');
 }
 s.automation.lastRun=today;
 return s;
}

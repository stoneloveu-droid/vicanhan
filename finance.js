import { tcGetMonthly, tcGetDebt } from './calc.js';
export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sum = list => list.reduce((total, item) => total + (Number(item.amount) || 0), 0);
export function paymentAmount(debt, mark) {
  return mark && typeof mark === 'object' ? Number(mark.amount) || 0 : debt.type === 'tc' ? tcGetMonthly(debt) : Number(debt.monthly) || 0;
}
export function monthSummary({ debts=[], income=[], expense=[], ticks={}, txns={}, walletBase=0, currentMonth }) {
  const entries = txns[currentMonth] || [], marks = ticks[currentMonth] || {};
  const txnIn = sum(entries.filter(t => t.type === 'in')), txnOut = sum(entries.filter(t => t.type === 'out'));
  const fixedIncome = sum(income), fixedExpense = sum(expense);
  const totalIn = fixedIncome + txnIn, totalOut = fixedExpense + txnOut;
  const paidDebt = Object.entries(marks).reduce((s,[id,mark])=>{const debt=debts.find(d=>d.id===id);return s+(mark&&typeof mark==='object'?(Number(mark.amount)||0):mark&&debt?paymentAmount(debt):0);},0);
  const totalDebtPay = paidDebt + debts.reduce((s,d)=>s+(!d.settled&&!marks[d.id]?paymentAmount(d):0),0);
  const wallet = Number(walletBase || 0) + totalIn - totalOut - paidDebt;
  return { txnIn, txnOut, fixedIncome, fixedExpense, totalIn, totalOut, totalDebtPay, paidDebt,
    unpaidDebt: totalDebtPay-paidDebt, wallet, available: wallet-(totalDebtPay-paidDebt),
    debtLeft: debts.filter(d=>!d.settled).reduce((s,d)=>s+(d.type==='tc'?tcGetDebt(d):Number(d.used)||0),0) };
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

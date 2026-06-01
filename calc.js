// ── FORMAT MONEY ─────────────────────────────────────────────
export function fmt(n){
  n=Math.round(Number(n)||0);
  return n.toLocaleString('vi-VN')+'đ';
}
export function fmtNoUnit(n){
  n=Math.round(Number(n)||0);
  return n.toLocaleString('vi-VN');
}
// Format input khi gõ: tự thêm dấu chấm
export function fmtInput(el){
  const raw=el.value.replace(/\./g,'').replace(/[^0-9]/g,'');
  const num=parseInt(raw)||0;
  el.value=num?fmtNoUnit(num):'';
  el.dataset.raw=num;
}
export function getInputVal(id){
  const el=document.getElementById(id);
  if(!el) return 0;
  if(el.dataset.raw!==undefined && el.dataset.raw!=='') return Number(el.dataset.raw);
  return Number(el.value.replace(/\./g,''))||0;
}
export function setInputFmt(id,val){
  const el=document.getElementById(id);
  if(!el) return;
  const n=Math.round(Number(val)||0);
  el.value=n?fmtNoUnit(n):'';
  el.dataset.raw=n;
}
export function getML(k){
  const[y,m]=k.split('-');
  return `T${parseInt(m)}/${y}`;
}

// ── TC LOAN MATH ──────────────────────────────────────────────
// PMT: tính khoản trả đều hàng tháng
export function tcCalc(principal, ratePerMonth, totalTerm){
  const r=ratePerMonth/100;
  if(!r||!totalTerm) return {monthly:0,totalInterest:0};
  const pmt=principal*r*Math.pow(1+r,totalTerm)/(Math.pow(1+r,totalTerm)-1);
  return {monthly:Math.round(pmt), totalInterest:Math.round(pmt*totalTerm-principal)};
}
// Tính dư nợ sau k kỳ đã trả
export function tcBalance(principal, ratePerMonth, totalTerm, paidTerms){
  const r=ratePerMonth/100;
  if(!r||!totalTerm) return Math.max(0, principal-principal/totalTerm*paidTerms);
  const pmt=principal*r*Math.pow(1+r,totalTerm)/(Math.pow(1+r,totalTerm)-1);
  const balance=principal*Math.pow(1+r,paidTerms)-pmt*(Math.pow(1+r,paidTerms)-1)/r;
  return Math.max(0,Math.round(balance));
}
// Helper lấy monthly/debt từ object debt TC
export function tcGetMonthly(d){
  return tcCalc(d.principal||0, d.rate||0, d.totalTerm||0).monthly;
}
export function tcGetDebt(d){
  return tcBalance(d.principal||0, d.rate||0, d.totalTerm||0, d.curTerm||0);
}

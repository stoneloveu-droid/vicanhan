// ── FORMAT MONEY ─────────────────────────────────────────────
export function fmt(n){
  n=Math.round(Number(n)||0);
  return n.toLocaleString('vi-VN')+'đ';
}
export function fmtNoUnit(n){
  n=Math.round(Number(n)||0);
  return n.toLocaleString('vi-VN');
}
export function getML(k){
  const[y,m]=k.split('-');
  return `T${parseInt(m)}/${y}`;
}

// ── TC LOAN MATH ──────────────────────────────────────────────
export function tcCalc(principal, ratePerMonth, totalTerm){
  const r=ratePerMonth/100;
  if(!r||!totalTerm) return {monthly:0,totalInterest:0};
  const pmt=principal*r*Math.pow(1+r,totalTerm)/(Math.pow(1+r,totalTerm)-1);
  return {monthly:Math.round(pmt), totalInterest:Math.round(pmt*totalTerm-principal)};
}
export function tcBalance(principal, ratePerMonth, totalTerm, paidTerms){
  const r=ratePerMonth/100;
  if(!r||!totalTerm) return Math.max(0, principal-principal/totalTerm*paidTerms);
  const pmt=principal*r*Math.pow(1+r,totalTerm)/(Math.pow(1+r,totalTerm)-1);
  const balance=principal*Math.pow(1+r,paidTerms)-pmt*(Math.pow(1+r,paidTerms)-1)/r;
  return Math.max(0,Math.round(balance));
}
export function tcGetMonthly(d){
  return tcCalc(d.principal||0, d.rate||0, d.totalTerm||0).monthly;
}
export function tcGetDebt(d){
  return tcBalance(d.principal||0, d.rate||0, d.totalTerm||0, d.curTerm||0);
}

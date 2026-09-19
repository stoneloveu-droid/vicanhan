
import { fmt } from './calc.js';
import { balanceEntries,balanceSummary } from './finance.js';
const dateLabel=date=>date?new Date(date+'T12:00:00').toLocaleDateString('vi-VN'):'Chưa cập nhật ngày';
export function renderBalanceBook(notes,walletBase,hidden=false,txns={},asOf,computedAccounts){
  const summary=balanceSummary(notes,walletBase,txns,asOf);
  for(const [id,items] of [['balance-accounts',computedAccounts||summary.accounts],['balance-history',balanceEntries(notes,walletBase).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''))]]){
    const list=document.getElementById(id);if(!list)continue;list.replaceChildren();
    if(!items.length){const empty=document.createElement('p');empty.className='notebook-hint';empty.textContent='Thêm số dư tiền mặt hoặc tài khoản ngân hàng để bắt đầu.';list.appendChild(empty);continue;}
    for(const entry of items){
      const row=document.createElement('button');row.className='balance-note-row';row.type='button';row.onclick=()=>id==='balance-accounts'?window.reconcileAccount(entry.accountId):window.openBalanceNote(entry.id);
      const info=document.createElement('span'),name=document.createElement('b'),detail=document.createElement('small'),amount=document.createElement('strong');
      name.textContent=entry.name;
      detail.textContent=(entry.kind==='bank'?'Ngân hàng':entry.kind==='cash'?'Tiền mặt':'Khác')+' · '+dateLabel(entry.date);
      amount.textContent=hidden?'••••••':fmt(entry.amount);
      info.append(name,detail);
      if(id==='balance-history'&&entry.note){const note=document.createElement('small');note.textContent=entry.note;info.appendChild(note);}
      row.append(info,amount);list.appendChild(row);
    }
  }
}

import { renderBalanceBook } from './notebook-ui.js';
import { isDebtActive, dueDate, isRecurringPlan, monthlyEntries, planRemaining, monthSummary, paymentAmount, escapeHTML, balanceEntries, recordedEntries, localDate } from './finance.js';
// ── render.js ─────────────────────────────────────────────────
// Tất cả hàm render UI: home, paid, cards, txn, settings,
// tools, report, charts
// Nhận state qua tham số — không giữ state nội bộ
// ─────────────────────────────────────────────────────────────

import { fmt, fmtNoUnit, getML,
         tcGetMonthly, tcGetDebt, tcCurrentPayment, tcTotalInterest } from "./calc.js";
import { setInputFmt, showToast, setTheme } from "./ui-utils.js";

// ── SECTION / CARD HELPERS ────────────────────────────────────
function addSec(list,txt){
  const h=document.createElement('div');h.className='slabel';h.textContent=txt;list.appendChild(h);
  const w=document.createElement('div');w.className='cards';list.appendChild(w);
}
function lastWrap(list){const ws=list.querySelectorAll('.cards');return ws[ws.length-1];}
let showSettledCards=false;

function debtMeta(d){
  if(d.type==='tc'){
    const kStr=d.totalTerm?`Kỳ ${d.curTerm||0}/${d.totalTerm} · `:'';
    return `${kStr}Ngày ${d.payDay||'—'}`;
  }
  return `${escapeHTML(d.note||'')} · Ngày ${d.payDay||'—'}`;
}

// Bank color/abbr maps
const BANK_COLORS={'tp':'#B91C1C','ocb':'#D97706','vp-td':'#0369A1','shin-td':'#7C3AED',
  'vp-tc':'#0369A1','shin-tc':'#7C3AED','hsbc':'#B91C1C','vib1':'#059669','vib2':'#059669'};
const BANK_ABBR={'tp':'TP','ocb':'OCB','vp-td':'VP','shin-td':'SH','vp-tc':'VP','shin-tc':'SH','hsbc':'HS','vib1':'VIB','vib2':'VIB'};

export function addCard2(wrap,d,ms,currentMonth){
  const paid=!!ms[d.id], settled=!!d.settled;
  const monthly=paymentAmount(d,ms[d.id]);
  const bg=BANK_COLORS[d.id]||'#374151';
  const abbr=escapeHTML(BANK_ABBR[d.id]||(d.name.slice(0,2).toUpperCase()));

  let sub='';
  if(d.type==='tc'&&d.totalTerm){
    const pct=Math.round((d.curTerm||0)/d.totalTerm*100);
    const remTerms=d.totalTerm-(d.curTerm||0);
    const endDate=new Date();endDate.setMonth(endDate.getMonth()+remTerms);
    const endStr=endDate.toLocaleDateString('vi-VN',{month:'numeric',year:'numeric'});
    const rateLbl=d.rate?`${d.rate}%/năm · `:'';
    sub=`${rateLbl}Kỳ ${d.curTerm||0}/${d.totalTerm} · Kết thúc ${endStr}`;
  } else if(d.type==='td'){
    const used=Number(d.used||0);
    const m=Number(d.monthly||0);
    const feePct=used>0?Math.round(m/used*100*10)/10:0;
    const feeLbl=feePct>0?`Trả ${feePct}% dư nợ · `:'';
    const _today=new Date().getDate();
    const _daysLeft=d.payDay?Math.round((new Date(dueDate(currentMonth,d.payDay)+'T12:00:00')-new Date(localDate()+'T12:00:00'))/86400000):null;
    let _dueLbl='';
    if(_daysLeft!==null){
      if(_daysLeft<0)       _dueLbl=`<span style="color:var(--red);font-weight:900"> · ⚠️ Quá hạn ${Math.abs(_daysLeft)} ngày</span>`;
      else if(_daysLeft===0)_dueLbl=`<span style="color:var(--red);font-weight:900"> · 🔴 Đến hạn HÔM NAY</span>`;
      else if(_daysLeft<=3) _dueLbl=`<span style="color:var(--orange);font-weight:900"> · ⏰ Còn ${_daysLeft} ngày</span>`;
      else                  _dueLbl=`<span style="color:var(--sub)"> · Ngày ${d.payDay}</span>`;
    }
    if(paid) _dueLbl='<span style="color:var(--teal)">Đã trả kỳ này</span>';
    sub=`${feeLbl}${_dueLbl}${d.note?` · ${escapeHTML(d.note)}`:''}`;
  } else {
    sub=`${escapeHTML(d.note||'')} · Ngày ${d.payDay||'—'}`;
  }

  let usageBarHTML='';
  if(d.type==='td'&&d.limit){
    const used=Number(d.used||0), limit=Number(d.limit);
    const usedPct=limit?Math.min(100,Math.round(used/limit*100)):0;
    const barColor=usedPct>80?'var(--red)':usedPct>60?'var(--orange)':'var(--accent)';
    const monthly=Number(d.monthly||0);
    const feePct=used>0?Math.round(monthly/used*100*10)/10:0;
    usageBarHTML=`<div class="td-usage">
      <div class="td-usage-track"><div class="td-usage-fill" style="width:${usedPct}%;background:${barColor}"></div></div>
      <div class="td-usage-labels"><span>Đã dùng ${fmt(used)} (${usedPct}%)</span><span>Còn ${fmt(Math.max(0,limit-used))}</span></div>
      ${feePct>0?`<div class="td-settle-fee">Thanh toán tháng: ${fmt(monthly)} <span style="color:var(--orange);font-weight:800">(${feePct}% dư nợ)</span></div>`:''}
    </div>`;
  }

  let detailGrid='';
  if(d.type==='tc'){
    const cp=tcCurrentPayment(d);
    detailGrid=`<div class="dd-grid">
      <div class="dd-i"><label>Dư nợ</label><p>${fmt(tcGetDebt(d))}</p></div>
      <div class="dd-i"><label>Lãi/tháng</label><p style="color:var(--orange)">${fmt(cp.interest)}</p></div>
      <div class="dd-i"><label>Trả gốc</label><p style="color:var(--teal)">${fmt(cp.principal)}</p></div>
    </div>`;
  } else {
    const avail=Math.max(0,(d.limit||0)-(d.used||0));
    detailGrid=`<div class="dd-grid">
      <div class="dd-i"><label>Hạn mức</label><p>${fmt(d.limit||0)}</p></div>
      <div class="dd-i"><label>Đã dùng</label><p style="color:var(--orange)">${fmt(d.used||0)}</p></div>
      <div class="dd-i"><label>Còn lại</label><p style="color:var(--accent)">${fmt(avail)}</p></div>
    </div>`;
  }

  const div=document.createElement('div');
  div.className='dcard'+(paid?' paid':'')+(settled?' settled':'');
  div.id='dc-'+d.id;
  div.dataset.debtId=d.id;
  div.innerHTML=`
    <div class="dcard-top" onclick="tapTop('${d.id}')">
      <div class="bank-ico" style="background:${bg}">${abbr}</div>
      <div class="d-info">
        <div class="d-name">${escapeHTML(d.name)}${settled?'<span class="settled-tag">Tất toán</span>':''}</div>
        <div class="d-sub">${sub}</div>
      </div>
      <div class="d-right">
        <div class="d-amt ${d.type}">${fmt(monthly)}</div>
        <div class="d-unit">/ tháng</div>
      </div>
      <button class="chk${paid?' checked':''}" id="cb-${d.id}" ${settled&&!paid?'disabled':''} aria-label="${paid?'Hoàn tác thanh toán':'Đánh dấu đã trả'}"
        onclick="event.stopPropagation();tapCheck('${d.id}')">✓</button>
    </div>
    <div class="dcard-detail" id="dd-${d.id}">
      ${detailGrid}
      ${usageBarHTML}
    </div>`;
  wrap.appendChild(div);
}

// ── RENDER HOME ───────────────────────────────────────────────

export function renderHome(state){
  const {currentMonth,walletHidden}=state,summary=monthSummary(state);
  const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value;};
  set('sub-date',new Date().toLocaleDateString('vi-VN',{weekday:'long',day:'numeric',month:'numeric'}));
  set('month-label',getML(currentMonth));
  set('dashboard-month-label','Thu chi · '+getML(currentMonth));
  const progress=summary.plannedExpense>0?Math.min(100,Math.round(summary.paidPlanned/summary.plannedExpense*100)):0;
  const track=document.getElementById('budget-progress');
  if(track){track.hidden=walletHidden;track.setAttribute('aria-valuenow',String(progress));}
  const fill=document.getElementById('budget-progress-fill');if(fill)fill.style.width=progress+'%';
  const noticeBox=document.getElementById('dashboard-notice');if(noticeBox)noticeBox.hidden=!summary.unassigned;

  set('kpi-wallet',walletHidden?'••••••':summary.accounts.length?fmt(summary.available):'Chưa có số dư');
  set('available-amount',walletHidden?'••••••':fmt(summary.reserved));
  set('available-detail',walletHidden?'Sinh hoạt và trả nợ':'Sinh hoạt '+fmt(summary.remainingExpense)+' · Nợ '+fmt(summary.unpaidDebt));
  set('hero-planned',walletHidden?'••••••':fmt(summary.plannedExpense));
  set('hero-paid-planned',walletHidden?'••••••':fmt(summary.paidPlanned));
  set('hero-balance',walletHidden?'••••••':fmt(summary.balanceTotal));
  const remainingList=document.getElementById('remaining-items');
  if(remainingList){
    remainingList.replaceChildren();
    const rows=[
      ...state.expense.filter(p=>!p.debtId).map(p=>({name:p.name,amount:planRemaining(p,summary.entries,'out'),page:'monthly'})),
      ...state.debts.filter(d=>isDebtActive(d,currentMonth)&&!d.settled&&!state.ticks[currentMonth]?.[d.id]).map(d=>({name:d.name,amount:paymentAmount(d),page:'paid'}))
    ].filter(x=>x.amount>0);
    for(const item of rows){const b=document.createElement('button');b.className='remaining-row';b.onclick=()=>window.switchPage(item.page);const n=document.createElement('span'),a=document.createElement('strong');n.textContent=item.name;a.textContent=walletHidden?'••••••':fmt(item.amount);b.append(n,a);remainingList.appendChild(b);}
    if(!rows.length)remainingList.textContent='Đã thanh toán đủ các khoản dự chi.';
  }
  set('hero-reserved',walletHidden?'••••••':fmt(summary.reserved));
  set('wallet-status',!summary.accounts.length?'Thêm số dư tài khoản để bắt đầu.':summary.available<0?'Thiếu tiền theo các khoản chưa thanh toán đã nhập.':summary.available===0?'Số dư hiện đủ cho các khoản chưa thanh toán.':'Theo số dư và các khoản chưa thanh toán bạn đã nhập.');
  document.getElementById('kpi-wallet').style.color=summary.available<0?'var(--red)':'';
  const notice=document.getElementById('unassigned-notice');
  if(notice){notice.hidden=!summary.unassigned;notice.textContent=summary.unassigned+' giao dịch chưa chọn tài khoản. Mở Thu chi để bổ sung.';}
  set('hero-breakdown',walletHidden?'Xem các khoản còn phải chi':'Chưa trả: Nợ '+fmt(summary.unpaidDebt)+' · Chi khác '+fmt(summary.remainingExpense));
  set('home-saving-notes',walletHidden?'••••••':fmt(summary.savingTotal));
  set('home-debt-left',walletHidden?'••••••':fmt(summary.debtLeft));set('home-unpaid',walletHidden?'••••••':fmt(summary.unpaidDebt));
  set('kpi-income-mini',walletHidden?'••••••':fmt(summary.totalIn));set('kpi-expense-mini',walletHidden?'••••••':fmt(summary.totalOut));
  set('kpi-debt-pay-mini',walletHidden?'••••••':fmt(summary.unpaidDebt));
  set('kpi-income',fmt(summary.totalIn));set('kpi-expense',fmt(summary.totalOut));
  set('kpi-debt-pay',fmt(summary.totalDebtPay));set('kpi-remain',fmt(summary.net));
  renderBalanceBook(state.balanceNotes,state.walletBase,walletHidden,state.txns,undefined,summary.accounts);
  const banner=document.getElementById('past-month-banner-home');
  if(banner)banner.style.display=currentMonth!==localDate().slice(0,7)?'block':'none';
}
// ── RENDER PAID ───────────────────────────────────────────────
export function renderPaid(state){
 const {debts,ticks,currentMonth,currentFilter}=state;
 const summary=monthSummary(state);
  const el=id=>document.getElementById(id);
  if(el('paid-month-label')) el('paid-month-label').textContent=getML(currentMonth);

  const ms=ticks[currentMonth]||{};
  const activeDebts=debts.filter(d=>!d.settled||ms[d.id]);
  const totalPay=summary.totalDebtPay;
  const paidAmt=summary.paidDebt;
  const pct=totalPay?Math.round(paidAmt/totalPay*100):0;

  if(el('prog-pct')) el('prog-pct').textContent=pct+'%';
 if(el('circ-fill')) el('circ-fill').style.strokeDashoffset=201*(1-pct/100);
 if(el('prog-paid-amt')) el('prog-paid-amt').textContent=fmt(paidAmt);
 if(el('prog-total-amt')) el('prog-total-amt').textContent=fmt(totalPay);
 if(el('kpi-debt-total')) el('kpi-debt-total').textContent=fmt(summary.debtLeft);
 if(el('debt-month-label')) el('debt-month-label').textContent=getML(currentMonth);
 if(el('ps-total-debt')) el('ps-total-debt').textContent=fmt(totalPay);
  if(el('ps-paid'))       el('ps-paid').textContent=fmt(paidAmt);
  if(el('ps-unpaid-amt')) el('ps-unpaid-amt').textContent=fmt(totalPay-paidAmt);
  if(el('debt-prog-fill')) el('debt-prog-fill').style.width=pct+'%';
  if(el('debt-prog-pct'))  el('debt-prog-pct').textContent=pct+'%';

  const unpaidCount=activeDebts.filter(d=>!ms[d.id]).length;
  const paidCount  =activeDebts.filter(d=>ms[d.id]).length;
  if(el('badge-all'))     el('badge-all').textContent=activeDebts.length;
  if(el('badge-unpaid')) el('badge-unpaid').textContent=unpaidCount;
  if(el('badge-paid2'))  el('badge-paid2').textContent=paidCount;

  renderCards({debts, ticks, currentMonth, currentFilter});
}

export function renderCards({debts, ticks, currentMonth, currentFilter}){
  const list=document.getElementById('card-list');
  if(!list) return;
  list.innerHTML='';
  const ms=ticks[currentMonth]||{};
  const activeDebts=debts.filter(d=>!d.settled||ms[d.id]);
  const settledDebts=debts.filter(d=>d.settled&&!ms[d.id]);
  let show=activeDebts;
  if(currentFilter==='unpaid') show=activeDebts.filter(d=>!ms[d.id]);
  if(currentFilter==='paid2')  show=activeDebts.filter(d=>!!ms[d.id]);
  if(currentFilter==='td')     show=activeDebts.filter(d=>d.type==='td');
  if(currentFilter==='tc')     show=activeDebts.filter(d=>d.type==='tc');
  const td=show.filter(d=>d.type==='td');
  const tc=show.filter(d=>d.type==='tc');
  if(!debts.length){
    list.innerHTML=`<div class="empty-card">
      <div class="empty-ico">🏦</div>
      <div class="empty-title">Chưa có khoản nợ nào</div>
      <div class="empty-sub">Thêm thẻ tín dụng hoặc khoản vay trong Danh mục tài chính</div>
      <button onclick="switchPage('settings')">Mở Cài đặt</button>
    </div>`;
    return;
  }
  if(!show.length&&!settledDebts.length){list.innerHTML='<div class="empty">✅ Tất cả đã xong!</div>';return;}
  const addSection=(title,items)=>{
    const lbl=document.createElement('div');lbl.className='slabel';lbl.textContent=title;list.appendChild(lbl);
    const wrap=document.createElement('div');wrap.className='cards-wrap';list.appendChild(wrap);
    items.forEach(d=>addCard2(wrap,d,ms,currentMonth));
  };
  if(td.length) addSection('💳 Thẻ Tín Dụng',td);
  if(tc.length) addSection('💰 Vay Tín Chấp',tc);
  if(settledDebts.length){
    const tog=document.createElement('div');
    tog.className='settled-toggle';
    tog.textContent=`🎉 ${showSettledCards?'Ẩn':'Hiện'} ${settledDebts.length} khoản đã tất toán ${showSettledCards?'▴':'▾'}`;
    tog.onclick=()=>{showSettledCards=!showSettledCards;renderCards({debts,ticks,currentMonth,currentFilter});};
    list.appendChild(tog);
    if(showSettledCards) addSection('🎉 Đã tất toán',settledDebts);
  }
  list.appendChild(Object.assign(document.createElement('div'),{style:'height:8px'}));
}

// ── RENDER TXN PAGE ───────────────────────────────────────────
export function renderTxnPage(state){
 const {debts,income,expense,txns,walletBase,currentMonth,showAllTxnsFlag,filteredTxns}=state;
  const el=id=>document.getElementById(id);
  if(el('txn-month-label')) el('txn-month-label').textContent=getML(currentMonth);
  const summary=monthSummary(state);
  const monthTxns=summary.entries;
  const {txnIn,txnOut,net:txnRemain,accounts}=summary;
  const accountName=id=>accounts.find(a=>a.accountId===id)?.name||'Chưa chọn tài khoản';
  if(el('txn-kpi-in'))  el('txn-kpi-in').textContent=fmt(txnIn);
  if(el('txn-kpi-out')) el('txn-kpi-out').textContent=fmt(txnOut);
  if(el('txn-kpi-remain')){
    el('txn-kpi-remain').textContent=txnRemain>=0?fmt(txnRemain):'-'+fmt(Math.abs(txnRemain));
    el('txn-kpi-remain').style.color=txnRemain>=0?'var(--teal)':'var(--red)';
  }
  const list=el('txn-list');
  if(list){
    list.innerHTML='';
    if(!(filteredTxns||monthTxns).length){
      list.innerHTML=`<div class="empty-card compact">
        <div class="empty-ico">📝</div>
        <div class="empty-title">Chưa có giao dịch tháng này</div>
        <div class="empty-sub">Ghi lại thu nhập và chi tiêu để theo dõi dòng tiền</div>
        <button onclick="openTxnModal()">+ Ghi giao dịch</button>
      </div>`;
    } else {
      const show=[...(filteredTxns||monthTxns)].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||b.id.localeCompare(a.id)).slice(0,showAllTxnsFlag?9999:8);
      show.forEach(t=>{
        const row=document.createElement('div');row.className='txn-row';
        row.onclick=()=>t.debtId?window.tapTop(t.debtId):window._openTxnEdit&&window._openTxnEdit(t.id);
        const ico=t.type==='transfer'?'⇄':txnCatIcon(t.name,t.type);
        const bg=t.type==='in'?'rgba(76,175,80,.12)':'rgba(255,79,79,.12)';
        row.innerHTML=`
          <div class="txn-cat-ico" style="background:${bg}">${ico}</div>
          <div class="txn-info">
            <div class="txn-name">${escapeHTML(t.name)}</div><small class="txn-account-note">${escapeHTML(accountName(t.accountId))}${t.type==='transfer'?' → '+escapeHTML(accountName(t.toAccountId)):''}</small>
            ${t.date?`<div style="font-size:10px;color:var(--sub);font-weight:600">${new Date(t.date).toLocaleDateString('vi-VN',{day:'numeric',month:'numeric'})}</div>`:''}
          </div>
          <div class="txn-amount ${t.type}">${t.type==='transfer'?'':t.type==='in'?'+':'-'}${fmt(t.amount)}</div>`;
        list.appendChild(row);
      });
    }
  }
  // Banner cảnh báo tháng cũ
  const _realMonthT=(()=>{const n=new Date();return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;})();
  const _isPastT = currentMonth !== _realMonthT;
  const _bannerTxn = document.getElementById('past-month-banner');
  if(_bannerTxn) _bannerTxn.style.display = _isPastT ? 'block' : 'none';
}

function txnCatIcon(name,type){
  if(type==='in'){
    if(/lương|salary/i.test(name)) return '💼';
    if(/thưởng|bonus/i.test(name)) return '🎁';
    if(/bán/i.test(name)) return '🛒';
    return '💰';
  }
  if(/ăn|food|cơm/i.test(name)) return '🍜';
  if(/xăng|xe|đi lại|di chuyển/i.test(name)) return '🚗';
  if(/mua sắm|shop/i.test(name)) return '🛍️';
  if(/điện|nước|internet/i.test(name)) return '💡';
  if(/y tế|thuốc|bệnh/i.test(name)) return '💊';
  if(/giải trí|cafe|nhà hàng/i.test(name)) return '🎬';
  return '📝';
}

// ── RENDER SAVING LIST ────────────────────────────────────────
export function renderSavingList(savings){
  const el=document.getElementById('saving-hist');if(!el)return;
  el.innerHTML='';
  const st=document.getElementById('saving-total');if(st)st.textContent=fmt(savings.reduce((s,x)=>s+Number(x.amount),0));
 if(!savings.length){el.innerHTML=`<div style="padding:14px;text-align:center;color:var(--sub);font-size:12px;font-weight:700">Chưa có ghi chú tiết kiệm.</div>`;return;}
  [...savings].reverse().forEach(s=>{
    const row=document.createElement('div');row.className='save-row';
    row.innerHTML=`<div class="save-row-left" role="button" tabindex="0" onclick="openSavingModal('${s.id}')"><div class="save-row-name">${escapeHTML(s.name)}</div><div class="save-row-date">${escapeHTML(s.date||'')}</div></div>
      <div style="display:flex;align-items:center;gap:8px"><div class="save-row-amt">${fmt(s.amount)}</div>
      <button class="s-del" onclick="window.deleteSaving('${s.id}')">✕</button></div>`;
    el.appendChild(row);
  });
  const total=savings.reduce((s,x)=>s+Number(x.amount),0);
  if(st)st.textContent=fmt(total);
}

// ── RENDER SETTINGS ───────────────────────────────────────────
export function renderSettings(state){
 const {debts,income,expense,savings,txns,currentMonth,currentTheme}=state;
 const s=monthSummary(state);
 const monthlyLabel=document.getElementById('monthly-plan-label');if(monthlyLabel)monthlyLabel.textContent=getML(currentMonth);
 const planLabel=document.getElementById('plan-month-label');if(planLabel)planLabel.textContent=getML(currentMonth);
  renderFinList('income',income,s.entries,state);
  renderFinList('expense',expense,s.entries,state);
  const ds=document.getElementById('plan-debt-summary');if(ds)ds.textContent='Nợ tháng này: '+fmt(s.totalDebtPay)+' · Đã trả '+fmt(s.paidDebt)+' · Còn '+fmt(s.unpaidDebt);
  renderDebtList('td',state.managedDebts||debts,currentMonth);
  renderDebtList('tc',state.managedDebts||debts,currentMonth);
  const activeCount=debts.filter(d=>!d.settled).length;
  const sub=document.getElementById('acc-debt-sub');
  if(sub) sub.textContent=`${activeCount} khoản đang hoạt động`;
  renderSavingList(savings);
  setTheme(currentTheme);
}


function renderFinList(mode,items,entries=[],state){
 const manage=document.getElementById('list-'+mode),monthly=document.getElementById('monthly-'+mode);
 for(const [el,editing] of [[manage,true],[monthly,false]]){
  if(!el)continue;el.replaceChildren();
  const visible=editing?items:items.filter(p=>!p.debtId);
  if(!visible.length){el.innerHTML='<p class="notebook-hint">Chưa có khoản '+(mode==='income'?'thu':'chi')+' cố định.</p>';continue;}
  for(const it of visible){
   const debt=state.managedDebts?.find(d=>d.id===it.debtId),mark=state.ticks[state.currentMonth]?.[it.debtId];
   const amount=debt?paymentAmount(debt,mark):Number(it.amount)||0;
   const remaining=planRemaining(it,entries,mode==='income'?'in':'out');
   const row=document.createElement('div');row.className='srow';
   const info=document.createElement('div');info.className='s-info';
   info.innerHTML='<div class="s-name">'+escapeHTML(it.name)+'</div><small class="fin-frequency">'+(it.debtId?'Theo khoản nợ liên kết':isRecurringPlan({recurringPlans:{[state.currentMonth]:state.recurring}},mode,it,state.currentMonth)?'Hằng tháng':'Riêng tháng này')+'</small><div class="s-val">'+fmt(amount)+(editing?'':' · Còn '+fmt(remaining))+'</div>';
   const button=document.createElement('button');button.className='note-link';
   if(editing){info.onclick=()=>window.openFinEdit(mode,it.id);button.textContent='Sửa';button.onclick=()=>window.openFinEdit(mode,it.id);}
   else{button.textContent=remaining<=0?'✓ Hoàn tác':mode==='income'?'Nhận tiền':'Thanh toán';button.setAttribute('aria-label',button.textContent+' '+it.name);button.onclick=()=>window.openPlanPayment(mode,it.id);}
   row.append(info,button);el.appendChild(row);
  }
 }
}
function renderDebtList(type,debts,month){
 const el=document.getElementById('list-'+type);if(!el)return;el.replaceChildren();
 const list=debts.filter(d=>d.type===type);
 if(!list.length){el.innerHTML='<p class="notebook-hint">Chưa có '+(type==='td'?'thẻ tín dụng':'khoản vay')+'.</p>';return;}
 for(const d of list){
  const row=document.createElement('div');row.className='srow';
  const info=document.createElement('div');info.className='s-info';info.onclick=()=>window.openDebtEdit(d.id);
  info.innerHTML='<div class="s-name">'+escapeHTML(d.name)+'</div><div class="s-val">'+(isDebtActive(d,month)?d.settled?'Đã tất toán':fmt(paymentAmount(d))+' / tháng':'Đã ngừng theo dõi')+'</div>';
  const button=document.createElement('button');button.className='note-link';button.textContent='Sửa';button.onclick=()=>window.openDebtEdit(d.id);
  row.append(info,button);el.appendChild(row);
 }
}
// ── RENDER TOOLS ──────────────────────────────────────────────
export function renderTools(state){
 const {debts,income,expense,savings,loanBook}=state;
  renderSavingList(savings);
  renderLoanBookList(loanBook);
  renderSchedule(state);
  renderAnalyze(state);
}

export function renderLoanBookList(items=[]){
  const el=document.getElementById('loanbook-list');if(!el)return;
  el.innerHTML='';
  if(!items.length){
    el.innerHTML=`<div style="padding:14px;text-align:center;color:var(--sub);font-size:12px;font-weight:700">Chưa có khoản cho vay.</div>`;
    return;
  }
  // Tách: chưa thu / đã thu
  const pending   = items.filter(x=>!x.collected);
  const collected = items.filter(x=> x.collected);
  const totalPending   = pending.reduce((s,x)=>s+Number(x.amount),0);
  const totalCollected = collected.reduce((s,x)=>s+Number(x.amount),0);

  // Header tổng
  const summary=document.createElement('div');
  summary.style='display:flex;gap:10px;margin-bottom:10px';
  summary.innerHTML=`
    <div style="flex:1;background:var(--card2);border-radius:12px;padding:10px 12px">
      <div style="font-size:10px;color:var(--sub);font-weight:700">Chưa thu</div>
      <div style="font-size:14px;font-weight:900;color:var(--orange)">${fmt(totalPending)}</div>
    </div>
    <div style="flex:1;background:var(--card2);border-radius:12px;padding:10px 12px">
      <div style="font-size:10px;color:var(--sub);font-weight:700">Đã thu</div>
      <div style="font-size:14px;font-weight:900;color:var(--accent)">${fmt(totalCollected)}</div>
    </div>`;
  el.appendChild(summary);

  const renderGroup=(list,title)=>{
    if(!list.length) return;
    const lbl=document.createElement('div');
    lbl.style='font-size:10px;font-weight:800;color:var(--sub);padding:6px 0 4px;text-transform:uppercase;letter-spacing:.5px';
    lbl.textContent=title;
    el.appendChild(lbl);
    list.forEach(it=>{
      const row=document.createElement('div');row.className='save-row';
      const isCollected=!!it.collected;
      row.style=isCollected?'opacity:0.55':'';
      row.innerHTML=`
        <div class="save-row-left">
          <div class="save-row-name" style="${isCollected?'text-decoration:line-through':''}">${escapeHTML(it.name)}</div>
          <div class="save-row-date">${escapeHTML(it.note||'')} ${it.date?'· '+escapeHTML(it.date):''} ${it.collectedDate?'· Thu: '+escapeHTML(it.collectedDate):''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <div class="save-row-amt" style="color:${isCollected?'var(--sub)':'var(--orange)'}">${fmt(it.amount)}</div>
          <button onclick="window.toggleLoanCollected('${it.id}')"
            style="padding:5px 10px;border-radius:10px;border:1px solid var(--border);background:${isCollected?'var(--card)':'var(--accent)'};color:${isCollected?'var(--sub)':'var(--bg)'};font-size:11px;font-weight:800;cursor:pointer">
            ${isCollected?'↩':'✓'}
          </button>
          <button class="s-del" onclick="window.openLoanBookModal('${it.id}')">✎</button>
        </div>`;
      el.appendChild(row);
    });
  };

  renderGroup(pending,'⏳ Chưa thu');
  renderGroup(collected,'✅ Đã thu');
}

export function renderSchedule(state){
  const el=document.getElementById('schedule-list');if(!el)return;el.replaceChildren();
  const today=localDate(),month=state.currentMonth;
  const active=state.debts.filter(d=>!d.settled&&d.payDay&&!state.ticks[month]?.[d.id]);
  if(!active.length){el.innerHTML='<div class="empty">Không còn khoản nợ đến hạn trong tháng này.</div>';return;}
  for(const d of [...active].sort((a,b)=>a.payDay-b.payDay)){
    const due=dueDate(month,d.payDay),isToday=due===today,isOverdue=due<today;
    const row=document.createElement('div');row.className='sched-row';
    row.innerHTML='<div class="sched-day'+(isToday?' today':isOverdue?' overdue':'')+'">'+Number(due.slice(-2))+'</div><div><div class="sched-name">'+escapeHTML(d.name)+'</div><div class="notebook-hint">'+due.split('-').reverse().join('/')+' · '+(isToday?'Hôm nay':isOverdue?'Chưa thanh toán':'Sắp tới')+'</div></div><div class="sched-amt">'+fmt(paymentAmount(d))+'</div>';
    el.appendChild(row);
  }
}

export function renderAnalyze(state){
  const el=document.getElementById('analyze-content');if(!el)return;
  const s=monthSummary(state),difference=s.fixedIncome-s.plannedExpense;
  const rows=[
    ['Dự thu cả tháng',s.fixedIncome],['Dự chi cả tháng',s.plannedExpense],
    ['Chênh lệch dự kiến',difference],['Đã thu',s.totalIn],['Đã chi',s.totalOut],
    ['Còn phải chi',s.reserved],['Tiền hiện có',s.balanceTotal],['Ước tính có thể chi',s.available]
  ];
  el.innerHTML=rows.map(([label,value])=>'<div class="analyze-item"><span class="analyze-key">'+label+'</span><span class="analyze-val" style="color:'+(value<0?'var(--red)':'var(--text)')+'">'+fmt(value)+'</span></div>').join('')+
    '<p class="notebook-hint">Chênh lệch dự kiến là dự thu trừ dự chi. Ước tính có thể chi là tiền hiện có trừ các khoản còn phải chi; chưa cộng thu nhập dự kiến.</p>';
}

// ── RENDER REPORT ─────────────────────────────────────────────
let donutChart=null;


export function renderReport(state){
  const s=monthSummary(state),set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value;};
  set('rpt-title','Sổ thu chi · '+getML(state.currentMonth));
  set('rpt-income',fmt(s.totalIn));set('rpt-expense',fmt(s.totalOut));
  set('rpt-expense-fixed',fmt(s.plannedExpense));set('rpt-expense-extra',fmt(s.fixedIncome));
  set('rpt-debt-pay',fmt(s.paidDebt));set('rpt-saving',fmt(s.net));
  const remain=document.getElementById('rpt-saving');if(remain)remain.style.color=s.net>=0?'var(--purple)':'var(--red)';
  renderDonutChart(0,s.entries);
}
const CAT_GROUPS=[
  {label:'Ăn uống',   color:'#4CAF50', match:/ăn|food|cơm|phở|nhà hàng|cafe/i},
  {label:'Gia đình',  color:'#2196F3', match:/gia đình|sinh hoạt|nhà/i},
  {label:'Di chuyển', color:'#FF9800', match:/xăng|xe|di chuyển|đi lại/i},
  {label:'Giải trí',  color:'#E91E63', match:/giải trí|phim|game/i},
  {label:'Khác',      color:'#9C27B0', match:/.*/},
];
function categorize(name){
  return CAT_GROUPS.find(c=>c.match.test(name))||CAT_GROUPS[CAT_GROUPS.length-1];
}

function renderDonutChart(fixedExpense, monthTxns){
  const el=id=>document.getElementById(id);
  const outTxns=monthTxns.filter(t=>t.type==='out');
  const cats={};
  outTxns.forEach(t=>{
    const c=t.debtId?{label:'Trả nợ',color:'#57C8FF'}:categorize(t.name);
    cats[c.label]=(cats[c.label]||{label:c.label,color:c.color,amount:0});
    cats[c.label].amount+=Number(t.amount);
  });
  if(fixedExpense>0){
    cats['Chi cố định']=(cats['Chi cố định']||{label:'Chi cố định',color:'#2196F3',amount:0});
    cats['Chi cố định'].amount+=fixedExpense;
  }
  const data=Object.values(cats).filter(c=>c.amount>0);
  const total=data.reduce((s,c)=>s+c.amount,0);
  if(el('donut-total')) el('donut-total').textContent=fmt(total);

  const canvas=el('donut-chart');
  if(!canvas) return;
  const legend=el('donut-legend');
  if(legend){
    legend.innerHTML='';
    if(!data.length) legend.textContent='Chưa có chi tiêu trong tháng này.';
 data.forEach(c=>{
      const pct=Math.round(c.amount/(total||1)*100);
      const row=document.createElement('div');row.className='dl-row';
      row.innerHTML=`<div class="dl-dot" style="background:${c.color}"></div>
        <span class="dl-name">${c.label}</span>
        <span class="dl-pct">${pct}%</span>
        <span class="dl-amt">${fmt(c.amount)}</span>`;
      legend.appendChild(row);
    });
  }
  if(typeof Chart==='undefined') return;
 const chartData={labels:data.length?data.map(c=>c.label):['Chưa có chi tiêu'],datasets:[{data:data.length?data.map(c=>c.amount):[1],backgroundColor:data.length?data.map(c=>c.color):['#29273b'],borderWidth:0,hoverOffset:5,borderRadius:5,spacing:3}]};
 if(donutChart){donutChart.data=chartData;donutChart.update();return;}
 donutChart=new Chart(canvas,{type:'doughnut',data:chartData,options:{cutout:'78%',plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>ctx.label+': '+fmt(ctx.label==='Chưa có chi tiêu'?0:ctx.raw)}}},animation:{duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:650}}});

}

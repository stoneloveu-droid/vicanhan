// ── app.js ────────────────────────────────────────────────────
// State trung tâm, Firebase sync, auth, business logic,
// tất cả window.* event handlers
// ─────────────────────────────────────────────────────────────

import { balanceSummary, accountEntries, planRemaining, monthSummary, paymentAmount, mergeState, escapeHTML, localDate, balanceEntries, recordedEntries, isLegacySavingEntry } from './finance.js';
import './experience.js';
import { renderBalanceBook } from './notebook-ui.js';
import { auth, db, doc, onSnapshot, runTransaction, getDoc, linkWithPopup,
         GoogleAuthProvider, signInWithPopup, signInAnonymously,
         onAuthStateChanged, signOut } from "./firebase.js";
import { fmt, fmtNoUnit, getML,
         tcCurrentPayment, tcBalance, tcGetMonthly, tcGetDebt,
         tcTotalInterest, tcPaymentAtTerm, tcScheduleTable } from "./calc.js";
import { fmtInput, getInputVal, setInputFmt,
         showToast, confirmAction, setSyncBadge,
         initTheme, setTheme, getCurrentTheme, initAccent,
         setOnPickMonth } from "./ui-utils.js";
import { renderHome, renderPaid, renderCards, renderTxnPage,
         renderSavingList, renderSettings, renderTools,
         renderReport, renderLoanBookList, renderAnalyze } from "./render.js";

// ── DEFAULTS ─────────────────────────────────────────────────
const DEF_DEBTS = [];
const DEF_INCOME  = [];
const DEF_EXPENSE = [];
const SUGGEST_IN  = ['Thưởng','Freelance','Bán đồ','Hoàn tiền','Thu nợ','Lãi tiết kiệm','Quà tặng','Khác'];
const SUGGEST_OUT = ['Ăn uống','Di chuyển','Mua sắm','Y tế','Sửa chữa','Giải trí','Học phí','Điện nước','Khác'];

// ── STATE ─────────────────────────────────────────────────────
let debts=[], income=[], expense=[], ticks={};
let txns={}, savings=[], loanBook=[], walletBase=0, lastAutoMonth='';
let balanceNotes=null, monthlyPlans={};
let currentMonth='', currentFilter='all', openDetail=null;
let editDebtId=null, editFinId=null, finMode='income';
let editTxnId=null, txnType='out';
let editLoanId=null;
let uid=null, unsubSnap=null;
let walletHidden=false;
let showAllTxnsFlag=false;
let isSavingToFirestore=false;
let loaded=false, baseline=null, pendingSnapshot=null;
const emptyData=()=>({debts:[],income:[],expense:[],ticks:{},txns:{},savings:[],loanBook:[],walletBase:0,lastAutoMonth:'',balanceNotes:null,monthlyPlans:{}});
function persisted(){return {debts,income,expense,ticks,txns,savings,loanBook,walletBase,lastAutoMonth,balanceNotes,monthlyPlans};}
function applyData(data){ ({debts,income,expense,ticks,txns,savings,loanBook,walletBase,lastAutoMonth,balanceNotes,monthlyPlans}={...emptyData(),...data}); }

let onboardingStep=1;
let currentPage = 'home'; // track trang đang hiển thị

function clone(x){return JSON.parse(JSON.stringify(x));}
function initMonth(){
  const n=new Date();
  currentMonth=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;
}

// Cho ui-utils biết tháng hiện tại (month picker cần)
function syncMonthForPicker(){
  window.currentMonthForPicker=currentMonth;
}

// ── FIRESTORE ─────────────────────────────────────────────────
function userDoc(){return doc(db,'users',uid);}

function startRealtimeSync(){
  if(unsubSnap) unsubSnap();
  loaded=false;
  const sessionUid=uid;
  unsubSnap=onSnapshot(userDoc(),(snap)=>{
    if(uid!==sessionUid) return;
    if(isSavingToFirestore){pendingSnapshot=snap;return;}
    applyData(snap.exists()?snap.data():emptyData());
    baseline=clone(persisted());loaded=true;
    migrateDebts();setSyncBadge('synced','Đã đồng bộ');renderAll();
    if(!snap.exists()&&!window._onboardingDone) openOnboarding();
  },(e)=>{setSyncBadge('error','Không thể tải dữ liệu');showToast('Không thể tải dữ liệu. Kiểm tra kết nối rồi thử lại.');console.error(e);});
}
async function saveToFirestore(){
  if(!uid||!loaded) throw new Error('Chờ dữ liệu tải xong trước khi lưu.');
  if(isSavingToFirestore) throw new Error('Đang lưu thay đổi trước đó.');
  const ref=userDoc(), sessionUid=uid;
  const before=clone(baseline), desired=clone(persisted());
  isSavingToFirestore=true; pendingSnapshot=null;
  document.body.classList.add('saving');setSyncBadge('syncing','Đang lưu…');
  try{
    const saved=await runTransaction(db,async transaction=>{
      const snap=await transaction.get(ref);
      const remote={...emptyData(),...(snap.exists()?snap.data():{})};
      const result=mergeState(before,desired,remote);
      transaction.set(ref,result);return result;
    });
    if(uid===sessionUid){applyData(saved);baseline=clone(persisted());setSyncBadge('synced','Đã đồng bộ');}
  }catch(e){
    pendingSnapshot=null;
    if(uid===sessionUid){
      applyData(before);
      try{const fresh=await getDoc(ref);applyData(fresh.exists()?fresh.data():emptyData());baseline=clone(persisted());}catch{}
      renderAll();setSyncBadge('error','Chưa lưu được');
    }
    throw e;
  }finally{
    isSavingToFirestore=false;document.body.classList.remove('saving');
    if(pendingSnapshot&&uid===sessionUid){applyData(pendingSnapshot.exists()?pendingSnapshot.data():emptyData());baseline=clone(persisted());renderAll();}
    pendingSnapshot=null;
  }
}
// ── MIGRATE ───────────────────────────────────────────────────
function migrateDebts(){
  debts.forEach(d=>{
    // Existing yearly rates must never be guessed from their magnitude.
    if(d.type==='tc'&&d.note&&!d.rate){
      const m=d.note.match(/^Kỳ\s*(\d+)\/(\d+)$/);
      if(m){d.curTerm=parseInt(m[1]);d.totalTerm=parseInt(m[2]);d.note='';}
    }
    if(d.type==='tc'&&!d.principal&&d.debt){d.principal=d.debt;}
    if(d.type==='td'&&!d.used&&d.debt){d.used=d.debt;d.limit=d.limit||d.debt*2;}
    if(d.type==='td'&&!d.monthly&&d.monthly!==0){d.monthly=d.used||0;}
  });
}

// ── AUTH ──────────────────────────────────────────────────────
window.signInGoogle=function(){
  const provider=new GoogleAuthProvider();
  provider.setCustomParameters({prompt:'select_account'});
  const login=auth.currentUser?.isAnonymous?linkWithPopup(auth.currentUser,provider):signInWithPopup(auth,provider);
  login.catch(e=>{
    console.error('Google sign-in:',e.code,e.message);
    if(e.code==='auth/credential-already-in-use'){
      showToast('Google này đã có ví riêng. Hãy xuất JSON ví khách trước khi đăng xuất để chuyển tài khoản.');
    } else if(e.code==='auth/popup-blocked'){
      showToast('⚠️ Popup bị chặn — cho phép popup từ trang này');
    } else if(e.code==='auth/popup-closed-by-user'||e.code==='auth/cancelled-popup-request'){
      // user tự đóng
    } else {
      showToast('⚠️ '+e.code);
    }
  });
};
window.signInAnon=function(){
  // UX FIX: cảnh báo mất dữ liệu khi dùng ẩn danh
  confirmAction(
    'Dữ liệu ẩn danh sẽ mất nếu xoá app hoặc đổi thiết bị. Tiếp tục không đăng nhập?',
    ()=>signInAnonymously(auth).catch(e=>{
      console.error('Anon sign-in:',e.code,e.message);
      showToast('⚠️ Lỗi kết nối: '+e.code);
    })
  );
};
window.doSignOut=function(){
  confirmAction('Đăng xuất khỏi tài khoản?',async()=>{
    if(unsubSnap){unsubSnap();unsubSnap=null;}
    await signOut(auth);
  });
};

// Fallback: nếu Firebase không phản hồi sau 6s → hiện auth page
const _authTimeout=setTimeout(()=>{
  const overlay=document.getElementById("loading-overlay");
  const authPage=document.getElementById("auth-page");
  const bnav=document.getElementById("bnav");
  if(overlay&&!overlay.classList.contains("hidden")){
    overlay.classList.add("hidden");
    setTimeout(()=>overlay.style.display="none",500);
    if(bnav) bnav.style.display="none";
    document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
    if(authPage) authPage.classList.add("active");
    console.warn("Firebase auth timeout");
  }
},6000);

onAuthStateChanged(auth,async(user)=>{
  clearTimeout(_authTimeout);
  const overlay =document.getElementById('loading-overlay');
  const authPage=document.getElementById('auth-page');
  const bnav    =document.getElementById('bnav');
  if(user){
    if(uid!==user.uid){applyData(emptyData());baseline=null;loaded=false;window._onboardingDone=false;}
    uid=user.uid;
    const name =user.displayName||(user.isAnonymous?'Ẩn danh (chưa đăng nhập)':'Người dùng');
    const email=user.email||(user.isAnonymous?'Ví khách · liên kết Google để giữ quyền truy cập':'—');
    ['acc-name','acc-name2'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=name;});
    ['acc-email','acc-email-sub'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=email;});
    // Hiện/ẩn nút đăng nhập cho user ẩn danh
    const anonBtn=document.getElementById('anon-login-btn');
    if(anonBtn) anonBtn.style.display=user.isAnonymous?'block':'none';
    const _setAvatar=(id)=>{
      const el=document.getElementById(id);if(!el)return;
      if(!user.isAnonymous&&user.displayName){
        const ini=user.displayName.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
        el.dataset.initials=ini;el.classList.add('has-initials');el.textContent='';
      } else {
        el.textContent=user.isAnonymous?'🔓':'👤';el.classList.remove('has-initials');delete el.dataset.initials;
      }
    };
    _setAvatar('sett-dd-avatar');
    setGoogleAvatar(user);
    authPage.classList.remove('active');
    bnav.style.display='flex';
    initMonth();syncMonthForPicker();
    setSyncBadge('syncing','Đang đồng bộ…');
    startRealtimeSync();
    overlay.classList.add('hidden');
    setTimeout(()=>overlay.style.display='none',500);
    switchPage('home');
  } else {
    uid=null;loaded=false;baseline=null;applyData(emptyData());
    document.querySelectorAll('.modal-bg.open,.onboarding-overlay.open').forEach(el=>el.classList.remove('open'));
    if(unsubSnap){unsubSnap();unsubSnap=null;}
    overlay.classList.add('hidden');
    setTimeout(()=>overlay.style.display='none',500);
    bnav.style.display='none';
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    authPage.classList.add('active');
  }
});

// ── RENDER ALL ────────────────────────────────────────────────
function getState(){
  return {debts,income:monthlyPlans[currentMonth]?.income||income,expense:monthlyPlans[currentMonth]?.expense||expense,ticks,txns,savings,loanBook,walletBase,balanceNotes,
          walletHidden,currentMonth,currentFilter,
          currentTheme:getCurrentTheme(),showAllTxnsFlag};
}

// ── ONBOARDING ────────────────────────────────────────────────
function showOnboardingStep(step){
  onboardingStep=step;
  const overlay=document.getElementById('onboarding-overlay');
  if(!overlay) return;
  overlay.classList.add('open');
  overlay.querySelectorAll('.ob-step').forEach(el=>el.classList.toggle('active',Number(el.dataset.step)===step));
  overlay.querySelectorAll('.ob-dot').forEach(el=>el.classList.toggle('active',Number(el.dataset.step)===step));
}
function openOnboarding(){
  showOnboardingStep(1);
  requestAnimationFrame(()=>requestAnimationFrame(()=>document.getElementById('ob-income-amount')?.focus()));
}
function readOnboardingAmount(id){
  const el=document.getElementById(id);
  if(!el) return 0;
  if(el.dataset.raw!==undefined&&el.dataset.raw!=='') return Number(el.dataset.raw)||0;
  return Number(String(el.value||'').replace(/\./g,''))||0;
}
window.nextOnboarding=function(){
  if(onboardingStep===1){
    const amount=readOnboardingAmount('ob-income-amount');

    const name=document.getElementById('ob-income-name')?.value.trim()||'Thu nhập hàng tháng';
    income=amount?[{id:'ob-inc',name,amount,note:'Dự kiến hàng tháng'}]:[];
    showOnboardingStep(2);
    return;
  }
  if(onboardingStep===2){
    const amount=readOnboardingAmount('ob-expense-amount');
    const name=document.getElementById('ob-expense-name')?.value.trim()||'Chi phí cố định';
    expense=amount?[{id:'ob-exp',name,amount,note:'Cố định'}]:[];
    showOnboardingStep(3);
  }
};
window.skipOnboardingStep=function(){
  if(onboardingStep===1){income=[];showOnboardingStep(2);return;}
  if(onboardingStep===2){
    expense=[];
    showOnboardingStep(3);
    return;
  }
  if(onboardingStep===3) window.finishOnboarding();
};
window.loginFromOnboarding=async function(){
  await saveToFirestore();
  window._onboardingDone=true; // ngăn openOnboarding chạy lại sau auth
  const ov=document.getElementById('onboarding-overlay');
  if(ov) ov.classList.remove('open');
  window.signInGoogle();
};
window.finishOnboarding=async function(){
  window._onboardingDone=true;
  const initialAmount=readOnboardingAmount('ob-wallet-amount');
  if(initialAmount>0)balanceNotes=[{id:'bn-'+crypto.randomUUID(),name:'Ghi chép ban đầu',kind:'other',amount:initialAmount,date:localDate(),note:''}];
  monthlyPlans[currentMonth]={income:clone(income),expense:clone(expense)};
  await saveToFirestore();
  document.getElementById('onboarding-overlay')?.classList.remove('open');
  renderAll();
  showToast('✓ Đã thiết lập ví');
};

function renderAll(){
  const s=getState();
  // Luôn render trang đang mở để phản ánh thay đổi ngay lập tức
  if(currentPage==='home')               renderHome(s);
  else if(currentPage==='paid'||currentPage==='debt') renderPaid(s);
  else if(currentPage==='txn')           renderTxnPage(s);
  else if(currentPage==='settings'||currentPage==='finance') renderSettings(s);
  else if(currentPage==='report')        renderTools(s);
  else if(currentPage==='tool-loanbook') renderLoanBookList(s.loanBook||[]);
  else if(currentPage==='tool-schedule') renderSchedulePage(s);
  else if(currentPage==='tool-analyze')  renderAnalyzePage(s);
  // Luôn cập nhật badge nợ và report (nhẹ, không tốn CPU)
  updateDebtNavBadge();
  if(currentPage==='home') renderReport(s);
  document.dispatchEvent(new Event('wallet:render'));
}

// ── SWITCH PAGE ───────────────────────────────────────────────
window.switchPage=function(name){
  if(!document.getElementById('page-'+name)) return;
  currentPage = name;document.body.dataset.page=name;
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.ni').forEach(b=>b.classList.remove('active'));
  document.getElementById('page-'+name)?.classList.add('active');
  // nav highlight: tool sub-pages → highlight report tab
  const navName=['tool-loanbook','tool-interest','tool-saving-calc','tool-schedule','tool-analyze'].includes(name)?'report':name==='finance'?'txn':name==='debt'?'paid':name;
  document.getElementById('nav-'+navName)?.classList.add('active');
  openDetail=null;showAllTxnsFlag=false;
  // Reset txn search khi rời tab
  const _tsEl=document.getElementById('txn-search');
  const _tfEl=document.getElementById('txn-type-filter');
  if(_tsEl) _tsEl.value='';
  if(_tfEl) _tfEl.value='all';
  const s=getState();
  if(name==='home') { renderHome(s); renderReport(s); }
  if(name==='paid')               renderPaid(s);
  if(name==='txn')                renderTxnPage(s);
  if(name==='report')             renderTools(s);
  if(name==='settings')           renderSettings(s);
  if(name==='debt')               renderPaid(s);
  if(name==='finance')            renderSettings(s);
  if(name==='tool-loanbook')      renderLoanBook(s);
  if(name==='tool-interest')      {} // static form
  if(name==='tool-saving-calc')   {} // static form
  if(name==='tool-schedule')      renderSchedulePage(s);
  if(name==='tool-analyze')       renderAnalyzePage(s);
  document.dispatchEvent(new Event('wallet:render'));
};

// ── CARD INTERACTIONS — mở modal chi tiết ────────────────────
let _detailDebtId=null;
window.tapTop=function(id){
  const d=debts.find(x=>x.id===id);if(!d)return;
  _detailDebtId=id;
  const ms=ticks[currentMonth]||{};
  const paid=!!ms[id];
  const content=document.getElementById('ddetail-content');
  if(!content)return;

  if(d.type==='td'){
    const limit=Number(d.limit||0),used=Number(d.used||0),avail=Math.max(0,limit-used);
    const usedPct=limit?Math.min(100,Math.round(used/limit*100)):0;
    const barColor=usedPct>80?'var(--red)':usedPct>60?'var(--orange)':'var(--accent)';
    content.innerHTML=`
      <div style="font-size:17px;font-weight:900;margin-bottom:4px">💳 ${escapeHTML(d.name)}</div>
      <div style="font-size:12px;color:var(--sub);font-weight:600;margin-bottom:16px">Ngày TT: ${d.payDay||'—'} · ${paid?'✅ Đã thanh toán':'⏳ Chưa thanh toán'}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div><div style="font-size:10px;color:var(--sub)">Hạn mức</div><div style="font-size:15px;font-weight:800">${fmt(limit)}</div></div>
        <div><div style="font-size:10px;color:var(--sub)">Đã dùng</div><div style="font-size:15px;font-weight:800;color:var(--orange)">${fmt(used)}</div></div>
        <div><div style="font-size:10px;color:var(--sub)">Còn lại</div><div style="font-size:15px;font-weight:800;color:var(--accent)">${fmt(avail)}</div></div>
        <div><div style="font-size:10px;color:var(--sub)">Trả tháng này</div><div style="font-size:15px;font-weight:800;color:var(--red)">${fmt(d.monthly||0)}</div></div>
      </div>
      <div style="background:var(--bg);border-radius:8px;overflow:hidden;height:8px;margin-bottom:6px">
        <div style="width:${usedPct}%;height:100%;background:${barColor};border-radius:8px;transition:width .4s"></div>
      </div>
      <div style="font-size:11px;color:var(--sub);font-weight:600;text-align:center">${usedPct}% đã sử dụng</div>
      ${d.note?`<div style="margin-top:12px;font-size:12px;color:var(--sub);font-weight:600">📝 ${escapeHTML(d.note)}</div>`:''}`;
  } else {
    const recorded=ms[id];
    const cp=recorded&&typeof recorded==='object'?{monthly:recorded.amount,interest:recorded.interest||0,principal:recorded.principal||0}:tcCurrentPayment(d);
    const bal=tcGetDebt(d);
    const pct=d.totalTerm?Math.round((d.curTerm||0)/d.totalTerm*100):0;
    content.innerHTML=`
      <div style="font-size:17px;font-weight:900;margin-bottom:4px">💰 ${escapeHTML(d.name)}</div>
      <div style="font-size:12px;color:var(--sub);font-weight:600;margin-bottom:16px">Ngày TT: ${d.payDay||'—'} · ${paid?'✅ Đã thanh toán':'⏳ Chưa thanh toán'}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div><div style="font-size:10px;color:var(--sub)">Vốn gốc ban đầu</div><div style="font-size:15px;font-weight:800">${fmt(d.principal||0)}</div></div>
        <div><div style="font-size:10px;color:var(--sub)">Trả tháng này</div><div style="font-size:15px;font-weight:800;color:var(--accent)">${fmt(cp.monthly)}</div></div>
        <div><div style="font-size:10px;color:var(--sub)">Dư nợ còn lại</div><div style="font-size:15px;font-weight:800;color:var(--blue)">${fmt(bal)}</div></div>
        <div><div style="font-size:10px;color:var(--sub)">Lãi tháng này</div><div style="font-size:15px;font-weight:800;color:var(--orange)">${fmt(cp.interest)}</div></div>
        <div><div style="font-size:10px;color:var(--sub)">Trả gốc</div><div style="font-size:15px;font-weight:800;color:var(--green)">${fmt(cp.principal)}</div></div>
        <div><div style="font-size:10px;color:var(--sub)">Tiến độ</div><div style="font-size:15px;font-weight:800">${d.curTerm||0}/${d.totalTerm||0} kỳ</div></div>
        <div style="grid-column:1/-1"><div style="font-size:10px;color:var(--sub)">Hoàn thành</div><div style="font-size:15px;font-weight:800;color:var(--purple)">${pct}%</div></div>
      </div>
      ${d.note?`<div style="margin-top:4px;font-size:12px;color:var(--sub);font-weight:600">📝 ${escapeHTML(d.note)}</div>`:''}
      ${!d.settled?`<button onclick="window.settleDebtEarly()" style="margin-top:16px;width:100%;padding:12px;background:var(--card2);border:1px solid var(--border);border-radius:14px;color:var(--orange);font-family:'Mulish',sans-serif;font-size:13px;font-weight:800;cursor:pointer">🏁 Đánh dấu đã tất toán</button>`:''}`;
  }
  document.getElementById('modal-debt-detail').classList.add('open');
};

window.editFromDetail=function(){
  window.closeModal('modal-debt-detail');
  if(_detailDebtId) window.openDebtEdit(_detailDebtId);
};

window.settleDebtEarly=function(){
  const d=debts.find(x=>x.id===_detailDebtId);if(!d)return;
  confirmAction(`Đánh dấu "${d.name}" đã tất toán? Thao tác này chỉ cập nhật trạng thái. Hãy ghi khoản chi thực tế trong Thu chi.`,async()=>{
    d.settled=true;
    window.closeModal('modal-debt-detail');
    await saveToFirestore();
    renderAll();
    showToast('🎉 Đã tất toán '+d.name);
  });
};

// ── MONTH PICKER CALLBACK ─────────────────────────────────────
setOnPickMonth((key)=>{
  currentMonth=key;
  syncMonthForPicker();
  openDetail=null;
  renderAll();
});

// ── MONTH NAVIGATION ──────────────────────────────────────────
window.shiftMonth=function(delta){
  const [y,m]=currentMonth.split('-').map(Number);
  const d=new Date(y,m-1+delta,1);
  currentMonth=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  syncMonthForPicker();
  showAllTxnsFlag=false;
  renderAll();
};
window.openMonthPickerApp=function(){
  window.openMonthPicker(currentMonth);
};

// ── TOOL PAGE RENDERS ─────────────────────────────────────────
function renderLoanBook(s){
  renderLoanBookList(s.loanBook||[]);
}
function renderSchedulePage(s){
  const el=document.getElementById('schedule-list');if(!el)return;
  el.innerHTML='';
  const today=new Date().getDate();
  const active=(s.debts||[]).filter(d=>!d.settled&&d.payDay&&!s.ticks?.[s.currentMonth]?.[d.id]);
  if(!active.length){el.innerHTML='<div class="empty" style="padding:24px 0">Chưa có ngày thanh toán nào</div>';return;}
  [...active].sort((a,b)=>(a.payDay||0)-(b.payDay||0)).forEach(d=>{
    const row=document.createElement('div');row.className='sched-row';
    const isToday=d.payDay===today,isOverdue=d.payDay<today;
    const monthly=d.type==='tc'?tcGetMonthly(d):Number(d.monthly||0);
    row.innerHTML=`<div class="sched-day${isToday?' today':isOverdue?' overdue':''}">${d.payDay}</div>
      <div><div class="sched-name">${escapeHTML(d.name)}</div>
      <div style="font-size:10px;font-weight:600;color:var(--sub)">${isToday?'🔴 Hôm nay':isOverdue?'Đã qua':'Sắp tới'}</div></div>
      <div class="sched-amt">${fmt(monthly)}</div>`;
    el.appendChild(row);
  });
}
function renderAnalyzePage(s){
  renderAnalyze(s);
}

window.tapCheck=async function(id){
  const d=debts.find(x=>x.id===id);if(!d)return;
  if(currentMonth!==localDate().slice(0,7)){showToast('Chọn tháng hiện tại để xác nhận thanh toán.');return;}
  const old=ticks[currentMonth]?.[id];
  if(old){undoDebtPayment(id);await saveToFirestore();renderAll();showToast('Đã hoàn tác thanh toán');return;}
  if(d.settled)return;
  window.openTxnModalType('out');pendingDebtId=id;refreshTxnPlans();
  document.getElementById('txn-name').value='Trả nợ: '+d.name;
  setInputFmt('txn-amount',paymentAmount(d));
};
window.filterTab=function(f,el){
  currentFilter=f; openDetail=null;
  document.querySelectorAll('.seg2-btn').forEach(b=>b.classList.remove('active'));
  if(el&&el.classList) el.classList.add('active');
  renderCards(getState());
};


let pendingDebtId=null;
function fillSelect(id,items,placeholder,value=''){
  const el=document.getElementById(id);el.replaceChildren();
  el.add(new Option(placeholder,''));
  for(const item of items)el.add(new Option(item.name,item.id));
  el.value=value;
}
function refreshTxnAccounts(value='',destination=''){
  const accounts=balanceSummary(balanceNotes,walletBase,txns).accounts.map(x=>({id:x.accountId,name:x.name+' · '+fmt(x.amount)}));
  fillSelect('txn-account',accounts,'Chọn ví / tài khoản',value||(!editTxnId&&accounts.length===1?accounts[0].id:''));
  fillSelect('txn-destination',accounts,'Chọn tài khoản nhận',destination);
}
function refreshTxnPlans(value=''){
  const plans=getState()[txnType==='in'?'income':'expense'];
  fillSelect('txn-plan',plans,'Khoản phát sinh',value);
  document.getElementById('txn-plan-field').hidden=txnType==='transfer'||!!pendingDebtId;
  document.getElementById('txn-destination-field').hidden=txnType!=='transfer';
}
window.openPlanPayment=function(mode,id){
  const plan=getState()[mode].find(p=>p.id===id);if(!plan)return;
  window.openTxnModalType(mode==='income'?'in':'out');
  document.getElementById('txn-plan').value=id;
  document.getElementById('txn-name').value=plan.name;
  setInputFmt('txn-amount',planRemaining(plan,recordedEntries(txns[currentMonth]||[]),txnType));
};
window.chooseTxnPlan=function(){
  const plan=getState()[txnType==='in'?'income':'expense'].find(p=>p.id===document.getElementById('txn-plan').value);
  if(plan){document.getElementById('txn-name').value=plan.name;setInputFmt('txn-amount',planRemaining(plan,recordedEntries(txns[currentMonth]||[]).filter(t=>t.id!==editTxnId),txnType));}
};
function undoDebtPayment(id){
  const marks=ticks[currentMonth]||{},old=marks[id],d=debts.find(x=>x.id===id);
  if(old&&typeof old==='object'&&old.advanced&&d){
    if(Number(d.curTerm)!==old.previousTerm+1)throw Error('Hãy hoàn tác kỳ thanh toán mới nhất trước.');
    d.curTerm=old.previousTerm;d.settled=false;
  }
  if(old?.txnId)txns[currentMonth]=(txns[currentMonth]||[]).filter(t=>t.id!==old.txnId);
  delete marks[id];
}

// ── TXN ───────────────────────────────────────────────────────
window.openTxnModal=function(){
  editTxnId=null;
  pendingDebtId=null;
  refreshTxnAccounts();
  document.getElementById('txn-legacy-option').hidden=true;
  document.getElementById('txn-count-legacy').checked=false;
  document.getElementById('txn-name').value='';
  const ta=document.getElementById('txn-amount');ta.value='';ta.dataset.raw='';
  document.getElementById('txn-del').style.display='none';
  // Set date mặc định = hôm nay, giới hạn min/max theo tháng đang xem
  const dateEl=document.getElementById('txn-date');
  if(dateEl){
    const today=localDate();
    const [y,m]=currentMonth.split('-');
    const lastDay=new Date(+y,+m,0).getDate();
    dateEl.min=`${currentMonth}-01`;
    dateEl.max=`${currentMonth}-${String(lastDay).padStart(2,'0')}`;
    // Nếu tháng hiện tại = tháng đang xem thì default hôm nay, không thì ngày 1
    dateEl.value=today.startsWith(currentMonth)?today:`${currentMonth}-01`;
  }
  setTxnType('out');
  document.getElementById('modal-txn').classList.add('open');
  requestAnimationFrame(()=>requestAnimationFrame(()=>document.getElementById('txn-amount')?.focus()));
};
function openTxnEdit(id){
  const t=(txns[currentMonth]||[]).find(x=>x.id===id);if(!t)return;
  document.getElementById('txn-legacy-option').hidden=!isLegacySavingEntry(t);
  document.getElementById('txn-count-legacy').checked=false;
  editTxnId=id;
  document.getElementById('txn-name').value=t.name;
  setInputFmt('txn-amount',t.amount);
  document.getElementById('txn-del').style.display='block';
  const dateEl=document.getElementById('txn-date');
  if(dateEl){
    const [y,m]=currentMonth.split('-');
    const lastDay=new Date(+y,+m,0).getDate();
    dateEl.min=`${currentMonth}-01`;
    dateEl.max=`${currentMonth}-${String(lastDay).padStart(2,'0')}`;
    dateEl.value=t.date||`${currentMonth}-01`;
  }
  pendingDebtId=t.debtId||null;
  setTxnType(t.type);
  refreshTxnAccounts(t.accountId,t.toAccountId);
  refreshTxnPlans(t.planId);
  document.getElementById('modal-txn').classList.add('open');
}
// Expose cho render.js dùng
window._openTxnEdit=openTxnEdit;

window.setTxnType=function(t){
  txnType=t;
  document.getElementById('txn-chips').hidden=t==='transfer';
  if(t==='transfer'&&!document.getElementById('txn-name').value)document.getElementById('txn-name').value='Chuyển tiền';
  document.getElementById('tt-in') .className='tt-btn'+(t==='in'?' active-in':'');
  document.getElementById('tt-out').className='tt-btn'+(t==='out'?' active-out':'');
  document.getElementById("tt-transfer").className="tt-btn"+(t==="transfer"?" active-in":"");
  refreshTxnPlans();
  renderChips();
};
function renderChips(){
  const list=txnType==='in'?SUGGEST_IN:SUGGEST_OUT;
  const wrap=document.getElementById('txn-chips');wrap.innerHTML='';
  list.forEach(s=>{
    const c=document.createElement('div');c.className='chip';c.textContent=s;
    c.onclick=()=>{
      document.getElementById('txn-name').value=s==='Khác'?'':s;
      wrap.querySelectorAll('.chip').forEach(x=>x.classList.remove('sel'));c.classList.add('sel');
      if(s!=='Khác') document.getElementById('txn-amount').focus();
      else document.getElementById('txn-name').focus();
    };
    wrap.appendChild(c);
  });
}
window.saveTxn=async function(){
  const name=document.getElementById('txn-name').value.trim();
  const amount=getInputVal('txn-amount'),txnDate=document.getElementById('txn-date').value;
  const accountId=document.getElementById('txn-account').value,toAccountId=document.getElementById('txn-destination').value;
  const planId=txnType==='transfer'||pendingDebtId?'':document.getElementById('txn-plan').value;
  if(!name||!Number.isFinite(amount)||amount<=0){showToast('Nhập tên và số tiền hợp lệ.');return;}
  if(!validNoteDate(txnDate)||!txnDate.startsWith(currentMonth)||txnDate>localDate()){showToast('Chọn ngày đã phát sinh trong tháng đang xem.');return;}
  const accounts=balanceSummary(balanceNotes,walletBase,txns,txnDate).accounts;
  if(!accounts.some(a=>a.accountId===accountId)){showToast('Thêm số dư tài khoản trước ngày giao dịch rồi chọn tài khoản.');return;}
  if(txnType==='transfer'&&(!accounts.some(a=>a.accountId===toAccountId)||accountId===toAccountId)){showToast('Chọn hai tài khoản khác nhau.');return;}
  const initialEntries=Object.values(txns).flat();
  if(pendingDebtId&&txnType!=='out'){showToast('Thanh toán nợ phải là khoản chi.');return;}
  const list=txns[currentMonth]||(txns[currentMonth]=[]);
  const previous=list.find(t=>t.id===editTxnId);
  if(previous?.debtId&&(txnType!=='out'||amount!==previous.amount)){showToast('Để thay đổi số tiền trả nợ, hãy hoàn tác thanh toán rồi cập nhật khoản nợ.');return;}
  const t={...previous,id:previous?.id||'t-'+crypto.randomUUID(),name,amount,type:txnType,date:txnDate,accountId,toAccountId:txnType==='transfer'?toAccountId:'',planId};
  if(document.getElementById('txn-count-legacy').checked)t.isSaving=false;
  if(pendingDebtId&&!previous){
    const d=debts.find(x=>x.id===pendingDebtId);
    if(!d||d.settled||ticks[currentMonth]?.[d.id]){showToast('Khoản nợ đã thay đổi. Vui lòng mở lại.');return;}
    if(amount!==paymentAmount(d)){showToast('Nhập đúng số tiền của kỳ thanh toán: '+fmt(paymentAmount(d)));return;}
    const previousTerm=Number(d.curTerm)||0,payment=d.type==='tc'?tcCurrentPayment(d):{principal:0,interest:0};
    t.debtId=d.id;
    (ticks[currentMonth]||(ticks[currentMonth]={}))[d.id]={amount,principal:payment.principal,interest:payment.interest,previousTerm,advanced:d.type==='tc',date:txnDate,txnId:t.id};
    if(d.type==='tc'){d.curTerm=Math.min(previousTerm+1,d.totalTerm);d.settled=d.curTerm>=d.totalTerm;}
  }else if(previous?.debtId&&ticks[currentMonth]?.[previous.debtId]){
    Object.assign(ticks[currentMonth][previous.debtId],{amount,date:txnDate});
  }
  balanceNotes=accountEntries(balanceNotes,walletBase).map(n=>Array.isArray(n.includedTxnIds)?n:{...n,includedTxnIds:initialEntries.filter(t=>t.date<=n.date).map(t=>t.id)});
  if(previous)list[list.indexOf(previous)]=t;else list.push(t);
  await saveToFirestore();window.closeModal('modal-txn');renderAll();showToast('Đã lưu giao dịch');
};
window.deleteTxn=function(){
  if(!editTxnId) return;
  confirmAction('Xoá giao dịch này?',async()=>{
    const entry=(txns[currentMonth]||[]).find(x=>x.id===editTxnId);
    if(entry?.debtId)undoDebtPayment(entry.debtId);
    txns[currentMonth]=(txns[currentMonth]||[]).filter(x=>x.id!==editTxnId);
    await saveToFirestore();window.closeModal('modal-txn');
    renderAll();showToast('🗑 Đã xoá');
  });
};
window.openTxnModalType=function(type){
  window.openTxnModal();
  window.setTxnType(type);
};
window.showAllTxns=()=>{showAllTxnsFlag=true;renderTxnPage(getState());};
window.filterTxnSearch=function(){
  const q=(document.getElementById('txn-search')?.value||'').trim().toLowerCase();
  const typeF=document.getElementById('txn-type-filter')?.value||'all';
  const monthTxns=txns[currentMonth]||[];
  const filtered=monthTxns.filter(t=>{
    const matchQ=!q||t.name.toLowerCase().includes(q);
    const matchT=typeF==='all'||t.type===typeF;
    return matchQ&&matchT;
  });
  // Tái dùng renderTxnPage nhưng override danh sách
  const list=document.getElementById('txn-list');if(!list)return;
  list.innerHTML='';
  if(!filtered.length){
    list.innerHTML=`<div style="padding:20px;text-align:center;color:var(--sub);font-size:13px;font-weight:700">Không tìm thấy giao dịch nào</div>`;
    return;
  }
  // Gọi renderTxnPage với state gốc nhưng txns đã lọc — tạo state tạm
  renderTxnPage({...getState(),filteredTxns:filtered,showAllTxnsFlag:true});
};

// ── WALLET / SAVING ───────────────────────────────────────────

let editBalanceId=null, editSavingId=null;
window.openBalanceBook=function(){
  renderBalanceBook(balanceNotes,walletBase,false,txns);
  document.getElementById('modal-wallet').classList.add('open');
};
let reconcileAccountId=null;
window.reconcileAccount=function(id){
 const account=balanceSummary(balanceNotes,walletBase,txns).accounts.find(a=>a.accountId===id);if(!account)return;
 window.openBalanceNote();reconcileAccountId=id;
 document.getElementById('bn-name').value=account.name;document.getElementById('bn-kind').value=account.kind;setInputFmt('bn-amount',account.amount);
};
window.openBalanceNote=function(id){
  reconcileAccountId=null;
  editBalanceId=id||null;
  const item=balanceEntries(balanceNotes,walletBase).find(x=>x.id===id);
  document.getElementById('bn-name').value=item?.name||'';
  document.getElementById('bn-kind').value=item?.kind||'cash';
  setInputFmt('bn-amount',item?.amount??0);
  document.getElementById('bn-date').value=item?.date||localDate();
  document.getElementById('bn-note').value=item?.note||'';
  document.getElementById('bn-del').style.display=item?'block':'none';
  window.closeModal('modal-wallet');
  document.getElementById('modal-balance-note').classList.add('open');
};
window.saveBalanceNote=async function(){
  const name=document.getElementById('bn-name').value.trim();
  const amount=getInputVal('bn-amount'),date=document.getElementById('bn-date').value;
  const kind=document.getElementById('bn-kind').value,note=document.getElementById('bn-note').value.trim();
  if(!name||!validNoteDate(date)||!Number.isFinite(amount)||amount<0){showToast('Nhập tên, số tiền và ngày ghi hợp lệ.');return;}
  if(date>localDate()){showToast('Ngày cập nhật không được ở tương lai.');return;}
  const entries=clone(accountEntries(balanceNotes,walletBase));
  const item=entries.find(x=>x.id===editBalanceId);
  const id=item?.id||'bn-'+crypto.randomUUID();
  const matching=entries.find(x=>x.kind===kind&&x.name.trim().toLocaleLowerCase('vi-VN')===name.toLocaleLowerCase('vi-VN'));
  const accountId=item?.accountId||reconcileAccountId||matching?.accountId||id;
  const includedTxnIds=item&&item.date===date?item.includedTxnIds:Object.values(txns).flat().filter(t=>t.date<=date).map(t=>t.id);
  const update={name,kind,amount,date,note,accountId};
  if(includedTxnIds)update.includedTxnIds=includedTxnIds;
  if(item)Object.assign(item,update);else entries.push({id,...update});
  balanceNotes=entries;
  await saveToFirestore();window.closeModal('modal-balance-note');renderAll();showToast('Đã cập nhật số dư');
};
window.deleteBalanceNote=function(){
  if(!editBalanceId)return;
  confirmAction('Xóa bản cập nhật này? Số dư sẽ hiển thị theo bản cập nhật gần nhất còn lại.',async()=>{
    const notes=accountEntries(balanceNotes,walletBase),item=notes.find(x=>x.id===editBalanceId);
    const remaining=notes.filter(x=>x.id!==editBalanceId);
    if(item&&!remaining.some(x=>x.accountId===item.accountId)&&Object.values(txns).flat().some(t=>t.accountId===item.accountId||t.toAccountId===item.accountId)){
      showToast('Tài khoản còn giao dịch. Hãy chuyển hoặc xóa các giao dịch trước.');return;
    }
    balanceNotes=remaining;
    await saveToFirestore();window.closeModal('modal-balance-note');renderAll();showToast('Đã xóa bản cập nhật');
  });
};
function validNoteDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const d=new Date(value+'T12:00:00');
  return Number.isFinite(d.getTime())&&localDate(d)===value;
}
window.toggleWalletVis=function(){walletHidden=!walletHidden;renderHome(getState());document.getElementById('wallet-eye')?.setAttribute('aria-label',walletHidden?'Hiện số tiền':'Ẩn số tiền');};
window.openSavingModal=function(id){
  editSavingId=id||null;
  const entry=savings.find(x=>x.id===editSavingId);
  document.getElementById('sv-name').value=entry?.name||'';
  setInputFmt('sv-amount',entry?.amount||0);
  const oldDate=String(entry?.date||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  document.getElementById('sv-date').value=entry?.dateISO||(oldDate?oldDate[3]+'-'+oldDate[2].padStart(2,'0')+'-'+oldDate[1].padStart(2,'0'):localDate());
  document.getElementById('modal-saving').classList.add('open');
};
window.saveSaving=async function(){
  const name=document.getElementById('sv-name').value.trim()||'Tiết kiệm';
  const amount=getInputVal('sv-amount'),dateISO=document.getElementById('sv-date').value;
  if(!Number.isFinite(amount)||amount<=0||!validNoteDate(dateISO)){showToast('Nhập số tiền và ngày ghi hợp lệ.');return;}
  const date=new Date(dateISO+'T12:00:00').toLocaleDateString('vi-VN');
  const entry=savings.find(x=>x.id===editSavingId);
  if(entry)Object.assign(entry,{name,amount,date,dateISO});
  else savings.push({id:'sv-'+crypto.randomUUID(),name,amount,date,dateISO});
  await saveToFirestore();window.closeModal('modal-saving');renderAll();
  showToast('Đã lưu khoản tiết kiệm');
};
window.deleteSaving=function(id){
  confirmAction('Xóa khoản tiết kiệm này?',async()=>{
    savings=savings.filter(x=>x.id!==id);
    await saveToFirestore();renderAll();showToast('Đã xóa khoản tiết kiệm');
  });
};
// ── LOAN BOOK ────────────────────────────────────────────────
window.openLoanBookModal=function(id){
  editLoanId=id||null;
  const item=editLoanId?loanBook.find(x=>x.id===editLoanId):null;
  document.getElementById('lb-name').value=item?.name||'';
  setInputFmt('lb-amount',item?.amount||0);
  document.getElementById('lb-note').value=item?.note||'';
  document.getElementById('lb-del').style.display=item?'block':'none';
  document.getElementById('modal-loanbook').classList.add('open');
  requestAnimationFrame(()=>requestAnimationFrame(()=>document.getElementById('lb-name')?.focus()));
};
window.saveLoanBook=async function(){
  const name=document.getElementById('lb-name').value.trim();
  const amount=getInputVal('lb-amount');
  const note=document.getElementById('lb-note').value.trim();
  if(!name){showToast('⚠️ Nhập tên người nợ');return;}
  if(!amount){showToast('⚠️ Nhập số tiền');return;}
  if(editLoanId){
    const item=loanBook.find(x=>x.id===editLoanId);
    if(item) Object.assign(item,{name,amount,note});
  } else {
    loanBook.push({id:'lb'+Date.now(),name,amount,note,date:new Date().toLocaleDateString('vi-VN')});
  }
  await saveToFirestore();window.closeModal('modal-loanbook');renderAll();showToast('✓ Đã lưu ghi nợ');
};
window.deleteLoanBook=function(){
  if(!editLoanId) return;
  confirmAction('Xoá ghi nợ này?',async()=>{
    loanBook=loanBook.filter(x=>x.id!==editLoanId);
    await saveToFirestore();window.closeModal('modal-loanbook');renderAll();showToast('🗑 Đã xoá');
  });
};
window.toggleLoanCollected=async function(id){
  const item=loanBook.find(x=>x.id===id);if(!item)return;
  item.collected=!item.collected;
  item.collectedDate=item.collected?new Date().toLocaleDateString('vi-VN'):'';
  await saveToFirestore();
  renderAll();
  showToast(item.collected?`✓ Đã thu: ${item.name}`:`↩ ${item.name} chưa thu`);
};

// ── DEBT TYPE SHEET ───────────────────────────────────────────
window.openDebtTypeSheet=function(){
  document.getElementById('modal-debt-type').classList.add('open');
};
function toggleTcFields(type){
  document.getElementById('md-td-fields').style.display=type==='td'?'block':'none';
  document.getElementById('md-tc-fields').style.display=type==='tc'?'block':'none';
}
window.onDebtTypeChange=val=>toggleTcFields(val);

window.calcTcFields=function(){
  const P    =getInputVal('md-principal');
  const rate =Number(document.getElementById('md-rate')?.value)||0;
  const total=Number(document.getElementById('md-totalterm')?.value)||0;
  const paid =Number(document.getElementById('md-curterm')?.value)||0;
  const preview=document.getElementById('tc-calc-preview');
  if(P<=0||rate<0||!Number.isInteger(total)||total<1||total>600||!Number.isInteger(paid)||paid<0||paid>total){if(preview)preview.style.display='none';return;}

  // FIX 1: dùng method từ form, dùng tcCurrentPayment thay vì tcCalc (không tồn tại)
  const method=document.getElementById('md-method')?.value||'reducing_balance';
  const {monthly}=tcCurrentPayment({principal:P,rate,totalTerm:total,curTerm:paid,method});
  // FIX 2: truyền đủ 5 tham số cho tcBalance (thêm method)
  const remain=tcBalance(P,rate,total,method,paid);
  // Lãi tháng tới dùng tcCurrentPayment luôn (chính xác hơn công thức thủ công)
  const nextTerm=tcCurrentPayment({principal:P,rate,totalTerm:total,curTerm:paid,method});
  const interest=nextTerm.interest;
  const prinPart=nextTerm.principal;
  // FIX 6: tổng lãi còn lại — tính bằng cách cộng interest từng kỳ còn lại
  const remainingInterest=Array.from({length:total-paid},(_,i)=>
    tcPaymentAtTerm(P,rate,total,method,paid+1+i).interest
  ).reduce((a,b)=>a+b,0);

  if(preview){
    preview.style.display='block';
    document.getElementById('tc-calc-monthly').textContent=fmt(monthly);
    document.getElementById('tc-calc-remain').textContent =fmt(remain);
    document.getElementById('tc-calc-interest').textContent=fmt(interest);
    document.getElementById('tc-calc-principal').textContent=fmt(prinPart);
    document.getElementById('tc-calc-total-int').textContent=fmt(remainingInterest);
    document.getElementById('tc-calc-total-pay').textContent=fmt(Array.from({length:Math.max(0,total-paid)},(_,i)=>tcPaymentAtTerm(P,rate,total,method,paid+1+i).total).reduce((s,v)=>s+v,0));
  }
};
window.calcTdFields=function(){
  const used=getInputVal('md-used');
  const rateMonth=Number(document.getElementById('md-td-rate')?.value)||0;
  if(used&&rateMonth){
    // Phí tối thiểu = lãi tháng này (used × rate/100) làm tròn lên 50k
    const interest=Math.round(used*rateMonth/100);
    const minFee=Math.max(50000,Math.ceil(interest/50000)*50000);
    setInputFmt('md-monthly-td',minFee);
  }
};
window.calcCurTermFromDate=function(){
  const dateVal=document.getElementById('md-disburse-date')?.value;
  if(!dateVal) return;
  const start=new Date(dateVal);
  const now=new Date();
  const months=(now.getFullYear()-start.getFullYear())*12+(now.getMonth()-start.getMonth());
  const curTerm=Math.max(0,months);
  const el=document.getElementById('md-curterm');
  if(el) el.value=curTerm;
  calcTcFields();
};
window.openDebtModal=function(type){
  editDebtId=null;
  document.getElementById('md-title').textContent=type==='td'?'Thêm thẻ tín dụng':'Thêm khoản vay';
  ['md-name','md-payday','md-limit','md-used','md-monthly-td','md-settle-fee','md-note-td',
   'md-principal','md-rate','md-totalterm','md-curterm','md-note-tc','md-td-rate'].forEach(id=>{
    const e=document.getElementById(id);if(e){e.value='';delete e.dataset.raw;}
  });
  const dd=document.getElementById('md-disburse-date');if(dd) dd.value='';
  document.getElementById('md-type').value=type;
  document.getElementById('md-del').style.display='none';
  const prev=document.getElementById('tc-calc-preview');if(prev) prev.style.display='none';
  const mh=document.getElementById('method-help');if(mh) mh.style.display='none';
  toggleTcFields(type);
  document.getElementById('modal-debt').classList.add('open');
  setTimeout(()=>document.getElementById('md-name').focus(),350);
};
window.openDebtEdit=function(id){
  const d=debts.find(x=>x.id===id);if(!d)return;
  editDebtId=id;
  document.getElementById('md-title').textContent='Chỉnh sửa';
  document.getElementById('md-name').value=d.name;
  document.getElementById('md-type').value=d.type;
  document.getElementById('md-payday').value=d.payDay||'';
  document.getElementById('md-del').style.display='block';
  if(d.type==='td'){
    setInputFmt('md-limit',d.limit||0);
    setInputFmt('md-used',d.used||0);
    setInputFmt('md-monthly-td',d.monthly||0);
    setInputFmt('md-settle-fee',d.settleFee||0);
    document.getElementById('md-note-td').value=d.note||'';
  } else {
    setInputFmt('md-principal',d.principal||0);
    document.getElementById('md-disburse-date').value=d.disburseDate||'';
    document.getElementById('md-rate').value=d.rate||'';
    document.getElementById('md-totalterm').value=d.totalTerm||'';
    document.getElementById('md-curterm').value=d.curTerm||'';
    document.getElementById('md-note-tc').value=d.note||'';
    // Tooltip giải thích phương pháp tính lãi nếu có element
    const methodEl=document.getElementById('md-method');
    if(methodEl) methodEl.value=d.method||'reducing_balance';
    setTimeout(window.calcTcFields,100);
  }
  toggleTcFields(d.type);
  document.getElementById('modal-debt').classList.add('open');
};
window.confirmDelDebt=id=>window.openDebtEdit(id);
window.saveDebt=async function(){
  const name   =document.getElementById('md-name').value.trim();
  const type   =document.getElementById('md-type').value;
  const payDay =Number(document.getElementById('md-payday').value)||0;
  if(!name){showToast('⚠️ Nhập tên');return;}
  if(!Number.isInteger(payDay)||payDay<1||payDay>31){showToast('Ngày thanh toán từ 1 đến 31.');return;}
  let obj={name,type,payDay};
  if(type==='td'){
    const limit    =getInputVal('md-limit');
    const used     =getInputVal('md-used');
    const monthly  =getInputVal('md-monthly-td');
    const settleFee=getInputVal('md-settle-fee');
    const note     =document.getElementById('md-note-td').value.trim();
    if(!monthly){showToast('⚠️ Nhập trả tối thiểu/tháng');return;}
    obj={...obj,limit,used,monthly,settleFee,note};
  } else {
    const principal =getInputVal('md-principal');
    const rate      =Number(document.getElementById('md-rate').value)||0;
    const totalTerm =Number(document.getElementById('md-totalterm').value)||0;
    const curTerm   =Number(document.getElementById('md-curterm').value)||0;
    const disburseDate=document.getElementById('md-disburse-date').value||'';
    const note      =document.getElementById('md-note-tc').value.trim();
    const method    =document.getElementById('md-method')?.value||'reducing_balance';
    if(principal<=0||rate<0||!Number.isInteger(totalTerm)||totalTerm<1||totalTerm>600||!Number.isInteger(curTerm)||curTerm<0||curTerm>totalTerm){showToast('⚠️ Nhập đủ vốn gốc, lãi suất, số kỳ');return;}
    const settled=curTerm>=totalTerm&&totalTerm>0;
    obj={...obj,principal,rate,totalTerm,curTerm,disburseDate,note,method,settled,rateConverted:true};
  }
  if(editDebtId){const d=debts.find(x=>x.id===editDebtId);if(d) Object.assign(d,obj);}
  else debts.push({id:'d'+Date.now(),...obj});
  await saveToFirestore();window.closeModal('modal-debt');renderAll();
  showToast(editDebtId?'✓ Đã cập nhật':'✓ Đã thêm');
};
window.deleteDebt=function(){
  if(!editDebtId) return;
  confirmAction('Xoá khoản nợ này?',async()=>{
    debts=debts.filter(x=>x.id!==editDebtId);
    await saveToFirestore();window.closeModal('modal-debt');renderAll();showToast('🗑 Đã xoá');
  });
};

// ── FINANCE MODAL ─────────────────────────────────────────────
window.openFinModal=function(mode){
  finMode=mode;editFinId=null;
  document.getElementById('mf-title').textContent=mode==='income'?'Ghi dự thu tháng này':'Ghi dự chi tháng này';
  document.getElementById('mf-name').value='';
  const ma=document.getElementById('mf-amount');ma.value='';delete ma.dataset.raw;
  document.getElementById('mf-note').value='';
  document.getElementById('mf-del').style.display='none';
  document.getElementById('modal-fin').classList.add('open');
  setTimeout(()=>document.getElementById('mf-name').focus(),350);
};
window.openFinEdit=function(mode,id){
  finMode=mode;
  const list=getState()[mode];
  const it=list.find(x=>x.id===id);if(!it)return;
  editFinId=id;
  document.getElementById('mf-title').textContent=mode==='income'?'Chỉnh dự thu':'Chỉnh dự chi';
  document.getElementById('mf-name').value=it.name;
  setInputFmt('mf-amount',it.amount);
  document.getElementById('mf-note').value=it.note||'';
  document.getElementById('mf-del').style.display='block';
  document.getElementById('modal-fin').classList.add('open');
};
window.confirmDelFin=(mode,id)=>window.openFinEdit(mode,id);
window.saveFin=async function(){
  const name  =document.getElementById('mf-name').value.trim();
  const amount=getInputVal('mf-amount');
  const note  =document.getElementById('mf-note').value.trim();
  if(!name){showToast('⚠️ Nhập tên');return;}
  if(!amount){showToast('⚠️ Nhập số tiền');return;}
  const plan=monthlyPlans[currentMonth]||(monthlyPlans[currentMonth]={income:clone(income),expense:clone(expense)});
  const list=plan[finMode];
  if(editFinId){const it=list.find(x=>x.id===editFinId);if(it){it.name=name;it.amount=amount;it.note=note;}}
  else list.push({id:'f'+Date.now(),name,amount,note});
  await saveToFirestore();window.closeModal('modal-fin');renderAll();showToast(editFinId?'✓ Cập nhật':'✓ Đã thêm');
};
window.deleteFin=function(){
  if(!editFinId) return;
  confirmAction('Xoá khoản này?',async()=>{
    const plan=monthlyPlans[currentMonth]||(monthlyPlans[currentMonth]={income:clone(income),expense:clone(expense)});
    plan[finMode]=plan[finMode].filter(x=>x.id!==editFinId);
    await saveToFirestore();window.closeModal('modal-fin');renderAll();showToast('🗑 Đã xoá');
  });
};

// ── TOOLS ─────────────────────────────────────────────────────
window.toggleTool=function(id){
  const body=document.getElementById('body-'+id);const arrow=document.getElementById('arr-'+id);if(!body)return;
  const isOpen=body.classList.contains('open');
  document.querySelectorAll('.tool-body').forEach(b=>b.classList.remove('open'));
  document.querySelectorAll('.tool-arrow').forEach(a=>a.classList.remove('open'));
  if(!isOpen){body.classList.add('open');arrow.classList.add('open');}
};
window.calcInterest=function(){
  const P       =getInputVal('ti-principal');
  const rYear   =Number(document.getElementById('ti-rate').value)||0;
  const n       =Number(document.getElementById('ti-terms').value)||0;
  const method  =document.getElementById('ti-method')?.value||'reducing_balance';
  const res     =document.getElementById('ti-result');
  if(P<=0||rYear<0||!Number.isInteger(n)||n<1||n>600){showToast('⚠️ Nhập đủ thông tin');return;}
  const r=rYear/100/12;
  let monthly,total,interest;
  if(method==='fixed_principal'){
    const princ=P/n;
    const firstMonth=princ+P*r;
    const lastMonth =princ+(P/n)*r;
    total   =tcTotalInterest(P,rYear,n,'fixed_principal')+P;
    interest=tcTotalInterest(P,rYear,n,'fixed_principal');
    monthly =firstMonth; // tháng đầu (cao nhất)
    res.className='tool-result show';
    res.innerHTML=`<div class="tr-row"><span class="tr-label">Trả tháng đầu</span><span class="tr-val" style="color:var(--accent)">${fmt(firstMonth)}</span></div>
      <div class="tr-row"><span class="tr-label">Trả tháng cuối</span><span class="tr-val" style="color:var(--accent)">${fmt(lastMonth)}</span></div>
      <div class="tr-row"><span class="tr-label">Tổng trả ${n} kỳ</span><span class="tr-val">${fmt(total)}</span></div>
      <div class="tr-row"><span class="tr-label">Tổng tiền lãi</span><span class="tr-val" style="color:var(--red)">${fmt(interest)}</span></div>
      <div class="tr-row"><span class="tr-label">Vốn gốc</span><span class="tr-val">${fmt(P)}</span></div>`;
  } else {
    const pmt=r?P*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1):P/n;
    total=pmt*n; interest=total-P;
    res.className='tool-result show';
    res.innerHTML=`<div class="tr-row"><span class="tr-label">Trả mỗi tháng (cố định)</span><span class="tr-val" style="color:var(--accent)">${fmt(pmt)}</span></div>
      <div class="tr-row"><span class="tr-label">Tổng trả ${n} kỳ</span><span class="tr-val">${fmt(total)}</span></div>
      <div class="tr-row"><span class="tr-label">Tổng tiền lãi</span><span class="tr-val" style="color:var(--red)">${fmt(interest)}</span></div>
      <div class="tr-row"><span class="tr-label">Vốn gốc</span><span class="tr-val">${fmt(P)}</span></div>`;
  }
};
window.calcSaving=function(){
  const goal=getInputVal('sc-goal');const rYear=Number(document.getElementById('sc-rate').value)/100||0;
  const months=Number(document.getElementById('sc-months').value)||0;
  const res=document.getElementById('sc-result');
  if(goal<=0||rYear<0||!Number.isInteger(months)||months<1||months>1200){showToast('⚠️ Nhập đủ thông tin');return;}
  const r=rYear/12;
  const monthly=r>0?goal*r/(Math.pow(1+r,months)-1):goal/months;
  const totalDeposit=monthly*months;
  // FIX UX: lãi kép tích lũy = goal - tổng gốc đã gửi (không âm khi r=0)
  const interest=Math.max(0,goal-totalDeposit);
  res.className='tool-result show';
  res.innerHTML=`<div class="tr-row"><span class="tr-label">Cần gửi mỗi tháng</span><span class="tr-val" style="color:var(--green)">${fmt(monthly)}</span></div>
    <div class="tr-row"><span class="tr-label">Tổng tiền gốc</span><span class="tr-val">${fmt(totalDeposit)}</span></div>
    <div class="tr-row"><span class="tr-label">Lãi kép tích lũy</span><span class="tr-val" style="color:var(--accent)">${fmt(interest)}</span></div>
    <div class="tr-row"><span class="tr-label">Mục tiêu</span><span class="tr-val" style="color:var(--green)">${fmt(goal)}</span></div>`;
};

// ── SETTINGS ──────────────────────────────────────────────────
window.toggleAcc=function(id){
  const body=document.getElementById('body-'+id);const arrow=document.getElementById('arr-'+id);if(!body)return;
  const isOpen=body.classList.contains('open');
  body.classList.toggle('open',!isOpen);arrow.classList.toggle('open',!isOpen);
};
window.toggleSettMenu=function(){
  const menu=document.getElementById('sett-menu');
  const overlay=document.getElementById('sett-dd-overlay');
  const btn=document.getElementById('sett-more-btn');
  if(!menu) return;
  const isOpen=menu.classList.contains('open');
  menu.classList.toggle('open',!isOpen);
  if(overlay) overlay.classList.toggle('open',!isOpen);
  if(btn) btn.classList.toggle('active',!isOpen);
};
window.openThemeSheet=function(){
  const menu=document.getElementById('sett-menu');
  const overlay=document.getElementById('sett-dd-overlay');
  const btn=document.getElementById('sett-more-btn');
  if(menu) menu.classList.remove('open');
  if(overlay) overlay.classList.remove('open');
  if(btn) btn.classList.remove('active');
  setTimeout(()=>document.getElementById('modal-theme')?.classList.add('open'),80);
};

// Export JSON
window.exportJSON=function(){
  const data=persisted();
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`vi-cua-toi-${currentMonth}.json`;
  a.click();URL.revokeObjectURL(url);
  showToast('✓ Đã xuất dữ liệu');
};

// Reset — thêm bước xác nhận thứ hai (UX fix)
window.resetAll=function(){
  confirmAction(
    '⚠️ Reset toàn bộ về mặc định? Hành động này KHÔNG THỂ hoàn tác!',
    ()=>confirmAction(
      'Xác nhận lần cuối — xoá hết dữ liệu?',
      async()=>{
        debts=clone(DEF_DEBTS);income=clone(DEF_INCOME);expense=clone(DEF_EXPENSE);
        ticks={};txns={};savings=[];loanBook=[];walletBase=0;lastAutoMonth='';balanceNotes=[];monthlyPlans={};
        await saveToFirestore();renderAll();showToast('✓ Đã reset');
      }
    )
  );
};

// ── SHARE TXN REPORT (YC3) ───────────────────────────────────

window.shareTxnReport=function(){
  const s=monthSummary(getState()),entries=recordedEntries(txns[currentMonth]||[]);
  const lines=['SỔ TÀI CHÍNH · '+getML(currentMonth),
    'Thu đã ghi: '+fmt(s.totalIn),'Chi đã ghi: '+fmt(s.totalOut),'Chênh lệch thu–chi: '+fmt(s.net),
    'Dự thu: '+fmt(s.fixedIncome),'Dự chi: '+fmt(s.fixedExpense),
    'Nợ đã thanh toán: '+fmt(s.paidDebt),
    'Tiết kiệm: '+fmt(s.savingTotal),
    'Tiền hiện có: '+fmt(s.balanceTotal),'Cần giữ lại: '+fmt(s.reserved),'Có thể chi thêm: '+fmt(s.available),
    ''];
  entries.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,10).forEach(t=>lines.push((t.type==='transfer'?'⇄ ':t.type==='in'?'↑ ':'↓ ')+t.name+': '+fmt(t.amount)+(t.date?' · '+t.date:'')));
  if(entries.length>10)lines.push('... và '+(entries.length-10)+' khoản khác');
  document.getElementById('share-txn-text').value=lines.join('\n');
  document.getElementById('modal-share-txn').classList.add('open');
};
window.copyTxnReport=function(){
  const text=document.getElementById('share-txn-text').value;
  navigator.clipboard.writeText(text).then(()=>showToast('✓ Đã copy — paste vào Zalo!')).catch(()=>showToast('Chưa sao chép được. Bạn có thể chọn và sao chép nội dung báo cáo.'));
};

// ── SHARE APP QR (YC4) ───────────────────────────────────────
window.showShareQR=function(){
  const url=window.location.origin+window.location.pathname;
  document.getElementById('qr-url-label').textContent=url;
  const wrap=document.getElementById('qr-canvas-wrap');
  wrap.innerHTML='';
  // Dùng QRCode.js từ CDN nếu có, fallback sang Google Charts API
  if(typeof QRCode!=='undefined'){
    new QRCode(wrap,{text:url,width:180,height:180,colorDark:'#000',colorLight:'#fff'});
  } else {
    const img=document.createElement('img');
    img.src=`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}`;
    img.style='border-radius:8px;width:180px;height:180px';
    img.alt='QR Code';
    wrap.appendChild(img);
  }
  document.getElementById('modal-share-qr').classList.add('open');
};
window.copyShareLink=function(){
  const url=window.location.origin+window.location.pathname;
  navigator.clipboard.writeText(url).then(()=>{showToast('✓ Đã copy link!');window.closeModal('modal-share-qr');}).catch(()=>showToast('Chưa sao chép được. Bạn có thể chia sẻ mã QR.'));
};

// ── DEBT BADGE TRÊN NAV ───────────────────────────────────────
function updateDebtNavBadge(){
  const badge=document.getElementById('nav-debt-badge');if(!badge)return;
  const today=new Date().getDate();
  const upcoming=debts.filter(d=>!d.settled&&d.payDay&&d.payDay>=today&&d.payDay<=today+7);
  const ms=ticks[currentMonth]||{};
  const unpaid=debts.filter(d=>!d.settled&&!ms[d.id]);
  const count=unpaid.length;
  if(count>0){
    badge.textContent=count>9?'9+':String(count);
    badge.style.display='flex';
  } else {
    badge.style.display='none';
  }
}

// ── AVATAR GOOGLE ─────────────────────────────────────────────
function setGoogleAvatar(user){
  const img=document.getElementById('sett-avatar-img');
  const txt=document.getElementById('sett-avatar-text');
  if(!img||!txt)return;
  if(user&&user.photoURL){
    img.src=user.photoURL;
    img.style.display='block';
    txt.style.display='none';
  } else if(user&&user.isAnonymous){
    img.style.display='none';txt.style.display='';txt.textContent='🔓';
  } else if(user&&user.displayName){
    img.style.display='none';txt.style.display='';
    txt.textContent=user.displayName.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  } else {
    img.style.display='none';txt.style.display='';txt.textContent='👤';
  }
}

// ── INIT ──────────────────────────────────────────────────────
initMonth();
syncMonthForPicker();
initTheme();
{
  initAccent();
  const th=localStorage.getItem('vn_theme')||'dark';
  setTheme(th);
}

// ── EXPORT CSV (UX#9) ─────────────────────────────────────────

window.exportCSV=function(){
  const accounts=accountEntries(balanceNotes,walletBase),accountName=id=>accounts.find(a=>a.accountId===id)?.name||'';
  const rows=[['Tháng / phạm vi','Nhóm ghi chép','Tên','Số tiền','Ngày ghi','Ghi chú','Tài khoản','Tài khoản nhận','Mã kế hoạch','Mã khoản nợ']];
  Object.entries(txns).forEach(([month,list])=>(list||[]).forEach(t=>rows.push([getML(month),isLegacySavingEntry(t)?'Tiết kiệm':t.type==='transfer'?'Chuyển tiền':t.type==='in'?'Thu đã ghi':'Chi đã ghi',t.name,t.amount,t.date||'',t.cat||'',accountName(t.accountId),accountName(t.toAccountId),t.planId||'',t.debtId||''])));
  Object.entries(monthlyPlans).forEach(([month,plan])=>['income','expense'].forEach(mode=>(plan[mode]||[]).forEach(x=>rows.push([getML(month),mode==='income'?'Dự thu':'Dự chi',x.name,x.amount,'',x.note||'']))));
  income.forEach(x=>rows.push(['Mẫu kế hoạch cũ','Dự thu',x.name,x.amount,'',x.note||'']));
  expense.forEach(x=>rows.push(['Mẫu kế hoạch cũ','Dự chi',x.name,x.amount,'',x.note||'']));
  balanceEntries(balanceNotes,walletBase).forEach(x=>rows.push(['Toàn sổ',x.kind==='bank'?'Ngân hàng':x.kind==='cash'?'Tiền mặt':'Ghi chép tiền',x.name,x.amount,x.date||'',x.note||'']));
  savings.forEach(x=>rows.push(['Tích lũy','Tiết kiệm',x.name,x.amount,x.dateISO||x.date||'','']));
  const csv=rows.map(row=>row.map(value=>'"'+String(value??'').replace(/"/g,'""')+'"').join(',')).join('\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='so-tai-chinh-'+currentMonth+'.csv';link.click();URL.revokeObjectURL(url);
  showToast('Đã xuất dữ liệu CSV');
};
// ── METHOD HELP TOGGLE (UX#6) ────────────────────────────────
window.showMethodHelp=function(){
  const el=document.getElementById('method-help');
  if(el) el.style.display=el.style.display==='none'?'block':'none';
};

// ── DRAG & DROP REORDER DEBTS ────────────────────────────────
(function initDebtDragSort(){
  let drag={
    el:null, clone:null, type:null, cards:[],
    startClientY:0, startPageY:0,
    cloneStartTop:0, scrollEl:null,
    origIdx:-1, curIdx:-1,
    active:false
  };
  let pressTimer=null;

  /* ── helpers ── */
  function getCards(type){
    return [...(document.querySelectorAll('.dcard[data-debt-id]')||[])]
      .filter(c=>{ const d=debts.find(x=>x.id===c.dataset.debtId); return d&&!d.settled&&d.type===type; });
  }
  function cardType(el){ const d=debts.find(x=>x.id===el.dataset.debtId); return d?.type||null; }

  function makeClone(el){
    const r=el.getBoundingClientRect();
    const cl=el.cloneNode(true);
    Object.assign(cl.style,{
      position:'fixed', left:r.left+'px', top:r.top+'px',
      width:r.width+'px', margin:'0', zIndex:'9999',
      pointerEvents:'none', opacity:'0.95',
      boxShadow:'0 16px 48px rgba(0,0,0,.6)',
      borderRadius:'16px', transition:'box-shadow .15s',
      transform:'scale(1.03)', transformOrigin:'center center',
    });
    document.body.appendChild(cl);
    return cl;
  }

  /* Dịch chuyển các card khác để nhường chỗ — dùng chiều cao thực */
  function shiftCards(toIdx){
    const cardH=drag.el.getBoundingClientRect().height+8; // 8 = gap
    drag.cards.forEach((c,i)=>{
      if(c===drag.el){ c.style.visibility='hidden'; return; }
      c.style.transition='transform .2s cubic-bezier(.25,.8,.25,1)';
      const srcI=drag.cards.indexOf(c);
      // Nếu card này ở sau vị trí gốc và trước vị trí mới → dịch lên
      // Nếu card này ở trước vị trí gốc và sau/bằng vị trí mới → dịch xuống
      let shift=0;
      if(drag.origIdx<toIdx){
        if(i>drag.origIdx && i<=toIdx) shift=-cardH;
      } else {
        if(i>=toIdx && i<drag.origIdx) shift=cardH;
      }
      c.style.transform=shift?`translateY(${shift}px)`:'';
    });
  }

  function resetCards(){
    drag.cards.forEach(c=>{
      c.style.transform=''; c.style.transition=''; c.style.visibility='';
    });
  }

  function getHoverIdx(clientY){
    const others=drag.cards.filter(c=>c!==drag.el);
    for(let i=0;i<others.length;i++){
      const r=others[i].getBoundingClientRect();
      if(clientY < r.top+r.height/2){
        // Map back to full array index
        return drag.cards.indexOf(others[i]);
      }
    }
    return drag.cards.length-1;
  }

  /* ── start ── */
  function onStart(clientY, pageY, el){
    const card=el.closest('.dcard');
    if(!card) return;
    const type=cardType(card);
    if(!type) return;

    const cards=getCards(type);
    const origIdx=cards.indexOf(card);
    const r=card.getBoundingClientRect();
    const scrollEl=document.querySelector('.page.active .scroll')||document.documentElement;

    if(navigator.vibrate) navigator.vibrate(45);

    drag={
      el:card, clone:null, type, cards,
      startClientY:clientY, startPageY:pageY,
      cloneStartTop:r.top,
      scrollEl, origIdx, curIdx:origIdx, active:true
    };
    drag.clone=makeClone(card);
  }

  /* ── move ── */
  function onMove(clientY){
    if(!drag.active||!drag.clone) return;
    const dy=clientY-drag.startClientY;
    drag.clone.style.top=(drag.cloneStartTop+dy)+'px';

    const newIdx=getHoverIdx(clientY);
    if(newIdx!==drag.curIdx){
      drag.curIdx=newIdx;
      shiftCards(newIdx);
    }

    // auto-scroll
    const ZONE=90, SPEED=10, vh=window.innerHeight;
    if(clientY<ZONE) drag.scrollEl.scrollTop-=SPEED;
    else if(clientY>vh-ZONE) drag.scrollEl.scrollTop+=SPEED;
  }

  /* ── end ── */
  async function onEnd(){
    if(!drag.active) return;
    drag.active=false;
    clearTimeout(pressTimer); pressTimer=null;

    if(drag.clone){ drag.clone.remove(); drag.clone=null; }
    resetCards();

    if(drag.curIdx!==drag.origIdx && drag.curIdx>=0){
      const ids=drag.cards.map(c=>c.dataset.debtId);
      const fromId=ids[drag.origIdx];
      ids.splice(drag.origIdx,1);
      ids.splice(drag.curIdx,0,fromId);

      // Rebuild debts: thay section này, giữ nguyên loại kia + settled
      const newDebts=[];
      let inserted=false;
      for(const d of debts){
        if(d.settled){ newDebts.push(d); continue; }
        if(d.type===drag.type&&!inserted){
          ids.map(id=>debts.find(x=>x.id===id)).filter(Boolean).forEach(x=>newDebts.push(x));
          inserted=true;
        } else if(d.type!==drag.type){
          newDebts.push(d);
        }
      }
      debts.length=0; newDebts.forEach(d=>debts.push(d));
      renderAll();
      await saveToFirestore();
      showToast('✓ Đã sắp xếp');
    }

    drag={el:null,clone:null,type:null,cards:[],startClientY:0,startPageY:0,cloneStartTop:0,scrollEl:null,origIdx:-1,curIdx:-1,active:false};
  }

  /* ── Touch events ── */
  let pendingTouch=null;

  document.addEventListener('touchstart',e=>{
    const handle=e.target.closest('.drag-handle');
    if(!handle){ clearTimeout(pressTimer); return; }
    const t=e.touches[0];
    pendingTouch={clientX:t.clientX, clientY:t.clientY, pageY:t.pageY, handle};
    clearTimeout(pressTimer);
    pressTimer=setTimeout(()=>{ onStart(pendingTouch.clientY, pendingTouch.pageY, pendingTouch.handle); },550);
  },{passive:true});

  document.addEventListener('touchmove',e=>{
    if(drag.active){
      onMove(e.touches[0].clientY);
      e.preventDefault();
      return;
    }
    // Hủy long-press nếu scroll
    if(pendingTouch){
      const t=e.touches[0];
      if(Math.abs(t.clientY-pendingTouch.clientY)>10||Math.abs(t.clientX-(pendingTouch.clientX||t.clientX))>10){
        clearTimeout(pressTimer); pressTimer=null;
      }
    }
  },{passive:false});

  document.addEventListener('touchend',async e=>{
    clearTimeout(pressTimer); pressTimer=null; pendingTouch=null;
    await onEnd();
  },{passive:true});

  document.addEventListener('touchcancel',async()=>{
    clearTimeout(pressTimer); pressTimer=null; pendingTouch=null;
    await onEnd();
  },{passive:true});

  /* ── Mouse fallback ── */
  document.addEventListener('mousedown',e=>{
    const handle=e.target.closest('.drag-handle');
    if(!handle) return;
    pressTimer=setTimeout(()=>{
      onStart(e.clientY, e.pageY, handle);
      const mm=ev=>onMove(ev.clientY);
      const mu=async()=>{ await onEnd(); document.removeEventListener('mousemove',mm); document.removeEventListener('mouseup',mu); };
      document.addEventListener('mousemove',mm);
      document.addEventListener('mouseup',mu);
    },550);
  });
  document.addEventListener('mouseup',()=>{ if(!drag.active){ clearTimeout(pressTimer); pressTimer=null; } });
})();


// Shared error boundary for asynchronous UI handlers.
for(const [name,handler] of Object.entries(window)){
  if(typeof handler==='function' && handler.constructor.name==='AsyncFunction'){
    window[name]=async function(...args){
      if(isSavingToFirestore){showToast('Đang lưu…');return;}
      try{return await handler.apply(this,args);}
      catch(error){console.error(error);showToast(error.message||'Chưa lưu được. Vui lòng thử lại.');}
    };
  }
}

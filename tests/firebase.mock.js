
const clone=x=>JSON.parse(JSON.stringify(x));
const now=new Date(),month=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
let data={debts:[{id:'demo-card',name:'Thẻ chi tiêu',type:'td',used:12500000,limit:50000000,monthly:650000,payDay:25,note:'Chi tiêu hàng tháng'},{id:'demo-loan',name:'Khoản vay cá nhân',type:'tc',principal:60000000,rate:12,totalTerm:24,curTerm:6,method:'fixed_principal',payDay:20,rateConverted:true}],income:[{id:'salary',name:'Lương',amount:28000000}],expense:[{id:'rent',name:'Tiền nhà',amount:6500000}],ticks:{},txns:{[month]:[{id:'t1',name:'Cà phê cùng bạn',type:'out',amount:85000,date:month+'-15'},{id:'t2',name:'Freelance thiết kế',type:'in',amount:3500000,date:month+'-14'},{id:'t3',name:'Mua sắm cuối tuần',type:'out',amount:1250000,date:month+'-13'},{id:'t4',name:'Ăn trưa',type:'out',amount:65000,date:month+'-12'}]},savings:[{id:'s1',name:'Quỹ du lịch',amount:5000000,date:'01/09/2026'}],loanBook:[{id:'l1',name:'Minh',amount:1000000,note:'Mượn đầu tháng'}],walletBase:2000000,lastAutoMonth:month};

data.balanceNotes=[{id:'cash',name:'Tiền mặt',kind:'cash',amount:2000000,date:month+'-10',note:''},{id:'bank',name:'Ngân hàng cá nhân',kind:'bank',amount:28000000,date:month+'-12',note:''}];
data.txns[month].push({id:'sv-txn-s1',name:'Góp quỹ: Quỹ du lịch',amount:5000000,type:'out',date:month+'-01',isSaving:true});
if(new URLSearchParams(location.search).has('legacy'))delete data.balanceNotes;

if(new URLSearchParams(location.search).has('empty'))data=null;
if(new URLSearchParams(location.search).has('ledger')){
 data={...data,debts:[],income:[{id:'salary',name:'Lương',amount:28000000}],expense:[{id:'rent',name:'Tiền nhà',amount:7000000}],ticks:{},txns:{},savings:[],balanceNotes:[{id:'cash',name:'Tiền mặt',kind:'cash',amount:2000000,date:month+'-01',includedTxnIds:[]},{id:'bank',name:'Ngân hàng cá nhân',kind:'bank',amount:8000000,date:month+'-01',includedTxnIds:[]}]};
}

let listener;const snapshot=()=>({exists:()=>!!data,data:()=>clone(data)});
export const auth={currentUser:{uid:'preview-only',displayName:'Ví trải nghiệm',email:'Dữ liệu mẫu · Không kết nối Firebase',isAnonymous:false}};
export const db={};export const doc=()=>({});
export function onAuthStateChanged(a,fn){setTimeout(()=>fn(a.currentUser),20);}
export function onSnapshot(ref,fn){listener=fn;setTimeout(()=>fn(snapshot()),30);return ()=>{listener=null;};}
export async function runTransaction(db,fn){if(window.__failSave)throw Error('Mô phỏng mất kết nối: thay đổi chưa được lưu.');let pending;const result=await fn({get:async()=>snapshot(),set:(ref,value)=>pending=clone(value)});if(pending)data=pending;listener?.(snapshot());return result;}
export const getDoc=async()=>snapshot();
export class GoogleAuthProvider{setCustomParameters(){}}
export const signInWithPopup=async()=>{},linkWithPopup=async()=>{},signInAnonymously=async()=>{},signOut=async()=>{};
window.__previewData=()=>clone(data);

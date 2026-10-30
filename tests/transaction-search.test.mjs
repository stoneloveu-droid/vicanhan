import test from 'node:test';
import assert from 'node:assert/strict';
import { filterTransactions } from '../finance.js';

test('Vietnamese search matches names, categories and notes with or without accents',()=>{
  const entries=[
    {id:'a',name:'ĐIỆN nước',type:'out',cat:'Nhà ở',note:'Thanh toán tháng này'},
    {id:'b',name:'Lương',type:'in'},
    {id:'c',name:'Cà phê',type:'out'},
    {id:'d',type:'transfer'}
  ];
  const before=structuredClone(entries);
  for(const query of ['dien nuoc',' ĐIỆN   NƯỚC ','nha o','thanh toan','nuoc dien','điện'.normalize('NFD')]){
    assert.deepEqual(filterTransactions(entries,query).map(t=>t.id),['a']);
  }
  assert.deepEqual(filterTransactions(entries,'luong','out'),[]);
  assert.deepEqual(filterTransactions(entries,'','transfer').map(t=>t.id),['d']);
  assert.equal(filterTransactions(entries,'  ').length,4);
  assert.deepEqual(filterTransactions(entries,'không tồn tại'),[]);
  assert.deepEqual(entries,before);
});

test('transaction rendering keeps filters on refresh, shows all matches and separates empty states',async()=>{
  // Only the DOM surface used by the renderer is needed for this regression.
  globalThis.window={};
  const element=()=>({children:[],style:{},textContent:'',hidden:false,
    set innerHTML(value){this.html=value;this.children=[];},get innerHTML(){return this.html||'';},
    appendChild(child){this.children.push(child);}});
  const elements=Object.fromEntries(['txn-list','txn-search-status','txn-kpi-in','txn-kpi-out'].map(id=>[id,element()]));
  globalThis.document={getElementById:id=>elements[id]||null,createElement:element};
  try{
    const { renderTxnPage }=await import('../render.js');
    const entries=Array.from({length:12},(_,i)=>({id:`t${i}`,name:'Điện nước',amount:10,date:'2026-01-01',type:'out'}));
    const state={currentMonth:'2026-01',txns:{'2026-01':[...entries,{id:'salary',name:'Lương',amount:1000,type:'in',date:'2026-01-01'}]},txnSearch:'dien',txnTypeFilter:'out'};
    renderTxnPage(state);
    assert.equal(elements['txn-list'].children.length,12);
    assert.equal(elements['txn-search-status'].textContent,'Tìm thấy 12 / 13 giao dịch trong tháng');
    const monthIncome=elements['txn-kpi-in'].textContent;
    state.txns['2026-01'].push({id:'new',name:'Tiền điện',amount:20,type:'out',date:'2026-01-02'});
    renderTxnPage(state);
    assert.equal(elements['txn-list'].children.length,13);
    assert.equal(elements['txn-kpi-in'].textContent,monthIncome);
    renderTxnPage({...state,txnSearch:'không khớp'});
    assert.match(elements['txn-list'].innerHTML,/Không tìm thấy giao dịch nào/);
    assert.equal(elements['txn-list'].children.length,0);
    assert.match(elements['txn-search-status'].textContent,/0 \/ 14/);
    renderTxnPage({...state,txnSearch:'',txnTypeFilter:'all'});
    assert.equal(elements['txn-list'].children.length,8);
    assert.equal(elements['txn-search-status'].hidden,true);
    renderTxnPage({...state,txnSearch:'',txnTypeFilter:'all',showAllTxnsFlag:true});
    assert.equal(elements['txn-list'].children.length,14);
    renderTxnPage({...state,currentMonth:'2026-02'});
    assert.equal(elements['txn-list'].children.length,0);
    renderTxnPage({...state,currentMonth:'2026-02',txnSearch:'',txnTypeFilter:'all'});
    assert.match(elements['txn-list'].innerHTML,/Chưa có giao dịch tháng này/);
  }finally{
    delete globalThis.document;
    delete globalThis.window;
  }
});


const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/S.Housing/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),assert=require('assert/strict');
(async()=>{
 const b=await chromium.launch({channel:'msedge',headless:true});
 try{
 const p=await b.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});p.setDefaultTimeout(12000);
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const text=async(id,v)=>assert.equal(await p.locator('#'+id).textContent(),v);
 const save=async id=>{await p.click(id+' .mbtn-save');await p.waitForSelector(id,{state:'hidden'});};
 const manage=async()=>{await p.click('#nav-settings');await p.click('.management-link');};
 const txn=async(type,name,amount)=>{await p.evaluate(t=>openTxnModalType(t),type);await p.fill('#txn-name',name);await p.fill('#txn-amount',String(amount));await save('#modal-txn');};
 await p.goto('http://127.0.0.1:4173/?ledger');await p.waitForFunction(()=>document.querySelector('#hero-balance').textContent==='10.000.000đ');
 assert.equal(await p.locator('#txn-account,#txn-destination,#bn-name,#bn-kind,#tt-transfer,#balance-accounts').count(),0);
 await txn('out','Ăn trưa',100000);await text('hero-balance','9.900.000đ');
 await p.click('#nav-txn');await p.locator('.txn-row').filter({hasText:'Ăn trưa'}).click();await p.fill('#txn-amount','200000');await save('#modal-txn');
 await p.click('#nav-home');await text('hero-balance','9.800.000đ');
 await p.locator('.notebook-add').click();await p.fill('#bn-amount','12000000');await save('#modal-balance-note');await text('hero-balance','12.000.000đ');
 await txn('out','Sau đối chiếu',100000);await text('hero-balance','11.900.000đ');
 await txn('in','Thu phát sinh',200000);await text('hero-balance','12.100.000đ');
 await p.locator('.reserved-button').click();assert(await p.locator('#remaining-details').evaluate(e=>e.open));assert((await p.locator('#remaining-items').textContent()).includes('Tiền nhà'));
 await p.click('#nav-txn');await p.click('.fin-fixed-btn');await p.locator('#monthly-expense .note-link').click();await save('#modal-txn');
 await p.click('#nav-home');await text('hero-reserved','0đ');await text('hero-balance','5.100.000đ');
 await p.click('#nav-txn');await p.click('.fin-fixed-btn');await p.locator('#monthly-expense .note-link').click();await p.waitForFunction(()=>!document.body.classList.contains('saving'));
 await p.click('#nav-home');await text('hero-reserved','7.000.000đ');await text('hero-balance','12.100.000đ');
 // Explicit start months work for both recurring income and expenses.
 const dates=await p.evaluate(()=>{const d=new Date();return {now:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),next:new Date(d.getFullYear(),d.getMonth()+1,1).getFullYear()+'-'+String(new Date(d.getFullYear(),d.getMonth()+1,1).getMonth()+1).padStart(2,'0')};});
 for(const [mode,name,amount,index] of [['income','Lương thêm',1000000,0],['expense','Internet',300000,1]]){
  await manage();await p.locator('#page-finance .add-row').nth(index).click();await p.fill('#mf-name',name);await p.fill('#mf-amount',String(amount));await p.fill('#mf-start',dates.next);await save('#modal-fin');
  assert((await p.locator('#list-'+mode).textContent()).includes(name));
  await p.evaluate(()=>shiftMonth(-1));assert(!(await p.locator('#list-'+mode).textContent()).includes(name));
 }
 await p.click('#nav-home');await text('hero-reserved','7.000.000đ');
 // Debt payment and reversal use the main balance without a selection form.
 await p.goto('http://127.0.0.1:4173/');await p.waitForFunction(()=>document.querySelector('#hero-balance').textContent==='30.000.000đ');
 await p.click('#nav-paid');
 for(const id of ['demo-card','demo-loan']){await p.click('#cb-'+id);await p.waitForFunction(id=>Object.values(window.__previewData().ticks).some(m=>m[id]),id);assert.equal(await p.locator('#modal-txn.open').count(),0);}
 await p.click('#nav-home');await text('hero-reserved','6.500.000đ');await text('hero-balance','26.400.000đ');
 await p.click('#nav-paid');await p.click('#cb-demo-card');await p.waitForFunction(()=>!Object.values(window.__previewData().ticks).some(m=>m['demo-card']));
 await p.click('#nav-home');await text('hero-reserved','7.150.000đ');await text('hero-balance','27.050.000đ');
 // Failed save leaves the balance unchanged.
 await p.evaluate(()=>openTxnModalType('out'));await p.fill('#txn-name','Lỗi thử');await p.fill('#txn-amount','1000');await p.evaluate(()=>window.__failSave=true);await p.click('#modal-txn .mbtn-save');await p.waitForTimeout(150);assert(await p.locator('#modal-txn').evaluate(e=>e.classList.contains('open')));await text('hero-balance','27.050.000đ');await p.evaluate(()=>{window.__failSave=false;closeModal('modal-txn');});
 fs.mkdirSync('artifacts',{recursive:true});
 for(const width of [320,390,430]){await p.setViewportSize({width,height:844});for(const tab of ['home','paid','txn','settings','finance','monthly']){await p.evaluate(t=>switchPage(t),tab);assert(!(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));}}
 await p.click('#nav-home');await p.locator('#page-home .scroll').evaluate(el=>el.scrollTop=0);await p.screenshot({path:'artifacts/single-balance-home.png'});
 assert.deepEqual(errors,[]);console.log('PASS: single balance, editing, reconciliation, income/expense start months, remaining drilldown, debt tick/undo, failed saves and mobile layout.');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1)});

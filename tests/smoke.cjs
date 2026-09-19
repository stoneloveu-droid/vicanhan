const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/S.Housing/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),assert=require('assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const data=()=>page.evaluate(()=>window.__previewData());
 const tab=n=>page.click('#nav-'+n);
 const save=async modal=>{await page.click(modal+' .mbtn-save');await page.waitForSelector(modal,{state:'hidden'});};
 const expectText=async(id,text)=>assert.equal(await page.locator('#'+id).textContent(),text);
 const transaction=async(type,name,amount,account='cash')=>{
  await page.evaluate(t=>window.openTxnModalType(t),type);
  await page.fill('#txn-name',name);await page.fill('#txn-amount',String(amount));await page.selectOption('#txn-account',account);
 };
 await page.goto('http://127.0.0.1:4173/?ledger');await page.waitForSelector('#page-home.active');
 await expectText('kpi-wallet','3.000.000đ');await expectText('hero-balance','10.000.000đ');await expectText('hero-reserved','7.000.000đ');
 await page.click('#wallet-eye');await expectText('hero-balance','••••••');await page.click('#wallet-eye');
 await transaction('out','Ăn trưa',100000);await save('#modal-txn');
 await expectText('hero-balance','9.900.000đ');await expectText('kpi-wallet','2.900.000đ');
 // Edit and delete reverse only this transaction.
 await tab('txn');await page.locator('.txn-row').filter({hasText:'Ăn trưa'}).click();await page.fill('#txn-amount','200000');await save('#modal-txn');
 await tab('home');await expectText('hero-balance','9.800.000đ');
 await tab('txn');await page.locator('.txn-row').filter({hasText:'Ăn trưa'}).click();await page.click('#txn-del');await page.click('#ca-ok');await page.waitForSelector('#modal-txn',{state:'hidden'});
 await tab('home');await expectText('hero-balance','10.000.000đ');
 // Partial planned payment releases the same reserve; full payment does not double count.
 await page.locator('.available-card').first().click();await page.locator('#list-expense .note-link').click();
 await page.selectOption('#txn-account','bank');await page.fill('#txn-amount','3000000');await save('#modal-txn');
 await tab('home');await expectText('hero-balance','7.000.000đ');await expectText('hero-reserved','4.000.000đ');await expectText('kpi-wallet','3.000.000đ');
 await page.locator('.available-card').first().click();await page.locator('#list-expense .note-link').click();await page.selectOption('#txn-account','bank');await save('#modal-txn');
 await tab('home');await expectText('hero-balance','3.000.000đ');await expectText('hero-reserved','0đ');await expectText('kpi-wallet','3.000.000đ');
 // Transfer changes distribution, not income or spending.
 await transaction('transfer','Rút tiền',500000,'bank');await page.selectOption('#txn-destination','cash');await save('#modal-txn');
 await expectText('hero-balance','3.000.000đ');
 assert((await page.locator('#balance-accounts').textContent()).includes('2.500.000đ'));
 await tab('txn');await expectText('txn-kpi-in','0đ');await expectText('txn-kpi-out','7.000.000đ');
 await page.selectOption('#txn-type-filter','transfer');assert.equal(await page.locator('.txn-row').count(),1);await page.selectOption('#txn-type-filter','all');
 // Receive planned salary, then make a same-day reconciliation and another expense.
 await transaction('in','Lương',28000000,'bank');await page.selectOption('#txn-plan','salary');await save('#modal-txn');
 await tab('home');await expectText('hero-balance','31.000.000đ');
 await page.locator('#balance-accounts .balance-note-row').filter({hasText:'Tiền mặt'}).click();await page.fill('#bn-amount','2000000');await save('#modal-balance-note');
 await expectText('hero-balance','30.500.000đ');
 await transaction('out','Sau cập nhật',100000);await save('#modal-txn');await expectText('hero-balance','30.400.000đ');
 // Savings are notes, never a second expense.
 const before=await data();await tab('report');await page.locator('#page-report .add-row').click();await page.fill('#sv-name','Tiết kiệm');await page.fill('#sv-amount','1000000');await save('#modal-saving');
 assert.deepEqual((await data()).txns,before.txns);await tab('home');await expectText('hero-balance','30.400.000đ');
 // Failed transaction save does not change remote balances.
 await transaction('out','Lỗi lưu',12345);const beforeFail=await data();await page.evaluate(()=>window.__failSave=true);await page.click('#modal-txn .mbtn-save');await page.waitForTimeout(250);
 assert.deepEqual(await data(),beforeFail);assert(await page.locator('#modal-txn').evaluate(e=>e.classList.contains('open')));
 await page.evaluate(()=>window.__failSave=false);await page.click('#modal-txn .mbtn-cancel');
 // Negative available amount stays visible.
 await page.locator('.available-card').first().click();await page.locator('#list-expense .s-info').click();await page.fill('#mf-amount','50000000');await save('#modal-fin');
 await tab('home');await expectText('kpi-wallet','-12.600.000đ');assert((await page.locator('#wallet-status').textContent()).includes('Thiếu'));

 await tab('txn');await page.locator('.mnav-btn').first().click();await tab('home');await expectText('available-amount','7.000.000đ');
 await tab('txn');await page.locator('.mnav-btn').last().click();await tab('home');await expectText('available-amount','43.000.000đ');
 await tab('txn');await page.evaluate(()=>window.shareTxnReport());assert((await page.locator('#share-txn-text').inputValue()).includes('Có thể chi thêm: -12.600.000đ'));await page.click('#modal-share-txn .mbtn-cancel');
 // Account names and transaction names are rendered as text.
 await transaction('out','<img src=x onerror=alert(1)>',1000);await save('#modal-txn');await tab('txn');assert.equal(await page.locator('#txn-list img').count(),0);
 // Debt confirmation writes a linked expense; undo reverses balance and loan term together.
 await page.goto('http://127.0.0.1:4173/');await page.waitForSelector('#page-home.active');
 let initial=await data();const loan=initial.debts.find(d=>d.id==='demo-loan');
 await tab('paid');await page.click('#cb-demo-loan');await page.selectOption('#txn-account','bank');await save('#modal-txn');
 let paid=await data();assert.equal(paid.debts.find(d=>d.id===loan.id).curTerm,loan.curTerm+1);
 const month=Object.keys(paid.ticks)[0],mark=paid.ticks[month][loan.id];
 assert(paid.txns[month].some(t=>t.id===mark.txnId&&t.debtId===loan.id&&t.accountId==='bank'));
 await page.click('#cb-demo-loan');await page.waitForFunction(id=>!Object.values(window.__previewData().ticks).some(m=>m[id]),loan.id);
 const undone=await data();assert.equal(undone.debts.find(d=>d.id===loan.id).curTerm,loan.curTerm);assert.deepEqual(undone.txns,initial.txns);
 // Legacy records survive and do not acquire a made-up account.
 await tab('txn');assert((await page.locator('#legacy-saving-hint').textContent()).includes('tiết kiệm'));
 // Tools and all five tabs remain usable on small screens.
 for(const [label,id,fields] of [['Tính lãi vay','tool-interest',[['ti-principal','10000000'],['ti-rate','0'],['ti-terms','12']]],['Lãi kép tiết kiệm','tool-saving-calc',[['sc-goal','12000000'],['sc-rate','0'],['sc-months','12']]]]){
  await tab('report');await page.locator('#page-report').getByText(label,{exact:true}).click();for(const [field,value] of fields)await page.fill('#'+field,value);await page.click('#page-'+id+' .tool-run-btn');assert(!(await page.locator('#page-'+id+' .tool-result').textContent()).includes('NaN'));
 }
 fs.mkdirSync('artifacts',{recursive:true});
 for(const width of [320,360,390,430]){
  await page.setViewportSize({width,height:844});
  for(const name of ['home','paid','txn','report','settings']){
   await tab(name);assert(await page.locator('#page-'+name).evaluate(el=>el.scrollWidth<=window.innerWidth+1));
   if(width===390)await page.waitForTimeout(700);
   if(width===390)await page.screenshot({path:'artifacts/ledger-'+name+'.png'});
  }
 }
 await page.goto('http://127.0.0.1:4173/?empty');await page.waitForSelector('#onboarding-overlay.open');
 for(let i=0;i<3;i++)await page.locator('.ob-step.active .ob-secondary').click();
 await page.waitForSelector('#onboarding-overlay',{state:'hidden'});await expectText('kpi-wallet','Chưa có số dư');
 assert.deepEqual(errors,[]);console.log('PASS: account CRUD, planned/actual cash flow, partial payments, transfers, reconciliation, savings independence, failed saves, debt payment/undo, negative budget, mobile tabs and onboarding.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});


const {chromium}=require('C:/Users/S.Housing/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),assert=require('assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173');await page.waitForSelector('#page-home.active');
 await page.waitForFunction(()=>document.querySelector('#kpi-wallet').textContent!=='—');
 await page.waitForTimeout(800);
 fs.mkdirSync('artifacts',{recursive:true});
 await page.screenshot({path:'artifacts/home.png'});
 for(const tab of ['paid','txn','report','settings']){
   await page.click('#nav-'+tab);await page.waitForTimeout(550);
   await page.screenshot({path:'artifacts/'+tab+'.png'});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'horizontal overflow '+tab);
 }
 await page.click('#nav-home');const before=await page.locator('#kpi-wallet').textContent();
 await page.click('#wallet-eye');await page.click('#wallet-eye');assert.equal(await page.locator('#kpi-wallet').textContent(),before);
 await page.click('.quick-action:nth-child(2)');await page.fill('#txn-amount','120000');await page.fill('#txn-name','Kiểm thử chi tiêu');
 await page.click('#modal-txn .mbtn-save');await page.waitForSelector('#modal-txn',{state:'hidden'});
 assert.notEqual(await page.locator('#kpi-wallet').textContent(),before);
 await page.click('#nav-paid');
 const initial=await page.evaluate(()=>window.__previewData().debts.find(d=>d.id==='demo-loan').curTerm);
 await page.click('#cb-demo-loan');await page.waitForTimeout(250);
 assert.equal(await page.evaluate(()=>window.__previewData().debts.find(d=>d.id==='demo-loan').curTerm),initial+1);
 await page.click('#cb-demo-loan');await page.waitForTimeout(250);
 assert.equal(await page.evaluate(()=>window.__previewData().debts.find(d=>d.id==='demo-loan').curTerm),initial);
 await page.click('#nav-txn');const totals=await page.locator('#txn-kpi-out').textContent();await page.fill('#txn-search','Kiểm thử');assert.equal(await page.locator('#txn-kpi-out').textContent(),totals);
 await page.click('#nav-home');await page.click('.quick-action:nth-child(2)');
 await page.fill('#txn-name','Không được lưu');await page.fill('#txn-amount','10000');await page.evaluate(()=>window.__failSave=true);
 await page.click('#modal-txn .mbtn-save');await page.waitForTimeout(300);
 assert(await page.locator('#modal-txn').evaluate(el=>el.classList.contains('open')));
 assert(!(await page.evaluate(()=>JSON.stringify(window.__previewData()))).includes('Không được lưu'));
 await page.evaluate(()=>window.__failSave=false);await page.click('#modal-txn .mbtn-cancel');

 await page.click('#nav-settings');await page.locator('#page-settings .sr-lbl').filter({hasText:'Số dư đầu kỳ'}).click();await page.fill('#wallet-base-input','3000000');await page.click('#modal-wallet .mbtn-save');await page.waitForSelector('#modal-wallet',{state:'hidden'});assert.equal(await page.evaluate(()=>window.__previewData().walletBase),3000000);
 await page.click('#nav-report');await page.locator('#page-report').getByText('Tính lãi vay',{exact:true}).click();await page.fill('#ti-principal','10000000');await page.fill('#ti-rate','0');await page.fill('#ti-terms','12');await page.click('#page-tool-interest .tool-run-btn');assert(!(await page.locator('#ti-result').textContent()).includes('NaN'));
 await page.click('#nav-report');await page.locator('#page-report').getByText('Lãi kép tiết kiệm',{exact:true}).click();await page.fill('#sc-goal','12000000');await page.fill('#sc-rate','0');await page.fill('#sc-months','12');await page.click('#page-tool-saving-calc .tool-run-btn');assert((await page.locator('#sc-result').textContent()).includes('1.000.000'));
 await page.click('#nav-report');await page.locator('#page-report').getByText('Lịch đến hạn',{exact:true}).click();assert(await page.locator('#schedule-list .sched-row').count()>0);
 await page.click('#nav-report');await page.locator('#page-report').getByText('Sức khoẻ tài chính',{exact:true}).click();
 await page.click('#nav-report');await page.locator('#page-report').getByText('Sổ ghi nợ',{exact:true}).click();assert((await page.locator('#loanbook-list').textContent()).includes('Minh'));
 await page.click('#nav-home');await page.click('.quick-action:nth-child(2)');await page.fill('#txn-name','<img src=x onerror=alert(1)>');await page.fill('#txn-amount','1000');await page.click('#modal-txn .mbtn-save');await page.waitForSelector('#modal-txn',{state:'hidden'});await page.click('#nav-txn');assert.equal(await page.locator('#txn-list img').count(),0);
 await page.click('#nav-settings');await page.locator('.tog').filter({has:page.locator('#dark-mode-toggle')}).click();assert.equal(await page.locator('html').getAttribute('data-theme'),'light');await page.locator('.tog').filter({has:page.locator('#dark-mode-toggle')}).click();await page.locator('.tog').filter({has:page.locator('#motion-toggle')}).click();assert.equal(await page.locator('html').getAttribute('data-motion'),'off');await page.locator('.tog').filter({has:page.locator('#motion-toggle')}).click();

 for(const width of [320,360,430]){
  await page.setViewportSize({width,height:844});
  for(const tab of ['home','paid','txn','report','settings']){
   await page.click('#nav-'+tab);await page.waitForTimeout(100);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'overflow '+width+' '+tab);
  }
 }

 await page.goto('http://127.0.0.1:4173/?empty');await page.waitForSelector('#onboarding-overlay.open');
 assert.equal(await page.locator('#donut-total').textContent(),'0đ');
 await page.fill('#ob-income-amount','20000000');await page.locator('.ob-step.active .ob-primary').click();
 await page.locator('.ob-step.active .ob-secondary').click();await page.fill('#ob-wallet-amount','1000000');
 await page.locator('.ob-step.active .ob-primary').click();await page.waitForSelector('#onboarding-overlay',{state:'hidden'});
 assert.equal(await page.evaluate(()=>window.__previewData().walletBase),1000000);

 assert.deepEqual(errors,[]);
 console.log('PASS: five tabs, 320–430px, balance visibility, add expense, loan payment/undo, search totals, failed save.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});


const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/S.Housing/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const p=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 p.setDefaultTimeout(12000);
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:4173/');
 await p.waitForFunction(()=>document.querySelector('#hero-balance').textContent==='30.000.000đ');
 const manage=async()=>{await p.click('#nav-settings');await p.click('.management-link');};
 const toggle=async()=>{await p.locator('#list-td .s-info').click();await p.click('#md-del');await p.click('#ca-ok');await p.waitForSelector('#modal-debt',{state:'hidden'});};
 await p.click('#nav-paid');await p.click('#cb-demo-card');await p.waitForFunction(()=>Object.values(window.__previewData().ticks).some(m=>m['demo-card']));
 const paid=await p.evaluate(()=>window.__previewData());
 await manage();await toggle();
 const stopped=await p.evaluate(()=>window.__previewData());
 assert.equal(stopped.debts.length,paid.debts.length);assert.deepEqual(stopped.ticks,paid.ticks);assert.deepEqual(stopped.txns,paid.txns);
 await p.click('#nav-paid');assert.equal(await p.locator('#cb-demo-card.checked').count(),1);
 await p.evaluate(()=>shiftMonth(1));assert.equal(await p.locator('#cb-demo-card').count(),0);
 await p.evaluate(()=>shiftMonth(-1));await manage();await toggle();
 await p.click('#nav-paid');await p.click('#cb-demo-card');
 await p.waitForFunction(()=>!Object.values(window.__previewData().ticks).some(m=>m['demo-card']));
 await p.click('#nav-home');assert.equal(await p.locator('#hero-reserved').textContent(),'10.100.000đ');
 await p.click('#hero-breakdown');assert(await p.locator('#remaining-details').evaluate(el=>el.open));
 assert((await p.locator('#remaining-items').textContent()).includes('Tiền nhà'));
 await p.click('#nav-txn');await p.click('.fin-fixed-btn');
 assert.equal(await p.locator('#page-monthly .s-del,#page-monthly .add-row').count(),0);
 await p.locator('#monthly-expense .note-link').click();await p.click('#modal-txn .mbtn-save');await p.waitForSelector('#modal-txn',{state:'hidden'});
 await p.locator('#monthly-expense .note-link').click();await p.waitForFunction(()=>!document.body.classList.contains('saving'));
 await p.click('#nav-home');assert.equal(await p.locator('#hero-reserved').textContent(),'10.100.000đ');
 for(const width of [320,390,430]){
  await p.setViewportSize({width,height:844});
  for(const tab of ['home','paid','txn','settings','finance','monthly']){
   await p.evaluate(t=>switchPage(t),tab);
   assert(!(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),tab+' overflow');
   if(width===390)await p.screenshot({path:'artifacts/clean-'+tab+'.png'});
  }
 }
 assert.deepEqual(errors,[]);console.log('PASS: settings management, archive/restore with history, payment undo, remaining breakdown and mobile layout.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});

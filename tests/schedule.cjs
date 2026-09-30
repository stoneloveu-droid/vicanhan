
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/S.Housing/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('assert/strict'),fs=require('fs');
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});try{
 const p=await b.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:4173/?auto');
 await p.waitForFunction(()=>window.__previewData()?.automation?.lastRun);
 const initial=await p.evaluate(()=>window.__previewData()),month=initial.automation.fromMonth;
 assert.equal(initial.debts.find(d=>d.id==='demo-loan').curTerm,7);
 assert.equal(Object.values(initial.ticks[month]).length,2);
 assert.equal(await p.locator('#kpi-wallet').textContent(),'20.000.000đ');
 await p.click('#nav-paid');await p.click('#cb-demo-loan');
 await p.waitForFunction(()=>!Object.values(window.__previewData().ticks).some(m=>m['demo-loan']));
 const undone=await p.evaluate(()=>window.__previewData());assert.equal(undone.debts.find(d=>d.id==='demo-loan').curTerm,6);
 await p.click('#nav-home');assert.equal(await p.locator('#kpi-wallet').textContent(),'20.000.000đ');
 await p.locator('.notebook-add').click();await p.fill('#bn-amount','40000000');await p.click('#modal-balance-note .mbtn-save');await p.waitForSelector('#modal-balance-note',{state:'hidden'});
 assert.equal(await p.locator('#hero-balance').textContent(),'40.000.000đ');
 assert.equal(await p.locator('#kpi-wallet').textContent(),'20.000.000đ');
 assert(!Object.values((await p.evaluate(()=>window.__previewData())).ticks).some(m=>m['demo-loan']));
 await p.click('#nav-settings');assert(await p.locator('#automation-toggle').isChecked());await p.locator('label').filter({has:p.locator('#automation-toggle')}).click();await p.waitForFunction(()=>window.__previewData().automation.enabled===false);
 await p.locator('label').filter({has:p.locator('#automation-toggle')}).click();await p.waitForFunction(()=>window.__previewData().automation.enabled===true);
 assert(!Object.values((await p.evaluate(()=>window.__previewData())).ticks).some(m=>m['demo-loan']));
 fs.mkdirSync('artifacts',{recursive:true});
 for(const theme of ['dark','light']){
  await p.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);
  for(const width of [320,390,430]){
   await p.setViewportSize({width,height:844});await p.click('#nav-home');
   const bounds=await p.locator('#bnav').boundingBox();assert.equal(Math.round(844-bounds.y-bounds.height),4);assert.equal(Math.round(bounds.height),66);
   assert(!(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));
   await p.evaluate(()=>document.documentElement.style.setProperty('--safe-b','34px'));
   const safe=await p.locator('#bnav').boundingBox();assert.equal(Math.round(844-safe.y-safe.height),34);
   await p.evaluate(()=>document.documentElement.style.removeProperty('--safe-b'));
   if(width===390){await p.locator('#page-home .scroll').evaluate(e=>e.scrollTop=0);await p.screenshot({path:'artifacts/budget-wallet-'+theme+'.png'});}
  }
 }
 assert.deepEqual(errors,[]);console.log('PASS scheduled save/undo/re-enable, independent budget, reconciliation, dark/light nav and safe-area geometry.');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});

const assert=require('node:assert/strict');
const {chromium}=require('./browser.cjs');
const engine=process.env.FOOTER_ENGINE==='webkit'?require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright').webkit:chromium;

(async()=>{
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  page.setDefaultTimeout(12000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  // A published frontend can be checked without authenticating or touching
  // anyone's financial data: Firebase is always replaced by the sample module.
  await page.route('**/firebase.js*',route=>route.fulfill({path:__dirname+'/firebase.mock.js',contentType:'text/javascript'}));
  await page.goto(process.env.FOOTER_TEST_URL||'http://127.0.0.1:4173/?long-list');
  await page.waitForFunction(()=>window.__previewData?.()&&document.querySelector('#kpi-wallet').textContent!=='—');
  await page.evaluate(()=>document.documentElement.style.setProperty('--safe-t','47px'));
  for(const width of [320,390,430])for(const height of [667,844])for(const safe of [0,34])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height});
   await page.evaluate(({safe,theme})=>{document.documentElement.style.setProperty('--safe-b',safe+'px');setTheme(theme);},{safe,theme});
   for(const tab of ['home','paid','txn','report','settings']){
    await page.evaluate(value=>switchPage(value),tab);
    const layout=await page.evaluate(()=>{
     const active=document.querySelector('.page.active'),nav=document.querySelector('#bnav');
     const body=active.getBoundingClientRect(),footer=nav.getBoundingClientRect(),scroll=active.querySelector('.scroll').getBoundingClientRect();
     const actions=active.querySelector('.txn-fab-actions')?.getBoundingClientRect();
     return{bottomGap:innerHeight-footer.bottom,overlap:body.bottom-footer.top,scrollOverlap:scroll.bottom-footer.top,
      actionOverlap:actions?scroll.bottom-actions.top:0,actionNavOverlap:actions?actions.bottom-footer.top:0,
      safePadding:parseFloat(getComputedStyle(nav).paddingBottom),overflow:document.documentElement.scrollWidth>innerWidth||document.body.scrollHeight>innerHeight+1};
    });
    const label=JSON.stringify({engine:process.env.FOOTER_ENGINE||'chromium',width,height,safe,theme,tab,layout});
    assert(Math.abs(layout.bottomGap)<1,label);
    assert(Math.abs(layout.overlap)<1,label);
    assert(layout.scrollOverlap<=1,label);
    assert(layout.actionOverlap<=1&&layout.actionNavOverlap<=1,label);
    assert(layout.safePadding>=safe,label);
    assert.equal(layout.overflow,false,label);
    if(tab==='paid'){
     await page.locator('#page-paid .scroll').evaluate(element=>element.scrollTop=element.scrollHeight);
     const last=page.locator('#page-paid .dcard .chk').last();
     assert.equal(await page.locator('#page-paid .dcard').count(),16);
     assert(await last.evaluate(element=>{
      const box=element.getBoundingClientRect();
      const hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
      return element===hit||element.contains(hit);
     }),label+' Last debt is covered');
    }
   }
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>switchPage('paid'));
  await page.locator('#page-paid .scroll').evaluate(element=>element.scrollTop=element.scrollHeight);
  await page.screenshot({path:`artifacts/footer-${process.env.FOOTER_ENGINE||'chromium'}.png`});
  assert.deepEqual(errors,[]);
  console.log('PASS mobile footer with no gap or overlapping content, last debt hit target, safe areas, viewport resizing and all five tabs on '+(process.env.FOOTER_ENGINE||'chromium')+'.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});

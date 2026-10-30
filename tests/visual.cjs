const {chromium}=require('./browser.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs');

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    page.setDefaultTimeout(12000);
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:4173/?auto');
    await page.waitForFunction(()=>window.__previewData()?.automation?.lastRun);
    for(const theme of ['light','dark'])for(const width of [320,390,768,1024,1440]){
      await page.setViewportSize({width,height:900});
      await page.evaluate(value=>setTheme(value),theme);
      for(const tab of ['home','paid','txn','report','settings','monthly','finance','tool-interest','tool-saving-calc','tool-schedule','tool-analyze']){
        await page.evaluate(value=>switchPage(value),tab);
        const overflow=await page.locator('.page.active').evaluate(root=>{
          const content=root.querySelector('.scroll');
          return document.documentElement.scrollWidth>innerWidth||content.scrollWidth>content.clientWidth+1;
        });
        assert.equal(overflow,false,`${theme}, ${width}px, ${tab}: horizontal overflow`);
      }
      const nav=await page.locator('#bnav').boundingBox();
      if(width>=1024){
        assert(nav.height>600,'Desktop navigation should use a sidebar');
      }else{
        assert.equal(Math.round(nav.height),74);
        assert.equal(Math.round(900-nav.y-nav.height),0);
      }
    }
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>switchPage('txn'));
    await page.selectOption('#txn-type-filter','in');
    await page.fill('#txn-search','luong');
    assert(await page.locator('#txn-list').innerText().then(text=>text.includes('Lương')));
    await page.getByRole('button',{name:'Xem tất cả',exact:true}).click();
    assert.equal(await page.locator('#txn-list .txn-icon-red').count(),0);
    await page.evaluate(()=>openTxnModalType('in'));
    await page.fill('#txn-name','Lương bổ sung');
    await page.fill('#txn-amount','100000');
    await page.click('#modal-txn .mbtn-save');
    await page.waitForSelector('#modal-txn',{state:'hidden'});
    assert.equal(await page.locator('#txn-search').inputValue(),'luong');
    assert.equal(await page.locator('#txn-type-filter').inputValue(),'in');
    assert.equal(await page.locator('.txn-row').filter({hasText:'Lương bổ sung'}).count(),1);
    assert.equal(await page.locator('#txn-list .txn-icon-red').count(),0);
    await page.locator('#toast').evaluate(element=>element.classList.remove('show'));
    await page.mouse.move(0,0);
    fs.mkdirSync('artifacts',{recursive:true});
    for(const theme of ['light','dark']){
      await page.evaluate(value=>{setTheme(value);switchPage('home');},theme);
      await page.setViewportSize({width:1440,height:1040});
      await page.screenshot({path:`artifacts/desktop-${theme}.png`});
      await page.setViewportSize({width:390,height:844});
      await page.screenshot({path:`artifacts/mobile-${theme}.png`});
    }
    assert.deepEqual(errors,[]);
    console.log('PASS responsive layouts at 320–1440px, light/dark, sidebar/bottom navigation, search after saving and screenshots.');
  }finally{
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exit(1);});

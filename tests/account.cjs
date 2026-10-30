const {chromium}=require('./browser.cjs');
const assert=require('node:assert/strict');

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:4173/');
    await page.waitForFunction(()=>window.__previewData?.());
    await page.locator('#nav-settings').tap();
    const toggle=page.getByRole('button',{name:'Tùy chọn tài khoản',exact:true});
    const panel=page.getByRole('region',{name:'Tùy chọn tài khoản'});
    assert.equal(await toggle.getAttribute('aria-expanded'),'false');
    assert.equal(await panel.isVisible(),false);
    for(const width of [320,390,430,1440]){
      await page.setViewportSize({width,height:844});
      for(const theme of ['light','dark']){
        await page.evaluate(value=>setTheme(value),theme);
        await toggle.tap();
        assert.equal(await toggle.getAttribute('aria-expanded'),'true');
        assert.equal(await panel.isVisible(),true);
        assert.equal(await panel.evaluate(element=>element.scrollHeight>element.clientHeight+1),false);
        await page.locator('#dark-mode-toggle').scrollIntoViewIfNeeded();
        await page.locator('label').filter({has:page.locator('#dark-mode-toggle')}).tap();
        assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),theme==='light'?'':'light');
        await page.getByRole('button',{name:'Màu sắc chủ đạo'}).tap();
        assert.equal(await page.locator('#modal-theme').isVisible(),true);
        await page.locator('#modal-theme .mbtn-cancel').tap();
        const downloadEvent=page.waitForEvent('download');
        await page.getByRole('button',{name:'Tải bản sao dữ liệu (JSON)'}).tap();
        const download=await downloadEvent;
        assert(download.suggestedFilename().endsWith('.json'));
        await page.getByRole('button',{name:'Số dư và lịch sử cập nhật'}).tap();
        assert.equal(await page.locator('#modal-wallet').isVisible(),true);
        await page.keyboard.press('Escape');
        await toggle.tap();
        assert.equal(await toggle.getAttribute('aria-expanded'),'false');
        assert.equal(await panel.isVisible(),false);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      }
    }
    await toggle.tap();
    await page.getByRole('button',{name:'Đăng xuất',exact:true}).tap();
    assert.equal(await page.locator('#ca-cancel').isVisible(),true);
    await page.locator('#ca-cancel').tap();
    assert.equal(await panel.isVisible(),true);
    await toggle.tap();
    await toggle.focus();
    await page.keyboard.press('Enter');
    assert.equal(await panel.isVisible(),true);
    await page.keyboard.press('Space');
    assert.equal(await panel.isVisible(),false);
    assert.equal(await page.locator('.management-link').isVisible(),true);
    assert.deepEqual(errors,[]);
    console.log('PASS account touch/keyboard expansion, unclipped settings, theme picker, balance history and JSON download at mobile/desktop sizes.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});

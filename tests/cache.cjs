const {chromium}=require('./browser.cjs');
const http=require('node:http');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');

// A real HTTP cache test: first visit stores obsolete unversioned CSS/modules.
// The next navigation must request an entirely versioned, coherent release.
(async()=>{
  const root=path.join(__dirname,'..');
  const assets=(await fs.readdir(root)).filter(name=>/\.(js|css)$/.test(name));
  const requests=[];
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    try{
      if(url.pathname==='/prime-cache'){
        res.setHeader('Content-Type','text/html');
        return res.end('<!doctype html>'+assets.map(name=>name.endsWith('.css')?`<link rel="stylesheet" href="/${name}">`:`<script type="module" src="/${name}"></script>`).join(''));
      }
      const name=url.pathname.slice(1);
      if(assets.includes(name)){
        requests.push({name,version:url.searchParams.get('v')});
        res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'text/javascript');
        res.setHeader('Cache-Control','public, max-age=3600');
        if(!url.searchParams.has('v'))return res.end(name.endsWith('.css')?'body{background:#090a10}.nav-brand,.nav-footer{display:block}':'window.__obsoleteAsset=true;');
        return res.end(await fs.readFile(path.join(root,name==='firebase.js'?'tests/firebase.mock.js':name)));
      }
      res.setHeader('Cache-Control','no-store');
      res.setHeader('Content-Type','text/html');
      res.end(await fs.readFile(path.join(root,'index.html')));
    }catch(error){res.statusCode=500;res.end(error.message);}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    const base=`http://127.0.0.1:${server.address().port}`;
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base+'/prime-cache');
    assert.equal(requests.length,assets.length);
    requests.length=0;
    await page.goto(base+'/?auto');
    await page.waitForFunction(()=>window.__previewData?.()?.automation?.lastRun);
    assert.equal(await page.evaluate(()=>window.__obsoleteAsset),undefined);
    assert(requests.length>=assets.length,'CSS and every module must use a new URL');
    assert(requests.every(request=>/^[a-f0-9]{12}$/.test(request.version)));
    assert.equal(new Set(requests.map(request=>request.version)).size,1);
    for(const width of [320,390,430]){
      await page.setViewportSize({width,height:844});
      for(const theme of ['light','dark']){
        await page.evaluate(value=>setTheme(value),theme);
        assert.equal(await page.locator('.nav-brand').isVisible(),false);
        assert.equal(await page.locator('.nav-section-label').isVisible(),false);
        assert.equal(await page.locator('.nav-footer').isVisible(),false);
        const arrow=await page.locator('.reserved-button svg').boundingBox();
        assert.equal(arrow.width,14);
        assert.equal(arrow.height,14);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        assert.equal(await page.locator('#bnav .ni:visible').count(),5);
      }
    }
    await page.setViewportSize({width:1440,height:1040});
    assert.equal(await page.locator('.nav-brand').isVisible(),true);
    assert.deepEqual(errors,[]);
    console.log('PASS upgrade with obsolete CSS/modules in HTTP cache, coherent asset versions, mobile icons and navigation, light/dark and desktop sidebar.');
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exit(1);});

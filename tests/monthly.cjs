const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/S.Housing/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('assert/strict');
(async()=>{
 const b=await chromium.launch({channel:'msedge',headless:true});
 try{
 const p=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});p.setDefaultTimeout(12000);
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const save=async id=>{await p.click(id+' .mbtn-save');await p.waitForSelector(id,{state:'hidden'});};
 const text=async(id,value)=>assert.equal(await p.locator('#'+id).textContent(),value);
 const data=()=>p.evaluate(async()=>{const {normalizeData}=await import('/data-schema.js');return normalizeData(window.__previewData());});
 const openPlan=async()=>{await p.click('#nav-settings');await p.click('.management-link');};
 const openMonthly=async()=>{await p.click('#nav-txn');await p.click('.fin-fixed-btn');};
 await p.goto('http://127.0.0.1:4173/?ledger');await p.waitForSelector('#page-home.active');await p.waitForFunction(()=>document.querySelector('#hero-balance').textContent==='10.000.000đ'||document.querySelector('#hero-balance').textContent==='30.000.000đ');await openPlan();
 await p.locator('#page-finance .add-row').nth(1).click();await p.fill('#mf-name','Internet');await p.fill('#mf-amount','300000');await save('#modal-fin');
 let state=await data();const month=Object.keys(state.recurringPlans)[0];assert(state.recurringPlans[month].expense.some(x=>x.name==='Internet'));
 await p.evaluate(()=>shiftMonth(1));assert((await p.locator('#list-expense').textContent()).includes('Internet'));
 await p.evaluate(()=>shiftMonth(-1));await p.locator('#list-expense .s-info').filter({hasText:'Internet'}).click();await p.selectOption('#mf-repeat','month');await p.fill('#mf-amount','500000');await save('#modal-fin');
 await p.evaluate(()=>shiftMonth(1));assert((await p.locator('#list-expense .s-info').filter({hasText:'Internet'}).textContent()).includes('300.000đ'));
 await p.evaluate(()=>shiftMonth(-1));assert((await p.locator('#list-expense .s-info').filter({hasText:'Internet'}).textContent()).includes('500.000đ'));
 await p.locator('#list-expense .s-info').filter({hasText:'Tiền nhà'}).click();await p.fill('#mf-amount','9000000');await save('#modal-fin');
 await p.evaluate(()=>shiftMonth(1));assert((await p.locator('#list-expense .s-info').filter({hasText:'Tiền nhà'}).textContent()).includes('9.000.000đ'));
 await p.evaluate(()=>shiftMonth(-2));assert((await p.locator('#list-expense .s-info').filter({hasText:'Tiền nhà'}).textContent()).includes('7.000.000đ'));
 await p.evaluate(()=>shiftMonth(1));await p.locator('#list-expense .s-info').filter({hasText:'Tiền nhà'}).click();await p.click('#mf-del');await p.click('#ca-ok');await p.waitForSelector('#modal-fin',{state:'hidden'});
 await p.evaluate(()=>shiftMonth(1));assert(!(await p.locator('#list-expense').textContent()).includes('Tiền nhà'));
 await p.evaluate(()=>shiftMonth(-2));assert((await p.locator('#list-expense').textContent()).includes('Tiền nhà'));

 // New recurring income repeats, while actual receipt belongs only to this month.
 await p.evaluate(()=>shiftMonth(1));await p.locator('#page-finance .add-row').first().click();
 await p.fill('#mf-name','Thu nhập phụ');await p.fill('#mf-amount','1000000');await save('#modal-fin');
 await openMonthly();await p.locator('#monthly-income .srow').filter({hasText:'Thu nhập phụ'}).locator('.note-link').click();await save('#modal-txn');
 assert((await p.locator('#monthly-income .srow').filter({hasText:'Thu nhập phụ'}).textContent()).includes('Hoàn tác'));
 await p.evaluate(()=>shiftMonth(1));assert((await p.locator('#monthly-income .srow').filter({hasText:'Thu nhập phụ'}).textContent()).includes('Còn 1.000.000đ'));
 // Clearing every debt reduces remaining forecast, but leaves unpaid living expenses.
 await p.goto('http://127.0.0.1:4173/');await p.waitForSelector('#page-home.active');await p.waitForFunction(()=>document.querySelector('#hero-balance').textContent==='10.000.000đ'||document.querySelector('#hero-balance').textContent==='30.000.000đ');
 await text('hero-planned','10.100.000đ');await text('hero-reserved','10.100.000đ');
 await openPlan();await p.locator('#page-finance .add-row').nth(1).click();await p.fill('#mf-name','Trả thẻ');await p.fill('#mf-amount','650000');await p.selectOption('#mf-debt','demo-card');await save('#modal-fin');
 await p.click('#nav-home');await text('hero-planned','10.100.000đ');
 await p.click('#nav-paid');
 for(const id of ['demo-card','demo-loan']){await p.click('#cb-'+id);await p.waitForFunction(id=>Object.values(window.__previewData().ticks).some(m=>m[id]),id);}
 await p.click('#nav-home');await text('hero-reserved','6.500.000đ');await text('kpi-debt-pay-mini','0đ');await text('hero-paid-planned','3.600.000đ');await text('rpt-expense','5.000.000đ');await text('donut-total','5.000.000đ');
 await openMonthly();await p.locator('#monthly-expense .srow').filter({hasText:'Tiền nhà'}).locator('.note-link').click();await save('#modal-txn');
 await p.click('#nav-home');await text('hero-reserved','0đ');await text('hero-paid-planned','10.100.000đ');await text('rpt-expense','11.500.000đ');await text('donut-total','11.500.000đ');
 await p.click('#nav-paid');await p.click('#cb-demo-card');await p.waitForFunction(()=>!Object.values(window.__previewData().ticks).some(m=>m['demo-card']));
 await p.click('#nav-home');await text('hero-reserved','650.000đ');await text('hero-paid-planned','9.450.000đ');await text('rpt-expense','10.850.000đ');
 // Legacy debt ticks are included in actual expenses, without charging an account twice.
 await p.goto('http://127.0.0.1:4173/?paid-legacy');await p.waitForSelector('#page-home.active');await p.waitForFunction(()=>document.querySelector('#hero-balance').textContent==='10.000.000đ'||document.querySelector('#hero-balance').textContent==='30.000.000đ');
 await text('kpi-debt-pay-mini','0đ');await text('hero-reserved','6.500.000đ');await text('rpt-expense','5.000.000đ');await text('donut-total','5.000.000đ');await text('hero-balance','30.000.000đ');
 await p.click('#nav-txn');await text('txn-kpi-out','5.000.000đ');assert.equal(await p.locator('.txn-row').filter({hasText:'Trả nợ:'}).count(),2);assert(!(await p.locator('#page-txn').textContent()).includes('bản cũ'));
 await p.click('#nav-report');await p.evaluate(()=>switchPage('tool-schedule'));assert((await p.locator('#schedule-list').textContent()).includes('Không còn'));
 await p.screenshot({path:'artifacts/monthly-schedule.png'});
 await p.click('#nav-home');await p.screenshot({path:'artifacts/monthly-home.png'});
 await openPlan();await p.screenshot({path:'artifacts/monthly-plans.png'});
 assert.deepEqual(errors,[]);console.log('PASS: recurring/month-only edits and deletion preserve history; debt deduplication; all-paid totals; undo; legacy ticks; chart/report/list agreement.');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1)});

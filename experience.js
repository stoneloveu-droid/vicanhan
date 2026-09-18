
/* Motion and accessible interactions; no financial state lives here. */
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.dataset.motion==='off';
document.documentElement.dataset.motion=localStorage.getItem('vn_motion')||'on';
window.toggleMotion=function(on){document.documentElement.dataset.motion=on?'on':'off';localStorage.setItem('vn_motion',on?'on':'off');};
const motionToggle=document.getElementById('motion-toggle');if(motionToggle)motionToggle.checked=!reduced();
document.addEventListener('pointerdown',event=>{
  if(reduced()||!event.target.closest('button,.ni,.quick-action,.chip,.sett-row'))return;
  const dot=document.createElement('i');dot.className='ripple-dot';dot.style.left=event.clientX+'px';dot.style.top=event.clientY+'px';document.body.appendChild(dot);setTimeout(()=>dot.remove(),560);
},{passive:true});
function accessibleControls(){
  document.querySelectorAll('[onclick]:not(button):not(a):not(input):not(label):not(.modal-bg),.mpbtn').forEach(el=>{
    if(el.classList.contains('drag-handle'))return;
    el.setAttribute('role','button');if(!el.hasAttribute('tabindex'))el.tabIndex=0;
  });
  document.querySelectorAll('.ni').forEach(el=>el.setAttribute('aria-current',el.classList.contains('active')?'page':'false'));
  document.querySelectorAll('button').forEach(el=>{
    if(!el.textContent.trim()&&!el.hasAttribute('aria-label'))el.setAttribute('aria-label',el.title||'Quay lại');
  });
}
document.addEventListener('keydown',e=>{
  if((e.key==='Enter'||e.key===' ')&&e.target.matches('[role=button]')){e.preventDefault();e.target.click();}
  if(e.key==='Escape'){const open=[...document.querySelectorAll('.modal-bg.open')].at(-1);if(open)window.closeModal(open.id);}
  if(e.key==='Tab'){
    const open=[...document.querySelectorAll('.modal-bg.open')].at(-1);if(!open)return;
    const items=[...open.querySelectorAll('button,input,select,textarea,[tabindex="0"]')].filter(el=>el.getClientRects().length&&!el.disabled);
    const first=items[0],last=items.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
  }
});
let savedFocus=null;
document.querySelectorAll('.modal-bg').forEach(modal=>{
  modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
  const title=modal.querySelector('.mtitle,.mptitle');if(title){if(!title.id)title.id=modal.id+'-title';modal.setAttribute('aria-labelledby',title.id);}
  let wasOpen=false;
  new MutationObserver(()=>{
    const open=modal.classList.contains('open');if(open===wasOpen)return;wasOpen=open;
    if(open){savedFocus=document.activeElement;accessibleControls();setTimeout(()=>modal.querySelector('input,select,button,[tabindex="0"]')?.focus({preventScroll:true}),80);}
    else if(savedFocus?.isConnected)savedFocus.focus({preventScroll:true});
  }).observe(modal,{attributes:true,attributeFilter:['class']});
});
let drag=null;
document.addEventListener('pointerdown',e=>{
  const handle=e.target.closest('.mhandle');if(!handle)return;
  const sheet=handle.closest('.msheet,.mpsheet');if(!sheet)return;
  drag={handle,sheet,start:e.clientY,dy:0};handle.setPointerCapture(e.pointerId);
});
document.addEventListener('pointermove',e=>{
  if(!drag)return;drag.dy=Math.max(0,e.clientY-drag.start);drag.sheet.style.transform='translateY('+drag.dy+'px)';
});
const finishDrag=()=>{
  if(!drag)return;const {sheet,dy}=drag;sheet.style.transform='';
  if(dy>90)window.closeModal(sheet.closest('.modal-bg').id);drag=null;
};
document.addEventListener('pointerup',finishDrag);document.addEventListener('pointercancel',()=>{if(drag)drag.sheet.style.transform='';drag=null;});
const previous=new Map();
document.addEventListener('wallet:render',()=>{
  accessibleControls();
  document.querySelectorAll('.wc-amount,.available-card strong,.tk3-val,.dsr-val').forEach(el=>{
    const value=el.textContent;if(previous.get(el.id)!==value&&!reduced()){
      el.classList.remove('number-refresh');void el.offsetWidth;el.classList.add('number-refresh');
    }
    previous.set(el.id,value);
  });
});
document.addEventListener('click',e=>{
  if(document.body.classList.contains('saving')&&e.target.closest('button,[onclick]')){e.preventDefault();e.stopImmediatePropagation();}
},true);
accessibleControls();

let swipe=null;
const tabs=['home','paid','txn','report','settings'];
document.addEventListener('pointerdown',e=>{
 if(!e.target.closest('.page.active>.scroll')||e.target.closest('button,input,select,textarea,canvas,[onclick],.drag-handle'))return;
 swipe={x:e.clientX,y:e.clientY,page:document.body.dataset.page};
},{passive:true});
document.addEventListener('pointerup',e=>{
 if(!swipe)return;
 const dx=e.clientX-swipe.x,dy=e.clientY-swipe.y,index=tabs.indexOf(swipe.page);
 if(Math.abs(dx)>85&&Math.abs(dy)<45&&index>=0&&!document.querySelector('.modal-bg.open')&&!document.body.classList.contains('saving')){
   const next=index+(dx<0?1:-1);if(tabs[next])window.switchPage(tabs[next]);
 }
 swipe=null;
},{passive:true});
document.addEventListener('pointercancel',()=>{swipe=null;});

(()=>{function init(){
  const pairs=[['.caseListPane','#caseDetail'],['.eqBoard','#eqDetail']];
  const extra=['.caseList','#caseRows','.eqList'];
  let frame;
  function clearInline(el){
    if(!el)return;
    el.style.removeProperty('height');
    el.style.removeProperty('max-height');
    el.style.removeProperty('min-height');
    el.style.removeProperty('overflow');
  }
  function sync(){
    for(const [a,b] of pairs){
      clearInline(document.querySelector(a));
      clearInline(document.querySelector(b));
    }
    for(const sel of extra) clearInline(document.querySelector(sel));
  }
  function schedule(){
    cancelAnimationFrame(frame);
    frame=requestAnimationFrame(sync);
  }
  sync();
  window.addEventListener('resize',schedule,{passive:true});
  document.querySelectorAll('[data-page]').forEach(btn=>btn.addEventListener('click',schedule));
  const obs=new MutationObserver(schedule);
  for(const [a,b] of pairs){
    [a,b].forEach(sel=>{
      const el=document.querySelector(sel);
      if(el) obs.observe(el,{attributes:true,attributeFilter:['style']});
    });
  }
  for(const sel of extra){
    const el=document.querySelector(sel);
    if(el) obs.observe(el,{attributes:true,attributeFilter:['style']});
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();

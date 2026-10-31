/* Presentation-only renderer. Values/reference numbers are supplied by the original demo.
   It neither reads a clinical file nor estimates a patient's risk. */
(() => {
  'use strict';
  const DX_PAGES=new Set(['MELIStroke.html','MELIAlz.html','MELICardio.html','MELIDiabetes.html','MELIMind.html']);
  const PAGE=(location.pathname.split('/').pop()||'').split('?')[0];
  const DX_ENHANCED=DX_PAGES.has(PAGE);
  const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const format = n => new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2}).format(n);
  const registry={sbp:['Huyết áp tâm thu','mmHg','#168ac0'],glucose:['Glucose','mg/dL','#cf9334'],ldl:['LDL-C','mg/dL','#9272bb'],hba1c:['HbA1c','%','#cf9334'],uacr:['UACR','mg/g','#649eb6'],spo2:['SpO₂','%','#168ac0'],hb:['Hemoglobin','g/dL','#bb697c']};
  function smoothPath(coords){
    if(coords.length<2)return '';
    if(coords.length===2)return `M${coords[0][0]},${coords[0][1]} L${coords[1][0]},${coords[1][1]}`;
    let d=`M${coords[0][0].toFixed(2)},${coords[0][1].toFixed(2)}`;
    for(let i=0;i<coords.length-1;i++){
      const p0=coords[Math.max(0,i-1)],p1=coords[i],p2=coords[i+1],p3=coords[Math.min(coords.length-1,i+2)];
      const c1x=p1[0]+(p2[0]-p0[0])/6,c1y=p1[1]+(p2[1]-p0[1])/6;
      const c2x=p2[0]-(p3[0]-p1[0])/6,c2y=p2[1]-(p3[1]-p1[1])/6;
      d+=` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
    }
    return d;
  }
  function render(options) {
    const svg=options.svg||document.getElementById('trendChart');if(!svg)return;
    const themeColor=getComputedStyle(document.documentElement).getPropertyValue('--tool-accent').trim()||'#168ac0';
    const meta=registry[options.metric]||[options.label||options.metric,options.unit||'',options.color||themeColor];
    const label=options.label||meta[0],unit=options.unit||meta[1],color=options.color||meta[2];
    const values=options.values.map(Number).filter(Number.isFinite);if(!values.length)return;
    const ref=Number(options.reference),hasRef=Number.isFinite(ref),last=values.at(-1),diff=last-values[0];
    const wrap=svg.closest('.chartWrap');if(!wrap)return;
    const panel=svg.closest('.panel');panel?.classList.add('mc-trend-panel');
    document.querySelectorAll('[data-metric]').forEach(b=>{const active=b.dataset.metric===options.metric;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    let summary=wrap.querySelector('.mc-trend-summary');
    if(!summary){summary=document.createElement('div');summary.className='mc-trend-summary';wrap.prepend(summary);}
    summary.innerHTML=`<div><span class="mc-metric-label">${escape(label)}</span><div class="mc-metric-number">${format(last)} <small>${escape(unit)}</small></div></div><div class="mc-metric-change"><span>${diff>0?'↗':diff<0?'↘':'→'} ${diff>0?'+':''}${format(diff)} ${escape(unit)}</span><small>so với mốc đầu · dữ liệu mẫu</small></div>`;
    summary.style.setProperty('--metric-color',color);
    // Use actual rendered width rather than stretching a fixed viewBox and distorting text.
    const width=Math.max(240,Math.round(svg.getBoundingClientRect().width||600)),height=280;
    const p={l:width<350?40:52,r:width<350?25:42,t:30,b:48};
    const minValue=Math.min(...values,hasRef?ref:values[0]),maxValue=Math.max(...values,hasRef?ref:values[0]);
    const spread=Math.max(maxValue-minValue,Math.abs(last)*.08,1),rawLow=Math.max(0,minValue-spread*.27),rawHigh=maxValue+spread*.33;
    const rough=(rawHigh-rawLow)/4,power=10**Math.floor(Math.log10(rough)),factor=rough/power;
    const tickStep=(factor<=1?1:factor<=2?2:factor<=5?5:10)*power,low=Math.floor(rawLow/tickStep)*tickStep,high=Math.ceil(rawHigh/tickStep)*tickStep;
    const ticks=Array.from({length:Math.round((high-low)/tickStep)+1},(_,i)=>high-i*tickStep);
    const x=i=>p.l+(width-p.l-p.r)*i/Math.max(1,values.length-1),y=n=>height-p.b-(n-low)/(high-low)*(height-p.t-p.b);
    const bottom=height-p.b,coords=values.map((v,i)=>[x(i),y(v)]),points=DX_ENHANCED?smoothPath(coords):coords.map((c,i)=>`${i?'L':'M'}${c[0].toFixed(2)},${c[1].toFixed(2)}`).join(' '),area=points+` L${x(values.length-1).toFixed(2)},${bottom} L${x(0).toFixed(2)},${bottom} Z`;
    const labels=options.labels||values.map((_,i)=>i===values.length-1?'Mới nhất':`Lần ${i+1}`);
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('preserveAspectRatio','xMidYMid meet');svg.setAttribute('role','img');svg.setAttribute('aria-label',`${label}: ${values.map(format).join(', ')} ${unit}. Dữ liệu minh họa.`);
    svg.innerHTML=`<title>${escape(label)} · 6 mốc dữ liệu minh họa</title><desc>${values.map((v,i)=>`${escape(labels[i])}: ${format(v)} ${escape(unit)}`).join('; ')}</desc><defs><linearGradient id="mc-trend-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity="${DX_ENHANCED?'.22':'.15'}"/><stop offset="100%" stop-color="${color}" stop-opacity=".015"/></linearGradient>${DX_ENHANCED?`<filter id="mc-line-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`:''}</defs>
      ${ticks.map(val=>{const yy=y(val);return `<line x1="${p.l}" y1="${yy}" x2="${width-p.r}" y2="${yy}" stroke="#e6edf2" stroke-dasharray="3 5"/><text x="${p.l-10}" y="${yy+4}" text-anchor="end" fill="#475569" font-size="14">${format(Math.round(val*10)/10)}</text>`;}).join('')}
      ${hasRef?`<line x1="${p.l}" y1="${y(ref)}" x2="${width-p.r}" y2="${y(ref)}" stroke="#91a5b4" stroke-width="1.5" stroke-dasharray="5 5"/>`:''}
      <path d="${area}" fill="url(#mc-trend-gradient)"/><path d="${points}" fill="none" stroke="${color}" stroke-width="${DX_ENHANCED?4:3}" stroke-linecap="round" stroke-linejoin="round" ${DX_ENHANCED?'filter="url(#mc-line-glow)"':''}/>
      ${values.map((v,i)=>`${DX_ENHANCED?`<circle class="mc-dot-halo" cx="${x(i)}" cy="${y(v)}" r="${i===values.length-1?11:8}" fill="${color}" fill-opacity="${i===values.length-1?'.14':'.09'}"/>`:''}<circle class="mc-dot-core" cx="${x(i)}" cy="${y(v)}" r="${i===values.length-1?7:5}" fill="white" stroke="${color}" stroke-width="${i===values.length-1?3.5:2.5}"/>${DX_ENHANCED?`<circle cx="${x(i)}" cy="${y(v)}" r="${i===values.length-1?2.5:1.8}" fill="${color}"/>`:''}<circle class="mc-chart-hit" tabindex="0" role="img" aria-label="${escape(labels[i])}: ${format(v)} ${escape(unit)}" cx="${x(i)}" cy="${y(v)}" r="15" fill="transparent" data-mc-tip="${escape(labels[i])} · ${format(v)} ${escape(unit)}"><title>${escape(labels[i])}: ${format(v)} ${escape(unit)}</title></circle>${width>480||i===values.length-1?`<text x="${x(i)}" y="${Math.max(17,y(v)-16)}" fill="#1e293b" text-anchor="middle" font-weight="700" font-size="${i===values.length-1?15:14}">${format(v)}</text>`:''}<text x="${x(i)}" y="${height-18}" fill="${i===values.length-1?'#355669':'#475569'}" text-anchor="middle" font-size="${width<350?12:14}">${escape(width<380&&!options.labels?(i===values.length-1?'Mới':String(i+1)):labels[i])}</text>`).join('')}`;
    svg.querySelectorAll('text').forEach(t=>t.style.setProperty('font-size',(t.getAttribute('font-size')||'12')+'px','important'));
    let legend=wrap.querySelector('.chartLegend');if(!legend){legend=document.createElement('div');legend.className='chartLegend';wrap.append(legend);}
    legend.innerHTML=`<span><i class="mc-legend-line" style="background:${color}"></i>Giá trị minh họa</span>${hasRef?`<span><i class="mc-legend-ref"></i>Tham chiếu mẫu: ${format(ref)} ${escape(unit)}</span>`:''}`;
    let details=wrap.querySelector('.mc-chart-data');if(!details){details=document.createElement('details');details.className='mc-chart-data';wrap.append(details);}
    details.innerHTML=`<summary>Xem số liệu từng mốc <span>6 mốc</span></summary><div class="mc-data-scroll"><table><thead><tr>${labels.map(t=>`<th>${escape(t)}</th>`).join('')}</tr></thead><tbody><tr>${values.map(v=>`<td>${format(v)} <small>${escape(unit)}</small></td>`).join('')}</tr></tbody></table></div>`;
    let tip=wrap.querySelector('.mc-chart-tooltip');if(!tip){tip=document.createElement('div');tip.className='mc-chart-tooltip';tip.hidden=true;wrap.append(tip);}
    svg.querySelectorAll('.mc-chart-hit').forEach(dot=>{const show=()=>{const a=dot.getBoundingClientRect(),b=wrap.getBoundingClientRect();tip.textContent=dot.dataset.mcTip;tip.hidden=false;tip.style.left=Math.max(85,Math.min(b.width-85,a.x-b.x+a.width/2))+'px';tip.style.top=(a.y-b.y-10)+'px';};dot.addEventListener('pointerenter',show);dot.addEventListener('focus',show);dot.addEventListener('pointerleave',()=>tip.hidden=true);dot.addEventListener('blur',()=>tip.hidden=true);});
    svg._mcOptions={...options,svg};
    if(!svg._mcResize&&'ResizeObserver' in window){let lastWidth=width;svg._mcResize=new ResizeObserver(()=>{const next=Math.round(svg.getBoundingClientRect().width);if(next>0&&Math.abs(next-lastWidth)>2){lastWidth=next;render(svg._mcOptions);}});svg._mcResize.observe(svg);}
  }
  window.MELICharts={renderTrend:render};
})();

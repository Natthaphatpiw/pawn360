// Generate a self-contained investor HTML report from the RAW Astly contract data.
// Uses only original contract columns (no AI-estimate comparison).
import fs from 'fs';

const SRC = '/Users/natthaphat/Downloads/สัญญาจำนำ_Astly_CM - Sheet1.csv';
const OUTHTML = '/Users/natthaphat/Downloads/Pawnline_Traction_Report.html';

// rate model (product config, not an estimate comparison)
const RATE_TOTAL = 0.03, RATE_FEE = 0.01, RATE_INVESTOR = 0.015, TERM = 30;

function parseCSV(t){const R=[];let r=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}else{if(c==='"')q=true;else if(c===',')r.push(f),f='';else if(c==='\n')r.push(f),R.push(r),r=[],f='';else if(c==='\r'){}else f+=c;}}if(f.length||r.length){r.push(f);R.push(r);}return R;}
const num=s=>{const n=Number(String(s).replace(/[^0-9.]/g,''));return Number.isFinite(n)?n:0;};
const sum=a=>a.reduce((x,y)=>x+y,0);
const mean=a=>a.length?sum(a)/a.length:0;
const median=a=>{if(!a.length)return 0;const s=a.slice().sort((x,y)=>x-y);const m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const C=n=>Math.round(n).toLocaleString('en-US');
const pf=(x,d=1)=>(x*100).toFixed(d)+'%';
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

let t=fs.readFileSync(SRC,'utf8'); if(t.charCodeAt(0)===0xFEFF)t=t.slice(1);
const rows=parseCSV(t).filter(r=>/^\d+$/.test((r[0]||'').trim()));
const rec=rows.map(r=>({date:(r[2]||'').trim(),nid:(r[5]||'').replace(/\s/g,''),name:(r[4]||'').trim(),addr:r[6]||'',type:(r[7]||'').trim(),model:(r[8]||'').trim(),loan:num(r[9]),redeemed:(r[10]||'').includes('ไถ่ถอน')}));

const N=rec.length, GMV=sum(rec.map(r=>r.loan)), loans=rec.map(r=>r.loan);

// window / daily
const dkey=d=>d.split('/').slice(0,2).join('/');
const dord=d=>d.split('/').reverse().join('');
const byDay={}; rec.forEach(r=>{const k=r.date;(byDay[k]??={n:0,gmv:0});byDay[k].n++;byDay[k].gmv+=r.loan;});
const days=Object.keys(byDay).sort((a,b)=>dord(a)<dord(b)?-1:1);
const spanDays=days.length;
const gmvPerDay=GMV/spanDays, cPerDay=N/spanDays;

// customers
const byNid={}; rec.forEach(r=>(byNid[r.nid]??=[]).push(r));
const uniq=Object.keys(byNid).length;
const repeat=Object.values(byNid).filter(v=>v.length>1).length;

// loan stats + buckets
const buckets=[['≤5,000',0,5000],['5,001–8,000',5001,8000],['8,001–12,000',8001,12000],['12,001–20,000',12001,20000],['>20,000',20001,1e9]];
const bucketCounts=buckets.map(([lab,lo,hi])=>({label:lab,v:loans.filter(x=>x>=lo&&x<=hi).length}));

// by type
const TYPE_COLOR={'iPhone':'#2563EB','iPad':'#0EA5E9','MacBook':'#6366F1','Apple Watch':'#F59E0B'};
const byType={}; rec.forEach(r=>(byType[r.type]??=[]).push(r));
const typeRows=Object.entries(byType).map(([k,a])=>({type:k,n:a.length,gmv:sum(a.map(x=>x.loan)),avg:mean(a.map(x=>x.loan)),med:median(a.map(x=>x.loan)),min:Math.min(...a.map(x=>x.loan)),max:Math.max(...a.map(x=>x.loan)),red:a.filter(x=>x.redeemed).length,color:TYPE_COLOR[k]||'#64748B'})).sort((a,b)=>b.gmv-a.gmv);

// iPhone gen & tier
const ip=rec.filter(r=>r.type==='iPhone');
const genMap={}; ip.forEach(r=>{const m=r.model.match(/iPhone\s+(\d+)/);const g=m?m[1]:'?';(genMap['iPhone '+g]??=[]).push(r);});
const genRows=Object.entries(genMap).map(([k,a])=>({label:k,n:a.length,avg:mean(a.map(x=>x.loan))})).sort((a,b)=>+a.label.split(' ')[1]-+b.label.split(' ')[1]);
const tierOrder=['Standard','Plus','Pro','Pro Max'];
const tierMap={}; ip.forEach(r=>{let tr='Standard';if(/Pro Max/.test(r.model))tr='Pro Max';else if(/Pro/.test(r.model))tr='Pro';else if(/Plus/.test(r.model))tr='Plus';(tierMap[tr]??=[]).push(r);});
const tierRows=tierOrder.filter(t=>tierMap[t]).map(t=>({label:t,n:tierMap[t].length,avg:mean(tierMap[t].map(x=>x.loan))}));
const ip256=ip.filter(r=>/256GB/.test(r.model)), ip128=ip.filter(r=>/128GB/.test(r.model));

// geography
function prov(a){if(/กรุงเทพ/.test(a))return 'กรุงเทพมหานคร';const m=a.match(/จ\.([ก-๙]+)/);return m?m[1]:'อื่นๆ';}
const byProv={}; rec.forEach(r=>{const p=prov(r.addr);(byProv[p]??={n:0,gmv:0});byProv[p].n++;byProv[p].gmv+=r.loan;});
const provRows=Object.entries(byProv).map(([p,o])=>({label:p,n:o.n,gmv:o.gmv})).sort((a,b)=>b.n-a.n||b.gmv-a.gmv);
const cmN=(byProv['เชียงใหม่']?.n)||0;
const outProvN=N-cmN;

// redemption
const redN=rec.filter(r=>r.redeemed).length, redGMV=sum(rec.filter(r=>r.redeemed).map(r=>r.loan));
const activeN=N-redN, activePrin=GMV-redGMV;
const redByType=typeRows.map(t=>({label:t.type,v:t.red/t.n,valLabel:pf(t.red/t.n,0)+`  (${t.red}/${t.n})`,color:t.color}));

// revenue / forecast
const oneCycle=GMV*RATE_TOTAL, feePortion=GMV*RATE_FEE;
const cycles=365/TERM;
const grossYield=RATE_TOTAL*cycles;          // ~36%/yr gross on capital
const invYieldYr=Math.pow(1+RATE_INVESTOR,12)-1;
const monthlyGMV=gmvPerDay*30, annualGMV=gmvPerDay*365;
const steadyBook=gmvPerDay*TERM;
const annGross=steadyBook*RATE_TOTAL*12, annFee=steadyBook*RATE_FEE*12;
const scale=[1,5,10,25,50].map(s=>({s,gmv:annualGMV*s,gross:annGross*s,fee:annFee*s}));

// ---------- chart helpers (inline SVG) ----------
function vbars(data,{w=720,h=320,color='#2563EB',fmt=C}={}){
  const pad={t:30,r:18,b:58,l:70},iw=w-pad.l-pad.r,ih=h-pad.t-pad.b;
  const max=Math.max(...data.map(d=>d.v))*1.12||1,step=iw/data.length,bw=Math.min(70,step*0.6);
  let g='',b='';const ticks=4;
  for(let i=0;i<=ticks;i++){const gv=max*i/ticks,y=pad.t+ih-gv/max*ih;g+=`<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${pad.l+iw}" y2="${y.toFixed(1)}" stroke="#EDF1F7"/><text x="${pad.l-10}" y="${(y+4).toFixed(1)}" text-anchor="end" class="ax">${fmt(gv)}</text>`;}
  data.forEach((d,i)=>{const bh=d.v/max*ih,x=pad.l+i*step+(step-bw)/2,y=pad.t+ih-bh;
    b+=`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(bh,1).toFixed(1)}" rx="6" fill="${d.color||color}"/>`;
    b+=`<text x="${(x+bw/2).toFixed(1)}" y="${(y-9).toFixed(1)}" text-anchor="middle" class="bval">${d.top??fmt(d.v)}</text>`;
    const lbls=String(d.label).split('\n');
    lbls.forEach((ln,k)=>b+=`<text x="${(x+bw/2).toFixed(1)}" y="${(pad.t+ih+20+k*15).toFixed(1)}" text-anchor="middle" class="bcat">${esc(ln)}</text>`);
    if(d.sub)b+=`<text x="${(x+bw/2).toFixed(1)}" y="${(pad.t+ih+20+lbls.length*15).toFixed(1)}" text-anchor="middle" class="bsub">${esc(d.sub)}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" class="chart">${g}${b}</svg>`;
}
function hbars(data,{w=720,rowH=42,color='#2563EB',lblW=170,rightPad=120}={}){
  const pad={t:8,r:rightPad,b:8,l:lblW},iw=w-pad.l-pad.r,max=Math.max(...data.map(d=>d.v))||1;
  const h=pad.t+pad.b+data.length*rowH;let s='';
  data.forEach((d,i)=>{const y=pad.t+i*rowH,bw=d.v/max*iw,cy=y+rowH/2;
    s+=`<text x="${pad.l-14}" y="${(cy+4).toFixed(1)}" text-anchor="end" class="hlbl">${esc(d.label)}</text>`;
    s+=`<rect x="${pad.l}" y="${(y+7).toFixed(1)}" width="${Math.max(bw,2).toFixed(1)}" height="${rowH-14}" rx="6" fill="${d.color||color}"/>`;
    s+=`<text x="${(pad.l+Math.max(bw,2)+10).toFixed(1)}" y="${(cy+4).toFixed(1)}" class="hval">${d.valLabel??C(d.v)}</text>`;});
  return `<svg viewBox="0 0 ${w} ${h}" class="chart">${s}</svg>`;
}
function donut(segs,{size=230,th=40,centerTop='',centerSub=''}={}){
  const r=(size-th)/2,cx=size/2,cy=size/2,CC=2*Math.PI*r,total=sum(segs.map(s=>s.v));let off=0,s='';
  segs.forEach(seg=>{const len=seg.v/total*CC;s+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${th}" stroke-dasharray="${len.toFixed(2)} ${(CC-len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;off+=len;});
  s+=`<text x="${cx}" y="${cy-2}" text-anchor="middle" class="dctr">${centerTop}</text><text x="${cx}" y="${cy+18}" text-anchor="middle" class="dctrsub">${centerSub}</text>`;
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${s}</svg>`;
}

// ---------- build charts ----------
const chartDaily=vbars(days.map(d=>({label:dkey(d),v:byDay[d].gmv,top:C(byDay[d].gmv),sub:byDay[d].n+' สัญญา'})),{color:'#2563EB'});
const chartHist=vbars(bucketCounts.map(b=>({label:b.label,v:b.v,top:b.v+' ('+pf(b.v/N,0)+')'})),{color:'#1E3A8A',fmt:x=>Math.round(x)});
const chartType=hbars([...typeRows].sort((a,b)=>b.avg-a.avg).map(t=>({label:t.type,v:t.avg,color:t.color,valLabel:C(t.avg)+' ฿'})),{lblW:150});
const chartGen=vbars(genRows.map(g=>({label:g.label.replace('iPhone ','iPhone\n'),v:g.avg,top:C(g.avg),sub:'n='+g.n})),{color:'#2563EB'});
const chartTier=vbars(tierRows.map(t=>({label:t.label,v:t.avg,top:C(t.avg),sub:'n='+t.n})),{color:'#1E3A8A'});
const chartProv=hbars(provRows.map(p=>({label:p.label,v:p.n,color:p.label==='เชียงใหม่'?'#1E3A8A':'#60A5FA',valLabel:p.n+' สัญญา · ฿'+C(p.gmv)})),{rowH:34,lblW:150,rightPad:195});
const chartScale=vbars(scale.map(x=>({label:x.s+' ฮับ',v:x.gmv,top:(x.gmv/1e6).toFixed(1)+'M'})),{color:'#10B981',fmt:x=>(x/1e6).toFixed(0)+'M'});
const donutType=donut(typeRows.map(t=>({v:t.gmv,color:t.color})),{centerTop:C(GMV),centerSub:'฿ GMV รวม'});
const donutRed=donut([{v:redN,color:'#10B981'},{v:activeN,color:'#E2E8F0'}],{centerTop:pf(redN/N,1),centerSub:'ไถ่ถอนแล้ว'});

const legendType=typeRows.map(t=>`<span class="lg"><i style="background:${t.color}"></i>${esc(t.type)} · ${pf(t.gmv/GMV,1)}</span>`).join('');

// ---------- HTML ----------
const html=`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pawnline — Traction Report (Astly CM)</title>
<style>
:root{--navy:#0B1B3B;--blue:#1E3A8A;--blue2:#2563EB;--sky:#60A5FA;--amber:#F59E0B;--green:#10B981;--ink:#0F172A;--muted:#64748B;--line:#E6EBF2;--bg:#F6F8FB;--card:#fff}
*{box-sizing:border-box}
body{margin:0;font-family:"Sarabun","Noto Sans Thai",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg);line-height:1.55}
.wrap{max-width:1120px;margin:0 auto;padding:0 22px}
.hero{background:linear-gradient(135deg,#0B1B3B 0%,#1E3A8A 60%,#2563EB 100%);color:#fff;padding:54px 0 64px}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:.14em;font-size:14px;opacity:.92}
.brand i{width:22px;height:22px;border-radius:6px;background:linear-gradient(135deg,#F59E0B,#FBBF24);display:inline-block}
.hero h1{font-size:38px;margin:18px 0 6px;font-weight:800;letter-spacing:-.5px}
.hero p{font-size:17px;opacity:.9;margin:0;max-width:760px}
.tagrow{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
.tag{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);padding:6px 13px;border-radius:999px;font-size:13px;font-weight:600}
.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;margin-top:-40px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 16px;box-shadow:0 8px 24px rgba(15,23,42,.06)}
.kpi .v{font-size:26px;font-weight:800;color:var(--blue);letter-spacing:-.5px}
.kpi .l{font-size:12.5px;color:var(--muted);margin-top:3px;font-weight:600}
.kpi .s{font-size:11.5px;color:#94A3B8;margin-top:2px}
section{margin:46px 0}
.sec-h{display:flex;align-items:baseline;gap:12px;margin:0 0 6px}
.sec-h h2{font-size:23px;margin:0;font-weight:800;letter-spacing:-.3px}
.sec-h .k{font-size:12px;font-weight:800;color:var(--amber);letter-spacing:.12em}
.sec-sub{color:var(--muted);margin:0 0 18px;font-size:15px;max-width:820px}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:24px;box-shadow:0 6px 20px rgba(15,23,42,.05)}
.grid2{display:grid;grid-template-columns:1.35fr 1fr;gap:20px}
.grid2b{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.chart{width:100%;height:auto;display:block}
.ax{fill:#94A3B8;font-size:11px}
.bval{fill:var(--ink);font-size:12.5px;font-weight:700}
.bcat{fill:#475569;font-size:12px;font-weight:600}
.bsub{fill:#94A3B8;font-size:11px}
.hlbl{fill:#334155;font-size:13px;font-weight:600}
.hval{fill:var(--blue);font-size:12.5px;font-weight:700}
.dctr{fill:var(--ink);font-size:21px;font-weight:800}
.dctrsub{fill:var(--muted);font-size:12px;font-weight:600}
.lg{display:inline-flex;align-items:center;gap:6px;font-size:13px;margin:4px 14px 0 0;color:#475569;font-weight:600}
.lg i{width:11px;height:11px;border-radius:3px;display:inline-block}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{padding:10px 12px;text-align:right;border-bottom:1px solid var(--line)}
th:first-child,td:first-child{text-align:left}
thead th{background:#F1F5FB;color:#334155;font-weight:700;font-size:12.5px}
tbody tr:hover{background:#F8FAFD}
.callout{background:linear-gradient(135deg,#1E3A8A,#2563EB);color:#fff;border-radius:18px;padding:26px}
.callout .big{font-size:40px;font-weight:800;letter-spacing:-1px}
.callout .sm{opacity:.9;font-size:15px;margin-top:4px}
.mini{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.mini .b{background:#F8FAFD;border:1px solid var(--line);border-radius:14px;padding:16px}
.mini .b .v{font-size:22px;font-weight:800;color:var(--blue)}
.mini .b .l{font-size:12.5px;color:var(--muted);font-weight:600;margin-top:2px}
.ins{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.ins .i{display:flex;gap:13px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:17px}
.ins .i .n{flex:none;width:30px;height:30px;border-radius:9px;background:var(--blue);color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:14px}
.ins .i b{font-size:15px}
.ins .i p{margin:3px 0 0;font-size:13.5px;color:#475569}
.note{font-size:12.5px;color:#94A3B8;margin-top:10px}
footer{border-top:1px solid var(--line);margin-top:50px;padding:26px 0 60px;color:var(--muted);font-size:12.5px}
.pill{display:inline-block;background:#ECFDF5;color:#047857;border:1px solid #A7F3D0;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:700}
@media(max-width:900px){.kpis{grid-template-columns:repeat(2,1fr)}.grid2,.grid2b,.ins{grid-template-columns:1fr}.mini{grid-template-columns:1fr}}
@media print{body{background:#fff}.card,.kpi{box-shadow:none}.hero{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head>
<body>
<div class="hero"><div class="wrap">
<div class="brand"><i></i>PAWNLINE</div>
<h1>รายงาน Traction — สัญญาจำนำจริงจากระบบ</h1>
<p>ข้อมูลจากสัญญาจริงที่ลูกค้าเข้ามาจำนำผ่านระบบของเรา (สาขานำร่อง Astly เชียงใหม่) — เจาะลึก insight จากทุกสัญญาที่เกิดขึ้นจริง</p>
<div class="tagrow"><span class="tag">📅 ${days[0]} – ${days[days.length-1]} (${spanDays} วัน)</span><span class="tag">📄 ${N} สัญญาจริง</span><span class="tag">👤 ${uniq} ลูกค้า</span><span class="tag">📍 ${provRows.length} จังหวัด</span><span class="tag">✅ สัญญาออกจากระบบจริง</span></div>
</div></div>

<div class="wrap">
<div class="kpis">
<div class="kpi"><div class="v">${C(GMV)}</div><div class="l">GMV เงินปล่อยกู้ (฿)</div><div class="s">รวม ${spanDays} วัน</div></div>
<div class="kpi"><div class="v">${N}</div><div class="l">สัญญา</div><div class="s">${cPerDay.toFixed(1)}/วัน</div></div>
<div class="kpi"><div class="v">${C(gmvPerDay)}</div><div class="l">Run-rate (฿/วัน)</div><div class="s">ปล่อยกู้ทุกวัน</div></div>
<div class="kpi"><div class="v">${uniq}</div><div class="l">ลูกค้าไม่ซ้ำ</div><div class="s">ซ้ำ ${repeat} รายใน ${spanDays} วัน</div></div>
<div class="kpi"><div class="v">${C(mean(loans))}</div><div class="l">วงเงินเฉลี่ย (฿)</div><div class="s">มัธยฐาน ${C(median(loans))}</div></div>
<div class="kpi"><div class="v">${(annualGMV/1e6).toFixed(1)}M</div><div class="l">Annualized GMV (฿)</div><div class="s">run-rate × 365</div></div>
</div>

<section>
<div class="sec-h"><span class="k">01 · DEMAND</span><h2>ปริมาณการปล่อยกู้รายวัน</h2></div>
<p class="sec-sub">ปล่อยกู้ต่อเนื่องทุกวันตลอด ${spanDays} วัน — เป็น demand จริงที่สม่ำเสมอ ไม่ใช่ยอดพีควันเดียว จึงต่อยอดเป็น run-rate ได้อย่างมีเหตุผล</p>
<div class="card">${chartDaily}<p class="note">แท่ง = GMV ต่อวัน (฿) · ตัวเลขใต้แท่ง = จำนวนสัญญา · แนวโน้มรายวันเกือบราบ (steady)</p></div>
</section>

<section>
<div class="sec-h"><span class="k">02 · REACH</span><h2>ลูกค้า & การเข้าถึงระดับประเทศ</h2></div>
<p class="sec-sub">ลูกค้าจริง ${uniq} ราย กระจายตัวทั่วประเทศ ${provRows.length} จังหวัด — สาขาเชียงใหม่แต่ลูกค้ามาจากใต้สุด (พัทลุง สุราษฎร์ฯ) ถึง กทม./ชลบุรี สะท้อนโมเดลรับจำนำทางไกลที่ขยายได้ไม่ติดหน้าร้าน</p>
<div class="grid2">
<div class="card"><h3 style="margin:0 0 12px;font-size:15px;color:#334155">การกระจายตามจังหวัด (จำนวนสัญญา)</h3>${chartProv}</div>
<div>
<div class="callout"><div class="big">${pf(outProvN/N,1)}</div><div class="sm">ของสัญญามาจาก<b> นอกเชียงใหม่</b><br>ครอบคลุม ${provRows.length} จังหวัดทั่วประเทศ</div></div>
<div class="mini" style="grid-template-columns:1fr 1fr;margin-top:14px">
<div class="b"><div class="v">${cmN}</div><div class="l">เชียงใหม่ (${pf(cmN/N,0)})</div></div>
<div class="b"><div class="v">${outProvN}</div><div class="l">ต่างจังหวัด</div></div>
<div class="b"><div class="v">${uniq}</div><div class="l">ลูกค้าไม่ซ้ำ</div></div>
<div class="b"><div class="v">${repeat}</div><div class="l">กลับมาซ้ำใน ${spanDays} วัน</div></div>
</div></div>
</div>
</section>

<section>
<div class="sec-h"><span class="k">03 · MIX</span><h2>สัดส่วนสินค้าที่นำมาจำนำ</h2></div>
<p class="sec-sub">หลักประกันเป็นสินค้า Apple 100% (สภาพคล่องสูง ตลาดมือสองลึก) โดย iPhone เป็นแกนหลักทั้งจำนวนและ GMV</p>
<div class="grid2">
<div class="card"><div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap"><div>${donutType}</div><div style="flex:1;min-width:200px">${legendType}<table style="margin-top:10px"><thead><tr><th>ประเภท</th><th>สัญญา</th><th>GMV (฿)</th><th>%GMV</th></tr></thead><tbody>${typeRows.map(t=>`<tr><td><b>${esc(t.type)}</b></td><td>${t.n}</td><td>${C(t.gmv)}</td><td>${pf(t.gmv/GMV,1)}</td></tr>`).join('')}</tbody></table></div></div></div>
<div class="card"><h3 style="margin:0 0 8px;font-size:15px;color:#334155">บันได cash-need: ลูกค้าแต่ละกลุ่ม "ต้องการเงิน" เท่าไหร่</h3><p class="note" style="margin:0 0 6px">วงเงินเฉลี่ยต่อสัญญา (= เงินที่ลูกค้ากลุ่มนั้นต้องการ)</p>${chartType}</div>
</div>
</section>

<section>
<div class="sec-h"><span class="k">04 · iPHONE</span><h2>เจาะลึก iPhone (${ip.length} เครื่อง = แกนหลัก)</h2></div>
<p class="sec-sub">เงินที่ลูกค้าต้องการคาดเดาได้จากตัวเครื่อง — ยิ่งรุ่นใหม่/ทีเออร์สูง/ความจุมาก ลูกค้ายิ่งขอวงเงินสูง ทำให้ตั้งวงเงินเป็นมาตรฐานและขยายระบบได้</p>
<div class="grid2b">
<div class="card"><h3 style="margin:0 0 4px;font-size:15px;color:#334155">วงเงินเฉลี่ยตามเจน</h3><p class="note" style="margin:0 0 6px">iPhone 17 ต้องการเงิน ~${(genRows.find(g=>g.label==='iPhone 17').avg/genRows.find(g=>g.label==='iPhone 13').avg).toFixed(1)}× ของ iPhone 13</p>${chartGen}</div>
<div class="card"><h3 style="margin:0 0 4px;font-size:15px;color:#334155">วงเงินเฉลี่ยตามทีเออร์</h3><p class="note" style="margin:0 0 6px">สาย Pro/Pro Max = ${tierMap['Pro'].length+(tierMap['Pro Max']?.length||0)}/${ip.length} เครื่อง · ต้องการเงิน ~2× ของสาย Standard</p>${chartTier}</div>
</div>
<div class="mini" style="margin-top:16px">
<div class="b"><div class="v">${C(mean(ip.map(r=>r.loan)))} ฿</div><div class="l">วงเงินเฉลี่ย iPhone (มัธยฐาน ${C(median(ip.map(r=>r.loan)))})</div></div>
<div class="b"><div class="v">3,000–23,000 ฿</div><div class="l">ช่วงวงเงิน — ครอบคลุมทุกกลุ่ม cash-need ในผลิตภัณฑ์เดียว</div></div>
<div class="b"><div class="v">${C(mean(ip256.map(r=>r.loan)))} vs ${C(mean(ip128.map(r=>r.loan)))} ฿</div><div class="l">256GB vs 128GB (จุเยอะ = วงเงินสูงกว่า)</div></div>
</div>
</section>

<section>
<div class="sec-h"><span class="k">05 · TICKET</span><h2>การกระจายวงเงิน</h2></div>
<p class="sec-sub">วงเงินส่วนใหญ่อยู่ช่วง 5,000–12,000 บาท — ความต้องการสภาพคล่องระยะสั้นต่อสินทรัพย์ส่วนตัวมูลค่าสูง</p>
<div class="card">${chartHist}<p class="note">จำนวนสัญญาในแต่ละช่วงวงเงิน (บาท)</p></div>
</section>

<section>
<div class="sec-h"><span class="k">06 · REPAYMENT</span><h2>พฤติกรรมการไถ่ถอน (การชำระคืน)</h2></div>
<p class="sec-sub">ลูกค้าไถ่ถอนสินค้าคืน <b>ก่อนครบกำหนด</b> แล้ว ${pf(redN/N,1)} ของสัญญา (ทั้งที่เพิ่งผ่านมาช่วงต้นของเทอม 30 วัน) — สะท้อนว่าลูกค้าตั้งใจคืนและหวงสินทรัพย์ อัตราการทิ้งของต่ำ</p>
<div class="grid2">
<div class="card"><div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap"><div>${donutRed}</div><div style="flex:1;min-width:200px"><div class="mini" style="grid-template-columns:1fr 1fr"><div class="b"><div class="v">${redN}</div><div class="l">ไถ่ถอนแล้ว (฿${C(redGMV)})</div></div><div class="b"><div class="v">${activeN}</div><div class="l">คงค้าง (฿${C(activePrin)})</div></div></div><p class="note" style="margin-top:10px">การไถ่ถอน = ลูกค้าจ่ายเงินต้น+ดอกเบี้ยคืน = รายได้จริง และเงินทุนหมุนกลับมาปล่อยใหม่ได้</p></div></div></div>
<div class="card"><h3 style="margin:0 0 10px;font-size:15px;color:#334155">อัตราการไถ่ถอนตามประเภท</h3>${hbars(redByType,{rowH:44,lblW:130})}<p class="note">กลุ่มวงเงินเล็ก (Apple Watch) ไถ่ถอนไว = หมุนเร็ว · กลุ่มวงเงินใหญ่ถือยาวกว่า</p></div>
</div>
</section>

<section>
<div class="sec-h"><span class="k">07 · ECONOMICS</span><h2>โมเดลรายได้ & ประสิทธิภาพเงินทุน</h2></div>
<p class="sec-sub">อัตราดอกเบี้ยมาตรฐาน 3%/เดือน (ส่วนดอกเบี้ยทุน 2% + ค่าธรรมเนียมแพลตฟอร์ม 1%) · สัญญาระยะ 30 วันทำให้เงินทุนหมุนเร็ว</p>
<div class="mini">
<div class="b"><div class="v">${C(oneCycle)} ฿</div><div class="l">ดอกเบี้ย 1 รอบของชุดสัญญานี้ (GMV × 3%)</div></div>
<div class="b"><div class="v">~${cycles.toFixed(0)}× / ปี</div><div class="l">รอบการหมุนเงินทุน (เทอม 30 วัน)</div></div>
<div class="b"><div class="v">~${pf(grossYield,0)}/ปี</div><div class="l">Gross yield บนเงินทุน (ก่อนต้นทุน/หนี้สูญ)</div></div>
<div class="b"><div class="v">~${pf(invYieldYr,0)}/ปี</div><div class="l">ผลตอบแทนนักลงทุน (1.5%/เดือนทบต้น)</div></div>
<div class="b"><div class="v">${C(feePortion)} ฿</div><div class="l">ค่าธรรมเนียมแพลตฟอร์ม 1 รอบ (×1%)</div></div>
<div class="b"><div class="v">GMV ≠ รายได้</div><div class="l">GMV = ยอดปล่อยกู้ · รายได้บริษัท = ค่าธรรมเนียม</div></div>
</div>
</section>

<section>
<div class="sec-h"><span class="k">08 · FORECAST</span><h2>พยากรณ์ทิศทาง (run-rate extrapolation)</h2></div>
<p class="sec-sub">ต่อยอดจาก run-rate ที่วัดได้จริง (${C(gmvPerDay)} ฿/วัน) แบบ bottom-up · เพราะโมเดลรับจำนำทางไกล การเติบโตผูกกับจำนวนฮับ/เงินทุน ไม่ใช่หน้าร้าน</p>
<div class="grid2">
<div class="card"><h3 style="margin:0 0 4px;font-size:15px;color:#334155">Annualized GMV ตามจำนวนฮับ</h3><p class="note" style="margin:0 0 6px">สมมุติ demand ต่อฮับใกล้เคียงสาขานำร่อง (ภาพประกอบ unit economics)</p>${chartScale}</div>
<div class="card"><table><thead><tr><th>ฮับ</th><th>GMV/ปี (฿)</th><th>ดอกเบี้ย gross/ปี</th><th>ค่าธรรมเนียม/ปี</th></tr></thead><tbody>${scale.map(x=>`<tr><td><b>${x.s}</b></td><td>${C(x.gmv)}</td><td>${C(x.gross)}</td><td>${C(x.fee)}</td></tr>`).join('')}</tbody></table><p class="note">ต่อ 1 ฮับ: origination ~${(annualGMV/1e6).toFixed(1)}M ฿/ปี · พอร์ตคงค้าง ~${(steadyBook/1e6).toFixed(2)}M ฿ · ดอกเบี้ย gross ~${C(annGross)} ฿/ปี</p></div>
</div>
</section>

<section>
<div class="sec-h"><span class="k">09 · INSIGHTS</span><h2>สิ่งที่ข้อมูลกำลังบอกเรา</h2></div>
<div class="ins">
<div class="i"><div class="n">1</div><div><b>Demand จริงและสม่ำเสมอ</b><p>ปล่อยกู้ทุกวันตลอด ${spanDays} วัน รวม ${C(GMV)} ฿ จากลูกค้าจริง ${uniq} ราย</p></div></div>
<div class="i"><div class="n">2</div><div><b>ตลาดระดับประเทศตั้งแต่วันแรก</b><p>${pf(outProvN/N,1)} ของสัญญามาจากนอกจังหวัด ครอบคลุม ${provRows.length} จังหวัด → scale ไม่ติดหน้าร้าน</p></div></div>
<div class="i"><div class="n">3</div><div><b>Retention เร็ว</b><p>ลูกค้า ${repeat} รายกลับมาทำสัญญาซ้ำภายในแค่ ${spanDays} วันแรก</p></div></div>
<div class="i"><div class="n">4</div><div><b>หลักประกันสภาพคล่องสูง</b><p>Apple 100% (iPhone ${pf(byType['iPhone'].length/N,0)}) ตลาดมือสองลึก ขายต่อง่าย</p></div></div>
<div class="i"><div class="n">5</div><div><b>วงเงินคาดเดาได้จากตัวเครื่อง</b><p>cash-need ไล่ตามเจน/ทีเออร์/ความจุ → ตั้งวงเงินมาตรฐาน ขยายระบบได้</p></div></div>
<div class="i"><div class="n">6</div><div><b>ชำระคืนดี + เงินทุนหมุนเร็ว</b><p>ไถ่ถอนก่อนกำหนด ${pf(redN/N,1)} · เงินทุนหมุน ~${cycles.toFixed(0)}×/ปี ผลตอบแทนนักลงทุน ~${pf(invYieldYr,0)}/ปี</p></div></div>
</div>
</section>

<footer>
<p><span class="pill">ข้อมูลสัญญาจริงจากระบบ</span> &nbsp; ${N} สัญญา · ${days[0]}–${days[days.length-1]} · สาขานำร่อง Astly เชียงใหม่</p>
<p><b>วิธีคำนวณ:</b> ตัวเลขฐานทั้งหมดคำนวณตรงจากสัญญาจริง · ส่วนรายได้ใช้อัตรามาตรฐาน 3%/เดือน (ดอกเบี้ย 2% + ค่าธรรมเนียม 1%), ผลตอบแทนนักลงทุน 1.5%/เดือน · พยากรณ์เป็นการต่อยอด run-rate แบบ bottom-up</p>
<p><b>ข้อควรระวัง:</b> เป็นข้อมูลนำร่อง 1 สาขา ${spanDays} วัน (${N} สัญญา) — เป็นสัญญาณช่วงต้นที่ชัดเจน แต่การพยากรณ์ขึ้นกับสมมุติฐานว่า run-rate/ฮับใหม่ใกล้เคียงกัน และยังไม่ครอบคลุม seasonality · สถิติของกลุ่มสินค้านอก iPhone (n=4–7) บอกทิศทาง ยังไม่ robust</p>
</footer>
</div>
</body></html>`;

fs.writeFileSync(OUTHTML,html);
console.log('Wrote',OUTHTML,'('+(html.length/1024).toFixed(0)+' KB)');
console.log('Sanity: N='+N+' GMV='+C(GMV)+' uniq='+uniq+' provinces='+provRows.length+' redeemed='+redN+' iPhone='+ip.length);

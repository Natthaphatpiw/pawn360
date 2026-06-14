// Compute the 3-price + interest dataset for the Astly investor report (Next.js).
// pawn = actual loan; estimate = max(system pawn@100%, pawn) [clamp so pawn<=estimate];
// market = system market reference (resale value). Interest 3%/mo = 1.5% Astly + 1.5% investor.
import fs from 'fs';
const SRC='/Users/natthaphat/Downloads/สัญญาจำนำ_Astly_CM_ผลประเมินระบบ.csv';
const OUT='/Users/natthaphat/Downloads/astly-data.json';
const RATE=0.03, R_ASTLY=0.015, R_INV=0.015, TERM=30;

function parseCSV(t){const R=[];let r=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}else{if(c==='"')q=true;else if(c===',')r.push(f),f='';else if(c==='\n')r.push(f),R.push(r),r=[],f='';else if(c==='\r'){}else f+=c;}}if(f.length||r.length){r.push(f);R.push(r);}return R;}
const num=s=>{const n=Number(String(s).replace(/[^0-9.]/g,''));return Number.isFinite(n)?n:0;};
const sum=a=>a.reduce((x,y)=>x+y,0);
const mean=a=>a.length?sum(a)/a.length:0;
const median=a=>{if(!a.length)return 0;const s=a.slice().sort((x,y)=>x-y);const m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;};
function prov(a){if(/กรุงเทพ/.test(a))return 'กรุงเทพมหานคร';const m=a.match(/จ\.([ก-๙]+)/);return m?m[1]:'อื่นๆ';}

let t=fs.readFileSync(SRC,'utf8'); if(t.charCodeAt(0)===0xFEFF)t=t.slice(1);
const rows=parseCSV(t).slice(1).filter(r=>/^\d+$/.test((r[0]||'').trim()));

const contracts=rows.map(r=>{
  const pawn=num(r[9]);
  const rawMarket=num(r[13]);
  const sysEst=num(r[14]);
  const estimate=Math.max(sysEst,pawn);     // clamp: pawn <= estimate
  const market=Math.max(rawMarket,estimate); // keep ordering pawn <= estimate <= market
  return {
    seq:+r[0], date:(r[2]||'').trim(), nid:(r[5]||'').replace(/\s/g,''),
    type:(r[7]||'').trim(), model:(r[8]||'').trim(),
    province:prov(r[6]||''),
    pawn, estimate, market,
    intTotal:Math.round(pawn*RATE), intAstly:Math.round(pawn*R_ASTLY), intInvestor:Math.round(pawn*R_INV),
    redeemed:(r[10]||'').includes('ไถ่ถอน'),
    clamped: sysEst<pawn,
  };
});

const N=contracts.length;
const T={
  pawn:sum(contracts.map(c=>c.pawn)),
  estimate:sum(contracts.map(c=>c.estimate)),
  market:sum(contracts.map(c=>c.market)),
  intTotal:sum(contracts.map(c=>c.intTotal)),
  intAstly:sum(contracts.map(c=>c.intAstly)),
  intInvestor:sum(contracts.map(c=>c.intInvestor)),
};
const uniq=new Set(contracts.map(c=>c.nid)).size;

// daily
const dord=d=>d.split('/').reverse().join('');
const byDayM={}; contracts.forEach(c=>{(byDayM[c.date]??={n:0,pawn:0}); byDayM[c.date].n++; byDayM[c.date].pawn+=c.pawn;});
const daily=Object.keys(byDayM).sort((a,b)=>dord(a)<dord(b)?-1:1).map(d=>({date:d,n:byDayM[d].n,pawn:byDayM[d].pawn}));
const spanDays=daily.length;

// by type
const TYPES=['iPhone','iPad','MacBook','Apple Watch'];
const byType=TYPES.filter(tp=>contracts.some(c=>c.type===tp)).map(tp=>{
  const a=contracts.filter(c=>c.type===tp);
  return {type:tp,n:a.length,pawn:sum(a.map(c=>c.pawn)),estimate:sum(a.map(c=>c.estimate)),market:sum(a.map(c=>c.market)),
    avgPawn:Math.round(mean(a.map(c=>c.pawn))),medPawn:Math.round(median(a.map(c=>c.pawn))),
    redeemed:a.filter(c=>c.redeemed).length};
}).sort((a,b)=>b.pawn-a.pawn);

// iPhone gen & tier (avg pawn)
const ip=contracts.filter(c=>c.type==='iPhone');
const genM={}; ip.forEach(c=>{const m=c.model.match(/iPhone\s+(\d+)/);const g=m?m[1]:'?';(genM[g]??=[]).push(c);});
const gen=Object.keys(genM).sort((a,b)=>+a-+b).map(g=>({label:'iPhone '+g,n:genM[g].length,avgPawn:Math.round(mean(genM[g].map(c=>c.pawn)))}));
const tierOrder=['Standard','Plus','Pro','Pro Max'];
const tierM={}; ip.forEach(c=>{let tr='Standard';if(/Pro Max/.test(c.model))tr='Pro Max';else if(/Pro/.test(c.model))tr='Pro';else if(/Plus/.test(c.model))tr='Plus';(tierM[tr]??=[]).push(c);});
const tier=tierOrder.filter(t=>tierM[t]).map(t=>({label:t,n:tierM[t].length,avgPawn:Math.round(mean(tierM[t].map(c=>c.pawn)))}));

// province
const provM={}; contracts.forEach(c=>{(provM[c.province]??={n:0,pawn:0}); provM[c.province].n++; provM[c.province].pawn+=c.pawn;});
const provinces=Object.entries(provM).map(([p,o])=>({name:p,n:o.n,pawn:o.pawn})).sort((a,b)=>b.n-a.n||b.pawn-a.pawn);

// loan buckets
const bk=[['≤5,000',0,5000],['5,001–8,000',5001,8000],['8,001–12,000',8001,12000],['12,001–20,000',12001,20000],['>20,000',20001,1e9]];
const buckets=bk.map(([l,lo,hi])=>({label:l,n:contracts.filter(c=>c.pawn>=lo&&c.pawn<=hi).length}));

// redemption
const redN=contracts.filter(c=>c.redeemed).length;
const redPawn=sum(contracts.filter(c=>c.redeemed).map(c=>c.pawn));

// forecast (run-rate)
const pawnPerDay=T.pawn/spanDays;
const annualGMV=pawnPerDay*365, monthlyGMV=pawnPerDay*30, steadyBook=pawnPerDay*TERM;
const annInterest=steadyBook*RATE*12, annAstly=steadyBook*R_ASTLY*12, annInvestor=steadyBook*R_INV*12;
const scale=[1,5,10,25,50].map(s=>({hubs:s,gmv:Math.round(annualGMV*s),interest:Math.round(annInterest*s),astly:Math.round(annAstly*s),investor:Math.round(annInvestor*s)}));

const out={
  meta:{from:daily[0].date,to:daily[spanDays-1].date,spanDays,N,uniq,provinces:provinces.length,
    rate:RATE,rAstly:R_ASTLY,rInvestor:R_INV,term:TERM,clampedCount:contracts.filter(c=>c.clamped).length},
  totals:T,
  ratios:{ // for the 3-price story
    utilization:T.pawn/T.estimate,           // customers drew this share of approved appraisal
    ltvMarket:T.pawn/T.market,               // loan as share of resale value
    estVsMarket:T.estimate/T.market,
    cushion:T.market/T.pawn,                 // resale value per 1 THB lent
    headroom:1-T.pawn/T.estimate,
  },
  loanStats:{avg:Math.round(mean(contracts.map(c=>c.pawn))),median:Math.round(median(contracts.map(c=>c.pawn))),
    min:Math.min(...contracts.map(c=>c.pawn)),max:Math.max(...contracts.map(c=>c.pawn))},
  daily, byType, gen, tier, provinces, buckets,
  redemption:{n:redN,rate:redN/N,pawn:redPawn,activeN:N-redN,activePawn:T.pawn-redPawn},
  forecast:{pawnPerDay:Math.round(pawnPerDay),monthlyGMV:Math.round(monthlyGMV),annualGMV:Math.round(annualGMV),
    steadyBook:Math.round(steadyBook),annInterest:Math.round(annInterest),annAstly:Math.round(annAstly),annInvestor:Math.round(annInvestor),scale},
  contracts,
};

fs.writeFileSync(OUT,JSON.stringify(out,null,2));
const C=n=>Math.round(n).toLocaleString();
console.log('Wrote',OUT);
console.log('N='+N+' uniq='+uniq+' span='+spanDays+'d clamped='+out.meta.clampedCount+' rows');
console.log('--- 3 PRICES (totals) ---');
console.log('ราคาจำนำจริง (pawn):   '+C(T.pawn));
console.log('ราคาประเมิน (estimate): '+C(T.estimate)+'  (clamped up where pawn>system est)');
console.log('ราคากลาง (market):     '+C(T.market));
console.log('--- ratios ---');
console.log('utilization pawn/estimate: '+(out.ratios.utilization*100).toFixed(1)+'%  (headroom '+(out.ratios.headroom*100).toFixed(1)+'%)');
console.log('LTV pawn/market: '+(out.ratios.ltvMarket*100).toFixed(1)+'%  cushion '+out.ratios.cushion.toFixed(2)+'x');
console.log('--- interest (1 cycle on this cohort) ---');
console.log('total 3%: '+C(T.intTotal)+'  | Astly 1.5%: '+C(T.intAstly)+'  | investor 1.5%: '+C(T.intInvestor));
console.log('--- forecast/1 hub ---');
console.log('annual GMV '+C(annualGMV)+' | annual interest '+C(annInterest)+' (Astly '+C(annAstly)+' / inv '+C(annInvestor)+')');
console.log('--- ordering check (pawn<=estimate<=market per row) ---');
const bad=contracts.filter(c=>!(c.pawn<=c.estimate)).length;
const pawnGtMarket=contracts.filter(c=>c.pawn>c.market).length;
console.log('rows pawn>estimate: '+bad+' (must be 0) | rows pawn>market: '+pawnGtMarket+' (anomalies)');

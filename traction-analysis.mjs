// Investor traction analysis over the Astly CM pawn-contract dataset (enriched CSV).
// Every number is computed from data; assumptions are stated explicitly.
import fs from 'fs';

const OUT = '/Users/natthaphat/Downloads/สัญญาจำนำ_Astly_CM_ผลประเมินระบบ.csv';
const TODAY = new Date(2026, 4, 29); // 2026-05-29 (month is 0-indexed)

// ---- product rate model (grounded in code defaults) ----
const RATE_TOTAL = 0.03;     // 3%/month borrower-facing (pawn/new default; estimate/pawn-summary)
const RATE_FEE = 0.01;       // 1%/month platform fee portion
const RATE_INVESTOR = 0.015; // 1.5%/month SILVER investor yield (investor-tier)
const TERM_DAYS = 30;

function parseCSV(text){const rows=[];let row=[],field='',q=false;for(let i=0;i<text.length;i++){const c=text[i];if(q){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else q=false;}else field+=c;}else{if(c==='"')q=true;else if(c===',')row.push(field),field='';else if(c==='\n')row.push(field),rows.push(row),row=[],field='';else if(c==='\r'){}else field+=c;}}if(field.length||row.length){row.push(field);rows.push(row);}return rows;}
const num = (s) => { const n = Number(String(s).replace(/[^0-9.]/g,'')); return Number.isFinite(n)?n:0; };
const sum = (a)=>a.reduce((x,y)=>x+y,0);
const mean = (a)=>a.length?sum(a)/a.length:0;
const median = (a)=>{if(!a.length)return 0;const s=a.slice().sort((x,y)=>x-y);const m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const pctl=(a,p)=>{if(!a.length)return 0;const s=a.slice().sort((x,y)=>x-y);const idx=(s.length-1)*p/100;const lo=Math.floor(idx),hi=Math.ceil(idx);return lo===hi?s[lo]:s[lo]*(hi-idx)+s[hi]*(idx-lo);};
const stdev=(a)=>{if(a.length<2)return 0;const m=mean(a);return Math.sqrt(sum(a.map(x=>(x-m)**2))/(a.length-1));};
function parseDMY(s){const m=String(s).trim().match(/(\d{2})\/(\d{2})\/(\d{4})/);if(!m)return null;return new Date(+m[3],+m[2]-1,+m[1]);}
const daysBetween=(a,b)=>Math.round((b-a)/(1000*60*60*24));

let t=fs.readFileSync(OUT,'utf8'); if(t.charCodeAt(0)===0xFEFF)t=t.slice(1);
const rows=parseCSV(t).slice(1).filter(r=>/^\d+$/.test((r[0]||'').trim()));

const recs = rows.map(r=>({
  seq:+r[0], idLabel:r[1], signDate:parseDMY(r[2]), dueDate:parseDMY(r[3]),
  name:(r[4]||'').trim(), nid:(r[5]||'').replace(/\s/g,''), addr:r[6]||'',
  type:(r[7]||'').trim(), model:(r[8]||'').trim(), loan:num(r[9]),
  redeemed:(r[10]||'').includes('ไถ่ถอน'),
  market:num(r[13]), systemPawn:num(r[14]),
}));

const N=recs.length, GMV=sum(recs.map(r=>r.loan));
const loans=recs.map(r=>r.loan);

// ---- window / velocity ----
const signDates=recs.map(r=>r.signDate).filter(Boolean);
const minD=new Date(Math.min(...signDates)), maxD=new Date(Math.max(...signDates));
const spanDays=daysBetween(minD,maxD)+1;
const byDay={};
for(const r of recs){const k=r.signDate?`${String(r.signDate.getDate()).padStart(2,'0')}/${String(r.signDate.getMonth()+1).padStart(2,'0')}`:'?';(byDay[k]??=({n:0,gmv:0})); byDay[k].n++; byDay[k].gmv+=r.loan;}

// ---- customers ----
const byNid={}; for(const r of recs){(byNid[r.nid]??=[]).push(r);}
const uniqueCustNid=Object.keys(byNid).length;
const repeatNid=Object.entries(byNid).filter(([,v])=>v.length>1);
// name-based cross check (catch nid typos)
const byName={}; for(const r of recs){(byName[r.name]??=[]).push(r);}
const repeatName=Object.entries(byName).filter(([,v])=>v.length>1);

// ---- product mix ----
const byType={}; for(const r of recs){(byType[r.type]??=({n:0,gmv:0,red:0,redGmv:0,loans:[]})); const o=byType[r.type]; o.n++; o.gmv+=r.loan; o.loans.push(r.loan); if(r.redeemed){o.red++; o.redGmv+=r.loan;}}
const byModel={}; for(const r of recs){(byModel[r.model]??=({n:0,gmv:0})); byModel[r.model].n++; byModel[r.model].gmv+=r.loan;}

// ---- redemption ----
const redeemed=recs.filter(r=>r.redeemed); const active=recs.filter(r=>!r.redeemed);
const redN=redeemed.length, redRate=redN/N;
const redGMV=sum(redeemed.map(r=>r.loan));

// ---- geography ----
function province(addr){ if(/กรุงเทพ/.test(addr))return 'กรุงเทพมหานคร'; const m=addr.match(/จ\.([^\s]+)\s*$/)||addr.match(/จ\.([ก-๙]+)/); return m?('จ.'+m[1]):'อื่นๆ';}
const byProv={}; for(const r of recs){const p=province(r.addr);(byProv[p]??=({n:0,gmv:0}));byProv[p].n++;byProv[p].gmv+=r.loan;}
const cmKeys=Object.keys(byProv).filter(p=>/เชียงใหม่/.test(p));
const cmN=sum(cmKeys.map(k=>byProv[k].n)), cmGMV=sum(cmKeys.map(k=>byProv[k].gmv));

// ---- asset quality (system comparison) ----
const marketTot=sum(recs.map(r=>r.market));      // sum of system market estimate
const sysPawnTot=sum(recs.map(r=>r.systemPawn));  // sum of system pawn @100%
const ltvOnMarket=GMV/marketTot;                  // actual loan / market
const actualVsSystem=GMV/sysPawnTot;              // actual / our 60%-cap price
const collateralCushion=marketTot/GMV;            // collateral value per 1 THB lent

// ---- interest accrued to date (active book), grounded in 3%/mo ----
let accruedToDate=0; const daysHeldActive=[];
for(const r of active){ if(!r.signDate)continue; const d=Math.min(daysBetween(r.signDate,TODAY),TERM_DAYS); daysHeldActive.push(d); accruedToDate += r.loan*RATE_TOTAL/TERM_DAYS*d; }
const fullCycleInterest = GMV*RATE_TOTAL;         // if every loan runs one 30-day cycle

// ---- velocity / run-rate ----
const contractsPerDay=N/spanDays, gmvPerDay=GMV/spanDays;

// ================= REPORT =================
const fmt=(x)=>Math.round(x).toLocaleString();
const pf=(x)=>(x*100).toFixed(1)+'%';
const L=[];
L.push('================ DATASET ================');
L.push(`Contracts: ${N} | GMV (loan disbursed): ${fmt(GMV)} THB`);
L.push(`Window: ${minD.toLocaleDateString('en-GB')} → ${maxD.toLocaleDateString('en-GB')} = ${spanDays} days`);
L.push(`Run-rate: ${contractsPerDay.toFixed(2)} contracts/day | ${fmt(gmvPerDay)} THB/day`);
L.push('');
L.push('================ LOAN SIZE ================');
L.push(`mean ${fmt(mean(loans))} | median ${fmt(median(loans))} | min ${fmt(Math.min(...loans))} | max ${fmt(Math.max(...loans))} | sd ${fmt(stdev(loans))}`);
L.push(`p25 ${fmt(pctl(loans,25))} | p75 ${fmt(pctl(loans,75))}`);
const buckets=[[0,5000],[5001,8000],[8001,12000],[12001,20000],[20001,1e9]];
L.push('buckets:');
for(const [lo,hi] of buckets){const c=loans.filter(x=>x>=lo&&x<=hi).length; L.push(`  ${fmt(lo)}-${hi>1e8?'+':fmt(hi)}: ${c} (${pf(c/N)})`);}
L.push('');
L.push('================ CUSTOMERS ================');
L.push(`Unique customers (by national ID): ${uniqueCustNid}`);
L.push(`Repeat customers (≥2 contracts, by ID): ${repeatNid.length}`);
repeatNid.forEach(([id,v])=>L.push(`  ${v[0].name}: ${v.length} contracts, ${fmt(sum(v.map(x=>x.loan)))} THB`));
L.push(`Repeat by NAME (catches ID typos): ${repeatName.length}`);
repeatName.forEach(([nm,v])=>L.push(`  ${nm}: ${v.length} | ids=${[...new Set(v.map(x=>x.nid))].join(',')}`));
L.push(`Contracts per unique customer: ${(N/uniqueCustNid).toFixed(2)}`);
L.push('');
L.push('================ PRODUCT MIX ================');
for(const [k,o] of Object.entries(byType).sort((a,b)=>b[1].gmv-a[1].gmv)) L.push(`  ${k.padEnd(12)} n=${String(o.n).padStart(2)} (${pf(o.n/N)}) | GMV ${fmt(o.gmv).padStart(8)} (${pf(o.gmv/GMV)}) | avg ${fmt(mean(o.loans))} | redeemed ${o.red}/${o.n}`);
L.push('top models by GMV:');
Object.entries(byModel).sort((a,b)=>b[1].gmv-a[1].gmv).slice(0,8).forEach(([m,o])=>L.push(`  ${m.padEnd(34)} n=${o.n} GMV ${fmt(o.gmv)}`));
// concentration HHI on type GMV
const hhiType=sum(Object.values(byType).map(o=>(o.gmv/GMV)**2));
L.push(`Type concentration HHI: ${hhiType.toFixed(3)}`);
L.push('');
L.push('================ REDEMPTION (repayment) ================');
L.push(`Redeemed so far: ${redN}/${N} = ${pf(redRate)} | redeemed GMV ${fmt(redGMV)} (${pf(redGMV/GMV)})`);
L.push(`(all contracts are 14-21 days into a 30-day term → these are EARLY redemptions)`);
for(const [k,o] of Object.entries(byType)) L.push(`  ${k.padEnd(12)} redeemed ${o.red}/${o.n} = ${pf(o.red/o.n)}`);
L.push(`Active (open) loans: ${active.length} | Active principal outstanding: ${fmt(sum(active.map(r=>r.loan)))} THB`);
L.push('');
L.push('================ GEOGRAPHY ================');
L.push(`Provinces represented: ${Object.keys(byProv).length}`);
L.push(`Chiang Mai: ${cmN}/${N} contracts (${pf(cmN/N)}) | ${pf(cmGMV/GMV)} of GMV  → out-of-province ${pf(1-cmN/N)}`);
Object.entries(byProv).sort((a,b)=>b[1].n-a[1].n).forEach(([p,o])=>L.push(`  ${p.padEnd(18)} n=${o.n} GMV ${fmt(o.gmv)}`));
L.push('');
L.push('================ ASSET QUALITY (vs our pricing engine) ================');
L.push(`Sum of system market estimate: ${fmt(marketTot)} THB`);
L.push(`Implied LTV on market (actual loan / market): ${pf(ltvOnMarket)}`);
L.push(`Collateral cushion (market / loan): ${collateralCushion.toFixed(2)}x`);
L.push(`Actual loan vs our 60%-cap system price: ${pf(actualVsSystem)} (headroom ${pf(1-actualVsSystem)})`);
L.push('');
L.push('================ INTEREST / REVENUE (rate model: 3%/mo = 2% interest + 1% fee) ================');
L.push(`Active book accrued interest to date (${active.length} loans, to ${TODAY.toLocaleDateString('en-GB')}): ${fmt(accruedToDate)} THB`);
L.push(`Full one-cycle gross interest if all held 30d (GMV×3%): ${fmt(fullCycleInterest)} THB`);
L.push(`  → platform fee portion (×1%): ${fmt(GMV*RATE_FEE)} | investor interest (×1.5%): ${fmt(GMV*RATE_INVESTOR)}`);
L.push('');
L.push('================ RUN-RATE FORECAST (per this 1 store) ================');
const monthlyGMV=gmvPerDay*30, annualGMV=gmvPerDay*365;
L.push(`Monthly origination (run-rate ×30): ${fmt(monthlyGMV)} THB`);
L.push(`Annualized origination (×365): ${fmt(annualGMV)} THB`);
// steady-state active book: origination/day × avg effective duration.
// Effective duration: bounded by 30d; with early redemptions, estimate avg held.
// Conservative: assume avg duration = TERM (30) for active + observed early for redeemed.
const effDur=30; // upper bound; revolving
const steadyBook=gmvPerDay*effDur;
L.push(`Steady-state active book (origination/day × ${effDur}d): ${fmt(steadyBook)} THB`);
L.push(`Monthly gross interest at steady state (book×3%): ${fmt(steadyBook*RATE_TOTAL)} THB`);
L.push(`Monthly platform fee at steady state (book×1%): ${fmt(steadyBook*RATE_FEE)} THB`);
L.push(`Annual gross interest at steady state: ${fmt(steadyBook*RATE_TOTAL*12)} THB`);
L.push('');
L.push('================ SCALE SCENARIOS (store expansion, per-store run-rate held constant) ================');
L.push('stores | annual GMV | annual gross interest(3%) | annual platform fee(1%)');
for(const s of [1,5,10,25,50]){ L.push(`  ${String(s).padStart(3)}   | ${fmt(annualGMV*s).padStart(12)} | ${fmt(steadyBook*RATE_TOTAL*12*s).padStart(12)} | ${fmt(steadyBook*RATE_FEE*12*s).padStart(12)}`);}

const report=L.join('\n');
fs.writeFileSync('traction-report.txt',report);
console.log(report);

// also dump machine-readable
fs.writeFileSync('traction-metrics.json', JSON.stringify({
  N, GMV, window:{from:minD,to:maxD,spanDays}, contractsPerDay, gmvPerDay,
  loan:{mean:mean(loans),median:median(loans),min:Math.min(...loans),max:Math.max(...loans),sd:stdev(loans),p25:pctl(loans,25),p75:pctl(loans,75)},
  customers:{unique:uniqueCustNid, repeat:repeatNid.length, perCust:N/uniqueCustNid},
  byType, redemption:{redN,redRate,redGMV,activeN:active.length,activePrincipal:sum(active.map(r=>r.loan))},
  geography:{provinces:Object.keys(byProv).length, cmShareN:cmN/N, cmShareGMV:cmGMV/GMV, byProv},
  assetQuality:{marketTot, ltvOnMarket, collateralCushion, actualVsSystem},
  revenue:{accruedToDate, fullCycleInterest, monthlyGMV, annualGMV, steadyBook},
}, null, 2));

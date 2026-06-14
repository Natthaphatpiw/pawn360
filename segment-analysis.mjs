// Product-segment demand analysis: per-type cash-need, iPhone by model/gen/tier.
import fs from 'fs';
const OUT='/Users/natthaphat/Downloads/สัญญาจำนำ_Astly_CM_ผลประเมินระบบ.csv';
function parseCSV(t){const R=[];let r=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}else{if(c==='"')q=true;else if(c===',')r.push(f),f='';else if(c==='\n')r.push(f),R.push(r),r=[],f='';else if(c==='\r'){}else f+=c;}}if(f.length||r.length){r.push(f);R.push(r);}return R;}
const num=s=>{const n=Number(String(s).replace(/[^0-9.]/g,''));return Number.isFinite(n)?n:0;};
const sum=a=>a.reduce((x,y)=>x+y,0);
const mean=a=>a.length?sum(a)/a.length:0;
const median=a=>{if(!a.length)return 0;const s=a.slice().sort((x,y)=>x-y);const m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const pctl=(a,p)=>{if(!a.length)return 0;const s=a.slice().sort((x,y)=>x-y);const i=(s.length-1)*p/100,lo=Math.floor(i),hi=Math.ceil(i);return lo===hi?s[lo]:s[lo]*(hi-i)+s[hi]*(i-lo);};
const fmt=x=>Math.round(x).toLocaleString();
const pf=x=>(x*100).toFixed(1)+'%';

let t=fs.readFileSync(OUT,'utf8');if(t.charCodeAt(0)===0xFEFF)t=t.slice(1);
const rows=parseCSV(t).slice(1).filter(r=>/^\d+$/.test((r[0]||'').trim()));
const rec=rows.map(r=>({type:(r[7]||'').trim(),model:(r[8]||'').trim(),loan:num(r[9]),redeemed:(r[10]||'').includes('ไถ่ถอน'),market:num(r[13])}));
const N=rec.length,GMV=sum(rec.map(r=>r.loan));

function block(title,groups){
  console.log('\n================ '+title+' ================');
  console.log('segment'.padEnd(28)+'│  n  │ %สัญญา │   GMV    │ %GMV │  เฉลี่ย │ มัธยฐาน │  ต่ำ-สูง       │ ไถ่ถอน │ LTV');
  const ent=Object.entries(groups).sort((a,b)=>b[1].length-a[1].length);
  for(const [k,arr] of ent){
    const loans=arr.map(x=>x.loan), mk=arr.map(x=>x.market).filter(x=>x>0);
    const red=arr.filter(x=>x.redeemed).length;
    const ltv=sum(mk)>0?sum(loans)/sum(arr.map(x=>x.market)):0;
    console.log(
      k.padEnd(28)+'│ '+String(arr.length).padStart(3)+' │'+
      pf(arr.length/N).padStart(7)+' │'+fmt(sum(loans)).padStart(9)+' │'+
      pf(sum(loans)/GMV).padStart(6)+'│'+fmt(mean(loans)).padStart(8)+' │'+
      fmt(median(loans)).padStart(8)+' │ '+(fmt(Math.min(...loans))+'-'+fmt(Math.max(...loans))).padEnd(13)+' │ '+
      (red+'/'+arr.length).padStart(6)+' │ '+(ltv?pf(ltv):'-')
    );
  }
}

// by type
const byType={};for(const r of rec)(byType[r.type]??=[]).push(r);
block('ตามประเภทสินค้า (cash need ต่อกลุ่ม)',byType);

// iPhone by model
const ip=rec.filter(r=>r.type==='iPhone');
const byModel={};for(const r of ip)(byModel[r.model]??=[]).push(r);
console.log('\n================ iPhone แยกตามรุ่น ('+ip.length+' เครื่อง, GMV '+fmt(sum(ip.map(r=>r.loan)))+') ================');
console.log('รุ่น'.padEnd(30)+'│ n │  GMV   │ เฉลี่ย │ มัธยฐาน│ ไถ่ถอน');
for(const [m,arr] of Object.entries(byModel).sort((a,b)=>b[1].length-a[1].length||mean(b[1].map(x=>x.loan))-mean(a[1].map(x=>x.loan)))){
  const loans=arr.map(x=>x.loan);
  console.log(m.padEnd(30)+'│ '+String(arr.length).padStart(1)+' │'+fmt(sum(loans)).padStart(7)+' │'+fmt(mean(loans)).padStart(7)+' │'+fmt(median(loans)).padStart(7)+' │ '+arr.filter(x=>x.redeemed).length+'/'+arr.length);
}

// iPhone by generation
const gen={};for(const r of ip){const m=r.model.match(/iPhone\s+(\d+)/);const g=m?('iPhone '+m[1]):'?';(gen[g]??=[]).push(r);}
block('iPhone แยกตามเจน',gen);

// iPhone by tier
const tier={};for(const r of ip){let tr='Standard';if(/Pro Max/.test(r.model))tr='Pro Max';else if(/Pro/.test(r.model))tr='Pro';else if(/Plus/.test(r.model))tr='Plus';(tier[tr]??=[]).push(r);}
block('iPhone แยกตามทีเออร์ (ยิ่งสูง = ต้องการเงินมาก?)',tier);

// storage cross-cut (all)
const stor={};for(const r of rec){const m=r.model.match(/(\d+)\s?GB|(\d+)TB/i);const s=m?(m[1]?m[1]+'GB':m[2]+'TB'):'n/a';(stor[s]??=[]).push(r);}
block('ตามความจุ (ทุกประเภท)',stor);

console.log('\n=== สรุป cash-need ladder (เรียงตามเงินเฉลี่ยที่ลูกค้าต้องการ) ===');
const ladder=Object.entries(byType).map(([k,a])=>({k,avg:mean(a.map(x=>x.loan)),med:median(a.map(x=>x.loan)),n:a.length})).sort((a,b)=>b.avg-a.avg);
ladder.forEach(x=>console.log(`  ${x.k.padEnd(12)} เฉลี่ย ${fmt(x.avg).padStart(7)} | มัธยฐาน ${fmt(x.med).padStart(7)} | n=${x.n}`));

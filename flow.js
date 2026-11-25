"use strict";
globalThis.V3Rules = (() => {
  const WINDOW_MS=30300;
  const A="https://shinycolors.enza.fun/produce?a=";
  function mode(url){return url===A?"a":url===A+"#"?"hash":null;}
  // 0.4.4: sliding window. Every observed a/hash switch time is kept; at most two switches may
  // fall inside ANY 30.3s span. (The former anchored window allowed e.g. 25s, 31s, 32s = 3 in 7s.)
  function recent(rule,now){
    if(!Array.isArray(rule.times))rule.times=rule.first!==null&&rule.first!==undefined&&now-rule.first<WINDOW_MS?Array(Math.min(2,rule.count||1)).fill(now):[];
    rule.times=rule.times.filter(t=>Number.isFinite(t)&&now-t<WINDOW_MS&&t<=now+1000);
    return rule.times;
  }
  function observe(rule,now){const t=recent(rule,now);t.push(now);rule.first=t[0];rule.count=t.length;}
  function availability(rule,now){
    if(rule.lockUntil>now)return {allowed:false,reason:"5分ロック申告中",waitMs:rule.lockUntil-now,remaining:0};
    if(rule.unknownUntil>now)return {allowed:false,reason:"開始前の履歴が不明",waitMs:rule.unknownUntil-now,remaining:0};
    const t=recent(rule,now);
    if(t.length===0)return {allowed:true,reason:"直近30秒の使用なし",waitMs:0,remaining:2};
    if(t.length>=2)return {allowed:false,reason:"直近30秒で2回使用済み",waitMs:WINDOW_MS-(now-t[t.length-2]),remaining:0};
    return {allowed:true,reason:"直近30秒で1回使用済み",waitMs:0,remaining:1};
  }
  function target(scene,x,y){
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1)return null;
    if(scene.kind==="gauge")return "アピール";
    if(scene.kind==="memoryGauge")return "思い出アピール";
    if(scene.kind!=="schedule")return null;
    if(x>=1390/1628&&x<=1610/1628&&y>=790/917&&y<=900/917)return "レッスン・仕事";
    for(const col of scene.selected||[]){const left=(350+209*col)/1628;if(x>=left&&x<=left+209/1628&&y>=540/917&&y<=725/917)return "レッスン・仕事";}
    return null;
  }
  return {WINDOW_MS,mode,observe,availability,recent,target};
})();

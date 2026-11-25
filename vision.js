"use strict";
globalThis.V3Vision=(()=>{
  function difference(actual,expected){if(!actual||actual.length!==expected.length)return 255;let sum=0;for(let i=0;i<actual.length;i++)sum+=Math.abs(actual[i]-expected[i]);return sum/actual.length;}
  // Film perforations stay recognizable when the portrait, result or scroll phase changes.
  const memoryBands=[[350,291,675,35],[350,590,675,35]];
  function perforations(rgb,w,h){
    if(!rgb||rgb.length!==w*h*3)return [];
    const runs=[];let start=null;
    for(let x=0;x<=w;x++){
      let bright=0;
      if(x<w)for(let y=0;y<h;y++){
        const i=(y*w+x)*3,r=rgb[i],g=rgb[i+1],b=rgb[i+2];
        if(r>95&&g>130&&b>130&&g>=r-10&&b>=r-10)bright++;
      }
      const hole=x<w&&bright/h>=0.35;
      if(hole&&start===null)start=x;
      if(!hole&&start!==null){
        if(x-start>=6&&x-start<=22&&start>0&&x<w)runs.push((start+x-1)/2);
        start=null;
      }
    }
    return runs;
  }
  function regular(runs){
    return runs.length>=6&&runs.length<=9&&runs.slice(1).every((x,i)=>x-runs[i]>=37&&x-runs[i]<=49);
  }
  function classify(sample){
    const scores={};
    for(const [name,p] of Object.entries(V3Templates)){if(name!=="tile")scores[name]=difference(sample(p.box,p.width,p.height),p.rgb);}
    const selected=[];
    if(scores.confirm<26&&scores.support<26){
      const p=V3Templates.tile;
      for(let i=0;i<6;i++){const b=[...p.box];b[0]+=(i-1)*209;const s=difference(sample(b,p.width,p.height),p.rgb);scores["tile"+i]=s;if(s<30)selected.push(i);}
      return {kind:"schedule",selected,scores};
    }
    if(scores.appeal<26&&scores.bar<30)return {kind:"gauge",selected,scores};
    const bands=memoryBands.map(box=>perforations(sample(box,338,14),338,14));
    scores.memoryTopHoles=bands[0].length;scores.memoryBottomHoles=bands[1].length;
    if(bands.every(regular)&&bands[0].length===bands[1].length&&bands[0].every((x,i)=>Math.abs(x-bands[1][i])<=4))return {kind:"memoryGauge",selected,scores};
    return {kind:"unknown",selected,scores};
  }
  return {classify,difference,memoryBands};
})();

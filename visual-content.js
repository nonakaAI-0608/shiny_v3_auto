"use strict";
(()=>{
  let manual=null;
  const host=document.getElementById("shiny-v3-diagnostic-panel");if(!host||!host.shadowRoot)return;
  const root=host.shadowRoot,body=root.getElementById("body");
  root.querySelector("b").textContent="V3自動試用版 0.4.4";
  const texts=document.createElement("div");texts.innerHTML='<div id="automatic" style="color:#9fe6ff"></div><div id="visual"></div><div id="budget"></div><div id="candidate" style="color:#ffd980"></div>';
  body.insertBefore(texts,body.firstChild);
  const buttons=document.createElement("div");
  function button(label,fn){const b=document.createElement("button");b.textContent=label;b.addEventListener("click",e=>{e.stopPropagation();fn();});buttons.append(b);}
  function geometry(){
    if(manual&&manual.viewportWidth===innerWidth&&manual.viewportHeight===innerHeight)return {...manual,mode:"manual"};
    const rects=[...document.querySelectorAll("canvas")].map(c=>c.getBoundingClientRect()).filter(r=>r.width>250&&r.height>140&&r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1).sort((a,b)=>b.width*b.height-a.width*a.height);
    if(!rects.length)return null;const r=rects[0],aspect=1628/917;let w=r.width,h=r.height;if(w/h>aspect)w=h*aspect;else h=w/aspect;
    return {x:Math.max(0,r.left+(r.width-w)/2),y:Math.max(0,r.top+(r.height-h)/2),width:w,height:h,viewportWidth:innerWidth,viewportHeight:innerHeight,mode:"canvas"};
  }
  function selectRange(){
    const layer=document.createElement("div");layer.dataset.v3Calibration="true";
    layer.style.cssText="position:fixed;inset:0;z-index:2147483647;background:#1118;color:white;font:16px sans-serif;cursor:crosshair";
    const text=document.createElement("div");text.style.cssText="padding:15px;background:#15253d;pointer-events:none";text.textContent="ゲーム画像の左上をクリックしてください（Escで中止）。";layer.append(text);let first;
    function cancel(){layer.remove();document.removeEventListener("keydown",key,true);}
    function key(e){if(e.key==="Escape"){e.preventDefault();e.stopPropagation();cancel();}}
    document.addEventListener("keydown",key,true);
    for(const name of ["pointerdown","pointerup","mousedown","mouseup","touchstart","touchend"])layer.addEventListener(name,e=>e.stopPropagation());
    layer.addEventListener("click",e=>{
      e.preventDefault();e.stopPropagation();if(!first){first={x:e.clientX,y:e.clientY};text.textContent="ゲーム画像の右下をクリックしてください。";return;}
      const width=e.clientX-first.x,height=e.clientY-first.y;if(width<250||height<140){text.textContent="右下を選び直してください。";return;}
      manual={x:first.x,y:first.y,width,height,viewportWidth:innerWidth,viewportHeight:innerHeight};cancel();
    });document.documentElement.append(layer);
  }
  button("ゲーム範囲を設定",selectRange);button("範囲を自動に戻す",()=>{manual=null;});
  button("自動V3を開始",async()=>{
    const r=await browser.runtime.sendMessage({action:"autoEnable"});
    root.getElementById("error").textContent=r&&r.ok===false?r.message||"開始できませんでした":"";
  });
  button("自動V3を停止",()=>browser.runtime.sendMessage({action:"autoDisable"}));
  for(const label of ["30秒ロック","5分ロック"])button(label,()=>browser.runtime.sendMessage({action:"visionFeedback",label}).catch(()=>{}));
  body.append(buttons);
  const note=root.getElementById("note");if(note)note.textContent="普段どおり操作してください。ロックが出たら下のボタンで申告してください。";
  function render(s){
    if(!s.budget)return;
    root.getElementById("visual").textContent=s.visual;
    root.getElementById("automatic").textContent=(s.automatic||"自動V3：停止中")+(s.setup?" / "+s.setup:"");
    root.getElementById("candidate").textContent="直近の検知："+s.candidate+(s.candidateAgeSeconds===null?"":"（"+s.candidateAgeSeconds+"秒前）");
    const b=s.budget;root.getElementById("budget").textContent=b.allowed?"5分ロック回数の目安：あと"+b.remaining+"回":"5分ロック回数の目安：待ち "+b.waitSeconds+"秒（"+b.reason+"）";
    // Folded panel: short form of the same estimate.
    const mini=root.getElementById("mini");if(mini)mini.textContent=(s.autoEnabled?"自動ON":"自動OFF")+" / 目安："+(b.allowed?"あと"+b.remaining+"回":"待ち "+b.waitSeconds+"秒");
  }
  const caution=document.createElement("div");caution.textContent="30秒ロックの回避は未確認です。ロック申告で自動V3を停止します。";
  caution.style.cssText="color:#ffdaa0;max-width:390px;margin-top:4px";body.append(caution);
  document.addEventListener("pointerdown",e=>{
    if(!e.isTrusted||e.button!==0||document.querySelector('[data-v3-calibration="true"]')||e.composedPath().includes(host))return;
    browser.runtime.sendMessage({action:"visionGesture",x:e.clientX,y:e.clientY,time:Date.now(),geometry:geometry()}).catch(()=>{});
  },true);
  document.addEventListener("click",e=>{
    if(!e.isTrusted||e.button!==0||document.querySelector('[data-v3-calibration="true"]')||e.composedPath().includes(host))return;
    const g=geometry();if(!g||e.clientX<g.x||e.clientX>g.x+g.width||e.clientY<g.y||e.clientY>g.y+g.height)return;
    browser.runtime.sendMessage({action:"setupGesture",time:Date.now()}).catch(()=>{});
  },true);
  browser.runtime.onMessage.addListener(m=>{if(m.action==="visionGeometry")return Promise.resolve(geometry());if(m.action==="diagnosticStatus")render(m.status);});
  setInterval(()=>browser.runtime.sendMessage({action:"status"}).then(render).catch(()=>{}),700);
})();

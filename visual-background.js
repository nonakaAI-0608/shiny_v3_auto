"use strict";
let visualEpoch=0;
let visualFrame=null, visualRecognized=null, visualArmed=null, visualSerial=0, captureBusy=false;
let visualText="停止中", candidateText="まだ検知していません", visualWasRecording=false;
let candidateAt=null, visualBlock=null, absentSince=null;
const visualRequests=new Map();
const baseStatus=status;
status=function(){
  const b=V3Rules.availability(visualRule(),Date.now());
  return {...baseStatus(),visual:visualText,candidate:candidateText,
    candidateAgeSeconds:candidateAt===null?null:Math.max(0,Math.floor((Date.now()-candidateAt)/1000)),
    budget:{...b,waitSeconds:Math.ceil(b.waitMs/1000)}};
};
function visualRule(){return state.visualRule||(state.visualRule={first:null,count:0,unknownUntil:0,lockUntil:0});}
function visualInvalidate(reason){
  visualEpoch++; visualFrame=null; visualRecognized=null;
  if(visualArmed){
    add("candidateCancelled",{candidateId:visualArmed.id,target:visualArmed.type,reason:reason||"reset"});
    candidateText=visualArmed.type+"候補：通信確認前に"+(reason==="urlSwitch"?"URL切替":"検知を中断");candidateAt=Date.now();
  }
  visualArmed=null;visualRequests.clear();
}
function activateVisual(){
  visualBlock=null;absentSince=null;
  visualRule().unknownUntil=Date.now()+V3Rules.WINDOW_MS;
  visualInvalidate();add("visualStarted",{automaticV3:false});
}
function requestMatch(){
  if(!visualArmed||visualArmed.requestId)return;
  for(const [id,r] of visualRequests){
    if(!r.claimed&&r.started>=visualArmed.clickedAt-80&&r.started<=visualArmed.clickedAt+1500){
      visualArmed.requestId=id;r.claimed=true;add("candidateRequest",{candidateId:visualArmed.id,requestId:id});
      autoMaybe(visualArmed,r);
      if(r.finished)candidateDone(r);break;
    }
  }
}
function candidateDone(r){
  if(!visualArmed||visualArmed.requestId!==r.id)return;
  const a=visualArmed;visualArmed=null;
  candidateAt=Date.now();
  if(r.statusCode===200&&!r.error)visualBlock=a.type;
  candidateText=r.statusCode===200&&!r.error?a.type+"確定候補を検知（HTTP 200）":a.type+"候補：通信失敗／未確認";
  add("candidateResult",{candidateId:a.id,target:a.type,requestId:r.id,statusCode:r.statusCode,networkError:!!r.error,durationMs:Math.round(r.finished-r.started),fiveMinuteRule:V3Rules.availability(visualRule(),Date.now()),automaticV3:false});
  publish();
}
browser.webRequest.onBeforeRequest.addListener(d=>{
  if(!belongs(d)||d.method!=="POST"||visualRequests.has(d.requestId))return;
  for(const [id,r]of visualRequests)if(d.timeStamp-r.started>5000)visualRequests.delete(id);
  visualRequests.set(d.requestId,{id:d.requestId,started:d.timeStamp,claimed:false});requestMatch();
},{urls:["https://api.shinycolors.enza.fun/*"]});
function visualFinished(d,error){
  if(!belongs(d))return;
  const r=visualRequests.get(d.requestId);if(!r)return;
  Object.assign(r,{finished:d.timeStamp,statusCode:error?null:d.statusCode,error});candidateDone(r);
}
browser.webRequest.onCompleted.addListener(d=>visualFinished(d,false),{urls:["https://api.shinycolors.enza.fun/*"]});
browser.webRequest.onErrorOccurred.addListener(d=>visualFinished(d,true),{urls:["https://api.shinycolors.enza.fun/*"]});
browser.tabs.onUpdated.addListener((id,changes,tab)=>{
  if(!tab.incognito&&isBareProduce(changes.url||tab.url)&&(changes.url||changes.status==="complete")){void setupBegin(id);return;}
  if(state.recording&&id!==state.tabId&&tab.active&&V3Rules.mode(changes.url||tab.url))void followGameTab(id);
  if(!state.recording||id!==state.tabId)return;
  if(changes.url){
    const from=V3Rules.mode(state.visualLastURL),to=V3Rules.mode(changes.url);
    if(from&&to&&from!==to&&!setupIsPreparing(id)){V3Rules.observe(visualRule(),Date.now());add("v3URLSwitch",{from,to,windowCount:visualRule().count});setupObserveFirstV3(id,from,to);}
    // 0.4.4: the preparation "back" (a=# -> a=) is a real history traversal like V3, so count it too.
    // (The preparation pushState is not a traversal and stays uncounted.)
    else if(from==="hash"&&to==="a"&&setupJob&&setupJob.tabId===id&&setupJob.stage==="back")V3Rules.observe(visualRule(),Date.now());
    if(!setupIsPreparing(id))autoNavigation(from,to,changes.url);
    else add("setupURLSwitch",{from,to,stage:setupJob.stage});
    state.visualLastURL=changes.url;visualInvalidate("urlSwitch");
    if(!isGame(changes.url)){state.recording=false;visualText="ゲーム外へ移動したため停止";}
    persist();publish();
  }
  if(changes.status==="loading")visualInvalidate();
});
browser.tabs.onActivated.addListener(info=>{if(state.recording){
  if(info.tabId!==state.tabId)void followGameTab(info.tabId);add("tabActivation",{targetActive:info.tabId===state.tabId});visualInvalidate("tabActivation");if(info.tabId===state.tabId)void visualScan();}});
function validGeometry(g){return g&&[g.x,g.y,g.width,g.height,g.viewportWidth,g.viewportHeight].every(Number.isFinite)&&g.x>=0&&g.y>=0&&g.width>=250&&g.height>=140&&g.x+g.width<=g.viewportWidth+1&&g.y+g.height<=g.viewportHeight+1;}
async function visualScan(){
  await ready;
  if(state.recording&&!visualWasRecording){activateVisual();visualWasRecording=true;}
  if(!state.recording){visualWasRecording=false;visualInvalidate();visualText="停止中";return;}
  if(captureBusy)return;captureBusy=true;
  try{
    const epoch=visualEpoch,tabId=state.tabId,tab=await browser.tabs.get(tabId);
    if(!tab.active||tab.incognito||!isGame(tab.url)){visualFrame=null;visualText="対象タブを表示してください";return;}
    state.visualLastURL ||= tab.url;
    const g=await browser.tabs.sendMessage(tabId,{action:"visionGeometry"});
    if(!validGeometry(g)){visualFrame=null;visualText="ゲーム範囲を設定してください";return;}
    const capturedAt=Date.now(),dataURL=await browser.tabs.captureTab(tabId,{format:"png"});
    const captureReturnedAt=Date.now();
    const im=new Image();im.src=dataURL;await im.decode();
    if(epoch!==visualEpoch||!state.recording||state.tabId!==tabId||!(await browser.tabs.get(tabId)).active){visualFrame=null;return;}
    const after=await browser.tabs.sendMessage(tabId,{action:"visionGeometry"});
    if(epoch!==visualEpoch||!sameGeometry(g,after)){visualFrame=null;add("frameDiscarded",{reason:"geometryOrTabChanged",before:g,after});return;}
    logGeometry(g);
    const sx=im.naturalWidth/g.viewportWidth,sy=im.naturalHeight/g.viewportHeight;
    const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d",{willReadFrequently:true});
    function sample(box,w,h){
      canvas.width=w;canvas.height=h;
      ctx.drawImage(im,(g.x+box[0]/1628*g.width)*sx,(g.y+box[1]/917*g.height)*sy,box[2]/1628*g.width*sx,box[3]/917*g.height*sy,0,0,w,h);
      const rgba=ctx.getImageData(0,0,w,h).data,rgb=[];
      for(let i=0;i<rgba.length;i+=4)rgb.push(rgba[i],rgba[i+1],rgba[i+2]);return rgb;
    }
    const scene=V3Vision.classify(sample);
    // Ignore additional clicks until this action's screen has actually gone away.
    const blockedKind=visualBlock==="アピール"?"gauge":visualBlock==="思い出アピール"?"memoryGauge":"schedule";
    if(visualBlock&&scene.kind!==blockedKind){
      absentSince ||= capturedAt;
      if(capturedAt-absentSince>=500){visualBlock=null;absentSince=null;}
    }else absentSince=null;
    if(!visualFrame||visualFrame.scene.kind!==scene.kind||visualFrame.scene.selected.join()!==scene.selected.join())add("screen",{scene:scene.kind,selected:scene.selected,scores:Object.fromEntries(Object.entries(scene.scores).map(([k,v])=>[k,Math.round(v*10)/10])),geometryMode:g.mode,geometry:g,capturedAt,captureReturnedAt,classifiedAt:Date.now()});
    visualFrame={scene,capturedAt,geometry:g,epoch};
    // Remember the last frame that showed a target screen (gauge animations flicker for a frame or two).
    if(scene.kind!=="unknown")visualRecognized=visualFrame;
    visualText=scene.kind==="memoryGauge"?"思い出アピールのゲージ画面を認識":scene.kind==="gauge"?"ゲージ画面を認識":scene.kind==="schedule"?"レッスン・仕事画面を認識":"対象画面ではない／未認識";
  }catch(_){visualFrame=null;visualText="画面取得できません：ページ読み込みを確認";}
  finally{captureBusy=false;}
}
// Chain scans instead of a fixed 250ms interval: a new capture starts soon after the previous
// one finishes, so the frame used at click time is fresher (fewer "画像が古い" skips).
const VISUAL_SCAN_GAP_MS=150, VISUAL_HOLD_MS=450;
(function scanLoop(){const started=Date.now();visualScan().finally(()=>setTimeout(scanLoop,Math.max(40,VISUAL_SCAN_GAP_MS-(Date.now()-started))));})();
setInterval(()=>{if(visualArmed&&Date.now()-visualArmed.clickedAt>2500){add("candidateTimeout",{candidateId:visualArmed.id,target:visualArmed.type});candidateText=visualArmed.type+"候補：対応する通信を確認できず";candidateAt=Date.now();visualArmed=null;publish();}},250);
browser.runtime.onMessage.addListener((m,sender)=>{
  if(!["visionGesture","visionFeedback"].includes(m.action))return;
  return (async()=>{
    await ready;
    const page=sender.tab;if(!page||page.id!==state.tabId||!isGame(page.url)||page.incognito||!state.recording)return {ok:false};
    if(m.action==="visionFeedback"){
      if(!["正しく検知","誤検知","検知漏れ","30秒ロック","5分ロック"].includes(m.label))return {ok:false};
      if(m.label==="30秒ロック"||m.label==="5分ロック")autoStop(m.label);
      add("manualFeedback",{label:m.label,lastCandidate:candidateText,candidateAgeMs:candidateAt===null?null:Date.now()-candidateAt,scene:visualFrame?visualFrame.scene.kind:null,geometry:visualFrame?visualFrame.geometry:null,fiveMinuteRule:V3Rules.availability(visualRule(),Date.now())});
      if(m.label==="5分ロック"){visualRule().lockUntil=Date.now()+300000;await persist();}
      await publish();return {ok:true,...status()};
    }
    const t=m.time,now=Date.now();
    if(!Number.isFinite(t)||Math.abs(now-t)>700||!Number.isFinite(m.x)||!Number.isFinite(m.y))return {ok:false};
    if(!visualFrame||t-visualFrame.capturedAt>700||t<visualFrame.capturedAt){add("clickUnclassified",{reason:"noRecentFrame"});return {ok:true,...status()};}
    if(m.geometry&&!sameGeometry(visualFrame.geometry,m.geometry)){add("clickUnclassified",{reason:"geometryChanged",frame:visualFrame.geometry,click:m.geometry});visualInvalidate("geometryChanged");return {ok:true,...status()};}
    let frame=visualFrame,held=false;
    if(frame.scene.kind==="unknown"&&visualRecognized&&visualRecognized.epoch===visualEpoch&&t-visualRecognized.capturedAt<=VISUAL_HOLD_MS&&sameGeometry(visualRecognized.geometry,frame.geometry)){frame=visualRecognized;held=true;}
    const g=frame.geometry,x=(m.x-g.x)/g.width,y=(m.y-g.y)/g.height,type=V3Rules.target(frame.scene,x,y);
    const roundScores=Object.fromEntries(Object.entries(visualFrame.scene.scores).map(([k,v])=>[k,Math.round(v*10)/10]));
    add("visualClick",{x:Math.round(x*10000)/10000,y:Math.round(y*10000)/10000,scene:frame.scene.kind,latestScene:visualFrame.scene.kind,heldFromPrevious:held,scores:roundScores,target:type,frameAgeMs:t-frame.capturedAt,geometry:g},t);
    if(type&&!visualArmed&&type!==visualBlock){visualArmed={id:++visualSerial,type,clickedAt:t,requestId:null,frameAgeMs:t-frame.capturedAt,epoch:visualEpoch,geometry:g};add("candidateClick",{candidateId:visualArmed.id,target:type,frameAgeMs:t-visualFrame.capturedAt},t);candidateText=type+"の確定候補：通信待ち";candidateAt=t;requestMatch();await publish();}
    return {ok:true,...status()};
  })();
});

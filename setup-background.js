"use strict";
const SETUP_A="https://shinycolors.enza.fun/produce?a=";
let setupJob=null,setupSerial=0;
function isBareProduce(url){return url==="https://shinycolors.enza.fun/produce";}
function setupIsPreparing(id){return !!setupJob&&setupJob.tabId===id&&!["done","cancelled"].includes(setupJob.stage);}
const setupBaseStatus=status;
status=function(){return {...setupBaseStatus(),setup:setupJob&&setupJob.tabId===state.tabId?({loading:"同タブ準備：a=読込中",awaitClick:"同タブ準備：ゲーム画面のクリック待ち",push:"同タブ準備：履歴作成中",back:"同タブ準備：a=に戻っています",done:setupJob.firstV3Pending?"履歴準備済み・次のa=#が初回V3":"履歴準備済み",cancelled:"履歴準備停止"}[setupJob.stage]||""):null};};
function setupCancel(reason){
  if(setupJob&&setupIsPreparing(setupJob.tabId)){setupJob.stage="cancelled";add("setupCancelled",{reason});}
}
async function moveRecordingTab(tab,reason){
  if(tab.incognito||!isGame(tab.url))throw Error("Invalid game tab");
  if(state.tabId===tab.id)return;
  const previous=state.tabId;
  const resumeAuto=autoEnabled;
  setupCancel("対象タブ変更");autoReset();visualInvalidate("tabTransfer");
  visualBlock=null;absentSince=null;candidateText="まだ検知していません";candidateAt=null;
  state.tabId=tab.id;state.visualLastURL=tab.url;gameTabs.add(tab.id);
  // Keep the log, lock reports and known V3 uses across tabs. Only history proof is per-tab.
  visualRule().unknownUntil=Math.max(visualRule().unknownUntil||0,Date.now()+V3Rules.WINDOW_MS);
  if(state.recording)add("recordingTabChanged",{previousTabId:previous,tabId:tab.id,reason,resumeAutoAfterSetup:resumeAuto});
  await persist();await publish();return resumeAuto;
}
function setupCheck(job){
  if(setupJob!==job||job.stage==="cancelled"||!state.recording||state.tabId!==job.tabId)throw Error("Setup cancelled");
}
async function setupWait(job,url,loaded){
  const until=Date.now()+15000;
  while(Date.now()<until){
    setupCheck(job);const tab=await browser.tabs.get(job.tabId);
    setupCheck(job);
    if(tab.incognito||!isGame(tab.url))throw Error("Left game");
    // Also wait until the onUpdated URL listener has handled this switch (it sets visualLastURL),
    // so preparation switches are classified while the stage is still "preparing".
    if(tab.url===url&&state.visualLastURL===url&&(!loaded||tab.status==="complete"))return;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  throw Error("Setup URL timeout");
}
async function setupBegin(tabId){
  await ready;
  if(setupIsPreparing(tabId))return;
  const tab=await browser.tabs.get(tabId);
  if(!tab.active||tab.incognito||!isBareProduce(tab.url))return;
  const wasAuto=autoEnabled;
  await moveRecordingTab(tab,"produceEntry");
  if(setupIsPreparing(tabId))return;
  autoReset();visualInvalidate("setup");visualBlock=null;absentSince=null;
  state.recording=true;state.sessionStart ||= Date.now();visualWasRecording=true;
  visualRule().unknownUntil=Math.max(visualRule().unknownUntil||0,Date.now()+V3Rules.WINDOW_MS);
  const job={id:++setupSerial,tabId,stage:"loading",resumeAuto:wasAuto};setupJob=job;
  add("setupStarted",{tabId,automaticV3:false});await persist();await publish();
  try{
    setupCheck(job);await browser.tabs.update(tabId,{url:SETUP_A});
    await setupWait(job,SETUP_A,true);job.stage="awaitClick";
    add("setupAwaitClick",{tabId});await publish();
  }catch(_){
    if(setupJob===job&&job.stage!=="cancelled"){setupCancel("a=の読み込みを確認できず");autoStop("同タブ準備に失敗");}
  }
}
async function setupClick(tabId){
  const job=setupJob;
  if(!job||job.tabId!==tabId||job.stage!=="awaitClick")return;
  job.stage="push";add("setupClick",{tabId});
  try{
    setupCheck(job);const tab=await browser.tabs.get(tabId);
    if(!tab.active||tab.url!==SETUP_A)throw Error("Setup tab changed");
    // Same-document history entry, matching ver10. The trigger is a real game click.
    await browser.tabs.executeScript(tabId,{code:'if(location.href!=="https://shinycolors.enza.fun/produce?a=")throw new Error("URL changed");history.pushState(null,"","https://shinycolors.enza.fun/produce?a=#");'});
    await setupWait(job,SETUP_A+"#",false);
    job.stage="back";await browser.tabs.goBack(tabId);await setupWait(job,SETUP_A,false);
    // The initial push and return were preparation, not actual V3 uses.
    state.visualLastURL=SETUP_A;visualInvalidate("setupComplete");
    pairProof=new Set(["a>hash","hash>a"]);job.stage="done";job.firstV3Pending=true;
    add("setupReady",{tabId,firstV3Destination:"hash",resumeAuto:job.resumeAuto,preparationCountsAsV3:false});await persist();await publish();
  }catch(_){
    if(setupJob===job&&job.stage!=="cancelled"){setupCancel("履歴作成・戻るの確認に失敗");autoStop("同タブ準備に失敗");}
    return;
  }
  await setupForwardFirstV3(job);
}
// 0.4.3: perform the first real V3 (a= -> a=#) right after preparation instead of waiting
// for a manual "forward". Stage is already "done", so the URL listener counts it exactly like
// the manual forward did (V3Rules.observe + setupObserveFirstV3). Auto V3 stays off meanwhile.
async function setupForwardFirstV3(job){
  const tabId=job.tabId;
  let forwarded=false;
  try{
    if(setupJob!==job||job.stage!=="done"||!state.recording||state.tabId!==tabId)return;
    const rule=visualRule(),now=Date.now();
    const blocked=rule.lockUntil>now||V3Rules.recent(rule,now).length>=2;
    const tab=await browser.tabs.get(tabId);
    if(blocked||!tab.active||tab.incognito||tab.url!==SETUP_A||state.visualLastURL!==SETUP_A){
      add("setupAutoForwardSkipped",{tabId,blocked});return;
    }
    add("setupAutoForward",{tabId});
    await browser.tabs.goForward(tabId);
    await setupWait(job,SETUP_A+"#",false);
    forwarded=true;
  }catch(_){
    add("setupAutoForwardFailed",{tabId});
  }finally{
    if(setupJob===job&&job.stage==="done"&&state.recording&&state.tabId===tabId){
      autoEnabled=job.resumeAuto;autoEpoch++;
      autoMessage=forwarded
        ?(autoEnabled?"初回V3（a=#）を自動実行・次の確定操作を待機":"初回V3（a=#）を自動実行済み・自動V3を開始できます")
        :(autoEnabled?"次の確定操作で初回V3（a=#へ進む）":"履歴準備済み・自動V3を開始できます");
      await persist();await publish();
    }
  }
}
browser.runtime.onMessage.addListener((m,sender)=>{
  if(m.action!=="setupGesture")return;
  return (async()=>{
    await ready;const tab=sender.tab;
    if(!tab||tab.id!==state.tabId||tab.incognito||!isGame(tab.url)||!Number.isFinite(m.time)||Math.abs(Date.now()-m.time)>700)return {ok:false};
    await setupClick(tab.id);return {ok:true,...status()};
  })();
});
// Navigation occurred before the add-on started: prepare the active bare /produce tab too.
ready.then(async()=>{for(const tab of await browser.tabs.query({active:true}))if(isBareProduce(tab.url)&&!tab.incognito)void setupBegin(tab.id);});

async function followGameTab(tabId){
  await ready;
  if(!state.recording||tabId===state.tabId)return;
  const tab=await browser.tabs.get(tabId);
  if(!tab.active||tab.incognito)return;
  if(isBareProduce(tab.url))return setupBegin(tabId);
  if(V3Rules.mode(tab.url))await moveRecordingTab(tab,"activeGameTab");
}

function setupObserveFirstV3(id,from,to){
  if(setupJob&&setupJob.tabId===id&&setupJob.stage==="done"&&setupJob.firstV3Pending&&from==="a"&&to==="hash"){
    setupJob.firstV3Pending=false;
    add("setupFirstV3",{tabId:id,from,to,windowCount:visualRule().count});
  }
}

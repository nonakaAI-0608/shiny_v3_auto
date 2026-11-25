"use strict";
// Session-only opt-in. Never restore automatic execution after an extension restart.
let autoEnabled=false,autoPending=null,autoEpoch=0,autoLastGeometry=null;
let autoMessage="停止中",pairProof=new Set();
const AUTO_DEADLINE_MS=400;
const autoBaseStatus=status;
status=function(){return {...autoBaseStatus(),automatic:"自動V3："+(autoEnabled?"有効 / ":"停止 / ")+autoMessage,autoEnabled,historyReady:pairProof.size===2};};
function sameGeometry(a,b){
  return !!a&&!!b&&a.mode===b.mode&&["x","y","width","height","viewportWidth","viewportHeight"].every(k=>Number.isFinite(a[k])&&Number.isFinite(b[k])&&Math.abs(a[k]-b[k])<=1);
}
function logGeometry(g){
  if(!sameGeometry(g,autoLastGeometry)){add("geometry",{previous:autoLastGeometry,current:g});autoLastGeometry={...g};}
}
function autoStop(reason){
  if(typeof setupJob!=="undefined"&&setupJob)setupJob.resumeAuto=false;
  autoEpoch++;autoEnabled=false;autoMessage=reason||"手動停止";
  if(autoPending){clearTimeout(autoPending.timer);autoPending=null;}
  if(state.recording)add("autoStopped",{reason:autoMessage});
  void publish();
}
function autoReset(){autoStop("停止中");pairProof.clear();autoLastGeometry=null;}
function autoNavigation(from,to,url){
  if(from&&to&&from!==to&&!autoEnabled)pairProof.add(from+">"+to);
  if(autoPending){
    const p=autoPending;clearTimeout(p.timer);autoPending=null;
    if(to===p.expected&&from===p.from){
      autoMessage=p.type+"を自動切替";
      add("autoResult",{candidateId:p.id,target:p.type,success:true,from,to,clickToSwitchMs:Date.now()-p.clickedAt});
    }else{
      add("autoResult",{candidateId:p.id,success:false,reason:"unexpectedDestination"});
      pairProof.clear();autoStop("想定したURL以外へ移動したため停止");
    }
  }
  if(!V3Rules.mode(url)){pairProof.clear();if(autoEnabled)autoStop("対象URL外へ移動したため停止");}
}
function autoSkip(a,reason){add("autoSkipped",{candidateId:a.id,target:a.type,reason,clickAgeMs:Date.now()-a.clickedAt});autoMessage="見送り："+reason;void publish();}
async function autoMaybe(a,r){
  if(!autoEnabled||setupIsPreparing(state.tabId)||!a||a.autoConsidered)return;
  a.autoConsidered=true;
  if(autoPending)return autoSkip(a,"切替処理中");
  if(!Number.isFinite(a.frameAgeMs)||a.frameAgeMs>500||a.frameAgeMs<0)return autoSkip(a,"画像が古い");
  if(r.finished)return autoSkip(a,"通信完了後の照合");
  if(r.started<a.clickedAt||r.started-a.clickedAt>250)return autoSkip(a,"通信開始の照合が遅い");
  const epoch=autoEpoch,frameEpoch=a.epoch,tabId=state.tabId;
  try{
    const tab=await browser.tabs.get(tabId);
    if(!autoEnabled||epoch!==autoEpoch||frameEpoch!==visualEpoch||!state.recording)return;
    if(!tab.active||tab.incognito)return autoSkip(a,"対象タブが非表示");
    const from=V3Rules.mode(tab.url);
    if(!from||tab.url!==state.visualLastURL)return autoSkip(a,"対象URLを確認できず");
    if(Date.now()-a.clickedAt>AUTO_DEADLINE_MS)return autoSkip(a,"クリックから400ms超過");
    const budget=V3Rules.availability(visualRule(),Date.now());
    if(!budget.allowed)return autoSkip(a,budget.reason);
    const p={id:a.id,type:a.type,clickedAt:a.clickedAt,from,expected:from==="a"?"hash":"a"};
    autoPending=p;visualBlock=a.type;
    add("autoAttempt",{candidateId:a.id,target:a.type,from,to:p.expected,clickToAttemptMs:Date.now()-a.clickedAt,frameAgeMs:a.frameAgeMs,geometry:a.geometry,fiveMinuteRule:budget});
    p.timer=setTimeout(()=>{
      if(autoPending===p){add("autoResult",{candidateId:p.id,success:false,reason:"navigationTimeout"});autoStop("URL切替を確認できず停止");}
    },1500);
    // One history step per trigger; no reload, URL assignment, queue or retry.
    if(from==="hash")await browser.tabs.goBack(tabId);else await browser.tabs.goForward(tabId);
  }catch(_){
    if(epoch===autoEpoch){add("autoResult",{candidateId:a.id,success:false,reason:"navigationError"});autoStop("戻る／進むの実行に失敗");}
  }
}
browser.runtime.onMessage.addListener((m,sender)=>{
  if(!["autoEnable","autoDisable"].includes(m.action))return;
  return (async()=>{
    await ready;
    const page=sender.tab;
    if(!page||page.id!==state.tabId||!isGame(page.url)||page.incognito)return {ok:false,message:"監視対象のゲームタブで操作してください。"};
    if(m.action==="autoDisable"){autoStop("手動停止");return {ok:true,...status()};}
    if(!state.recording)return {ok:false,message:"先に「監視開始」を押してください。"};
    if(pairProof.size!==2)return {ok:false,message:"監視中に手動で戻る／進むを往復し、a=とa=#の切替を確認してください。"};
    const tab=await browser.tabs.get(page.id);
    if(!tab.active||!V3Rules.mode(tab.url))return {ok:false,message:"a= または a=# のゲームタブを表示してください。"};
    autoEnabled=true;autoEpoch++;autoMessage="回数条件内の次の確定操作を待機";
    add("autoEnabled",{deadlineMs:AUTO_DEADLINE_MS,automaticV3:true});await publish();return {ok:true,...status()};
  })();
});

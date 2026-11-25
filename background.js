"use strict";
// 0.4.3: log recording/export was removed. add() is kept as a no-op hook so the existing
// call sites stay unchanged; it only schedules persistence of rule state (visualRule etc.).
let state = {recording: false, tabId: null, sessionStart: null};
const gameTabs = new Set();
let saveTimer, saveChain = Promise.resolve(), storageError = false;
function isGame(url) {
  try { return new URL(url).origin === "https://shinycolors.enza.fun"; } catch (_) { return false; }
}
function persist() {
  const snapshot = JSON.parse(JSON.stringify(state));
  saveChain = saveChain.then(() => browser.storage.local.set({diagnostic: snapshot}))
    .then(() => { storageError = false; }, () => { storageError = true; });
  return saveChain;
}
function add() {
  clearTimeout(saveTimer); saveTimer = setTimeout(persist, 400);
}
function status() {
  return {recording: state.recording, tabId: state.tabId, storageError};
}
async function publish() {
  const s = status();
  await browser.browserAction.setBadgeText({text: s.recording ? "ON" : ""});
  await browser.browserAction.setBadgeBackgroundColor({color: "#b02432"});
  if (Number.isInteger(state.tabId)) {
    try { await browser.tabs.sendMessage(state.tabId, {action: "diagnosticStatus", status: s}); } catch (_) {}
  }
}
const ready = (async () => {
  const saved = await browser.storage.local.get("diagnostic");
  if (saved.diagnostic) {
    // Drop old log rows saved by 0.4.2 and earlier; keep only lock/rule state.
    const {rows, dropped, label, ...rest} = saved.diagnostic;
    state = {...state, ...rest, recording: false};
    if (rows) await persist();
  }
  for (const tab of await browser.tabs.query({})) if (isGame(tab.url)) gameTabs.add(tab.id);
})();
function belongs(d) {
  return state.recording && d.tabId === state.tabId && !d.incognito &&
    (isGame(d.documentUrl) || isGame(d.originUrl) || gameTabs.has(d.tabId));
}
browser.tabs.onUpdated.addListener((id, change, tab) => {
  if (tab.url) { if (isGame(tab.url)) gameTabs.add(id); else gameTabs.delete(id); }
});
browser.tabs.onRemoved.addListener(async id => {
  gameTabs.delete(id);
  if (id === state.tabId) { autoStop("対象タブを閉じた"); state.recording = false; await persist(); await publish(); }
});
browser.runtime.onMessage.addListener((m, sender) => {
  if (!["status", "start", "stop"].includes(m.action)) return undefined;
  return (async () => {
  await ready;
  const fromPage = Boolean(sender.tab);
  if (fromPage && (!isGame(sender.tab.url) || sender.tab.incognito)) return {ok: false};
  if (!fromPage && sender.id !== browser.runtime.id) return {ok: false};
  if (m.action === "status") return {...status(), here: !fromPage || sender.tab.id === state.tabId};
  const id = fromPage ? sender.tab.id : m.tabId;
  if (m.action === "start") {
    const tab = await browser.tabs.get(id);
    if (!isGame(tab.url) || tab.incognito) return {ok: false, message: "通常ウィンドウのシャニマスタブを開いてください。"};
    if (state.tabId !== id) await moveRecordingTab(tab, "recordingStart");
    if (!state.recording) {
      state.tabId = id; state.recording = true; state.sessionStart ||= Date.now();
      state.visualLastURL = tab.url;
      autoReset(); activateVisual(); visualWasRecording = true;
      gameTabs.add(id); await persist(); await publish();
    }
  } else if (m.action === "stop") {
    if (fromPage && id !== state.tabId) return {ok: false};
    state.recording = false;
    setupCancel("監視停止"); autoStop("監視停止"); visualWasRecording = false; visualInvalidate();
    await persist(); await publish();
  }
  return {ok: true, ...status(), here: !fromPage || sender.tab.id === state.tabId};
  })();
});

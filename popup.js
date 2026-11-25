"use strict";
async function update(m = {action: "status"}) {
  try {
    const [tab] = await browser.tabs.query({active: true, currentWindow: true});
    const s = await browser.runtime.sendMessage({...m, tabId: tab ? tab.id : null});
    document.getElementById("message").textContent = s.message || "";
    if (s.recording !== undefined) {
      const b = s.budget;
      const budget = b ? (b.allowed ? ` / 目安：あと${b.remaining}回` : ` / 目安：待ち ${b.waitSeconds}秒`) : "";
      document.getElementById("status").textContent = `${s.recording ? "● 監視中" : "停止中"}${budget}${s.storageError ? " / 保存エラー" : ""}`;
    }
  } catch (_) { document.getElementById("message").textContent = "操作できませんでした。シャニマスのタブでお試しください。"; }
}
for (const action of ["start", "stop"]) document.getElementById(action).addEventListener("click", () => update({action}));
update();

"use strict";
(() => {
  if (document.getElementById("shiny-v3-diagnostic-panel")) return;
  const host = document.createElement("div");
  host.id = "shiny-v3-diagnostic-panel";
  host.style.cssText = "position:fixed!important;left:8px!important;top:8px!important;z-index:2147483647!important;";
  const root = host.attachShadow({mode: "open"});
  // #mini follows #body and is shown only while #body is folded (hidden).
  root.innerHTML = `<style>
  :host {all:initial} .panel{font:12px sans-serif;color:#fff;background:#202432ee;border:1px solid #707d9a;border-radius:7px;padding:7px;max-width:430px}
  button{font:12px sans-serif;cursor:pointer;margin:2px;padding:5px 7px;background:#e6ebf4;color:#162034;border:0;border-radius:4px}
  button:disabled{opacity:.45;cursor:default} #status{margin:4px} #error{color:#ffd884;max-width:380px} .title{display:flex;align-items:center;justify-content:space-between;gap:8px}
  #mini{margin:2px 4px 0;font-weight:bold;color:#9fe6ff} #body:not([hidden])+#mini{display:none}
  </style><div class="panel"><div class="title"><b>V3自動</b><button id="fold">縮小</button></div>
  <div id="body"><div id="status">読み込み中</div><button data-action="start">監視開始</button><button data-action="stop">停止</button>
  <div id="note"></div></div><div id="mini"></div><div id="error"></div></div>`;
  function render(s) {
    const here = s.here !== false;
    root.getElementById("status").textContent = `${s.recording ? (here ? "● 監視中" : "別タブで監視中") : "停止中"}${s.storageError ? " / 保存エラー" : ""}`;
  }
  async function send(m) {
    try {
      const s = await browser.runtime.sendMessage(m);
      if (s && s.ok === false) root.getElementById("error").textContent = s.message || "このタブは監視対象ではありません。";
      else if (s) { root.getElementById("error").textContent = ""; render(s); }
    } catch (_) { root.getElementById("error").textContent = "拡張との接続が切れました。必要なタイミングでページを読み直してください。"; }
  }
  root.addEventListener("click", e => {
    e.stopPropagation();
    const b = e.target.closest("button"); if (!b) return;
    if (b.id === "fold") { const body = root.getElementById("body"); body.hidden = !body.hidden; b.textContent = body.hidden ? "展開" : "縮小"; }
    else if (b.dataset.action) send({action: b.dataset.action});
  });
  for (const name of ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend"])
    root.addEventListener(name, e => e.stopPropagation());
  document.documentElement.append(host);
  browser.runtime.onMessage.addListener(m => { if (m.action === "diagnosticStatus") render(m.status); });
  send({action: "status"});
  setInterval(() => send({action: "status"}), 1500);
})();

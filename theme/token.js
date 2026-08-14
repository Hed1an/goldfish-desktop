// DeepSeek Harness Desktop — Token 用量跟踪工具(注入脚本,shadow DOM 隔离)
// 实时统计当前会话的输入/输出 token(官方字符/4 估算算法),流式输出时自动刷新
(() => {
  if (window.__dshTokenPanel) return;
  window.__dshTokenPanel = true;

  const host = document.createElement('div');
  host.id = '__dshTokenHost';
  const root = host.attachShadow({ mode: 'open' });
  document.body.appendChild(host);

  root.innerHTML = `
<style>
:host { all: initial; }
* { box-sizing: border-box; margin: 0; padding: 0; }
.fab {
  position: fixed; right: 22px; bottom: 86px; z-index: 2147482990;
  width: 52px; height: 52px; border-radius: 50%;
  background: linear-gradient(135deg, #e8c25a, #b8932e);
  box-shadow: 0 6px 24px rgba(212,175,55,.45);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: transform .18s ease;
  border: none; color: #14100a; font-family: monospace; font-weight: 800; font-size: 18px;
}
.fab:hover { transform: scale(1.08) rotate(-6deg); }
.panel {
  position: fixed; right: 22px; bottom: 148px; z-index: 2147482991;
  width: 260px; background: rgba(18,18,24,.96); border: 1px solid #2e2e3a;
  border-radius: 16px; box-shadow: 0 16px 60px rgba(0,0,0,.6);
  padding: 16px; color: #e9e6df; font-family: system-ui, "Segoe UI", "Microsoft YaHei", sans-serif;
  font-size: 13px; display: none;
}
.panel.open { display: block; animation: dshTok .2s ease; }
@keyframes dshTok { from { opacity: 0; transform: translateY(8px);} to { opacity:1; transform:none;} }
.hd { font-size: 14px; font-weight: 700; color: #f0d47c; margin-bottom: 12px; display:flex; justify-content:space-between; align-items:center; }
.hd .x { cursor:pointer; color:#9a978f; font-size:16px; padding:0 4px; }
.hd .x:hover { color:#fff; }
.row { display:flex; justify-content:space-between; align-items:center; padding: 7px 4px; border-radius: 8px; }
.row .lbl { color:#cfcbc2; }
.row .val { font-variant-numeric: tabular-nums; font-weight: 700; color:#e9e6df; }
.row.in .val { color: #8fb0ff; }
.row.out .val { color: #f0d47c; }
.row.total { border-top: 1px solid #2e2e3a; margin-top: 4px; padding-top: 10px; }
.row.total .val { color:#fff; font-size:15px; }
.tip { font-size: 11px; color:#8a867e; margin-top: 10px; line-height: 1.6; }
.live { display:inline-block; width:8px; height:8px; border-radius:50%; background:#4caf50; margin-right:6px; vertical-align:middle; }
</style>
<button class="fab" title="Token 用量">₮</button>
<div class="panel">
  <div class="hd">Token 用量 <span class="x">✕</span></div>
  <div class="row in"><span class="lbl">↑ 输入 (含上下文)</span><span class="val" id="in">0</span></div>
  <div class="row out"><span class="lbl">↓ 输出</span><span class="val" id="out">0</span></div>
  <div class="row total"><span class="lbl"><span class="live" id="dot"></span>本会话总计</span><span class="val" id="total">0</span></div>
  <div class="tip">按官方字符密度估算(约 4 字符 ≈ 1 token),随对话实时更新。</div>
</div>`;

  const el = (i) => root.getElementById(i);

  // ---- 估算(与 dsh 官方 estimate 算法一致:每消息 ROLE_OVERHEAD + 内容字符/4) ----
  const est = (s) => Math.ceil((s || '').length / 4) + 8;

  function detectRole(bubble) {
    let n = bubble;
    for (let k = 0; k < 6 && n; k++, n = n.parentElement) {
      if (!n.className) continue;
      const c = n.className.toString().toLowerCase();
      if (c.includes('user')) return 'user';
      if (c.includes('assistant')) return 'assistant';
      if (c.includes('tool') || c.includes('system')) return 'tool';
    }
    // 兜底:气泡内部或兄弟标记
    return 'assistant';
  }

  function scan() {
    let input = 0, output = 0;
    const bubbles = [...document.querySelectorAll('[class*="bubble"], [class*="message"], [class*="Message"]')];
    for (const b of bubbles) {
      const txt = (b.textContent || '').trim();
      if (!txt) continue;
      const role = detectRole(b);
      const t = est(txt);
      if (role === 'user' || role === 'tool') input += t;
      else output += t;
    }
    const fmt = (n) => n.toLocaleString();
    el('in').textContent = fmt(input);
    el('out').textContent = fmt(output);
    el('total').textContent = fmt(input + output);
  }

  // ---- 实时监听消息区变化(流式输出时也统计) ----
  let mo = null;
  function observe() {
    if (mo) mo.disconnect();
    let target = document.body;
    const mo2 = new MutationObserver(() => { try { scan(); } catch {} });
    mo2.observe(target, { childList: true, subtree: true, characterData: true });
    mo = mo2;
  }

  // ---- 事件 ----
  root.querySelector('.fab').addEventListener('click', () => {
    root.querySelector('.panel').classList.toggle('open');
    if (root.querySelector('.panel').classList.contains('open')) scan();
  });
  root.querySelector('.x').addEventListener('click', () => root.querySelector('.panel').classList.remove('open'));
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#__dshTokenHost')) root.querySelector('.panel').classList.remove('open');
  });

  // 等 DOM 就绪后开始监听
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { observe(); scan(); });
  } else {
    observe(); scan();
  }
})();

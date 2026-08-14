// DeepSeek Harness Desktop — 主题面板(注入脚本,shadow DOM 隔离)
// 右下角浮动按钮 → 打开面板:切换主题 / 上传自定义背景 / 恢复默认
// 选择持久化在 localStorage,下次启动自动恢复
(() => {
  if (window.__dshThemePanel) return;
  window.__dshThemePanel = true;

  const KEY = 'dsh-theme-panel-v1';

  const THEMES = {
    gold: {
      label: '黑金', bg: '#0b0b0f', accent: '#d4af37',
      vars: {
        '--dsh-bg': '#0b0b0f', '--dsh-bg-soft': '#141419', '--dsh-bg-card': '#16161d',
        '--dsh-bg-hover': '#1e1e26', '--dsh-border': '#2a2a33',
        '--dsh-gold': '#d4af37', '--dsh-gold-soft': '#b8932e', '--dsh-gold-bright': '#f0d47c',
        '--dsh-text': '#e9e6df', '--dsh-text-dim': '#9a978f',
        '--dsh-accent': '#d4af37', '--dsh-accent-bright': '#f0d47c',
      },
    },
    blue: {
      label: '深空蓝', bg: '#0a0e1a', accent: '#4d7cfe',
      vars: {
        '--dsh-bg': '#0a0e1a', '--dsh-bg-soft': '#101627', '--dsh-bg-card': '#131a2e',
        '--dsh-bg-hover': '#1a2340', '--dsh-border': '#232f4d',
        '--dsh-gold': '#4d7cfe', '--dsh-gold-soft': '#3a63d8', '--dsh-gold-bright': '#8fb0ff',
        '--dsh-text': '#e6ecf7', '--dsh-text-dim': '#8b96ad',
        '--dsh-accent': '#4d7cfe', '--dsh-accent-bright': '#8fb0ff',
      },
    },
    green: {
      label: '翡翠绿', bg: '#07110d', accent: '#2fd37f',
      vars: {
        '--dsh-bg': '#07110d', '--dsh-bg-soft': '#0d1a14', '--dsh-bg-card': '#102019',
        '--dsh-bg-hover': '#162a20', '--dsh-border': '#1e3a2c',
        '--dsh-gold': '#2fd37f', '--dsh-gold-soft': '#24ab66', '--dsh-gold-bright': '#7cebb2',
        '--dsh-text': '#e2f3e9', '--dsh-text-dim': '#8aaa99',
        '--dsh-accent': '#2fd37f', '--dsh-accent-bright': '#7cebb2',
      },
    },
    rose: {
      label: '玫瑰红', bg: '#140a0c', accent: '#ff5f7e',
      vars: {
        '--dsh-bg': '#140a0c', '--dsh-bg-soft': '#1d1013', '--dsh-bg-card': '#231418',
        '--dsh-bg-hover': '#2e1a20', '--dsh-border': '#40242c',
        '--dsh-gold': '#ff5f7e', '--dsh-gold-soft': '#d84a66', '--dsh-gold-bright': '#ff9db0',
        '--dsh-text': '#f8e8ea', '--dsh-text-dim': '#b08e96',
        '--dsh-accent': '#ff5f7e', '--dsh-accent-bright': '#ff9db0',
      },
    },
    purple: {
      label: '紫夜', bg: '#0e0a18', accent: '#a78bfa',
      vars: {
        '--dsh-bg': '#0e0a18', '--dsh-bg-soft': '#171026', '--dsh-bg-card': '#1b1330',
        '--dsh-bg-hover': '#241a40', '--dsh-border': '#312653',
        '--dsh-gold': '#a78bfa', '--dsh-gold-soft': '#8b6ef0', '--dsh-gold-bright': '#cdbaff',
        '--dsh-text': '#ece8fa', '--dsh-text-dim': '#9d92bd',
        '--dsh-accent': '#a78bfa', '--dsh-accent-bright': '#cdbaff',
      },
    },
    mono: {
      label: '极简黑', bg: '#0a0a0a', accent: '#e8e8e8',
      vars: {
        '--dsh-bg': '#0a0a0a', '--dsh-bg-soft': '#111111', '--dsh-bg-card': '#141414',
        '--dsh-bg-hover': '#1c1c1c', '--dsh-border': '#262626',
        '--dsh-gold': '#e8e8e8', '--dsh-gold-soft': '#c4c4c4', '--dsh-gold-bright': '#ffffff',
        '--dsh-text': '#f2f2f2', '--dsh-text-dim': '#8f8f8f',
        '--dsh-accent': '#e8e8e8', '--dsh-accent-bright': '#ffffff',
      },
    },
  };

  let current = 'gold';
  let bgData = null;

  // ---------- shadow DOM ----------
  const host = document.createElement('div');
  host.id = '__dshThemeHost';
  const root = host.attachShadow({ mode: 'open' });
  document.body.appendChild(host);

  root.innerHTML = `
<style>
:host { all: initial; }
* { box-sizing: border-box; margin: 0; padding: 0; }
.fab {
  position: fixed; right: 22px; bottom: 22px; z-index: 2147483000;
  width: 52px; height: 52px; border-radius: 50%;
  background: linear-gradient(135deg, #e8c25a, #b8932e);
  box-shadow: 0 6px 24px rgba(212,175,55,.45);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: transform .18s ease, box-shadow .18s ease;
  border: none; color: #14100a;
}
.fab:hover { transform: scale(1.08) rotate(8deg); box-shadow: 0 10px 30px rgba(212,175,55,.6); }
.fab svg { width: 26px; height: 26px; }
.panel {
  position: fixed; right: 22px; bottom: 86px; z-index: 2147483001;
  width: 300px; max-height: 70vh; overflow-y: auto;
  background: rgba(18,18,24,.96); border: 1px solid #2e2e3a;
  border-radius: 18px; box-shadow: 0 16px 60px rgba(0,0,0,.65);
  padding: 18px; color: #e9e6df; font-family: system-ui, "Segoe UI", "Microsoft YaHei", sans-serif;
  font-size: 13px; display: none;
}
.panel.open { display: block; animation: dshSlide .22s ease; }
@keyframes dshSlide { from { opacity: 0; transform: translateY(10px);} to { opacity:1; transform:none;} }
.hd { font-size: 14px; font-weight: 700; color: #f0d47c; margin-bottom: 14px; display:flex; justify-content:space-between; align-items:center;}
.hd .x { cursor:pointer; color:#9a978f; font-size:16px; padding:0 4px; }
.hd .x:hover { color:#fff; }
.sec { font-size: 11px; color: #9a978f; margin: 14px 0 8px; letter-spacing: .5px; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.sw {
  border: 2px solid transparent; border-radius: 12px; padding: 8px; cursor: pointer;
  background: #141419; transition: all .15s ease; text-align: left;
}
.sw:hover { border-color: #f0d47c; transform: translateY(-2px); }
.sw.active { border-color: #f0d47c; box-shadow: 0 0 0 2px rgba(240,212,124,.25); }
.sw .chip { height: 34px; border-radius: 8px; margin-bottom: 6px; border: 1px solid rgba(255,255,255,.08); }
.sw .nm { font-size: 11px; color: #cfcbc2; }
.bgrow { display: flex; gap: 8px; margin-top: 6px; }
.bgbtn {
  flex: 1; padding: 9px 0; border-radius: 10px; border: 1px solid #2e2e3a;
  background: #141419; color: #e9e6df; font-size: 12px; cursor: pointer; transition: all .15s ease;
}
.bgbtn:hover { border-color: #f0d47c; color: #f0d47c; }
.bgbtn.warn:hover { border-color: #ff5f7e; color: #ff5f7e; }
.tip { font-size: 11px; color: #8a867e; margin-top: 10px; line-height: 1.6; }
</style>
<button class="fab" title="主题设置" part="fab">
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 2 2 0 0 0 1.7-3.1 2 2 0 0 1 1.5-3.1H18a4 4 0 0 0 4-4A10 10 0 0 0 12 2ZM7 12a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3-5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3 5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"/></svg>
</button>
<div class="panel">
  <div class="hd">主题设置 <span class="x">✕</span></div>
  <div class="sec">预设主题</div>
  <div class="grid" id="grid"></div>
  <div class="sec">自定义背景</div>
  <div class="bgrow">
    <button class="bgbtn" id="up">🖼 上传背景图</button>
    <button class="bgbtn warn" id="clr">清除</button>
  </div>
  <input type="file" id="file" accept="image/*" hidden>
  <div class="tip">背景图只保存在本机浏览器存储中。推荐使用深色系图片,效果最佳。</div>
</div>`;

  // ---------- 渲染主题网格 ----------
  const grid = root.getElementById('grid');
  for (const [name, t] of Object.entries(THEMES)) {
    const el = document.createElement('div');
    el.className = 'sw';
    el.dataset.theme = name;
    el.innerHTML = `<div class="chip" style="background:${t.bg};border-color:${t.accent}88"></div><div class="nm">${t.label}</div>`;
    el.addEventListener('click', () => { current = name; apply(); save(); sync(); });
    grid.appendChild(el);
  }

  // ---------- 应用主题 ----------
  function apply() {
    const t = THEMES[current] || THEMES.gold;
    const r = document.documentElement.style;
    for (const [k, v] of Object.entries(t.vars)) r.setProperty(k, v);
    r.setProperty('--dsh-bg-image', bgData ? `url("${bgData}")` : 'none');
  }

  function save() {
    const val = JSON.stringify({ theme: current, bg: bgData });
    if (window.dshTheme) { try { window.dshTheme.set(val); } catch {} }
    else { try { localStorage.setItem(KEY, val); } catch {} }
  }

  async function restore() {
    let s = null;
    if (window.dshTheme) {
      try { const v = await window.dshTheme.get(); if (v) s = JSON.parse(v); } catch {}
    }
    if (!s) { try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {} }
    if (s && s.theme && THEMES[s.theme]) current = s.theme;
    if (s && s.bg) bgData = s.bg;
    apply();
  }

  function sync() {
    root.querySelectorAll('.sw').forEach((el) =>
      el.classList.toggle('active', el.dataset.theme === current));
  }

  // ---------- 事件 ----------
  root.querySelector('.fab').addEventListener('click', () => {
    root.querySelector('.panel').classList.toggle('open');
  });
  root.querySelector('.x').addEventListener('click', () => {
    root.querySelector('.panel').classList.remove('open');
  });

  root.getElementById('up').addEventListener('click', () => root.getElementById('file').click());
  root.getElementById('clr').addEventListener('click', () => { bgData = null; apply(); save(); });
  root.getElementById('file').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      // 压缩到宽 1920 内,JPEG 0.82,控制 localStorage 体积
      const maxW = 1920;
      const scale = Math.min(1, maxW / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      bgData = c.toDataURL('image/jpeg', 0.82);
      URL.revokeObjectURL(url);
      apply(); save();
      root.querySelector('.tip').textContent = '✓ 背景已应用(已压缩,仅存本机)';
    };
    img.onerror = () => { URL.revokeObjectURL(url); root.querySelector('.tip').textContent = '✗ 图片读取失败'; };
    img.src = url;
  });

  // 关闭面板时点外面收起
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#__dshThemeHost')) root.querySelector('.panel').classList.remove('open');
  });

  restore().then(sync);
})();

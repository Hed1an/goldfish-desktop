# DeepSeek Harness Desktop(黑金小金鱼)

> DeepSeek Harness 的**桌面端** —— 独立窗口、黑金主题、双击桌面快捷方式即用。

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 官方 Web UI,
用 Electron 包装成原生桌面应用:内嵌启动 dsh 服务,打开即一个"就像原生软件"的独立窗口。

## ✨ 特性

- 🪟 **独立桌面窗口** —— 不是浏览器标签,是真正的桌面应用
- 🎨 **黑金主题** —— 深黑底 + 金色点缀(官方鲸鱼 logo)
- 🚀 **一键启动** —— 双击桌面快捷方式,自动起服务、自动开窗,无需命令行
- 🧊 **数据独立** —— 配置/Key/会话存在 `%APPDATA%\DeepSeek Harness Desktop\` 下,不影响其他环境
- 📦 **绿色分发** —— 一个安装包,装完即用,无需目标机器装 Node.js

## 📥 安装

1. 从 **Releases** 下载 `DeepSeek-Harness-Desktop-Setup-*.exe`
2. 双击安装(可自选安装目录)
3. 桌面出现 **DeepSeek Harness** 快捷方式,双击即开
4. 首次使用:设置 → 模型 → 填入 DeepSeek API Key → 选择工作区 → 开聊

## 🛠 开发构建

需要 Node.js ≥ 22 和 npm:

```bash
npm install        # 安装依赖(含 dsh)
npm start          # 开发模式运行(真实窗口)
npm run dist       # 打包 NSIS 安装包 -> dist\ 目录
```

## 🏗 技术实现

- **内嵌运行**:主进程用 `ELECTRON_RUN_AS_NODE` 把 Electron 当 Node 用,直接运行
  `@deepseek-ai/dsh` 的 `lib/bin.js`,不需要额外安装 Node 运行时
- **端口策略**:默认 3080,被占用自动 +1(3080-3089)
- **主题注入**:窗口加载完成后注入 `theme/dark-gold.css`,把 dsh 默认界面覆盖为黑金
- **为什么 `asar: false`**:dsh 以子进程方式运行,需要真实文件系统路径
- **`--expose-internals`**:dsh 的 HMR 插件要求该 Node 标志,缺失会启动失败

## 📁 目录结构

```
goldfish-desktop/
├── main.js              # Electron 主进程(启动/端口/窗口/主题注入)
├── theme/dark-gold.css  # 黑金主题
├── assets/              # 图标(官方鲸鱼 SVG 黑金化)
└── package.json         # electron-builder 打包配置
```

## 📄 License

MIT — 基于 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)(MIT)。

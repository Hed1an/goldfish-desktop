# DeepSeek Harness Desktop

> DeepSeek Harness 的**桌面端** —— 独立窗口、黑金主题、双击即用。

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 官方 Web UI,用 Electron 包装成原生桌面应用:内嵌启动 dsh 服务,打开即一个"就像原生软件"的独立窗口。

## ✨ 特性

- 🪟 **独立桌面窗口** —— 不是浏览器标签,是真正的桌面应用
- 🎨 **黑金主题** —— 深黑底 + 金色点缀(官方鲸鱼 logo);深浅色跟随 dsh 原生设置
- 🚀 **一键启动** —— 双击桌面快捷方式,自动起服务、自动开窗,无需命令行
- 🧊 **数据独立** —— 配置/Key/会话存在 `%APPDATA%\DeepSeek Harness Desktop\` 下
- 📦 **绿色分发** —— 一个安装包,装完即用,无需目标机器装 Node.js
- 🔄 **自动更新** —— 每天 8:00/20:00 自动检查,发现新版静默升级
- 🪟 **托盘常驻 + 开机自启** —— 关闭窗口驻留托盘,点击秒开

## 🚀 一键部署

### 最终用户(推荐)
1. 去 **Releases** 下载最新 `DeepSeek-Harness-Desktop-Setup-*.exe`
2. 双击安装 → 桌面出现 **DeepSeek Harness** 快捷方式
3. 双击即开。首次使用:设置 → 模型 → 填 DeepSeek API Key → 选工作区

> 无需安装 Node.js / Python / 任何运行时。

### 开发者(从源码构建)
```bash
# 环境:Node.js ≥ 22 + npm + git
git clone https://github.com/Hed1an/goldfish-desktop.git
cd goldfish-desktop
npm install         # 安装依赖(含 dsh 运行时)
npm run build       # 一键打包 NSIS 安装包 → dist\ 目录
```
Windows 下也可直接双击根目录的 `build.bat` 一键完成 `install + build`。

## 🛠 常用命令

| 命令 | 说明 |
|---|---|
| `npm install` | 安装依赖 |
| `npm start` | 开发模式运行(真实窗口) |
| `npm run dist` | 打包 NSIS 安装包 |
| `npm run build` | `dist` 的别名(一键打包) |

## 🏗 技术实现

- **内嵌运行**:主进程用 `ELECTRON_RUN_AS_NODE` 把 Electron 当 Node 用,直接运行 `@deepseek-ai/dsh` 的 `lib/bin.js`,无需额外 Node 运行时
- **端口策略**:默认 **3081**,被占用自动 +1(3081-3090),避开系统版 dsh 的 3080
- **主题注入**:加载完成后注入 `theme/dark-gold.css`(圆角 + 黑金,深色模式生效;浅色模式完全回归 dsh 原生)
- **为什么 `asar: false`**:dsh 以子进程方式运行,需要真实文件系统路径
- **`--expose-internals`**:dsh 的 HMR 插件要求该 Node 标志,缺失会启动失败
- **启动容错**:dsh 崩溃自动重试 3 次 + 错误日志 `%APPDATA%\...\dsh-error.log`

## 📁 目录结构

```
goldfish-desktop/
├── main.js              # Electron 主进程(启动/端口/窗口/托盘/自启/主题注入)
├── theme/dark-gold.css  # 圆角 + 黑金主题(深浅色分离)
├── assets/              # 图标(官方鲸鱼 SVG 黑金化)
├── splash.html          # 启动加载页(完整鲸鱼图标)
└── package.json         # electron-builder 打包配置
```

## ⚠️ 常见问题

- **黑屏/打不开**:查看 `%APPDATA%\DeepSeek Harness Desktop\dsh-error.log`,若报某个 `dsh-*` 插件 `UNSUPPORTED_SCHEMA` / `Invalid schema`,通常是该插件 schema 非法导致 dsh 加载失败(工具 `parameters`/`output.schema` 顶层必须 `type:"object"`,`boolean/string` 属性禁止 `required`)

## 📄 License

MIT — 基于 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)(MIT)。

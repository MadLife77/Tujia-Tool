# 图夹工具（Tujia Tool）

> ⬇️ **下载发布版本（Windows 桌面端 / 网页版 / Android）请前往：** 👉 [⬇ 下载最新版 图夹工具](https://github.com/MadLife77/tujiagongju/releases/tag/v2.4.0)
>
> **提示**：`releases/` 目录内含 `图夹工具.exe`（Windows 安装包）、`图夹工具.html`（网页版单文件）、`图夹工具.apk`（安卓安装包），按你的设备选择对应文件下载即可。

---

## 项目简介

图夹工具是一款**图片加密与隐藏分享工具**，可将多个文件“藏”进一张图片（图夹）中，实现隐私内容的隐蔽传输与分享。所有打包 / 解包过程**完全在浏览器本地处理，文件不会上传到任何服务器**，保障数据安全。

- 永久域名：https://tj.qdqqd.com
- 使用指南 / 教学视频：https://tj.qdqqd.com/help
- 软件版本：系统公告 v2.4
- 软件由 **Github 作者 MadLife77** 整合生成

## ✨ 核心功能

- **图片解包**：选择本地图夹图片，一键解密还原其中隐藏的文件（支持本地图片解密）。
- **图片打包**：
  - 选择**表图**（随机表图 / GIF / PNG / 自定义表图上传）
  - 选择**里图**（需要隐藏的文件）
  - 选择**算法**（普通算法 / 图夹PRO 防查算法，防 AI 检测，适合社交平台传播更安全）
  - 生成一张“看似普通”的图夹图片
- **完全本地处理**：无需联网、不上传数据，速度与安全性由本地设备决定。
- **多端支持**：Windows 桌面端（EXE）、网页版（HTML，任意浏览器打开）、Android（APK）。
- **全面适配 iOS / 安卓系统**。

## 📦 发布版本（releases）

| 文件 | 平台 | 说明 |
| --- | --- | --- |
| [图夹工具.exe](releases/%E5%9B%BE%E5%A4%B9%E5%B7%A5%E5%85%B7.exe) | Windows | C + Win32 + WebView2 桌面客户端，双击即用 |
| [图夹工具.html](releases/%E5%9B%BE%E5%A4%B9%E5%B7%A5%E5%85%B7.html) | 全平台（浏览器） | 单文件网页版，下载后直接用浏览器打开 |
| [图夹工具.apk](releases/%E5%9B%BE%E5%A4%B9%E5%B7%A5%E5%85%B7.apk) | Android | 安卓安装包 |

> 提示：超大文件建议使用电脑打包或分批打包。

## 🚀 使用方式

### 网页版
直接下载 `图夹工具.html`，用浏览器打开即可使用（推荐 Chrome / Edge）。

### Windows 桌面端
下载 `图夹工具.exe`，双击运行。基于 WebView2 内核，首次运行会自动释放所需资源到本地。

### Android
下载 `图夹工具.apk` 并安装（需允许“未知来源”安装）。

## 🛠 技术架构

- **网页版 / 核心逻辑**：原生 HTML + CSS + JavaScript（Web Worker 并行解密）。
- **Windows 桌面端**：C 语言 + Win32 + WebView2（COM 接口）封装，资源内嵌，PE 子系统为 GUI（无黑窗）。
- **Android 端**：原生 WebView + `onShowFileChooser` 文件选择。
- 三大端均内置“系统公告 v2.4”与作者水印（Github 作者 MadLife77 整合生成）。

## 📂 仓库结构

```
tujiagongju/
├── README.md            # 本文档
├── releases/            # 发布版本（exe / html / apk）
│   ├── 图夹工具.exe
│   ├── 图夹工具.html
│   └── 图夹工具.apk
└── site/                # 网页版源码（HTML/CSS/JS 及素材）
    ├── index.html
    ├── 12.css
    ├── index.js / compat.js / covers.js / worker-manager.js / worker-shim.js / decryptWorker.js
    └── bqb/ gif/ png/ tphx/   # 素材目录
```

## ⚠️ 免责声明

- 本工具仅供技术研究使用，不涉及商业行为，使用者做出的行为及后果本站概不负责。
- 打包 / 解包由浏览器本地处理，速度快慢由设备性能决定。
- 软件由 **Github 作者 MadLife77** 整合生成。

---

© 2026 图夹工具 · 永久免费

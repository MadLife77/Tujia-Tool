# 图夹工具 Windows 桌面端源码（C 语言）

> 作者水印：GitHub作者MadLife77 ｜ 版本：v2.4.3

桌面端使用 **C + Win32 API + WebView2 COM 接口** 编写，不含任何第三方 GUI 框架。

## 文件说明

| 文件 | 作用 |
| --- | --- |
| `main.c` | 主程序：窗口创建、COM 回调、资源释放、`file://` 加载内嵌页面 |
| `filelist.h` | 内嵌资源 ID 定义 |
| `app.rc` | PE 资源脚本（图标、`WebView2Loader.dll`、`app.html`、版本信息） |
| `build.sh` | 构建脚本（zig cc / zig rc） |

## 运行原理

1. 编译时把 `app.html`（单文件网页版，字体/脚本/Worker 全部内联）与 `WebView2Loader.dll` 作为 `RCDATA` 编入 `.rsrc`。
2. 启动时把两个资源释放到 `%LOCALAPPDATA%\TujiaTool\`，每次覆盖以保证页面随 exe 更新。
3. 设置 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--allow-file-access-from-files`，规避 `file://` 下 Blob Worker 的跨域限制。
4. 通过 COM 创建 `ICoreWebView2Environment` / `ICoreWebView2Controller`，导航到 `file:///.../app.html`。

## 构建

```bash
# 需准备：zig (Windows x86_64)、WebView2 SDK 头文件、WebView2Loader.dll、app.ico、app.html
export ZIG=/path/to/zig.exe
export WV2SDK=/path/to/wv2sdk
bash build.sh
```

链接参数 `-Wl,/subsystem:windows` 保证 PE 子系统为 GUI（不弹 CMD 窗口）；zig CRT 无 `wWinMainCRTStartup`，故入口用 `mainCRTStartup`，`main.c` 里额外提供 `main()` 包装。

软件由 Github 作者 MadLife77 整合生成。

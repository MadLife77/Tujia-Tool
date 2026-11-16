#!/bin/bash
# 作者水印: GitHub作者MadLife77 — 图夹工具 v2.4.2 桌面端构建脚本
# 工具链: zig cc / zig rc (Windows x86_64 GNU)；GUI subsystem，运行时不出现 CMD 窗口
ZIG="${ZIG:-C:/Users/Madlife/AppData/Local/Temp/tj_probe/zig/zig-windows-x86_64-0.13.0/zig.exe}"
WV2SDK="${WV2SDK:-C:/Users/Madlife/AppData/Local/Temp/tj_probe/wv2sdk}"
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"
cd "$(dirname "$0")" || exit 1
"$ZIG" rc /fo app.res app.rc || exit 1
"$ZIG" cc -target x86_64-windows-gnu -O2 \
  -DWINVER=0x0605 -D_WIN32_WINNT=0x0605 -D_WIN32_IE=0x0700 \
  -I "$WV2SDK" \
  -Wl,/subsystem:windows -Wl,-e,mainCRTStartup \
  -o TujiaTool.exe main.c app.res \
  -lole32 -lshell32 -luuid -lgdi32 -luser32 -ladvapi32

/* 作者水印: GitHub作者MadLife77 — 图夹工具 v2.4.3 桌面端主程序
 * 设计语言: C (Win32 API + WebView2 COM 接口)
 * 加载内嵌单文件页面 app.html（file:// 直读），资源由 app.rc 编入 PE。
 * 软件由 Github作者 MadLife77 整合生成 */
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shlobj.h>
#include <shellapi.h>
#include <stdio.h>
#include <stdlib.h>
#include "WebView2.h"
#include "filelist.h"

/* ---------- 全局状态 ---------- */
static ICoreWebView2Environment* g_env   = NULL;
static ICoreWebView2Controller*  g_ctrl  = NULL;
static ICoreWebView2*            g_web   = NULL;
static HWND  g_hwnd = NULL;
static HINSTANCE g_hInst = NULL;
static wchar_t g_appDir[MAX_PATH]   = L"";
static wchar_t g_loaderPath[MAX_PATH] = L"";
static wchar_t g_pagePath[MAX_PATH] = L"";

/* ---------- 诊断日志 ---------- */
static void tlog(const char* msg)
{
    FILE* f = _wfopen(L"C:////Users////Madlife////AppData////Local////Temp////tujia_exe.log", L"a");
    if (f) { fputs(msg, f); fputc('\n', f); fclose(f); }
}

/* ---------- IID ---------- */
static const IID kIID_ICoreWebView2Environment = {0xb96d755e,0x0319,0x4e92,{0xa2,0x96,0x23,0x43,0x6f,0x46,0xa1,0xfc}};
static const IID kIID_ICoreWebView2Controller  = {0x4d00c0d1,0x9434,0x4eb6,{0x80,0x78,0x86,0x97,0xa5,0x60,0x33,0x4f}};
static const IID kIID_ICoreWebView2            = {0x76eceacb,0x0462,0x4d94,{0xac,0x83,0x42,0x3a,0x67,0x93,0x77,0x5e}};
static const IID kIID_EnvHandler               = {0x5f4dd6b3,0x3c14,0x4f4e,{0x9a,0x1c,0x11,0x22,0x33,0x44,0x55,0x66}};
static const IID kIID_CtrlHandler              = {0x6f4dd6b3,0x3c14,0x4f4e,{0x9a,0x1c,0x11,0x22,0x33,0x44,0x55,0x77}};

/* ---------- 工具函数 ---------- */
static void app_data_dir(wchar_t* out, size_t n)
{
    wchar_t la[MAX_PATH] = L"";
    SHGetFolderPathW(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, la);
    _snwprintf(out, n, L"%s\\TujiaTool", la);
}

static void ensure_parent_dir(const wchar_t* path)
{
    wchar_t dir[MAX_PATH];
    wcsncpy(dir, path, MAX_PATH - 1);
    dir[MAX_PATH - 1] = 0;
    wchar_t* slash = wcsrchr(dir, L'\\');
    if (!slash) return;
    *slash = 0;
    SHCreateDirectoryExW(NULL, dir, NULL);
}

static BOOL write_resource(int resId, const wchar_t* dest)
{
    HRSRC r = FindResourceW(NULL, MAKEINTRESOURCEW(resId), (LPCWSTR)RT_RCDATA);
    if (!r) return FALSE;
    HGLOBAL h = LoadResource(NULL, r);
    if (!h) return FALSE;
    DWORD sz = SizeofResource(NULL, r);
    const void* p = LockResource(h);
    if (!p || !sz) return FALSE;
    ensure_parent_dir(dest);
    FILE* f = _wfopen(dest, L"wb");
    if (!f) return FALSE;
    size_t wrote = fwrite(p, 1, sz, f);
    fclose(f);
    return wrote == (size_t)sz;
}

static void extract_all(void)
{
    app_data_dir(g_appDir, MAX_PATH);

    /* WebView2Loader.dll → TujiaTool\WebView2Loader.dll */
    _snwprintf(g_loaderPath, MAX_PATH, L"%s\\WebView2Loader.dll", g_appDir);
    write_resource(RESID_LOADER, g_loaderPath);

    /* 单文件页面 → TujiaTool\app.html（每次启动覆盖，保证随 exe 更新） */
    _snwprintf(g_pagePath, MAX_PATH, L"%s\\app.html", g_appDir);
    if (!write_resource(RESID_APPHTML, g_pagePath)) {
        MessageBoxW(NULL, L"释放内置页面失败。", L"图夹工具", MB_ICONERROR);
    }
}

/* ---------- COM:Controller completed（先定义，Env 回调会引用） ---------- */
static HRESULT STDMETHODCALLTYPE CtrlQI(ICoreWebView2CreateCoreWebView2ControllerCompletedHandler* self,
                                        const IID* const riid, void** ppv)
{
    (void)self;
    if (!ppv) return E_POINTER;
    *ppv = NULL;
    if (IsEqualGUID(riid, &IID_IUnknown) || IsEqualGUID(riid, &kIID_CtrlHandler)) {
        *ppv = self;
        return S_OK;
    }
    return E_NOINTERFACE;
}
static ULONG STDMETHODCALLTYPE CtrlAddRef(ICoreWebView2CreateCoreWebView2ControllerCompletedHandler* self) { (void)self; return 1; }
static ULONG STDMETHODCALLTYPE CtrlRelease(ICoreWebView2CreateCoreWebView2ControllerCompletedHandler* self) { (void)self; return 1; }

static HRESULT STDMETHODCALLTYPE CtrlInvoke(ICoreWebView2CreateCoreWebView2ControllerCompletedHandler* self,
                                            HRESULT errorCode, ICoreWebView2Controller* ctrl)
{
    (void)self;
    if (FAILED(errorCode) || !ctrl) {
        MessageBoxW(g_hwnd, L"WebView2 控制器创建失败。", L"图夹工具", MB_ICONERROR);
        PostQuitMessage(1);
        return S_OK;
    }
    g_ctrl = ctrl;
    tlog("CtrlInvoke: controller ready");
    ctrl->lpVtbl->AddRef(ctrl);
    RECT rc;
    GetClientRect(g_hwnd, &rc);
    ctrl->lpVtbl->put_Bounds(ctrl, rc);
    ctrl->lpVtbl->get_CoreWebView2(ctrl, &g_web);
    tlog("after get_CoreWebView2");
    if (!g_web) {
        MessageBoxW(g_hwnd, L"无法获取 WebView 内容接口。", L"图夹工具", MB_ICONERROR);
        PostQuitMessage(1);
        return S_OK;
    }
    /* 加载内嵌单文件页面：字体/图片/Worker 全部 data URI 内联，file:// 下无 CORS 问题 */
    wchar_t fileUrl[MAX_PATH + 32];
    _snwprintf(fileUrl, MAX_PATH + 32, L"file:///%s", g_pagePath);
    for (wchar_t* q = fileUrl; *q; q++) if (*q == L'\\') *q = L'/';
    g_web->lpVtbl->Navigate(g_web, fileUrl);
    tlog("Navigate called");
    return S_OK;
}

static ICoreWebView2CreateCoreWebView2ControllerCompletedHandlerVtbl g_ctrlVtbl = {
    CtrlQI, CtrlAddRef, CtrlRelease, CtrlInvoke
};
static ICoreWebView2CreateCoreWebView2ControllerCompletedHandler g_ctrlHandler = { &g_ctrlVtbl };

/* ---------- COM:Environment completed ---------- */
static HRESULT STDMETHODCALLTYPE EnvQI(ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler* self,
                                       const IID* const riid, void** ppv)
{
    (void)self;
    if (!ppv) return E_POINTER;
    *ppv = NULL;
    if (IsEqualGUID(riid, &IID_IUnknown) || IsEqualGUID(riid, &kIID_EnvHandler)) {
        *ppv = self;
        return S_OK;
    }
    return E_NOINTERFACE;
}
static ULONG STDMETHODCALLTYPE EnvAddRef(ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler* self) { (void)self; return 1; }
static ULONG STDMETHODCALLTYPE EnvRelease(ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler* self) { (void)self; return 1; }

static HRESULT STDMETHODCALLTYPE EnvInvoke(ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler* self,
                                           HRESULT errorCode, ICoreWebView2Environment* env)
{
    (void)self;
    if (FAILED(errorCode) || !env) {
        MessageBoxW(g_hwnd, L"WebView2 运行环境初始化失败，请确认系统已安装 Microsoft Edge WebView2 运行时。",
                    L"图夹工具", MB_ICONERROR);
        PostQuitMessage(1);
        return S_OK;
    }
    g_env = env;
    tlog("EnvInvoke: environment ready");
    env->lpVtbl->AddRef(env);
    env->lpVtbl->CreateCoreWebView2Controller(env, g_hwnd, &g_ctrlHandler);
    return S_OK;
}

static ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandlerVtbl g_envVtbl = {
    EnvQI, EnvAddRef, EnvRelease, EnvInvoke
};
static ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler g_envHandler = { &g_envVtbl };

/* ---------- 窗口过程 ---------- */
static void update_bounds(void)
{
    if (!g_ctrl) return;
    RECT rc;
    GetClientRect(g_hwnd, &rc);
    g_ctrl->lpVtbl->put_Bounds(g_ctrl, rc);
}

static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp)
{
    switch (msg) {
    case WM_SIZE:
        update_bounds();
        return 0;
    case WM_DESTROY:
        PostQuitMessage(0);
        return 0;
    }
    return DefWindowProcW(hwnd, msg, wp, lp);
}

/* ---------- 入口 ---------- */
int WINAPI wWinMain(HINSTANCE hInst, HINSTANCE prev, PWSTR cmd, int show)
{
    (void)prev; (void)cmd;
    g_hInst = hInst;

    CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);

    extract_all();

    /* 与已验证可用的 file:// 方案保持一致：放开 file:// 本地资源访问
       （Blob Worker、字体等），WebView2 运行时会读取该环境变量 */
    SetEnvironmentVariableW(L"WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
                            L"--allow-file-access-from-files");

    WNDCLASSEXW wc = {0};
    wc.cbSize = sizeof(wc);
    wc.style = CS_HREDRAW | CS_VREDRAW;
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInst;
    wc.hIcon = LoadIconW(hInst, MAKEINTRESOURCEW(1));
    wc.hIconSm = wc.hIcon;
    wc.hCursor = LoadCursorW(NULL, (LPCWSTR)IDC_ARROW);
    wc.hbrBackground = NULL;
    wc.lpszClassName = L"TujiaToolWnd";
    RegisterClassExW(&wc);

    int vw = GetSystemMetrics(SM_CXSCREEN);
    int vh = GetSystemMetrics(SM_CYSCREEN);
    int ww = 920, wh = 980;
    if (ww > vw) ww = vw;
    if (wh > vh) wh = vh;
    g_hwnd = CreateWindowExW(0, L"TujiaToolWnd", L"图夹工具",
                             WS_OVERLAPPEDWINDOW,
                             (vw - ww) / 2, (vh - wh) / 2, ww, wh,
                             NULL, NULL, hInst, NULL);
    if (!g_hwnd) return 1;
    ShowWindow(g_hwnd, show);
    UpdateWindow(g_hwnd);

    HMODULE loader = LoadLibraryW(g_loaderPath);
    if (!loader) {
        MessageBoxW(NULL, L"无法加载 WebView2Loader.dll。", L"图夹工具", MB_ICONERROR);
        return 1;
    }
    typedef HRESULT (WINAPI *PFN_CreateEnv)(
        PCWSTR browserExeFolder, PCWSTR userDataFolder,
        ICoreWebView2EnvironmentOptions* options,
        ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler* handler);
    PFN_CreateEnv createEnv =
        (PFN_CreateEnv)GetProcAddress(loader, "CreateCoreWebView2EnvironmentWithOptions");
    if (!createEnv) {
        MessageBoxW(NULL, L"WebView2Loader.dll 缺少入口函数。", L"图夹工具", MB_ICONERROR);
        return 1;
    }
    wchar_t userData[MAX_PATH];
    app_data_dir(userData, MAX_PATH);
    _snwprintf(userData, MAX_PATH, L"%s\\WebView2", userData);
    createEnv(NULL, userData, NULL, &g_envHandler);

    MSG msg;
    while (GetMessageW(&msg, NULL, 0, 0) > 0) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    if (g_web) g_web->lpVtbl->Release(g_web);
    if (g_ctrl) g_ctrl->lpVtbl->Release(g_ctrl);
    if (g_env) g_env->lpVtbl->Release(g_env);
    CoUninitialize();
    return 0;
}

/* zig/mingw CRT 无 wWinMainCRTStartup：以 mainCRTStartup 为入口时提供 C main 包装 */
int main(void)
{
    return wWinMain(GetModuleHandleW(NULL), NULL, GetCommandLineW(), SW_SHOWNORMAL);
}

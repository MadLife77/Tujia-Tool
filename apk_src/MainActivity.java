/*
 * 作者水印: GitHub作者MadLife77 — 图夹工具 v2.4.3
 * 软件由 Github作者 MadLife77 整合生成
 */
package com.tujia.app;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;
import java.io.*;
import java.net.*;
import java.util.ArrayList;

public class MainActivity extends Activity {
    /* 作者水印: GitHub作者MadLife77（编译进 dex 的署名常量） */
    @SuppressWarnings("unused")
    private static final String AUTHOR = "软件由 Github作者 MadLife77 整合生成";
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private static final int REQ_FILE = 1001;
    private static final int REQ_PERM = 1002;

    private final Handler uiHandler = new Handler(Looper.getMainLooper());
    /* 原生保存状态（单任务串行, JS 端以 busy 锁保证顺序） */
    private OutputStream saveOut;
    private Uri saveUri;
    private File saveFile;
    private String saveName;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setDatabaseEnabled(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        /* 原生保存桥: 页面 JS 通过 TujiaNative 将 blob 数据分块交给原生落盘,
         * 全程不占用 UI 线程, 修复点击"下载图夹"导致程序无响应(ANR)的问题 */
        web.addJavascriptInterface(new NativeBridge(), "TujiaNative");
        /* 兜底: 处理 http(s) 直链下载(blob/data 由 JS 桥处理) */
        web.setDownloadListener(new DownloadListener() {
            public void onDownloadStart(String url, String ua, String cd, String mime, long len) {
                handleDownload(url);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb,
                                                       FileChooserParams params) {
                if (fileCallback != null) { fileCallback.onReceiveValue(null); }
                fileCallback = cb;
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                ArrayList<String> mimes = new ArrayList<String>();
                String[] accept = params.getAcceptTypes();
                if (accept != null) {
                    for (String group : accept) {
                        if (group == null) continue;
                        for (String t : group.split(",")) {
                            String m = t.trim();
                            if (m.contains("/")) mimes.add(m);
                        }
                    }
                }
                if (!mimes.isEmpty()) {
                    intent.setType(mimes.get(0));
                    if (mimes.size() > 1) {
                        intent.putExtra(Intent.EXTRA_MIME_TYPES, mimes.toArray(new String[0]));
                    }
                }
                if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }
                try {
                    startActivityForResult(intent, REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    cb.onReceiveValue(null);
                    return false;
                }
                return true;
            }
        });
        /* Android 9 及以下写公共下载目录需要存储权限 */
        if (Build.VERSION.SDK_INT >= 23 && Build.VERSION.SDK_INT < 29) {
            if (checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_PERM);
            }
        }
        startServer();
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQ_FILE) { super.onActivityResult(requestCode, resultCode, data); return; }
        ValueCallback<Uri[]> cb = fileCallback;
        fileCallback = null;
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                ClipData clip = data.getClipData();
                int n = clip.getItemCount();
                result = new Uri[n];
                for (int i = 0; i < n; i++) result[i] = clip.getItemAt(i).getUri();
            } else {
                Uri u = data.getData();
                if (u != null) result = new Uri[]{ u };
            }
        }
        if (cb != null) cb.onReceiveValue(result);
    }

    private void toast(String msg) {
        uiHandler.post(new Runnable() { public void run() {
            try { Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show(); } catch (Exception e) { }
        }});
    }

    private String safeName(String n) {
        if (n == null || n.trim().length() == 0) {
            return "tujia_" + System.currentTimeMillis() + ".bin";
        }
        StringBuilder sb = new StringBuilder();
        String t = n.trim();
        for (int i = 0; i < t.length(); i++) {
            char c = t.charAt(i);
            if (c == '/' || c == '\\' || c == ':' || c == '*' || c == '?'
                    || c == '"' || c == '<' || c == '>' || c == '|') sb.append('_');
            else sb.append(c);
        }
        return sb.toString();
    }

    private String guessMime(String n) {
        String s = n.toLowerCase();
        if (s.endsWith(".gif")) return "image/gif";
        if (s.endsWith(".png")) return "image/png";
        if (s.endsWith(".jpg") || s.endsWith(".jpeg")) return "image/jpeg";
        if (s.endsWith(".webp")) return "image/webp";
        if (s.endsWith(".mp4")) return "video/mp4";
        if (s.endsWith(".zip")) return "application/zip";
        return "application/octet-stream";
    }

    /* 打开保存目标: API 29+ 走 MediaStore.Downloads(免权限), 低版本写公共下载目录 */
    private OutputStream openSaveTarget(String name) throws Exception {
        saveName = name;
        if (Build.VERSION.SDK_INT >= 29) {
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.Downloads.DISPLAY_NAME, saveName);
            cv.put(MediaStore.Downloads.MIME_TYPE, guessMime(saveName));
            cv.put(MediaStore.Downloads.IS_PENDING, 1);
            saveUri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
            return getContentResolver().openOutputStream(saveUri);
        }
        File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (!dir.exists()) dir.mkdirs();
        File f = new File(dir, saveName);
        saveFile = f;
        return new FileOutputStream(f);
    }

    private void finishSaveTarget() throws Exception {
        if (saveUri != null) {
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.Downloads.IS_PENDING, 0);
            getContentResolver().update(saveUri, cv, null, null);
        }
    }

    private void cleanupSaveTarget() {
        try { if (saveOut != null) saveOut.close(); } catch (Exception e) { }
        saveOut = null;
        try { if (saveUri != null) getContentResolver().delete(saveUri, null, null); } catch (Exception e) { }
        saveUri = null;
        try { if (saveFile != null && saveFile.exists()) saveFile.delete(); } catch (Exception e) { }
        saveFile = null;
    }

    private class NativeBridge {
        /* JS: TujiaNative.beginSave(文件名, 分块数) */
        @JavascriptInterface public void beginSave(String name, String total) {
            try {
                saveOut = openSaveTarget(safeName(name));
                toast("正在保存 " + saveName);
            } catch (Exception e) {
                cleanupSaveTarget();
                toast("保存失败: " + e.getMessage());
            }
        }
        /* JS: TujiaNative.appendChunk(base64块) —— 每块独立解码后追加写入 */
        @JavascriptInterface public void appendChunk(String b64) {
            try {
                if (saveOut == null) return;
                saveOut.write(Base64.decode(b64, Base64.DEFAULT));
            } catch (Exception e) {
                cleanupSaveTarget();
                toast("保存失败: " + e.getMessage());
            }
        }
        /* JS: TujiaNative.endSave() */
        @JavascriptInterface public void endSave() {
            try {
                if (saveOut != null) { saveOut.flush(); saveOut.close(); saveOut = null; }
                finishSaveTarget();
                if (saveUri != null) {
                    toast("已保存到系统下载目录: " + saveName);
                } else if (saveFile != null) {
                    toast("已保存: " + saveFile.getAbsolutePath());
                }
            } catch (Exception e) {
                toast("保存失败: " + e.getMessage());
            } finally {
                saveUri = null; saveFile = null;
            }
        }
        /* 公告「不再提醒」原生持久化: 本地服务端口每次启动变化, WebView
         * localStorage 按 origin 隔离, 因此改用 SharedPreferences 跨启动保存。 */
        @JavascriptInterface public String getPref(String key) {
            try { return getSharedPreferences("tujia_prefs", MODE_PRIVATE).getString(key, ""); }
            catch (Exception e) { return ""; }
        }
        @JavascriptInterface public void setPref(String key, String value) {
            try { getSharedPreferences("tujia_prefs", MODE_PRIVATE)
                    .edit().putString(key, value == null ? "" : value).apply(); }
            catch (Exception e) { }
        }

        /* JS: TujiaNative.saveFail(原因) */
        @JavascriptInterface public void saveFail(String msg) {
            cleanupSaveTarget();
            toast("保存失败: " + msg);
        }
    }

    /* DownloadListener 兜底: 拉取 http(s) 直链并保存 */
    private void handleDownload(final String url) {
        if (url == null) return;
        if (url.startsWith("blob:") || url.startsWith("data:")) return;
        toast("开始下载 " + url);
        new Thread(new Runnable() { public void run() {
            try {
                URLConnection conn = new URL(url).openConnection();
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(30000);
                String path = url.split("\\?")[0];
                String name = path.substring(path.lastIndexOf('/') + 1);
                InputStream in = conn.getInputStream();
                OutputStream out = openSaveTarget(safeName(name));
                byte[] buf = new byte[65536]; int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                in.close();
                out.flush(); out.close(); saveOut = null;
                finishSaveTarget();
                if (saveUri != null) toast("已保存到系统下载目录: " + saveName);
                else if (saveFile != null) toast("已保存: " + saveFile.getAbsolutePath());
                saveUri = null; saveFile = null;
            } catch (Exception e) {
                cleanupSaveTarget();
                toast("下载失败: " + e.getMessage());
            }
        }}).start();
    }

    private byte[] readAsset(String name) throws IOException {
        InputStream is = getAssets().open(name);
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[8192]; int n;
        while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
        is.close();
        return bos.toByteArray();
    }

    private void startServer() {
        new Thread(new Runnable() { public void run() {
            try {
                final byte[] html = readAsset("index.html");
                InetAddress loopback = InetAddress.getByName("127.0.0.1");
                int[] ports = new int[]{18976, 18977, 18978, 18979, 18980};
                ServerSocket chosen = null;
                for (int candidate : ports) {
                    try { chosen = new ServerSocket(candidate, 16, loopback); break; }
                    catch (Exception ignored) { }
                }
                if (chosen == null) chosen = new ServerSocket(0, 16, loopback);
                final ServerSocket server = chosen;
                final int port = server.getLocalPort();
                runOnUiThread(new Runnable() { public void run() {
                    web.loadUrl("http://127.0.0.1:" + port + "/index.html");
                }});
                while (true) {
                    Socket c = server.accept();
                    try {
                        BufferedReader in = new BufferedReader(new InputStreamReader(c.getInputStream()));
                        String line = in.readLine(), h;
                        while ((h = in.readLine()) != null && !h.isEmpty()) { }
                        String path = "";
                        if (line != null && line.startsWith("GET ")) {
                            String[] parts = line.split(" ");
                            if (parts.length > 1) path = parts[1];
                        }
                        boolean ok = path.equals("/") || path.startsWith("/index.html");
                        OutputStream out = c.getOutputStream();
                        if (ok) {
                            String head = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: " + html.length + "\r\nConnection: close\r\n\r\n";
                            out.write(head.getBytes("UTF-8"));
                            out.write(html);
                        } else {
                            String body = "Not Found";
                            String head = "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nContent-Length: " + body.length() + "\r\nConnection: close\r\n\r\n";
                            out.write(head.getBytes("UTF-8"));
                            out.write(body.getBytes("UTF-8"));
                        }
                        out.flush();
                    } catch (Exception e) { }
                    finally { try { c.close(); } catch (Exception e) { } }
                }
            } catch (Exception e) {
                runOnUiThread(new Runnable() { public void run() {
                    web.loadUrl("file:///android_asset/index.html");
                }});
            }
        }}).start();
    }
}

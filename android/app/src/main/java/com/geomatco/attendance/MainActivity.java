package com.geomatco.attendance;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.graphics.Bitmap;
import org.json.JSONObject;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import android.widget.Toast;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;

public class MainActivity extends AppCompatActivity {

    private static final int REQ_LOCATION = 1001;
    private static final int REQ_SAVE_FILE = 1002;
    private static final int REQ_PICK_FILE = 1003;
    private static final int REQ_NOTIFICATIONS = 1004;
    private static final String APP_URL = "file:///android_asset/index.html";

    private WebView webView;
    // درخواست لوکیشنِ صفحه که منتظر پاسخ اجازه اندروید است
    private String pendingGeoOrigin;
    private GeolocationPermissions.Callback pendingGeoCallback;
    // محتوای فایلی که صفحه می‌خواهد ذخیره کند، تا کاربر محل ذخیره را انتخاب کند
    private String pendingSaveContent;
    // انتخاب فایل برای <input type="file"> (بازگردانی پشتیبان)
    private ValueCallback<Uri[]> pendingFileCallback;
    // پل جاوا فقط برای صفحه خود برنامه؛ متدهای پل روی رشته دیگری اجرا می‌شوند و getUrl() آن‌جا مجاز نیست
    private volatile boolean pageIsApp = false;
    private BiometricVault bio;
    // دکمه اعلان (ثبت خروج / بستن) تا وقتی صفحه آماده شود
    private String pendingAppAction;
    // نسخه دوم داده روی دیسک: WebView نوشته‌های localStorage را با تأخیر ذخیره می‌کند و با ری‌استارت گوشی گم می‌شدند
    private static final Pattern STORE_KEY = Pattern.compile("^geomat_[a-z0-9_]+$");
    private static final String STORE_SEQ = ".seq";
    // فقط وقتی همه داده یک بار کامل نوشته شده باشد؛ هر نوشتنِ ناموفق آن را پاک می‌کند (بازگردانی فقط از نسخه کامل)
    private static final String STORE_COMPLETE = ".complete";
    // نشانه حذف هر کلید (key.del)؛ بازگردانی فقط کلیدهایی را پاک می‌کند که واقعاً حذف شده‌اند
    private static final String STORE_DEL = ".del";
    private final Object storeLock = new Object();

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        bio = new BiometricVault(this);
        pendingAppAction = getIntent() != null ? getIntent().getStringExtra(ExitReminder.EXTRA_APP_ACTION) : null;
        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setGeolocationEnabled(true);
        // اندروید ۶ و قدیمی‌تر بدون این مسیر اجازه لوکیشن صفحه را ذخیره/اعمال نمی‌کند
        settings.setGeolocationDatabasePath(getFilesDir().getPath());

        // WebChromeClient: بدون آن confirm/alert نمایش داده نمی‌شوند و لوکیشن به صفحه نمی‌رسد
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (hasLocationPermission()) {
                    callback.invoke(origin, true, false);
                    return;
                }
                if (pendingGeoCallback != null) {
                    pendingGeoCallback.invoke(pendingGeoOrigin, false, false);
                }
                pendingGeoOrigin = origin;
                pendingGeoCallback = callback;
                ActivityCompat.requestPermissions(MainActivity.this, new String[]{
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                }, REQ_LOCATION);
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingFileCallback != null) pendingFileCallback.onReceiveValue(null);
                pendingFileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                try {
                    startActivityForResult(Intent.createChooser(intent, "انتخاب فایل"), REQ_PICK_FILE);
                } catch (Exception e) {
                    // callback همین‌جا جواب گرفت؛ باید true برگردد وگرنه WebView دوباره صدایش می‌زند
                    pendingFileCallback = null;
                    callback.onReceiveValue(null);
                    Toast.makeText(MainActivity.this, "برنامه‌ای برای انتخاب فایل پیدا نشد", Toast.LENGTH_LONG).show();
                }
                return true;
            }
        });

        // WebView دانلود blob را پشتیبانی نمی‌کند؛ صفحه فایل‌ها (اکسل، پشتیبان) را از این پل ذخیره می‌کند
        webView.addJavascriptInterface(new AppBridge(), "AndroidBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                pageIsApp = url != null && url.startsWith(APP_URL);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageIsApp = url != null && url.startsWith(APP_URL);
                deliverAppAction();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUri(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUri(Uri.parse(url));
            }

            private boolean handleUri(Uri uri) {
                String uriStr = uri.toString();
                String scheme = uri.getScheme();

                if (scheme != null && (scheme.equals("whatsapp") || uriStr.contains("api.whatsapp.com") || uriStr.contains("wa.me"))) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                        startActivity(intent);
                        return true;
                    } catch (Exception e) {
                        try {
                            String textParam = uri.getQueryParameter("text");
                            if (textParam != null) {
                                Intent webIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://api.whatsapp.com/send?text=" + Uri.encode(textParam)));
                                startActivity(webIntent);
                                return true;
                            }
                        } catch (Exception ignored) {}
                    }
                } else if (scheme != null && uriStr.startsWith(APP_URL)) {
                    return false; // خود برنامه
                } else if (scheme != null && !scheme.equals("file") && !scheme.equals("javascript")) {
                    // هر صفحه بیرونی (از جمله http/https) در مرورگر یا برنامه خودش باز می‌شود، نه داخل WebView،
                    // تا هیچ صفحه‌ای جز برنامه به پل جاوا (AndroidBridge) دسترسی نداشته باشد
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (Exception ignored) {}
                    return true;
                }
                return true; // فایل‌های دیگر و javascript: بارگذاری نمی‌شوند
            }
        });

        webView.loadUrl("file:///android_asset/index.html");
    }

    private class AppBridge {
        @JavascriptInterface
        public void saveFile(final String name, final String mime, final String content) {
            if (!pageIsApp) return;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    pendingSaveContent = content;
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                    intent.putExtra(Intent.EXTRA_TITLE, name);
                    try {
                        startActivityForResult(intent, REQ_SAVE_FILE);
                    } catch (Exception e) {
                        pendingSaveContent = null;
                        Toast.makeText(MainActivity.this, "ذخیره فایل ممکن نشد", Toast.LENGTH_LONG).show();
                    }
                }
            });
        }

        // ---------- بیومتریک ----------
        @JavascriptInterface
        public String bioStatus() {
            return pageIsApp ? bio.status() : "unavailable";
        }

        @JavascriptInterface
        public boolean bioEnrolled(String userId) {
            return pageIsApp && userId != null && bio.enrolled(userId);
        }

        @JavascriptInterface
        public void bioEnroll(final String userId, final String rawB64, final String cbId) {
            if (!pageIsApp || userId == null || rawB64 == null) return;
            runOnUiThread(() -> bio.enroll(userId, rawB64, (ok, payload) -> bioDone(cbId, ok, payload)));
        }

        @JavascriptInterface
        public void bioUnlock(final String userId, final String cbId) {
            if (!pageIsApp || userId == null) return;
            runOnUiThread(() -> bio.unlock(userId, (ok, payload) -> bioDone(cbId, ok, payload)));
        }

        @JavascriptInterface
        public void bioRemove(String userId) {
            if (pageIsApp && userId != null) bio.remove(userId);
        }

        // ---------- یادآوری خروج ----------
        @JavascriptInterface
        public void scheduleExitReminder(String title, String body, String atMillis, String key) {
            if (!pageIsApp || title == null || body == null || key == null) return;
            try {
                ExitReminder.schedule(MainActivity.this, title, body, Long.parseLong(atMillis), key);
            } catch (NumberFormatException ignored) {
            }
        }

        // همان، به‌علاوه اعلان ماندگارِ «حضور» از لحظه ورود (صفحه‌های قدیمی فقط scheduleExitReminder را صدا می‌زنند)
        @JavascriptInterface
        public void scheduleExitReminder2(String title, String body, String atMillis, String key, String ongoingTitle, String ongoingBody) {
            if (!pageIsApp || title == null || body == null || key == null) return;
            try {
                ExitReminder.schedule(MainActivity.this, title, body, Long.parseLong(atMillis), key, ongoingTitle, ongoingBody);
            } catch (NumberFormatException ignored) {
            }
        }

        // ---------- نسخه دوم داده (هر نوشتن همان لحظه و اتمیک روی دیسک) ----------
        @JavascriptInterface
        public String storeSet(String key, String value) {
            if (!pageIsApp || key == null || value == null || !STORE_KEY.matcher(key).matches()) return "0";
            synchronized (storeLock) {
                try {
                    // اول نشانه حذف پاک می‌شود، بعد داده: «هر دو فایل هست» فقط یعنی حذفی که نیمه‌کاره ماند (حذف برنده است)
                    File del = new File(storeDir(), key + STORE_DEL);
                    if (del.exists() && !del.delete()) throw new IOException("tombstone");
                    writeAtomic(new File(storeDir(), key), value);
                    return Long.toString(bumpStoreSeq());
                } catch (Exception e) {
                    clearStoreComplete();
                    return "0";
                }
            }
        }

        @JavascriptInterface
        public String storeRemove(String key) {
            if (!pageIsApp || key == null || !STORE_KEY.matcher(key).matches()) return "0";
            synchronized (storeLock) {
                try {
                    writeAtomic(new File(storeDir(), key + STORE_DEL), "1");
                    File f = new File(storeDir(), key);
                    if (f.exists() && !f.delete()) throw new IOException("delete");
                    return Long.toString(bumpStoreSeq());
                } catch (Exception e) {
                    clearStoreComplete();
                    return "0";
                }
            }
        }

        @JavascriptInterface
        public String storeSnapshot() {
            if (!pageIsApp) return "null";
            synchronized (storeLock) {
                try {
                    JSONObject data = new JSONObject();
                    org.json.JSONArray removed = new org.json.JSONArray();
                    File[] files = storeDir().listFiles();
                    if (files != null) {
                        for (File f : files) {
                            String n = f.getName();
                            if (STORE_KEY.matcher(n).matches()) data.put(n, readText(f));
                            else if (n.endsWith(STORE_DEL) && STORE_KEY.matcher(n.substring(0, n.length() - STORE_DEL.length())).matches()) {
                                removed.put(n.substring(0, n.length() - STORE_DEL.length()));
                            }
                        }
                    }
                    JSONObject out = new JSONObject();
                    out.put("seq", readSeq());
                    out.put("complete", new File(storeDir(), STORE_COMPLETE).exists());
                    out.put("data", data);
                    out.put("removed", removed);
                    return out.toString();
                } catch (Exception e) {
                    return "null";
                }
            }
        }

        // صفحه بعد از نوشتن کامل همه داده (بدون هیچ خطا) این را صدا می‌زند
        @JavascriptInterface
        public boolean storeMarkComplete() {
            if (!pageIsApp) return false;
            synchronized (storeLock) {
                try {
                    writeAtomic(new File(storeDir(), STORE_COMPLETE), "1");
                    return true;
                } catch (Exception e) {
                    return false;
                }
            }
        }

        @JavascriptInterface
        public void cancelExitReminder() {
            if (pageIsApp) ExitReminder.cancel(MainActivity.this);
        }

        @JavascriptInterface
        public void testNotification() {
            if (pageIsApp) ExitReminder.scheduleTest(MainActivity.this);
        }

        // سامسونگ و بقیه برنامه‌های «خوابیده» را می‌بندند؛ صفحه تنظیمات باتری همین برنامه
        @JavascriptInterface
        public void openBatterySettings() {
            if (!pageIsApp) return;
            runOnUiThread(() -> {
                try {
                    startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "تنظیمات باز نشد", Toast.LENGTH_LONG).show();
                }
            });
        }

        @JavascriptInterface
        public String notificationPermission() {
            if (Build.VERSION.SDK_INT < 33) return "granted";
            if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return "granted";
            return "ask";
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            if (!pageIsApp || Build.VERSION.SDK_INT < 33) return;
            runOnUiThread(() -> ActivityCompat.requestPermissions(MainActivity.this,
                    new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS));
        }
    }

    private File storeDir() {
        File d = new File(getFilesDir(), "geoteam_store");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    // اول فایل موقت، fsync، بعد rename: با قطع برق یا ری‌استارت یا نسخه قبلی کامل می‌ماند یا نسخه تازه
    private static void writeAtomic(File f, String text) throws IOException {
        File tmp = new File(f.getPath() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(text.getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        }
        if (!tmp.renameTo(f)) throw new IOException("rename failed");
    }

    private static String readText(File f) throws IOException {
        try (InputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[16384];
            int n;
            while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
            return new String(buf.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private void clearStoreComplete() {
        File c = new File(storeDir(), STORE_COMPLETE);
        if (c.exists()) c.delete();
    }

    private long readSeq() {
        try {
            return Long.parseLong(readText(new File(storeDir(), STORE_SEQ)).trim());
        } catch (Exception e) {
            return 0L;
        }
    }

    private long bumpStoreSeq() throws IOException {
        long next = readSeq() + 1;
        writeAtomic(new File(storeDir(), STORE_SEQ), Long.toString(next));
        return next;
    }

    private void bioDone(final String cbId, final boolean ok, final String payload) {
        runOnUiThread(() -> {
            if (webView == null || !pageIsApp) return;
            webView.evaluateJavascript("window.__geoBioDone && window.__geoBioDone(" + JSONObject.quote(cbId) + ","
                    + ok + "," + JSONObject.quote(payload == null ? "" : payload) + ")", null);
        });
    }

    // دکمه‌های اعلان یادآوری خروج
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String action = intent.getStringExtra(ExitReminder.EXTRA_APP_ACTION);
        if (action != null) {
            pendingAppAction = action;
            deliverAppAction();
        }
    }

    private void deliverAppAction() {
        if (pendingAppAction == null || webView == null || !pageIsApp) return;
        String a = pendingAppAction;
        pendingAppAction = null;
        webView.evaluateJavascript("window.handleNotificationAction && window.handleNotificationAction(" + JSONObject.quote(a) + ")", null);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_PICK_FILE) {
            if (pendingFileCallback != null) {
                Uri[] result = null;
                if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                    result = new Uri[]{data.getData()};
                }
                pendingFileCallback.onReceiveValue(result);
                pendingFileCallback = null;
            }
        } else if (requestCode == REQ_SAVE_FILE) {
            String content = pendingSaveContent;
            pendingSaveContent = null;
            if (resultCode != RESULT_OK || data == null || data.getData() == null || content == null) return;
            try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                if (out == null) throw new java.io.IOException("no stream");
                out.write(content.getBytes(StandardCharsets.UTF_8));
                Toast.makeText(this, "فایل ذخیره شد ✅", Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, "ذخیره فایل ممکن نشد", Toast.LENGTH_LONG).show();
            }
        }
    }

    private boolean hasLocationPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_NOTIFICATIONS) {
            // اعلان ماندگار حضور بدون اجازه نشان داده نشد (یافته android-r4 #2): الان که اجازه آمده، دوباره نشان بده
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) ExitReminder.restoreOngoing(this);
            return;
        }
        if (requestCode != REQ_LOCATION || pendingGeoCallback == null) return;
        // اجازه را در WebView ذخیره نکن تا اگر کاربر بعداً از تنظیمات لغوش کرد، دوباره پرسیده شود
        pendingGeoCallback.invoke(pendingGeoOrigin, hasLocationPermission(), false);
        pendingGeoCallback = null;
        pendingGeoOrigin = null;
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        // اول از صفحه بپرس: تقویم، پنجره‌ها یا تب دیگر باز است؟ فقط اگر نه، اپ بسته شود
        webView.evaluateJavascript("(window.handleBack && window.handleBack()) ? 'handled' : 'exit'", value -> {
            if (!"\"handled\"".equals(value)) {
                if (webView.canGoBack()) webView.goBack();
                else MainActivity.super.onBackPressed();
            }
        });
    }
}

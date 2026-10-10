package com.geomatco.attendance;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
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
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends AppCompatActivity {

    private static final int REQ_LOCATION = 1001;
    private static final int REQ_SAVE_FILE = 1002;
    private static final int REQ_PICK_FILE = 1003;
    private static final String APP_URL = "file:///android_asset/index.html";

    private WebView webView;
    // درخواست لوکیشنِ صفحه که منتظر پاسخ اجازه اندروید است
    private String pendingGeoOrigin;
    private GeolocationPermissions.Callback pendingGeoCallback;
    // محتوای فایلی که صفحه می‌خواهد ذخیره کند، تا کاربر محل ذخیره را انتخاب کند
    private String pendingSaveContent;
    // انتخاب فایل برای <input type="file"> (بازگردانی پشتیبان)
    private ValueCallback<Uri[]> pendingFileCallback;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

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
                    pendingFileCallback = null;
                    callback.onReceiveValue(null);
                    return false;
                }
                return true;
            }
        });

        // WebView دانلود blob را پشتیبانی نمی‌کند؛ صفحه فایل‌ها (اکسل، پشتیبان) را از این پل ذخیره می‌کند
        webView.addJavascriptInterface(new FileBridge(), "AndroidBridge");

        webView.setWebViewClient(new WebViewClient() {
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
                } else if (scheme != null && !scheme.equals("file") && !scheme.equals("http") && !scheme.equals("https")) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                        startActivity(intent);
                        return true;
                    } catch (Exception ignored) {}
                }
                return false;
            }
        });

        webView.loadUrl("file:///android_asset/index.html");
    }

    private class FileBridge {
        @JavascriptInterface
        public void saveFile(final String name, final String mime, final String content) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    String url = webView.getUrl();
                    if (url == null || !url.startsWith(APP_URL)) return; // فقط صفحه خود اپ
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
        if (requestCode != REQ_LOCATION || pendingGeoCallback == null) return;
        // اجازه را در WebView ذخیره نکن تا اگر کاربر بعداً از تنظیمات لغوش کرد، دوباره پرسیده شود
        pendingGeoCallback.invoke(pendingGeoOrigin, hasLocationPermission(), false);
        pendingGeoCallback = null;
        pendingGeoOrigin = null;
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}

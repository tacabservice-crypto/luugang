package com.ludosom.game;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private File updateFile() { return new File(getContext().getCacheDir(), "LudoSom-update.apk"); }

    @PluginMethod
    public void getAppInfo(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject result = new JSObject();
            result.put("versionCode", Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode);
            result.put("versionName", info.versionName);
            call.resolve(result);
        } catch (Exception error) { call.reject("App version could not be read.", error); }
    }

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) { call.reject("Invalid update URL."); return; }
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(30000);
                connection.connect();
                if (connection.getResponseCode() / 100 != 2) throw new Exception("Download failed.");
                long total = connection.getContentLengthLong();
                long received = 0;
                byte[] buffer = new byte[32 * 1024];
                try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(updateFile())) {
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        output.write(buffer, 0, count);
                        received += count;
                        JSObject progress = new JSObject();
                        progress.put("percent", total > 0 ? Math.min(100, (int) (received * 100 / total)) : 0);
                        notifyListeners("downloadProgress", progress);
                    }
                }
                JSObject result = new JSObject(); result.put("ready", true); call.resolve(result);
            } catch (Exception error) {
                updateFile().delete();
                call.reject(error.getMessage(), error);
            } finally { if (connection != null) connection.disconnect(); }
        }, "ludosom-apk-update").start();
    }

    @PluginMethod
    public void install(PluginCall call) {
        File apk = updateFile();
        if (!apk.exists()) { call.reject("Update file is not ready."); return; }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(settings);
            call.reject("Allow app installs, then tap Install again.");
            return;
        }
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }
}

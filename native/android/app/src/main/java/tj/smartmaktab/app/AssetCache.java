package tj.smartmaktab.app;

import android.content.Context;
import android.util.Log;
import java.io.*;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import javax.net.ssl.HttpsURLConnection;

/** Caches web assets (HTML/CSS/JS) from GitHub for offline use. */
final class AssetCache {
 private static final String TAG = "AssetCache";
 private static final String CACHE_DIR = "web_cache";
 private static final String VERSION_FILE = "version.txt";
 private final File cacheRoot;
 private String cachedVersion = "";
 
 AssetCache(Context context) {
  cacheRoot = new File(context.getFilesDir(), CACHE_DIR);
  if (!cacheRoot.exists()) cacheRoot.mkdirs();
  loadVersion();
 }
 
 private void loadVersion() {
  File vf = new File(cacheRoot, VERSION_FILE);
  if (vf.exists()) {
   try (BufferedReader r = new BufferedReader(new FileReader(vf))) {
    cachedVersion = r.readLine();
   } catch (IOException e) { Log.e(TAG, "Failed to load version", e); }
  }
 }
 
 private void saveVersion(String version) {
  File vf = new File(cacheRoot, VERSION_FILE);
  try (Writer w = new FileWriter(vf)) { w.write(version); cachedVersion = version; }
  catch (IOException e) { Log.e(TAG, "Failed to save version", e); }
 }
 
 /** Checks GitHub for new version. Returns true if update available. */
 boolean checkForUpdate(String repo) {
  try {
   String body = WindowsRelease.read("https://api.github.com/repos/"+repo+"/releases?per_page=5", true, 4*1024*1024);
   org.json.JSONArray releases = new org.json.JSONArray(body);
   for (int i = 0; i < releases.length(); i++) {
    org.json.JSONObject rel = releases.optJSONObject(i);
    if (rel == null || rel.optBoolean("draft") || rel.optBoolean("prerelease")) continue;
    String tagName = rel.optString("tag_name", "");
    if (tagName.startsWith("assets-v")) {
     String ver = tagName.substring(8);
     return ver.compareTo(cachedVersion) > 0;
    }
   }
  } catch (Exception e) { Log.e(TAG, "Update check failed", e); }
  return false;
 }
 
 /** Downloads and caches web assets from GitHub release. */
 boolean updateAssets(String repo, ProgressListener listener) {
  try {
   String body = WindowsRelease.read("https://api.github.com/repos/"+repo+"/releases?per_page=5", true, 4*1024*1024);
   org.json.JSONArray releases = new org.json.JSONArray(body);
   for (int i = 0; i < releases.length(); i++) {
    org.json.JSONObject rel = releases.optJSONObject(i);
    if (rel == null || rel.optBoolean("draft") || rel.optBoolean("prerelease")) continue;
    String tagName = rel.optString("tag_name", "");
    if (!tagName.startsWith("assets-v")) continue;
    String ver = tagName.substring(8);
    if (ver.compareTo(cachedVersion) <= 0) return false;
    
    org.json.JSONArray assets = rel.getJSONArray("assets");
    for (int n = 0; n < assets.length(); n++) {
     org.json.JSONObject asset = assets.getJSONObject(n);
     String name = asset.getString("name");
     String url = asset.getString("browser_download_url");
     if (!name.startsWith("web-") || !name.endsWith(".zip")) continue;
     
     if (listener != null) listener.onProgress("Скачиваем " + name, 0);
     File tempFile = File.createTempFile("web-update-", ".zip", cacheRoot);
     HttpsURLConnection conn = WindowsRelease.open(url, false);
     try (InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(tempFile)) {
      byte[] buffer = new byte[65536];
      int n2;
      while ((n2 = in.read(buffer)) != -1) out.write(buffer, 0, n2);
     } finally { conn.disconnect(); }
     
     if (listener != null) listener.onProgress("Распаковываем...", 50);
     unzip(tempFile, cacheRoot);
     tempFile.delete();
     saveVersion(ver);
     if (listener != null) listener.onProgress("Обновлено", 100);
     return true;
    }
   }
  } catch (Exception e) { Log.e(TAG, "Update failed", e); }
  return false;
 }
 
 private void unzip(File zip, File destDir) throws IOException {
  java.util.zip.ZipInputStream zis = new java.util.zip.ZipInputStream(new FileInputStream(zip));
  try {
   java.util.zip.ZipEntry entry;
   while ((entry = zis.getNextEntry()) != null) {
    File outFile = new File(destDir, entry.getName());
    if (!outFile.getCanonicalPath().startsWith(destDir.getCanonicalPath())) continue;
    if (entry.isDirectory()) { outFile.mkdirs(); continue; }
    outFile.getParentFile().mkdirs();
    try (FileOutputStream fos = new FileOutputStream(outFile)) {
     byte[] buffer = new byte[65536];
     int n;
     while ((n = zis.read(buffer)) != -1) fos.write(buffer, 0, n);
    }
   }
  } finally { zis.close(); }
 }
 
 /** Serves cached file or falls back to APK assets. */
 InputStream getAsset(String path) throws IOException {
  File cached = new File(cacheRoot, path);
  if (cached.exists()) return new FileInputStream(cached);
  return null;
 }
 
 boolean hasCachedVersion() { return !cachedVersion.isEmpty(); }
 String getCachedVersion() { return cachedVersion; }
 
 interface ProgressListener {
  void onProgress(String message, int percent);
 }
}

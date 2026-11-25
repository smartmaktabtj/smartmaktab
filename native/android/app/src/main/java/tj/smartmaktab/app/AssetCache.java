package tj.smartmaktab.app;

import android.content.Context;
import android.util.Log;
import java.io.*;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;

/** Caches web assets (HTML/CSS/JS) from GitHub for offline use. */
final class AssetCache {
 private static final String TAG = "AssetCache";
 private static final String CACHE_DIR = "web_cache";
 private static final String VERSION_FILE = "version.txt";
 private final File cacheRoot;
 private String cachedVersion = "";

 enum UpdateStatus {
  UPDATED,
  UP_TO_DATE,
  NETWORK_ERROR,
  CANCELLED
 }

 AssetCache(Context context) {
  cacheRoot = new File(context.getFilesDir(), CACHE_DIR);
  if (!cacheRoot.exists()) cacheRoot.mkdirs();
  loadVersion();
 }

 private void loadVersion() {
  File vf = new File(cacheRoot, VERSION_FILE);
  if (vf.exists()) {
   try (BufferedReader r = new BufferedReader(new FileReader(vf))) {
    String line = r.readLine();
    cachedVersion = line != null ? line.trim() : "";
   } catch (IOException e) { Log.e(TAG, "Failed to load version", e); }
  }
 }

 private void saveVersion(String version) {
  File vf = new File(cacheRoot, VERSION_FILE);
  try (Writer w = new FileWriter(vf)) { w.write(version); cachedVersion = version; }
  catch (IOException e) { Log.e(TAG, "Failed to save version", e); }
 }

 static int compareVersions(String a, String b) {
  String left = a == null ? "" : a.trim();
  String right = b == null ? "" : b.trim();
  if (right.isEmpty()) return left.isEmpty() ? 0 : 1;
  if (left.isEmpty()) return -1;
  String[] x = left.split("\\.");
  String[] y = right.split("\\.");
  int len = Math.max(x.length, y.length);
  for (int i = 0; i < len; i++) {
   String xs = i < x.length ? x[i] : "0";
   String ys = i < y.length ? y[i] : "0";
   try {
    int cmp = Integer.compare(Integer.parseInt(xs), Integer.parseInt(ys));
    if (cmp != 0) return cmp;
   } catch (NumberFormatException ignored) {
    int cmp = xs.compareTo(ys);
    if (cmp != 0) return cmp;
   }
  }
  return 0;
 }

 /** Downloads and caches newest web assets from GitHub release. */
 UpdateStatus updateAssets(String repo, ProgressListener listener, WindowsRelease.CancelHandle cancel) {
  File tempFile = null;
  try {
   String body = WindowsRelease.read("https://api.github.com/repos/" + repo + "/releases?per_page=30", true, 4 * 1024 * 1024, cancel);
   org.json.JSONArray releases = new org.json.JSONArray(body);
   String bestVer = null;
   String bestName = null;
   String bestUrl = null;
   long bestSize = -1;

   for (int i = 0; i < releases.length(); i++) {
    if ((cancel != null && cancel.isCancelled()) || Thread.currentThread().isInterrupted()) return UpdateStatus.CANCELLED;
    org.json.JSONObject rel = releases.optJSONObject(i);
    if (rel == null || rel.optBoolean("draft") || rel.optBoolean("prerelease")) continue;
    String tagName = rel.optString("tag_name", "");
    if (!tagName.startsWith("assets-v")) continue;
    String ver = tagName.substring(8).trim();
    if (ver.isEmpty() || compareVersions(ver, cachedVersion) <= 0) continue;
    if (bestVer != null && compareVersions(ver, bestVer) <= 0) continue;

    org.json.JSONArray assets = rel.optJSONArray("assets");
    if (assets == null) continue;
    for (int n = 0; n < assets.length(); n++) {
     org.json.JSONObject asset = assets.optJSONObject(n);
     if (asset == null || !"uploaded".equals(asset.optString("state"))) continue;
     String name = asset.optString("name", "");
     String url = asset.optString("browser_download_url", "");
     long size = asset.optLong("size", -1);
     if (!name.startsWith("web-") || !name.endsWith(".zip") || url.isEmpty()) continue;
     try { if (!WindowsRelease.allowed(new URL(url), false)) continue; }
     catch (Exception ignored) { continue; }
     bestVer = ver;
     bestName = name;
     bestUrl = url;
     bestSize = size;
     break;
    }
   }

   if (bestVer == null || bestUrl == null) return UpdateStatus.UP_TO_DATE;

   tempFile = File.createTempFile("web-update-", ".zip", cacheRoot);
   HttpsURLConnection conn = WindowsRelease.open(bestUrl, false, cancel);
   long connLen = conn.getContentLengthLong();
   long total = connLen > 0 ? connLen : bestSize;
   if (listener != null) listener.onFileFound(bestName, total);

   long downloaded = 0;
   try (InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(tempFile)) {
    byte[] buffer = new byte[16384];
    int n2;
    while ((n2 = in.read(buffer)) != -1) {
     if ((cancel != null && cancel.isCancelled()) || Thread.currentThread().isInterrupted()) return UpdateStatus.CANCELLED;
     out.write(buffer, 0, n2);
     downloaded += n2;
     if (listener != null) {
      int pct = total > 0 ? (int) Math.min(90L, (downloaded * 90L) / total) : 0;
      listener.onProgress(downloaded, total, pct, "downloading");
     }
    }
   } finally { if (cancel != null) cancel.clear(conn); conn.disconnect(); }

   if ((cancel != null && cancel.isCancelled()) || Thread.currentThread().isInterrupted()) return UpdateStatus.CANCELLED;
   if (listener != null) listener.onProgress(downloaded, total, 95, "unpacking");
   unzip(tempFile, cacheRoot, cancel);
   tempFile.delete();
   tempFile = null;
   saveVersion(bestVer);
   if (listener != null) listener.onProgress(downloaded, total, 100, "done");
   return UpdateStatus.UPDATED;
  } catch (InterruptedIOException e) {
   return UpdateStatus.CANCELLED;
  } catch (Exception e) {
   Log.e(TAG, "Update failed", e);
   return ((cancel != null && cancel.isCancelled()) || Thread.currentThread().isInterrupted()) ? UpdateStatus.CANCELLED : UpdateStatus.NETWORK_ERROR;
  } finally {
   if (tempFile != null && tempFile.exists()) tempFile.delete();
  }
 }

 private void unzip(File zip, File destDir, WindowsRelease.CancelHandle cancel) throws IOException {
  String canonicalDest = destDir.getCanonicalPath() + File.separator;
  try (java.util.zip.ZipInputStream zis = new java.util.zip.ZipInputStream(new FileInputStream(zip))) {
   java.util.zip.ZipEntry entry;
   while ((entry = zis.getNextEntry()) != null) {
    if ((cancel != null && cancel.isCancelled()) || Thread.currentThread().isInterrupted()) throw new InterruptedIOException();
    File outFile = new File(destDir, entry.getName());
    String canonicalOut = outFile.getCanonicalPath();
    if (!canonicalOut.startsWith(canonicalDest)) continue;
    if (entry.isDirectory()) { outFile.mkdirs(); continue; }
    File parent = outFile.getParentFile();
    if (parent != null) parent.mkdirs();
    try (FileOutputStream fos = new FileOutputStream(outFile)) {
     byte[] buffer = new byte[65536];
     int n;
     while ((n = zis.read(buffer)) != -1) {
      if ((cancel != null && cancel.isCancelled()) || Thread.currentThread().isInterrupted()) throw new InterruptedIOException();
      fos.write(buffer, 0, n);
     }
    }
   }
  }
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
  void onFileFound(String fileName, long totalBytes);
  void onProgress(long downloadedBytes, long totalBytes, int percent, String stage);
 }
}

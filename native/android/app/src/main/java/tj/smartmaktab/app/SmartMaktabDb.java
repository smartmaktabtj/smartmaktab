package tj.smartmaktab.app;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import org.json.JSONObject;

/** Durable SQLite store for workspace configuration, chosen roles, school profiles, and cabinet state. */
final class SmartMaktabDb extends SQLiteOpenHelper {
 private static final String DB_NAME = "smartmaktab.db";
 private static final int DB_VERSION = 1;
 private static final String KEY_PATTERN = "[A-Za-z0-9._:-]{1,128}";
 private static final String ROUTE_PATTERN = "cabinets/(?:[a-z-]+/)*[a-z-]+\\.html\\?(?:school=demo-[a-z0-9]+&)?lang=(?:tg|ru)";

 SmartMaktabDb(Context context) {
  super(context.getApplicationContext(), DB_NAME, null, DB_VERSION);
  setWriteAheadLoggingEnabled(true);
 }

 @Override
 public void onCreate(SQLiteDatabase db) {
  db.execSQL(
   "CREATE TABLE IF NOT EXISTS kv_store ("
    + "k TEXT PRIMARY KEY, "
    + "v TEXT NOT NULL, "
    + "updated_at INTEGER NOT NULL)"
  );
  db.execSQL(
   "CREATE TABLE IF NOT EXISTS user_session ("
    + "id INTEGER PRIMARY KEY CHECK (id = 1), "
    + "active_role TEXT NOT NULL DEFAULT '', "
    + "active_school TEXT NOT NULL DEFAULT '', "
    + "active_lang TEXT NOT NULL DEFAULT 'tg', "
    + "active_route TEXT NOT NULL DEFAULT '', "
    + "configured INTEGER NOT NULL DEFAULT 0, "
    + "updated_at INTEGER NOT NULL)"
  );
 }

 @Override
 public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
  onCreate(db);
 }

 private static boolean validKey(String key) {
  return key != null && key.matches(KEY_PATTERN);
 }

 private static boolean validRoute(String route) {
  return route != null && route.length() <= 240 && route.matches(ROUTE_PATTERN);
 }

 synchronized String getItem(String key) {
  if (!validKey(key)) return null;
  SQLiteDatabase db = getReadableDatabase();
  try (Cursor c = db.rawQuery("SELECT v FROM kv_store WHERE k = ?", new String[]{key})) {
   return c.moveToFirst() ? c.getString(0) : null;
  }
 }

 synchronized boolean setItem(String key, String value) {
  if (!validKey(key) || value == null || value.length() > 512000) return false;
  SQLiteDatabase db = getWritableDatabase();
  ContentValues cv = new ContentValues();
  cv.put("k", key);
  cv.put("v", value);
  cv.put("updated_at", System.currentTimeMillis());
  return db.insertWithOnConflict("kv_store", null, cv, SQLiteDatabase.CONFLICT_REPLACE) != -1;
 }

 synchronized boolean removeItem(String key) {
  if (!validKey(key)) return false;
  SQLiteDatabase db = getWritableDatabase();
  db.delete("kv_store", "k = ?", new String[]{key});
  return true;
 }

 synchronized String getAllJson() {
  JSONObject out = new JSONObject();
  SQLiteDatabase db = getReadableDatabase();
  try (Cursor c = db.rawQuery("SELECT k, v FROM kv_store ORDER BY k", null)) {
   while (c.moveToNext()) {
    out.put(c.getString(0), c.getString(1));
   }
  } catch (Exception ignored) {
   return "{}";
  }
  return out.toString();
 }

 synchronized boolean saveResumeSession(String role, String school, String lang, String route) {
  if (!validRoute(route)) return false;
  String safeRole = role != null && role.matches("[a-z0-9-]{1,64}") ? role : "";
  String safeSchool = school != null && school.matches("demo-[a-z0-9]{1,24}") ? school : "";
  String safeLang = "ru".equals(lang) ? "ru" : "tg";
  SQLiteDatabase db = getWritableDatabase();
  ContentValues cv = new ContentValues();
  cv.put("id", 1);
  cv.put("active_role", safeRole);
  cv.put("active_school", safeSchool);
  cv.put("active_lang", safeLang);
  cv.put("active_route", route);
  cv.put("configured", 1);
  cv.put("updated_at", System.currentTimeMillis());
  return db.insertWithOnConflict("user_session", null, cv, SQLiteDatabase.CONFLICT_REPLACE) != -1;
 }

 synchronized boolean clearResumeRoute() {
  SQLiteDatabase db = getWritableDatabase();
  ContentValues cv = new ContentValues();
  cv.put("id", 1);
  cv.put("active_route", "");
  cv.put("configured", 0);
  cv.put("updated_at", System.currentTimeMillis());
  return db.insertWithOnConflict("user_session", null, cv, SQLiteDatabase.CONFLICT_REPLACE) != -1;
 }

 synchronized String getResumeRoute() {
  SQLiteDatabase db = getReadableDatabase();
  try (Cursor c = db.rawQuery("SELECT configured, active_route FROM user_session WHERE id = 1", null)) {
   if (c.moveToFirst() && c.getInt(0) == 1) {
    String route = c.getString(1);
    if (validRoute(route)) return route;
   }
  }
  // Fallback: recover active route from kv_store if user_session wasn't explicitly written yet.
  String rawActive = getItem("smartmaktab.active-cabinet.v1");
  if (rawActive != null) {
   try {
    JSONObject obj = new JSONObject(rawActive);
    String route = obj.optString("route", "");
    if (validRoute(route)) return route;
   } catch (Exception ignored) {}
  }
  return null;
 }
}

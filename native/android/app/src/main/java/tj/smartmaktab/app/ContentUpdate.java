package tj.smartmaktab.app;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;

/** Finds and downloads the newest signed .smupdate pack from GitHub Releases. Windows verifies it. */
final class ContentUpdate {
 static final long MAX_SIZE=512L*1024;
 final String name,url; final long size;
 private ContentUpdate(String name,String url,long size){this.name=name;this.url=url;this.size=size;}
 static ContentUpdate find(String repo) throws Exception {
  return find(repo,null);
 }
 static ContentUpdate find(String repo,WindowsRelease.CancelHandle cancel) throws Exception {
  if(!WindowsRelease.REPOSITORY.matcher(repo).matches()||repo.endsWith("/.")||repo.endsWith("/.."))throw new IOException("repository");
  String body=WindowsRelease.read("https://api.github.com/repos/"+repo+"/releases?per_page=100",true,4*1024*1024,cancel);
  JSONArray releases=new JSONArray(body);
  ContentUpdate best=null;String bestUpdated="";
  for(int i=0;i<releases.length();i++){
   JSONObject release=releases.optJSONObject(i);if(release==null||release.optBoolean("draft")||release.optBoolean("prerelease"))continue;
   JSONArray assets=release.optJSONArray("assets");if(assets==null)continue;
   for(int n=0;n<assets.length();n++){
    JSONObject asset=assets.optJSONObject(n);if(asset==null||!"uploaded".equals(asset.optString("state")))continue;
    String name=asset.optString("name");if(!name.toLowerCase().endsWith(".smupdate"))continue;
    long size=asset.optLong("size",-1);if(size<1||size>MAX_SIZE)continue;
    String url=asset.optString("browser_download_url");if(url.isEmpty())continue;
    try{if(!WindowsRelease.allowed(new URL(url),false))continue;}catch(Exception ignored){continue;}
    String updated=asset.optString("updated_at");
    if(best==null||updated.compareTo(bestUpdated)>0){best=new ContentUpdate(name,url,size);bestUpdated=updated;}
   }
  }
  return best;
 }
 void fetch(File destination) throws Exception {
  fetchWithProgress(destination,null,null);
 }
 void fetchWithProgress(File destination,WindowsRelease.ProgressCallback cb,WindowsRelease.CancelHandle cancel) throws Exception {
  HttpsURLConnection conn=WindowsRelease.open(url,false,cancel);
  long connLen=conn.getContentLengthLong();
  long total=connLen>0?connLen:size;
  if(cb!=null)cb.onProgress(0,total);
  try(InputStream in=conn.getInputStream();OutputStream out=new BufferedOutputStream(new FileOutputStream(destination))){
   long count=0;byte[] buffer=new byte[16384];
   for(int n;(n=in.read(buffer))!=-1;){
    if((cancel!=null&&cancel.isCancelled())||Thread.currentThread().isInterrupted())throw new InterruptedIOException();
    count+=n;if(count>size)throw new IOException("download limit");
    out.write(buffer,0,n);
    if(cb!=null)cb.onProgress(count,total);
   }
   if(count!=size)throw new IOException("download size");
  }finally{if(cancel!=null)cancel.clear(conn);conn.disconnect();}
 }
}

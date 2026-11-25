package tj.smartmaktab.app;

import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.math.BigInteger;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.regex.*;
import javax.net.ssl.HttpsURLConnection;

/** Read only the Windows distribution channel of the repository used to build this APK. */
final class WindowsRelease {
 static final Pattern REPOSITORY=Pattern.compile("[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9._-]{1,100}");
 private static final Pattern TAG=Pattern.compile("windows-unsigned-v((0|[1-9][0-9]{0,8})\\.(0|[1-9][0-9]{0,8})\\.(0|[1-9][0-9]{0,8}))");
 private static final long MAX_SIZE=400L*1024*1024;
 final String version,name,exe,checksums; final long size;
 private WindowsRelease(String repo,String tag,String version,String name,long size){
  this.version=version;this.name=name;this.size=size;
  String prefix="https://github.com/"+repo+"/releases/download/"+tag+"/";
  exe=prefix+name;checksums=prefix+"SHA256SUMS.txt";
 }
 static WindowsRelease select(String repo,JSONArray releases) throws Exception {
  if(!REPOSITORY.matcher(repo).matches()||repo.endsWith("/.")||repo.endsWith("/.."))throw new IOException("repository");
  WindowsRelease best=null;
  for(int i=0;i<releases.length();i++){
   JSONObject release=releases.optJSONObject(i);if(release==null||release.optBoolean("draft")||release.optBoolean("prerelease"))continue;
   String tag=release.optString("tag_name");Matcher match=TAG.matcher(tag);if(!match.matches())continue;
   String version=match.group(1),name="SmartMaktab-"+version+"-Windows-Setup-UNSIGNED.exe",name64="SmartMaktab-"+version+"-Windows-x64-UNSIGNED.exe",name32="SmartMaktab-"+version+"-Windows-ia32-UNSIGNED.exe";
   JSONArray assets=release.optJSONArray("assets");if(assets==null)continue;
   long size=-1;boolean checksum=false,has64=false,has32=false;
   for(int n=0;n<assets.length();n++){
    JSONObject asset=assets.optJSONObject(n);if(asset==null||!"uploaded".equals(asset.optString("state")))continue;
    if(name.equals(asset.optString("name")))size=asset.optLong("size",-1);
    if(name64.equals(asset.optString("name")))has64=true;
    if(name32.equals(asset.optString("name")))has32=true;
    if("SHA256SUMS.txt".equals(asset.optString("name")))checksum=true;
   }
   if(!checksum||!has64||!has32||size<1||size>MAX_SIZE)continue;
   if(best==null||compare(version,best.version)>0)best=new WindowsRelease(repo,tag,version,name,size);
  }
  return best;
 }
 private static int compare(String a,String b){
  String[] x=a.split("\\."),y=b.split("\\.");
  for(int i=0;i<3;i++){int c=Integer.compare(Integer.parseInt(x[i]),Integer.parseInt(y[i]));if(c!=0)return c;}
  return 0;
 }
 static boolean allowed(URL url,boolean api){
  if(!"https".equals(url.getProtocol())||url.getUserInfo()!=null||!(url.getPort()==-1||url.getPort()==443))return false;
  String host=url.getHost().toLowerCase(Locale.ROOT);
  return api?host.equals("api.github.com"):host.equals("github.com")||host.equals("release-assets.githubusercontent.com")||host.equals("objects.githubusercontent.com")||host.equals("github-releases.githubusercontent.com");
 }
 static HttpsURLConnection open(String address,boolean api) throws IOException {
  URL url=new URL(address);
  for(int i=0;i<6;i++){
   if(!allowed(url,api))throw new IOException("download origin");
   HttpsURLConnection conn=(HttpsURLConnection)url.openConnection();conn.setInstanceFollowRedirects(false);
   conn.setConnectTimeout(15000);conn.setReadTimeout(25000);conn.setRequestProperty("User-Agent","SmartMaktab-Android");
   if(api){conn.setRequestProperty("Accept","application/vnd.github+json");conn.setRequestProperty("X-GitHub-Api-Version","2022-11-28");}
   try{
    int code=conn.getResponseCode();if(code==200)return conn;
    String location=conn.getHeaderField("Location");
    if((code==301||code==302||code==303||code==307||code==308)&&location!=null){url=new URL(url,location);conn.disconnect();continue;}
    throw new IOException("HTTP "+code);
   }catch(IOException error){conn.disconnect();throw error;}
  }
  throw new IOException("redirect limit");
 }
 static WindowsRelease find(String repo) throws Exception {
  if(!REPOSITORY.matcher(repo).matches()||repo.endsWith("/.")||repo.endsWith("/.."))throw new IOException("repository");
  return select(repo,new JSONArray(read("https://api.github.com/repos/"+repo+"/releases?per_page=100",true,4*1024*1024)));
 }
 static String read(String url,boolean api,int max) throws IOException {
  HttpsURLConnection conn=open(url,api);
  try(InputStream in=conn.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
   copy(in,out,max,null);return new String(out.toByteArray(),StandardCharsets.UTF_8);
  }finally{conn.disconnect();}
 }
 static String expectedHash(String body,String name) throws IOException {
  for(String raw:body.split("\\r?\\n")){
   String line=raw.trim();if(line.isEmpty())continue;
   Matcher match=Pattern.compile("^([a-fA-F0-9]{64})  "+Pattern.quote(name)+"$").matcher(line);
   if(match.matches())return match.group(1).toLowerCase(Locale.ROOT);
  }
  throw new IOException("checksum format");
 }
 void fetch(File destination) throws Exception {
  String hash=expectedHash(read(checksums,false,4096),name);
  HttpsURLConnection conn=open(exe,false);
  try(InputStream in=conn.getInputStream();OutputStream out=new BufferedOutputStream(new FileOutputStream(destination))){
   MessageDigest digest=MessageDigest.getInstance("SHA-256");
   long count=copy(in,out,size,digest);
   String actual=String.format(Locale.ROOT,"%064x",new BigInteger(1,digest.digest()));
   if(count!=size||!actual.equals(hash))throw new IOException("installer integrity");
  }finally{conn.disconnect();}
 }
 private static long copy(InputStream in,OutputStream out,long max,MessageDigest digest) throws IOException {
  long count=0,deadline=System.nanoTime()+java.util.concurrent.TimeUnit.MINUTES.toNanos(8);
  byte[] buffer=new byte[65536];
  for(int n;(n=in.read(buffer))!=-1;){
   if(Thread.currentThread().isInterrupted()||System.nanoTime()-deadline>=0)throw new InterruptedIOException();
   count+=n;if(count>max)throw new IOException("download limit");
   out.write(buffer,0,n);if(digest!=null)digest.update(buffer,0,n);
  }
  return count;
 }
}

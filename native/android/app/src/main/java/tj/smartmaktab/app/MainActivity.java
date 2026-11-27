package tj.smartmaktab.app;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.provider.DocumentsContract;
import android.util.Base64;
import android.util.TypedValue;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import androidx.webkit.*;
import org.json.JSONObject;
import java.io.*;
import java.util.*;

public final class MainActivity extends Activity {
 private static final String LIVE_HOST="smartmaktabtj.github.io", LIVE_ORIGIN="https://"+LIVE_HOST, LIVE_HOME=LIVE_ORIGIN+"/smartmaktab/", SUPABASE_HOST="waorfkkavzzpbrsvjjln.supabase.co";
 private static final long LIMIT=150L*1024*1024;
 private static final int PICK=30, SAVE=31, OPEN=32, SHARE=33, MEDIA=34, SAVE_WINDOWS=35;
 private WebView view;private ValueCallback<Uri[]> picker;private PermissionRequest media;private String[] mediaResources;
 private File draft;private OutputStream draftOut;private long written,expected;private String fileName,fileMime;private JavaScriptReplyProxy finalReply;
 private File windowsFile;private Thread windowsWorker;private TransferDialog windowsProgress;private WindowsRelease.CancelHandle windowsCancel;private boolean windowsBusy;
 private SmartMaktabDb smartDb;
 private volatile boolean trustedOrigin = true;

 private boolean own(Uri u){
  if(u==null||!"https".equals(u.getScheme())||!LIVE_HOST.equals(u.getHost()))return false;
  if(u.getPort()!=-1&&u.getPort()!=443)return false;
  if(u.getUserInfo()!=null)return false;
  String p=u.getPath();
  return p!=null&&(p.equals("/smartmaktab")||p.startsWith("/smartmaktab/"));
 }
 private boolean ownOrigin(Uri u){
  return u!=null&&"https".equals(u.getScheme())&&LIVE_HOST.equals(u.getHost())&&(u.getPort()==-1||u.getPort()==443)&&u.getUserInfo()==null;
 }
 private boolean book(Uri u){return u!=null&&"https".equals(u.getScheme())&&"raw.githubusercontent.com".equals(u.getHost())&&u.getPath()!=null&&u.getPath().startsWith("/sharipovip/books/");}
 private boolean cloud(Uri u){return u!=null&&"https".equals(u.getScheme())&&SUPABASE_HOST.equals(u.getHost())&&(u.getPort()==-1||u.getPort()==443)&&u.getUserInfo()==null;}

 @Override public void onCreate(Bundle saved){
  super.onCreate(saved);
  if(Build.VERSION.SDK_INT>=26)getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel("smartmaktab_updates","SmartMaktab",NotificationManager.IMPORTANCE_DEFAULT));
  smartDb=new SmartMaktabDb(this);
  FrameLayout holder=new FrameLayout(this);holder.setBackgroundColor(Color.rgb(16,40,33));view=new WebView(this);holder.addView(view,new FrameLayout.LayoutParams(-1,-1));setContentView(holder);
  holder.setOnApplyWindowInsetsListener((v,insets)->{if(Build.VERSION.SDK_INT>=30){android.graphics.Insets areas=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()|WindowInsets.Type.ime());v.setPadding(areas.left,areas.top,areas.right,areas.bottom);}return insets;});
  WebSettings settings=view.getSettings();
  settings.setJavaScriptEnabled(true);
  settings.setDomStorageEnabled(true);
  settings.setAllowFileAccess(false);
  settings.setAllowContentAccess(true);
  settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  settings.setMediaPlaybackRequiresUserGesture(true);
  settings.setJavaScriptCanOpenWindowsAutomatically(false);
  settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
  view.clearCache(true);
  WebView.setWebContentsDebuggingEnabled(false);

  view.setWebViewClient(new WebViewClient(){
   @Override public void onPageStarted(WebView w,String url,Bitmap favicon){trustedOrigin=url!=null&&own(Uri.parse(url));}
   @Override public WebResourceResponse shouldInterceptRequest(WebView w,WebResourceRequest r){Uri u=r.getUrl();if(own(u))return null;if(r.isForMainFrame())return missing();return (book(u)||cloud(u))?null:missing();}
   @Override public boolean shouldOverrideUrlLoading(WebView w,WebResourceRequest r){Uri u=r.getUrl();if(own(u))return false;if(r.isForMainFrame()&&r.hasGesture()&&book(u)){try{startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(ActivityNotFoundException ignored){}}return true;}
   @Override public void onReceivedHttpError(WebView w,WebResourceRequest r,WebResourceResponse err){
    if(r!=null&&r.isForMainFrame()&&err!=null&&err.getStatusCode()==404){
     if(smartDb!=null)smartDb.clearResumeRoute();
     w.loadUrl(LIVE_HOME);
    }
   }
   @Override public void onReceivedError(WebView w,WebResourceRequest r,WebResourceError err){
    if(r==null||!r.isForMainFrame()||isDestroyed()||isFinishing())return;
    if(err!=null&&err.getErrorCode()==ERROR_UNKNOWN)return;
    new AlertDialog.Builder(MainActivity.this)
     .setTitle("Пайвасти интернет нест")
     .setMessage("Барои кушодани SmartMaktab пайвасти интернетро санҷед.")
     .setPositiveButton("Боз кӯшиш кардан",(d,which)->w.loadUrl(LIVE_HOME))
     .setNegativeButton("Пӯшидан",(d,which)->finish())
     .show();
   }
  });
  view.setWebChromeClient(new WebChromeClient(){
   @Override public boolean onShowFileChooser(WebView w,ValueCallback<Uri[]> cb,FileChooserParams params){
    if(!own(Uri.parse(w.getUrl()))||picker!=null)return false;
    picker=cb;try{Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");if(params.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE)i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true);startActivityForResult(i,PICK);return true;}catch(ActivityNotFoundException ex){picker=null;return false;}
   }
   @Override public void onPermissionRequest(PermissionRequest req){
    if(!ownOrigin(req.getOrigin())||!own(Uri.parse(view.getUrl()))||media!=null){req.deny();return;}
    ArrayList<String> permissions=new ArrayList<>();for(String resource:req.getResources()){
     String permission;if(PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource))permission=Manifest.permission.RECORD_AUDIO;else if(PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource))permission=Manifest.permission.CAMERA;else{req.deny();return;}
     if(checkSelfPermission(permission)!=PackageManager.PERMISSION_GRANTED)permissions.add(permission);
    }
    if(permissions.isEmpty()){req.grant(req.getResources());return;}
    media=req;mediaResources=req.getResources();requestPermissions(permissions.toArray(new String[0]),MEDIA);
   }
   @Override public void onPermissionRequestCanceled(PermissionRequest req){if(media==req){media=null;mediaResources=null;}}
  });
  view.addJavascriptInterface(new SqliteBridge(),"SmartMaktabSqlite");
  if(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))WebViewCompat.addWebMessageListener(view,"SmartMaktabAndroid",Collections.singleton(LIVE_ORIGIN),(w,msg,origin,main,reply)->{
   if(!main||!ownOrigin(origin)||!own(Uri.parse(w.getUrl())))return; handle(msg.getData(),reply);
  });
  String resumeRoute=smartDb.getResumeRoute();
  view.loadUrl(LIVE_HOME+(resumeRoute!=null?resumeRoute:""));
  requestInitialPermissions();
 }

 private final class SqliteBridge {
  @JavascriptInterface public String getItem(String key){return trustedOrigin&&smartDb!=null&&!isDestroyed()?smartDb.getItem(key):null;}
  @JavascriptInterface public boolean setItem(String key,String value){return trustedOrigin&&smartDb!=null&&!isDestroyed()&&smartDb.setItem(key,value);}
  @JavascriptInterface public boolean removeItem(String key){return trustedOrigin&&smartDb!=null&&!isDestroyed()&&smartDb.removeItem(key);}
  @JavascriptInterface public String getAllJson(){return trustedOrigin&&smartDb!=null&&!isDestroyed()?smartDb.getAllJson():"{}";}
  @JavascriptInterface public boolean saveResumeSession(String role,String school,String lang,String route){return trustedOrigin&&smartDb!=null&&!isDestroyed()&&smartDb.saveResumeSession(role,school,lang,route);}
  @JavascriptInterface public boolean clearResumeRoute(){return trustedOrigin&&smartDb!=null&&!isDestroyed()&&smartDb.clearResumeRoute();}
  @JavascriptInterface public String getResumeRoute(){return trustedOrigin&&smartDb!=null&&!isDestroyed()?smartDb.getResumeRoute():null;}
 }

 private WebResourceResponse missing(){return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}

 private void handle(String message, JavaScriptReplyProxy reply){
  try{
   if(message==null||message.length()>150000)throw new IOException("limit");JSONObject args=new JSONObject(message);
   switch(args.getString("action")){
    case "downloadWindows":
     confirmWindows();reply.postMessage("ok");return;
    case "openFile":case "shareFile":
     Intent file=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(file,args.getString("action").equals("shareFile")?SHARE:OPEN);reply.postMessage("ok");return;
    case "begin":
     if(draft!=null||finalReply!=null)throw new IOException("busy");expected=args.getLong("size");if(expected<1||expected>LIMIT)throw new IOException("limit");
     fileName=args.getString("name");if(fileName.length()>110||!fileName.matches("[A-Za-z0-9._-]+"))throw new IOException("name");
     fileMime=fileName.endsWith(".pdf")?"application/pdf":fileName.endsWith(".docx")?"application/vnd.openxmlformats-officedocument.wordprocessingml.document":null;if(fileMime==null)throw new IOException("type");
     draft=File.createTempFile("smartmaktab-",".tmp",getCacheDir());draftOut=new BufferedOutputStream(new FileOutputStream(draft));written=0;break;
    case "chunk":
     if(draftOut==null)throw new IOException("not_ready");byte[] bytes=Base64.decode(args.getString("chunk"),Base64.NO_WRAP);
     if(bytes.length>98304||written+bytes.length>expected)throw new IOException("limit");draftOut.write(bytes);written+=bytes.length;break;
    case "finish":
     if(draftOut==null||written!=expected)throw new IOException("length");draftOut.close();draftOut=null;
     Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(fileMime).putExtra(Intent.EXTRA_TITLE,fileName);
     startActivityForResult(save,SAVE);finalReply=reply;return;
    case "abort":clearDraft();break;
    default:throw new IOException("unsupported");
   }
   reply.postMessage("ok");
  }catch(Exception error){if(finalReply==null)clearDraft();reply.postMessage("error");}
 }

 @Override protected void onActivityResult(int id,int result,Intent data){
  super.onActivityResult(id,result,data);
  if(id==PICK&&picker!=null){ValueCallback<Uri[]> selected=picker;picker=null;selected.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));return;}
  Uri uri=result==RESULT_OK&&data!=null?data.getData():null;
  if(id==SAVE_WINDOWS){saveWindows(uri);return;}
  if(id==SAVE){JavaScriptReplyProxy reply=finalReply;finalReply=null;File file=draft;draft=null;
   if(uri==null||file==null){if(file!=null)file.delete();if(reply!=null)reply.postMessage("cancel");return;}
   new Thread(()->{String outcome="ok";try(InputStream in=new FileInputStream(file);OutputStream out=getContentResolver().openOutputStream(uri,"w")){
    if(out==null)throw new IOException("destination");byte[] bytes=new byte[65536];for(int n;(n=in.read(bytes))!=-1;)out.write(bytes,0,n);
   }catch(IOException error){outcome="error";}finally{file.delete();}String status=outcome;runOnUiThread(()->{if(reply!=null&&!isDestroyed())reply.postMessage(status);});}).start();return;
  }
  if(uri==null||!(id==OPEN||id==SHARE))return;
  String type=getContentResolver().getType(uri);if(type==null)type="application/octet-stream";
  Intent send=new Intent(id==SHARE?Intent.ACTION_SEND:Intent.ACTION_VIEW);if(id==SHARE){send.setType(type).putExtra(Intent.EXTRA_STREAM,uri);}else send.setDataAndType(uri,type);
  send.setClipData(ClipData.newRawUri("SmartMaktab",uri));send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
  try{startActivity(Intent.createChooser(send,"SmartMaktab"));}catch(ActivityNotFoundException ignored){Toast.makeText(this,"Барномаи мувофиқ ёфт нашуд",Toast.LENGTH_SHORT).show();}
 }

 @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results){
  super.onRequestPermissionsResult(code,permissions,results);if(code==MEDIA&&media!=null){PermissionRequest pending=media;String[] resources=mediaResources;media=null;mediaResources=null;
   boolean ok=results.length==permissions.length&&results.length>0;for(int r:results)ok &= r==PackageManager.PERMISSION_GRANTED;
   if(ok&&own(Uri.parse(view.getUrl())))pending.grant(resources);else pending.deny();}
 }

 private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}

 private static String formatBytes(long bytes){
  if(bytes<0)return "—";
  if(bytes<1024)return bytes+" Б";
  if(bytes<1024*1024)return String.format(Locale.US,"%.1f КБ",bytes/1024.0);
  return String.format(Locale.US,"%.1f МБ",bytes/(1024.0*1024.0));
 }

 private final class TransferDialog {
  final AlertDialog dialog;
  final TextView status;
  final ProgressBar bar;
  final TextView detail;
  TransferDialog(String title,String initialMessage,Runnable onCancel){
   LinearLayout layout=new LinearLayout(MainActivity.this);
   layout.setOrientation(LinearLayout.VERTICAL);
   layout.setPadding(dp(22),dp(16),dp(22),dp(8));
   status=new TextView(MainActivity.this);
   status.setTextSize(TypedValue.COMPLEX_UNIT_SP,15);
   status.setTextColor(Color.rgb(24,55,44));
   status.setLineSpacing(0f,1.25f);
   status.setText(initialMessage);
   status.setPadding(0,0,0,dp(14));
   bar=new ProgressBar(MainActivity.this,null,android.R.attr.progressBarStyleHorizontal);
   bar.setIndeterminate(true);
   bar.setMax(100);
   bar.setProgress(0);
   LinearLayout.LayoutParams barParams=new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.WRAP_CONTENT);
   barParams.bottomMargin=dp(8);
   bar.setLayoutParams(barParams);
   detail=new TextView(MainActivity.this);
   detail.setTextSize(TypedValue.COMPLEX_UNIT_SP,13);
   detail.setTextColor(Color.rgb(74,99,88));
   detail.setText("");
   layout.addView(status);layout.addView(bar);layout.addView(detail);
   dialog=new AlertDialog.Builder(MainActivity.this)
    .setTitle(title)
    .setView(layout)
    .setCancelable(false)
    .setNegativeButton("Бекор кардан",(d,w)->onCancel.run())
    .show();
  }
  void setProgress(String msg,int percent,String detailText){
   runOnUiThread(()->{
    if(isDestroyed()||isFinishing()||!dialog.isShowing())return;
    bar.setIndeterminate(false);
    bar.setProgress(Math.max(0,Math.min(100,percent)));
    if(msg!=null)status.setText(msg);
    detail.setText(detailText!=null?detailText:(percent+"%"));
   });
  }
  void dismiss(){
   if(dialog.isShowing())dialog.dismiss();
  }
 }

 private void confirmWindows(){
  if(windowsBusy)return;
  windowsBusy=true;
  AlertDialog prompt=new AlertDialog.Builder(this).setTitle("Боргирӣ барои Windows")
   .setMessage("Насбкунандаи универсалии .exe бе имзои рақамӣ ба телефон боргирӣ мешавад. Ҳангоми насб он худаш нусхаи 32- ё 64-битиро барои Windows-и шумо интихоб мекунад. Windows метавонад огоҳ кунад ё насбро манъ кунад. Пас аз боргирӣ ҷузвдони телефонро интихоб кунед, то файлро тавассути USB ба компютер гузаронед.")
   .setPositiveButton("Боргирӣ",(d,w)->downloadWindows())
   .setNegativeButton("Бекор кардан",(d,w)->windowsBusy=false).create();
  prompt.setOnCancelListener(d->windowsBusy=false);prompt.show();
 }

 private void downloadWindows(){
  final WindowsRelease.CancelHandle cancel=new WindowsRelease.CancelHandle();
  windowsCancel=cancel;
  final TransferDialog dlg=new TransferDialog(
   "Боргирии SmartMaktab барои Windows",
   "Ҷустуҷӯи файл барои Windows дар GitHub...\nБарномаро кушода нигоҳ доред.",
   ()->{cancel.cancel();if(windowsWorker!=null)windowsWorker.interrupt();}
  );
  windowsProgress=dlg;
  windowsWorker=new Thread(()->{
   File dest=null;WindowsRelease release=null;int outcome=0;
   final long[] throttle={0L,-1L};
   try(BufferedReader input=new BufferedReader(new InputStreamReader(getAssets().open("windows-release-repository.txt"),java.nio.charset.StandardCharsets.US_ASCII))){
    String repo=input.readLine();if(repo==null)throw new IOException("repository");
    release=WindowsRelease.find(repo,cancel);
    if(release==null)outcome=1;
    else{
     if(getCacheDir().getUsableSpace()<release.size+16L*1024*1024)throw new IOException("space");
     final String foundName=release.name;
     final long foundSize=release.size;
     dlg.setProgress(
      "Файл ёфт шуд: "+foundName+" ("+formatBytes(foundSize)+").\nОмодагӣ ба боргирӣ... Барномаро кушода нигоҳ доред.",
      0,
      "0% · 0 Б / "+formatBytes(foundSize)
     );
     dest=File.createTempFile("smartmaktab-windows-",".part",getCacheDir());
     final String dlMsg="Файл ёфт шуд: "+foundName+" ("+formatBytes(foundSize)+").\nБоргирӣ мешавад... Барномаро кушода нигоҳ доред.";
     release.fetchWithProgress(dest,(bytes,total)->{
      long effectiveTotal=total>0?total:foundSize;
      int pct=effectiveTotal>0?(int)Math.min(100L,(bytes*100L)/effectiveTotal):0;
      long now=SystemClock.uptimeMillis();
      if(bytes==0||bytes>=effectiveTotal||pct!=throttle[1]||(now-throttle[0])>=120L){
       throttle[0]=now;throttle[1]=pct;
       String msg=bytes>=effectiveTotal
        ?"Санҷиши файл (SHA-256)...\nБарномаро кушода нигоҳ доред."
        :dlMsg;
       dlg.setProgress(msg,pct,pct+"% · "+formatBytes(bytes)+" / "+formatBytes(effectiveTotal));
      }
     },cancel);
    }
   }catch(Exception error){outcome=cancel.isCancelled()?3:2;}
   if(cancel.isCancelled())outcome=3;
   final File result=dest;final WindowsRelease selected=release;final int status=outcome;
   runOnUiThread(()->{
    if(this.isDestroyed()){if(result!=null)result.delete();return;}
    boolean cancelled=cancel.cancelled;
    if(windowsCancel==cancel){windowsWorker=null;windowsCancel=null;}
    if(windowsProgress==dlg)windowsProgress=null;
    dlg.dismiss();
    if(cancelled||status!=0||result==null||selected==null){
     if(result!=null)result.delete();windowsBusy=false;
     if(!cancelled&&status==1)windowsToast("Нусхаи Windows ҳанӯз нашр нашудааст.");
     else if(!cancelled&&status!=3)windowsToast("Боргирӣ ё санҷиши файл ноком шуд. Интернет ва ҷойи холиро санҷед.");
     else if(cancelled)windowsToast("Боргирӣ бекор карда шуд.");
     return;
    }
    windowsFile=result;
    Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/octet-stream").putExtra(Intent.EXTRA_TITLE,selected.name);
    try{startActivityForResult(save,SAVE_WINDOWS);}catch(ActivityNotFoundException error){saveWindows(null);windowsToast("Интихоби ҷузвдон кушода нашуд.");}
   });
  },"smartmaktab-windows-download");windowsWorker.start();
 }

 private void saveWindows(Uri uri){
  File file=windowsFile;windowsFile=null;
  if(uri==null||file==null){if(file!=null)file.delete();windowsBusy=false;return;}
  new Thread(()->{
   try(InputStream in=new FileInputStream(file);OutputStream out=getContentResolver().openOutputStream(uri,"w")){
    if(out==null)throw new IOException("destination");byte[] bytes=new byte[65536];for(int n;(n=in.read(bytes))!=-1;)out.write(bytes,0,n);
   }catch(IOException|RuntimeException error){
    try{DocumentsContract.deleteDocument(getContentResolver(),uri);}catch(Exception ignored){}
    file.delete();runOnUiThread(()->windowsSaved(false));return;
   }
   file.delete();runOnUiThread(()->windowsSaved(true));
  },"smartmaktab-windows-save").start();
 }

 private void windowsSaved(boolean ok){
  windowsBusy=false;if(isDestroyed())return;
  windowsToast(ok?"Файли EXE захира шуд. Онро тавассути USB ба компютер гузаронед.":"EXE захира нашуд. Ҷузвдон ва ҷойи холиро санҷед.");
 }

 private void windowsToast(String text){Toast.makeText(this,text,Toast.LENGTH_LONG).show();}
 private void clearDraft(){if(draftOut!=null)try{draftOut.close();}catch(IOException ignored){}draftOut=null;if(draft!=null)draft.delete();draft=null;}

 @Override public void onBackPressed(){view.evaluateJavascript("Boolean(window.smartMaktabBack && window.smartMaktabBack())",handled->{if(!"true".equals(handled)){if(view.canGoBack())view.goBack();else finish();}});}

 private void requestInitialPermissions(){
  if(getSharedPreferences("smartmaktab",MODE_PRIVATE).getBoolean("permissions_requested",false))return;
  getSharedPreferences("smartmaktab",MODE_PRIVATE).edit().putBoolean("permissions_requested",true).apply();
  ArrayList<String> needed=new ArrayList<>();
  if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED)needed.add(Manifest.permission.CAMERA);
  if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)needed.add(Manifest.permission.RECORD_AUDIO);
  if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)needed.add(Manifest.permission.POST_NOTIFICATIONS);
  if(!needed.isEmpty())requestPermissions(needed.toArray(new String[0]),100);
 }

 @Override protected void onDestroy(){
  if(windowsCancel!=null)windowsCancel.cancel();
  if(windowsWorker!=null)windowsWorker.interrupt();
  if(windowsProgress!=null)windowsProgress.dismiss();
  if(windowsFile!=null)windowsFile.delete();
  clearDraft();if(picker!=null)picker.onReceiveValue(null);if(media!=null)media.deny();if(smartDb!=null)smartDb.close();view.destroy();super.onDestroy();
 }
}

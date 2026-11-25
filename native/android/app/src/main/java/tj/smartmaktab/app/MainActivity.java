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
 private static final String HOST="appassets.androidplatform.net", ORIGIN="https://"+HOST;
 private static final long LIMIT=150L*1024*1024;
 private static final int PICK=30, SAVE=31, OPEN=32, SHARE=33, MEDIA=34, SAVE_WINDOWS=35, SAVE_CONTENT_UPDATE=36;
 private WebView view;private ValueCallback<Uri[]> picker;private PermissionRequest media;private String[] mediaResources;
 private File draft;private OutputStream draftOut;private long written,expected;private String fileName,fileMime;private JavaScriptReplyProxy finalReply;
 private File windowsFile;private Thread windowsWorker;private TransferDialog windowsProgress;private WindowsRelease.CancelHandle windowsCancel;private boolean windowsBusy;
 private File contentUpdateFile;private Thread contentUpdateWorker;private TransferDialog contentUpdateProgress;private WindowsRelease.CancelHandle contentUpdateCancel;private boolean contentUpdateBusy;
 private Thread assetUpdateWorker;private TransferDialog assetUpdateProgress;private WindowsRelease.CancelHandle assetUpdateCancel;private boolean assetUpdateBusy;
 private boolean uiTg;
 private AssetCache assetCache;
 private SmartMaktabDb smartDb;
 private volatile boolean trustedOrigin = true;
 private String tr(String ru,String tg){return uiTg?tg:ru;}
 private boolean own(Uri u){return u!=null&&"https".equals(u.getScheme())&&HOST.equals(u.getHost())&&(u.getPort()==-1||u.getPort()==443)&&u.getUserInfo()==null;}
 private boolean book(Uri u){return u!=null&&"https".equals(u.getScheme())&&"raw.githubusercontent.com".equals(u.getHost())&&u.getPath()!=null&&u.getPath().startsWith("/sharipovip/books/");}
 private static String mime(String s){if(s.endsWith(".html"))return "text/html";if(s.endsWith(".css"))return "text/css";if(s.endsWith(".js")||s.endsWith(".mjs"))return "text/javascript";if(s.endsWith(".json")||s.endsWith(".webmanifest"))return "application/json";if(s.endsWith(".png"))return "image/png";if(s.endsWith(".jpg")||s.endsWith(".jpeg"))return "image/jpeg";if(s.endsWith(".webp"))return "image/webp";if(s.endsWith(".svg"))return "image/svg+xml";if(s.endsWith(".wasm"))return "application/wasm";return "application/octet-stream";}
 @Override public void onCreate(Bundle saved){
  super.onCreate(saved);if(Build.VERSION.SDK_INT>=26)getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel("smartmaktab_updates","SmartMaktab",NotificationManager.IMPORTANCE_DEFAULT));
  assetCache=new AssetCache(this);
  smartDb=new SmartMaktabDb(this);
  FrameLayout holder=new FrameLayout(this);holder.setBackgroundColor(Color.rgb(16,40,33));view=new WebView(this);holder.addView(view,new FrameLayout.LayoutParams(-1,-1));setContentView(holder);
  holder.setOnApplyWindowInsetsListener((v,insets)->{if(Build.VERSION.SDK_INT>=30){android.graphics.Insets areas=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()|WindowInsets.Type.ime());v.setPadding(areas.left,areas.top,areas.right,areas.bottom);}return insets;});
  WebSettings settings=view.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(true);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setMediaPlaybackRequiresUserGesture(true);settings.setJavaScriptCanOpenWindowsAutomatically(false);
  WebView.setWebContentsDebuggingEnabled(false);
  WebViewAssetLoader loader=new WebViewAssetLoader.Builder().setDomain(HOST).addPathHandler("/",p->{
   String name=p.isEmpty()?"index.html":p;if(!name.matches("[A-Za-z0-9._/-]+")||name.contains(".."))return missing();
   if(assetCache!=null){try{InputStream cached=assetCache.getAsset(name);if(cached!=null)return new WebResourceResponse(mime(name),"UTF-8",cached);}catch(IOException ignored){}}
   try{return new WebResourceResponse(mime(name),"UTF-8",getAssets().open("web/"+name));}catch(IOException error){return missing();}
  }).build();
  view.setWebViewClient(new WebViewClient(){
   @Override public void onPageStarted(WebView w,String url,Bitmap favicon){trustedOrigin=url!=null&&own(Uri.parse(url));}
   @Override public WebResourceResponse shouldInterceptRequest(WebView w,WebResourceRequest r){Uri u=r.getUrl();if(own(u))return loader.shouldInterceptRequest(u);return book(u)?null:missing();}
   @Override public boolean shouldOverrideUrlLoading(WebView w,WebResourceRequest r){Uri u=r.getUrl();if(own(u))return false;if(r.isForMainFrame()&&r.hasGesture()&&book(u)){try{startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(ActivityNotFoundException ignored){}}return true;}
  });
  view.setWebChromeClient(new WebChromeClient(){
   @Override public boolean onShowFileChooser(WebView w,ValueCallback<Uri[]> cb,FileChooserParams params){
    if(!own(Uri.parse(w.getUrl()))||picker!=null)return false;
    picker=cb;try{Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");if(params.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE)i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true);startActivityForResult(i,PICK);return true;}catch(ActivityNotFoundException ex){picker=null;return false;}
   }
   @Override public void onPermissionRequest(PermissionRequest req){
    if(!own(req.getOrigin())||!own(Uri.parse(view.getUrl()))||media!=null){req.deny();return;}
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
  if(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))WebViewCompat.addWebMessageListener(view,"SmartMaktabAndroid",Collections.singleton(ORIGIN),(w,msg,origin,main,reply)->{
   if(!main||!own(origin)||!own(Uri.parse(w.getUrl())))return; handle(msg.getData(),reply);
  });
  String resumeRoute=smartDb.getResumeRoute();
  view.loadUrl(ORIGIN+"/"+(resumeRoute!=null?resumeRoute:"index.html"));
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
     confirmWindows("tg".equals(args.optString("lang")));reply.postMessage("ok");return;
    case "downloadContentUpdate":
     confirmContentUpdate("tg".equals(args.optString("lang")));reply.postMessage("ok");return;
    case "checkAssetUpdate":
     checkAssetUpdate("tg".equals(args.optString("lang")));reply.postMessage("ok");return;
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
  if(id==SAVE_CONTENT_UPDATE){saveContentUpdate(uri);return;}
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
  try{startActivity(Intent.createChooser(send,"SmartMaktab"));}catch(ActivityNotFoundException ignored){Toast.makeText(this,"Нет подходящего приложения",Toast.LENGTH_SHORT).show();}
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
    .setNegativeButton(tr("Отмена","Бекор кардан"),(d,w)->onCancel.run())
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

 private boolean anyTransferBusy(){return windowsBusy||contentUpdateBusy||assetUpdateBusy;}

 private void confirmWindows(boolean tg){
  if(anyTransferBusy())return;uiTg=tg;windowsBusy=true;
  AlertDialog prompt=new AlertDialog.Builder(this).setTitle(tr("Скачать для Windows","Боргирӣ барои Windows"))
   .setMessage(tr("На телефон будет скачан универсальный установщик .exe без цифровой подписи. При установке он сам выберет 32- или 64-битную версию под ваш Windows. Windows может предупредить или заблокировать его. После загрузки выберите папку на телефоне (например, «Загрузки»), чтобы перенести файл на ПК по USB.",
    "Насбкунандаи универсалии .exe бе имзои рақамӣ ба телефон боргирӣ мешавад. Ҳангоми насб он худаш нусхаи 32- ё 64-битиро барои Windows-и шумо интихоб мекунад. Windows метавонад огоҳ кунад ё насбро манъ кунад. Пас аз боргирӣ ҷузвдони телефонро интихоб кунед, то файлро тавассути USB ба компютер гузаронед."))
   .setPositiveButton(tr("Скачать","Боргирӣ"),(d,w)->downloadWindows())
   .setNegativeButton(tr("Отмена","Бекор кардан"),(d,w)->windowsBusy=false).create();
  prompt.setOnCancelListener(d->windowsBusy=false);prompt.show();
 }
 private void downloadWindows(){
  final WindowsRelease.CancelHandle cancel=new WindowsRelease.CancelHandle();
  windowsCancel=cancel;
  final TransferDialog dlg=new TransferDialog(
   tr("Загрузка SmartMaktab для Windows","Боргирии SmartMaktab барои Windows"),
   tr("Поиск файла для Windows на GitHub...\nНе закрывайте программу.","Ҷустуҷӯи файл барои Windows дар GitHub...\nБарномаро кушода нигоҳ доред."),
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
      tr("Файл найден: "+foundName+" ("+formatBytes(foundSize)+").\nПодготовка загрузки... Не закрывайте программу.",
         "Файл ёфт шуд: "+foundName+" ("+formatBytes(foundSize)+").\nОмодагӣ ба боргирӣ... Барномаро кушода нигоҳ доред."),
      0,
      "0% · 0 Б / "+formatBytes(foundSize)
     );
     dest=File.createTempFile("smartmaktab-windows-",".part",getCacheDir());
     final String dlMsg=tr(
      "Файл найден: "+foundName+" ("+formatBytes(foundSize)+").\nСкачивается... Не закрывайте программу.",
      "Файл ёфт шуд: "+foundName+" ("+formatBytes(foundSize)+").\nБоргирӣ мешавад... Барномаро кушода нигоҳ доред."
     );
     release.fetchWithProgress(dest,(bytes,total)->{
      long effectiveTotal=total>0?total:foundSize;
      int pct=effectiveTotal>0?(int)Math.min(100L,(bytes*100L)/effectiveTotal):0;
      long now=SystemClock.uptimeMillis();
      if(bytes==0||bytes>=effectiveTotal||pct!=throttle[1]||(now-throttle[0])>=120L){
       throttle[0]=now;throttle[1]=pct;
       String msg=bytes>=effectiveTotal
        ?tr("Проверка файла (SHA-256)...\nНе закрывайте программу.","Санҷиши файл (SHA-256)...\nБарномаро кушода нигоҳ доред.")
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
     if(!cancelled&&status==1)windowsToast(tr("Версия для Windows ещё не опубликована.","Нусхаи Windows ҳанӯз нашр нашудааст."));
     else if(!cancelled&&status!=3)windowsToast(tr("Не удалось скачать или проверить файл. Проверьте интернет и свободное место.","Боргирӣ ё санҷиши файл ноком шуд. Интернет ва ҷойи холиро санҷед."));
     else if(cancelled)windowsToast(tr("Загрузка отменена.","Боргирӣ бекор карда шуд."));
     return;
    }
    windowsFile=result;
    Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/octet-stream").putExtra(Intent.EXTRA_TITLE,selected.name);
    try{startActivityForResult(save,SAVE_WINDOWS);}catch(ActivityNotFoundException error){saveWindows(null);windowsToast(tr("Не удалось открыть выбор папки.","Интихоби ҷузвдон кушода нашуд."));}
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
  windowsToast(ok?tr("EXE сохранён. Его можно перенести на ПК по USB.","Файли EXE захира шуд. Онро тавассути USB ба компютер гузаронед."):
   tr("Не удалось сохранить EXE. Проверьте выбранную папку и свободное место.","EXE захира нашуд. Ҷузвдон ва ҷойи холиро санҷед."));
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
  if(contentUpdateCancel!=null)contentUpdateCancel.cancel();
  if(contentUpdateWorker!=null)contentUpdateWorker.interrupt();
  if(contentUpdateProgress!=null)contentUpdateProgress.dismiss();
  if(contentUpdateFile!=null)contentUpdateFile.delete();
  if(assetUpdateCancel!=null)assetUpdateCancel.cancel();
  if(assetUpdateWorker!=null)assetUpdateWorker.interrupt();
  if(assetUpdateProgress!=null)assetUpdateProgress.dismiss();
  clearDraft();if(picker!=null)picker.onReceiveValue(null);if(media!=null)media.deny();if(smartDb!=null)smartDb.close();view.destroy();super.onDestroy();
 }
 private void confirmContentUpdate(boolean tg){
  if(anyTransferBusy())return;uiTg=tg;contentUpdateBusy=true;
  AlertDialog prompt=new AlertDialog.Builder(this).setTitle(tr("Скачать обновление материалов","Боргирии навсозии мавод"))
   .setMessage(tr("Телефон найдёт последний подписанный файл обновления материалов (.smupdate) на GitHub, скачает и проверит его. После загрузки выберите папку на телефоне (например, «Загрузки»), затем перенесите файл на ПК по USB и нажмите в SmartMaktab «Проверить обновления».\n\n1. Подключите телефон к ПК кабелем.\n2. В шторке уведомлений откройте «Подключение USB» и выберите «Передача файлов».\n3. На ПК в папке телефона (обычно internal_storage/Download) скопируйте файл .smupdate на рабочий стол.\n4. На ПК откройте SmartMaktab и нажмите «Проверить обновления» — файл найдётся и применится сам.",
    "Телефон охирин файли имзодор (.smupdate)-ро аз GitHub пайдо мекунад, боргирӣ ва месанҷад. Пас аз боргирӣ ҷузвдонро интихоб кунед, сипас файлро тавассути USB ба компютер гузаронед ва дар SmartMaktab тугмаи «Навсозиҳоро тафтиш кунед»-ро пахш кунед.\n\n1. Телефонро тавассути кабел ба компютер пайваст кунед.\n2. Дар менюи огоҳинома «USB»-ро кушоед ва «Интиқоли файл»-ро интихоб кунед.\n3. Дар компютер аз ҷузвдони телефон (internal_storage/Download) файл .smupdate-ро ба мизи кор нусхабардорӣ кунед.\n4. Дар компютер SmartMaktab-ро кушоед ва «Навсозиҳоро тафтиш кунед»-ро пахш кунед — файл худаш пайдо ва татбиқ мешавад."))
   .setPositiveButton(tr("Скачать","Боргирӣ"),(d,w)->downloadContentUpdate())
   .setNegativeButton(tr("Отмена","Бекор кардан"),(d,w)->contentUpdateBusy=false).create();
  prompt.setOnCancelListener(d->contentUpdateBusy=false);prompt.show();
 }
 private void downloadContentUpdate(){
  final WindowsRelease.CancelHandle cancel=new WindowsRelease.CancelHandle();
  contentUpdateCancel=cancel;
  final TransferDialog dlg=new TransferDialog(
   tr("Обновление материалов","Навсозии мавод"),
   tr("Поиск файла обновления (.smupdate) на GitHub...\nНе закрывайте программу.","Ҷустуҷӯи файли навсозӣ (.smupdate) дар GitHub...\nБарномаро кушода нигоҳ доред."),
   ()->{cancel.cancel();if(contentUpdateWorker!=null)contentUpdateWorker.interrupt();}
  );
  contentUpdateProgress=dlg;
  contentUpdateWorker=new Thread(()->{
   File dest=null;ContentUpdate update=null;int outcome=0;
   final long[] throttle={0L,-1L};
   try(BufferedReader input=new BufferedReader(new InputStreamReader(getAssets().open("windows-release-repository.txt"),java.nio.charset.StandardCharsets.US_ASCII))){
    String repo=input.readLine();if(repo==null)throw new IOException("repository");
    update=ContentUpdate.find(repo,cancel);
    if(update==null)outcome=1;
    else{
     if(getCacheDir().getUsableSpace()<update.size+16L*1024*1024)throw new IOException("space");
     final String foundName=update.name;
     final long foundSize=update.size;
     final String dlMsg=tr(
      "Файл найден: "+foundName+" ("+formatBytes(foundSize)+").\nСкачивается... Не закрывайте программу.",
      "Файл ёфт шуд: "+foundName+" ("+formatBytes(foundSize)+").\nБоргирӣ мешавад... Барномаро кушода нигоҳ доред."
     );
     dlg.setProgress(dlMsg,0,"0% · 0 Б / "+formatBytes(foundSize));
     dest=File.createTempFile("smartmaktab-content-",".part",getCacheDir());
     update.fetchWithProgress(dest,(bytes,total)->{
      long effectiveTotal=total>0?total:foundSize;
      int pct=effectiveTotal>0?(int)Math.min(100L,(bytes*100L)/effectiveTotal):0;
      long now=SystemClock.uptimeMillis();
      if(bytes==0||bytes>=effectiveTotal||pct!=throttle[1]||(now-throttle[0])>=80L){
       throttle[0]=now;throttle[1]=pct;
       dlg.setProgress(dlMsg,pct,pct+"% · "+formatBytes(bytes)+" / "+formatBytes(effectiveTotal));
      }
     },cancel);
    }
   }catch(Exception error){outcome=cancel.isCancelled()?3:2;}
   if(cancel.isCancelled())outcome=3;
   final File result=dest;final ContentUpdate selected=update;final int status=outcome;
   runOnUiThread(()->{
    if(this.isDestroyed()){if(result!=null)result.delete();return;}
    boolean cancelled=cancel.cancelled;
    if(contentUpdateCancel==cancel){contentUpdateWorker=null;contentUpdateCancel=null;}
    if(contentUpdateProgress==dlg)contentUpdateProgress=null;
    dlg.dismiss();
    if(cancelled||status!=0||result==null||selected==null){
     if(result!=null)result.delete();contentUpdateBusy=false;
     if(!cancelled&&status==1)contentToast(tr("Обновлений материалов ещё нет. Файл .smupdate ещё не опубликован.","Навсозии мавод ҳанӯз нест. Файли .smupdate ҳанӯз нашр нашудааст."));
     else if(!cancelled&&status!=3)contentToast(tr("Не удалось скачать или проверить файл. Проверьте интернет и свободное место.","Боргирӣ ё санҷиши файл ноком шуд. Интернет ва ҷойи холиро санҷед."));
     else if(cancelled)contentToast(tr("Загрузка отменена.","Боргирӣ бекор карда шуд."));
     return;
    }
    contentUpdateFile=result;
    Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/octet-stream").putExtra(Intent.EXTRA_TITLE,selected.name);
    try{startActivityForResult(save,SAVE_CONTENT_UPDATE);}catch(ActivityNotFoundException error){saveContentUpdate(null);contentToast(tr("Не удалось открыть выбор папки.","Интихоби ҷузвдон кушода нашуд."));}
   });
  },"smartmaktab-content-update");contentUpdateWorker.start();
 }
 private void saveContentUpdate(Uri uri){
  File file=contentUpdateFile;contentUpdateFile=null;
  if(uri==null||file==null){if(file!=null)file.delete();contentUpdateBusy=false;return;}
  new Thread(()->{
   try(InputStream in=new FileInputStream(file);OutputStream out=getContentResolver().openOutputStream(uri,"w")){
    if(out==null)throw new IOException("destination");byte[] bytes=new byte[65536];for(int n;(n=in.read(bytes))!=-1;)out.write(bytes,0,n);
   }catch(IOException|RuntimeException error){
    try{DocumentsContract.deleteDocument(getContentResolver(),uri);}catch(Exception ignored){}
    file.delete();runOnUiThread(()->contentUpdateSaved(false));return;
   }
   file.delete();runOnUiThread(()->contentUpdateSaved(true));
  },"smartmaktab-content-save").start();
 }
 private void contentUpdateSaved(boolean ok){
  contentUpdateBusy=false;if(isDestroyed())return;
  if(ok){
   new AlertDialog.Builder(this).setTitle(tr("Файл сохранён","Файл захира шуд"))
    .setMessage(tr("Чтобы обновить ПК:\n\n1. Подключите телефон к ПК кабелем.\n2. В шторке уведомлений откройте «Подключение USB» → «Передача файлов».\n3. На ПК в папке телефона (internal_storage/Download) скопируйте файл .smupdate на рабочий стол.\n4. На ПК откройте SmartMaktab и нажмите «Проверить обновления».\n\nПрограмма сама найдёт файл, проверит подпись и применит его.",
     "Барои навсозии компютер:\n\n1. Телефонро тавассути кабел ба компютер пайваст кунед.\n2. Дар менюи огоҳинома «USB» → «Интиқоли файл»-ро интихоб кунед.\n3. Дар компютер аз ҷузвдони телефон (internal_storage/Download) файл .smupdate-ро ба мизи кор нусхабардорӣ кунед.\n4. Дар компютер SmartMaktab-ро кушоед ва «Навсозиҳоро тафтиш кунед»-ро пахш кунед.\n\nБарнома худаш файлро пайдо мекунад, имзоро месанҷад ва татбиқ мекунад."))
    .setPositiveButton("OK",(d,w)->{}).show();
  }else{
   contentToast(tr("Не удалось сохранить файл. Проверьте выбранную папку и свободное место.","Файл захира нашуд. Ҷузвдон ва ҷойи холиро санҷед."));
  }
 }
 private void contentToast(String text){Toast.makeText(this,text,Toast.LENGTH_LONG).show();}

 private void checkAssetUpdate(boolean tg){
  if(anyTransferBusy())return;uiTg=tg;assetUpdateBusy=true;
  final WindowsRelease.CancelHandle cancel=new WindowsRelease.CancelHandle();
  assetUpdateCancel=cancel;
  final TransferDialog dlg=new TransferDialog(
   tr("Обновление приложения","Навсозии барнома"),
   tr("Поиск обновления приложения на GitHub...\nНе закрывайте программу.","Ҷустуҷӯи навсозии барнома дар GitHub...\nБарномаро кушода нигоҳ доред."),
   ()->{cancel.cancel();if(assetUpdateWorker!=null)assetUpdateWorker.interrupt();}
  );
  assetUpdateProgress=dlg;
  assetUpdateWorker=new Thread(()->{
   AssetCache.UpdateStatus result=AssetCache.UpdateStatus.NETWORK_ERROR;
   final String[] foundName={""};
   final long[] throttle={0L,-1L};
   try(BufferedReader input=new BufferedReader(new InputStreamReader(getAssets().open("windows-release-repository.txt"),java.nio.charset.StandardCharsets.US_ASCII))){
    String repo=input.readLine();if(repo==null)throw new IOException("repository");
    result=assetCache.updateAssets(repo,new AssetCache.ProgressListener(){
     @Override public void onFileFound(String name,long totalBytes){
      foundName[0]=name;
      dlg.setProgress(
       tr("Файл найден: "+name+" ("+formatBytes(totalBytes)+").\nСкачивается... Не закрывайте программу.",
          "Файл ёфт шуд: "+name+" ("+formatBytes(totalBytes)+").\nБоргирӣ мешавад... Барномаро кушода нигоҳ доред."),
       0,
       totalBytes>0?("0% · 0 Б / "+formatBytes(totalBytes)):"0%"
      );
     }
     @Override public void onProgress(long downloadedBytes,long totalBytes,int percent,String stage){
      long now=SystemClock.uptimeMillis();
      if("unpacking".equals(stage)){
       dlg.setProgress(
        tr("Распаковка обновления...\nНе закрывайте программу.","Кушодани навсозӣ...\nБарномаро кушода нигоҳ доред."),
        percent,percent+"%"
       );
       return;
      }
      if("done".equals(stage)){
       dlg.setProgress(
        tr("Обновление установлено!","Навсозӣ насб шуд!"),100,"100%"
       );
       return;
      }
      if(percent!=throttle[1]||(now-throttle[0])>=100L){
       throttle[0]=now;throttle[1]=percent;
       String dlMsg=tr(
        "Файл найден: "+foundName[0]+(totalBytes>0?" ("+formatBytes(totalBytes)+")":"")+".\nСкачивается... Не закрывайте программу.",
        "Файл ёфт шуд: "+foundName[0]+(totalBytes>0?" ("+formatBytes(totalBytes)+")":"")+".\nБоргирӣ мешавад... Барномаро кушода нигоҳ доред."
       );
       String detail=totalBytes>0?(percent+"% · "+formatBytes(downloadedBytes)+" / "+formatBytes(totalBytes)):(percent+"% · "+formatBytes(downloadedBytes));
       dlg.setProgress(dlMsg,percent,detail);
      }
     }
    },cancel);
   }catch(Exception error){
    result=cancel.isCancelled()?AssetCache.UpdateStatus.CANCELLED:AssetCache.UpdateStatus.NETWORK_ERROR;
   }
   if(cancel.cancelled)result=AssetCache.UpdateStatus.CANCELLED;
   final AssetCache.UpdateStatus finalStatus=result;
   runOnUiThread(()->{
    if(isDestroyed())return;
    if(assetUpdateCancel==cancel){assetUpdateWorker=null;assetUpdateCancel=null;}
    if(assetUpdateProgress==dlg)assetUpdateProgress=null;
    assetUpdateBusy=false;
    dlg.dismiss();
    if(finalStatus==AssetCache.UpdateStatus.CANCELLED){
     contentToast(tr("Обновление отменено.","Навсозӣ бекор карда шуд."));
     return;
    }
    if(finalStatus==AssetCache.UpdateStatus.UPDATED){
     new AlertDialog.Builder(this).setTitle(tr("Обновление установлено","Навсозӣ насб шуд"))
      .setMessage(tr("Приложение обновлено. Перезапустить сейчас, чтобы применить изменения?","Барнома навсозӣ шуд. Барои татбиқи тағйирот ҳозир аз нав оғоз кунем?"))
      .setPositiveButton(tr("Перезапустить","Аз нав оғоз"),(d,w)->{view.clearCache(true);recreate();})
      .setNegativeButton(tr("Позже","Баъдтар"),(d,w)->{})
      .show();
     return;
    }
    String msg=finalStatus==AssetCache.UpdateStatus.UP_TO_DATE
     ?tr("Новых обновлений не найдено. У вас актуальная версия.","Навсозии нав ёфт нашуд. Шумо нусхаи охиринро доред.")
     :tr("Не удалось проверить обновления. Проверьте интернет.","Тафтиши навсозӣ ноком шуд. Интернетро санҷед.");
    new AlertDialog.Builder(this).setTitle(tr("Обновление","Навсозӣ"))
     .setMessage(msg)
     .setPositiveButton("OK",(d,w)->{}).show();
   });
  },"asset-update");assetUpdateWorker.start();
 }

}

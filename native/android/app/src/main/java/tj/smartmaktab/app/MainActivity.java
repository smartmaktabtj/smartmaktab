package tj.smartmaktab.app;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.provider.DocumentsContract;
import android.util.Base64;
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
 private File windowsFile;private Thread windowsWorker;private AlertDialog windowsProgress;private boolean windowsBusy,windowsTg,windowsCancelled;
 private File contentUpdateFile;private Thread contentUpdateWorker;private AlertDialog contentUpdateProgress;private boolean contentUpdateBusy,contentUpdateTg,contentUpdateCancelled;
 private String tr(String ru,String tg){return windowsTg?tg:ru;}
 private boolean own(Uri u){return u!=null&&"https".equals(u.getScheme())&&HOST.equals(u.getHost())&&(u.getPort()==-1||u.getPort()==443)&&u.getUserInfo()==null;}
 private boolean book(Uri u){return u!=null&&"https".equals(u.getScheme())&&"raw.githubusercontent.com".equals(u.getHost())&&u.getPath()!=null&&u.getPath().startsWith("/sharipovip/books/");}
 private static String mime(String s){if(s.endsWith(".html"))return "text/html";if(s.endsWith(".js")||s.endsWith(".mjs"))return "text/javascript";if(s.endsWith(".json")||s.endsWith(".webmanifest"))return "application/json";if(s.endsWith(".png"))return "image/png";if(s.endsWith(".svg"))return "image/svg+xml";return "application/octet-stream";}
 @Override public void onCreate(Bundle saved){
  super.onCreate(saved);if(Build.VERSION.SDK_INT>=26)getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel("smartmaktab_updates","SmartMaktab",NotificationManager.IMPORTANCE_DEFAULT));
  FrameLayout holder=new FrameLayout(this);holder.setBackgroundColor(Color.rgb(16,40,33));view=new WebView(this);holder.addView(view,new FrameLayout.LayoutParams(-1,-1));setContentView(holder);
  holder.setOnApplyWindowInsetsListener((v,insets)->{if(Build.VERSION.SDK_INT>=30){android.graphics.Insets areas=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()|WindowInsets.Type.ime());v.setPadding(areas.left,areas.top,areas.right,areas.bottom);}return insets;});
  WebSettings settings=view.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(true);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setMediaPlaybackRequiresUserGesture(true);settings.setJavaScriptCanOpenWindowsAutomatically(false);
  WebView.setWebContentsDebuggingEnabled(false);
  WebViewAssetLoader loader=new WebViewAssetLoader.Builder().setDomain(HOST).addPathHandler("/",p->{
   String name=p.isEmpty()?"index.html":p;if(!name.matches("[A-Za-z0-9._/-]+")||name.contains(".."))return missing();
   try{return new WebResourceResponse(mime(name),"UTF-8",getAssets().open("web/"+name));}catch(IOException error){return missing();}
  }).build();
  view.setWebViewClient(new WebViewClient(){
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
  if(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))WebViewCompat.addWebMessageListener(view,"SmartMaktabAndroid",Collections.singleton(ORIGIN),(w,msg,origin,main,reply)->{
   if(!main||!own(origin)||!own(Uri.parse(w.getUrl())))return; handle(msg.getData(),reply);
  });
  view.loadUrl(ORIGIN+"/index.html");
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
 private void confirmWindows(boolean tg){
  if(windowsBusy)return;windowsTg=tg;windowsBusy=true;
  AlertDialog prompt=new AlertDialog.Builder(this).setTitle(tr("Скачать для Windows","Боргирӣ барои Windows"))
   .setMessage(tr("На телефон будет скачан универсальный установщик .exe без цифровой подписи. При установке он сам выберет 32- или 64-битную версию под ваш Windows. Windows может предупредить или заблокировать его. После загрузки выберите папку на телефоне (например, «Загрузки»), чтобы перенести файл на ПК по USB.",
    "Насбкунандаи универсалии .exe бе имзои рақамӣ ба телефон боргирӣ мешавад. Ҳангоми насб он худаш нусхаи 32- ё 64-битиро барои Windows-и шумо интихоб мекунад. Windows метавонад огоҳ кунад ё насбро манъ кунад. Пас аз боргирӣ ҷузвдони телефонро интихоб кунед, то файлро тавассути USB ба компютер гузаронед."))
   .setPositiveButton(tr("Скачать","Боргирӣ"),(d,w)->downloadWindows())
   .setNegativeButton(tr("Отмена","Бекор кардан"),(d,w)->windowsBusy=false).create();
  prompt.setOnCancelListener(d->windowsBusy=false);prompt.show();
 }
 private void downloadWindows(){
  windowsCancelled=false;
  windowsProgress=new AlertDialog.Builder(this).setTitle(tr("Загрузка SmartMaktab для Windows","Боргирии SmartMaktab барои Windows"))
    .setMessage(tr("Скачиваем и проверяем файл. Оставьте приложение открытым.","Файл боргирӣ ва санҷида мешавад. Барномаро кушода нигоҳ доред."))
    .setCancelable(false).setNegativeButton(tr("Отмена","Бекор кардан"),(d,w)->{windowsCancelled=true;if(windowsWorker!=null)windowsWorker.interrupt();}).show();
  windowsWorker=new Thread(()->{
   File dest=null;WindowsRelease release=null;int outcome=0;
   try(BufferedReader input=new BufferedReader(new InputStreamReader(getAssets().open("windows-release-repository.txt"),java.nio.charset.StandardCharsets.US_ASCII))){
    String repo=input.readLine();if(repo==null)throw new IOException("repository");
    release=WindowsRelease.find(repo);
    if(release==null)outcome=1;
    else{if(getCacheDir().getUsableSpace()<release.size+16L*1024*1024)throw new IOException("space");dest=File.createTempFile("smartmaktab-windows-",".part",getCacheDir());release.fetch(dest);}
   }catch(Exception error){outcome=2;}
   if(Thread.currentThread().isInterrupted())outcome=3;
   final File result=dest;final WindowsRelease selected=release;final int status=outcome;
   runOnUiThread(()->{
    if(this.isDestroyed()){if(result!=null)result.delete();return;}
    boolean cancelled=windowsCancelled;windowsWorker=null;
    if(windowsProgress!=null){windowsProgress.dismiss();windowsProgress=null;}
    if(cancelled||status!=0||result==null||selected==null){
     if(result!=null)result.delete();windowsBusy=false;
     if(!cancelled&&status==1)windowsToast(tr("Версия для Windows ещё не опубликована.","Нусхаи Windows ҳанӯз нашр нашудааст."));
     else if(!cancelled&&status!=3)windowsToast(tr("Не удалось скачать или проверить файл. Проверьте интернет и свободное место.","Боргирӣ ё санҷиши файл ноком шуд. Интернет ва ҷойи холиро санҷед."));
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
 @Override protected void onDestroy(){if(windowsWorker!=null)windowsWorker.interrupt();if(windowsProgress!=null)windowsProgress.dismiss();if(windowsFile!=null)windowsFile.delete();if(contentUpdateWorker!=null)contentUpdateWorker.interrupt();if(contentUpdateProgress!=null)contentUpdateProgress.dismiss();if(contentUpdateFile!=null)contentUpdateFile.delete();clearDraft();if(picker!=null)picker.onReceiveValue(null);if(media!=null)media.deny();view.destroy();super.onDestroy();}
 private void confirmContentUpdate(boolean tg){
  if(contentUpdateBusy)return;contentUpdateTg=tg;contentUpdateBusy=true;
  AlertDialog prompt=new AlertDialog.Builder(this).setTitle(tr("Скачать обновление материалов","Боргирии навсозии мавод"))
   .setMessage(tr("Телефон найдёт последний подписанный файл обновления материалов (.smupdate) на GitHub, скачает и проверит его. После загрузки выберите папку на телефоне (например, «Загрузки»), затем перенесите файл на ПК по USB и нажмите в SmartMaktab «Проверить обновления».\n\n1. Подключите телефон к ПК кабелем.\n2. В шторке уведомлений откройте «Подключение USB» и выберите «Передача файлов».\n3. На ПК в папке телефона (обычно internal_storage/Download) скопируйте файл .smupdate на рабочий стол.\n4. На ПК откройте SmartMaktab и нажмите «Проверить обновления» — файл найдётся и применится сам.",
    "Телефон охирин файли имзодор (.smupdate)-ро аз GitHub пайдо мекунад, боргирӣ ва месанҷад. Пас аз боргирӣ ҷузвдонро интихоб кунед, сипас файлро тавассути USB ба компютер гузаронед ва дар SmartMaktab тугмаи «Навсозиҳоро тафтиш кунед»-ро пахш кунед.\n\n1. Телефонро тавассути кабел ба компютер пайваст кунед.\n2. Дар менюи огоҳинома «USB»-ро кушоед ва «Интиқоли файл»-ро интихоб кунед.\n3. Дар компютер аз ҷузвдони телефон (internal_storage/Download) файл .smupdate-ро ба мизи кор нусхабардорӣ кунед.\n4. Дар компютер SmartMaktab-ро кушоед ва «Навсозиҳоро тафтиш кунед»-ро пахш кунед — файл худаш пайдо ва татбиқ мешавад."))
   .setPositiveButton(tr("Скачать","Боргирӣ"),(d,w)->downloadContentUpdate())
   .setNegativeButton(tr("Отмена","Бекор кардан"),(d,w)->contentUpdateBusy=false).create();
  prompt.setOnCancelListener(d->contentUpdateBusy=false);prompt.show();
 }
 private void downloadContentUpdate(){
  contentUpdateCancelled=false;
  contentUpdateProgress=new AlertDialog.Builder(this).setTitle(tr("Поиск обновления материалов","Ҷустуҷӯи навсозии мавод"))
    .setMessage(tr("Скачиваем и проверяем файл. Оставьте приложение открытым.","Файл боргирӣ ва санҷида мешавад. Барномаро кушода нигоҳ доред."))
    .setCancelable(false).setNegativeButton(tr("Отмена","Бекор кардан"),(d,w)->{contentUpdateCancelled=true;if(contentUpdateWorker!=null)contentUpdateWorker.interrupt();}).show();
  contentUpdateWorker=new Thread(()->{
   File dest=null;ContentUpdate update=null;int outcome=0;
   try(BufferedReader input=new BufferedReader(new InputStreamReader(getAssets().open("windows-release-repository.txt"),java.nio.charset.StandardCharsets.US_ASCII))){
    String repo=input.readLine();if(repo==null)throw new IOException("repository");
    update=ContentUpdate.find(repo);
    if(update==null)outcome=1;
    else{if(getCacheDir().getUsableSpace()<update.size+16L*1024*1024)throw new IOException("space");dest=File.createTempFile("smartmaktab-content-",".part",getCacheDir());update.fetch(dest);}
   }catch(Exception error){outcome=2;}
   if(Thread.currentThread().isInterrupted())outcome=3;
   final File result=dest;final ContentUpdate selected=update;final int status=outcome;
   runOnUiThread(()->{
    if(this.isDestroyed()){if(result!=null)result.delete();return;}
    boolean cancelled=contentUpdateCancelled;contentUpdateWorker=null;
    if(contentUpdateProgress!=null){contentUpdateProgress.dismiss();contentUpdateProgress=null;}
    if(cancelled||status!=0||result==null||selected==null){
     if(result!=null)result.delete();contentUpdateBusy=false;
     if(!cancelled&&status==1)contentToast(tr("Обновлений ещё нет. Файл ещё не опубликован.","Навсозӣ ҳанӯз нест. Файл ҳанӯз нашр нашудааст."));
     else if(!cancelled&&status!=3)contentToast(tr("Не удалось скачать или проверить файл. Проверьте интернет и свободное место.","Боргирӣ ё санҷиши файл ноком шуд. Интернет ва ҷойи холиро санҷед."));
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

}

"""Signed production build. Never upload incomplete or unsigned files."""
import base64, hashlib, os, re, shutil, subprocess, sys, zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'native/android'; env=os.environ
keys=('ANDROID_KEYSTORE_BASE64','ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD','ANDROID_CERT_SHA256')

def fail(reason): raise SystemExit(reason)
def run(*args): return subprocess.run(args,check=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT).stdout

def preflight():
    for key in keys:
        if not env.get(key,'').strip(): fail('Missing '+key)
    if not re.fullmatch(r'(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)',env.get('SM_RELEASE_VERSION','')): fail('Expected release version X.Y.Z')
    code=env.get('SM_ANDROID_VERSION_CODE','')
    if not re.fullmatch(r'[1-9][0-9]{0,9}',code) or int(code)>2100000000: fail('Invalid versionCode')
    fmt=env.get('SM_FORMAT','')
    if fmt not in ('APK','AAB'): fail('Choose APK or AAB')
    pin=re.sub(r'[:\s]','',env['ANDROID_CERT_SHA256']).lower()
    if not re.fullmatch('[0-9a-f]{64}',pin): fail('Invalid ANDROID_CERT_SHA256 fingerprint')
    try:
        der=base64.b64decode(re.sub(r'\s','',env['ANDROID_KEYSTORE_BASE64']),validate=True)
        if len(der)>32768 or der[:4]!=bytes.fromhex('feedfeed'): raise ValueError()
    except ValueError: fail('ANDROID_KEYSTORE_BASE64 must encode a JKS file')
    return der,pin,fmt

def verify_keystore_certificate(store, pin):
    # keytool can emit a JKS warning on stderr. Hash only the binary DER written to -file.
    cert_file=store.with_suffix('.cer')
    cmd=['keytool','-exportcert','-storetype','JKS','-keystore',str(store),'-alias',env['ANDROID_KEY_ALIAS'],'-storepass:env','ANDROID_KEYSTORE_PASSWORD','-file',str(cert_file)]
    try:
        subprocess.run(cmd,check=True,capture_output=True)
        cert=cert_file.read_bytes()
    except (OSError,subprocess.CalledProcessError):
        fail('Could not export Android certificate; check ANDROID_KEY_ALIAS and ANDROID_KEYSTORE_PASSWORD')
    if hashlib.sha256(cert).hexdigest()!=pin:
        fail('Keystore does not match ANDROID_CERT_SHA256; use the certificate fingerprint from the same key archive')

if __name__=='__main__':
    data,pin,fmt=preflight()
    if sys.argv[1:]==['preflight']: print('Release signing inputs present.');raise SystemExit(0)
    if sys.argv[1:]!=['build']: fail('Use preflight or build')
    import tempfile
    with tempfile.TemporaryDirectory(prefix='smartmaktab-sign-') as tmp:
        store=Path(tmp)/'release.jks';store.write_bytes(data);store.chmod(0o600)
        verify_keystore_certificate(store,pin)
        gs=dict(env,SM_ANDROID_STORE_FILE=str(store));gs.pop('ANDROID_KEYSTORE_BASE64',None)
        task='assembleRelease' if fmt=='APK' else 'bundleRelease'
        subprocess.run(['gradle','--no-daemon',f':app:{task}'],cwd=root,env=gs,check=True)
        path=root/'app/build/outputs'/('apk/release/app-release.apk' if fmt=='APK' else 'bundle/release/app-release.aab')
        if not path.is_file(): fail('Signed package not found')
        if fmt=='APK':
            sdk=Path(env.get('ANDROID_HOME') or env['ANDROID_SDK_ROOT']);exe=sdk/'build-tools/36.0.0/apksigner'
            output=run(str(exe),'verify','--print-certs',str(path)).decode()
            hits=re.findall(r'certificate SHA-256 digest: ([a-fA-F0-9]+)',output)
            if hits!=[pin]: fail('Unexpected or invalid APK signer')
        else:
            output=run('jarsigner','-J-Duser.language=en','-verify',str(path)).decode()
            if 'jar verified.' not in output or 'unsigned entries' in output.lower(): fail('AAB has missing or invalid signatures')
            output=run('keytool','-J-Duser.language=en','-printcert','-jarfile',str(path)).decode()
            hits=[x.replace(':','').lower() for x in re.findall(r'SHA256:\s*([A-Fa-f0-9:]{64,95})',output)]
            if hits!=[pin]: fail('Unexpected AAB signer')
            with zipfile.ZipFile(path) as archive:
                if archive.testzip() or not {'BundleConfig.pb','base/manifest/AndroidManifest.xml','base/assets/web/index.html'}.issubset(archive.namelist()):fail('Invalid Android App Bundle structure')
        output=root/'release';shutil.rmtree(output,ignore_errors=True);output.mkdir()
        dest=output/f'SmartMaktab-{env["SM_RELEASE_VERSION"]}-Android.{fmt.lower()}';shutil.copyfile(path,dest)
        (output/'SHA256SUMS.txt').write_text(f'{hashlib.sha256(dest.read_bytes()).hexdigest()}  {dest.name}\n',encoding='utf-8')
        print('Verified signed '+dest.name)

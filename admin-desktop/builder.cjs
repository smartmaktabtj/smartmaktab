'use strict';

const version = process.env.SM_ADMIN_VERSION || '1.0.0';
if (!/^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/.test(version)) {
  throw new Error('SM_ADMIN_VERSION must be a stable SemVer X.Y.Z');
}

const signMode = (process.env.WINDOWS_SIGNING_MODE || 'unsigned').trim();
const isSigned = signMode === 'pfx' || signMode === 'azure';

let winSignConfig = { signExecutable: false };
if (signMode === 'azure') {
  winSignConfig = {
    azureSignOptions: {
      endpoint: process.env.WINDOWS_SIGN_ENDPOINT,
      codeSigningAccountName: process.env.WINDOWS_SIGN_ACCOUNT,
      certificateProfileName: process.env.WINDOWS_SIGN_PROFILE,
      publisherName: process.env.WINDOWS_SIGN_PUBLISHER,
    },
  };
} else if (signMode === 'pfx') {
  winSignConfig = {
    signtoolOptions: {
      publisherName: process.env.WINDOWS_SIGN_PUBLISHER,
      signingHashAlgorithms: ['sha256'],
    },
  };
}

module.exports = {
  appId: 'tj.smartmaktab.admin',
  productName: 'SmartMaktab Admin',
  forceCodeSigning: isSigned,
  extraMetadata: { version },
  directories: { output: 'release' },
  files: [
    'main.cjs',
    'preload.cjs',
    'pack-core.cjs',
    'index.html',
    'styles.css',
    'renderer.mjs',
    'bundled/**/*',
  ],
  win: {
    target: ['nsis'],
    icon: 'bundled/icon.png',
    artifactName: `SmartMaktab-Admin-\${version}-Windows-\${arch}${isSigned ? '' : '-UNSIGNED'}.\${ext}`,
    ...winSignConfig,
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    shortcutName: 'SmartMaktab Admin',
  },
};

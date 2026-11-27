'use strict';
const version = process.env.SM_ADMIN_VERSION;
if (!/^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/.test(version ?? '')) {
  throw new Error('SM_ADMIN_VERSION must be a stable SemVer X.Y.Z');
}
if (process.env.SM_CONFIRM_PUBLIC_UNSIGNED !== 'PUBLISH-UNSIGNED') {
  throw new Error('Admin EXE build requires explicit confirmation PUBLISH-UNSIGNED');
}
module.exports = {
  appId: 'tj.smartmaktab.admin',
  productName: 'SmartMaktab Admin',
  forceCodeSigning: false,
  extraMetadata: { version },
  directories: { output: 'release' },
  files: ['main.cjs', 'preload.cjs', 'icon.png'],
  win: {
    target: ['nsis'],
    icon: 'icon.png',
    signExecutable: false,
    artifactName: 'SmartMaktab-Admin-${version}-Windows-${arch}-UNSIGNED.${ext}',
  },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true },
};

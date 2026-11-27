'use strict';
const version = process.env.SM_RELEASE_VERSION;
if (!/^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/.test(version ?? '')) {
  throw new Error('SM_RELEASE_VERSION must be a stable SemVer X.Y.Z');
}
if (process.env.SM_CONFIRM_PUBLIC_UNSIGNED !== 'PUBLISH-UNSIGNED') {
  throw new Error('Unsigned Windows distribution requires explicit confirmation PUBLISH-UNSIGNED');
}
module.exports = {
  appId: 'tj.smartmaktab.app',
  productName: 'SmartMaktab',
  forceCodeSigning: false,
  extraMetadata: { version },
  directories: { output: 'unsigned-release' },
  files: ['main.cjs', 'preload.cjs', 'icon.png'],
  win: { target: ['nsis'], icon: 'icon.png', signExecutable: false, artifactName: 'SmartMaktab-${version}-Windows-${arch}-UNSIGNED.${ext}' },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true },
};

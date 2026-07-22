const { execFile } = require('node:child_process');
const path = require('node:path');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

module.exports = async function afterPackSignMac(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const productName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${productName}.app`);

  // electron-builder 24 leaves the upstream Electron executable's linker
  // signature in place when no Apple signing identity is installed. Once the
  // app resources are packed, that partial signature is invalid and Gatekeeper
  // can report the downloaded app as damaged. Seal the complete bundle with a
  // valid ad-hoc signature first. When a Developer ID identity is configured,
  // electron-builder replaces this with the distribution signature afterward.
  await execFileAsync('codesign', ['--force', '--deep', '--sign', '-', appPath]);
  await execFileAsync('codesign', ['--verify', '--deep', '--strict', appPath]);
  console.log(`  • applied complete fallback signature  app=${appPath}`);
};

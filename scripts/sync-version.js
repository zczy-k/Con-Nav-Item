const fs = require('fs');
const path = require('path');

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function replaceInFile(filePath, replacer) {
  const oldText = fs.readFileSync(filePath, 'utf8');
  const newText = replacer(oldText);
  if (oldText !== newText) {
    fs.writeFileSync(filePath, newText, 'utf8');
  }
}

const root = path.resolve(__dirname, '..');
const rootPkgPath = path.join(root, 'package.json');
const webPkgPath = path.join(root, 'web', 'package.json');
const manifestPath = path.join(root, 'browser-extension', 'manifest.json');
const readmePath = path.join(root, 'README.md');
const popupPath = path.join(root, 'browser-extension', 'popup.html');
const packageLockPath = path.join(root, 'package-lock.json');
const webPackageLockPath = path.join(root, 'web', 'package-lock.json');

const rootPkg = readJson(rootPkgPath);
const version = rootPkg.version;

const webPkg = readJson(webPkgPath);
webPkg.version = version;
writeJson(webPkgPath, webPkg);

const packageLock = readJson(packageLockPath);
packageLock.name = rootPkg.name;
packageLock.version = version;
if (packageLock.packages && packageLock.packages['']) {
  packageLock.packages[''].name = rootPkg.name;
  packageLock.packages[''].version = version;
}
writeJson(packageLockPath, packageLock);

const webPackageLock = readJson(webPackageLockPath);
webPackageLock.name = webPkg.name;
webPackageLock.version = version;
if (webPackageLock.packages && webPackageLock.packages['']) {
  webPackageLock.packages[''].name = webPkg.name;
  webPackageLock.packages[''].version = version;
}
if (webPackageLock.packages && webPackageLock.packages['..']) {
  webPackageLock.packages['..'].name = rootPkg.name;
  webPackageLock.packages['..'].version = version;
}
writeJson(webPackageLockPath, webPackageLock);

const manifest = readJson(manifestPath);
manifest.version = version;
writeJson(manifestPath, manifest);

replaceInFile(readmePath, (text) => {
  let next = text;
  next = next.replace(/^# SmartNavora - AI 智能导航网站 v\d+\.\d+\.\d+/m, `# SmartNavora - AI 智能导航网站 v${version}`);
  next = next.replace(/Version-\d+\.\d+\.\d+-brightgreen/g, `Version-${version}-brightgreen`);
  next = next.replace(/^## 🆕 v\d+\.\d+\.\d+ 更新内容/m, `## 🆕 v${version} 更新内容`);
  return next;
});

replaceInFile(popupPath, (text) => text.replace(/<span class="version">v\d+\.\d+\.\d+<\/span>/, `<span class="version">v${version}</span>`));

console.log(`Synchronized project version to ${version}`);

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

const rootPkg = readJson(rootPkgPath);
const version = rootPkg.version;

const webPkg = readJson(webPkgPath);
webPkg.version = version;
writeJson(webPkgPath, webPkg);

const manifest = readJson(manifestPath);
manifest.version = version;
writeJson(manifestPath, manifest);

replaceInFile(readmePath, (text) => {
  let next = text;
  next = next.replace(/^# Con-Nav-Item - 现代化个人导航站 v\d+\.\d+\.\d+/m, `# Con-Nav-Item - 现代化个人导航站 v${version}`);
  next = next.replace(/Version-\d+\.\d+\.\d+-brightgreen/g, `Version-${version}-brightgreen`);
  next = next.replace(/^## 🆕 v\d+\.\d+\.\d+ 更新内容/m, `## 🆕 v${version} 更新内容`);
  return next;
});

replaceInFile(popupPath, (text) => text.replace(/<span class="version">v\d+\.\d+\.\d+<\/span>/, `<span class="version">v${version}</span>`));

console.log(`Synchronized project version to ${version}`);

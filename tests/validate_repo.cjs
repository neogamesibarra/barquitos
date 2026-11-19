const { readFileSync, readdirSync, statSync } = require('node:fs');
const { join, resolve, dirname, relative, isAbsolute } = require('node:path');
const { Script, SourceTextModule } = require('node:vm');
const assert = require('node:assert/strict');

const root = resolve(__dirname, '..');
const read = file => readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
const vendor = new Set(['paho-mqtt.min.js', 'qrcode.min.js']);

function* filesIn(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* filesIn(path);
    else yield path;
  }
}

function requireLocalFile(from, specifier) {
  assert.match(specifier, /^\.\.?\//, `Ruta relativa requerida: ${specifier}`);
  const pathname = specifier.split(/[?#]/, 1)[0];
  const file = resolve(dirname(from), pathname);
  const projectPath = relative(root, file);
  assert.ok(!isAbsolute(projectPath) && !projectPath.startsWith('..'), `Ruta fuera del proyecto: ${specifier}`);
  assert.ok(statSync(file, { throwIfNoEntry: false })?.isFile(),
    `${relative(root, from)} referencia un archivo inexistente: ${specifier}`);
  return file;
}

const manifestPath = join(root, 'manifest.json');
const manifest = JSON.parse(read(manifestPath));
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'El manifiesto necesita iconos');
for (const { src } of manifest.icons) requireLocalFile(manifestPath, src);
requireLocalFile(manifestPath, manifest.start_url);

const worker = join(root, 'sw.js');
const workerSource = read(worker);
new Script(workerSource, { filename: worker });
const shell = workerSource.match(/const controllerShell\s*=\s*\[([^\]]*)\]/);
assert.ok(shell, 'No se encontró el listado de precaché del mando');
for (const [, url] of shell[1].matchAll(/['"](\.\.?\/[^'"]+)['"]/g)) requireLocalFile(worker, url);

let checked = 0;
for (const file of filesIn(join(root, 'js'))) {
  if (!file.endsWith('.js')) continue;
  const source = read(file);
  if (vendor.has(file.split(/[\\/]/).at(-1))) {
    new Script(source, { filename: file });
  } else {
    const module = new SourceTextModule(source, { identifier: file });
    for (const { specifier } of module.moduleRequests) requireLocalFile(file, specifier);
  }
  checked++;
}

for (const page of ['index.html', 'controller.html', 'tv.html']) {
  const file = join(root, page);
  for (const [, url] of read(file).matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi)) {
    if (!/^(?:https?:|data:)/i.test(url)) requireLocalFile(file, url.startsWith('.') ? url : './' + url);
  }
}

console.log(`Validación correcta: ${checked} scripts, imports, precaché, páginas y manifiesto.`);

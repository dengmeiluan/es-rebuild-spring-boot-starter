import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(root, '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const manifest = JSON.parse(read('manifest.json'));

test('manifest is MV3 with a module service worker', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.type, 'module');
  assert.equal(manifest.background.service_worker, 'src/background.js');
  assert.equal(manifest.minimum_chrome_version, '116');
});

test('manifest version matches the repository version', () => {
  const pom = readFileSync(join(repoRoot, 'pom.xml'), 'utf8');
  const start = pom.indexOf('<artifactId>searchdeck</artifactId>');
  const version = /<version>([^<]+)<\/version>/.exec(pom.slice(start))[1];
  assert.equal(manifest.version, version);
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.version, version);
});

test('permissions stay minimal and host access is optional', () => {
  assert.deepEqual(manifest.permissions.sort(), ['sidePanel', 'storage']);
  assert.deepEqual(manifest.optional_host_permissions.sort(), ['http://*/*', 'https://*/*']);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
});

test('CSP blocks remote code and inline scripts', () => {
  const csp = manifest.content_security_policy.extension_pages;
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /object-src 'self'/);
  assert.match(csp, /frame-src http: https:/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
});

test('every manifest-referenced file exists', () => {
  const files = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.side_panel.default_path,
    manifest.options_ui.page,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
  ];
  for (const file of files) {
    assert.ok(existsSync(join(root, file)), `missing ${file}`);
  }
});

test('HTML pages use local scripts and styles only', () => {
  const htmlFiles = readdirSync(join(root, 'src')).filter((name) => name.endsWith('.html'));
  assert.ok(htmlFiles.length >= 3);
  for (const file of htmlFiles) {
    const html = read(join('src', file));
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, `${file} has an inline script`);
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `${file} has an inline event handler`);
    for (const match of html.matchAll(/<(script|link)\b[^>]*\b(?:src|href)="([^"]+)"/gi)) {
      const target = match[2];
      if (target.startsWith('#')) continue;
      assert.ok(!/^https?:/i.test(target), `${file} references remote code: ${target}`);
      assert.ok(existsSync(join(root, 'src', target)), `${file} references missing ${target}`);
    }
  }
});

test('JavaScript never evaluates strings or injects markup', () => {
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
  for (const file of walk(join(root, 'src')).filter((path) => path.endsWith('.js'))) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /\beval\s*\(/, `${file} uses eval`);
    assert.doesNotMatch(source, /\bnew Function\s*\(/, `${file} uses new Function`);
    assert.doesNotMatch(source, /innerHTML\s*=/, `${file} writes innerHTML`);
    assert.doesNotMatch(source, /chrome\.scripting/, `${file} injects page scripts`);
  }
});

test('icons are valid PNGs at the declared sizes', () => {
  for (const [size, path] of Object.entries(manifest.icons)) {
    const bytes = readFileSync(join(root, path));
    assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG');
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    assert.equal(width, Number(size));
    assert.equal(height, Number(size));
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEntryUrl,
  displayServer,
  normalizeBaseUrl,
  normalizeEntryPath,
  originPattern,
} from '../src/shared/config.js';

test('bare hosts default to https, loopback defaults to http', () => {
  assert.equal(normalizeBaseUrl('searchdeck.example.com'), 'https://searchdeck.example.com');
  assert.equal(normalizeBaseUrl('localhost:5611'), 'http://localhost:5611');
  assert.equal(normalizeBaseUrl('127.0.0.1:5611'), 'http://127.0.0.1:5611');
  assert.equal(normalizeBaseUrl('[::1]:5611'), 'http://[::1]:5611');
});

test('scheme, context path and trailing slash are normalized', () => {
  assert.equal(normalizeBaseUrl('https://searchdeck.example.com/'), 'https://searchdeck.example.com');
  assert.equal(
    normalizeBaseUrl('  https://searchdeck.example.com/console/  '),
    'https://searchdeck.example.com/console',
  );
  assert.equal(normalizeBaseUrl('http://searchdeck.example.com:8080'), 'http://searchdeck.example.com:8080');
});

test('unsafe or ambiguous URLs are rejected', () => {
  assert.throws(() => normalizeBaseUrl(''), /required/);
  assert.throws(() => normalizeBaseUrl('ftp://searchdeck.example.com'), /http/);
  assert.throws(() => normalizeBaseUrl('https://user:pass@searchdeck.example.com'), /Credentials/);
  assert.throws(() => normalizeBaseUrl('https://searchdeck.example.com/?a=1'), /query/);
  assert.throws(() => normalizeBaseUrl('https://searchdeck.example.com/#x'), /fragment/);
  assert.throws(() => normalizeBaseUrl('https://searchdeck.example.com/searchdeck.html'), /HTML/);
  assert.throws(() => normalizeBaseUrl('javascript:alert(1)'), /http|valid/i);
});

test('origin pattern tracks the exact host and port', () => {
  assert.equal(originPattern('https://searchdeck.example.com/console'), 'https://searchdeck.example.com/*');
  assert.equal(originPattern('http://localhost:5611'), 'http://localhost:5611/*');
});

test('entry path stays absolute and simple', () => {
  assert.equal(normalizeEntryPath(''), '/searchdeck.html');
  assert.equal(normalizeEntryPath('searchdeck.html'), '/searchdeck.html');
  assert.equal(normalizeEntryPath('/searchdeck/index.html'), '/searchdeck/index.html');
  assert.throws(() => normalizeEntryPath('/../secret'), /simple/);
  assert.throws(() => normalizeEntryPath('/x?a=1'), /simple/);
});

test('entry URL joins the normalized base and path', () => {
  assert.equal(
    buildEntryUrl('https://searchdeck.example.com/', '/searchdeck.html'),
    'https://searchdeck.example.com/searchdeck.html',
  );
  assert.equal(
    buildEntryUrl('localhost:5611', 'searchdeck.html'),
    'http://localhost:5611/searchdeck.html',
  );
  assert.equal(
    buildEntryUrl('https://host.example.com/ops/', '/searchdeck.html'),
    'https://host.example.com/ops/searchdeck.html',
  );
});

test('display label is the host, never the full path', () => {
  assert.equal(displayServer(''), 'Not configured');
  assert.equal(displayServer('https://searchdeck.example.com/console'), 'searchdeck.example.com');
  assert.equal(displayServer('http://localhost:5611'), 'localhost:5611');
});

#!/usr/bin/env node
/**
 * Fails CI if a lead form regresses to a placeholder endpoint,
 * a placeholder phone, a client-side intake secret, or a missing local file.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', '.vercel']);
const TEXT_EXT = new Set([
  '.html',
  '.js',
  '.css',
  '.md',
  '.txt',
  '.xml',
  '.json',
  '.yml',
  '.yaml',
  '.svg',
]);

const NEEDLES = [
  ['form', 'spree'].join(''),
  ['YOUR_', 'FORM_ID'].join(''),
  ['REPLACE_', 'WITH'].join(''),
  ['555', '-'].join(''),
  ['(', '555', ')'].join(''),
  ['X-TDP-', 'Lead-Secret'].join(''),
];

const PROFILE_ID = '63e7470e-fe1e-4367-aae0-56d0d6392d78';
const API_URL = 'https://www.tradedeskpro.com/api/leads';

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function isExternal(url) {
  return (
    /^[a-z][a-z0-9+.-]*:/i.test(url) ||
    url.startsWith('//') ||
    url.startsWith('#') ||
    url.startsWith('?')
  );
}

function localAsset(fromRel, url) {
  const clean = url.split('#')[0].split('?')[0].trim();
  if (!clean || isExternal(clean)) return null;
  let target;
  if (clean.startsWith('/')) target = clean.slice(1);
  else target = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), clean));
  if (target === '' || target === '.') return 'index.html';
  if (target.endsWith('/')) target += 'index.html';
  return target;
}

const failures = [];
const files = walk(ROOT, []);

for (const file of files) {
  const ext = path.extname(file).toLowerCase();
  if (!TEXT_EXT.has(ext)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const fileRel = rel(file);
  const lower = text.toLowerCase();
  for (const needle of NEEDLES) {
    if (lower.includes(needle.toLowerCase())) {
      failures.push(fileRel + ' contains forbidden placeholder "' + needle + '"');
    }
  }

  if (ext !== '.html' && ext !== '.css' && ext !== '.js') continue;
  const attr = /\b(?:src|href)\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
  let match;
  while ((match = attr.exec(text))) {
    const url = match[1] != null ? match[1] : match[2];
    const asset = localAsset(fileRel, url);
    if (!asset) continue;
    const abs = path.join(ROOT, asset);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      failures.push(fileRel + ' references missing local asset "' + url + '" (' + asset + ')');
    }
  }
}

const htmlFiles = files.filter((f) => f.endsWith('.html'));
for (const file of htmlFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const fileRel = rel(file);
  const forms = text.match(/<form\b[^>]*>/gi) || [];
  if (!forms.length) continue;
  if (!text.includes('/js/tdp-leads.js')) {
    failures.push(fileRel + ' has a form but does not load /js/tdp-leads.js');
  }
  if (!/name\s*=\s*["']company_website["']/i.test(text)) {
    failures.push(fileRel + ' form is missing the company_website honeypot');
  }
  for (const tag of forms) {
    if (/\baction\s*=/i.test(tag)) {
      failures.push(fileRel + ' form still has an action attribute: ' + tag);
    }
  }
}

const leadsPath = path.join(ROOT, 'js', 'tdp-leads.js');
if (!fs.existsSync(leadsPath)) {
  failures.push('js/tdp-leads.js is missing');
} else {
  const leads = fs.readFileSync(leadsPath, 'utf8');
  if (!leads.includes(PROFILE_ID)) failures.push('js/tdp-leads.js is missing profile_id ' + PROFILE_ID);
  if (!leads.includes(API_URL)) failures.push('js/tdp-leads.js is missing ' + API_URL);
  if (!leads.includes('company_website')) failures.push('js/tdp-leads.js does not check the honeypot');
}

if (failures.length) {
  console.error('Lead form check failed:');
  for (const item of failures) console.error(' - ' + item);
  process.exit(1);
}

console.log('Lead form check passed (' + files.length + ' files scanned).');

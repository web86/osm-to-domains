#!/usr/bin/env node
/**
 * Overpass Turbo CSV -> unique domain lists and lead metadata.
 * Usage: node osm-to-domains.mjs overpass.csv [output-directory]
 * No third-party dependencies. Node.js 18+.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const input = process.argv[2];
const outDir = resolve(process.argv[3] || './osm-leads');
if (!input) {
  console.error('Usage: node osm-to-domains.mjs overpass.csv [output-directory]');
  process.exit(1);
}

// RFC 4180-style CSV reader, including embedded commas, line breaks, and escaped quotes.
function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else { quoted = !quoted; }
    } else if (ch === ',' && !quoted) {
      row.push(cell); cell = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some(v => v.length)) rows.push(row);
      row = []; cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some(v => v.length)) rows.push(row);
  return rows;
}

function toCSV(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
}

function saveCSV(filename, header, rows) {
  writeFileSync(join(outDir, filename),
    [header, ...rows].map(row => row.map(toCSV).join(',')).join('\n') + '\n', 'utf8');
}

function extractURL(value) {
  const raw = String(value || '').trim().replace(/^[\s'"]+|[\s'"]+$/g, '');
  if (!raw || /^(?:-|none|нет)$/i.test(raw)) return null;
  // When an OSM field has multiple semicolon-separated URLs, use the first.
  const token = raw.split(/\s*;\s*/)[0].trim();
  if (!token || /\s/.test(token)) return null;
  const candidate = /^https?:\/\//i.test(token) ? token : 'https://' + token;
  try {
    const url = new URL(candidate);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase().replace(/^www\d*\./, '').replace(/\.$/, '');
    if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host) || host.includes('..')) return null;
    if (host.split('.').some(x => !x || x.startsWith('-') || x.endsWith('-'))) return null;
    if (!/[a-z]/.test(host.split('.').at(-1))) return null;
    return { host, url: url.href };
  } catch { return null; }
}

const excluded = [
  'vk.com', 't.me', 'telegram.me', 'instagram.com', 'facebook.com',
  'youtube.com', 'youtu.be', 'ok.ru', '2gis.ru', '2gis.com',
  'maps.google.com', 'yandex.ru', 'ya.ru', 'avito.ru', 'wildberries.ru',
  'ozon.ru', 'flamp.ru', 'zoon.ru', 'taplink.cc', 'linktr.ee'
];
const isExcluded = host => excluded.some(d => host === d || host.endsWith('.' + d));

const table = parseCSV(readFileSync(input, 'utf8'));
const header = (table.shift() || []).map(x => x.trim().replace(/^\uFEFF/, ''));
const ix = x => header.indexOf(x);
if (ix('website') === -1 && ix('contact:website') === -1) {
  console.error('CSV must contain website and/or contact:website columns.');
  process.exit(1);
}
const field = (row, key) => ix(key) === -1 ? '' : (row[ix(key)] || '').trim();
const map = new Map();
const invalid = [];
let rowsWithWebsite = 0;

for (const row of table) {
  const siteFields = [...new Set([field(row, 'website'), field(row, 'contact:website')].filter(Boolean))];
  if (!siteFields.length) continue;
  rowsWithWebsite++;
  const seenHosts = new Set();
  for (const value of siteFields) {
    const item = extractURL(value);
    if (!item) { invalid.push([field(row,'@id'), field(row,'name'), value, 'invalid URL']); continue; }
    if (isExcluded(item.host)) { invalid.push([field(row,'@id'), field(row,'name'), value, 'social/marketplace']); continue; }
    if (seenHosts.has(item.host)) continue;
    seenHosts.add(item.host);
    if (!map.has(item.host)) map.set(item.host, {
      host: item.host, urls: new Set(), names: new Set(), types: new Set(), ids: new Set(), count: 0
    });
    const site = map.get(item.host);
    site.urls.add(item.url);
    if (field(row,'name')) site.names.add(field(row,'name'));
    for (const key of ['shop', 'office', 'craft', 'man_made']) {
      const val = field(row, key);
      if (val) site.types.add(key + ':' + val);
    }
    const id = field(row,'@type') + ':' + field(row,'@id');
    if (!site.ids.has(id)) { site.ids.add(id); site.count++; }
  }
}

const sites = [...map.values()].sort((a,b) => b.count - a.count || a.host.localeCompare(b.host));
const domains = [...map.keys()].sort();
const repeatCutoff = 5;
const priority = sites.filter(s => s.count < repeatCutoff).map(s => s.host).sort();
const frequent = sites.filter(s => s.count >= repeatCutoff);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'domains.txt'), domains.join('\n') + (domains.length ? '\n' : ''));
writeFileSync(join(outDir, 'priority-domains.txt'), priority.join('\n') + (priority.length ? '\n' : ''));
saveCSV('companies.csv', ['domain', 'osm_objects', 'names', 'categories', 'example_url', 'osm_ids'],
  sites.map(s => [s.host, s.count, [...s.names].slice(0,5).join(' | '),
    [...s.types].join(' | '), [...s.urls][0] || '', [...s.ids].slice(0,15).join(' | ')]));
saveCSV('frequent-domains.csv', ['domain', 'osm_objects', 'names', 'categories'],
  frequent.map(s => [s.host, s.count, [...s.names].slice(0,5).join(' | '), [...s.types].join(' | ')]));
saveCSV('skipped.csv', ['osm_id', 'name', 'website_value', 'reason'], invalid);

console.log('OSM records: ' + table.length);
console.log('Records with website/contact:website: ' + rowsWithWebsite);
console.log('Unique domains: ' + domains.length);
console.log('Priority domains (< ' + repeatCutoff + ' OSM objects): ' + priority.length);
console.log('Frequent domains (>= ' + repeatCutoff + ' OSM objects): ' + frequent.length);
console.log('Skipped URL values: ' + invalid.length);
console.log('Results: ' + outDir);

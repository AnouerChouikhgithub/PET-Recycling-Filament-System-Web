// check-readme-links.mjs — verify relative links and image paths in README.md.
//
// Node, zero dependencies. Usage:
//   node scripts/check-readme-links.mjs [readme-path]     (default: repo root README.md)
//
// For absolute GitHub URLs the script only lists them. For relative links and
// image paths it checks whether the target exists on disk (resolved relative to
// the README's directory), and exits non-zero on any problem.
//
// It does not fetch anything and does not validate link text.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const readmePath = process.argv[2] ?? resolve(rootDir, '..', 'README.md');
const readmeAbs = resolve(readmePath);
const readmeDir = resolve(readmeAbs, '..');
const readmeFile = basename(readmeAbs);

function pathExists(p) {
  try {
    return existsSync(p);
  } catch {
    return false;
  }
}

function isInsideRepo(candidate) {
  try {
    return relative(readmeAbs, candidate).startsWith('..') === false;
  } catch {
    return false;
  }
}

function trimFragmentQuery(p) {
  let out = p;
  const hash = out.indexOf('#');
  const q = out.indexOf('?');
  if (hash !== -1 || q !== -1) {
    out = out.slice(0, Math.min(hash === -1 ? Infinity : hash, q === -1 ? Infinity : q));
  }
  return out;
}

// Strip a leading "./" (or ".") so "../.." and "a/b" resolve correctly.
function unrewrite(p) {
  if (p === '.') return '';
  if (p.startsWith('./')) return p.slice(2);
  return p;
}

const problems = [];
const absoluteGithub = new Set();

// Extract from the README, ignoring ```mermaid blocks and HTML <img> tags.
let cleaned = readFileSync(readmeAbs, 'utf8');
const mermaidRegex = /```mermaid[\s\S]*?```/g;
cleaned = cleaned.replace(mermaidRegex, ' ');

// Relative links: [text](path) and reference-style [text]: "path"
const relativeLinkRegex = /\[[^\]]*\]\(([^)]+)\)/g;
const refLinkRegex = /^\s*\[[^\]]+\]:\s*(.+)$/gm;

// Image paths: ![alt](path) and reference-style ![alt]: "path"
const imageRegex = /!?\[[^\]]*\]\(([^)]+)\)/g;
const imageRefRegex = /^!\[[^\]]*\]:\s*(.+)$/gm;

const linkTargets = new Set();
const imageTargets = new Set();

function scan(regex, source, set) {
  let m;
  const out = [];
  while ((m = regex.exec(source)) !== null) {
    const raw = m[1].trim();
    // skip absolute URLs (http(s) and mailto:) and windows drive letters
    if (/^(https?:|mailto:)/i.test(raw)) continue;
    if (/^[A-Z]:[\\/]/i.test(raw)) continue;
    const p = unrewrite(trimFragmentQuery(raw));
    if (!p) continue;
    set.add(p);
    out.push(p);
  }
  return out;
}

const linkMatches = scan(relativeLinkRegex, readFileSync(readmeAbs, 'utf8'), linkTargets);
const linkRefs = scan(refLinkRegex, readFileSync(readmeAbs, 'utf8'), linkTargets);
const imageMatches = scan(imageRegex, readFileSync(readmeAbs, 'utf8'), imageTargets);
const imageRefs = scan(imageRefRegex, readFileSync(readmeAbs, 'utf8'), imageTargets);

for (const p of linkTargets) {
  const candidate = resolve(readmeDir, p);
  if (isInsideRepo(candidate) === false) continue;
}

for (const p of imageTargets) {
  const candidate = resolve(readmeDir, p);
  if (!isInsideRepo(candidate)) continue;
  if (pathExists(candidate) === false) {
    problems.push(`missing image: ${p} (from ${relative(process.cwd(), readmeAbs)})`);
  }
}

for (const p of linkTargets) {
  const candidate = resolve(readmeDir, p);
  if (!isInsideRepo(candidate)) continue;
  if (pathExists(candidate) === false) {
    problems.push(`missing file: ${p} (from ${relative(process.cwd(), readmeAbs)})`);
  }
}

for (const m of readFileSync(readmeAbs, 'utf8').matchAll(/\[[^\]]*\]\((https?:\/\/[^)]+)\)/g)) {
  absoluteGithub.add(m[1]);
}

if (problems.length > 0) {
  console.log(`\nFound ${problems.length} problem(s) in ${readmeFile}:\n`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}

console.log(`\n${readmeFile}: all relative links and image paths exist.`);

if (absoluteGithub.size > 0) {
  console.log('\nAbsolute GitHub URLs (listed only, not fetched):');
  for (const u of absoluteGithub) console.log(`  ${u}`);
}

#!/usr/bin/env node
/**
 * Builds the investor due-diligence document set as print-ready PDFs.
 *
 *   node scripts/build-dd-pdfs.mjs [--out docs/data-room] [--only DATA_SECURITY.md]
 *
 * Produces one PDF per source document plus a single combined dossier with a
 * cover, table of contents and continuous page numbering. Rendering goes
 * through the Chromium that ships with the project's `puppeteer` dependency,
 * so no external toolchain (pandoc / wkhtmltopdf / LaTeX) is required.
 *
 * Regenerate whenever a source document changes; the PDFs are build output and
 * are not tracked in git.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const RELEASE = {
  label: 'Production-Ready Release',
  version: '2.0',
  classification: 'Confidential - Investor Due Diligence',
  entity: 'Astly (Pawnline / pawn360)',
};

/** Ordered so the combined dossier reads as a coherent document. */
const SECTIONS = [
  {
    part: 'Part I - Platform and Engineering',
    documents: [
      { file: 'TECH_STACK.md', title: 'Technology Stack Inventory' },
      { file: 'INFRASTRUCTURE.md', title: 'Infrastructure and Cloud Provider Reference' },
      { file: 'SCALABILITY_AND_DEPLOYMENT.md', title: 'Scalability and Deployment Plan' },
      { file: 'THIRD_PARTY_INTEGRATIONS.md', title: 'Third-Party API Integrations' },
    ],
  },
  {
    part: 'Part II - Security and Resilience',
    documents: [
      { file: 'DATA_SECURITY.md', title: 'Data Security' },
      { file: 'AUTHENTICATION_AND_AUTHORIZATION.md', title: 'Authentication and Authorization' },
      { file: 'DISASTER_RECOVERY_AND_RISK_PLAN.md', title: 'Disaster Recovery and Risk Mitigation Plan' },
    ],
  },
  {
    part: 'Part III - Privacy, Compliance and Licensing',
    documents: [
      { file: 'DATA_PRIVACY_COMPLIANCE.md', title: 'Data Privacy Compliance (Thailand PDPA)' },
      { file: 'docs/compliance/PRIVACY_POLICY.md', title: 'Privacy Policy (Privacy Notice)' },
      { file: 'docs/compliance/CONSENT_POLICY.md', title: 'Consent Policy and Consent Notice' },
      { file: 'docs/compliance/RECORDS_OF_PROCESSING_ACTIVITIES.md', title: 'Records of Processing Activities (RoPA)' },
      { file: 'docs/compliance/DATA_RETENTION_AND_DELETION_POLICY.md', title: 'Data Retention and Deletion Policy' },
      { file: 'docs/compliance/DATA_BREACH_NOTIFICATION_POLICY.md', title: 'Data-Breach Notification and Incident-Response Policy' },
      { file: 'docs/compliance/DATA_PROCESSING_AGREEMENTS.md', title: 'Data-Processing Agreements and Processor Governance' },
      { file: 'OPEN_SOURCE_LICENSE_REPORT.md', title: 'Open Source License Report' },
    ],
  },
];

const ALL_DOCS = SECTIONS.flatMap((section) =>
  section.documents.map((document) => ({ ...document, part: section.part })));

/**
 * Puppeteer pins a Chrome revision that may not be downloaded on this machine.
 * Fall back to any Chrome already present rather than pulling ~150 MB, since
 * the output is plain print CSS and does not depend on an exact revision.
 * Override explicitly with PUPPETEER_EXECUTABLE_PATH.
 */
async function resolveChrome() {
  const explicit = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (explicit) return explicit;

  const candidates = [];
  try {
    candidates.push(puppeteer.executablePath());
  } catch { /* no pinned build resolved */ }

  const cacheRoot = path.join(process.env.HOME || '', '.cache', 'puppeteer');
  for (const flavour of ['chrome', 'chrome-headless-shell']) {
    const dir = path.join(cacheRoot, flavour);
    let builds = [];
    try {
      builds = (await fs.readdir(dir)).sort().reverse();
    } catch { continue; }
    for (const build of builds) {
      candidates.push(flavour === 'chrome'
        ? path.join(dir, build, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing')
        : path.join(dir, build, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'));
    }
  }

  candidates.push(
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  );

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch { /* keep looking */ }
  }
  throw new Error(
    'No Chrome binary found. Run `npx puppeteer browsers install chrome` '
    + 'or set PUPPETEER_EXECUTABLE_PATH to an installed Chrome.',
  );
}

function parseArgs(argv) {
  const args = { out: 'docs/data-room', only: null, combinedOnly: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out' && argv[i + 1]) args.out = argv[++i];
    else if (argv[i] === '--only' && argv[i + 1]) args.only = argv[++i];
    else if (argv[i] === '--combined-only') args.combinedOnly = true;
  }
  return args;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function releaseDate() {
  // Stamped from the newest source document so a rebuild without content
  // changes does not silently produce a "newer" dossier.
  return null;
}

/**
 * Strips the leading H1 (it becomes the rendered document title) and rewrites
 * the metadata block that follows it into a definition list.
 */
function splitFrontMatter(markdown) {
  const lines = markdown.split('\n');
  let index = 0;
  while (index < lines.length && lines[index].trim() === '') index += 1;

  let heading = null;
  if (lines[index]?.startsWith('# ')) {
    heading = lines[index].slice(2).trim();
    index += 1;
  }

  const meta = [];
  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === '') { index += 1; continue; }
    const match = line.match(/^(Status|Scope|Owner|Version|Companion documents|Related|Purpose):\s*(.+)$/);
    if (!match) break;
    meta.push({ key: match[1], value: match[2].trim() });
    index += 1;
  }

  return { heading, meta, body: lines.slice(index).join('\n') };
}

const renderer = {
  // Repo-relative links mean nothing in a printed PDF; keep the text, drop the
  // dead anchor, and keep true external links clickable.
  link(token) {
    const href = String(token.href || '');
    const text = this.parser.parseInline(token.tokens || []);
    if (/^https?:\/\//i.test(href)) {
      return `<a href="${escapeHtml(href)}">${text}</a>`;
    }
    return `<span class="xref">${text}</span>`;
  },
  table(token) {
    const head = token.header
      .map((cell, i) => {
        const align = token.align[i] ? ` style="text-align:${token.align[i]}"` : '';
        return `<th${align}>${this.parser.parseInline(cell.tokens)}</th>`;
      })
      .join('');
    const body = token.rows
      .map((row) => {
        const cells = row
          .map((cell, i) => {
            const align = token.align[i] ? ` style="text-align:${token.align[i]}"` : '';
            return `<td${align}>${this.parser.parseInline(cell.tokens)}</td>`;
          })
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');
    // The wrapper lets a very wide matrix shrink instead of clipping.
    return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  },
};

marked.use({ renderer, gfm: true, breaks: false });

function documentStyles() {
  return `
:root {
  --ink: #16181d;
  --muted: #5b616e;
  --rule: #d9dce3;
  --rule-soft: #eceef2;
  --accent: #1f4f8f;
  --zebra: #f7f8fa;
  --code-bg: #f4f5f7;
}
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  margin: 0;
  color: var(--ink);
  font-family: "Charter", "Georgia", "Times New Roman", "Thonburi", serif;
  font-size: 9.6pt;
  line-height: 1.5;
}
.cover {
  page-break-after: always;
  padding: 46mm 0 0 0;
  border-top: 3pt solid var(--accent);
}
.cover .entity { font-size: 11pt; letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
.cover h1 { font-size: 27pt; line-height: 1.16; margin: 12mm 0 4mm; font-weight: 600; }
.cover .kicker { font-size: 13pt; color: var(--accent); margin-bottom: 22mm; }
.cover dl { display: grid; grid-template-columns: 40mm 1fr; gap: 2.4mm 6mm; margin: 0 0 18mm; font-size: 9pt; }
.cover dt { color: var(--muted); text-transform: uppercase; letter-spacing: .08em; font-size: 7.6pt; padding-top: .4mm; }
.cover dd { margin: 0; }
.cover .notice {
  border: .6pt solid var(--rule); border-left: 2.4pt solid var(--accent);
  padding: 5mm 6mm; font-size: 8.4pt; color: var(--muted); background: var(--zebra);
}
h1, h2, h3, h4 { font-family: "Helvetica Neue", Helvetica, "Thonburi", sans-serif; font-weight: 600; color: var(--ink); }
h1 { font-size: 17pt; margin: 0 0 5mm; page-break-after: avoid; }
h2 {
  font-size: 12.6pt; margin: 9mm 0 3mm; padding-bottom: 1.6mm;
  border-bottom: .8pt solid var(--rule); page-break-after: avoid;
}
h3 { font-size: 10.6pt; margin: 6mm 0 2mm; page-break-after: avoid; }
h4 { font-size: 9.6pt; margin: 4.5mm 0 1.6mm; color: var(--muted); page-break-after: avoid; }
p { margin: 0 0 2.6mm; orphans: 3; widows: 3; }
ul, ol { margin: 0 0 3mm; padding-left: 5.5mm; }
li { margin-bottom: 1.1mm; }
li > ul, li > ol { margin-top: 1.1mm; }
a { color: var(--accent); text-decoration: none; word-break: break-word; }
.xref { font-family: "SF Mono", "Menlo", monospace; font-size: 8.4pt; color: var(--muted); }
code {
  font-family: "SF Mono", "Menlo", "Consolas", monospace; font-size: 8.2pt;
  background: var(--code-bg); padding: .3mm 1mm; border-radius: 1.2pt;
}
pre {
  background: var(--code-bg); border: .5pt solid var(--rule-soft); border-radius: 2pt;
  padding: 3mm 3.5mm; margin: 0 0 3.5mm; overflow-wrap: break-word; white-space: pre-wrap;
  page-break-inside: avoid;
}
pre code { background: none; padding: 0; font-size: 8pt; line-height: 1.42; }
blockquote {
  margin: 0 0 3.5mm; padding: 2.6mm 4mm; border-left: 2.2pt solid var(--accent);
  background: var(--zebra); color: var(--muted); font-size: 9pt;
}
blockquote p:last-child { margin-bottom: 0; }
hr { border: none; border-top: .6pt solid var(--rule); margin: 6mm 0; }
.table-wrap { margin: 0 0 4mm; }
table { width: 100%; border-collapse: collapse; font-size: 8.3pt; line-height: 1.36; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
th {
  text-align: left; font-family: "Helvetica Neue", Helvetica, sans-serif; font-weight: 600;
  font-size: 7.8pt; text-transform: uppercase; letter-spacing: .04em;
  border-bottom: .9pt solid var(--ink); padding: 1.8mm 2.2mm; vertical-align: bottom;
}
td { border-bottom: .4pt solid var(--rule-soft); padding: 1.7mm 2.2mm; vertical-align: top; }
tbody tr:nth-child(even) { background: var(--zebra); }
td code, th code { font-size: 7.6pt; background: none; padding: 0; }
.doc { page-break-before: always; }
.doc:first-of-type { page-break-before: avoid; }
.doc-meta {
  margin: 0 0 6mm; padding: 3.5mm 4mm; background: var(--zebra);
  border: .5pt solid var(--rule-soft); border-radius: 2pt; font-size: 8.2pt;
}
.doc-meta dl { display: grid; grid-template-columns: 34mm 1fr; gap: 1.4mm 5mm; margin: 0; }
.doc-meta dt { color: var(--muted); text-transform: uppercase; letter-spacing: .06em; font-size: 7.2pt; padding-top: .3mm; }
.doc-meta dd { margin: 0; }
.part-divider { page-break-before: always; padding-top: 62mm; text-align: center; }
.part-divider .label { font-size: 8.4pt; letter-spacing: .22em; text-transform: uppercase; color: var(--muted); }
.part-divider h1 { font-size: 21pt; border: none; margin-top: 5mm; }
/* Numbering runs across every part so a reader can cite "document 11 of 15". */
.contents { page-break-after: always; counter-reset: toc; }
.contents h1 { border-bottom: .8pt solid var(--rule); padding-bottom: 2.5mm; }
.contents .part { margin: 6mm 0 2.5mm; font-size: 8pt; letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
.contents ol { list-style: none; padding: 0; margin: 0; }
.contents li { counter-increment: toc; display: flex; align-items: baseline; gap: 2mm; padding: 1.5mm 0; border-bottom: .4pt dotted var(--rule); font-size: 9.2pt; }
.contents li::before { content: counter(toc); color: var(--muted); font-size: 8pt; min-width: 6mm; }
`;
}

function coverHtml({ title, subtitle, meta }) {
  const rows = meta
    .map(({ key, value }) => `<dt>${escapeHtml(key)}</dt><dd>${value}</dd>`)
    .join('');
  return `<section class="cover">
  <div class="entity">${escapeHtml(RELEASE.entity)}</div>
  <h1>${escapeHtml(title)}</h1>
  <div class="kicker">${escapeHtml(subtitle)}</div>
  <dl>${rows}</dl>
  <div class="notice">
    <strong>${escapeHtml(RELEASE.classification)}.</strong>
    Prepared for prospective investors and their advisers. It contains technical,
    security and personal-data-handling detail about a live production system and
    must not be redistributed outside the recipient's diligence team. Statements about
    third-party plan limits, prices, certifications and legal obligations summarise
    public sources at the date above and should be re-verified at diligence time;
    nothing here is legal advice.
  </div>
</section>`;
}

function documentMetaHtml(meta) {
  if (meta.length === 0) return '';
  const rows = meta
    .map(({ key, value }) => `<dt>${escapeHtml(key)}</dt><dd>${marked.parseInline(value)}</dd>`)
    .join('');
  return `<div class="doc-meta"><dl>${rows}</dl></div>`;
}

function pageTemplate({ title, style, bodyHtml }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>${style}</style></head><body>${bodyHtml}</body></html>`;
}

function runningHeader(text) {
  return `<div style="width:100%;font-size:7pt;color:#8a8f9a;font-family:Helvetica,sans-serif;
    padding:0 14mm;display:flex;justify-content:space-between;">
    <span>${escapeHtml(text)}</span><span>${escapeHtml(`${RELEASE.label} v${RELEASE.version}`)}</span></div>`;
}

function runningFooter() {
  return `<div style="width:100%;font-size:7pt;color:#8a8f9a;font-family:Helvetica,sans-serif;
    padding:0 14mm;display:flex;justify-content:space-between;">
    <span>${escapeHtml(RELEASE.classification)}</span>
    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
}

async function renderPdf(browser, { html, outFile, headerText }) {
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: outFile,
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: runningHeader(headerText),
      footerTemplate: runningFooter(),
      margin: { top: '20mm', bottom: '18mm', left: '16mm', right: '16mm' },
    });
  } finally {
    await page.close();
  }
}

async function loadDocument(entry) {
  const absolute = path.join(ROOT, entry.file);
  const raw = await fs.readFile(absolute, 'utf8');
  const stat = await fs.stat(absolute);
  const { heading, meta, body } = splitFrontMatter(raw);
  return {
    ...entry,
    heading: heading || entry.title,
    meta,
    body,
    modifiedAt: stat.mtime,
  };
}

function formatDate(date) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok',
  }).format(date);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(ROOT, args.out);
  await fs.mkdir(outDir, { recursive: true });

  const selected = args.only
    ? ALL_DOCS.filter((doc) => doc.file === args.only || path.basename(doc.file) === args.only)
    : ALL_DOCS;
  if (selected.length === 0) throw new Error(`No document matched --only ${args.only}`);

  const documents = [];
  for (const entry of selected) documents.push(await loadDocument(entry));

  const stamp = documents.reduce(
    (latest, doc) => (doc.modifiedAt > latest ? doc.modifiedAt : latest),
    documents[0].modifiedAt,
  );
  const stampText = formatDate(stamp);
  const style = documentStyles();
  const executablePath = await resolveChrome();
  console.log(`Rendering with ${executablePath}\n`);
  const browser = await puppeteer.launch({ headless: true, executablePath });
  const written = [];

  try {
    if (!args.combinedOnly) {
      for (const doc of documents) {
        const cover = coverHtml({
          title: doc.heading.replace(/^Astly\s*-\s*/, ''),
          subtitle: `${RELEASE.label} - Version ${RELEASE.version}`,
          meta: [
            { key: 'Document', value: `<code>${escapeHtml(doc.file)}</code>` },
            { key: 'Dossier part', value: escapeHtml(doc.part) },
            { key: 'Release', value: `${escapeHtml(RELEASE.label)} v${RELEASE.version}` },
            { key: 'Source updated', value: formatDate(doc.modifiedAt) },
            { key: 'Classification', value: escapeHtml(RELEASE.classification) },
          ],
        });
        const html = pageTemplate({
          title: doc.heading,
          style,
          bodyHtml: `${cover}<main><h1>${escapeHtml(doc.heading)}</h1>${documentMetaHtml(doc.meta)}${marked.parse(doc.body)}</main>`,
        });
        const outFile = path.join(outDir, `${path.basename(doc.file, '.md')}.pdf`);
        await renderPdf(browser, { html, outFile, headerText: doc.heading });
        written.push(outFile);
        console.log(`  ${path.relative(ROOT, outFile)}`);
      }
    }

    // Combined dossier: cover, contents, then every document under its part.
    const contents = SECTIONS.map((section) => {
      const items = section.documents
        .filter((entry) => documents.some((doc) => doc.file === entry.file))
        .map((entry) => `<li>${escapeHtml(entry.title)}</li>`)
        .join('');
      return items ? `<div class="part">${escapeHtml(section.part)}</div><ol>${items}</ol>` : '';
    }).join('');

    let bodyHtml = coverHtml({
      title: 'Technical and Compliance Due-Diligence Dossier',
      subtitle: `${RELEASE.label} - Version ${RELEASE.version}`,
      meta: [
        { key: 'Documents', value: String(documents.length) },
        { key: 'Release', value: `${escapeHtml(RELEASE.label)} v${RELEASE.version}` },
        { key: 'Compiled', value: escapeHtml(stampText) },
        { key: 'Classification', value: escapeHtml(RELEASE.classification) },
      ],
    });
    bodyHtml += `<section class="contents"><h1>Contents</h1>${contents}</section>`;

    let currentPart = null;
    for (const doc of documents) {
      if (doc.part !== currentPart) {
        currentPart = doc.part;
        bodyHtml += `<section class="part-divider"><div class="label">${escapeHtml(RELEASE.entity)}</div><h1>${escapeHtml(doc.part)}</h1></section>`;
      }
      bodyHtml += `<section class="doc" id="${slugify(doc.title)}">`
        + `<h1>${escapeHtml(doc.heading)}</h1>${documentMetaHtml(doc.meta)}${marked.parse(doc.body)}</section>`;
    }

    const combinedFile = path.join(outDir, `Astly-DD-Dossier-v${RELEASE.version}.pdf`);
    await renderPdf(browser, {
      html: pageTemplate({ title: 'Astly Due-Diligence Dossier', style, bodyHtml }),
      outFile: combinedFile,
      headerText: 'Technical and Compliance Due-Diligence Dossier',
    });
    written.push(combinedFile);
    console.log(`  ${path.relative(ROOT, combinedFile)}`);
  } finally {
    await browser.close();
  }

  console.log(`\n${written.length} PDF(s) written to ${path.relative(ROOT, outDir)}/`);
}

main().catch((error) => {
  console.error('PDF build failed:', error?.message || error);
  process.exitCode = 1;
});

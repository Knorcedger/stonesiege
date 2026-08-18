import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import {
  mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

/**
 * Initial limits measured from the 2026-08-18 production build with roughly
 * 30% headroom. Change them only for an intentional, reviewed bundle increase.
 */
export const BUNDLE_BUDGET = Object.freeze({
  totalRawBytes: 1_500_000,
  totalGzipBytes: 425_000,
  largestRawBytes: 600_000,
  largestGzipBytes: 150_000,
});

function javascriptFiles(dir) {
  const out = [];
  const visit = (current) => {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name);
      const stat = statSync(path);
      if (stat.isDirectory()) visit(path);
      else if (name.endsWith('.js')) out.push(path);
    }
  };
  visit(dir);
  return out;
}

export function inspectBundle(dir) {
  const root = resolve(dir);
  const chunks = javascriptFiles(root).map((path) => {
    const bytes = readFileSync(path);
    return {
      path: relative(root, path),
      rawBytes: bytes.length,
      gzipBytes: gzipSync(bytes, { level: 9 }).length,
    };
  });
  if (chunks.length === 0) throw new Error(`No JavaScript chunks found in ${root}. Run npm run build first.`);
  const largestRaw = [...chunks].sort((a, b) => b.rawBytes - a.rawBytes)[0];
  const largestGzip = [...chunks].sort((a, b) => b.gzipBytes - a.gzipBytes)[0];
  return {
    chunks,
    totalRawBytes: chunks.reduce((sum, chunk) => sum + chunk.rawBytes, 0),
    totalGzipBytes: chunks.reduce((sum, chunk) => sum + chunk.gzipBytes, 0),
    largestRaw,
    largestGzip,
  };
}

export function budgetViolations(report, budget = BUNDLE_BUDGET) {
  const checks = [
    ['Total raw JavaScript', report.totalRawBytes, budget.totalRawBytes],
    ['Total gzip JavaScript', report.totalGzipBytes, budget.totalGzipBytes],
    [`Largest raw chunk (${report.largestRaw.path})`, report.largestRaw.rawBytes, budget.largestRawBytes],
    [`Largest gzip chunk (${report.largestGzip.path})`, report.largestGzip.gzipBytes, budget.largestGzipBytes],
  ];
  return checks
    .filter(([, actual, limit]) => actual > limit)
    .map(([label, actual, limit]) => `${label}: ${formatBytes(actual)} exceeds ${formatBytes(limit)}`);
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function printReport(report, budget) {
  console.log(`Bundle budget: ${report.chunks.length} JavaScript chunks`);
  console.log(`  total:   ${formatBytes(report.totalRawBytes)} raw / ${formatBytes(report.totalGzipBytes)} gzip`);
  console.log(`  largest: ${report.largestRaw.path} — ${formatBytes(report.largestRaw.rawBytes)} raw`);
  console.log(`  largest: ${report.largestGzip.path} — ${formatBytes(report.largestGzip.gzipBytes)} gzip`);
  console.log(`  limits:  ${formatBytes(budget.totalRawBytes)} raw total / ${formatBytes(budget.totalGzipBytes)} gzip total`);
}

function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), 'stonesiege-bundle-budget-'));
  try {
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'assets', 'small.js'), 'export const small = 1;\n');
    writeFileSync(join(dir, 'assets', 'large.js'), `export const large = "${'x'.repeat(256)}";\n`);
    writeFileSync(join(dir, 'assets', 'ignored.css'), 'not javascript');
    const report = inspectBundle(dir);
    assert.equal(report.chunks.length, 2);
    assert.equal(report.largestRaw.path, 'assets/large.js');
    assert.equal(budgetViolations(report, {
      totalRawBytes: report.totalRawBytes,
      totalGzipBytes: report.totalGzipBytes,
      largestRawBytes: report.largestRaw.rawBytes,
      largestGzipBytes: report.largestGzip.gzipBytes,
    }).length, 0);
    assert.match(budgetViolations(report, {
      totalRawBytes: report.totalRawBytes - 1,
      totalGzipBytes: Number.MAX_SAFE_INTEGER,
      largestRawBytes: Number.MAX_SAFE_INTEGER,
      largestGzipBytes: Number.MAX_SAFE_INTEGER,
    })[0], /Total raw JavaScript/);
    console.log('Bundle-budget self-test passed.');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  if (process.argv.includes('--self-test')) {
    selfTest();
  } else {
    try {
      const report = inspectBundle(resolve('dist'));
      printReport(report, BUNDLE_BUDGET);
      const violations = budgetViolations(report);
      if (violations.length > 0) {
        for (const violation of violations) console.error(`BUDGET ${violation}`);
        console.error('Review the bundle change. If it is intentional, update BUNDLE_BUDGET with the rationale in the pull request.');
        process.exitCode = 1;
      } else {
        console.log('Bundle budget passed.');
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}

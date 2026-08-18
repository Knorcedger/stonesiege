#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { strict as assert } from 'node:assert';

const SIGN_OFF = /^Signed-off-by:\s+(.+?)\s+<([^<>\s]+@[^<>\s]+)>\s*$/gimu;
const SHA = /^[0-9a-f]{40}$/iu;

export function hasSignOff(body, authorName, authorEmail) {
  SIGN_OFF.lastIndex = 0;
  return [...body.matchAll(SIGN_OFF)].some((match) => (
    match[1].trim() === authorName.trim()
      && match[2].toLocaleLowerCase() === authorEmail.toLocaleLowerCase()
  ));
}

export function isAutomatedAuthor(name, email) {
  return name.endsWith('[bot]') || /\[bot\]@users\.noreply\.github\.com$/iu.test(email);
}

function selfTest() {
  assert.equal(hasSignOff('Subject\n\nSigned-off-by: Ada Lovelace <ada@example.com>', 'Ada Lovelace', 'ada@example.com'), true);
  assert.equal(hasSignOff('Subject\n\nSigned-off-by: Someone Else <else@example.com>', 'Ada Lovelace', 'ada@example.com'), false);
  assert.equal(hasSignOff('Subject\n\nCo-authored-by: Ada Lovelace <ada@example.com>', 'Ada Lovelace', 'ada@example.com'), false);
  assert.equal(hasSignOff('Signed-off-by: missing-email', 'Ada Lovelace', 'ada@example.com'), false);
  assert.equal(isAutomatedAuthor('dependabot[bot]', '49699333+dependabot[bot]@users.noreply.github.com'), true);
  assert.equal(isAutomatedAuthor('Ada Lovelace', 'ada@example.com'), false);
  console.log('DCO checker self-test passed.');
}

function commitsInRange(base, head) {
  const output = execFileSync(
    'git',
    ['log', '--format=%H%x1f%an%x1f%ae%x1f%B%x1e', `${base}..${head}`],
    { encoding: 'utf8' },
  );

  return output
    .split('\x1e')
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha, authorName, authorEmail, ...body] = record.split('\x1f');
      return { sha, authorName, authorEmail, body: body.join('\x1f') };
    });
}

function main() {
  const [base, head] = process.argv.slice(2);
  if (base === '--self-test') {
    selfTest();
    return;
  }

  if (!SHA.test(base ?? '') || !SHA.test(head ?? '')) {
    console.error('Usage: node tools/check-dco.mjs <base-sha> <head-sha>');
    process.exitCode = 2;
    return;
  }

  const commits = commitsInRange(base, head);
  const unsigned = commits.filter(
    (commit) => !isAutomatedAuthor(commit.authorName, commit.authorEmail)
      && !hasSignOff(commit.body, commit.authorName, commit.authorEmail),
  );

  if (unsigned.length === 0) {
    console.log(`DCO sign-off verified for ${commits.length} commit${commits.length === 1 ? '' : 's'}.`);
    return;
  }

  console.error('The following commits are missing a Signed-off-by trailer matching the commit author:');
  for (const commit of unsigned) {
    console.error(`- ${commit.sha.slice(0, 12)} ${commit.authorName} <${commit.authorEmail}>`);
  }
  console.error('\nAdd a sign-off with `git commit --amend --signoff` or an interactive rebase, then push the updated commits.');
  process.exitCode = 1;
}

main();

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { queryCoverage, runSf, SfCliError, SfCliNotFoundError } = require('../lib/sfCli');

// A fake "sf" executable that records its arguments and replies according to FAKE_SF_MODE.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-sf-'));
const fakeSf = path.join(dir, 'sf');
fs.writeFileSync(
  fakeSf,
  `#!/usr/bin/env node
const fs = require('fs');
fs.writeFileSync(process.env.FAKE_SF_LOG, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), telemetry: process.env.SF_DISABLE_TELEMETRY }));
const mode = process.env.FAKE_SF_MODE;
if (mode === 'ok') { console.log(JSON.stringify({ status: 0, result: { records: [{ NumLinesCovered: 9, NumLinesUncovered: 1 }] } })); }
else if (mode === 'empty') { console.log(JSON.stringify({ status: 0, result: { records: [] } })); }
else if (mode === 'noorg') { console.log(JSON.stringify({ status: 1, message: 'No default environment found.' })); process.exit(1); }
else if (mode === 'garbage') { console.error('boom'); process.exit(2); }
else if (mode === 'hang') { setTimeout(() => {}, 10000); }
`,
  { mode: 0o755 }
);
const logFile = path.join(dir, 'log.json');
process.env.FAKE_SF_LOG = logFile;
const opts = { command: fakeSf, platform: 'linux' };

test('passes a read-only tooling query as a single argument, in the project folder', async () => {
  process.env.FAKE_SF_MODE = 'ok';
  const record = await queryCoverage('AccountService', dir, opts);
  assert.deepEqual(record, { covered: 9, uncovered: 1 });
  const log = JSON.parse(fs.readFileSync(logFile, 'utf8'));
  assert.deepEqual(log.args.slice(0, 5), ['data', 'query', '--use-tooling-api', '--json', '--query']);
  assert.match(log.args[5], /^SELECT .* FROM ApexCodeCoverageAggregate WHERE ApexClassOrTrigger\.Name = 'AccountService' LIMIT 1$/);
  assert.equal(fs.realpathSync(log.cwd), fs.realpathSync(dir));
  assert.equal(log.telemetry, 'true');
});

test('returns null when the org has no coverage record', async () => {
  process.env.FAKE_SF_MODE = 'empty';
  assert.equal(await queryCoverage('AccountService', dir, opts), null);
});

test('surfaces the CLI error message', async () => {
  process.env.FAKE_SF_MODE = 'noorg';
  await assert.rejects(queryCoverage('AccountService', dir, opts), (e) => e instanceof SfCliError && /No default environment/.test(e.message));
});

test('handles non-JSON output', async () => {
  process.env.FAKE_SF_MODE = 'garbage';
  await assert.rejects(queryCoverage('AccountService', dir, opts), (e) => e instanceof SfCliError && /boom/.test(e.message));
});

test('times out', async () => {
  process.env.FAKE_SF_MODE = 'hang';
  await assert.rejects(queryCoverage('AccountService', dir, { ...opts, timeoutMs: 300 }), /did not respond in time/);
});

test('reports a missing CLI', async () => {
  await assert.rejects(queryCoverage('AccountService', dir, { command: path.join(dir, 'missing-sf'), platform: 'linux' }), SfCliNotFoundError);
});

test('never queries an invalid name', async () => {
  await assert.rejects(queryCoverage("X' OR Name != '", dir, opts), /Invalid Apex/);
});

test('rejects shell-sensitive arguments on Windows', async () => {
  await assert.rejects(runSf(['%PATH%'], { cwd: dir, command: fakeSf, platform: 'win32' }), /unsafe argument/);
});

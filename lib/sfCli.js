// @ts-check
'use strict';

/**
 * Runs read-only Tooling API queries through the Salesforce CLI ("sf").
 * The CLI handles authentication, so this extension never touches credentials.
 */

const { execFile } = require('child_process');
const { buildCoverageQuery } = require('./coverage');

const DEFAULT_TIMEOUT_MS = 60_000;

class SfCliNotFoundError extends Error {
  constructor() {
    super('The Salesforce CLI ("sf") was not found. Install it and make sure it is on your PATH.');
    this.name = 'SfCliNotFoundError';
  }
}

class SfCliError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'SfCliError';
  }
}

/**
 * Extracts the JSON document from the CLI output.
 * @param {string} stdout
 * @returns {any}
 */
function parseJsonOutput(stdout) {
  const start = stdout.indexOf('{');
  if (start === -1) {
    return undefined;
  }
  try {
    return JSON.parse(stdout.slice(start));
  } catch {
    return undefined;
  }
}

/**
 * Runs an sf command with --json output and resolves with the parsed result.
 * @param {string[]} args
 * @param {{ cwd: string, command?: string, timeoutMs?: number, platform?: NodeJS.Platform }} options
 * @returns {Promise<any>}
 */
function runSf(args, options) {
  const platform = options.platform ?? process.platform;
  const isWindows = platform === 'win32';
  const command = options.command ?? 'sf';

  // On Windows, "sf" is a .cmd file, which Node can only start through the shell.
  // Each argument is wrapped in double quotes; arguments that contain characters the
  // Windows shell would interpret are rejected rather than escaped.
  if (isWindows && args.some((arg) => /["%^!\r\n]/.test(arg))) {
    return Promise.reject(new SfCliError('Refusing to pass an unsafe argument to the shell.'));
  }
  const finalArgs = isWindows ? args.map((arg) => `"${arg}"`) : args;

  return new Promise((resolve, reject) => {
    execFile(
      command,
      finalArgs,
      {
        cwd: options.cwd,
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
        shell: isWindows,
        env: {
          ...process.env,
          SF_DISABLE_TELEMETRY: 'true',
          SF_SKIP_NEW_VERSION_CHECK: 'true',
          FORCE_COLOR: '0',
        },
      },
      (error, stdout, stderr) => {
        const err = /** @type {(NodeJS.ErrnoException & { killed?: boolean }) | null} */ (error);
        if (err && err.code === 'ENOENT') {
          reject(new SfCliNotFoundError());
          return;
        }
        if (err && isWindows && /is not recognized as an internal or external command/i.test(String(stderr))) {
          reject(new SfCliNotFoundError());
          return;
        }
        if (err && err.killed) {
          reject(new SfCliError('The Salesforce CLI did not respond in time.'));
          return;
        }

        const parsed = parseJsonOutput(String(stdout));
        if (!parsed) {
          const detail = String(stderr).trim() || (err ? err.message : 'Unexpected output.');
          reject(new SfCliError(`The Salesforce CLI returned an unexpected response: ${detail}`));
          return;
        }
        if (parsed.status !== 0) {
          reject(new SfCliError(parsed.message || 'The Salesforce CLI reported an error.'));
          return;
        }
        resolve(parsed.result);
      }
    );
  });
}

/**
 * Retrieves the aggregate coverage for one Apex class or trigger from the default org.
 * @param {string} name
 * @param {string} cwd The project folder, so the CLI uses the project's target org.
 * @param {{ command?: string, timeoutMs?: number, platform?: NodeJS.Platform }} [options]
 * @returns {Promise<import('./coverage').CoverageRecord | null>} null when the org has no coverage for this name.
 */
async function queryCoverage(name, cwd, options = {}) {
  const query = buildCoverageQuery(name);
  const result = await runSf(['data', 'query', '--use-tooling-api', '--json', '--query', query], {
    ...options,
    cwd,
  });
  const record = result && Array.isArray(result.records) ? result.records[0] : undefined;
  if (!record) {
    return null;
  }
  return {
    covered: Number(record.NumLinesCovered) || 0,
    uncovered: Number(record.NumLinesUncovered) || 0,
  };
}

module.exports = { queryCoverage, runSf, SfCliError, SfCliNotFoundError };

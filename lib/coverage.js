// @ts-check
'use strict';

/**
 * Pure coverage logic: name validation, query construction, and percentage math.
 * This module has no dependency on VS Code so that it can be unit tested with Node.
 */

// Apex class and trigger names: start with a letter, then letters, digits, or underscores.
const APEX_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,254}$/;

/**
 * @param {string} name
 * @returns {boolean}
 */
function isValidApexName(name) {
  return APEX_NAME_PATTERN.test(name);
}

/**
 * Builds the Tooling API query. The name is validated against the Apex identifier
 * rules first, so it can never contain quotes or other characters that would alter the query.
 * @param {string} name
 * @returns {string}
 */
function buildCoverageQuery(name) {
  if (!isValidApexName(name)) {
    throw new Error(`Invalid Apex class or trigger name: ${name}`);
  }
  return (
    'SELECT ApexClassOrTrigger.Name, NumLinesCovered, NumLinesUncovered ' +
    'FROM ApexCodeCoverageAggregate ' +
    `WHERE ApexClassOrTrigger.Name = '${name}' LIMIT 1`
  );
}

/**
 * @typedef {{ covered: number, uncovered: number }} CoverageRecord
 * @typedef {{
 *   covered: number,
 *   uncovered: number,
 *   total: number,
 *   percentage: number,
 *   linesToNext?: number,
 *   nextPercentage?: number
 * }} CoverageSummary
 */

/**
 * Converts raw line counts into a percentage and the number of additional covered
 * lines needed to reach the next whole percentage point.
 * @param {CoverageRecord} record
 * @returns {CoverageSummary | undefined} undefined when the class has no coverable lines.
 */
function summarize(record) {
  const covered = Math.max(0, Math.trunc(record.covered));
  const uncovered = Math.max(0, Math.trunc(record.uncovered));
  const total = covered + uncovered;
  if (total === 0) {
    return undefined;
  }
  if (uncovered === 0) {
    return { covered, uncovered, total, percentage: 100 };
  }

  const percentage = (covered / total) * 100;
  const targetPercentage = Math.floor(percentage) + 1; // at most 100, because uncovered > 0
  const requiredCovered = Math.ceil((targetPercentage * total) / 100);
  const linesToNext = requiredCovered - covered;
  // For small classes one more line can jump several points, so report the percentage actually reached.
  const nextPercentage = Math.floor((requiredCovered * 100) / total);

  return { covered, uncovered, total, percentage, linesToNext, nextPercentage };
}

/**
 * @param {number} value
 * @returns {string} The value rounded to at most two decimals, without trailing zeros.
 */
function formatPercentage(value) {
  return String(Number(value.toFixed(2)));
}

/**
 * @param {CoverageSummary | undefined} summary
 * @returns {string}
 */
function formatStatusText(summary) {
  if (!summary) {
    return 'Coverage: no data';
  }
  let text = `Coverage: ${formatPercentage(summary.percentage)}%`;
  if (summary.linesToNext) {
    const unit = summary.linesToNext === 1 ? 'line' : 'lines';
    text += ` (${summary.linesToNext} ${unit} to ${summary.nextPercentage}%)`;
  }
  return text;
}

/**
 * @param {string} name
 * @param {CoverageSummary | undefined} summary
 * @returns {string}
 */
function formatTooltip(name, summary) {
  if (!summary) {
    return (
      `No coverage data was found for ${name} in the default Salesforce org.\n` +
      'Run the Apex tests for this class, then click to refresh.'
    );
  }
  return [
    `Apex coverage for ${name}`,
    `Covered lines: ${summary.covered}`,
    `Uncovered lines: ${summary.uncovered}`,
    `Total lines: ${summary.total}`,
    'Source: ApexCodeCoverageAggregate in the default Salesforce org',
    'Click to refresh.',
  ].join('\n');
}

module.exports = {
  isValidApexName,
  buildCoverageQuery,
  summarize,
  formatPercentage,
  formatStatusText,
  formatTooltip,
};

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../lib/coverage');

test('validates Apex names and rejects injection attempts', () => {
  assert.equal(c.isValidApexName('AccountService'), true);
  assert.equal(c.isValidApexName('Account_Trigger2'), true);
  assert.equal(c.isValidApexName("X' OR Name != '"), false);
  assert.equal(c.isValidApexName('1Bad'), false);
  assert.equal(c.isValidApexName(''), false);
  assert.throws(() => c.buildCoverageQuery("X'--"));
  assert.match(c.buildCoverageQuery('Foo'), /WHERE ApexClassOrTrigger\.Name = 'Foo' LIMIT 1$/);
});

test('reports 100% coverage instead of no data (bug in the original)', () => {
  const s = c.summarize({ covered: 40, uncovered: 0 });
  assert.equal(s.percentage, 100);
  assert.equal(s.linesToNext, undefined);
  assert.equal(c.formatStatusText(s), 'Coverage: 100%');
});

test('reports 0% coverage instead of no data', () => {
  const s = c.summarize({ covered: 0, uncovered: 10 });
  assert.equal(c.formatStatusText(s), 'Coverage: 0% (1 line to 10%)');
});

test('returns undefined when there are no coverable lines', () => {
  assert.equal(c.summarize({ covered: 0, uncovered: 0 }), undefined);
  assert.equal(c.formatStatusText(undefined), 'Coverage: no data');
});

test('computes lines to the next percentage for large classes', () => {
  const s = c.summarize({ covered: 875, uncovered: 125 }); // 87.5%
  assert.equal(s.linesToNext, 5); // 880 / 1000 = 88%
  assert.equal(s.nextPercentage, 88);
  assert.equal(c.formatStatusText(s), 'Coverage: 87.5% (5 lines to 88%)');
});

test('computes the reachable percentage for small classes', () => {
  const s = c.summarize({ covered: 5, uncovered: 5 });
  assert.equal(s.linesToNext, 1);
  assert.equal(s.nextPercentage, 60);
  const t = c.summarize({ covered: 2, uncovered: 1 }); // 66.67%
  assert.equal(c.formatStatusText(t), 'Coverage: 66.67% (1 line to 100%)');
});

test('exhaustive check: next line count is minimal and reaches the target', () => {
  for (let total = 1; total <= 400; total++) {
    for (let covered = 0; covered < total; covered++) {
      const s = c.summarize({ covered, uncovered: total - covered });
      const target = Math.floor((covered / total) * 100) + 1;
      const reached = ((covered + s.linesToNext) / total) * 100;
      const fallsShort = ((covered + s.linesToNext - 1) / total) * 100;
      assert.ok(reached >= target - 1e-9, `total=${total} covered=${covered}`);
      assert.ok(fallsShort < target, `total=${total} covered=${covered}`);
      assert.ok(s.nextPercentage >= target && s.nextPercentage <= 100);
    }
  }
});

'use strict';

// Exercises extension.js against a minimal stand-in for the VS Code API.

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const path = require('path');

function createFakeVscode() {
  const state = { editorListeners: [], commands: {}, item: null, outputLines: [] };
  const vscode = {
    StatusBarAlignment: { Left: 1 },
    window: {
      activeTextEditor: undefined,
      createStatusBarItem() {
        state.item = { text: '', tooltip: '', visible: false, show() { this.visible = true; }, hide() { this.visible = false; }, dispose() {} };
        return state.item;
      },
      createOutputChannel() {
        return { appendLine: (l) => state.outputLines.push(l), dispose() {} };
      },
      onDidChangeActiveTextEditor(fn) {
        state.editorListeners.push(fn);
        return { dispose() {} };
      },
    },
    commands: {
      registerCommand(id, fn) {
        state.commands[id] = fn;
        return { dispose() {} };
      },
    },
    workspace: {
      getWorkspaceFolder: () => ({ uri: { fsPath: '/project' } }),
    },
  };
  return { vscode, state };
}

function loadExtension(fakeVscode, fakeQuery) {
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return fakeVscode;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const root = path.resolve(__dirname, '..');
    for (const key of Object.keys(require.cache)) {
      if (key.startsWith(root) && !key.includes(`${path.sep}test${path.sep}`)) delete require.cache[key];
    }
    const sfCli = require('../lib/sfCli');
    sfCli.queryCoverage = (...args) => fakeQuery(...args, sfCli);
    return require('../extension');
  } finally {
    Module._load = originalLoad;
  }
}

const editorFor = (fileName, scheme = 'file') => ({ document: { fileName, uri: { scheme } } });
const tick = () => new Promise((r) => setTimeout(r, 10));

test('shows coverage for an Apex class and hides for other files', async () => {
  const { vscode, state } = createFakeVscode();
  const calls = [];
  const ext = loadExtension(vscode, async (name, cwd) => {
    calls.push({ name, cwd });
    return { covered: 875, uncovered: 125 };
  });
  vscode.window.activeTextEditor = editorFor('/project/force-app/classes/AccountService.cls');
  const context = { subscriptions: [] };
  ext.activate(context);
  assert.equal(context.subscriptions.length, 4); // item, output, command, listener are all disposed on deactivate
  await tick();
  assert.equal(state.item.text, 'Coverage: 87.5% (5 lines to 88%)');
  assert.equal(state.item.visible, true);
  assert.deepEqual(calls, [{ name: 'AccountService', cwd: '/project' }]);

  vscode.window.activeTextEditor = editorFor('/project/README.md');
  state.editorListeners[0]();
  await tick();
  assert.equal(state.item.visible, false);
  assert.equal(calls.length, 1);

  vscode.window.activeTextEditor = editorFor('/project/AccountService.cls-meta.xml');
  state.editorListeners[0]();
  await tick();
  assert.equal(state.item.visible, false);
});

test('a slow earlier request does not overwrite a newer result', async () => {
  const { vscode, state } = createFakeVscode();
  const ext = loadExtension(vscode, (name) =>
    new Promise((resolve) => setTimeout(() => resolve(name === 'Slow' ? { covered: 1, uncovered: 9 } : { covered: 10, uncovered: 0 }), name === 'Slow' ? 60 : 5))
  );
  vscode.window.activeTextEditor = editorFor('/project/Slow.cls');
  ext.activate({ subscriptions: [] });
  vscode.window.activeTextEditor = editorFor('/project/Fast.trigger');
  state.editorListeners[0]();
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(state.item.text, 'Coverage: 100%');
});

test('shows a clear message when the CLI fails', async () => {
  const { vscode, state } = createFakeVscode();
  const ext = loadExtension(vscode, async (_name, _cwd, sfCli) => {
    throw new sfCli.SfCliNotFoundError();
  });
  vscode.window.activeTextEditor = editorFor('/project/AccountService.cls');
  ext.activate({ subscriptions: [] });
  await tick();
  assert.equal(state.item.text, '$(warning) Coverage: sf CLI not found');
  assert.equal(state.outputLines.length, 1);
});

test('the refresh command re-queries', async () => {
  const { vscode, state } = createFakeVscode();
  let count = 0;
  const ext = loadExtension(vscode, async () => {
    count++;
    return null;
  });
  vscode.window.activeTextEditor = editorFor('/project/AccountService.cls');
  ext.activate({ subscriptions: [] });
  await state.commands['apexCoverage.refresh']();
  assert.equal(count, 2);
  assert.equal(state.item.text, 'Coverage: no data');
});

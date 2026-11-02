// @ts-check
'use strict';

const vscode = require('vscode');
const path = require('path');
const { isValidApexName, summarize, formatStatusText, formatTooltip } = require('./lib/coverage');
const { queryCoverage, SfCliNotFoundError } = require('./lib/sfCli');

const REFRESH_COMMAND = 'apexCoverage.refresh';
const APEX_EXTENSIONS = new Set(['.cls', '.trigger']);

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -1);
  statusBarItem.command = REFRESH_COMMAND;
  const output = vscode.window.createOutputChannel('Apex Coverage');

  // Each refresh gets a number; a slower, older request never overwrites a newer result.
  let latestRequest = 0;

  async function refresh() {
    const requestId = ++latestRequest;
    const editor = vscode.window.activeTextEditor;
    const target = editor ? getApexTarget(editor.document) : undefined;
    if (!target) {
      statusBarItem.hide();
      return;
    }

    statusBarItem.text = `$(sync~spin) Coverage: ${target.name}`;
    statusBarItem.tooltip = 'Retrieving code coverage from Salesforce...';
    statusBarItem.show();

    try {
      const record = await queryCoverage(target.name, target.cwd);
      if (requestId !== latestRequest) {
        return;
      }
      const summary = record ? summarize(record) : undefined;
      statusBarItem.text = formatStatusText(summary);
      statusBarItem.tooltip = formatTooltip(target.name, summary);
    } catch (error) {
      if (requestId !== latestRequest) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      statusBarItem.text =
        error instanceof SfCliNotFoundError
          ? '$(warning) Coverage: sf CLI not found'
          : '$(warning) Coverage: unavailable';
      statusBarItem.tooltip = `${message}\n\nClick to retry. Details are in the "Apex Coverage" output panel.`;
      output.appendLine(`[${new Date().toISOString()}] ${target.name}: ${message}`);
    }
  }

  context.subscriptions.push(
    statusBarItem,
    output,
    vscode.commands.registerCommand(REFRESH_COMMAND, refresh),
    vscode.window.onDidChangeActiveTextEditor(() => {
      void refresh();
    })
  );

  void refresh();
}

/**
 * Returns the Apex name and project folder for an open .cls or .trigger file.
 * @param {vscode.TextDocument} document
 * @returns {{ name: string, cwd: string } | undefined}
 */
function getApexTarget(document) {
  if (document.uri.scheme !== 'file') {
    return undefined;
  }
  const extension = path.extname(document.fileName);
  if (!APEX_EXTENSIONS.has(extension.toLowerCase())) {
    return undefined;
  }
  const name = path.basename(document.fileName, extension);
  if (!isValidApexName(name)) {
    return undefined;
  }
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  return { name, cwd: folder ? folder.uri.fsPath : path.dirname(document.fileName) };
}

function deactivate() {}

module.exports = { activate, deactivate };

# Apex Coverage Status

Apex Coverage Status shows the code coverage of the open Apex class or trigger in the Visual Studio Code status bar. Example: `Coverage: 87.5% (3 lines to 88%)`.

## Requirements

- Visual Studio Code 1.85 or later.
- The Salesforce CLI (`sf`), installed and on your PATH.
- A default org for the project. Set one with `sf config set target-org <alias>`.

## How it works

- The extension starts only in folders that contain `sfdx-project.json`. It also stays off in workspaces that Visual Studio Code does not trust.
- When you open a `.cls` or `.trigger` file, it runs one read-only Tooling API query through the Salesforce CLI. The query reads `ApexCodeCoverageAggregate` for that class or trigger name.
- The Salesforce CLI handles authentication. The extension never reads or stores credentials.
- The extension makes no other network calls and bundles no third-party code. It turns off Salesforce CLI telemetry for the commands it runs.
- Click the status bar item, or run **Apex Coverage: Refresh Coverage**, to fetch the latest numbers after a test run.
- Errors are logged in the **Apex Coverage** output panel.

## Installation

1. In Visual Studio Code, open the Extensions view.
2. Select the `...` menu, then select **Install from VSIX...**.
3. Choose `apex-coverage-status-1.0.0.vsix`.

You can also install it from a terminal with `code --install-extension apex-coverage-status-1.0.0.vsix`.

## Development

- `npm test` runs the unit tests. They use Node's built-in test runner and need no dependencies.
- `npm run package` builds `dist/apex-coverage-status-<version>.vsix`.

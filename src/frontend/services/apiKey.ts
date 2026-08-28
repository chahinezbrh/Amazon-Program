// src/frontend/services/apiKey.ts
//
// Holds the Gemini API key in VS Code's SecretStorage, which is encrypted per
// machine. A key in settings.json would be committed with the repo and leak —
// especially in workspace settings.

import * as vscode from 'vscode';

const KEY = 'docManager.geminiApiKey';

let secrets: vscode.SecretStorage | undefined;

/** Called once from activate(). SecretStorage is only reachable through the
 *  extension context, which commands don't otherwise receive. */
export function initSecrets(context: vscode.ExtensionContext): void {
  secrets = context.secrets;
}

export async function getApiKey(): Promise<string | undefined> {
  return secrets?.get(KEY);
}

/** Prompts for a key and stores it. Returns undefined if the user cancels. */
export async function promptForApiKey(): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    title: 'Gemini API key',
    prompt: 'Stored in VS Code secret storage, not in your settings file.',
    password: true,
    ignoreFocusOut: true,
    placeHolder: 'AIza…',
    validateInput: (input) =>
      input.trim().length < 20 ? "That doesn't look like an API key." : null,
  });

  if (!value) return undefined;

  await secrets?.store(KEY, value.trim());
  return value.trim();
}

/** The key if stored, otherwise asks for one. Used at the point of need so a
 *  first-time user isn't prompted during activation. */
export async function requireApiKey(): Promise<string | undefined> {
  return (await getApiKey()) ?? (await promptForApiKey());
}

export async function clearApiKey(): Promise<void> {
  await secrets?.delete(KEY);
  vscode.window.showInformationMessage('Doc Manager: Gemini API key removed.');
}
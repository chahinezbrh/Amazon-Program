// src/backend/services/githubAuth.ts
//
// Gets a GitHub token with repo-admin scope (needed to register webhooks),
// either from SecretStorage if already stored, or by prompting the user once.

import * as vscode from 'vscode';

const SECRET_KEY = 'funcmanager.githubToken';

export async function getOrPromptGithubToken(
  context: vscode.ExtensionContext
): Promise<string | undefined> {
  const existing = await context.secrets.get(SECRET_KEY);
  if (existing) return existing;

  const token = await vscode.window.showInputBox({
    title: 'GitHub Personal Access Token',
    prompt:
      'docManager needs a token with the "admin:repo_hook" scope to register a push webhook on this repo. ' +
      'Generate one at https://github.com/settings/tokens and paste it here.',
    password: true, // masks input in the UI
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim().length === 0 ? 'Token cannot be empty' : undefined),
  });

  if (!token) return undefined; // user cancelled

  await context.secrets.store(SECRET_KEY, token.trim());
  return token.trim();
}
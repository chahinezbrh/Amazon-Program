// src/backend/services/githubAuth.ts
//
// Gets a GitHub token with repo-admin scope (needed to register webhooks),
// either from SecretStorage if already stored, or by prompting the user once.

import * as vscode from 'vscode';

const SECRET_KEY = 'funcmanager.githubToken';

// src/backend/services/githubAuth.ts

export async function getOrPromptGithubToken(
  context: vscode.ExtensionContext,
  repoUrl: string
): Promise<string | undefined> {
  const secretKey = `funcmanager.githubToken.${repoUrl.trim().toLowerCase()}`;

  const existing = await context.secrets.get(secretKey);
  if (existing) return existing;

  const token = await vscode.window.showInputBox({
    title: 'GitHub Personal Access Token',
    prompt:
      `FuncManager needs a token with the "admin:repo_hook" scope for ${repoUrl}. ` +
      'Generate one at https://github.com/settings/tokens and paste it here.',
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim().length === 0 ? 'Token cannot be empty' : undefined),
  });

  if (!token) return undefined;

  await context.secrets.store(secretKey, token.trim());
  return token.trim();
}
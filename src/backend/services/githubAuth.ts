// src/backend/services/githubAuth.ts
//
// Gets a GitHub token with repo-admin scope (needed to register webhooks),
// either from SecretStorage if already stored, or by prompting the user once.

import * as vscode from 'vscode';

// Bump this string (v2, v3, ...) any time you want every repo to be
// re-prompted for a token — old keys under the previous version become
// permanently unreachable, which is a cheap way to "clear all tokens" for
// testing without needing to enumerate or delete anything from SecretStorage.
const TOKEN_VERSION = 'v2';

function secretKeyFor(repoUrl: string): string {
  return `funcmanager.githubToken.${TOKEN_VERSION}.${repoUrl.trim().toLowerCase()}`;
}

export async function getOrPromptGithubToken(
  context: vscode.ExtensionContext,
  repoUrl: string
): Promise<string | undefined> {
  const secretKey = secretKeyFor(repoUrl);
  
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
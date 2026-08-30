// src/backend/services/githubWebhookRegistration.ts
//
// One-time call made right after a repo is connected via pasted URL (after
// the clone + config.json write). Tells GitHub to start POSTing push events
// to the relay server. Without this, the relay never receives anything for
// that repo, no matter how correctly repoUrl is stored locally.

function parseOwnerRepo(repoUrl: string): { owner: string; repo: string } {
  const clean = repoUrl.trim().replace(/\.git$/, '').replace(/\/$/, '');
  const parts = clean.split('/');
  const owner = parts[parts.length - 2];
  const repo = parts[parts.length - 1];

  if (!owner || !repo) {
    throw new Error(`Invalid GitHub repository URL: "${repoUrl}"`);
  }

  return { owner, repo };
}

export interface RegisterWebhookOptions {
  repoUrl: string;        // e.g. from config.json
  githubToken: string;    // needs 'admin:repo_hook' scope (classic) or repo webhook write (fine-grained)
  relayWebhookUrl: string; // e.g. https://your-relay.com/webhook
  webhookSecret: string;   // must match GITHUB_WEBHOOK_SECRET on the relay
}

export interface RegisterWebhookResult {
  webhookId: number;
  alreadyExisted: boolean;
}

/**
 * Registers a push webhook on the given GitHub repo pointing at the relay.
 * Safe to call more than once — if a hook with the same URL already exists,
 * it's reused instead of creating a duplicate.
 */
export async function registerGithubWebhook(
  options: RegisterWebhookOptions
): Promise<RegisterWebhookResult> {
  const { repoUrl, githubToken, relayWebhookUrl, webhookSecret } = options;
  const { owner, repo } = parseOwnerRepo(repoUrl);

  const headers = {
    Authorization: `Bearer ${githubToken}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  // Check for an existing hook pointing at the same URL first, so
  // reconnecting the same repo doesn't pile up duplicate webhooks.
  const listRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/hooks`,
    { headers }
  );
  if (!listRes.ok) {
    throw new Error(
      `Failed to list webhooks for ${owner}/${repo}: ${listRes.status} ${await listRes.text()}`
    );
  }
  const existingHooks = (await listRes.json()) as Array<{ id: number; config: { url?: string } }>;
  const existing = existingHooks.find((h) => h.config.url === relayWebhookUrl);
  if (existing) {
    return { webhookId: existing.id, alreadyExisted: true };
  }

  const createRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/hooks`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'web',
        active: true,
        events: ['push'],
        config: {
          url: relayWebhookUrl,
          content_type: 'json',
          secret: webhookSecret,
        },
      }),
    }
  );

  if (!createRes.ok) {
    throw new Error(
      `Failed to create webhook for ${owner}/${repo}: ${createRes.status} ${await createRes.text()}`
    );
  }

  const created = (await createRes.json()) as { id: number };
  return { webhookId: created.id, alreadyExisted: false };
}
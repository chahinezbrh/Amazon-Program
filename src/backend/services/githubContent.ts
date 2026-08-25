import { Octokit } from '@octokit/rest'; // npm install @octokit/rest

export function parseOwnerRepo(repoUrl: string): { owner: string; repo: string } {
  const clean = repoUrl.replace(/\.git$/, '').replace(/\/$/, '');
  const parts = clean.split('/');
  return { owner: parts[parts.length - 2], repo: parts[parts.length - 1] };
}

export async function fetchFileAtRef(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<string | null> {
  try {
    const res = await octokit.repos.getContent({ owner, repo, path, ref });
    if ('content' in res.data && typeof res.data.content === 'string') {
      return Buffer.from(res.data.content, 'base64').toString('utf-8');
    }
    return null;
  } catch (err: any) {
    if (err.status === 404) return null; // file added or removed
    throw err;
  }
}
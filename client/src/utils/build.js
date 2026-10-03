/* global __BUILD_COMMIT__, __BUILD_TIME__ */

/** The commit this website build was made from, and when it was committed (set by vite.config.js). */
export const BUILD = {
  commit: typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : '',
  time: typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '',
};

/** The public repository releases are made from. */
export const REPO = 'maepigeon/webpost.ing';

/**
 * Compares a build with the repository's main branch, from GitHub's public
 * API (no sign-in; nothing about the site or its visitors is sent).
 * Resolves to { behind, latest: { sha, message, date } }, where `behind` is
 * how many commits main is ahead of the build (0 when up to date, null when
 * the build's commit isn't known to GitHub).
 */
export async function compareWithMain(commit, fetcher = fetch) {
  const api = `https://api.github.com/repos/${REPO}`;
  const json = async (url) => {
    const r = await fetcher(url, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
    return r.json();
  };
  const head = await json(`${api}/commits/main`);
  const latest = {
    sha: head.sha,
    message: String(head.commit?.message || '').split('\n')[0],
    date: head.commit?.committer?.date || '',
  };
  if (!commit) return { behind: null, latest };
  if (head.sha === commit) return { behind: 0, latest };
  try {
    const diff = await json(`${api}/compare/${commit}...main`);
    return { behind: diff.ahead_by, latest };
  } catch {
    return { behind: null, latest };
  }
}

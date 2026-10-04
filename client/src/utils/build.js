/* global __BUILD_COMMIT__, __BUILD_TIME__ */
import axios from 'axios';
import { BASE_URL } from '../config.js';

/** The commit this website build was made from, and when it was committed (set by vite.config.js). */
export const BUILD = {
  commit: typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : '',
  time: typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '',
};

/**
 * Asks this site's own server how far the repository's main branch is ahead of
 * a build. The repository is private, so the server asks GitHub with its own
 * token; the browser never talks to GitHub. Resolves to
 *   { available: false }  (no token set on the server, or GitHub unreachable), or
 *   { available: true, repo, behind, latest: { sha, message, date } }
 * where `behind` is how many commits main is ahead of the build (0 when up to
 * date, null when the build's commit isn't known to GitHub).
 */
export async function fetchLatestBuild(commit, http = axios) {
  const r = await http.get(`${BASE_URL}/api/admin/build/latest`, {
    params: { commit: commit || '' },
    withCredentials: true,
  });
  return r.data;
}

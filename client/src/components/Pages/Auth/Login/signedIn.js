import { ADMIN_GET_STATUS } from '../../Posts/BasicTextPostServerApi.js';

/**
 * Notes in this browser who is signed in, once the server has set the session
 * cookies. The cookies are the session; this is only what the pages read to
 * decide what to show.
 */
export async function rememberSignIn(username) {
  localStorage.setItem('userName', username);
  try {
    const d = await ADMIN_GET_STATUS();
    localStorage.setItem('isAdmin', d.isAdmin ? '1' : '0');
  } catch {
    localStorage.setItem('isAdmin', '0');
  }
}

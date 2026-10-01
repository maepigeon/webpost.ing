import axios from 'axios';
import { BASE_URL as baseUrl } from '../../../config.js';

/**
 * Request config for endpoints that return a raw string body (text/plain).
 *
 * Several endpoints (background pattern, bio) return text/plain whose *content*
 * can itself look like JSON — the v2 wallpaper format is a JSON object, and a
 * bio can begin with "{". Axios sniffs the body and silently JSON.parses
 * anything that looks like JSON, handing callers an object where they expect a
 * string. The identity `transformResponse` disables that sniffing so
 * `response.data` is always the exact bytes the server sent.
 */
const TEXT_GET = { withCredentials: true, transformResponse: [(d) => d] };


//delete
export function DELETE_POST(id) {
  const promise = axios.delete(baseUrl + "/api/posts/" + id);
  const dataPromise = promise.then((response) => response.data);
  return dataPromise;
}

/**
 * Confirms the session is still alive.
 *
 * Resolves to the username, or rejects with a 401 that the interceptor in
 * utils/session.js turns into a sign-out. This used to inspect the response
 * body for emptiness and call window.location.reload() — a reload rather than a
 * redirect, so a user whose session had died was bounced back to the same page
 * still looking signed out.
 */
/**
 * Asks the server whether the session is still good. A 401 makes the axios
 * interceptor sign the user out, which is what this is for.
 *
 * One request serves every caller for 30 seconds: the navbar and the profile
 * page call this on every render, and a single profile load used to send it
 * eleven times. A failed check is not reused, so the next caller asks again.
 */
let sessionCheck = null;
let sessionCheckedAt = 0;
const SESSION_CHECK_MS = 30_000;

export function AUTHORIZE_SESSION() {
  const now = Date.now();
  if (sessionCheck && now - sessionCheckedAt < SESSION_CHECK_MS) return sessionCheck;
  sessionCheckedAt = now;
  const check = axios.post(baseUrl + "/api/authorizeSession").then((response) => response.data);
  // Handled here, so a caller that ignores the result never leaves an
  // unhandled rejection behind.
  check.catch(() => { if (sessionCheck === check) sessionCheck = null; });
  sessionCheck = check;
  return check;
};

//get posts created by a specified user
export function READ_POSTS_BY_USER(username, limit = 20, offset = 0) {
  return axios.get(baseUrl + `/api/user/${username}`, { params: { limit, offset }, withCredentials: true })
    .then(r => r.data);
};


const asJson = { headers: { 'Content-Type': 'application/json' }, withCredentials: true };

// ── Pixel font libraries ─────────────────────────────────────────────────────

const fontsUrl = (username) => baseUrl + `/api/users/${encodeURIComponent(username)}/fonts`;

/** [{id, name, glyphs}] */
export function GET_PIXEL_FONTS(username) {
  return axios.get(fontsUrl(username)).then(r => r.data);
}
export function CREATE_PIXEL_FONT(username, name, glyphs) {
  return axios.post(fontsUrl(username), JSON.stringify({ name, glyphs }), asJson).then(r => r.data);
}
export function UPDATE_PIXEL_FONT(username, id, name, glyphs) {
  return axios.put(`${fontsUrl(username)}/${id}`, JSON.stringify({ name, glyphs }), asJson).then(r => r.data);
}
export function DELETE_PIXEL_FONT(username, id) {
  return axios.delete(`${fontsUrl(username)}/${id}`, { withCredentials: true });
}

/** A user's page theme: {theme: {...}} or {theme: null} for Newspaper Life. */
export function GET_PAGE_THEME(username) {
  return axios.get(baseUrl + `/api/users/${encodeURIComponent(username)}/theme`).then(r => r.data);
}

/** A post's own theme: {theme: {...}} or {theme: null} for the site default. */
export function GET_POST_THEME(postId) {
  return axios.get(baseUrl + `/api/posts/${postId}/theme`, { withCredentials: true }).then(r => r.data);
}

/** Saves a post's theme (its author only); null for the site default. */
export function SET_POST_THEME(postId, theme) {
  return axios.put(baseUrl + `/api/posts/${postId}/theme`, { theme }, { withCredentials: true }).then(r => r.data);
}

/** Saves the signed-in user's page theme; pass null to go back to Newspaper Life. */
export function SET_PAGE_THEME(username, theme) {
  return axios.put(baseUrl + `/api/users/${encodeURIComponent(username)}/theme`, { theme }, { withCredentials: true })
    .then(r => r.data);
}

/** Finds a post from the segment after its author's name: an id or a slug. */
export function RESOLVE_POST(username, segment) {
  return axios.get(baseUrl + `/api/users/${encodeURIComponent(username)}/resolve/${encodeURIComponent(segment)}`)
    .then(r => r.data);
}

//get a post by its id in the database
export function READ_POST(id) {
  const promise = axios.get(baseUrl + "/api/posts/" + id + "");
  const dataPromise = promise.then((response) => response.data);
  return dataPromise;
}
//get a post by its id in the database
export function GET_USER_FROM_POST(id) {
  return axios.get(baseUrl + "/api/UserFromPostID/" + id + "")
    .then((response) => response.data);
}


//create
export function CREATE_POST(id, titleField, descriptionField, publishedField, backgroundPattern, folder, slug) {
  if (titleField == "undefined") {titleField = "Undefined title";}
  const promise = axios.post(baseUrl + "/api/posts",
  {
    id: id,
    title: titleField,
    description: descriptionField,
    published: publishedField,
    backgroundPattern: backgroundPattern || null,
    folder: folder || null,
    slug: slug || null,
  }, { withCredentials: true });
  const dataPromise = promise.then((response) => response.data);
  return dataPromise;
}
//update
export function UPDATE_POST(id, titleField, descriptionField, publishedField, backgroundPattern, folder, slug) {
  const promise = axios.put(baseUrl + "/api/posts/" + id,
  {
      id: id,
      title: titleField,
      description: descriptionField,
      published: publishedField,
      backgroundPattern: backgroundPattern || null,
      folder: folder || null,
      slug: slug || null,
  }, { withCredentials: true });
  const dataPromise = promise.then((response) => response.data);
  return dataPromise;
}

export function GET_USER_BACKGROUND(username) {
  return axios.get(baseUrl + "/api/users/" + username + "/background", TEXT_GET)
    .then((response) => response.data);
}

export function UPDATE_USER_BACKGROUND(username, pattern) {
  return axios.put(baseUrl + "/api/users/" + username + "/background", pattern, {
    headers: { 'Content-Type': 'text/plain' },
    withCredentials: true,
  }).then((response) => response.data);
}

export function GET_USER_BIO(username) {
  return axios.get(baseUrl + "/api/users/" + username + "/bio", TEXT_GET)
    .then((response) => response.data);
}

export function UPDATE_USER_BIO(username, bio) {
  return axios.put(baseUrl + "/api/users/" + username + "/bio", bio, {
    headers: { 'Content-Type': 'text/plain' },
    withCredentials: true,
  }).then((response) => response.data);
}

export function GET_USER_BIO_LINKS(username) {
  return axios.get(baseUrl + "/api/users/" + username + "/bio-links", { withCredentials: true })
    .then((response) => response.data);
}

export function UPDATE_USER_BIO_LINKS(username, links) {
  return axios.put(baseUrl + "/api/users/" + username + "/bio-links", JSON.stringify(links), {
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true,
  }).then((response) => response.data);
}

export function GET_USER_STORAGE(username) {
  return axios.get(baseUrl + "/api/users/" + username + "/storage", { withCredentials: true })
    .then((response) => response.data);
}

export function GET_TOTAL_STORAGE() {
  return axios.get(baseUrl + "/api/admin/storage", { withCredentials: true })
    .then((response) => response.data);
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export function ADMIN_GET_STATUS() {
  return axios.get(baseUrl + `/api/admin/me`, { withCredentials: true }).then(r => r.data);
}

export function ADMIN_LIST_USERS() {
  return axios.get(baseUrl + `/api/admin/users`, { withCredentials: true }).then(r => r.data);
}

export function ADMIN_CREATE_USER(username, password) {
  return axios.post(baseUrl + `/api/admin/users`, { username, password }, { withCredentials: true }).then(r => r.data);
}

export function ADMIN_DELETE_USER(username) {
  return axios.delete(baseUrl + `/api/admin/users/${username}`, { withCredentials: true }).then(r => r.data);
}

export function ADMIN_SET_ADMIN(username, isAdmin) {
  return axios.put(baseUrl + `/api/admin/users/${username}/admin`, { isAdmin }, { withCredentials: true }).then(r => r.data);
}

export function ADMIN_SET_ROLE(username, role) {
  return axios.put(baseUrl + `/api/admin/users/${username}/role`, { role }, { withCredentials: true }).then(r => r.data);
}

export function ADMIN_GET_STATS() {
  return axios.get(baseUrl + `/api/admin/stats`, { withCredentials: true }).then(r => r.data);
}

export function ADMIN_GET_ROLE_LIMITS() {
  return axios.get(baseUrl + `/api/admin/role-limits`, { withCredentials: true }).then(r => r.data);
}

export function ADMIN_SET_ROLE_LIMIT(role, maxStorageBytes, maxPostsPerDay) {
  return axios.put(baseUrl + `/api/admin/role-limits/${role}`, { maxStorageBytes, maxPostsPerDay }, { withCredentials: true }).then(r => r.data);
}

export function ADMIN_GET_FLAGGED() {
  return axios.get(baseUrl + `/api/admin/flagged`, { withCredentials: true }).then(r => r.data);
}

export function ADMIN_CLEANUP_ORPHANS() {
  return axios.delete(baseUrl + `/api/admin/uploads/orphans`, { withCredentials: true }).then(r => r.data);
}

// ── Social: post feature flags ────────────────────────────────────────────────

export function GET_POST_FEATURES(postId) {
  return axios.get(baseUrl + `/api/posts/${postId}/features`, { withCredentials: true })
    .then(r => r.data);
}

export function SET_REACTIONS_ENABLED(postId, enabled) {
  return axios.put(baseUrl + `/api/posts/${postId}/reactions/enabled`, { enabled }, { withCredentials: true })
    .then(r => r.data);
}

export function SET_VOTES_ENABLED(postId, enabled) {
  return axios.put(baseUrl + `/api/posts/${postId}/votes/enabled`, { enabled }, { withCredentials: true })
    .then(r => r.data);
}

// ── Social: reactions ─────────────────────────────────────────────────────────

export function GET_REACTIONS(postId) {
  return axios.get(baseUrl + `/api/posts/${postId}/reactions`, { withCredentials: true })
    .then(r => r.data);
}

export function SET_REACTION(postId, reaction) {
  return axios.post(baseUrl + `/api/posts/${postId}/reactions`, { reaction }, { withCredentials: true })
    .then(r => r.data);
}

export function REMOVE_REACTION(postId) {
  return axios.delete(baseUrl + `/api/posts/${postId}/reactions`, { withCredentials: true })
    .then(r => r.data);
}

// ── Social: follows ───────────────────────────────────────────────────────────

export function GET_FOLLOW_STATUS(username) {
  return axios.get(baseUrl + `/api/users/${username}/follow`, { withCredentials: true })
    .then(r => r.data);
}

export function FOLLOW_USER(username) {
  return axios.post(baseUrl + `/api/users/${username}/follow`, {}, { withCredentials: true })
    .then(r => r.data);
}

export function UNFOLLOW_USER(username) {
  return axios.delete(baseUrl + `/api/users/${username}/follow`, { withCredentials: true })
    .then(r => r.data);
}

export function GET_FOLLOWERS(username) {
  return axios.get(baseUrl + `/api/users/${username}/followers`, { withCredentials: true })
    .then(r => r.data);
}

export function GET_FOLLOWING(username) {
  return axios.get(baseUrl + `/api/users/${username}/following`, { withCredentials: true })
    .then(r => r.data);
}

export function GET_BLOCK_MESSAGE_STATUS(username) {
  return axios.get(baseUrl + `/api/users/${username}/block-messages`, { withCredentials: true })
    .then(r => r.data);
}

export function BLOCK_MESSAGES(username) {
  return axios.post(baseUrl + `/api/users/${username}/block-messages`, {}, { withCredentials: true })
    .then(r => r.data);
}

export function UNBLOCK_MESSAGES(username) {
  return axios.delete(baseUrl + `/api/users/${username}/block-messages`, { withCredentials: true })
    .then(r => r.data);
}

// ── Social: discussions & comments ───────────────────────────────────────────

export function GET_DISCUSSION_STATUS(postId) {
  return axios.get(baseUrl + `/api/posts/${postId}/discussion`, { withCredentials: true })
    .then(r => r.data);
}

export function SET_DISCUSSION_ENABLED(postId, enabled) {
  return axios.put(baseUrl + `/api/posts/${postId}/discussion`, { enabled }, { withCredentials: true })
    .then(r => r.data);
}

export function SET_DISCUSSION_STYLE(postId, style) {
  return axios.put(baseUrl + `/api/posts/${postId}/discussion/style`, { style }, { withCredentials: true })
    .then(r => r.data);
}

export function GET_COMMENTS(postId, sort = 'recent') {
  return axios.get(baseUrl + `/api/posts/${postId}/comments`, { params: { sort }, withCredentials: true })
    .then(r => r.data);
}

export function ADD_COMMENT(postId, content, parentId = null) {
  return axios.post(baseUrl + `/api/posts/${postId}/comments`, { content, parentId }, { withCredentials: true })
    .then(r => r.data);
}

export function EDIT_COMMENT(commentId, content) {
  return axios.put(baseUrl + `/api/comments/${commentId}`, { content }, { withCredentials: true })
    .then(r => r.data);
}

export function DELETE_COMMENT(commentId) {
  return axios.delete(baseUrl + `/api/comments/${commentId}`, { withCredentials: true })
    .then(r => r.data);
}

export function VOTE_COMMENT(commentId, vote) {
  return axios.post(baseUrl + `/api/comments/${commentId}/vote`, { vote }, { withCredentials: true })
    .then(r => r.data);
}

export function SET_COMMENT_REACTION(commentId, reaction) {
  return axios.post(baseUrl + `/api/comments/${commentId}/reactions`, { reaction }, { withCredentials: true })
    .then(r => r.data);
}

export function REMOVE_COMMENT_REACTION(commentId) {
  return axios.delete(baseUrl + `/api/comments/${commentId}/reactions`, { withCredentials: true })
    .then(r => r.data);
}

// ── Social: notifications ─────────────────────────────────────────────────────

export function GET_NOTIFICATIONS(limit = 30, offset = 0) {
  return axios.get(baseUrl + `/api/notifications`, { params: { limit, offset }, withCredentials: true })
    .then(r => r.data);
}

export function GET_UNREAD_COUNT() {
  return axios.get(baseUrl + `/api/notifications/unread-count`, { withCredentials: true })
    .then(r => r.data);
}

export function MARK_NOTIFICATION_READ(id) {
  return axios.put(baseUrl + `/api/notifications/${id}/read`, {}, { withCredentials: true })
    .then(r => r.data);
}

export function MARK_ALL_READ() {
  return axios.put(baseUrl + `/api/notifications/read-all`, {}, { withCredentials: true })
    .then(r => r.data);
}

export function DELETE_NOTIFICATION(id) {
  return axios.delete(baseUrl + `/api/notifications/${id}`, { withCredentials: true })
    .then(r => r.data);
}

export function CLEAR_NOTIFICATIONS() {
  return axios.delete(baseUrl + `/api/notifications`, { withCredentials: true })
    .then(r => r.data);
}

export function SEND_MESSAGE(username, message) {
  return axios.post(baseUrl + `/api/users/${username}/message`, { message }, { withCredentials: true })
    .then(r => r.data);
}

export function DELETE_ACCOUNT(username) {
  return axios.delete(baseUrl + `/api/users/${username}`, { withCredentials: true })
    .then(r => r.data);
}

// ── Pinned posts ──────────────────────────────────────────────────────────────

export function GET_PINNED_POST(username) {
  // 204 (nothing pinned) has an empty body: null, not "".
  return axios.get(baseUrl + `/api/users/${username}/pinned-post`, { withCredentials: true })
    .then(r => r.data || null);
}

export function SET_PINNED_POST(username, postId) {
  return axios.put(baseUrl + `/api/users/${username}/pinned-post`, { postId }, { withCredentials: true })
    .then(r => r.data);
}

export function UNPIN_POST(username) {
  return axios.delete(baseUrl + `/api/users/${username}/pinned-post`, { withCredentials: true })
    .then(r => r.data);
}

// ── Search ────────────────────────────────────────────────────────────────────

export function SEARCH_USERS(q) {
  return axios.get(baseUrl + `/api/search/users`, { params: { q }, withCredentials: true })
    .then(r => r.data);
}

/** Search published posts by title/content. Optional from=username filters to one author. */
export function SEARCH_POSTS(q, from) {
  const params = { q };
  if (from) params.from = from;
  return axios.get(baseUrl + `/api/search/posts`, { params, withCredentials: true })
    .then(r => r.data);
}

// ── Follow counts ─────────────────────────────────────────────────────────────

export function GET_FOLLOW_COUNTS(username) {
  return axios.get(baseUrl + `/api/users/${username}/follow-counts`, { withCredentials: true })
    .then(r => r.data);
}

// ── Activity ──────────────────────────────────────────────────────────────────

export function GET_USER_ACTIVITY(username) {
  return axios.get(baseUrl + `/api/users/${username}/activity`, { withCredentials: true })
    .then(r => r.data);
}

// ── Data export / import ──────────────────────────────────────────────────────

/** Triggers a download of the user's full data export JSON. */
export async function EXPORT_MY_DATA(username) {
  const resp = await axios.get(baseUrl + `/api/users/${username}/export`, {
    withCredentials: true,
    responseType: 'blob',
  });
  const url = URL.createObjectURL(new Blob([resp.data], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${username}_data.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Admin: download any user's data export. */
export async function ADMIN_EXPORT_USER(targetUsername) {
  const resp = await axios.get(baseUrl + `/api/admin/users/${targetUsername}/export`, {
    withCredentials: true,
    responseType: 'blob',
  });
  const url = URL.createObjectURL(new Blob([resp.data], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${targetUsername}_data.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Admin: restore a user's data from a previously exported JSON file. */
export function ADMIN_IMPORT_USER(targetUsername, exportJsonString) {
  const parsed = JSON.parse(exportJsonString);
  return axios.post(baseUrl + `/api/admin/users/${targetUsername}/import`, parsed, {
    withCredentials: true,
    headers: { 'Content-Type': 'application/json' },
  }).then(r => r.data);
}

// ── Admin: security ───────────────────────────────────────────────────────────

export function ADMIN_CHANGE_PASSWORD(targetUsername, newPassword) {
  return axios.put(baseUrl + `/api/admin/users/${targetUsername}/password`,
    { newPassword }, { withCredentials: true }).then(r => r.data);
}

export function ADMIN_GET_INVITE_CODES() {
  return axios.get(baseUrl + '/api/admin/invite-codes', { withCredentials: true }).then(r => r.data);
}

export function ADMIN_CREATE_INVITE_CODE() {
  return axios.post(baseUrl + '/api/admin/invite-codes', {}, { withCredentials: true }).then(r => r.data);
}

export function ADMIN_DELETE_INVITE_CODE(code) {
  return axios.delete(baseUrl + `/api/admin/invite-codes/${encodeURIComponent(code)}`,
    { withCredentials: true }).then(r => r.data);
}

// ── Conversations ─────────────────────────────────────────────────────────────

export function GET_CONVERSATIONS() {
  return axios.get(baseUrl + '/api/conversations', { withCredentials: true }).then(r => r.data);
}

export function GET_OR_CREATE_CONVERSATION(username) {
  return axios.post(baseUrl + `/api/users/${username}/conversation`, {},
    { withCredentials: true }).then(r => r.data);
}

export function GET_CONVERSATION_MESSAGES(id, limit = 50, offset = 0) {
  return axios.get(baseUrl + `/api/conversations/${id}/messages`,
    { params: { limit, offset }, withCredentials: true }).then(r => r.data);
}

export function SEND_CONVERSATION_MESSAGE(id, content) {
  return axios.post(baseUrl + `/api/conversations/${id}/messages`,
    { content }, { withCredentials: true }).then(r => r.data);
}

export function MARK_CONVERSATION_READ(id) {
  return axios.put(baseUrl + `/api/conversations/${id}/messages/read`, {},
    { withCredentials: true }).then(r => r.data);
}

export function GET_UNREAD_MESSAGE_COUNT() {
  return axios.get(baseUrl + '/api/conversations/unread-count',
    { withCredentials: true }).then(r => r.data);
}

// ── Post views ────────────────────────────────────────────────────────────────

export function RECORD_POST_VIEW(postId) {
  return axios.post(baseUrl + `/api/posts/${postId}/view`, {},
    { withCredentials: true }).then(r => r.data).catch(() => {});
}

export function GET_POST_VIEWS(postId) {
  return axios.get(baseUrl + `/api/posts/${postId}/views`).then(r => r.data);
}

export function GET_POST_VOTE(postId) {
  return axios.get(baseUrl + `/api/posts/${postId}/vote`, { withCredentials: true }).then(r => r.data);
}

export function VOTE_POST(postId, vote) {
  return axios.post(baseUrl + `/api/posts/${postId}/vote`, { vote },
    { withCredentials: true }).then(r => r.data);
}

// ── Avatars ───────────────────────────────────────────────────────────────────

export function GET_USER_AVATAR(username) {
  return axios.get(baseUrl + `/api/users/${username}/avatar`).then(r => r.data);
}

export function POST_USER_AVATAR(username, formData) {
  return axios.post(baseUrl + `/api/users/${username}/avatar`, formData,
    { withCredentials: true }).then(r => r.data);
}

// ── Online indicator ──────────────────────────────────────────────────────────

export function SEND_HEARTBEAT(username) {
  return axios.post(baseUrl + `/api/users/${username}/heartbeat`, {},
    { withCredentials: true }).then(r => r.data).catch(() => {});
}

export function GET_USER_ONLINE(username) {
  return axios.get(baseUrl + `/api/users/${username}/online`).then(r => r.data);
}

// ── Hashtags ──────────────────────────────────────────────────────────────────

export function GET_HASHTAG_POSTS(tag) {
  return axios.get(baseUrl + `/api/hashtags/${encodeURIComponent(tag)}/posts`).then(r => r.data);
}

export function GET_HASHTAG_SUGGESTIONS(q) {
  return axios.get(baseUrl + `/api/hashtags/suggest`, { params: { q } }).then(r => r.data);
}

// ── Admin system settings ─────────────────────────────────────────────────────

export function ADMIN_GET_SETTINGS() {
  return axios.get(baseUrl + '/api/admin/settings', { withCredentials: true }).then(r => r.data);
}

export function ADMIN_UPDATE_SETTING(key, value) {
  return axios.put(baseUrl + `/api/admin/settings/${encodeURIComponent(key)}`,
    { value: String(value) }, { withCredentials: true }).then(r => r.data);
}

export function GET_RECENTLY_ACTIVE_USERS() {
  return axios.get(baseUrl + '/api/users/recently-active').then(r => r.data);
}

// ── DM reactions ──────────────────────────────────────────────────────────────

export function TOGGLE_DM_REACTION(convId, msgId, reaction) {
  return axios.post(baseUrl + `/api/conversations/${convId}/messages/${msgId}/reactions`,
    { reaction }, { withCredentials: true }).then(r => r.data);
}

export function GET_CONV_REACTIONS(convId) {
  return axios.get(baseUrl + `/api/conversations/${convId}/reactions`,
    { withCredentials: true }).then(r => r.data);
}

// ── Group conversations ───────────────────────────────────────────────────────

export function GET_GROUPS() {
  return axios.get(baseUrl + '/api/groups', { withCredentials: true }).then(r => r.data);
}

export function CREATE_GROUP(name, members) {
  return axios.post(baseUrl + '/api/groups', { name, members }, { withCredentials: true }).then(r => r.data);
}

export function GET_GROUP_MESSAGES(groupId, limit = 50, offset = 0) {
  return axios.get(baseUrl + `/api/groups/${groupId}/messages`,
    { params: { limit, offset }, withCredentials: true }).then(r => r.data);
}

export function SEND_GROUP_MESSAGE(groupId, content) {
  return axios.post(baseUrl + `/api/groups/${groupId}/messages`,
    { content }, { withCredentials: true }).then(r => r.data);
}

export function MARK_GROUP_READ(groupId) {
  return axios.put(baseUrl + `/api/groups/${groupId}/messages/read`,
    {}, { withCredentials: true }).then(r => r.data);
}

export function GET_GROUP_MEMBERS(groupId) {
  return axios.get(baseUrl + `/api/groups/${groupId}/members`,
    { withCredentials: true }).then(r => r.data);
}

export function ADD_GROUP_MEMBER(groupId, username) {
  return axios.post(baseUrl + `/api/groups/${groupId}/members`,
    { username }, { withCredentials: true }).then(r => r.data);
}

export function REMOVE_GROUP_MEMBER(groupId, username) {
  return axios.delete(baseUrl + `/api/groups/${groupId}/members/${encodeURIComponent(username)}`,
    { withCredentials: true }).then(r => r.data);
}

export function RENAME_GROUP(groupId, name) {
  return axios.put(baseUrl + `/api/groups/${groupId}`,
    { name }, { withCredentials: true }).then(r => r.data);
}

export function TOGGLE_GROUP_REACTION(groupId, msgId, reaction) {
  return axios.post(baseUrl + `/api/groups/${groupId}/messages/${msgId}/reactions`,
    { reaction }, { withCredentials: true }).then(r => r.data);
}

export function GET_GROUP_REACTIONS(groupId) {
  return axios.get(baseUrl + `/api/groups/${groupId}/reactions`,
    { withCredentials: true }).then(r => r.data);
}

export function TRANSFER_GROUP_OWNERSHIP(groupId, username) {
  return axios.put(baseUrl + `/api/groups/${groupId}/owner`,
    { username }, { withCredentials: true }).then(r => r.data);
}

// ── Post ordering ─────────────────────────────────────────────────────────────

export function UPDATE_POST_ORDER(username, updates) {
  return axios.put(baseUrl + `/api/users/${username}/posts/order`,
    { updates }, { withCredentials: true }).then(r => r.data);
}

// ── Settings, email verification, and password reset ──────────────────────────
// The whole email feature is optional: GET_SETTINGS reports mailEnabled so the
// UI can say so plainly rather than offering a verification that cannot happen.

export function GET_SETTINGS(username) {
  return axios.get(baseUrl + "/api/users/" + username + "/settings", { withCredentials: true })
    .then(r => r.data);
}

export function UPDATE_EMAIL_PREFERENCES(username, prefs) {
  return axios.put(baseUrl + "/api/users/" + username + "/settings/preferences", prefs, {
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true,
  }).then(r => r.data);
}

export function UPDATE_EMAIL_ADDRESS(username, email) {
  return axios.put(baseUrl + "/api/users/" + username + "/settings/email", { email }, {
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true,
  }).then(r => r.data);
}

export function RESEND_VERIFICATION(username) {
  return axios.post(baseUrl + "/api/users/" + username + "/settings/email/resend", {}, {
    withCredentials: true,
  }).then(r => r.data);
}

// Public — opened from a link in an email, where there may be no session.
export function VERIFY_EMAIL(token) {
  return axios.post(baseUrl + "/api/email/verify", { token },
    { headers: { 'Content-Type': 'application/json' } }).then(r => r.data);
}

export function UNSUBSCRIBE_EMAIL(token, category) {
  return axios.post(baseUrl + "/api/email/unsubscribe", { token, category },
    { headers: { 'Content-Type': 'application/json' } }).then(r => r.data);
}

export function FORGOT_PASSWORD(email) {
  return axios.post(baseUrl + "/api/password/forgot", { email },
    { headers: { 'Content-Type': 'application/json' } }).then(r => r.data);
}

export function RESET_PASSWORD(token, password) {
  return axios.post(baseUrl + "/api/password/reset", { token, password },
    { headers: { 'Content-Type': 'application/json' } }).then(r => r.data);
}

// ── Post reports ──────────────────────────────────────────────────────────────

export function REPORT_POST(postId, reason, details) {
  return axios.post(baseUrl + "/api/posts/" + postId + "/report", { reason, details }, {
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true,
  }).then(r => r.data);
}

export function ADMIN_GET_REPORTS(status = 'open') {
  return axios.get(baseUrl + "/api/admin/reports?status=" + encodeURIComponent(status), {
    withCredentials: true,
  }).then(r => r.data);
}

export function ADMIN_UPDATE_REPORT(reportId, status) {
  return axios.put(baseUrl + "/api/admin/reports/" + reportId, { status }, {
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true,
  }).then(r => r.data);
}

export function UPDATE_SITE_BACKGROUND(username, background) {
  return axios.put(baseUrl + "/api/users/" + username + "/settings/site-background",
    { background: background || '' },
    { headers: { 'Content-Type': 'application/json' }, withCredentials: true },
  ).then(r => r.data);
}

// ── Profile header image ──────────────────────────────────────────────────────

export function GET_PROFILE_HEADER(username) {
  return axios.get(baseUrl + "/api/users/" + username + "/header", { withCredentials: true })
    .then(r => r.data);
}

export function UPLOAD_PROFILE_HEADER(username, file) {
  const form = new FormData();
  form.append('file', file);
  // Content-Type is left unset so the browser adds the multipart boundary.
  return axios.post(baseUrl + "/api/users/" + username + "/header", form, { withCredentials: true })
    .then(r => r.data);
}

export function UPDATE_PROFILE_HEADER(username, body) {
  return axios.put(baseUrl + "/api/users/" + username + "/header", body, {
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true,
  }).then(r => r.data);
}

export function UPDATE_CODE_DISPLAY(username, prefs) {
  return axios.put(baseUrl + "/api/users/" + username + "/settings/code-display", prefs, {
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true,
  }).then(r => r.data);
}

/** The signed-in user's own uploaded images, for the "choose an existing one" picker. */
export function LIST_MY_UPLOADS(limit = 60) {
  return axios.get(baseUrl + "/api/uploads/mine?limit=" + limit, { withCredentials: true })
    .then(r => r.data);
}

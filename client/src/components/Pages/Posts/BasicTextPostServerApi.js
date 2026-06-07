import axios from 'axios';
import { BASE_URL as baseUrl } from '../../../config.js';


//delete
export function DELETE_POST(id) {
  console.log("deleting post with id: " + id)
  const promise = axios.delete(baseUrl + "/api/posts/" + id);
  const dataPromise = promise.then((response) => response.data);
  return dataPromise;
}

export function AUTHORIZE_SESSION() {
  console.log("attempting to authorize session");
  const promise = axios.post(baseUrl + "/api/authorizeSession");
  const dataPromise = promise.then((response) => response.data);
  promise.then((response) => {
    if (response.data == null || response.data == "") {
      console.log("Session is NOT authorized.");
      localStorage.removeItem("userName");
      window.location.reload();
    } else {
      console.log("Session is authorized: " + response.data)
    }
  });
  return dataPromise;
};

// Gets a list of all users, including user name, user id, and account creation date
export function GET_ALL_USERS() {
  const promise = axios.get(baseUrl + "/api/getAllUsers");
  console.log("reading all posts");

  const dataPromise = promise.then(
    (response) => {
    console.log(response);
    return response.data
    });
  return dataPromise;
}


//get posts created by a specified user
export function READ_POSTS_BY_USER(username) {
  const promise = axios.get(baseUrl + "/api/user/" + username + "");
  const dataPromise = promise.then((response) => response.data);
  console.log("reading all posts");
  return dataPromise;
};


//read
export function READ_POSTS() {
  const promise = axios.get(baseUrl + "/api/posts");
  const dataPromise = promise.then((response) => response.data);
  console.log("reading all posts");
  return dataPromise;
};

//get a post by its id in the database
export function READ_POST(id) {
  const promise = axios.get(baseUrl + "/api/posts/" + id + "");
  const dataPromise = promise.then((response) => response.data);
  console.log("reading post " + id);
  return dataPromise;
}
//get a post by its id in the database
export function GET_USER_FROM_POST(id) {
  const promise = axios.get(baseUrl + "/api/UserFromPostID/" + id + "");
  const dataPromise = promise.then((response) => 
  {
    console.log("got user " + response + " from post id " + id);
    return response.data;
  });
  return dataPromise;
}


//create
export function CREATE_POST(id, titleField, descriptionField, publishedField, backgroundPattern) {
  console.log("creating a new post, title:" + titleField);
  if (titleField == "undefined") {titleField = "Undefined title";}
  const promise = axios.post(baseUrl + "/api/posts",
  {
    id: id,
    title: titleField,
    description: descriptionField,
    published: publishedField,
    backgroundPattern: backgroundPattern || null,
  }, { withCredentials: true });
  const dataPromise = promise.then((response) => response.data);
  console.log("created POST");
  return dataPromise;
}
//update
export function UPDATE_POST(id, titleField, descriptionField, publishedField, backgroundPattern) {
  console.log("updating post with id: " + id)
  const promise = axios.put(baseUrl + "/api/posts/" + id,
  {
      id: id,
      title: titleField,
      description: descriptionField,
      published: publishedField,
      backgroundPattern: backgroundPattern || null,
  }, { withCredentials: true });
  const dataPromise = promise.then((response) => response.data);
  return dataPromise;
}

export function GET_USER_BACKGROUND(username) {
  return axios.get(baseUrl + "/api/users/" + username + "/background", { withCredentials: true })
    .then((response) => response.data);
}

export function UPDATE_USER_BACKGROUND(username, pattern) {
  return axios.put(baseUrl + "/api/users/" + username + "/background", pattern, {
    headers: { 'Content-Type': 'text/plain' },
    withCredentials: true,
  }).then((response) => response.data);
}

export function GET_USER_BIO(username) {
  return axios.get(baseUrl + "/api/users/" + username + "/bio", { withCredentials: true })
    .then((response) => response.data);
}

export function UPDATE_USER_BIO(username, bio) {
  return axios.put(baseUrl + "/api/users/" + username + "/bio", bio, {
    headers: { 'Content-Type': 'text/plain' },
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

export function GET_NOTIFICATIONS(limit = 50) {
  return axios.get(baseUrl + `/api/notifications`, { params: { limit }, withCredentials: true })
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

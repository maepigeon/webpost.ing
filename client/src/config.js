import axios from 'axios';

export const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
// Host used to build uploaded image URLs (empty in prod = same origin; set to backend host in dev)
export const IMAGES_BASE_URL = import.meta.env.VITE_IMAGES_BASE_URL ?? "";

/**
 * Send the session cookies with every API request.
 *
 * The API authenticates with the `username` + `authToken` cookie pair, and a
 * cross-origin XHR omits cookies unless this is set. In production the SPA and
 * the API share an origin, so cookies ride along regardless and a call that
 * forgot `withCredentials: true` still worked — but in development the SPA is
 * on :5173 and the API on :8080, so the same call silently logged the user out.
 * That made a handful of endpoints (post create, update, delete, session check)
 * work in production and fail locally.
 *
 * Setting the default once here means no individual call site can forget it.
 * Every API module imports BASE_URL from this file, so this runs before the
 * first request is made.
 */
axios.defaults.withCredentials = true;

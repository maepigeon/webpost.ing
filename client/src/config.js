export const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
// Host used to build uploaded image URLs (empty in prod = same origin; set to backend host in dev)
export const IMAGES_BASE_URL = import.meta.env.VITE_IMAGES_BASE_URL ?? "";

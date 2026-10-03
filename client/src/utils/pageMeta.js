import { useEffect } from 'react';

// What search engines, link previews and AI readers pick up from the page head
// once the app has rendered. The same values are in index.html for pages the
// app has not rendered (the home page, a bare load).
const SITE = 'webpost.ing';
const DEFAULTS = {
  title: `${SITE} — Share your thoughts`,
  description: 'webpost.ing is a minimalist social blogging platform. Write posts, follow people, and share your ideas.',
  image: '/og-image.png',
};
const LD_ID = 'page-meta-jsonld';

function head(selector, make) {
  let el = document.head.querySelector(selector);
  if (!el) { el = make(); document.head.appendChild(el); }
  return el;
}

function metaTag(attr, name, content) {
  const el = head(`meta[${attr}="${name}"]`, () => {
    const m = document.createElement('meta');
    m.setAttribute(attr, name);
    return m;
  });
  el.setAttribute('content', content);
}

function absolute(path) {
  if (!path) return '';
  return /^https?:\/\//i.test(path) ? path : window.location.origin + (path.startsWith('/') ? path : `/${path}`);
}

/** One line, at most `max` characters, cut at a word. */
export function oneLine(text, max = 160) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.lastIndexOf(' ', max);
  return `${s.slice(0, cut > max / 2 ? cut : max).trim()}…`;
}

/** The first `max` characters of the text in a post's stored editor JSON; '' if it cannot be read. */
export function excerptFromContent(stored, max = 160) {
  let out = '';
  const walk = (node, depth) => {
    if (!node || depth > 24 || out.length > max * 2) return;
    if (node.type === 'text') { out += `${node.text || ''} `; return; }
    if (node.type === 'tilegrid' || node.type === 'image' || node.type === 'audio' || node.type === 'math') return;
    (node.children || []).forEach(c => walk(c, depth + 1));
    if (node.type === 'paragraph' || node.type === 'heading') out += ' ';
  };
  try { walk(JSON.parse(stored)?.root, 0); } catch { return ''; }
  return oneLine(out, max);
}

/**
 * Sets the head tags for the current page: description, canonical link,
 * Open Graph and Twitter card tags, and a JSON-LD block (one, replaced each time).
 *
 * @param type  'article' (a post), 'profile', or 'website' (default)
 * @param author, date  for an article's structured data
 */
export function setPageMeta({ title, description, canonicalPath, image, type = 'website', author, date } = {}) {
  const fullTitle = title ? `${title} — ${SITE}` : DEFAULTS.title;
  const desc = oneLine(description, 300) || DEFAULTS.description;
  const url = absolute(canonicalPath ?? window.location.pathname);
  const img = absolute(image || DEFAULTS.image);

  metaTag('name', 'description', desc);
  head('link[rel="canonical"]', () => {
    const l = document.createElement('link');
    l.setAttribute('rel', 'canonical');
    return l;
  }).setAttribute('href', url);

  metaTag('property', 'og:site_name', SITE);
  metaTag('property', 'og:type', type);
  metaTag('property', 'og:title', fullTitle);
  metaTag('property', 'og:description', desc);
  metaTag('property', 'og:url', url);
  metaTag('property', 'og:image', img);
  metaTag('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
  metaTag('name', 'twitter:title', fullTitle);
  metaTag('name', 'twitter:description', desc);
  metaTag('name', 'twitter:image', img);

  const ld = type === 'article'
    ? { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: title, description: desc, url,
        ...(author ? { author: { '@type': 'Person', name: author, url: absolute(`/${author}`) } } : {}),
        ...(date ? { datePublished: date } : {}),
        ...(image ? { image: img } : {}) }
    : type === 'profile'
      ? { '@context': 'https://schema.org', '@type': 'ProfilePage', url,
          mainEntity: { '@type': 'Person', name: title, description: desc, url,
            ...(image ? { image: img } : {}) } }
      : null;
  const old = document.getElementById(LD_ID);
  if (!ld) { old?.remove(); return; }
  const script = old || Object.assign(document.createElement('script'), { id: LD_ID, type: 'application/ld+json' });
  // "<" escaped so text inside the data cannot close the script element.
  script.textContent = JSON.stringify(ld).replace(/</g, '\\u003c');
  if (!old) document.head.appendChild(script);
}

/** Puts the head back to the site's own values. */
export function resetPageMeta() {
  setPageMeta({ canonicalPath: '/' });
}

/** Sets the page's meta while the component is shown, and resets it after. Pass null to leave it alone. */
export function usePageMeta(meta) {
  const key = meta ? JSON.stringify(meta) : '';
  useEffect(() => {
    if (!key) return undefined;
    setPageMeta(JSON.parse(key));
    return resetPageMeta;
  }, [key]);
}

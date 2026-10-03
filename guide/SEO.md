# SEO and AI indexing

## What exists

Server (`SeoController`, public, read-only, cached 5 minutes, only PUBLISHED posts):

- `/api/seo/sitemap.xml` — profiles with a published post, and published posts (max 5,000 URLs). Links use `APP_BASE_URL`.
- `/api/seo/robots.txt` — also a static copy in `client/public/robots.txt`.
- `/api/seo/llms.txt` — plain-text description of the site for AI crawlers.
- `/api/seo/feed/{username}.atom` — the 20 newest published posts.
- `/api/seo/page?path=/{username}` and `?path=/{username}/{slug-or-id}` — a small static HTML page with title, description, canonical, OpenGraph/Twitter tags, JSON-LD and the text of the post. Unknown or unpublished: 404.

Client: `utils/pageMeta.js` (`usePageMeta`) keeps description, canonical, OG/Twitter and JSON-LD current in the post viewer and profile page. `index.html` has the site defaults and a link to `llms.txt`.

Set `APP_BASE_URL` to the public address (`https://webpost.ing`), or sitemap and canonical links will point at localhost.

## Nginx (by hand; a release never edits nginx)

Without these, the endpoints still work at `/api/seo/...` (robots.txt names the sitemap there), but crawlers that look for `/sitemap.xml` and `/llms.txt`, and bots that do not run scripts, will not see the full benefit.

### a) Root-level sitemap and llms.txt

```nginx
location = /sitemap.xml { proxy_pass http://127.0.0.1:8080/api/seo/sitemap.xml; }
location = /llms.txt    { proxy_pass http://127.0.0.1:8080/api/seo/llms.txt; }
```

Use the same upstream address as the existing `location /api/` block. Add `location = /robots.txt { proxy_pass .../api/seo/robots.txt; }` only if you want the server copy instead of the static file.

### b) Plain HTML for crawlers and link previews

In the `http {}` block:

```nginx
map $http_user_agent $is_bot {
    default 0;
    ~*(Googlebot|bingbot|DuckDuckBot|GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-User|PerplexityBot|Applebot|facebookexternalhit|Twitterbot|Slackbot|Discordbot|LinkedInBot) 1;
}
```

In the `server {}` block, before the catch-all `location /`. This matches only `/{username}` and `/{username}/{slug-or-id}`; the first segment must not be a reserved route. Add any route you have that is not listed.

```nginx
location ~ ^/(?!(?:api|uploads|assets|fonts|editor|settings|messages|inbox|routes|static|public|admin|login|signup|search)(?:/|$))[^/]+(?:/[^/]+)?/?$ {
    if ($is_bot) { rewrite ^ /bot-page last; }
    try_files $uri /index.html;
}

location = /bot-page {
    internal;
    proxy_pass http://127.0.0.1:8080/api/seo/page?path=$request_uri;
}
```

Notes:

- `$request_uri` includes any query string; the server cuts at `?`. If the app also needs a `try_files` for static files, keep that line as it is in your current config.
- Test with `curl -A "Googlebot" https://webpost.ing/mae/some-post` (HTML page) and without `-A` (the normal app).
- This is not cloaking: bots get the same title, text, author and date that people see, as plain HTML instead of an app that needs scripts. Keep it that way; do not add text only for bots.
- Reload with `nginx -t && systemctl reload nginx`.

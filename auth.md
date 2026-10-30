# auth.md

This page tells an agent how to use Clipunder without guessing. It is self-contained on
purpose: there is no OAuth issuer here, because there is nothing to log in to.

## Summary

- **Authentication: none.** Every public resource on this site is readable without a key,
  token, cookie or account. There is no user system, no login endpoint and no user data.
- **Registration: not required, not possible.** There is no sign-up form.
- **Cookies: none set by this site.** No analytics, no advertising code at the time of
  writing.
- **Compression runs in the visitor's browser.** The site has no API that accepts a video
  file; uploading a file is not supported and never will be, because the entire point is
  that the file stays on the visitor's device.

## What an agent can read without credentials

| Resource | Method | URL |
| --- | --- | --- |
| Homepage, machine-readable Markdown | GET (Accept: text/markdown) | https://clipunder.com/ |
| About / Privacy / Contact | GET | https://clipunder.com/{about,privacy,contact} |
| Markdown mirrors | GET | https://clipunder.com/md/index.md et al. |
| Sitemap | GET | https://clipunder.com/sitemap.xml |
| Robots and content signals | GET | https://clipunder.com/robots.txt |
| AI catalog (ARD) | GET | https://clipunder.com/.well-known/ai-catalog.json |
| Agent skill artifact | GET | https://clipunder.com/skills/clipunder-video-compression/SKILL.md |
| Agent skill index | GET | https://clipunder.com/.well-known/agent-skills/index.json |
| Plain-language agent brief | GET | https://clipunder.com/llms.txt |

## Rate limits and etiquette

The site is served by Cloudflare Pages, which applies default per-IP protections against
abuse. Beyond that there is no published quota and no key to exhaust. Cache-friendly
behaviour is expected: send conditional requests, and do not poll the same URL more than
once a minute.

## What is deliberately absent

- No OAuth or OIDC discovery metadata: there is no authorization server to describe.
- No protected resources: nothing here returns 401.
- No MCP server, no A2A agent, no paid API. If any of these appear later, this file will
  describe them before they are announced.

## Contact

contact@clipunder.com

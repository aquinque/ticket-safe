#!/usr/bin/env bash
# Fetches event share links the way link-preview crawlers do and checks what they get:
# status 200, the event's og:/twitter: tags in the HTML, and an og:image that answers 200
# as image/jpeg or image/png. Exits non-zero on the first problem.
#
# Usage: scripts/check-link-previews.sh [site] [slug...]
#   site defaults to https://ticket-safe.eu; without slugs, every slug in sitemap.xml under /e/.
set -uo pipefail
SITE="${1:-https://ticket-safe.eu}"; shift || true
SLUGS=("$@")
if [ ${#SLUGS[@]} -eq 0 ]; then
  mapfile -t SLUGS < <(curl -fsSL "$SITE/og/slugs.txt" 2>/dev/null | sed '/^\s*$/d')
fi
if [ ${#SLUGS[@]} -eq 0 ]; then echo "No event slug to check."; exit 1; fi

AGENTS=(
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"
  "WhatsApp/2.23.20.0 A"
  "Twitterbot/1.0"
  "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)"
  "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)"
  "TelegramBot (like TwitterBot)"
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0"
)
fail=0
for slug in "${SLUGS[@]}"; do
  url="$SITE/e/$slug?ref=preview-check"
  echo "=== $url"
  for ua in "${AGENTS[@]}"; do
    body=$(mktemp)
    meta=$(curl -sS -L -A "$ua" -o "$body" -w '%{http_code} %{content_type} %{url_effective}' "$url") || meta="curl-error"
    code=${meta%% *}
    tags=$(grep -oE '<meta (property|name)="(og|twitter):[^"]+" content="[^"]*"' "$body" | wc -l)
    echo "[$code] $(printf '%-28.28s' "$ua") og/twitter tags: $tags  ($meta)"
    if [ "$code" != "200" ] || [ "$tags" -lt 12 ]; then fail=1; fi
    rm -f "$body"
  done
  body=$(mktemp)
  curl -sS -L -A "facebookexternalhit/1.1" -o "$body" "$url"
  grep -oE '<(title)>[^<]*</title>|<meta (property|name)="(og|twitter):[^"]+" content="[^"]*"|<link rel="canonical"[^>]*>' "$body" | sed 's/^/    /'
  img=$(grep -oE '<meta property="og:image" content="[^"]*"' "$body" | sed -E 's/.*content="([^"]*)".*/\1/' | head -1)
  rm -f "$body"
  if [ -z "$img" ]; then echo "  !! no og:image"; fail=1; continue; fi
  imeta=$(curl -sS -o /dev/null -A "facebookexternalhit/1.1" -w '%{http_code} %{content_type} %{size_download}' "$img") || imeta="curl-error"
  echo "  og:image $img -> $imeta"
  case "$imeta" in "200 image/jpeg"*|"200 image/png"*) ;; *) fail=1 ;; esac
done
exit $fail

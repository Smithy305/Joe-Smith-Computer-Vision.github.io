#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 \"Post Title\" [YYYY-MM-DD] [read_time_minutes]"
  exit 1
fi

TITLE="$1"
DATE="${2:-$(date +%F)}"
READ_TIME="${3:-6}"

SLUG=$(printf '%s' "$TITLE" \
  | tr '[:upper:]' '[:lower:]' \
  | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')

OUT="blog/posts/${DATE}-${SLUG}.html"

if [ -f "$OUT" ]; then
  echo "Post already exists: $OUT"
  exit 1
fi

DATE_HUMAN=$(date -j -f "%Y-%m-%d" "$DATE" "+%B %e, %Y" 2>/dev/null | sed 's/  / /g')
if [ -z "$DATE_HUMAN" ]; then
  DATE_HUMAN="$DATE"
fi

sed \
  -e "s/__TITLE__/${TITLE//\//\\\/}/g" \
  -e "s/__DATE_HUMAN__/${DATE_HUMAN//\//\\\/}/g" \
  -e "s/__READ_TIME__/${READ_TIME}/g" \
  blog/templates/post-template.html > "$OUT"

echo "Created $OUT"
echo "Next steps:"
echo "1) Fill in the post content in $OUT"
echo "2) Add a card link in blog/index.html"
echo "3) Optionally add a featured card in index.html#blog"

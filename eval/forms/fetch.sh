#!/bin/sh
# usage: fetch_forms.sh <list-file> <output-dir>
# list lines: id|origin|url[ url2 ...]   (extra urls are fallbacks; first valid PDF wins)
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
list=$1; out=$2
while IFS='|' read -r id origin urls; do
  [ -z "$id" ] && continue
  ok=0
  for url in $urls; do
    tmp="$out/.$id.part"
    code=$(curl -sSL -m 90 -A "$UA" -o "$tmp" -w "%{http_code}" "$url" 2>/dev/null)
    if [ "$code" = "200" ] && [ "$(head -c 4 "$tmp")" = "%PDF" ]; then
      mv "$tmp" "$out/$id.pdf"; echo "OK    $id ($origin) $(du -k "$out/$id.pdf" | cut -f1)KB <- $url"; ok=1; break
    fi
    rm -f "$tmp"; echo "  try failed: $id http=$code $url"
  done
  [ $ok = 0 ] && echo "FAIL  $id"
done < "$list"

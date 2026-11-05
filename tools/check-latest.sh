#!/bin/sh
# Short check: is there a newer game on the remote than the one this branch is built on? (prints about 6 lines)
git fetch -q origin 2>/dev/null || { echo "fetch failed"; exit 1; }
GAME=World-of-History-v30-development.html
HEAD_SHA=$(git rev-parse HEAD)
echo "this branch: $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"
# newest remote branch that touches the game file, by commit date (ignoring ship branches)
BEST=""; BEST_T=0
for b in $(git for-each-ref --format='%(refname:short)' refs/remotes | grep -v -E 'HEAD|ship-system'); do
  t=$(git log -1 --format=%ct "$b" -- "$GAME" 2>/dev/null); [ -z "$t" ] && continue
  if [ "$t" -gt "$BEST_T" ]; then BEST_T=$t; BEST=$b; fi
done
[ -z "$BEST" ] && { echo "no remote branch with the game file"; exit 0; }
echo "newest game file: $BEST ($(git log -1 --format=%cs "$BEST" -- "$GAME"))"
if git merge-base --is-ancestor "$BEST" "$HEAD_SHA"; then echo "UP TO DATE: this branch already contains it"; else echo "NEWER GAME AVAILABLE: $(git rev-list --count HEAD..$BEST) commits not in this branch -> merge $BEST, then run: node tools/integrate-ship.mjs && node tools/build-ship-sandbox.mjs"; fi

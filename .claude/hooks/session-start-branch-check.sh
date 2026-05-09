#!/usr/bin/env bash
# SessionStart hook: warn when a Claude session starts on an existing claude/* branch
# in the primary checkout. Multiple sessions launching in the same checkout will
# inherit and trample each other's branch, causing cross-session work to commingle.
# Silent (exit 0 with no output) when conditions are safe.

set -e

GIT_DIR=$(git rev-parse --git-dir 2>/dev/null || echo "")
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
REPO=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || echo "repo")")

# Only fire in the primary checkout (worktrees report a path under .git/worktrees/<name>).
if [ "$GIT_DIR" != ".git" ]; then
  exit 0
fi

# Only fire on claude/* branches.
case "$BRANCH" in
  claude/*) ;;
  *) exit 0 ;;
esac

DIRTY=""
if ! git diff --quiet --ignore-submodules HEAD 2>/dev/null; then
  DIRTY=" There are uncommitted changes — likely in-progress work from another session."
fi

DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")

jq -n \
  --arg branch "$BRANCH" \
  --arg dirty "$DIRTY" \
  --arg repo "$REPO" \
  --arg default "$DEFAULT_BRANCH" \
  '{
    systemMessage: ("HEAD is on " + $branch + " in the primary " + $repo + " checkout." + $dirty + " Another Claude session likely owns this branch — branch off " + $default + " or use a worktree before editing."),
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: ("BRANCH ISOLATION CHECK: This session started on \"" + $branch + "\" in the primary " + $repo + " checkout (not a worktree)." + $dirty + " Another Claude session likely owns this branch and your edits will commingle with theirs.\n\nBefore making ANY file edits, you MUST do one of:\n  (a) git checkout " + $default + " && git pull && git checkout -b claude/<your-task-slug>\n  (b) git worktree add ../" + $repo + "-<your-task-slug> -b claude/<your-task-slug> " + $default + "  (then cd into the new worktree)\n\nDo NOT commit on top of an existing claude/* branch you did not create yourself in this session. Exception: the user explicitly tells you to continue work on the current branch.")
    }
  }'

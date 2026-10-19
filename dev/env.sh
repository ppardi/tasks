# SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Source this, don't run it: puts a Node 24 on PATH when the default one is older.
#
# package.json asks for node ^24 and npm ^11. The Mac's Homebrew node is 23, so
# fall back to the Node 24 the Talk Desktop build keeps for itself, or to
# $TASKS_NODE_BIN when that is set.

_tasks_node_major() { node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/'; }

if [ "$(_tasks_node_major)" != "24" ]; then
  for _d in "${TASKS_NODE_BIN:-}" \
            "$HOME/Development/NextCloud-Talk/talk-desktop-build/tools/node24/bin"; do
    if [ -n "$_d" ] && [ -x "$_d/node" ]; then
      export PATH="$_d:$PATH"
      break
    fi
  done
fi

if [ "$(_tasks_node_major)" != "24" ]; then
  echo "dev/env.sh: no Node 24 found; set TASKS_NODE_BIN to its bin directory" >&2
  return 1 2>/dev/null || exit 1
fi
unset -f _tasks_node_major
unset _d

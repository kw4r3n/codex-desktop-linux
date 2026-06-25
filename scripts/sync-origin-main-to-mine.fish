#!/usr/bin/env -S fish --no-config

set script_dir (path dirname (status filename))
set delegate "$script_dir/sync-upstream-install-native.fish"

if not test -x "$delegate"
    echo "[sync][error] missing delegate script: $delegate" >&2
    exit 1
end

exec "$delegate" --branch main --source-remote origin --push-to mine $argv

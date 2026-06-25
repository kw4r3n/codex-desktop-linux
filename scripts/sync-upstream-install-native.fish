#!/usr/bin/env -S fish --no-config

set branch main
set source_remote origin
set push_remote ""

function usage
    printf '%s\n' \
        'Usage: scripts/sync-upstream-install-native.fish [options]' \
        '' \
        'Fetches an upstream branch, merges it into the current local branch when new' \
        'commits exist, and runs `make install-native` after a conflict-free merge.' \
        'If --push-to is set, it also fast-forward pushes the current branch there.' \
        '' \
        'Options:' \
        '  --branch <name>         Branch to sync. Default: main' \
        '  --source-remote <name>  Upstream remote to fetch and merge. Default: origin' \
        '  --push-to <name>        Optional remote to push after install succeeds' \
        '  --help                  Show this help'
end

function info
    printf '[sync] %s\n' (string join ' ' -- $argv) >&2
end

function fail
    printf '[sync][error] %s\n' (string join ' ' -- $argv) >&2
    exit 1
end

function require_remote --argument-names remote_name
    git remote get-url "$remote_name" >/dev/null 2>&1
    or fail "missing git remote '$remote_name'"
end

function require_clean_worktree
    set status_lines (git status --porcelain=v1)
    test (count $status_lines) -eq 0
    or fail "worktree has uncommitted changes; commit, stash, or clean it before running this script"
end

function fetch_remote --argument-names remote_name
    info "Fetching $remote_name..."
    git fetch "$remote_name" --prune
    or fail "git fetch failed for '$remote_name'"
end

function merge_branch --argument-names source_ref
    info "Merging $source_ref into $branch..."
    git merge --no-edit "$source_ref"
    and return 0

    if test -e .git/MERGE_HEAD
        info "Merge conflict detected; aborting merge."
        git merge --abort >/dev/null 2>&1
    end

    fail "merge from '$source_ref' failed"
end

function run_install_native
    info "Running make install-native..."
    env PATH="$HOME/.cargo/bin:$PATH" make install-native
    or fail "make install-native failed after the merge"
end

function push_branch --argument-names remote_name remote_ref
    if git rev-parse --verify --quiet "$remote_ref" >/dev/null 2>&1
        git merge-base --is-ancestor "$remote_ref" HEAD >/dev/null 2>&1
        or fail "remote '$remote_ref' is not an ancestor of HEAD; refusing a non-fast-forward push"
    end

    info "Pushing $branch to $remote_name/$branch..."
    git push "$remote_name" "$branch:$branch"
    or fail "push to '$remote_name/$branch' failed"
end

while test (count $argv) -gt 0
    switch $argv[1]
        case --branch
            test (count $argv) -ge 2
            or fail "--branch requires a value"
            set branch $argv[2]
            set -e argv[1..2]
        case --source-remote
            test (count $argv) -ge 2
            or fail "--source-remote requires a value"
            set source_remote $argv[2]
            set -e argv[1..2]
        case --push-to
            test (count $argv) -ge 2
            or fail "--push-to requires a value"
            set push_remote $argv[2]
            set -e argv[1..2]
        case --help -h
            usage
            exit 0
        case '*'
            fail "unknown argument '$argv[1]'"
    end
end

git rev-parse --is-inside-work-tree >/dev/null 2>&1
or fail "not inside a git work tree"

set repo_root (git rev-parse --show-toplevel 2>/dev/null)
or fail "could not determine repository root"

cd "$repo_root"
or fail "could not enter repo root '$repo_root'"

set current_branch (git branch --show-current)
test -n "$current_branch"
or fail "detached HEAD is not supported"

test "$current_branch" = "$branch"
or fail "current branch is '$current_branch'; switch to '$branch' before running this script"

require_clean_worktree
require_remote "$source_remote"

if test -n "$push_remote"
    require_remote "$push_remote"
end

fetch_remote "$source_remote"

if test -n "$push_remote"; and test "$push_remote" != "$source_remote"
    fetch_remote "$push_remote"
end

set source_ref "$source_remote/$branch"
git rev-parse --verify --quiet "$source_ref" >/dev/null
or fail "missing remote ref '$source_ref'"

set divergence (string split \t -- (git rev-list --left-right --count HEAD..."$source_ref"))
set local_only $divergence[1]
set upstream_only $divergence[2]

info "$branch is $local_only commits ahead and $upstream_only commits behind $source_ref."

set did_merge 0
if git merge-base --is-ancestor "$source_ref" HEAD >/dev/null 2>&1
    info "No upstream updates to merge from $source_ref."
else
    merge_branch "$source_ref"
    set did_merge 1
end

if test $did_merge -eq 1
    run_install_native
end

if test -n "$push_remote"
    push_branch "$push_remote" "$push_remote/$branch"
end

set head_short (git rev-parse --short HEAD)
info "Sync complete at $head_short"

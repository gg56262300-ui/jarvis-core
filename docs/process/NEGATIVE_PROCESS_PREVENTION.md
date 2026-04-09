# Negative Process Prevention

## Main rule
Before and after every test or patch block, repository must be clean.

## Required gate
Run:
git status --short --branch

## Allowed states
- clean worktree
- or clearly intentional branch with explicitly named task

## Forbidden states
- modified tracked file left after test
- untracked temporary test file left in repo
- live patch without immediate verify + decision
- multiple unfinished micro-fixes in parallel

## Mandatory sequence
1. backup if risk exists
2. verify git clean
3. make one isolated change
4. run one test
5. decide immediately:
   - commit
   - or restore/remove
6. verify git clean again

## Fast prevention rule
Temporary tests must be deleted immediately after result is confirmed.
If code fix is confirmed, commit it immediately.
If not committing now, restore it immediately.

## Root cause class for this incident
- no post-test cleanliness gate
- no forced decision after successful live verification

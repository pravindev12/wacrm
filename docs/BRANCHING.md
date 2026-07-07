# Branching workflow (this fork)

This fork is a **customized product** built on the upstream template
`ArnasDon/wacrm`. We keep three lanes so our features can diverge freely
while still pulling upstream fixes and occasionally contributing bugfixes
back.

```
upstream/main  ── the template (ArnasDon/wacrm). We pull FROM it.
      │
      ▼  merge upstream updates here; never commit features here
 origin/main   ── clean mirror of upstream. Base for UPSTREAM PRs only.
      │
      ▼  branch off; merge features back in
 origin/develop ── integration + DEPLOY branch. Everything we build lives here.
      ▲
      └── feat/*  fix/*  ── short-lived; one change each
```

## Roles
| Branch | Purpose | Deploy from it? | Commit features here? |
|---|---|---|---|
| `main` | Mirror of `upstream/main`; clean base for upstream PRs | No | **No** |
| `develop` | Our integration line — all our work merges here | **Yes** | No (merge via PR) |
| `feat/*`, `fix/*` | One feature/fix each | No | Yes |

## Day-to-day: adding a feature or fix
```bash
git checkout develop && git pull
git checkout -b feat/my-thing        # or fix/my-thing
# …work, commit…
git push -u origin feat/my-thing
# open a PR:  feat/my-thing  ->  develop   (within OUR fork)
```
Merge into `develop` with a merge commit (`--no-ff`) so each feature has a
clear integration point. Deploy the box from `develop`.

## Staying current with upstream
Periodically pull the template's bug/security fixes:
```bash
git checkout main
git fetch upstream
git merge upstream/main            # main stays a clean mirror
git push origin main
# then bring those updates into our line:
git checkout develop
git merge main                     # resolve conflicts in files we customised
git push origin develop
```

## Contributing a fix UPSTREAM (to ArnasDon/wacrm)
Upstream only accepts **isolated** bugfixes/security fixes — **not** our
whole `develop` line. So build a clean branch off `main` containing *only*
that one change:
```bash
git checkout main && git pull
git checkout -b upstream/fix-thing
git cherry-pick <the fix commit(s)>   # ONLY the fix — no LAN docs, no features
git push -u origin upstream/fix-thing
# open a PR:  pravindev12:upstream/fix-thing  ->  ArnasDon:main
# (open an issue upstream first — their CONTRIBUTING requires it)
```
Example: the messages-disappear fix is commit `d019ada`. To upstream it,
cherry-pick just that commit onto a branch off `main` (leave the
`RUN_ON_LAN.md` doc commit behind — that's fork-local).

## What is NOT upstreamed
Business/product features stay on `develop` only: WhatsApp **calling**,
routing/tagging customizations, rebranding, LAN docs. Per the upstream
CONTRIBUTING, new features belong in the fork, not the template.
```

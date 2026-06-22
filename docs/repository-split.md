# Repository Split Plan

This repo is now organized so it can stay as a monorepo or be split into three smaller GitHub repositories later.

## Suggested Repositories

- `microscope-stepper-web`: `src/app`, `src/components`, `public`, `package.json`, Next config files, and `.env.example`.
- `microscope-stepper-pi-agent`: `src/app/RaspiBackend`, `pi_agent`, and `scripts/deploy_pi.sh`.
- `microscope-stepper-firmware`: `firmware`.

## Split Commands

From a clean checkout, each repository can be produced with `git subtree split`:

```bash
git subtree split --prefix=firmware -b split/firmware
git subtree split --prefix=pi_agent -b split/pi-agent-support
```

The Pi agent currently depends on `src/app/RaspiBackend`, so copy that folder into the new Pi-agent repo root before publishing or run a dedicated split from that prefix.

## Upload Notes

Creating separate GitHub repositories needs the destination repository names and GitHub authentication. Once those exist, push the split branch with:

```bash
git push git@github.com:OWNER/REPO.git split/firmware:main
```

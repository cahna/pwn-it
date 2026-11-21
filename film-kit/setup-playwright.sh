#!/bin/bash
# setup-playwright.sh : install the film kit's own Playwright, so recording never depends on the
# target repo having one. Idempotent; re-run to repair or after changing PW_VERSION.
#
# Installs playwright-core (pinned) into $PWN_IT_PLAYWRIGHT (default ~/.local/share/pwn-it/playwright)
# and Playwright's headless Chromium into ~/.cache/ms-playwright/. director.mjs uses this install
# by default; FILM_PLAYWRIGHT_FROM still overrides it.
set -euo pipefail
PW_VERSION=1.50.1
DIR=${PWN_IT_PLAYWRIGHT:-$HOME/.local/share/pwn-it/playwright}
mkdir -p "$DIR"
cd "$DIR"
[ -f package.json ] || printf '{ "name": "pwn-it-playwright", "private": true }\n' > package.json
have=$(node -p "require('./node_modules/playwright-core/package.json').version" 2>/dev/null || true)
if [ "$have" != "$PW_VERSION" ]; then
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --silent --save-exact "playwright-core@$PW_VERSION"
fi
npx --no-install playwright-core install chromium-headless-shell
node -e "const { chromium } = require('playwright-core'); (async () => { const b = await chromium.launch(); const p = await b.newPage(); await p.setContent('<p>ok</p>'); console.log('PLAYWRIGHT_DIR=$DIR'); console.log('PLAYWRIGHT_VERSION=' + require('playwright-core/package.json').version); console.log('CHROMIUM=' + b.version()); await b.close(); })().catch((e) => { console.error(e.message); process.exit(1); });"

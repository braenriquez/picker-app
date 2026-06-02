# Gruppo Bravo — TWA (Trusted Web Activity)

Wraps the public PWA (`https://braenriquez.github.io/picker-app/`) as a real, installable Android
app via [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap). This gives, on GrapheneOS and
any Android:
- its own icon + its own **Settings → App info** (no browser badge, unlike the WebAPK-less shortcut
  Brave makes on GrapheneOS),
- a **dark bottom navigation bar** — `navigationColor` is baked into the APK (the fix for the white
  gesture-nav bar that `color-scheme` couldn't reach).

The app still loads the live PWA over the network; the server/PWA code is unchanged. Only the
**shell** is packaged.

## Prerequisites
- Node (have it) — Bubblewrap runs via `npx @bubblewrap/cli`.
- A JDK + Android SDK build-tools. On first run Bubblewrap offers to download a matching **JDK 17**
  and the Android tools into `~/.bubblewrap` — **say yes** (JDK 25 on this machine is too new for the
  Android build; let Bubblewrap manage its own JDK 17).

## 1. Build the APK (on this machine, in `twa/`)

```bash
cd ~/code/picker-app/twa
npx @bubblewrap/cli build
```

`build` reads `twa-manifest.json` (already configured: package `io.github.braenriquez.picker`,
all colors `#0f0f0f`, nav bar dark). On first run it will:
- offer to install JDK 17 + Android SDK → **accept**,
- prompt to **create the signing key** (`./android.keystore`, alias `picker`) → choose a
  **password you’ll remember and keep safe** (this key signs every future update; back it up).

> If `build` errors on schema/version drift, regenerate the config interactively instead and
> re-run build:
> ```bash
> npx @bubblewrap/cli init --manifest https://braenriquez.github.io/picker-app/manifest.json
> ```
> Answer the prompts the same way — **critically set "Navigation bar color" to `#0f0f0f`** (and
> theme/background `#0f0f0f`, package id `io.github.braenriquez.picker`).

Output: **`app-release-signed.apk`** plus **`assetlinks.json`** (contains your key’s SHA-256
fingerprint).

## 2. Publish the Digital Asset Links file

This proves the app and the site belong together so the browser engine hides the URL bar. It must
sit at the **domain root**: `https://braenriquez.github.io/.well-known/assetlinks.json` (served by
the `braenriquez.github.io` repo, not `picker-app`).

Easiest: paste the contents of the generated `twa/assetlinks.json` here and I’ll commit it to that
repo (with a `.nojekyll` so the `.well-known` folder is published). Or do it yourself:

```bash
# in a clone of braenriquez.github.io
mkdir -p .well-known
cp ~/code/picker-app/twa/assetlinks.json .well-known/assetlinks.json
touch .nojekyll      # so Jekyll doesn't skip the dot-folder
git add .well-known/assetlinks.json .nojekyll && git commit -m "Add TWA assetlinks" && git push
```

(The nav-bar color and the standalone-app behaviour work **without** this step — assetlinks only
controls whether the top URL bar is hidden.)

## 3. Install on the phone (GrapheneOS Pixel 9)
- Transfer `app-release-signed.apk` to the phone (USB, or `adb install app-release-signed.apk`).
- GrapheneOS will ask to allow installs from the source → allow, then install.
- A TWA needs a Chromium-based engine present (Vanadium/Brave/Chrome) — Vanadium works as the
  provider; assetlinks verification is done by that browser, **no Google Play needed**.

Launch it: own icon, own App-info entry, dark nav bar. After the assetlinks file is live, the URL
bar disappears on next launch.

## Updating later
When you change the PWA, the TWA picks it up automatically (it just loads the live site). Only
rebuild/reinstall the APK if you change shell properties here (name, colors, icon, package). Bump
`appVersionCode` (and `appVersion`) in `twa-manifest.json`, then `npx @bubblewrap/cli build` with
the **same** keystore.

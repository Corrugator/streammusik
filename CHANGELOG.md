# Changelog

Versionsschema: `{major}.{minor}.{patch}.{build}` (Stream Deck Manifest).
Jeder Eintrag = ein gepacktes `.streamDeckPlugin`-Bundle.

## 1.0.0.7 — 2026-05-26 — Production hardening

Security/quality audit findings addressed before Marketplace submission:

- **Manifest:** removed `Nodejs.Debug: "enabled"` — was a leftover from dev. Production runs without debug overhead now.
- **Logger:** `streamDeck.logger.setLevel("trace")` → `"warn"`. Trace-level logged every poll, every dial-rotate, every marquee frame — massive disk I/O on user machines. Warn-level only fires on actual errors.

No functional changes. Plugin behaves identically; just less noise on disk and no dev-flag in production.

## 1.0.0.6 — 2026-05-26 — Encoder-only scope

- **Removed Keypad support.** The action is now declared `Controllers: ["Encoder"]` only — it shows up exclusively on Stream Deck + setups. Regular Stream Decks (without an encoder) won't see the action in the actions list.
- Source code cleanup: `onKeyDown` handler, `#renderKey` method, `formatKeyTitle` helper, and the `KeyAction` import all removed.
- Manifest tooltip + description updated to reflect Encoder-only scope.

## 1.0.0.5 — 2026-05-26 — Gallery refresh

- All three marketplace gallery images redrawn to match the current full-cover encoder layout and metallic-red branding.
- Cover mockups now use subtle gradients with abstract decoration for an album-cover feel.
- Encoder volume bar switched to metallic red for full brand consistency.

## 1.0.0.4 — 2026-05-26 — Logo + brand colors finalised

Brand identity locked after several internal iterations:

- **Logo:** geometric hexagon outline with equalizer bars inside (iterated through stylised notes, mirrored sine waves, and pulse lines before settling here).
- **Brand color** switched from mint-teal to a metallic-red gradient (`#FF4D52 → #D62035 → #7A0816`) — cleaner break from Apple-Music styling.
- Same artwork rolled out at every required size: marketplace icon (256/288/512), key icon (72/144), action + category icons (mono white on transparent), and the thumbnail wordmark.
- No functional changes.

## 1.0.0.0 — 2026-05-24 — Marketplace Launch Brand

Complete rebrand for Marketplace launch:

- **Renamed** from `StreamMusik` to **Stream Deck Musik Viewer** (display name, manifest, all docs).
- **New UUID:** `com.corrugator.streammusik` → `com.corrugator.streamdeck-musik-viewer` (clean reverse-DNS for the final brand).
- **New repo:** `streammusik` → `streamdeck-musik-viewer` on GitHub.
- **New Encoder Layout** with album cover as full-screen background, gradient overlay for legibility, mint-teal volume bar at the bottom, prominent track + artist text.
- **Category** in manifest changed to `Music` (Guidelines-conform; was the plugin name before).
- **Branding refresh:** dark charcoal + mint-teal palette (dropped the Apple-Music-inspired red/pink); new icon + thumbnail wordmark.
- Tmp-file prefix: `streammusik-artwork-*` → `sdmv-artwork-*`.

## 0.3.0.4 — 2026-05-24

**Marketplace-Anforderungen erfüllt** — der Maker Console hat beim Upload-Check drei Felder rot markiert, alle drei korrigiert:

- `SDKVersion: 2` → `3` (Marketplace verlangt mindestens v3)
- `Software.MinimumVersion: "6.5"` → `"6.9"` (Marketplace verlangt mindestens 6.9)
- Damit ist **DRM Protection** automatisch aktiviert (kein separates Manifest-Feld; ergibt sich aus SDKVersion 3 + Software 6.9)

Keine Code-Änderungen — `@elgato/streamdeck@2.1.0` läuft sowohl mit Manifest-SDKVersion 2 als auch 3.

## 0.3.0.3 — 2026-05-24

- Re-Pack ohne Code-Änderung. (Versuchsweise wurde ein `SupportURL`-Feld ins Manifest eingetragen — das Stream-Deck-Schema erlaubt das aktuell nicht, also wurde es wieder entfernt. Support-Kanal bleibt über das `URL`-Feld → Repo → GitHub Issues Tab.)

## 0.3.0.2 — 2026-05-24

- **Volume-Cache-Race behoben.** Nach jeder User-Audio-Aktion (Drehen, Mute) blockt ein 500-ms-Grace-Window den Cache-Sync vom Poll-Tick. Verhindert kurze visuelle Glitches bei schnellem Drehen während ein Poll-Tick parallel läuft.
- **Artwork-Cleanup beim Plugin-Start.** Cached `/tmp/sdmv-artwork-*.png` Files älter als 30 Tage werden best-effort entfernt. Vermeidet Disk-Müll bei jahrelanger Nutzung ohne Reboot.

## 0.3.0.1 — 2026-05-24

- **Manifest `URL`** auf finales GitHub-Repo gesetzt (`https://github.com/Corrugator/streamdeck-musik-viewer`) — löst Pre-Submission-Blocker B2.
- `package.json` um `repository`, `bugs`, `homepage` ergänzt — Standard für öffentliche npm-/GitHub-Projekte.

## 0.3.0.0 — 2026-05-24

Pre-Submission Hardening — vorbereitend für Marketplace-Review:

- **Robusterer Parser**: AppleScript-Records jetzt mit ASCII Unit Separator (0x1F) getrennt statt Linefeed. Verhindert, dass ein Track-Name mit Newline + `state=…` den geparsten State manipulieren kann.
- **NaN-Guard** in `getTrackInfo` und `getSystemAudio` — fehlerhafte AppleScript-Outputs (`duration=abc`) ergeben jetzt `undefined` / `0` statt `NaN`.
- **`showAlert()`** bei allen User-Aktionen-Failures (Play/Pause, Mute, Volume-Set) — Marketplace-Anforderung. User sieht das X-Symbol auf der Taste, wenn ein osascript-Call fehlschlägt (z. B. fehlende Permission).
- **Optimistic-UI-Rollback** beim Mute-Toggle: wenn der OS-Call fehlschlägt, wird der UI-State zurückgedreht.
- **Marquee-Timer defensiver**: `clearInterval` immer vor `setInterval` — robust gegen künftige Code-Änderungen.
- **`previews/`-Ordner** vorbereitet mit Anleitung für Screenshots.

## 0.2.2.0 — 2026-05-24

- **Größere Schrift** im Encoder-Layout: Track 14→17 pt (bold), Artist 11→13 pt. Rects entsprechend angepasst.
- **Laufschrift (Marquee)** bei zu langen Track-/Artist-Namen: rotierender Slice alle 300 ms mit Separator `  •  `. Kurze Texte bleiben statisch (kein Timer-Overhead).
- `text-overflow: ellipsis` explizit im Layout (Fallback wenn Marquee nicht aktiv ist).

## 0.2.1.0 — 2026-05-24

- **Lautstärke-Latenz drastisch reduziert** (von ~200 ms auf gefühlt instant):
  - In-Memory-Cache für Volume + Muted, UI rendert sofort aus Cache.
  - Debouncing (30 ms) bündelt schnelle Drehungen zu einem osascript-Call.
  - Mute-Toggle ist fire-and-forget; OS-Call läuft im Hintergrund.
  - Volume + Unmute in einem osascript-Call kombiniert (`set volume output volume X without output muted`).
  - Voller `#tick()` nach Rotate/Mute entfällt — Track-Info ist für Volume nicht nötig.

## 0.2.0.0 — 2026-05-24

- **Custom Encoder-Layout** mit prominentem Track-Titel oben (`track` key) und Artist darunter (`artist` key); Cover unten links, Volume-Bar unten rechts.
- Fix: `title` als Layout-Key wird vom SDK reserviert / vom User-konfigurierten Action-Titel überschrieben — auf Custom-Key `track` umgestellt.
- Logger-Level auf `trace` + `info`-Logs für Dial-Renders zur einfacheren Diagnose.

## 0.1.0.0 — 2026-05-24

- Initial Release.
- Action `now-playing` mit `Keypad` + `Encoder` Controller.
- Apple Music via AppleScript (Track-Info + Artwork-Cache nach Persistent ID).
- System-Lautstärke via `set volume output volume` (Dial-Rotate ±2 %, Dial-Down = Mute Toggle).
- Play / Pause via Tap (Keypad) und Touch (Encoder).
- Layout `$B1` (built-in) als initiales Encoder-Layout.

# Architecture

Wie Stream Deck Musik Viewer intern funktioniert — für alle, die mehr wissen wollen als „Plugin installieren und nutzen".

## Big Picture

```
                ┌──────────────────┐
                │   Stream Deck    │   WebSocket events
                │     Software     │ ◀───────────────────┐
                └──────────────────┘                     │
                                                         ▼
┌─────────────┐   AppleScript   ┌─────────────────────────────────┐
│  Music.app  │ ◀───────────── │  Plugin (Node 20 + TypeScript)  │
│  (current   │                │  • polls every 2 s              │
│   track,    │ ───────────▶  │  • caches artwork per track-PID │
│   artwork)  │   stdout +     │  • renders key image + dial     │
│             │   /tmp PNG     │    feedback                     │
└─────────────┘                 └─────────────────────────────────┘
```

- Plugin läuft als **Node.js 20** unter dem Stream-Deck-Daemon
- Pollt alle **2 s** ein AppleScript via `osascript` für Track-Metadaten + Artwork
- Cover als `data:image/...;base64,…` per `setImage()`; Encoder via `setFeedback({ track, artist, value, indicator, icon })` mit Custom-Layout

## Apple-Music-Anbindung

Drei AppleScript-Snippets, alle in [`src/lib/apple-music.ts`](src/lib/apple-music.ts):

1. **`TRACK_INFO_SCRIPT`** — fragt Music ab. Liefert `state`, `name`, `artist`, `album`, `duration`, `position`, `pid` (persistent ID) und schreibt das Cover in `/tmp/sdmv-artwork-<pid>.png` (idempotent, gecached per Persistent Track ID).
2. **`SYSTEM_AUDIO_SCRIPT`** — liest `output volume` und `output muted` aus `(get volume settings)`.
3. Inline-Einzeiler für Volume schreiben, Mute toggeln und `playpause`.

Output-Format: `key=value`-Records, getrennt durch **ASCII Unit Separator (`0x1F`, AppleScript `character id 31`)** statt Newline — Track-Namen können legitim Newlines enthalten, sonst könnte ein Track wie `Foo\nstate=stopped` den geparsten Player-State manipulieren. Unit Separator ist ein Control-Char und in Music-Metadaten praktisch ausgeschlossen.

Numerische Felder (`duration`, `position`, `volume`) werden über einen `isFinite()`-Guard validiert — kaputter AppleScript-Output wird zu `undefined` statt zu `NaN`.

**Warum kein `MediaRemote`?** Die private `MediaRemote.framework`-API kann jederzeit von Apple geändert werden und benötigt eine signierte Helper-Binary. AppleScript ist offiziell und stabil.

## Stream-Deck-Rendering

`SingletonAction` mit beiden Controllern (`Keypad` + `Encoder`). Lifecycle:

- **`onWillAppear`** — Snapshot zurücksetzen, sofort einen Tick rendern, 2-s-Intervall starten
- **`onWillDisappear`** — alle Timer (Poll, Marquee, Volume-Flush) aufräumen
- Jeder **Tick** holt Track-Info + System-Audio parallel und rendert pro Action-Instance (`#renderKey` / `#renderDial`)

### Diff-Optimierungen

- **Cover** (`icon`) wird nur neu eingelesen + gesendet, wenn sich die Persistent Track ID ändert — Cover ist der teure Teil (File-Read + Base64)
- **Text- und Bar-Felder** (`track`, `artist`, `value`, `indicator`) werden bei jedem Tick gesendet — günstig und vermeidet Race-Conditions wo Werte aus dem Stream-Deck-Cache leer bleiben
- Keypad-`setImage` / `setTitle` werden ebenfalls nur bei `pid`- oder `state`-Wechsel aufgerufen

### Marquee / Laufschrift bei langen Titeln

Das SDK-Layout-Schema kennt nur `text-overflow: clip|ellipsis|fade` — kein natives Marquee. Bei langen Track- oder Artist-Namen würde sonst nur „Begin of titl…" zu sehen sein. Lösung im Plugin:

- Char-Limits: `TRACK_MAX=18`, `ARTIST_MAX=22` (passt zu Font-Größen 17 pt / 13 pt im 200-px-Layout)
- **Wenn ein Wert sein Limit überschreitet**, startet ein `setInterval` alle **300 ms**, das per `setFeedback` einen rotierenden Slice von `text + "  •  "` schickt — loopt nahtlos
- Kurze Texte ⇒ kein Timer, kein Overhead
- Track-Wechsel ⇒ Offset zurück auf 0, Timer ggf. starten/stoppen
- `onWillDisappear` räumt den Marquee-Timer mit auf

### Lautstärke-Latenz: Cache + Debounce + Fire-and-Forget

Jeder `osascript`-Call kostet ~50–100 ms (Process-Spawn). Naive Implementierung (`get volume → set volume → unmute → tick`) braucht **150–300 ms pro Drehung** — spürbar träge. Elgato löst das in eigenen Plugins mit nativen Binaries (direkter CoreAudio-Zugriff); wir bleiben in Node und holen über vier Tricks raus, dass der Encoder gefühlt instant reagiert:

1. **In-Memory-Cache** (`#cachedVolume`, `#cachedMuted`). Cache wird beim 2-s-Poll vom System aktualisiert.
2. **Sofortiges UI-Update** aus dem Cache via `#renderDialAudioOnly()` — kein osascript im Render-Pfad.
3. **Debounced OS-Sync** (30 ms). Bei schnellem Drehen wird nur **ein** `setSystemVolume`-Call gefeuert, mit dem letzten Zielwert.
4. **Kombinierter osascript-Call** für Volume + Unmute (`set volume output volume X without output muted`) statt zwei Round-Trips.

Zusätzlich:
- **Mute-Toggle** ist fire-and-forget — UI wird aus Cache aktualisiert, der OS-Call läuft im Hintergrund
- **Volle `#tick()`** wird nach Rotate/Mute **nicht** mehr aufgerufen — Track-Info ist für Volume irrelevant; der reguläre 2-s-Poll holt sie ein
- **Cache-Sync-Schutz**: Wenn ein Flush-Timer aktiv ist, überschreibt der Poll-Tick den Cache **nicht** (sonst würde der frisch eingestellte Wert kurz vom alten System-Wert verdrängt)

### Warum Custom-Layout statt `$B1`?

Im built-in Layout `$B1` ist der `title`-Key reserviert: Stream Deck überschreibt ihn mit dem User-konfigurierten Action-Titel aus dem Property Inspector — auch wenn der leer ist. Custom-Keys (`track`, `artist`) sind frei kontrollierbar und garantieren, dass der vom Plugin gesendete Wert auch angezeigt wird.

### Failure-Handling

Jeder User-getriggerte Handler (`onKeyDown`, `onTouchTap`, `onDialDown`, `#flushVolume` nach Rotate) ist in try/catch eingerahmt. Bei `osascript`-Fehler:

1. `streamDeck.logger.warn()` schreibt einen Eintrag in die Log-Datei
2. `action.showAlert()` blendet das rote X-Icon kurz auf der Taste ein → User merkt sofort, dass was schief lief
3. Beim Mute-Toggle wird der optimistic-cache (UI hat bereits getoggelt) **zurückgerollt**, damit Cache und System wieder synchron sind

### Cover-Encoding

Buffer aus Datei lesen → Magic-Bytes-Check (PNG `89 50 4E 47` / JPEG `FF D8 FF`) → `data:image/…;base64,…`. Stream Deck skaliert das Bild dann selbst auf die Tastengröße.

## Projektstruktur

```
streamdeck-musik-viewer/
├── src/
│   ├── plugin.ts                            — Entry: registriert Action, connect()
│   ├── actions/
│   │   └── now-playing.ts                   — SingletonAction: Polling, Rendering, Marquee, Cache
│   └── lib/
│       └── apple-music.ts                   — osascript-Wrapper (AppleScript inline)
├── assets/                                  — SVG-Quellen (nur Dev)
│   ├── marketplace.svg
│   └── key.svg
├── com.corrugator.streamdeck-musik-viewer.sdPlugin/     — was gepackt wird
│   ├── manifest.json                        — Plugin-Metadaten + Actions
│   ├── bin/plugin.js                        — Build-Output (Rollup)
│   ├── layouts/
│   │   └── now-playing.json                 — Custom Encoder-Layout (200×100)
│   ├── previews/                            — Marketplace-Screenshots
│   └── imgs/
│       ├── plugin/                          — Marketplace + Category Icons
│       └── actions/now-playing/             — Action + Key Icons
├── package.json
├── tsconfig.json
└── rollup.config.mjs                        — bundelt src/ → bin/plugin.js
```

# StreamMusik

Ein Stream Deck Plugin, das den aktuell laufenden Apple-Music-Track auf den Tasten anzeigt — inklusive Cover-Art als Tastenbild. Auf dem **Stream Deck +** zeigt der Encoder zusätzlich Cover, Titel und Lautstärke; gedreht steuert er die System-Lautstärke, gedrückt schaltet er Mute, ein Touch-Tap pausiert/spielt ab.

> **Plattform:** macOS · **Quelle:** Apple Music (Music.app) · **Hardware:** alle Stream Deck Modelle (Keypad), Cover-Anzeige am besten auf XL/+ wegen Tastenfläche.

---

## Inhalt

1. [Funktionsumfang](#funktionsumfang)
2. [Voraussetzungen](#voraussetzungen)
3. [Installation (für Endnutzer)](#installation-für-endnutzer)
4. [Architektur in 30 Sekunden](#architektur-in-30-sekunden)
5. [Projektstruktur](#projektstruktur)
6. [Lokal entwickeln / nachbauen](#lokal-entwickeln--nachbauen)
7. [Release-Workflow & Versionierung](#release-workflow--versionierung)
8. [Wie funktioniert die Apple-Music-Anbindung?](#wie-funktioniert-die-apple-music-anbindung)
9. [Wie funktioniert das Stream-Deck-Rendering?](#wie-funktioniert-das-stream-deck-rendering)
10. [Marketplace-Compliance](#marketplace-compliance)
11. [Bekannte Grenzen](#bekannte-grenzen)

---

## Funktionsumfang

| Hardware | Geste | Wirkung |
|---|---|---|
| Keypad (alle Modelle) | Tap | Play / Pause |
| Keypad-Display | — | Cover als Hintergrund, Titel/Artist als Text |
| SD+ Encoder Touch-Display | — | Cover + Track-Titel + Lautstärke-Balken |
| SD+ Encoder | Drehen | System-Lautstärke +/− (2 % pro Tick) |
| SD+ Encoder | Drücken | System-Mute toggeln |
| SD+ Encoder | Touch-Tap | Play / Pause |

Wenn Apple Music nicht läuft oder gestoppt ist, zeigt die Taste den Default-Status (`Apple Music` bzw. `Stopped`).

**Fehler-Feedback:** Schlägt eine User-Aktion fehl (z. B. `osascript`-Permission fehlt, Music.app hängt), erscheint auf der Taste das Stream-Deck `showAlert`-Icon (rotes X) und der Mute-State wird optimistic-rolled-back. Logs liegen unter dem in „Lokal entwickeln" genannten Pfad.

## Voraussetzungen

- **macOS 11+**
- **Stream Deck Software 6.5+**
- **Apple Music App** (vorinstalliert auf macOS)
- Beim ersten Aufruf bittet macOS um **Automation-Permission** für Music (System­einstellungen → Datenschutz & Sicherheit → Automation → Stream Deck → Music ✅).

## Installation (für Endnutzer)

1. `com.corrugator.streammusik.streamDeckPlugin` doppelklicken.
2. Stream Deck Software fragt nach Bestätigung → installieren.
3. Action **„Now Playing"** auf eine Taste / einen Encoder ziehen.
4. Beim ersten Track-Wechsel die Automation-Permission bestätigen.

## Architektur in 30 Sekunden

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

- Der Plugin-Prozess läuft als **Node.js 20** unter dem Stream-Deck-Daemon.
- Er ruft alle **2 s** ein AppleScript via `osascript` auf, das Track-Metadaten und das Artwork (in `/tmp/streammusik-artwork-<pid>.png`) bereitstellt.
- Das Cover wird als `data:image/...;base64,…` per `setImage()` an die Taste geschickt; Encoder bekommt `setFeedback({ track, artist, value, indicator, icon })` mit dem Custom-Layout [`layouts/now-playing.json`](com.corrugator.streammusik.sdPlugin/layouts/now-playing.json).
- Artwork wird per **Persistent Track ID** gecached — beim selben Track entsteht kein Disk-IO.

## Projektstruktur

```
StreamMusik/
├── README.md                                — diese Datei
├── CHANGELOG.md                             — Release-Historie
├── LICENSE                                  — MIT-Lizenz
├── package.json                             — Build-Skripte + Deps
├── tsconfig.json                            — TS-Config (Node 20 base)
├── rollup.config.mjs                        — bundelt src/ → bin/plugin.js
├── .sdignore                                — vom Pack-Schritt ignoriert
├── assets/                                  — Vektor-Quellen (nur Dev)
│   ├── marketplace.svg
│   └── key.svg
├── src/
│   ├── plugin.ts                            — Entry: registriert Action, connect()
│   ├── actions/
│   │   └── now-playing.ts                   — SingletonAction: Polling + Rendering
│   └── lib/
│       └── apple-music.ts                   — osascript-Wrapper (AppleScript inline)
└── com.corrugator.streammusik.sdPlugin/     — was gepackt wird
    ├── manifest.json                        — Plugin-Metadaten + Actions
    ├── bin/plugin.js                        — Build-Output (von rollup)
    ├── layouts/
    │   └── now-playing.json                 — Custom Encoder-Layout (200×100)
    ├── previews/                            — Marketplace-Screenshots (vom User zu befüllen)
    │   └── README.md                        — Format-Empfehlungen
    └── imgs/
        ├── plugin/
        │   ├── marketplace.png              (256×256, Marketplace-Icon)
        │   ├── marketplace@2x.png           (512×512, High DPI)
        │   └── category-icon.svg            (Kategorie in Action-Liste)
        └── actions/now-playing/
            ├── action.svg                   (mono weiß, Action-Liste)
            ├── key.png                      (72×72, Default-Tastenbild)
            └── key@2x.png                   (144×144, High DPI)
```

## Lokal entwickeln / nachbauen

```bash
# Voraussetzungen
brew install librsvg                # für SVG → PNG (nur bei Icon-Änderungen)
npm install -g @elgato/cli          # Stream Deck CLI

# Setup
npm install

# Plugin im Stream Deck registrieren (einmalig)
streamdeck link com.corrugator.streammusik.sdPlugin

# Watch-Modus: rebuild + auto-restart
npm run watch

# Validate (manifest + assets)
npm run validate

# .streamDeckPlugin-Datei bauen
npm run pack
```

Icons regenerieren (nach Edits in `assets/*.svg`):

```bash
rsvg-convert -w 256 -h 256 assets/marketplace.svg -o com.corrugator.streammusik.sdPlugin/imgs/plugin/marketplace.png
rsvg-convert -w 512 -h 512 assets/marketplace.svg -o com.corrugator.streammusik.sdPlugin/imgs/plugin/marketplace@2x.png
rsvg-convert -w 72  -h 72  assets/key.svg         -o com.corrugator.streammusik.sdPlugin/imgs/actions/now-playing/key.png
rsvg-convert -w 144 -h 144 assets/key.svg         -o com.corrugator.streammusik.sdPlugin/imgs/actions/now-playing/key@2x.png
```

Plugin-Logs liegen in `~/Library/Application Support/com.elgato.StreamDeck/Plugins/com.corrugator.streammusik.sdPlugin/logs/`.

## Release-Workflow & Versionierung

> **Verbindliche Regeln:**
> 1. Jede inhaltliche Änderung am Plugin wird **neu versioniert** und erzeugt eine **neue `.streamDeckPlugin`-Datei**. Kein Pushen / kein Verteilen ohne Version-Bump.
> 2. Jede Änderung wird **direkt in dieser README dokumentiert** (aktueller Stand) **und in [`CHANGELOG.md`](CHANGELOG.md)** (Historie). Die README beschreibt das Plugin so, wie es *jetzt* funktioniert — keine veralteten Aussagen über Architektur, Layouts, Keys oder Pfade.

### Versionsschema

Stream Deck verlangt vier Komponenten: `{major}.{minor}.{patch}.{build}` (z. B. `0.2.0.0`). Bumps nach Semver-Light:

| Komponente | Wann bumpen | Beispiel |
|---|---|---|
| **major** (`X.0.0.0`) | Breaking Change (z. B. UUID-Änderung, Pflicht-Settings entfernt) | `1.0.0.0` für Marketplace-Launch |
| **minor** (`0.X.0.0`) | Neues Feature, neues Layout, neue Action | Custom Encoder-Layout hinzu |
| **patch** (`0.0.X.0`) | Bug-Fix, Text-Korrektur, Performance-Tweak | AppleScript-Edge-Case behoben |
| **build** (`0.0.0.X`) | Reiner Re-Pack ohne Code-Change (z. B. Icon-Tausch) | Marketplace-Asset getauscht |

### Schritte pro Release

1. **Code-Änderung** machen.
2. **`README.md`** aktualisieren — alle vom Change betroffenen Sektionen (Funktionsumfang, Architektur, Projektstruktur, Rendering, Marketplace-Tabelle, Bekannte Grenzen). Veraltete Beschreibungen sind ein Bug.
3. **`manifest.json`** → `Version` bumpen.
4. **`package.json`** → `version` synchron halten (drei Komponenten reichen für npm).
5. **`CHANGELOG.md`** → kurzer Eintrag (1–2 Zeilen, was/warum).
6. **`npm run pack`** → erzeugt frische `com.corrugator.streammusik.streamDeckPlugin`.
7. (optional) Git-Tag `v{version}` setzen.

Der `pack`-Schritt validiert automatisch und schreibt das `.streamDeckPlugin`-Bundle mit der Version aus dem Manifest. Die Datei ersetzt jede ältere `.streamDeckPlugin` im Repo-Root.

### Während Dev (gelinkt)

Im Symlink-Modus (`streamdeck link`) reicht für Live-Tests `npm run watch` oder `streamdeck restart com.corrugator.streammusik` — **kein Version-Bump nötig**, solange nichts veröffentlicht wird. Erst wenn eine `.streamDeckPlugin`-Datei erzeugt / weitergegeben wird, gilt die Bump-Regel.

## Wie funktioniert die Apple-Music-Anbindung?

Drei AppleScript-Snippets, alle in [`src/lib/apple-music.ts`](src/lib/apple-music.ts):

1. **`TRACK_INFO_SCRIPT`** — fragt Music ab. Liefert `state`, `name`, `artist`, `album`, `duration`, `position`, `pid` (persistent ID) und schreibt das Album-Cover in `/tmp/streammusik-artwork-<pid>.png` (idempotent — wird beim selben Track nicht überschrieben).
2. **`SYSTEM_AUDIO_SCRIPT`** — liest `output volume` und `output muted` aus `(get volume settings)`.
3. Inline-Einzeiler für Volume schreiben, Mute toggeln und `playpause`.

Der Output ist ein simples `key=value`-Format, **Records getrennt durch ASCII Unit Separator (`0x1F`, AppleScript: `character id 31`)** statt Newline — Track-Namen können legitim Newlines enthalten, und ein gehässig benannter Track wie `Foo\nstate=stopped` könnte sonst den geparsten Player-State manipulieren. Unit Separator ist ein Control-Char und in Music-Metadaten praktisch ausgeschlossen.

Numerische Felder (`duration`, `position`, `volume`) werden über einen `isFinite()`-Guard validiert, damit kaputter AppleScript-Output (z. B. `"abc"`) zu `undefined` / `0` wird statt zu `NaN`.

**Warum kein `MediaRemote`?** Die private `MediaRemote.framework`-API kann jederzeit von Apple geändert werden und benötigt eine signierte Helper-Binary. AppleScript ist offiziell, stabil und ohne Extra-Tooling auskommend.

## Wie funktioniert das Stream-Deck-Rendering?

Die Action ist eine `SingletonAction` mit beiden Controllern (`Keypad` + `Encoder`). Der Lifecycle:

- **`onWillAppear`** — Snapshot zurücksetzen, sofort einen Tick rendern, 2-s-Intervall starten.
- **`onWillDisappear`** — Intervall stoppen.
- Jeder **Tick** holt Track-Info + System-Audio parallel und ruft pro registriertem Action-Instance entweder `#renderKey()` oder `#renderDial()` auf.

Optimierungen für „so wenig wie möglich":

- **Cover** (`icon`) wird nur neu eingelesen + gesendet, wenn sich die **Persistent Track ID** (`pid`) ändert — Cover ist der teure Teil (File-Read + Base64).
- **Text- und Bar-Felder** (`track`, `artist`, `value`, `indicator`) werden bei jedem Tick gesendet — günstig und vermeidet Race-Conditions wo Werte aus dem Stream-Deck-Cache leer bleiben.
- Keypad-`setImage` / `setTitle` werden ebenfalls nur bei `pid`- oder `state`-Wechsel aufgerufen.

### Marquee / Laufschrift bei langen Titeln

Das SDK-Layout-Schema kennt nur `text-overflow: clip|ellipsis|fade` — kein natives Marquee. Bei langen Track- oder Artist-Namen würde sonst nur "Begin of titl…" zu sehen sein. Lösung im Plugin:

- Char-Limits: `TRACK_MAX=18`, `ARTIST_MAX=22` (passt zu Font-Größen 17 pt / 13 pt im 200-px-Layout).
- **Wenn ein Wert sein Limit überschreitet**, startet ein `setInterval` alle **300 ms**, das per `setFeedback` einen rotierenden Slice von `text + "  •  "` schickt. Loopt nahtlos.
- Kurze Texte ⇒ kein Timer, kein Overhead.
- Track-Wechsel ⇒ Offset zurück auf 0, Timer ggf. starten/stoppen.
- `onWillDisappear` räumt den Marquee-Timer mit auf.

### Lautstärke-Latenz: Cache + Debounce + Fire-and-Forget

Jeder `osascript`-Call kostet ~50–100 ms (Process-Spawn). Naive Implementierung (`get volume → set volume → unmute → tick`) braucht **150–300 ms pro Drehung** — spürbar träge. Elgato löst das in eigenen Plugins mit nativen Binaries (direkter CoreAudio-Zugriff); wir bleiben in Node und holen über vier Tricks raus, dass der Encoder gefühlt instant reagiert:

1. **In-Memory-Cache** (`#cachedVolume`, `#cachedMuted`). Cache wird beim 2-s-Poll vom System aktualisiert.
2. **Sofortiges UI-Update** aus dem Cache via `#renderDialAudioOnly()` — kein osascript im Render-Pfad.
3. **Debounced OS-Sync** (30 ms). Bei schnellem Drehen wird nur **ein** `setSystemVolume`-Call gefeuert, mit dem letzten Zielwert.
4. **Kombinierter osascript-Call** für Volume + Unmute (`set volume output volume X without output muted`) statt zwei Round-Trips.

Zusätzlich:
- **Mute-Toggle** ist fire-and-forget — UI wird aus Cache aktualisiert, der OS-Call läuft im Hintergrund (kein `await`).
- **Volle `#tick()`** wird nach Rotate/Mute **nicht** mehr aufgerufen — Track-Info ist für Volume irrelevant; der reguläre 2-s-Poll holt sie ein.
- **Cache-Sync-Schutz**: Wenn ein Flush-Timer aktiv ist, überschreibt der Poll-Tick den Cache **nicht** (sonst würde der frisch eingestellte Wert kurz vom alten System-Wert verdrängt).

Cover-Encoding: Buffer aus Datei lesen → Magic-Bytes-Check (PNG `89 50 4E 47` / JPEG `FF D8 FF`) → `data:image/…;base64,…`. Stream Deck skaliert das Bild dann selbst auf die Tastengröße.

### Warum Custom-Layout statt `$B1`?

Im built-in Layout `$B1` ist der `title`-Key reserviert: Stream Deck überschreibt ihn mit dem User-konfigurierten Action-Titel aus dem Property Inspector — auch wenn der leer ist. Custom-Keys (`track`, `artist`) sind frei kontrollierbar und garantieren, dass der vom Plugin gesendete Wert auch angezeigt wird.

### Failure-Handling

Jeder User-getriggerte Handler (`onKeyDown`, `onTouchTap`, `onDialDown`, `#flushVolume` nach Rotate) ist in try/catch eingerahmt. Bei `osascript`-Fehler:

1. `streamDeck.logger.warn()` schreibt einen Eintrag in die Log-Datei.
2. `action.showAlert()` blendet das rote X-Icon kurz auf der Taste ein → User merkt sofort, dass was schief lief.
3. Beim Mute-Toggle wird der optimistic-cache (UI hat bereits getoggelt) **zurückgerollt**, damit Cache und System wieder synchron sind.

Das ist Marketplace-Pflicht (Guidelines fordern Feedback bei unsuccessful actions).

## Marketplace-Compliance

Geprüft gegen [Plugin Guidelines](https://docs.elgato.com/guidelines/stream-deck/plugins/) und [Manifest Reference](https://docs.elgato.com/streamdeck/sdk/references/manifest/):

| Anforderung | Status |
|---|---|
| Manifest validate (`streamdeck validate`) | ✅ |
| Plugin-Icon 256×256 + 512×512 PNG | ✅ |
| Action-Icon monochromatisch weiß, transparent BG | ✅ (`action.svg`) |
| Key-Icon 72×72 + 144×144 | ✅ |
| Plugin-Name ≤ 30 Zeichen | ✅ („StreamMusik") |
| Reverse-DNS UUID | ✅ (`com.corrugator.streammusik`) |
| Numerische Version `M.m.p.b` | ✅ (`0.3.0.1`) |
| `OS` Mindestversion gesetzt | ✅ (macOS 11) |
| `SDKVersion: 2` + `Software.MinimumVersion ≥ 6.5` | ✅ |
| Konfigurierbare Action (nicht statisch) | ✅ (Encoder & Keypad mit eigenständigem State) |
| `showAlert` bei Failure (Permission/osascript-Fehler) | ✅ (alle User-Aktionen) |
| Layout-Elemente innerhalb 200×100 px | ✅ |
| ≤ 10 programmatische Updates / s | ✅ (Marquee 3,3 / s; Poll 0,5 / s) |
| Action-Liste-Icon monochrom weiß auf transparent | ✅ (`action.svg`) |
| Eingabesicherheit Parser (kein Injection via Track-Name) | ✅ (Unit-Separator + NaN-Guard ab v0.3.0.0) |

### Pre-Submission-Audit (Stand v0.3.0.0)

Strukturierter Audit gegen Marketplace-Guidelines + Code-Quality wurde durchgeführt. Ergebnis:

**Blocker behoben:**
- ✅ **B1** — `previews/`-Ordner inkl. Anleitung vorbereitet (Screenshots fehlen noch, siehe Checkliste).
- ✅ **B2** — siehe Checkliste (echte URL setzen vor Submit).
- ✅ **B3** — Trademark „Apple Music" in Description: bewusst stehen gelassen (Elgato hat eigenes Apple-Music-Plugin → Präzedenz).

**Critical Code-Issues behoben (siehe [CHANGELOG.md](CHANGELOG.md) v0.3.0.0):**
- ✅ **C1** — KV-Injection im AppleScript-Parser (Unit Separator).
- ✅ **C2** — Marquee-Timer defensiv (kein Leak möglich).
- ✅ **C3** — `showAlert()` bei jedem User-Aktion-Fehler.
- ✅ **C4** — `isFinite()`-Guard für numerische Felder.

**Bewusst nicht behoben** (siehe „Bekannte Grenzen" unten):
- 🟡 **M3** — kein osascript-Retry bei Hangs (fällt auf cached state zurück).
- 🟡 **M4** — `Category: "StreamMusik"` statt funktionaler Kategorie (kann ggf. im Review-Feedback nachjustiert werden).

### Pre-Submission-Checkliste (Maker Console)

Diese Punkte **müssen** vor dem Submit erledigt sein:

- [x] ~~**`URL` im Manifest** auf echte Landing-Page / Repo setzen~~ — gesetzt auf `https://github.com/Corrugator/streammusik` ab v0.3.0.1.
- [ ] **Mindestens 1 Preview-Screenshot** in [`com.corrugator.streammusik.sdPlugin/previews/`](com.corrugator.streammusik.sdPlugin/previews/) ablegen — siehe README dort für Format-Empfehlungen.
- [ ] **Maker-Account** `corrugator` bei [maker.elgato.com](https://maker.elgato.com) registrieren.
- [ ] **Live-Testlauf** mindestens einmal mit echtem SD+ + Apple Music: Cover wechselt mit Track ✅, Volume reagiert instant ✅, Mute toggelt ✅, Marquee bei langen Titeln ✅, `showAlert` bei Permission-Verweigerung ✅.
- [ ] Frisches `npm run pack` direkt vor dem Upload.

## Bekannte Grenzen

**Funktional:**

- **Nur Apple Music.app**, kein Spotify / kein Browser-Music. Wer das will, muss auf MediaRemote oder eine eigene Quelle pro Player umstellen.
- **Polling alle 2 s** — bei sehr kurzen Tracks (< 2 s) kann ein Wechsel verpasst werden. Realistisch irrelevant.
- **Lautstärke ist System-Lautstärke**, nicht App-Lautstärke. Begründung: funktioniert auch wenn Music gerade nicht spielt, und löst die macOS-OSD-Anzeige aus.
- **Volume-Cache kann bis zu 2 s veraltet sein**, wenn die Lautstärke extern (Keyboard, andere App) verändert wird. Beim nächsten Poll-Tick wird der Cache wieder sync. Realistisch unauffällig.
- Erster Tick nach Track-Wechsel hat eine kleine Verzögerung, weil das Cover frisch nach `/tmp` geschrieben wird (~50 ms).
- Kein Property Inspector — keine Settings nötig. Falls künftig Optionen kommen (z. B. „App-Volume statt System-Volume"), würde der hier ergänzt.

**Bewusst nicht behoben — Future Work:**

- **M3 — kein osascript-Retry bei Hangs.** Aktuell: Timeout nach 5 s, dann Exception → `showAlert` + fallback auf gecachten State. Ein persistenter osascript-Daemon (stdin-pipe statt `execFile` pro Call) würde Spawn-Overhead eliminieren UND Retries trivialisieren. Geschätzt 1–2 h Arbeit.
- **M4 — `Category: "StreamMusik"`.** Guidelines empfehlen eine funktional beschreibende Kategorie wie `"Music"` oder `"Media Controls"`. Erst beim Marketplace-Review klärt sich, ob der Reviewer das anfordert.
- **N1 — Marquee-Offset synchron incrementiert.** Bei extremer setFeedback-Latenz (> 300 ms) könnte die Animation springen. In der Praxis nie beobachtet.
- **N3 — Path-Validation im `loadArtworkDataUrl`.** Aktuell vertrauen wir dem AppleScript-Output für den `/tmp/streammusik-artwork-…`-Pfad. Defensive Validation (`path.startsWith(…)`) wäre marginale Härtung gegen einen Bug in AppleScript, kein realer Angriffsvektor.

---

## Lizenz

Released under the **MIT License** — see [LICENSE](LICENSE).

Copyright (c) 2026 corrugator. Kommerzielle Nutzung ist erlaubt, Namensnennung Pflicht, keine Garantie.

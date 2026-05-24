# Development

Wie du StreamMusik lokal bauen, anpassen und neu releasen kannst.

## Voraussetzungen

- macOS
- Node.js 20 oder höher
- Stream Deck Software 6.5+
- [Elgato Stream Deck CLI](https://www.npmjs.com/package/@elgato/cli): `npm install -g @elgato/cli`
- Für Icon-Regenerierung: `brew install librsvg`

## Setup

```bash
git clone https://github.com/Corrugator/streammusik.git
cd streammusik
npm install

# Plugin als Symlink ins Stream Deck Plugins-Verzeichnis einhängen
streamdeck link com.corrugator.streammusik.sdPlugin
```

## Build & Pack

```bash
npm run build      # Einmal kompilieren
npm run watch      # Auto-rebuild + Plugin-Restart bei Änderungen
npm run validate   # Manifest + Assets gegen Schema prüfen
npm run pack       # .streamDeckPlugin-Datei für Distribution erzeugen
```

## Logs

```
~/Library/Application Support/com.elgato.StreamDeck/Plugins/com.corrugator.streammusik.sdPlugin/logs/
```

## Icons regenerieren

Nach Edits in `assets/*.svg`:

```bash
rsvg-convert -w 256 -h 256 assets/marketplace.svg -o com.corrugator.streammusik.sdPlugin/imgs/plugin/marketplace.png
rsvg-convert -w 512 -h 512 assets/marketplace.svg -o com.corrugator.streammusik.sdPlugin/imgs/plugin/marketplace@2x.png
rsvg-convert -w 72  -h 72  assets/key.svg         -o com.corrugator.streammusik.sdPlugin/imgs/actions/now-playing/key.png
rsvg-convert -w 144 -h 144 assets/key.svg         -o com.corrugator.streammusik.sdPlugin/imgs/actions/now-playing/key@2x.png
```

## Release-Workflow

> **Verbindliche Regeln:**
> 1. Jede inhaltliche Änderung am Plugin wird **neu versioniert** und erzeugt eine neue `.streamDeckPlugin`-Datei.
> 2. Jede Änderung wird in [`CHANGELOG.md`](CHANGELOG.md) dokumentiert.

### Versionsschema

Stream Deck verlangt vier Komponenten: `{major}.{minor}.{patch}.{build}` (z. B. `0.3.0.1`).

| Komponente | Wann bumpen |
|---|---|
| **major** (`X.0.0.0`) | Breaking Change (UUID-Änderung, Pflicht-Settings entfernt) |
| **minor** (`0.X.0.0`) | Neues Feature, neues Layout, neue Action |
| **patch** (`0.0.X.0`) | Bug-Fix, Text-Korrektur, Performance-Tweak |
| **build** (`0.0.0.X`) | Reiner Re-Pack ohne Code-Change |

### Schritte pro Release

1. **Code-Änderung**
2. **README / ARCHITECTURE / DEVELOPMENT** aktualisieren — alle vom Change betroffenen Sektionen
3. **`manifest.json`** → `Version` bumpen
4. **`package.json`** → `version` synchron halten (drei Komponenten reichen für npm)
5. **`CHANGELOG.md`** → kurzer Eintrag
6. **`npm run pack`** → erzeugt frische `com.corrugator.streammusik.streamDeckPlugin`
7. (optional) Git-Tag `v{version}`

### Während Dev (gelinkt)

Im Symlink-Modus reicht für Live-Tests `npm run watch` oder `streamdeck restart com.corrugator.streammusik` — **kein Version-Bump nötig**, solange nichts veröffentlicht wird.

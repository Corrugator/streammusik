# Stream Deck Musik Viewer

Apple-Music-Now-Playing für deinen **Stream Deck +** Encoder. Cover-Art als Vollbild auf dem Touch-Display, Titel + Artist scrollend, Drehregler für Lautstärke und Mute, Touch-Tap für Play/Pause.

> **macOS · Apple Music.app · nur Stream Deck + (Encoder).**

## Features

| Element | Geste | Wirkung |
|---|---|---|
| Encoder Touch-Display | — | Cover-Art als Vollbild-Hintergrund + Titel/Artist (scrollend bei langen Namen) + Volume-Bar |
| Dial | Drehen | System-Lautstärke +/− |
| Dial | Drücken | Mute toggeln |
| Touch-Display | Tap | Play / Pause |

Bei Fehlern (z. B. fehlender Automation-Permission) blendet das Encoder-Display das Stream-Deck-Alert-Icon ein.

## Voraussetzungen

- **macOS 11+**
- **Stream Deck Software 6.9+**
- **Apple Music App** (auf macOS vorinstalliert)
- Beim ersten Aufruf bittet macOS um **Automation-Permission** für Music
  (*Systemeinstellungen → Datenschutz & Sicherheit → Automation → Stream Deck → Music ✅*)

## Installation

1. Aktuelle [`com.corrugator.streamdeck-musik-viewer.streamDeckPlugin`](https://github.com/Corrugator/streamdeck-musik-viewer/releases) runterladen
2. Doppelklicken → Stream Deck installiert das Plugin
3. Action **„Now Playing"** auf einen **Stream Deck + Encoder** ziehen
4. Beim ersten Track-Wechsel die Automation-Permission bestätigen

## Bekannte Grenzen

- **Nur Stream Deck +** — das Plugin nutzt ausschließlich das Encoder-Touch-Display und den Drehregler. Auf normalen Stream Deck Keypads (ohne Encoder) ist die Action gar nicht erst verfügbar.
- **Nur Apple Music.app** — kein Spotify, kein Browser-Player
- **Lautstärke ist System-Lautstärke** (löst die macOS-OSD-Anzeige aus)
- Track-Polling alle 2 s — bei extrem kurzen Tracks könnte ein Wechsel verpasst werden
- Volume-Cache kann bis zu 2 s veraltet sein, wenn die Lautstärke extern (z. B. per Keyboard) verändert wird

## Mehr lesen

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — wie das Plugin technisch funktioniert (AppleScript-Anbindung, Rendering, Latenz-Optimierungen, Marquee, Custom-Layout)
- **[DEVELOPMENT.md](DEVELOPMENT.md)** — lokal bauen, Dev-Workflow, Release-Prozess
- **[CHANGELOG.md](CHANGELOG.md)** — was sich pro Version geändert hat

## Lizenz

Released under the **MIT License** — see [LICENSE](LICENSE).
Copyright © 2026 corrugator.


# StreamMusik

Apple-Music-Now-Playing für dein Stream Deck. Cover-Art auf der Taste, Track + Artist + Volume + Mute auf dem Stream Deck+ Encoder.

> **macOS · Apple Music.app · alle Stream-Deck-Modelle (am schönsten auf SD+ / XL).**

## Features

| Hardware | Geste | Wirkung |
|---|---|---|
| Keypad-Taste | Tap | Play / Pause |
| Keypad-Display | — | Cover-Art als Hintergrund + Titel/Artist |
| SD+ Encoder Touch-Display | — | Cover + Titel/Artist (scrollend bei langen Namen) + Volume-Bar |
| SD+ Dial | Drehen | System-Lautstärke +/− |
| SD+ Dial | Drücken | Mute toggeln |
| SD+ Encoder Touch | Tap | Play / Pause |

Bei Fehlern (z. B. fehlender Automation-Permission) blendet die Taste das Stream-Deck-Alert-Icon ein.

## Voraussetzungen

- **macOS 11+**
- **Stream Deck Software 6.9+**
- **Apple Music App** (auf macOS vorinstalliert)
- Beim ersten Aufruf bittet macOS um **Automation-Permission** für Music
  (*Systemeinstellungen → Datenschutz & Sicherheit → Automation → Stream Deck → Music ✅*)

## Installation

1. Aktuelle [`com.corrugator.streammusik.streamDeckPlugin`](https://github.com/Corrugator/streammusik/releases) runterladen
2. Doppelklicken → Stream Deck installiert das Plugin
3. Action **„Now Playing"** auf eine Taste oder einen Encoder ziehen
4. Beim ersten Track-Wechsel die Automation-Permission bestätigen

## Bekannte Grenzen

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


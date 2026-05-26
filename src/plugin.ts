import streamDeck from "@elgato/streamdeck";

import { NowPlaying } from "./actions/now-playing.js";
import { cleanupOldArtwork } from "./lib/apple-music.js";

streamDeck.logger.setLevel("warn");
streamDeck.logger.info("Stream Deck Musik Viewer plugin starting…");

// Best-effort cleanup of stale artwork files in /tmp from previous sessions.
// Fire-and-forget — don't block startup.
void cleanupOldArtwork().catch((e) => streamDeck.logger.warn(`artwork cleanup failed: ${e}`));

streamDeck.actions.registerAction(new NowPlaying());

streamDeck.connect();

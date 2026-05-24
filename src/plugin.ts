import streamDeck from "@elgato/streamdeck";

import { NowPlaying } from "./actions/now-playing.js";

streamDeck.logger.setLevel("trace");
streamDeck.logger.info("StreamMusik plugin starting…");

streamDeck.actions.registerAction(new NowPlaying());

streamDeck.connect();

import streamDeck, {
	action,
	DialDownEvent,
	DialRotateEvent,
	KeyDownEvent,
	SingletonAction,
	TouchTapEvent,
	WillAppearEvent,
	WillDisappearEvent,
	type DialAction,
	type FeedbackPayload,
	type KeyAction,
} from "@elgato/streamdeck";
import { readFile } from "node:fs/promises";

import {
	getSystemAudio,
	getTrackInfo,
	playPause,
	setSystemMuted,
	setSystemVolume,
	type TrackInfo,
} from "../lib/apple-music.js";

const POLL_MS = 2000;
const VOLUME_STEP = 2;
/** How long to coalesce rapid dial rotations before firing one osascript call. */
const FLUSH_DEBOUNCE_MS = 30;
/**
 * Window after a user audio action (rotate/mute) during which the poll-tick must
 * NOT overwrite the cache. Covers debounce + osascript round-trip + safety buffer.
 */
const USER_ACTION_GRACE_MS = 500;

/**
 * Char limits the layout's text slots can display at the current font sizes.
 * Strings longer than this scroll horizontally (marquee).
 */
const TRACK_MAX = 18;
const ARTIST_MAX = 22;
const MARQUEE_TICK_MS = 300;
const MARQUEE_SEPARATOR = "  •  ";

type Snapshot = {
	pid?: string;
	state?: string;
	volume?: number;
	muted?: boolean;
};

type SystemAudioResult = { volume: number; muted: boolean };

@action({ UUID: "com.corrugator.streamdeck-musik-viewer.now-playing" })
export class NowPlaying extends SingletonAction {
	#timer?: NodeJS.Timeout;
	#snapshot: Snapshot = {};

	// Low-latency state cache — lets us update the UI instantly without waiting for osascript.
	#cachedVolume?: number;
	#cachedMuted?: boolean;
	#flushTimer?: NodeJS.Timeout;
	#pendingUnmute = false;
	/** Wall-clock timestamp of last user audio action — guards cache against stale poll reads. */
	#lastUserActionAt = 0;

	// Marquee state — text scrolling when track/artist exceed the layout's char limit.
	#marqueeTimer?: NodeJS.Timeout;
	#marqueeOffset = 0;
	#marqueeTrack = "";
	#marqueeArtist = "";

	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		streamDeck.logger.info(`onWillAppear controller=${ev.action.isDial() ? "dial" : "key"}`);
		this.#snapshot = {};
		await this.#tick();
		this.#timer ??= setInterval(() => void this.#tick(), POLL_MS);
	}

	override onWillDisappear(_ev: WillDisappearEvent): void {
		if (this.#timer) clearInterval(this.#timer);
		if (this.#flushTimer) clearTimeout(this.#flushTimer);
		this.#stopMarquee();
		this.#timer = undefined;
		this.#flushTimer = undefined;
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		try {
			await playPause();
			await this.#tick();
		} catch (e) {
			streamDeck.logger.warn(`playPause failed: ${e}`);
			await ev.action.showAlert();
		}
	}

	override async onTouchTap(ev: TouchTapEvent): Promise<void> {
		try {
			await playPause();
			await this.#tick();
		} catch (e) {
			streamDeck.logger.warn(`playPause failed: ${e}`);
			await ev.action.showAlert();
		}
	}

	override async onDialDown(ev: DialDownEvent): Promise<void> {
		this.#lastUserActionAt = Date.now();
		const next = !(this.#cachedMuted ?? false);
		this.#cachedMuted = next;
		// UI immediately, OS in background.
		await this.#renderDialAudioOnly();
		try {
			await setSystemMuted(next);
		} catch (e) {
			streamDeck.logger.warn(`setMuted failed: ${e}`);
			// Roll back optimistic UI update.
			this.#cachedMuted = !next;
			await this.#renderDialAudioOnly();
			await ev.action.showAlert();
		}
	}

	override async onDialRotate(ev: DialRotateEvent): Promise<void> {
		this.#lastUserActionAt = Date.now();
		const current = this.#cachedVolume ?? 0;
		const wasMuted = this.#cachedMuted ?? false;
		const next = Math.max(0, Math.min(100, current + ev.payload.ticks * VOLUME_STEP));

		this.#cachedVolume = next;
		if (ev.payload.ticks > 0 && wasMuted) {
			this.#cachedMuted = false;
			this.#pendingUnmute = true;
		}

		// Render from cache — no osascript yet.
		await this.#renderDialAudioOnly();

		// Coalesce rapid rotations into one OS call.
		if (this.#flushTimer) clearTimeout(this.#flushTimer);
		this.#flushTimer = setTimeout(() => void this.#flushVolume(ev.action), FLUSH_DEBOUNCE_MS);
	}

	async #flushVolume(action: DialAction): Promise<void> {
		this.#flushTimer = undefined;
		const target = this.#cachedVolume;
		if (target === undefined) return;
		const unmute = this.#pendingUnmute;
		this.#pendingUnmute = false;
		try {
			await setSystemVolume(target, { unmute });
		} catch (e) {
			streamDeck.logger.warn(`flushVolume failed: ${e}`);
			await action.showAlert();
		}
	}

	async #renderDialAudioOnly(): Promise<void> {
		const vol = this.#cachedVolume ?? 0;
		const muted = this.#cachedMuted ?? false;
		const feedback: FeedbackPayload = {
			value: muted ? "Muted" : `${vol}%`,
			indicator: { value: muted ? 0 : vol },
		} as FeedbackPayload;
		for (const action of this.actions) {
			if (action.isDial()) await action.setFeedback(feedback);
		}
	}

	async #tick(): Promise<void> {
		const [track, audio] = await Promise.all([getTrackInfo(), safeGetAudio()]);

		// Only sync cache from system when no user audio action is in flight or recent.
		// The flush timer covers the active debounce window; the grace timestamp covers
		// the osascript round-trip that follows the flush (poll-tick could otherwise
		// overwrite the just-set value with a stale system read).
		const rotationRecent = Date.now() - this.#lastUserActionAt < USER_ACTION_GRACE_MS;
		if (!this.#flushTimer && !rotationRecent) {
			this.#cachedVolume = audio.volume;
			this.#cachedMuted = audio.muted;
		}

		const effectiveAudio: SystemAudioResult = {
			volume: this.#cachedVolume ?? audio.volume,
			muted: this.#cachedMuted ?? audio.muted,
		};

		for (const action of this.actions) {
			if (action.isDial()) await this.#renderDial(action, track, effectiveAudio);
			else if (action.isKey()) await this.#renderKey(action, track);
		}
		this.#snapshot = {
			pid: track.pid,
			state: track.state,
			volume: effectiveAudio.volume,
			muted: effectiveAudio.muted,
		};
	}

	async #renderKey(action: KeyAction, track: TrackInfo): Promise<void> {
		const pidChanged = track.pid !== this.#snapshot.pid;
		const stateChanged = track.state !== this.#snapshot.state;
		if (!pidChanged && !stateChanged) return;

		if (track.state === "playing" || track.state === "paused") {
			const cover = await loadArtworkDataUrl(track.artworkPath);
			await action.setImage(cover ?? undefined);
			await action.setTitle(formatKeyTitle(track));
		} else {
			await action.setImage(undefined);
			await action.setTitle(track.state === "not_running" ? "Apple Music" : "Stopped");
		}
	}

	async #renderDial(action: DialAction, track: TrackInfo, audio: SystemAudioResult): Promise<void> {
		const pidChanged = track.pid !== this.#snapshot.pid;
		const playing = track.state === "playing" || track.state === "paused";

		const trackFull = playing
			? (track.name ?? "")
			: track.state === "not_running"
				? "Apple Music"
				: "Stopped";
		const artistFull = playing ? (track.artist ?? "") : "";

		// Sync marquee state when the displayed text changes.
		if (trackFull !== this.#marqueeTrack || artistFull !== this.#marqueeArtist) {
			this.#marqueeTrack = trackFull;
			this.#marqueeArtist = artistFull;
			this.#marqueeOffset = 0;
			const needs = trackFull.length > TRACK_MAX || artistFull.length > ARTIST_MAX;
			if (needs) this.#startMarquee();
			else this.#stopMarquee();
		}

		// Custom layout keys: track, artist, icon, value, indicator.
		const feedback: FeedbackPayload = {
			track: marqueeSlice(trackFull, TRACK_MAX, this.#marqueeOffset),
			artist: marqueeSlice(artistFull, ARTIST_MAX, this.#marqueeOffset),
			value: audio.muted ? "Muted" : `${audio.volume}%`,
			indicator: { value: audio.muted ? 0 : audio.volume },
		} as FeedbackPayload;

		// Cover read is expensive — only on track change.
		if (pidChanged && playing) {
			const cover = await loadArtworkDataUrl(track.artworkPath);
			if (cover) feedback.icon = cover;
		}

		await action.setFeedback(feedback);
	}

	#startMarquee(): void {
		// Defensive: always clear before starting to avoid double-intervals,
		// even if future callers forget to call #stopMarquee() first.
		if (this.#marqueeTimer) clearInterval(this.#marqueeTimer);
		this.#marqueeTimer = setInterval(() => {
			this.#marqueeOffset++;
			void this.#renderMarqueeFrame();
		}, MARQUEE_TICK_MS);
	}

	#stopMarquee(): void {
		if (this.#marqueeTimer) {
			clearInterval(this.#marqueeTimer);
			this.#marqueeTimer = undefined;
		}
		this.#marqueeOffset = 0;
	}

	async #renderMarqueeFrame(): Promise<void> {
		const feedback: FeedbackPayload = {
			track: marqueeSlice(this.#marqueeTrack, TRACK_MAX, this.#marqueeOffset),
			artist: marqueeSlice(this.#marqueeArtist, ARTIST_MAX, this.#marqueeOffset),
		} as FeedbackPayload;
		for (const action of this.actions) {
			if (action.isDial()) await action.setFeedback(feedback);
		}
	}
}

async function safeGetAudio(): Promise<SystemAudioResult> {
	try {
		return await getSystemAudio();
	} catch {
		return { volume: 0, muted: false };
	}
}

function formatKeyTitle(t: TrackInfo): string {
	const name = truncate(t.name, 18);
	const artist = truncate(t.artist, 18);
	return [artist, name].filter(Boolean).join("\n");
}

function truncate(s: string | undefined, max: number): string {
	if (!s) return "";
	return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/**
 * Marquee window: when `text` fits in `max` chars, returns as-is. When it
 * overflows, returns a rotating slice of `text + SEPARATOR` so the animation
 * loops seamlessly.
 */
function marqueeSlice(text: string, max: number, offset: number): string {
	if (!text) return "";
	if (text.length <= max) return text;
	const padded = text + MARQUEE_SEPARATOR;
	const start = offset % padded.length;
	return (padded + padded).slice(start, start + max);
}

async function loadArtworkDataUrl(path?: string): Promise<string | null> {
	if (!path) return null;
	try {
		const buf = await readFile(path);
		const mime = detectImageMime(buf);
		return `data:${mime};base64,${buf.toString("base64")}`;
	} catch {
		return null;
	}
}

function detectImageMime(buf: Buffer): string {
	if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
	if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
	return "image/png";
}

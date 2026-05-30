import { execFile } from "node:child_process";
import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const ARTWORK_DIR = "/tmp";
const ARTWORK_PREFIX = "sdmv-artwork-";

export type PlayerState = "playing" | "paused" | "stopped" | "not_running";

export type TrackInfo = {
	state: PlayerState;
	name?: string;
	artist?: string;
	album?: string;
	duration?: number;
	position?: number;
	/** Persistent track ID — stable across launches, used for artwork caching. */
	pid?: string;
	/** Absolute path to extracted artwork PNG, or empty when unavailable. */
	artworkPath?: string;
};

export type SystemAudio = { volume: number; muted: boolean };

/**
 * Records in the AppleScript output are joined by ASCII Unit Separator (0x1F)
 * instead of linefeed — Track titles can legitimately contain newlines, and
 * splitting on those would let a malicious title overwrite e.g. `state`.
 * Unit Separator is a control char and cannot appear in iTunes/Music metadata.
 */
const RECORD_SEP = "\x1F";

/**
 * Reads track metadata + writes artwork to /tmp on track changes.
 * Artwork is cached per persistent track ID; re-runs are cheap.
 */
const TRACK_INFO_SCRIPT = `
on run
	set sep to (character id 31)
	tell application "System Events"
		if not (exists (processes where name is "Music")) then return "state=not_running"
	end tell
	tell application "Music"
		try
			set ps to (player state as string)
		on error
			return "state=not_running"
		end try
		if ps is "stopped" then return "state=stopped"
		try
			set t to current track
			set trackName to name of t as string
			set trackArtist to artist of t as string
			set trackAlbum to album of t as string
			set trackDur to (duration of t) as string
			set trackPos to (player position) as string
			set trackPid to (persistent ID of t) as string
		on error
			return "state=" & ps
		end try
		set artPath to ""
		try
			set artPath to "/tmp/sdmv-artwork-" & trackPid & ".png"
			set hasFile to false
			try
				do shell script "test -s " & quoted form of artPath
				set hasFile to true
			end try
			if not hasFile then
				set artData to (data of artwork 1 of t)
				set fileRef to open for access POSIX file artPath with write permission
				set eof of fileRef to 0
				write artData to fileRef
				close access fileRef
			end if
		on error
			set artPath to ""
		end try
		return "state=" & ps & sep & ¬
			"name=" & trackName & sep & ¬
			"artist=" & trackArtist & sep & ¬
			"album=" & trackAlbum & sep & ¬
			"duration=" & trackDur & sep & ¬
			"position=" & trackPos & sep & ¬
			"pid=" & trackPid & sep & ¬
			"artwork=" & artPath
	end tell
end run
`;

const SYSTEM_AUDIO_SCRIPT = `
set sep to (character id 31)
set s to (get volume settings)
return "volume=" & (output volume of s as string) & sep & ¬
	"muted=" & (output muted of s as string)
`;

async function osascript(script: string): Promise<string> {
	const { stdout } = await run("/usr/bin/osascript", ["-e", script], {
		timeout: 5000,
		maxBuffer: 1024 * 1024,
	});
	return stdout.trim();
}

function parseKv(out: string): Record<string, string> {
	const obj: Record<string, string> = {};
	// Split on Unit Separator (multi-field outputs) or single-line fallback.
	const records = out.includes(RECORD_SEP) ? out.split(RECORD_SEP) : out.split(/\r?\n/);
	for (const record of records) {
		const idx = record.indexOf("=");
		if (idx === -1) continue;
		obj[record.slice(0, idx).trim()] = record.slice(idx + 1);
	}
	return obj;
}

function toFiniteNumber(s: string | undefined): number | undefined {
	if (!s) return undefined;
	// AppleScript formats decimals using the system locale — on a German Mac that
	// means "242,044" instead of "242.044". Normalise comma → dot before parsing
	// so Number() doesn't bail out to NaN.
	const normalized = s.replace(",", ".");
	const n = Number(normalized);
	return Number.isFinite(n) ? n : undefined;
}

export async function getTrackInfo(): Promise<TrackInfo> {
	try {
		const raw = await osascript(TRACK_INFO_SCRIPT);
		const kv = parseKv(raw);
		const stateRaw = (kv.state ?? "stopped").trim();
		const state: PlayerState =
			stateRaw === "playing" || stateRaw === "paused" || stateRaw === "stopped" || stateRaw === "not_running"
				? stateRaw
				: "stopped";
		if (state === "stopped" || state === "not_running") return { state };
		return {
			state,
			name: kv.name,
			artist: kv.artist,
			album: kv.album,
			duration: toFiniteNumber(kv.duration),
			position: toFiniteNumber(kv.position),
			pid: kv.pid,
			artworkPath: kv.artwork || undefined,
		};
	} catch {
		return { state: "not_running" };
	}
}

export async function getSystemAudio(): Promise<SystemAudio> {
	const raw = await osascript(SYSTEM_AUDIO_SCRIPT);
	const kv = parseKv(raw);
	const v = toFiniteNumber(kv.volume) ?? 0;
	return {
		volume: Math.max(0, Math.min(100, v)),
		muted: kv.muted?.trim() === "true",
	};
}

export async function setSystemVolume(volume: number, opts?: { unmute?: boolean }): Promise<void> {
	const v = Math.max(0, Math.min(100, Math.round(volume)));
	// Combine set + unmute into a single osascript call to halve round-trips.
	const muteClause = opts?.unmute ? " without output muted" : "";
	await osascript(`set volume output volume ${v}${muteClause}`);
}

export async function setSystemMuted(muted: boolean): Promise<void> {
	await osascript(`set volume ${muted ? "with" : "without"} output muted`);
}

export async function playPause(): Promise<void> {
	await osascript('tell application "Music" to playpause');
}

/**
 * Removes cached artwork files in /tmp older than `maxAgeDays`. Best-effort —
 * silently ignores files we can't stat or delete (permissions, race with
 * another process, etc.). Call once at plugin startup.
 */
export async function cleanupOldArtwork(maxAgeDays = 30): Promise<void> {
	const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
	const now = Date.now();
	let entries: string[];
	try {
		entries = await readdir(ARTWORK_DIR);
	} catch {
		return;
	}
	for (const name of entries) {
		if (!name.startsWith(ARTWORK_PREFIX)) continue;
		const path = join(ARTWORK_DIR, name);
		try {
			const s = await stat(path);
			if (now - s.mtimeMs > maxAgeMs) await unlink(path);
		} catch {
			// ignore — file went away, no permission, etc.
		}
	}
}

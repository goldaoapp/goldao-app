import { useCallback, useState } from "react";

// Sound files live in public/sounds/. Missing files fail silently.
export type SoundKey =
  | "success"
  | "diamond"
  | "count"
  | "collapse"
  | "crack"
  | "suspense"
  | "treasure"
  | "miss"
  | "jackpot"
  | "reveal"
  | "hit"
  | "enter";

const SOURCES: Record<SoundKey, string> = {
  success: "/sounds/success.mp3",
  diamond: "/sounds/diamond.mp3",
  count: "/sounds/count.mp3",
  collapse: "/sounds/collapse.mp3",
  crack: "/sounds/crack.mp3",
  suspense: "/sounds/suspense.mp3",
  treasure: "/sounds/treasure.mp3",
  miss: "/sounds/miss.mp3",
  jackpot: "/sounds/jackpot.mp3",
  reveal: "/sounds/reveal.mp3",
  hit: "/sounds/hit.mp3",
  enter: "/sounds/enter.mp3",
};

const VOLUME = 0.6;
/** Relative volume per sound (1 when missing). */
const GAIN: Partial<Record<SoundKey, number>> = { count: 0.5, hit: 0.8 };
/** Most voices of the same sound playing at once (the rest are skipped). */
const MAX_VOICES: Partial<Record<SoundKey, number>> = { count: 3, hit: 2 };
const DEFAULT_VOICES = 6;
const STORAGE_KEY = "goldao.game.muted";

type AudioCtor = typeof AudioContext;

let muted = readMuted();
let context: AudioContext | null = null;
let unlockInstalled = false;
const buffers: Partial<Record<SoundKey, AudioBuffer>> = {};
const pending: Partial<Record<SoundKey, Promise<void>>> = {};
const failed: Partial<Record<SoundKey, boolean>> = {};
const voices: Partial<Record<SoundKey, number>> = {};

function readMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMuted(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Storage unavailable: the choice lasts for this page load only.
  }
}

/**
 * One shared audio context plays every sound from decoded buffers. Unlike one
 * <audio> element per play, it has no limit on overlapping sounds, so a long
 * Auto dig or a rolling counter cannot make the browser drop later sounds.
 */
function getContext(): AudioContext | null {
  if (context) return context;
  if (typeof window === "undefined") return null;
  const Ctor: AudioCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioCtor })
      .webkitAudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    return null;
  }
  return context;
}

function resumeContext() {
  const ctx = context;
  if (ctx && ctx.state !== "running") void ctx.resume().catch(() => {});
}

/** Browsers keep the context suspended until a tap, click or key press. */
function installUnlock() {
  if (unlockInstalled || typeof window === "undefined") return;
  unlockInstalled = true;
  for (const type of ["pointerdown", "touchend", "keydown"]) {
    window.addEventListener(type, resumeContext, { capture: true });
  }
}

function loadBuffer(key: SoundKey): Promise<void> {
  const existing = pending[key];
  if (existing) return existing;
  const ctx = getContext();
  if (!ctx || failed[key]) return Promise.resolve();
  const job = fetch(SOURCES[key])
    .then((res) => {
      // Some hosts answer a missing file with the app's HTML page.
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || type.includes("text/html")) {
        throw new Error(`not found (${res.status})`);
      }
      return res.arrayBuffer();
    })
    .then((data) => ctx.decodeAudioData(data))
    .then((buffer) => {
      buffers[key] = buffer;
    })
    .catch((e: unknown) => {
      failed[key] = true;
      console.warn(`[sounds] ${SOURCES[key]} could not be loaded:`, e);
    });
  pending[key] = job;
  return job;
}

/** Downloads and decodes every sound so the first pick plays without delay. */
export function preloadSounds() {
  installUnlock();
  getContext();
  for (const key of Object.keys(SOURCES) as SoundKey[]) void loadBuffer(key);
}

/** Playback speed of the "reveal" sound for the n-th pick: one pentatonic step up per pick. */
const REVEAL_RATES = [1, 1.12, 1.26, 1.5, 1.68, 2, 2.25, 2.52, 3, 3.37];
export function revealRate(pick: number): number {
  const i = Math.min(REVEAL_RATES.length, Math.max(1, Math.round(pick))) - 1;
  return REVEAL_RATES[i];
}

/**
 * Plays a sound; overlapping plays are allowed up to a small limit per sound.
 * `rate` changes the playback speed (and so the pitch), 1 by default.
 */
export function playSound(key: SoundKey, rate = 1) {
  if (muted) return;
  const ctx = getContext();
  if (!ctx) return;
  installUnlock();
  resumeContext();
  // Sounds started while the context is suspended would queue up and burst out
  // together once it resumes, so they are skipped instead.
  if (ctx.state !== "running") return;
  const buffer = buffers[key];
  if (!buffer) {
    void loadBuffer(key);
    return;
  }
  const active = voices[key] ?? 0;
  if (active >= (MAX_VOICES[key] ?? DEFAULT_VOICES)) return;
  try {
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    gain.gain.value = VOLUME * (GAIN[key] ?? 1);
    source.connect(gain);
    gain.connect(ctx.destination);
    voices[key] = active + 1;
    source.onended = () => {
      voices[key] = Math.max(0, (voices[key] ?? 1) - 1);
      source.disconnect();
      gain.disconnect();
    };
    source.start(0);
  } catch {
    voices[key] = Math.max(0, (voices[key] ?? 1) - 1);
  }
}

/** Mute switch shared by every component, remembered per browser. */
export function useSoundToggle() {
  const [value, setValue] = useState(muted);
  const toggleMuted = useCallback(() => {
    muted = !muted;
    writeMuted(muted);
    setValue(muted);
  }, []);
  return { muted: value, toggleMuted };
}

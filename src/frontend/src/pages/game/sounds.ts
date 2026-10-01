import { useCallback, useState } from "react";

// Sound files live in public/sounds/. Missing files fail silently.
export type SoundKey = "success" | "diamond";

const SOURCES: Record<SoundKey, string> = {
  success: "/sounds/success.mp3",
  diamond: "/sounds/diamond.mp3",
};

const VOLUME = 0.6;
const STORAGE_KEY = "goldao.game.muted";

const cache: Partial<Record<SoundKey, HTMLAudioElement>> = {};
let muted = readMuted();

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

function load(key: SoundKey): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  let audio = cache[key];
  if (!audio) {
    audio = new Audio(SOURCES[key]);
    audio.preload = "auto";
    cache[key] = audio;
  }
  return audio;
}

/** Starts downloading every sound so the first pick plays without delay. */
export function preloadSounds() {
  for (const key of Object.keys(SOURCES) as SoundKey[]) load(key);
}

/** Plays a sound; overlapping plays are allowed (each one uses a copy). */
export function playSound(key: SoundKey) {
  if (muted) return;
  const base = load(key);
  if (!base) return;
  try {
    const node = base.cloneNode(true) as HTMLAudioElement;
    node.volume = VOLUME;
    void node.play().catch(() => {});
  } catch {
    // Autoplay blocked or file missing: ignore.
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

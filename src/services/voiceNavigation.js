/**
 * Voice navigation and safety warnings (browser Speech Synthesis).
 *
 * Optional by design: both voice channels are off until the user enables them.
 * Every entry point degrades to a silent no-op when Speech Synthesis is not
 * available (older browsers, SSR, tests).
 */
import { nearestSegment } from "../utils/geo";

const STORAGE_KEYS = {
  navigation: "voiceNavigationEnabled",
  safety: "voiceSafetyEnabled",
};

/** True when the browser exposes Speech Synthesis. */
export function isSpeechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

/** Load persisted voice settings (defaults: both off — voice is opt-in). */
export function loadVoiceSettings() {
  const defaults = { navigation: false, safety: false };
  try {
    if (typeof localStorage === "undefined") return defaults;
    return {
      navigation: localStorage.getItem(STORAGE_KEYS.navigation) === "true",
      safety: localStorage.getItem(STORAGE_KEYS.safety) === "true",
    };
  } catch {
    return defaults;
  }
}

/** Persist voice settings. */
export function saveVoiceSettings(settings) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEYS.navigation, String(Boolean(settings?.navigation)));
    localStorage.setItem(STORAGE_KEYS.safety, String(Boolean(settings?.safety)));
  } catch { /* storage unavailable — settings stay session-only */ }
}

/** Pick a reasonable English voice when available. */
function pickVoice(synth) {
  try {
    const voices = synth.getVoices?.() || [];
    return voices.find((v) => /^en(-|_)/i.test(v.lang)) || voices[0] || null;
  } catch {
    return null;
  }
}

/**
 * Speak text. Respects per-channel settings unless `force` is true.
 * Safety warnings interrupt whatever is currently being spoken.
 * @returns {boolean} true when an utterance was actually queued
 */
export function speak(text, { kind = "navigation", force = false } = {}) {
  if (!isSpeechSupported() || !text) return false;
  if (!force) {
    const settings = loadVoiceSettings();
    if (kind === "safety" && !settings.safety) return false;
    if (kind === "navigation" && !settings.navigation) return false;
  }
  try {
    const synth = window.speechSynthesis;
    if (kind === "safety") synth.cancel(); // warnings must not queue behind directions
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = kind === "safety" ? 1.05 : 1;
    const voice = pickVoice(synth);
    if (voice) utterance.voice = voice;
    synth.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

/** Speak a navigation instruction (no-op unless navigation voice is enabled). */
export function speakNavigationInstruction(text) {
  return speak(text, { kind: "navigation" });
}

/** Speak a safety warning (no-op unless safety warnings are enabled). */
export function speakSafetyWarning(text) {
  return speak(text, { kind: "safety" });
}

/** Stop all speech immediately (used when voice is switched off). */
export function cancelSpeech() {
  try {
    if (isSpeechSupported()) window.speechSynthesis.cancel();
  } catch { /* ignore */ }
}

/** Human phrase for a maneuver step ("Turn left", "Keep right", …). */
export function maneuverPhrase(step) {
  const type = step?.maneuver?.type;
  const mod = String(step?.maneuver?.modifier || "").toLowerCase();
  switch (type) {
    case "depart":
      return "Start the route";
    case "arrive":
      return "Arrive at your destination";
    case "turn":
      return `Turn ${mod || "ahead"}`;
    case "fork":
      if (mod.includes("left")) return "Keep left";
      if (mod.includes("right")) return "Keep right";
      return "Continue";
    case "merge":
      return mod ? `Merge ${mod}` : "Merge";
    case "roundabout":
    case "rotary":
      return "Take the roundabout";
    case "exit roundabout":
    case "exit rotary":
      return "Exit the roundabout";
    default:
      return step?.name ? `Continue onto ${step.name}` : "Continue ahead";
  }
}

/** Spoken distance: "200 meters", "1.2 kilometers". */
export function formatSpokenDistance(meters) {
  if (!Number.isFinite(meters) || meters < 0) return "";
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} kilometers`;
  if (meters >= 100) return `${Math.round(meters / 50) * 50} meters`;
  return `${Math.max(10, Math.round(meters / 10) * 10)} meters`;
}

/**
 * Pick the next unannounced maneuver step that is close enough to announce.
 * @param {Object} args
 * @param {Array} args.routeCoords selected route geometry coordinates
 * @param {Array} args.steps turn-by-turn steps of the route
 * @param {Array} args.userCoord user [lng, lat]
 * @param {Set} args.announcedSet step keys already announced for this route
 * @param {number} [args.announceRadiusMeters]
 * @returns {null | {key:string, text:string, distanceMeters:number, index:number}}
 */
export function pickNextStepAnnouncement({ routeCoords, steps, userCoord, announcedSet, announceRadiusMeters = 500 }) {
  if (!Array.isArray(routeCoords) || routeCoords.length < 2 || !Array.isArray(steps) || !steps.length) return null;
  const userSeg = nearestSegment(userCoord, routeCoords);
  if (!userSeg) return null;

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const loc = step?.maneuver?.location;
    if (!Array.isArray(loc)) continue;
    const seg = nearestSegment(loc, routeCoords);
    if (!seg) continue;
    if (seg.along <= userSeg.along + 15) continue; // passed or essentially at the user
    const distance = seg.along - userSeg.along;
    const key = `step-${i}`;
    if (announcedSet?.has(key)) continue; // already announced for this route
    if (distance > announceRadiusMeters) return null; // next maneuver still far away
    return {
      key,
      index: i,
      distanceMeters: Math.round(distance),
      text: `${maneuverPhrase(step)} in ${formatSpokenDistance(distance)}.`,
    };
  }
  return null;
}

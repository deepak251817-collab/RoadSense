/**
 * Pothole system confidence.
 *
 * Estimates how much the system trusts a hazard (single report or cluster)
 * from the evidence it actually has. This is explicitly a *system confidence*
 * heuristic — it is NOT a guarantee of ground truth and must never be
 * presented as certainty.
 *
 * Signals used (all optional; missing signals simply contribute nothing):
 *   - number of independent reports
 *   - admin verification (confirmed / fixed status)
 *   - image availability
 *   - image location quality (GPS/EXIF > OCR/map-pick > unknown)
 *   - report age (evidence decays over time)
 *   - AI detection confidence, when a real detector is registered
 *   - cluster consistency (severity agreement + geographic tightness)
 */
import { distMeters } from "./geo";

/** Display metadata for confidence levels. */
export const CONFIDENCE_LEVELS = {
  HIGH: { label: "HIGH CONFIDENCE", color: "#15803d" },
  MEDIUM: { label: "MEDIUM CONFIDENCE", color: "#d97706" },
  LOW: { label: "LOW CONFIDENCE", color: "#6b7280" },
};

/** Where a report's coordinate came from, ranked by trustworthiness. */
const LOCATION_QUALITY = {
  gps: 20, // live device GPS (camera flow)
  exif: 20, // geotagged photo
  ocr: 12, // OCR of the overlay — heuristic
  "map-pick": 12, // manually placed on the map
  none: 5,
  unknown: 5,
};

const SECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function bestLocationQuality(reports) {
  let best = "unknown";
  const RANK = { gps: 3, exif: 3, ocr: 2, "map-pick": 2, none: 1, unknown: 1 };
  for (const r of reports) {
    const source = r.coordSource || (r.photoSource === "camera" ? "gps" : "unknown");
    if ((RANK[source] || 1) > (RANK[best] || 1)) best = source;
  }
  return best;
}

/**
 * Assess system confidence for one hazard.
 *
 * @param {Array<Object>} reports the reports belonging to the hazard (≥1)
 * @param {Object} [opts]
 * @param {number} [opts.now] epoch ms (injectable for deterministic tests)
 * @param {number} [opts.thresholdMeters] cluster spread reference (meters)
 * @returns {{level:'HIGH'|'MEDIUM'|'LOW', score:number, label:string, color:string, factors:Object}}
 */
export function assessReportConfidence(reports, { now = Date.now(), thresholdMeters = 50 } = {}) {
  const list = (Array.isArray(reports) ? reports : []).filter(Boolean);
  if (!list.length) {
    return { level: "LOW", score: 0, ...CONFIDENCE_LEVELS.LOW, factors: {} };
  }

  // 1. Independent report count (1 → 8, 3 → 24, 5+ → 40)
  const countScore = Math.min(40, list.length * 8);

  // 2. Admin verification: any verified / fixed report ("confirmed" is the legacy alias)
  const verified = list.some((r) => r.status === "verified" || r.status === "confirmed" || r.status === "fixed");

  // 3. Image availability (fraction of reports with a photo)
  const withPhoto = list.filter((r) => Boolean(r.photoDataUrl)).length;
  const imageScore = (withPhoto / list.length) * 15;

  // 4. Location quality from the best available source
  const locationScore = LOCATION_QUALITY[bestLocationQuality(list)] ?? LOCATION_QUALITY.unknown;

  // 5. AI detection confidence (only when a real detector stored a result)
  const aiConfidences = list
    .map((r) => (r.detection && r.detection.detector?.kind === "ai" ? Number(r.detection.confidence) : NaN))
    .filter((v) => Number.isFinite(v));
  const aiScore = aiConfidences.length ? Math.max(...aiConfidences) * 10 : 0;

  // 6. Cluster consistency: severity agreement + geographic tightness
  const severities = new Set(list.map((r) => r.severity));
  const severityConsistent = severities.size === 1;
  let maxSpread = 0;
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const d = distMeters(list[i].coord, list[j].coord);
      if (Number.isFinite(d) && d > maxSpread) maxSpread = d;
    }
  }
  const tightSpread = list.length === 1 || maxSpread <= thresholdMeters * 2;
  const consistencyScore = (severityConsistent ? 5 : 0) + (tightSpread ? 5 : 0);

  // 7. Age decay: fresh evidence counts more (deterministic decay)
  const newest = Math.max(...list.map((r) => Number(r.captureAt || r.createdAt || now)));
  const ageDays = Math.max(0, (now - newest) / SECONDS_PER_DAY);
  const decay = ageDays > 365 ? 0.6 : ageDays > 180 ? 0.8 : 1;

  const raw = countScore + (verified ? 25 : 0) + imageScore + locationScore + aiScore + consistencyScore;
  const score = Math.max(0, Math.min(100, Math.round(raw * decay)));
  const level = score >= 70 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW";
  const meta = CONFIDENCE_LEVELS[level];

  return {
    level,
    score,
    label: meta.label,
    color: meta.color,
    factors: {
      reportCount: list.length,
      verified,
      withPhoto,
      locationQuality: bestLocationQuality(list),
      aiConfidence: aiConfidences.length ? Math.max(...aiConfidences) : null,
      severityConsistent,
      maxSpreadMeters: Math.round(maxSpread),
      ageDays: Math.round(ageDays),
      decay,
    },
  };
}

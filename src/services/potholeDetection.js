/**
 * Pothole intelligence service.
 *
 * Owns the report-image pipeline shared by the report form and the fix-proof
 * modal:
 *
 *   image → downscale → EXIF GPS extraction → OCR fallback (overlay text)
 *         → coordinate validation
 *
 * plus the shared "best available GPS fix" helper used by the camera capture
 * and manual-retry flows. Coordinates are always validated before being
 * returned; OCR is explicitly a heuristic fallback, never a guaranteed fix.
 */
import exifr from "exifr";
import { isValidCoord } from "../features/routing/geo";

/** Downscale an image URL/dataURL to keep storage and popups light. */
export function downscaleImage(src, { maxW = 1200, maxH = 1200, quality = 0.85 } = {}) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, Math.min(maxW / img.width, maxH / img.height));
        const w = Math.floor(img.width * scale);
        const h = Math.floor(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch {
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

/**
 * Extract GPS + capture date from an image file via EXIF.
 * @returns {Promise<{lat:number|null, lng:number|null, capturedAt:number|null, hasGps:boolean, readable:boolean}>}
 */
async function extractExifMeta(file) {
  try {
    const exif = await exifr.parse(file);
    const lat = exif?.latitude;
    const lng = exif?.longitude;
    let capturedAt = null;
    const d = exif?.DateTimeOriginal || exif?.CreateDate || exif?.ModifyDate || exif?.date;
    if (d) {
      const ts = d instanceof Date ? d.getTime() : Date.parse(String(d)) || null;
      if (ts) capturedAt = ts;
    }
    if (lat != null && lng != null && isValidCoord([lng, lat])) {
      return { lat, lng, capturedAt, hasGps: true, readable: true };
    }
    return { lat: null, lng: null, capturedAt, hasGps: false, readable: true };
  } catch {
    return { lat: null, lng: null, capturedAt: null, hasGps: false, readable: false };
  }
}

/** Await the load of an image element. */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

/**
 * OCR the bottom strip of a photo for overlaid GPS coordinates.
 * Heuristic fallback only — results are validated by the caller.
 * @returns {Promise<{lat:number|null, lng:number|null, capturedAt:number|null}>}
 */
async function runOcrCoordinateFallback(dataUrl, { onStatus, extractDate = true } = {}) {
  try {
    const img = await loadImage(dataUrl);
    const maxW = 1200;
    const scale = img.width > maxW ? maxW / img.width : 1;
    const w = Math.floor(img.width * scale);
    const h = Math.floor(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    // Crop bottom 35% where GPS overlays usually live
    const cropY = Math.floor(h * 0.65);
    const cropH = h - cropY;
    const crop = document.createElement("canvas");
    crop.width = w;
    crop.height = cropH;
    crop.getContext("2d").drawImage(canvas, 0, cropY, w, cropH, 0, 0, w, cropH);
    const cropUrl = crop.toDataURL("image/png");

    let capturedAt = null;
    try {
      const Tesseract = (await import("tesseract.js")).default;
      const { data } = await Tesseract.recognize(cropUrl, "eng");
      const text = (data?.text || "").replace(/\n+/g, " ");
      // Parse Lat/Long labels first
      let latNum = null;
      let lonNum = null;
      const latM = text.match(/Lat(?:itude)?[^0-9+-]*([+-]?\d{1,2}\.\d+)/i);
      const lonM = text.match(/Lon(?:g|gitude)?[^0-9+-]*([+-]?\d{1,3}\.\d+)/i);
      if (latM && lonM) {
        latNum = parseFloat(latM[1]);
        lonNum = parseFloat(lonM[1]);
      }
      if (latNum == null || lonNum == null) {
        // Fallback: scan decimal numbers for a plausible lat/lon pair
        const nums = [...text.matchAll(/[+-]?\d{1,3}\.\d+/g)].map((m) => parseFloat(m[0]));
        if (nums.length >= 2) {
          for (let i = 0; i < nums.length - 1; i += 1) {
            const a = nums[i];
            const b = nums[i + 1];
            if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
              latNum = a;
              lonNum = b;
              break;
            }
          }
        }
      }
      if (extractDate) {
        // Try to parse a date/time from the overlay (e.g. 2025-11-10 14:33:22)
        try {
          let m = text.match(/(\d{4})[\/.\-\s](\d{1,2})[\/.\-\s](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/);
          if (m) {
            let [, y, mo, d, hh, mm, ss, ap] = m;
            capturedAt = parseOverlayDate(y, mo, d, hh, mm, ss, ap);
          }
          if (!capturedAt) {
            m = text.match(/(\d{1,2})[\/.\-\s](\d{1,2})[\/.\-\s](\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/);
            if (m) {
              let [, d, mo, y, hh, mm, ss, ap] = m;
              capturedAt = parseOverlayDate(y, mo, d, hh, mm, ss, ap);
            }
          }
        } catch { /* date parsing is best-effort */ }
      }
      if (latNum != null && lonNum != null) {
        onStatus?.(`Coordinates detected on image: ${latNum.toFixed(5)}, ${lonNum.toFixed(5)}`);
        return { lat: latNum, lng: lonNum, capturedAt };
      }
      onStatus?.("Couldn't find coordinates on the image.");
      return { lat: null, lng: null, capturedAt };
    } catch {
      onStatus?.("OCR failed while reading the image.");
      return { lat: null, lng: null, capturedAt };
    }
  } catch {
    onStatus?.("Couldn't load image for OCR.");
    return { lat: null, lng: null, capturedAt: null };
  }
}

function parseOverlayDate(y, mo, d, hh, mm, ss, ap) {
  let year = Number(y);
  const month = Number(mo) - 1;
  const day = Number(d);
  let H = Number(hh);
  const M = Number(mm);
  const S = ss ? Number(ss) : 0;
  if (ap) {
    const up = String(ap).toUpperCase();
    if (up === "PM" && H < 12) H += 12;
    if (up === "AM" && H === 12) H = 0;
  }
  const ts = new Date(year, month, day, H, M, S).getTime();
  return Number.isFinite(ts) ? ts : null;
}

/**
 * Full coordinate pipeline for a selected image file:
 * EXIF first, then OCR fallback. Every candidate coordinate is validated.
 *
 * @param {File} file the original image file (needed for EXIF)
 * @param {string} scaledDataUrl downscaled preview of the image
 * @param {Object} [opts]
 * @param {(message:string)=>void} [opts.onStatus] user-facing status updates
 * @param {boolean} [opts.extractDate] parse capture date (EXIF + overlay)
 * @returns {Promise<{coord:Array|null, capturedAt:number|null, source:'exif'|'ocr'|'none'}>}
 */
export async function processImageCoordinates(file, scaledDataUrl, { onStatus, extractDate = true } = {}) {
  const meta = await extractExifMeta(file);
  if (meta.hasGps) {
    onStatus?.("Geotag found in EXIF.");
    return { coord: [meta.lng, meta.lat], capturedAt: meta.capturedAt, source: "exif" };
  }
  if (!meta.readable) {
    onStatus?.("EXIF not readable. Trying to read location from image overlay…");
  } else {
    onStatus?.("Trying to read location from image overlay…");
  }
  const ocr = await runOcrCoordinateFallback(scaledDataUrl, { onStatus, extractDate });
  const capturedAt = ocr?.capturedAt || meta.capturedAt || null;
  if (ocr?.lat != null && ocr?.lng != null && isValidCoord([ocr.lng, ocr.lat])) {
    return { coord: [ocr.lng, ocr.lat], capturedAt, source: "ocr" };
  }
  return { coord: null, capturedAt, source: "none" };
}

/**
 * Best-effort GPS fix: one high-accuracy one-shot (up to initialTimeoutMs),
 * followed by a short watch window that keeps the most accurate fix.
 * onUpdate receives each accepted fix (coord, accuracy, message); the promise
 * resolves with { coord, accuracy } or null.
 */
export async function getBestLocation({ onUpdate, initialTimeoutMs = 8000, watchWindowMs = 3000 } = {}) {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  let best = { coord: null, accuracy: Infinity };

  const apply = (coord, accuracy, announce) => {
    if (!isValidCoord(coord)) return;
    if (!best.coord || (accuracy != null && accuracy < best.accuracy)) {
      best = { coord, accuracy: accuracy ?? Infinity };
      onUpdate?.({
        coord,
        accuracy,
        message: announce ? `Using live location (±${Math.round(accuracy)} m).` : undefined,
      });
    }
  };

  // One-shot fix first (matches the original flow's 8s high-accuracy request)
  await new Promise((resolve) => {
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          apply([longitude, latitude], accuracy, false);
          resolve();
        },
        () => resolve(),
        { enableHighAccuracy: true, timeout: initialTimeoutMs, maximumAge: 0 }
      );
    } catch {
      resolve();
    }
  });

  // Short watch window to improve accuracy
  await new Promise((resolve) => {
    let watchId = null;
    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          if (accuracy != null && accuracy < best.accuracy) {
            apply([longitude, latitude], accuracy, true);
          }
        },
        () => { },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
      );
    } catch { /* watch unsupported */ }
    setTimeout(() => {
      try {
        if (watchId != null) navigator.geolocation.clearWatch(watchId);
      } catch { /* ignore */ }
      resolve();
    }, watchWindowMs);
  });

  return best.coord ? best : null;
}

/* ========================================================================== *
 * Pothole detector interface.
 *
 * The app ships NO trained pothole-detection model. The default detector
 * below is an explicit rule-based stub that never claims a detection — user-
 * assigned severity remains the source of truth.
 *
 * Primary API: detectPotholes(image) → { detections: [{boundingBox,
 * confidence, severity}], ... }. It is backend-agnostic and supports future
 * registrations of YOLO / YOLOv8 / YOLOv11, ONNX Runtime, TensorFlow.js or
 * a remote inference API (see createRemoteDetector):
 *
 *   registerPotholeDetector({
 *     id: "yolo-v8-potholes",
 *     kind: "ai",                       // "ai" only for a trained model
 *     detect: async (image) => ({
 *       detections: [{ boundingBox: {x, y, width, height}, confidence, severity }],
 *     }),
 *   });
 *
 * detectPotholes() normalizes and validates whatever the detector returns so
 * the UI can trust the shape without trusting the model. It never invents a
 * bounding box: detections without valid geometry keep boundingBox: null.
 * ========================================================================== */

export const DETECTOR_INFO = {
  id: "rule-based-stub-v1",
  kind: "rule-based",
  description:
    "Heuristic placeholder. No trained pothole detection model is bundled; it never reports a detection.",
};

const SEVERITY_MAP = { high: "HIGH", medium: "MEDIUM", moderate: "MEDIUM", low: "LOW" };

/** Explicit stub: honest “no model” answer, never a fabricated detection. */
const stubDetector = {
  id: DETECTOR_INFO.id,
  kind: DETECTOR_INFO.kind,
  async detect() {
    return {
      detected: false,
      confidence: 0,
      severity: null,
      boxes: [],
      note: "No trained pothole detection model is configured; severity is user-assigned.",
    };
  },
};

let activeDetector = null;

/**
 * Register the active detector. Replaces any previous one. Invalid shapes are
 * rejected so a broken registration can never silently fake results.
 */
function registerPotholeDetector(detector) {
  if (!detector || typeof detector.detect !== "function") {
    throw new Error("registerPotholeDetector: detector must provide detect(image)");
  }
  if (!detector.id || (detector.kind !== "ai" && detector.kind !== "rule-based")) {
    throw new Error('registerPotholeDetector: detector needs an id and kind of "ai" or "rule-based"');
  }
  activeDetector = { id: String(detector.id), kind: detector.kind, detect: detector.detect };
  return activeDetector;
}

/** Currently active detector (stub when none registered). */
export function getActiveDetector() {
  return activeDetector || stubDetector;
}

const clamp01 = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/* ------------------------------------------------------------------ *
 * Multi-detection facade (spec API: detectPotholes)
 * ------------------------------------------------------------------ */

/** Normalize one raw detection into {boundingBox, confidence, severity}. */
function normalizeDetection(d) {
  if (!d || typeof d !== "object") return null;
  const b = d.boundingBox ?? d.bbox ?? d.box ?? null;
  let boundingBox = null;
  if (Array.isArray(b) && b.length >= 4) {
    const [x, y, width, height] = b.map(Number);
    if ([x, y, width, height].every(Number.isFinite)) boundingBox = { x, y, width, height };
  } else if (b && typeof b === "object") {
    const x = Number(b.x), y = Number(b.y), width = Number(b.width), height = Number(b.height);
    if ([x, y, width, height].every(Number.isFinite)) boundingBox = { x, y, width, height };
  }
  const confidence = clamp01(Number(d.confidence));
  const sevRaw = d.severity != null ? String(d.severity).toLowerCase() : null;
  const severity = sevRaw ? SEVERITY_MAP[sevRaw] || null : null;
  if (confidence <= 0 && !boundingBox) return null; // drop meaningless entries
  return { boundingBox, confidence, severity };
}

/**
 * Run pothole detection on an image (primary Phase-7 interface).
 *
 * Backend-agnostic: works with any registered detector — an in-browser
 * YOLO/YOLOv8/YOLOv11 or ONNX Runtime model, a TensorFlow.js graph, or a
 * remote inference API (createRemoteDetector). When no real model is
 * registered the bundled stub answers honestly: available=false, zero
 * detections, no fabricated boxes.
 *
 * @param {string|Blob|ImageBitmap} image input accepted by the detector
 * @returns {Promise<{detections:Array<{boundingBox:Object|null, confidence:number, severity:string|null}>,
 *   available:boolean, detected:boolean, confidence:number, severity:string|null,
 *   detector:{id:string,kind:string}, note?:string, error?:string}>}
 *   `confidence`/`severity` mirror the strongest detection for backward
 *   compatibility with stored report records.
 */
export async function detectPotholes(image) {
  const detector = getActiveDetector();
  const isStub = detector.kind !== "ai";
  if (isStub) {
    // Stub: honest "no model" answer, never fabricates detections.
    return {
      detections: [],
      available: false,
      detected: false,
      confidence: 0,
      severity: null,
      detector: { id: detector.id, kind: detector.kind },
      note: "No trained pothole detection model is configured; severity is user-assigned.",
    };
  }
  try {
    const raw = await detector.detect(image);
    let list = [];
    if (Array.isArray(raw?.detections)) {
      list = raw.detections;
    } else if (Array.isArray(raw?.boxes)) {
      // Legacy single/loose shape: boxes + top-level confidence/severity
      list = raw.boxes.map((bbox) => ({
        boundingBox: bbox,
        confidence: raw.confidence,
        severity: raw.severity,
      }));
      if (!list.length && raw?.detected) {
        list = [{ boundingBox: raw.boundingBox ?? null, confidence: raw.confidence, severity: raw.severity }];
      }
    }
    const detections = list.map(normalizeDetection).filter(Boolean);
    const topConfidence = detections.length ? Math.max(...detections.map((d) => d.confidence)) : 0;
    const topSeverity =
      detections.find((d) => d.severity === "HIGH")?.severity ??
      detections.find((d) => d.severity === "MEDIUM")?.severity ??
      detections.find((d) => d.severity === "LOW")?.severity ?? null;
    return {
      detections,
      available: true,
      detected: detections.length > 0,
      confidence: topConfidence,
      severity: topSeverity,
      detector: { id: detector.id, kind: detector.kind },
      ...(raw?.note ? { note: String(raw.note) } : {}),
    };
  } catch (e) {
    return {
      detections: [],
      available: true,
      detected: false,
      confidence: 0,
      severity: null,
      detector: { id: detector.id, kind: detector.kind },
      error: e?.message || "Pothole detector failed",
    };
  }
}

/**
 * Helper for a remote inference API backend (e.g. a YOLO service):
 * POSTs the image as multipart/form-data and expects a detectPotholes-style
 * JSON body back. Nothing is registered or called unless the app explicitly
 * registers the returned detector with a real endpoint.
 *
 * @param {Object} opts
 * @param {string} opts.endpoint HTTPS endpoint accepting the upload
 * @param {string} [opts.id] detector id
 * @param {string} [opts.fieldName] form field name for the image
 * @param {Object} [opts.headers] extra request headers
 * @returns {{id:string, kind:string, detect:Function}}
 */
function createRemoteDetector({ endpoint, id = "remote-inference", fieldName = "image", headers = {} } = {}) {
  if (!endpoint) throw new Error("createRemoteDetector: endpoint is required");
  return {
    id,
    kind: "ai",
    async detect(image) {
      const form = new FormData();
      form.append(fieldName, image instanceof Blob ? image : String(image));
      const res = await fetch(endpoint, { method: "POST", body: form, headers });
      if (!res.ok) throw new Error(`Remote detector failed: HTTP ${res.status}`);
      return await res.json();
    },
  };
}

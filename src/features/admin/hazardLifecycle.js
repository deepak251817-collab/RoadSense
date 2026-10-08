/**
 * Hazard lifecycle.
 *
 * Canonical statuses: Reported → Under Review → Verified → Repair Requested
 * → Fixed, with Rejected as a terminal side-state. Legacy data (the original
 * app used "unverified" / "confirmed") is normalized on load so nothing is
 * lost or renamed in storage.
 */

export const HAZARD_STATUSES = {
  REPORTED: "reported",
  UNDER_REVIEW: "under-review",
  VERIFIED: "verified",
  REPAIR_REQUESTED: "repair-requested",
  FIXED: "fixed",
  REJECTED: "rejected",
};

/** Human labels for each status. */
export const STATUS_LABELS = {
  "reported": "Reported",
  "under-review": "Under Review",
  "verified": "Verified",
  "repair-requested": "Repair Requested",
  "fixed": "Fixed",
  "rejected": "Rejected",
};

/** Chip/border colors per status. */
export const STATUS_STYLES = {
  "reported": { bg: "#fef3c7", text: "#92400e" },
  "under-review": { bg: "#dbeafe", text: "#1d4ed8" },
  "verified": { bg: "#d1fae5", text: "#065f46" },
  "repair-requested": { bg: "#ede9fe", text: "#5b21b6" },
  "fixed": { bg: "#e0e7ff", text: "#3730a3" },
  "rejected": { bg: "#fee2e2", text: "#991b1b" },
};

/**
 * Queue order for admin worklists: items needing action first
 * (fix proofs surface above their status), lifecycle progression after.
 */
export const STATUS_ORDER = {
  "reported": 0,
  "under-review": 1,
  "repair-requested": 2,
  "verified": 3,
  "fixed": 4,
  "rejected": 5,
};

/** Allowed forward/backward transitions for admins. Rejection is separate. */
export const STATUS_TRANSITIONS = {
  "reported": ["under-review", "verified"],
  "under-review": ["reported", "verified"],
  "verified": ["repair-requested", "fixed"],
  "repair-requested": ["fixed", "verified"],
  "fixed": ["reported"],
  "rejected": ["reported"],
};

/** Map legacy or aliased status strings to the canonical lifecycle. */
export function normalizeStatus(raw) {
  const s = String(raw || "").toLowerCase();
  switch (s) {
    case "unverified":
    case "reported":
    case "":
      return HAZARD_STATUSES.REPORTED;
    case "under-review":
    case "under_review":
    case "under review":
      return HAZARD_STATUSES.UNDER_REVIEW;
    case "confirmed":
    case "verified":
      return HAZARD_STATUSES.VERIFIED;
    case "repair-requested":
    case "repair_requested":
    case "repair requested":
    case "pending repair":
      return HAZARD_STATUSES.REPAIR_REQUESTED;
    case "fixed":
      return HAZARD_STATUSES.FIXED;
    case "rejected":
      return HAZARD_STATUSES.REJECTED;
    default:
      return HAZARD_STATUSES.REPORTED;
  }
}

/** Statuses an admin can move a hazard to from its current status. */
export function nextStatuses(status) {
  return STATUS_TRANSITIONS[normalizeStatus(status)] || [];
}

/** True when the hazard still affects the road (not fixed/rejected). */
export function isActiveStatus(status) {
  const s = normalizeStatus(status);
  return s !== HAZARD_STATUSES.FIXED && s !== HAZARD_STATUSES.REJECTED;
}

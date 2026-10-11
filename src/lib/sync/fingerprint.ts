import type { Plan } from "../schemas/plan.schema";

/**
 * Trust & Validation Impact of Dependency Confirmation Status:
 *
 * 1. `confirmed`:
 *    - Fully verified operational constraint (e.g. baseline or human-confirmed dependency).
 *    - Graph validation: treated as a hard, binding edge.
 *    - Recovery engine: fully trusted; candidates preserving confirmed edges are considered verified.
 *
 * 2. `reviewed`:
 *    - Inspected and acknowledged by a human planner, but awaiting binding verification.
 *    - Graph validation: valid edge, but cataloged in `reviewedDependencyIds`.
 *    - Recovery engine: candidates relying on 'reviewed' edges are marked `provisional`
 *      until formal confirmation, surfacing the edge as an explicit operational assumption.
 *
 * 3. `provisional`:
 *    - An explicit, recognized planning assumption (e.g. hypothetical split session).
 *    - Graph validation: valid edge, explicitly cataloged in `provisionalDependencyIds`.
 *    - Recovery engine: allows candidate evaluation, but forces candidate verificationStatus to `provisional`,
 *      preventing it from ever being ranked as `verified_in_fixture` or `real_world_verified`.
 *
 * 4. `unreviewed`:
 *    - Untrusted or newly imported edge (e.g. freshly suggested by an external tool or AI).
 *    - Graph validation: flags `hasUnreviewedDependencies: true` with actionable warning.
 *    - Recovery engine: BLOCKS candidate commit and displays an actionable warning.
 *      The recovery engine will NOT recommend or commit a plan containing unreviewed edges
 *      without explicit human operator inspection!
 */

/**
 * Pure TypeScript SHA-256 implementation.
 * Operates synchronously and identically in browsers, Web Workers, Node.js, and test environments
 * without requiring Node's `crypto` module.
 */
export function sha256Pure(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const maxWord = Math.pow(2, 32);
  let i: number;
  let result = "";

  const words: number[] = [];

  // Initial hash values: first 32 bits of the fractional parts of the square roots of the first 8 primes
  const hash: number[] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  // First 32 bits of the fractional parts of the cube roots of the first 64 primes
  const k: number[] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  // UTF-8 encode input string to bytes
  const utf8Bytes: number[] = [];
  for (let b = 0; b < ascii.length; b++) {
    let charcode = ascii.charCodeAt(b);
    if (charcode < 0x80) {
      utf8Bytes.push(charcode);
    } else if (charcode < 0x800) {
      utf8Bytes.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
    } else if (charcode < 0xd800 || charcode >= 0xe000) {
      utf8Bytes.push(0xe0 | (charcode >> 12), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
    } else {
      b++;
      charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (ascii.charCodeAt(b) & 0x3ff));
      utf8Bytes.push(
        0xf0 | (charcode >> 18),
        0x80 | ((charcode >> 12) & 0x3f),
        0x80 | ((charcode >> 6) & 0x3f),
        0x80 | (charcode & 0x3f)
      );
    }
  }

  const bitLength = utf8Bytes.length * 8;
  utf8Bytes.push(0x80);
  while (utf8Bytes.length % 64 !== 56) {
    utf8Bytes.push(0);
  }
  // Append 64-bit length big-endian
  const highBits = Math.floor(bitLength / maxWord);
  const lowBits = bitLength >>> 0;
  for (let shift = 24; shift >= 0; shift -= 8) utf8Bytes.push((highBits >>> shift) & 0xff);
  for (let shift = 24; shift >= 0; shift -= 8) utf8Bytes.push((lowBits >>> shift) & 0xff);

  for (let b = 0; b < utf8Bytes.length; b += 4) {
    words.push(
      (utf8Bytes[b] << 24) |
      (utf8Bytes[b + 1] << 16) |
      (utf8Bytes[b + 2] << 8) |
      utf8Bytes[b + 3]
    );
  }

  const w: number[] = new Array(64);
  for (let chunk = 0; chunk < words.length; chunk += 16) {
    for (i = 0; i < 16; i++) w[i] = words[chunk + i];
    for (i = 16; i < 64; i++) {
      const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (i = 0; i < 64; i++) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + k[i] + w[i]) | 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    hash[0] = (hash[0] + a) | 0;
    hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0;
    hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0;
    hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0;
    hash[7] = (hash[7] + h) | 0;
  }

  for (i = 0; i < 8; i++) {
    result += (hash[i] >>> 0).toString(16).padStart(8, "0");
  }
  return result;
}

/**
 * Recursively sort object keys for deterministic serialization.
 */
function sortObjectKeys<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys) as unknown as T;
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted as T;
}

// ==========================================
// 1. Canonical Structural Graph Projection
// ==========================================

export interface CanonicalTaskStructuralInput {
  id: string;
  durationHours: number;
  policy: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  outputDependencies?: Record<string, string[]>;
}

export interface CanonicalDependencyStructuralInput {
  id: string;
  fromTaskId: string;
  toTaskId: string;
  blocksExecution: boolean;
  fieldMappings: Array<{ sourceField: string; targetInput: string; optional?: boolean }>;
  removeEdgeIfSourceRemoved?: boolean;
}

export interface CanonicalStructuralProjection {
  tasks: CanonicalTaskStructuralInput[];
  dependencies: CanonicalDependencyStructuralInput[];
}

export function projectStructuralGraphInputs(
  plan: Pick<Plan, "tasks" | "dependencies">
): CanonicalStructuralProjection {
  const sortedTasks: CanonicalTaskStructuralInput[] = [...plan.tasks]
    .map((t) => ({
      id: t.id,
      durationHours: t.durationHours,
      policy: t.policy,
      inputs: sortObjectKeys(t.inputs ?? {}),
      outputs: sortObjectKeys(t.outputs ?? {}),
      ...(t.outputDependencies
        ? { outputDependencies: sortObjectKeys(t.outputDependencies) }
        : {}),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const sortedDeps: CanonicalDependencyStructuralInput[] = [...plan.dependencies]
    .map((d) => ({
      id: d.id,
      fromTaskId: d.fromTaskId,
      toTaskId: d.toTaskId,
      blocksExecution: d.blocksExecution,
      fieldMappings: [...(d.fieldMappings ?? [])]
        .map((m) => ({
          sourceField: m.sourceField,
          targetInput: m.targetInput,
          optional: m.optional ?? false,
        }))
        .sort((a, b) =>
          a.sourceField === b.sourceField
            ? a.targetInput.localeCompare(b.targetInput)
            : a.sourceField.localeCompare(b.sourceField)
        ),
      removeEdgeIfSourceRemoved: d.removeEdgeIfSourceRemoved ?? false,
    }))
    .sort((a, b) =>
      a.fromTaskId === b.fromTaskId
        ? a.toTaskId === b.toTaskId
          ? a.id.localeCompare(b.id)
          : a.toTaskId.localeCompare(b.toTaskId)
        : a.fromTaskId.localeCompare(b.fromTaskId)
    );

  return {
    tasks: sortedTasks,
    dependencies: sortedDeps,
  };
}

// Backward-compatible alias
export const projectGraphInputs = projectStructuralGraphInputs;

export function computeStructuralFingerprint(
  plan: Pick<Plan, "tasks" | "dependencies">
): string {
  const projection = projectStructuralGraphInputs(plan);
  const serialized = JSON.stringify(projection);
  return sha256Pure(serialized);
}

// Backward-compatible alias
export const computeGraphInputFingerprint = computeStructuralFingerprint;

// ==========================================
// 2. Canonical Explanation Metadata Projection
// ==========================================

export interface CanonicalTaskMetadataInput {
  id: string;
  title: string;
  status: string;
}

export interface CanonicalDependencyMetadataInput {
  id: string;
  reason: string;
  origin: string;
  confirmationStatus: string;
  modificationHistory: unknown[];
}

export interface CanonicalMetadataProjection {
  tasks: CanonicalTaskMetadataInput[];
  dependencies: CanonicalDependencyMetadataInput[];
}

export function projectExplanationMetadata(
  plan: Pick<Plan, "tasks" | "dependencies">
): CanonicalMetadataProjection {
  const sortedTasks: CanonicalTaskMetadataInput[] = [...plan.tasks]
    .map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const sortedDeps: CanonicalDependencyMetadataInput[] = [...plan.dependencies]
    .map((d) => ({
      id: d.id,
      reason: d.reason ?? "",
      origin: d.origin ?? "system_template",
      confirmationStatus: d.confirmationStatus ?? "confirmed",
      modificationHistory: sortObjectKeys(d.modificationHistory ?? []),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    tasks: sortedTasks,
    dependencies: sortedDeps,
  };
}

export function computeExplanationMetadataFingerprint(
  plan: Pick<Plan, "tasks" | "dependencies">
): string {
  const projection = projectExplanationMetadata(plan);
  const serialized = JSON.stringify(projection);
  return sha256Pure(serialized);
}

// ----------------------------------------------------
// 2A. Trust-Critical vs Display-Only Metadata Helpers
// ----------------------------------------------------

export interface CanonicalTrustMetadataInput {
  id: string;
  origin: string;
  confirmationStatus: string;
}

export function projectTrustMetadata(
  plan: Pick<Plan, "dependencies">
): CanonicalTrustMetadataInput[] {
  return [...plan.dependencies]
    .map((d) => ({
      id: d.id,
      origin: d.origin ?? "system_template",
      confirmationStatus: d.confirmationStatus ?? "confirmed",
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function computeTrustMetadataFingerprint(
  plan: Pick<Plan, "dependencies">
): string {
  const projection = projectTrustMetadata(plan);
  return sha256Pure(JSON.stringify(projection));
}

export interface CanonicalDisplayMetadataInput {
  tasks: Array<{ id: string; title: string; status: string }>;
  dependencies: Array<{ id: string; reason: string }>;
}

export function projectDisplayMetadata(
  plan: Pick<Plan, "tasks" | "dependencies">
): CanonicalDisplayMetadataInput {
  return {
    tasks: [...plan.tasks]
      .map((t) => ({ id: t.id, title: t.title, status: t.status }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    dependencies: [...plan.dependencies]
      .map((d) => ({ id: d.id, reason: d.reason ?? "" }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function computeDisplayMetadataFingerprint(
  plan: Pick<Plan, "tasks" | "dependencies">
): string {
  const projection = projectDisplayMetadata(plan);
  return sha256Pure(JSON.stringify(projection));
}

// ==========================================
// 3. Composite Freshness & Trust Evaluation
// ==========================================

export interface TrustSummary {
  hasUnreviewedDependencies: boolean;
  unreviewedDependencyIds: string[];
  reviewedDependencyIds: string[];
  confirmedDependencyIds: string[];
  provisionalDependencyIds: string[];
}

export interface GraphFreshnessEvaluation {
  needsStructuralRebuild: boolean;
  needsMetadataRefresh: boolean;
  isFullyFresh: boolean;
  structuralFingerprint: string;
  metadataFingerprint: string;
  trustSummary: TrustSummary;
}

export function evaluateGraphFreshness(
  stored: {
    structuralFingerprint: string;
    metadataFingerprint?: string;
  },
  currentPlan: Pick<Plan, "tasks" | "dependencies">
): GraphFreshnessEvaluation {
  const currentStructural = computeStructuralFingerprint(currentPlan);
  const currentMetadata = computeExplanationMetadataFingerprint(currentPlan);

  const needsStructuralRebuild = stored.structuralFingerprint !== currentStructural;
  const needsMetadataRefresh =
    Boolean(stored.metadataFingerprint) &&
    stored.metadataFingerprint !== currentMetadata;

  const isFullyFresh = !needsStructuralRebuild && !needsMetadataRefresh;

  // Evaluate trust status of all dependencies
  const unreviewedDependencyIds: string[] = [];
  const reviewedDependencyIds: string[] = [];
  const confirmedDependencyIds: string[] = [];
  const provisionalDependencyIds: string[] = [];

  for (const dep of currentPlan.dependencies) {
    const status = dep.confirmationStatus ?? "confirmed";
    if (status === "unreviewed") {
      unreviewedDependencyIds.push(dep.id);
    } else if (status === "reviewed") {
      reviewedDependencyIds.push(dep.id);
    } else if (status === "confirmed") {
      confirmedDependencyIds.push(dep.id);
    } else if (status === "provisional") {
      provisionalDependencyIds.push(dep.id);
    }
  }

  return {
    needsStructuralRebuild,
    needsMetadataRefresh,
    isFullyFresh,
    structuralFingerprint: currentStructural,
    metadataFingerprint: currentMetadata,
    trustSummary: {
      hasUnreviewedDependencies: unreviewedDependencyIds.length > 0,
      unreviewedDependencyIds,
      reviewedDependencyIds,
      confirmedDependencyIds,
      provisionalDependencyIds,
    },
  };
}

export function isGraphInputEqual(
  planA: Pick<Plan, "tasks" | "dependencies">,
  planB: Pick<Plan, "tasks" | "dependencies">
): boolean {
  return (
    computeStructuralFingerprint(planA) === computeStructuralFingerprint(planB)
  );
}

export function isExplanationMetadataEqual(
  planA: Pick<Plan, "tasks" | "dependencies">,
  planB: Pick<Plan, "tasks" | "dependencies">
): boolean {
  return (
    computeExplanationMetadataFingerprint(planA) ===
    computeExplanationMetadataFingerprint(planB)
  );
}

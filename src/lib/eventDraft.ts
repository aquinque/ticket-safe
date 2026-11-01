/**
 * Browser-side autosave for the "Create a new event" wizard (StudioEventNew).
 *
 * The wizard is five steps of plain React state. Before this file existed, leaving
 * the page in any way — the phone/browser back button, a tap on a Studio tab, a
 * reload, a token refresh that remounted the route — threw everything away and the
 * organizer started again from zero.
 *
 * Text fields are kept in localStorage as JSON, keyed per user so two organizers
 * sharing a device never see each other's draft. Files (the cropped banner, and
 * the promo video when it is not too big) go to IndexedDB, which stores Blobs
 * natively. Everything here is best-effort: storage can be missing or full
 * (private mode, quota) and the wizard must keep working without it, so nothing
 * in this module throws.
 */

export interface TierDraft {
  name: string;
  description: string;
  priceEuros: string;
  totalQty: string;
  /** YYYY-MM-DDTHH:mm — empty string when no scheduled drop. */
  salesStartAt: string;
  salesEndAt: string;
  /** Per-order cap; empty string falls back to the event-wide limit. */
  maxPerOrder: string;
  /** 'table' tiers are still just a tier — quantity is still person-count,
   * capacityPerUnit is purely a buyer-facing hint ("Table for 6"). */
  kind: "ticket" | "table";
  capacityPerUnit: string;
}

export const makeTier = (over: Partial<TierDraft> = {}): TierDraft => ({
  name: "Regular",
  description: "",
  priceEuros: "20",
  totalQty: "100",
  salesStartAt: "",
  salesEndAt: "",
  maxPerOrder: "",
  kind: "ticket",
  capacityPerUnit: "1",
  ...over,
});

export const DRAFT_VERSION = 1 as const;

export interface EventDraft {
  v: typeof DRAFT_VERSION;
  /** ISO timestamp of the last autosave; shown as "last edited …" on restore. */
  savedAt: string;
  step: number;
  title: string;
  description: string;
  date: string;
  endsAt: string;
  location: string;
  category: string;
  /** null = the organizer never touched the colour; keep following their brand colour. */
  primaryColor: string | null;
  limitEnabled: boolean;
  maxPerBuyer: string;
  slug: string;
  slugTouched: boolean;
  tiers: TierDraft[];
  /** Name of the promo video that was chosen, so we can ask for it again when it could not be kept. */
  videoName: string | null;
}

export const EVENT_DRAFT_KEY = (userId: string) => `ts.studio.eventDraft:${userId}`;

/** The wizard exactly as it opens for the first time. */
export const emptyEventDraft = (): EventDraft => ({
  v: DRAFT_VERSION,
  savedAt: "",
  step: 0,
  title: "",
  description: "",
  date: "",
  endsAt: "",
  location: "",
  category: "party",
  primaryColor: null,
  limitEnabled: true,
  maxPerBuyer: "1",
  slug: "",
  slugTouched: false,
  tiers: [makeTier()],
  videoName: null,
});

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);

const sanitizeTier = (raw: unknown): TierDraft | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const base = makeTier();
  return {
    name: str(r.name, base.name),
    description: str(r.description, base.description),
    priceEuros: str(r.priceEuros, base.priceEuros),
    totalQty: str(r.totalQty, base.totalQty),
    salesStartAt: str(r.salesStartAt, base.salesStartAt),
    salesEndAt: str(r.salesEndAt, base.salesEndAt),
    maxPerOrder: str(r.maxPerOrder, base.maxPerOrder),
    kind: r.kind === "table" ? "table" : "ticket",
    capacityPerUnit: str(r.capacityPerUnit, base.capacityPerUnit),
  };
};

/**
 * Turn whatever was stored into a well-formed draft, or null when it is unusable
 * (missing, corrupt, or written by an older version of the wizard).
 */
export function parseEventDraft(raw: string | null, stepCount: number): EventDraft | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.v !== DRAFT_VERSION) return null;

  const empty = emptyEventDraft();
  const tiers = Array.isArray(d.tiers)
    ? d.tiers.map(sanitizeTier).filter((t): t is TierDraft => t !== null)
    : empty.tiers;
  const stepRaw = typeof d.step === "number" && Number.isFinite(d.step) ? Math.floor(d.step) : 0;
  const color = str(d.primaryColor);

  return {
    v: DRAFT_VERSION,
    savedAt: str(d.savedAt),
    step: Math.min(Math.max(0, stepRaw), Math.max(0, stepCount - 1)),
    title: str(d.title),
    description: str(d.description),
    date: str(d.date),
    endsAt: str(d.endsAt),
    location: str(d.location),
    category: str(d.category, empty.category) || empty.category,
    primaryColor: /^#[0-9A-Fa-f]{6}$/.test(color) ? color : null,
    limitEnabled: bool(d.limitEnabled, empty.limitEnabled),
    maxPerBuyer: str(d.maxPerBuyer, empty.maxPerBuyer),
    slug: str(d.slug),
    slugTouched: bool(d.slugTouched, false),
    tiers,
    videoName: str(d.videoName) || null,
  };
}

const comparable = (d: EventDraft) => {
  // savedAt and step say nothing about what was entered.
  const { savedAt, step, ...rest } = d;
  void savedAt;
  void step;
  return rest;
};

/** True when nothing worth keeping has been entered: the wizard is still pristine. */
export function isEventDraftEmpty(d: EventDraft): boolean {
  return JSON.stringify(comparable(d)) === JSON.stringify(comparable(emptyEventDraft()));
}

export function loadEventDraft(userId: string, stepCount: number): EventDraft | null {
  try {
    return parseEventDraft(localStorage.getItem(EVENT_DRAFT_KEY(userId)), stepCount);
  } catch {
    return null;
  }
}

export function saveEventDraft(userId: string, draft: EventDraft): void {
  try {
    localStorage.setItem(EVENT_DRAFT_KEY(userId), JSON.stringify(draft));
  } catch {
    /* private mode or quota exceeded: the wizard still works, it just won't survive a reload */
  }
}

export function clearEventDraft(userId: string): void {
  try {
    localStorage.removeItem(EVENT_DRAFT_KEY(userId));
  } catch {
    /* ignore */
  }
}

// ── Files (IndexedDB) ──────────────────────────────────────────────────────────

export type DraftFileKind = "banner" | "video";

/**
 * Promo videos above this size are not kept in the draft: copying them into
 * IndexedDB is slow on a phone and can exceed the storage quota. The organizer
 * is told to add the video again instead.
 */
export const DRAFT_VIDEO_MAX_BYTES = 300 * 1024 * 1024;

const DB_NAME = "ts-studio-drafts";
const STORE = "files";

const fileKey = (userId: string, kind: DraftFileKind) => `${userId}:${kind}`;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB open blocked"));
  });
}

function requestDone<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Keeps a file for the draft. Resolves false when it could not be stored. */
export async function saveDraftFile(userId: string, kind: DraftFileKind, file: File): Promise<boolean> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(file, fileKey(userId, kind));
    await transactionDone(tx);
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function loadDraftFile(userId: string, kind: DraftFileKind): Promise<File | null> {
  try {
    const db = await openDb();
    const value = await requestDone(db.transaction(STORE, "readonly").objectStore(STORE).get(fileKey(userId, kind)));
    db.close();
    if (value instanceof File) return value;
    // Some browsers hand a stored File back as a plain Blob.
    if (value instanceof Blob) {
      return new File([value], kind === "banner" ? "banner.jpg" : "promo-video", { type: value.type });
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearDraftFile(userId: string, kind: DraftFileKind): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(fileKey(userId, kind));
    await transactionDone(tx);
    db.close();
  } catch {
    /* ignore */
  }
}

export async function clearDraftFiles(userId: string): Promise<void> {
  await Promise.all([clearDraftFile(userId, "banner"), clearDraftFile(userId, "video")]);
}

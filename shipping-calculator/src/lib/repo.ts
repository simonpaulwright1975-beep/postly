// Browser-local persistence for the shipping calculator. Everything is stored
// under a single localStorage key — no backend required. (If cloud sync is
// wanted later, this is the single seam to swap for an API-backed store.)

import type {
  CompetitorQuote,
  NewCompetitorQuote,
  NewRateCard,
  NewShipment,
  RateCard,
  Shipment,
} from "./shipping/types";

const KEY = "shipping-calculator:v1";

interface DB {
  rateCards: RateCard[];
  shipments: Shipment[];
  quotes: CompetitorQuote[];
}

function uid(): string {
  return crypto.randomUUID();
}

function load(): DB {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    try {
      const db = JSON.parse(raw) as Partial<DB>;
      return { rateCards: db.rateCards ?? [], shipments: db.shipments ?? [], quotes: db.quotes ?? [] };
    } catch {
      /* fall through to a fresh db */
    }
  }
  const fresh: DB = { rateCards: [], shipments: [], quotes: [] };
  localStorage.setItem(KEY, JSON.stringify(fresh));
  return fresh;
}

function save(db: DB): void {
  localStorage.setItem(KEY, JSON.stringify(db));
}

export const repo = {
  async listRateCards(): Promise<RateCard[]> {
    return load().rateCards.sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async createRateCard(input: NewRateCard): Promise<RateCard> {
    const db = load();
    const card: RateCard = { ...input, id: uid(), created_at: new Date().toISOString() };
    // The first card uploaded becomes the active baseline automatically.
    if (input.active || db.rateCards.length === 0) {
      db.rateCards = db.rateCards.map((c) => ({ ...c, active: false }));
      card.active = true;
    }
    db.rateCards.push(card);
    save(db);
    return card;
  },
  async deleteRateCard(id: string): Promise<void> {
    const db = load();
    const wasActive = db.rateCards.find((c) => c.id === id)?.active;
    db.rateCards = db.rateCards.filter((c) => c.id !== id);
    if (wasActive && db.rateCards.length) db.rateCards[0].active = true;
    save(db);
  },
  async setActiveRateCard(id: string): Promise<void> {
    const db = load();
    db.rateCards = db.rateCards.map((c) => ({ ...c, active: c.id === id }));
    save(db);
  },

  async listShipments(): Promise<Shipment[]> {
    return load().shipments.sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async createShipment(input: NewShipment): Promise<Shipment> {
    const db = load();
    const s: Shipment = { ...input, id: uid(), created_at: new Date().toISOString() };
    db.shipments.push(s);
    save(db);
    return s;
  },
  async updateShipment(id: string, patch: Partial<Shipment>): Promise<void> {
    const db = load();
    db.shipments = db.shipments.map((s) => (s.id === id ? { ...s, ...patch } : s));
    save(db);
  },
  async deleteShipment(id: string): Promise<void> {
    const db = load();
    db.shipments = db.shipments.filter((s) => s.id !== id);
    db.quotes = db.quotes.filter((q) => q.shipment_id !== id);
    save(db);
  },

  async listQuotes(): Promise<CompetitorQuote[]> {
    return load().quotes.sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async createQuote(input: NewCompetitorQuote): Promise<CompetitorQuote> {
    const db = load();
    const q: CompetitorQuote = { ...input, id: uid(), created_at: new Date().toISOString() };
    db.quotes.push(q);
    save(db);
    return q;
  },
  async deleteQuote(id: string): Promise<void> {
    const db = load();
    db.quotes = db.quotes.filter((q) => q.id !== id);
    save(db);
  },
};

/** Kept as a function call so page code reads the same regardless of backend. */
export function getRepo() {
  return repo;
}

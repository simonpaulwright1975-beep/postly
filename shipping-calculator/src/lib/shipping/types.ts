// Shipping rate-card domain model.
//
// Mirrors the structure of the monthly Kerry Logistics rate card (an Excel
// workbook) so an uploaded card can be recorded, used to estimate the cost of
// real shipments, and compared against quotes from other carriers when going
// out to tender.

export type ContainerSize = "20" | "40" | "40HQ";
export type ShipMode = "FCL" | "LCL";

/** One origin→destination ocean lane (a row in the "Ocean Freight Rates" table). */
export interface OceanLane {
  id: string;
  origin: string; // e.g. "Shanghai", "Huangpu"
  pod: string; // port of discharge, e.g. "SOU"
  transitDays: number | null;
  /** Net freight in the freight currency (USD), per container size. */
  freightNet20: number;
  freightNet40: number;
  freightNet40hq: number;
  /** Per-container surcharges (USD): PSS, ETS, EBAF, CAF. Often zero. */
  surcharges: { pss: number; ets: number; ebaf: number; caf: number };
  /** LCL ocean freight, freight currency per CBM. */
  lclPerCbm: number;
  /** One-off CFS transfer fee (USD) on LCL shipments from this port (Huangpu = $50). */
  cfsTransferUsd: number;
}

/** UK inland handling for full containers (per container). */
export interface FclInland {
  destination: string; // e.g. "Local SOU Warehouse"
  pod: string;
  carrier: string;
  shunt: { c20: number; c40: number; c40hq: number };
  devan: { c20: number; c40: number; c40hq: number };
  sortPerCarton: number;
  importServiceFee: number;
  customsClearance: number;
  docs: number;
}

/** UK inland handling for groupage / part-loads (per shipment). */
export interface LclInland {
  destination: string;
  pod: string;
  carrier: string;
  thcPer2cbm: number; // terminal handling, charged per 2 CBM / 1000kg
  customsClearance: number;
  docs: number;
  sortPerCarton: number;
}

export interface DeliveryBand {
  fromCbm: number;
  toCbm: number;
  price: number;
}

/** CBM-banded final-mile delivery tariff (e.g. delivery to Ashford). */
export interface DeliveryTariff {
  destination: string;
  bands: DeliveryBand[];
  triAxleSurchargePct: number; // e.g. 10
  triAxleOverKg: number; // e.g. 21000
}

export interface RateVariables {
  roe: number; // rate of exchange, GBP → USD (e.g. 1.3)
  defaultCbm: number;
}

export type RateCardSource = "kerry-xlsx" | "manual" | "competitor";

export interface RateCard {
  id: string;
  carrier: string;
  title: string;
  validFrom: string | null;
  validTo: string | null;
  freightCurrency: string; // "USD"
  inlandCurrency: string; // "GBP"
  oceanLanes: OceanLane[];
  fclInland: FclInland[];
  lclInland: LclInland[];
  delivery: DeliveryTariff | null;
  variables: RateVariables;
  notes: string[];
  source: RateCardSource;
  /** The active card is the baseline shipments are priced against and tenders compared to. */
  active: boolean;
  created_at: string;
}

export type NewRateCard = Omit<RateCard, "id" | "created_at">;

/** A shipment ("box") to estimate the cost of. */
export interface Shipment {
  id: string;
  ref: string;
  origin: string;
  mode: ShipMode;
  containerSize: ContainerSize;
  containers: number;
  cbm: number;
  weightKg: number;
  cartons: number;
  includeSort: boolean;
  includeDelivery: boolean;
  rate_card_id: string | null; // null → price against the active card
  notes: string;
  created_at: string;
}

export type NewShipment = Omit<Shipment, "id" | "created_at">;

/** A competitor's all-in quote for a shipment scenario, used in the tender comparison. */
export interface CompetitorQuote {
  id: string;
  carrier: string;
  shipment_id: string | null;
  amountGbp: number;
  notes: string;
  created_at: string;
}

export type NewCompetitorQuote = Omit<CompetitorQuote, "id" | "created_at">;

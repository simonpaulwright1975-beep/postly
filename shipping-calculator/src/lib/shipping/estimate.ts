// Pure cost-estimate engine. Reproduces the calculations baked into the Kerry
// rate-card workbook (verified against its "All-in Rate Comparison" formulas),
// so an estimate here matches what the carrier would invoice.

import type {
  ContainerSize,
  DeliveryTariff,
  OceanLane,
  RateCard,
  Shipment,
} from "./types";

export interface EstimateLine {
  label: string;
  amount: number; // GBP
  note?: string;
}

export interface Estimate {
  ok: boolean;
  /** Set when the shipment can't be priced (no matching lane, missing inland, etc). */
  error?: string;
  lines: EstimateLine[];
  freightGbp: number;
  inlandGbp: number;
  sortGbp: number;
  deliveryGbp: number;
  totalGbp: number;
  /** Per-container total for FCL (freight + inclusive UK charges). */
  perContainerGbp?: number;
  warnings: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Find the ocean lane for an origin (case-insensitive, exact then partial). */
export function findLane(card: RateCard, origin: string): OceanLane | undefined {
  const o = origin.trim().toLowerCase();
  return (
    card.oceanLanes.find((l) => l.origin.trim().toLowerCase() === o) ??
    card.oceanLanes.find((l) => l.origin.trim().toLowerCase().includes(o) || o.includes(l.origin.trim().toLowerCase()))
  );
}

function laneAllInUsd(lane: OceanLane, size: ContainerSize): number {
  const s = lane.surcharges;
  const surcharge = s.pss + s.ets + s.ebaf + s.caf;
  const net = size === "20" ? lane.freightNet20 : size === "40" ? lane.freightNet40 : lane.freightNet40hq;
  return net + surcharge;
}

/** Inclusive UK charges per FCL container = shunt + devan + import service + customs + docs. */
export function fclInclusiveGbp(card: RateCard, size: ContainerSize): number | undefined {
  const f = card.fclInland[0];
  if (!f) return undefined;
  const shunt = size === "20" ? f.shunt.c20 : size === "40" ? f.shunt.c40 : f.shunt.c40hq;
  const devan = size === "20" ? f.devan.c20 : size === "40" ? f.devan.c40 : f.devan.c40hq;
  return shunt + devan + f.importServiceFee + f.customsClearance + f.docs;
}

/** Look up the banded final-mile delivery price for a CBM volume. */
export function deliveryForCbm(
  tariff: DeliveryTariff,
  cbm: number,
  weightKg: number,
): { price: number; band?: string; warning?: string } {
  if (!tariff.bands.length) return { price: 0 };
  const band = tariff.bands.find((b) => cbm >= b.fromCbm && cbm <= b.toCbm);
  let price: number;
  let warning: string | undefined;
  let label: string;
  if (band) {
    price = band.price;
    label = `${band.fromCbm}–${band.toCbm} CBM`;
  } else {
    const top = tariff.bands[tariff.bands.length - 1];
    price = top.price;
    label = `over ${top.toCbm} CBM`;
    warning = `CBM ${cbm} is above the published delivery tariff — using the top band, confirm with carrier.`;
  }
  if (weightKg > tariff.triAxleOverKg && tariff.triAxleSurchargePct > 0) {
    price = price * (1 + tariff.triAxleSurchargePct / 100);
    label += ` + ${tariff.triAxleSurchargePct}% tri-axle`;
  }
  return { price: round2(price), band: label, warning };
}

export function estimateShipment(card: RateCard, s: Shipment): Estimate {
  const lines: EstimateLine[] = [];
  const warnings: string[] = [];
  const roe = card.variables.roe || 1;

  const lane = findLane(card, s.origin);
  if (!lane) {
    return {
      ok: false,
      error: `No ocean lane found for origin "${s.origin}" on this rate card.`,
      lines: [],
      freightGbp: 0,
      inlandGbp: 0,
      sortGbp: 0,
      deliveryGbp: 0,
      totalGbp: 0,
      warnings,
    };
  }

  let freightGbp = 0;
  let inlandGbp = 0;
  let sortGbp = 0;
  let deliveryGbp = 0;
  let perContainerGbp: number | undefined;

  if (s.mode === "FCL") {
    const qty = Math.max(1, s.containers || 1);
    const freightUsd = laneAllInUsd(lane, s.containerSize);
    const freightPer = freightUsd / roe;
    const inclusive = fclInclusiveGbp(card, s.containerSize);
    if (inclusive === undefined) {
      return {
        ok: false,
        error: "This rate card has no UK FCL inland charges.",
        lines: [],
        freightGbp: 0,
        inlandGbp: 0,
        sortGbp: 0,
        deliveryGbp: 0,
        totalGbp: 0,
        warnings,
      };
    }
    perContainerGbp = round2(freightPer + inclusive);
    freightGbp = round2(freightPer * qty);
    inlandGbp = round2(inclusive * qty);

    lines.push({
      label: `Ocean freight — ${s.containerSize}' × ${qty}`,
      amount: freightGbp,
      note: `${card.freightCurrency} ${round2(freightUsd)} ÷ ROE ${roe}${qty > 1 ? ` × ${qty}` : ""}`,
    });
    lines.push({
      label: `UK inland (inclusive) × ${qty}`,
      amount: inlandGbp,
      note: "Shunt + devan + import service + customs + docs",
    });

    if (s.includeSort && s.cartons > 0) {
      sortGbp = round2(card.fclInland[0].sortPerCarton * s.cartons);
      lines.push({ label: `Sort — ${s.cartons} cartons`, amount: sortGbp });
    }

    const perContainerKg = qty > 0 ? s.weightKg / qty : s.weightKg;
    if (s.weightKg > 0 && perContainerKg > 18000) {
      warnings.push("Cargo exceeds 18 tonnes per container — a heavyweight surcharge may apply.");
    }
  } else {
    // LCL — groupage, priced per CBM with minimums.
    const cbm = s.cbm > 0 ? s.cbm : card.variables.defaultCbm;
    const freightCbm = Math.max(cbm, 1); // min 1 CBM freight
    const thcCbm = Math.max(cbm, 2); // min 2 CBM THC
    const lcl = card.lclInland[0];
    if (!lcl) {
      return {
        ok: false,
        error: "This rate card has no UK LCL inland charges.",
        lines: [],
        freightGbp: 0,
        inlandGbp: 0,
        sortGbp: 0,
        deliveryGbp: 0,
        totalGbp: 0,
        warnings,
      };
    }
    const oceanUsd = lane.lclPerCbm * freightCbm + lane.cfsTransferUsd;
    freightGbp = round2(oceanUsd / roe);
    const thc = lcl.thcPer2cbm * (thcCbm / 2);
    inlandGbp = round2(thc + lcl.customsClearance + lcl.docs);

    lines.push({
      label: `Ocean freight — ${freightCbm} CBM`,
      amount: freightGbp,
      note:
        `${card.freightCurrency} ${lane.lclPerCbm}/CBM × ${freightCbm}` +
        (lane.cfsTransferUsd ? ` + ${lane.cfsTransferUsd} CFS transfer` : "") +
        ` ÷ ROE ${roe}`,
    });
    lines.push({
      label: "UK inland (THC + customs + docs)",
      amount: inlandGbp,
      note: `THC ${round2(thc)} (per 2 CBM) + customs ${lcl.customsClearance} + docs ${lcl.docs}`,
    });

    if (s.includeSort && s.cartons > 0) {
      sortGbp = round2(lcl.sortPerCarton * s.cartons);
      lines.push({ label: `Sort — ${s.cartons} cartons`, amount: sortGbp });
    }

    if (s.includeDelivery && card.delivery) {
      const d = deliveryForCbm(card.delivery, cbm, s.weightKg);
      deliveryGbp = d.price;
      lines.push({
        label: `Delivery to ${card.delivery.destination}`,
        amount: deliveryGbp,
        note: d.band,
      });
      if (d.warning) warnings.push(d.warning);
    } else if (s.includeDelivery && !card.delivery) {
      warnings.push("Delivery requested but this rate card has no delivery tariff.");
    }
  }

  const totalGbp = round2(freightGbp + inlandGbp + sortGbp + deliveryGbp);

  return {
    ok: true,
    lines,
    freightGbp,
    inlandGbp,
    sortGbp,
    deliveryGbp,
    totalGbp,
    perContainerGbp,
    warnings,
  };
}

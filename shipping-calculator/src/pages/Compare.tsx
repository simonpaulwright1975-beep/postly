import { useEffect, useMemo, useRef, useState } from "react";
import { getRepo } from "../lib/repo";
import { estimateShipment } from "../lib/shipping/estimate";
import { parseRateCardWorkbook } from "../lib/shipping/parseRateCard";
import type { CompetitorQuote, RateCard, Shipment } from "../lib/shipping/types";
import { gbp } from "../lib/shipping/format";
import { Spinner } from "../components/ui";

const TEMPLATE_URL = "/ShipSmart_Rate_Quotation_Template.xlsx";

export default function Compare() {
  const [cards, setCards] = useState<RateCard[] | null>(null);
  const [shipments, setShipments] = useState<Shipment[] | null>(null);
  const [quotes, setQuotes] = useState<CompetitorQuote[] | null>(null);

  // Manual one-off quote form
  const [carrier, setCarrier] = useState("");
  const [shipmentId, setShipmentId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  // Competitor rate-card upload
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const cardFileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const [c, s, q] = await Promise.all([
      getRepo().listRateCards(),
      getRepo().listShipments(),
      getRepo().listQuotes(),
    ]);
    setCards(c);
    setShipments(s);
    setQuotes(q);
    if (!shipmentId && s.length) setShipmentId(s[0].id);
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeCard = useMemo(() => cards?.find((c) => c.active) ?? cards?.[0] ?? null, [cards]);
  const alternatives = useMemo(
    () => (cards ?? []).filter((c) => c.id !== activeCard?.id),
    [cards, activeCard],
  );

  /** Cost of every (card, shipment) pair: "cardId:shipmentId" -> GBP or null if it can't be priced. */
  const cost = useMemo(() => {
    const m = new Map<string, number | null>();
    if (cards && shipments) {
      for (const c of cards) {
        for (const s of shipments) {
          const e = estimateShipment(c, s);
          m.set(`${c.id}:${s.id}`, e.ok ? e.totalGbp : null);
        }
      }
    }
    return m;
  }, [cards, shipments]);

  const baseCost = (sid: string) => (activeCard ? cost.get(`${activeCard.id}:${sid}`) ?? null : null);

  /** Headline: baseline spend vs the best of every option, per shipment. */
  const totals = useMemo(() => {
    let base = 0;
    let best = 0;
    if (activeCard && shipments) {
      for (const s of shipments) {
        const b = baseCost(s.id);
        if (b == null) continue;
        base += b;
        const candidates = [b];
        for (const alt of alternatives) {
          const v = cost.get(`${alt.id}:${s.id}`);
          if (v != null) candidates.push(v);
        }
        for (const q of (quotes ?? []).filter((q) => q.shipment_id === s.id)) candidates.push(q.amountGbp);
        best += Math.min(...candidates);
      }
    }
    return { base, best, saving: base - best };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCard, shipments, alternatives, cost, quotes]);

  /** Whole-rate-card comparison: each alternative's total over the shipments it can price. */
  const cardComparison = useMemo(() => {
    if (!activeCard || !shipments) return [];
    return alternatives
      .map((alt) => {
        let altTotal = 0;
        let baseShared = 0;
        let priced = 0;
        for (const s of shipments) {
          const a = cost.get(`${alt.id}:${s.id}`);
          const b = baseCost(s.id);
          if (a != null && b != null) {
            altTotal += a;
            baseShared += b;
            priced += 1;
          }
        }
        return { card: alt, altTotal, baseShared, saving: baseShared - altTotal, priced, total: shipments.length };
      })
      .sort((a, b) => b.saving - a.saving);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCard, shipments, alternatives, cost]);

  async function onCompetitorCard(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportMsg(null);
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const { card, warnings } = parseRateCardWorkbook(buf, file.name.replace(/\.(xlsx|xls|csv)$/i, ""));
      if (!card.oceanLanes.length) {
        throw new Error("No ocean freight lanes found — is this a completed quote template?");
      }
      await getRepo().createRateCard({ ...card, source: "competitor", active: false });
      setImportMsg(
        `Imported ${card.carrier} — ${card.oceanLanes.length} lane${card.oceanLanes.length === 1 ? "" : "s"}. ` +
          `Now comparing across your shipments.` +
          (warnings.length ? ` (${warnings.length} note${warnings.length === 1 ? "" : "s"} to double-check.)` : ""),
      );
      refresh();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Couldn't read that file.");
    } finally {
      setImporting(false);
      if (cardFileRef.current) cardFileRef.current.value = "";
    }
  }

  async function addQuote() {
    if (!shipmentId || !amount) return;
    await getRepo().createQuote({
      carrier: carrier.trim() || "Competitor",
      shipment_id: shipmentId,
      amountGbp: Number(amount) || 0,
      notes: notes.trim(),
    });
    setCarrier("");
    setAmount("");
    setNotes("");
    refresh();
  }
  async function removeQuote(id: string) {
    await getRepo().deleteQuote(id);
    refresh();
  }

  if (!cards || !shipments || !quotes) return <Spinner />;

  if (!activeCard) {
    return (
      <div className="space-y-4">
        <div className="kerry-card text-sm text-kerry-muted">
          Upload a rate card and add some shipments first — then you can bring in other carriers’
          quotes here to see how much you could save.
        </div>
        <a className="kerry-btn-ghost" href={TEMPLATE_URL} download>
          Download blank quote template
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Headline savings */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={`Current spend · ${activeCard.carrier}`} value={gbp(totals.base)} />
        <Stat label="Best available" value={gbp(totals.best)} />
        <Stat label="Potential saving" value={gbp(totals.saving)} accent />
      </div>
      <p className="text-sm text-kerry-muted">
        Totals across your {shipments.length} saved shipment{shipments.length === 1 ? "" : "s"}, taking the
        cheapest of {activeCard.carrier} and every competitor card or quote for each.
      </p>

      {/* Tender toolkit */}
      <section className="kerry-card space-y-4">
        <div>
          <div className="kerry-title text-lg">Go out to tender</div>
          <p className="mt-1 text-sm text-kerry-muted">
            Send carriers the standard template so everyone quotes the same fields. When a completed
            sheet comes back, upload it and ShipSmart prices all your shipments against it.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="kerry-btn-ghost" href={TEMPLATE_URL} download>
            Download blank quote template
          </a>
          <button
            className="kerry-btn-primary"
            disabled={importing}
            onClick={() => cardFileRef.current?.click()}
          >
            {importing ? "Reading…" : "Upload competitor rate card"}
          </button>
          <input
            ref={cardFileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={onCompetitorCard}
          />
        </div>
        {importMsg && (
          <div className="rounded-xl border border-kerry bg-kerry-bg/70 px-4 py-3 text-sm text-kerry-ink">
            {importMsg}
          </div>
        )}
        {importError && (
          <div className="rounded-xl border border-kerry-rust/40 bg-kerry-rust/10 px-4 py-3 text-sm text-kerry-rust-dark">
            {importError}
          </div>
        )}
      </section>

      {/* Whole-card comparison */}
      <section className="space-y-3">
        <div className="kerry-eyebrow">Carrier comparison</div>
        {cardComparison.length === 0 ? (
          <div className="kerry-card text-sm text-kerry-muted">
            No competitor rate cards yet. Upload a completed quote template above to compare a whole
            carrier against {activeCard.carrier} across every shipment.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-kerry bg-kerry-panel">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-kerry-bg/70 text-left">
                  <th className="px-4 py-3 font-semibold">Carrier</th>
                  <th className="px-4 py-3 font-semibold">Shipments priced</th>
                  <th className="px-4 py-3 font-semibold">Their total</th>
                  <th className="px-4 py-3 font-semibold">vs {activeCard.carrier}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-kerry">
                  <td className="px-4 py-3 font-medium text-kerry-ink">
                    {activeCard.carrier} <span className="text-kerry-muted">(baseline)</span>
                  </td>
                  <td className="px-4 py-3 text-kerry-muted">—</td>
                  <td className="px-4 py-3">{gbp(totals.base)}</td>
                  <td className="px-4 py-3 text-kerry-muted">—</td>
                </tr>
                {cardComparison.map((c) => {
                  const cheaper = c.saving > 0;
                  return (
                    <tr key={c.card.id} className="border-t border-kerry">
                      <td className="px-4 py-3 font-medium text-kerry-ink">{c.card.carrier}</td>
                      <td className="px-4 py-3 text-kerry-muted">
                        {c.priced} of {c.total}
                      </td>
                      <td className="px-4 py-3">{gbp(c.altTotal)}</td>
                      <td className={`px-4 py-3 font-semibold ${cheaper ? "text-green-700" : "text-kerry-rust-dark"}`}>
                        {`${cheaper ? "−" : "+"}${gbp(Math.abs(c.saving))}`}
                        {c.baseShared ? ` (${((c.saving / c.baseShared) * 100).toFixed(0)}%)` : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* One-off quote */}
      <section className="kerry-card space-y-4">
        <div className="kerry-title text-lg">Add a one-off quote</div>
        {shipments.length === 0 ? (
          <div className="text-sm text-kerry-muted">Add shipments first to compare quotes against them.</div>
        ) : (
          <>
            <p className="text-sm text-kerry-muted">
              Got a single lump-sum price instead of a full rate card? Drop it against a shipment here.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="kerry-label mb-1.5 block">Carrier</label>
                <input
                  className="kerry-input"
                  placeholder="e.g. DSV, Maersk"
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                />
              </div>
              <div className="lg:col-span-2">
                <label className="kerry-label mb-1.5 block">For shipment</label>
                <select className="kerry-input" value={shipmentId} onChange={(e) => setShipmentId(e.target.value)}>
                  {shipments.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.ref} ({s.origin} · {s.mode})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="kerry-label mb-1.5 block">Their all-in price (GBP)</label>
                <input
                  type="number"
                  step="0.01"
                  className="kerry-input"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="kerry-label mb-1.5 block">Notes (optional)</label>
                <input className="kerry-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <button className="kerry-btn-ink" onClick={addQuote}>
                Add quote
              </button>
            </div>
          </>
        )}
      </section>

      {/* Per-shipment detail: baseline + every alternative card + one-off quotes */}
      <section className="space-y-4">
        <div className="kerry-eyebrow">Shipment by shipment</div>
        {shipments.length === 0 ? (
          <div className="kerry-card text-sm text-kerry-muted">No shipments to compare yet.</div>
        ) : (
          shipments.map((s) => {
            const base = baseCost(s.id);
            const altRows = alternatives
              .map((alt) => ({ carrier: alt.carrier, price: cost.get(`${alt.id}:${s.id}`) ?? null, id: alt.id }))
              .filter((r) => r.price != null);
            const quoteRows = quotes.filter((q) => q.shipment_id === s.id);
            return (
              <div key={s.id} className="kerry-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="kerry-title text-lg">{s.ref}</div>
                    <div className="mt-1 text-sm text-kerry-muted">
                      {s.origin} · {s.mode}
                      {s.mode === "FCL" ? ` · ${s.containers} × ${s.containerSize}′` : s.cbm ? ` · ${s.cbm} CBM` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="kerry-stat text-2xl">{base != null ? gbp(base) : "—"}</div>
                    <div className="kerry-label">{activeCard.carrier} baseline</div>
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto rounded-xl border border-kerry">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-kerry-bg/70 text-left">
                        <th className="px-3 py-2 font-semibold">Carrier</th>
                        <th className="px-3 py-2 font-semibold">Price</th>
                        <th className="px-3 py-2 font-semibold">Saving vs baseline</th>
                        <th className="px-3 py-2 font-semibold">Source</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-kerry">
                        <td className="px-3 py-2 font-medium text-kerry-ink">{activeCard.carrier} (baseline)</td>
                        <td className="px-3 py-2">{base != null ? gbp(base) : "—"}</td>
                        <td className="px-3 py-2 text-kerry-muted">—</td>
                        <td className="px-3 py-2 text-kerry-muted">Rate card</td>
                        <td className="px-3 py-2" />
                      </tr>
                      {altRows.length === 0 && quoteRows.length === 0 ? (
                        <tr className="border-t border-kerry">
                          <td colSpan={5} className="px-3 py-3 text-center text-xs text-kerry-muted">
                            No competitor cards or quotes cover this shipment yet.
                          </td>
                        </tr>
                      ) : (
                        <>
                          {altRows.map((r) => {
                            const saving = base != null && r.price != null ? base - r.price : null;
                            const cheaper = saving != null && saving > 0;
                            return (
                              <tr key={`c-${r.id}`} className="border-t border-kerry">
                                <td className="px-3 py-2 font-medium text-kerry-ink">{r.carrier}</td>
                                <td className="px-3 py-2">{gbp(r.price!)}</td>
                                <td className={`px-3 py-2 font-semibold ${cheaper ? "text-green-700" : "text-kerry-rust-dark"}`}>
                                  {saving == null ? "—" : `${cheaper ? "−" : "+"}${gbp(Math.abs(saving))}`}
                                </td>
                                <td className="px-3 py-2 text-kerry-muted">Rate card</td>
                                <td className="px-3 py-2" />
                              </tr>
                            );
                          })}
                          {quoteRows.map((q) => {
                            const saving = base != null ? base - q.amountGbp : null;
                            const cheaper = saving != null && saving > 0;
                            return (
                              <tr key={`q-${q.id}`} className="border-t border-kerry">
                                <td className="px-3 py-2 font-medium text-kerry-ink">{q.carrier}</td>
                                <td className="px-3 py-2">{gbp(q.amountGbp)}</td>
                                <td className={`px-3 py-2 font-semibold ${cheaper ? "text-green-700" : "text-kerry-rust-dark"}`}>
                                  {saving == null ? "—" : `${cheaper ? "−" : "+"}${gbp(Math.abs(saving))}`}
                                </td>
                                <td className="px-3 py-2 text-kerry-muted">{q.notes || "One-off quote"}</td>
                                <td className="px-3 py-2 text-right">
                                  <button className="kerry-label hover:!text-kerry-rust" onClick={() => removeQuote(q.id)}>
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`kerry-card ${accent ? "bg-kerry-rust text-kerry-panel" : ""}`}>
      <div className={`text-3xl font-slab font-bold tracking-tight ${accent ? "text-kerry-panel" : "text-kerry-rust"}`}>
        {value}
      </div>
      <div className={`mt-1 text-[11px] font-medium uppercase tracking-[0.14em] ${accent ? "text-kerry-panel/80" : "text-kerry-muted"}`}>
        {label}
      </div>
    </div>
  );
}

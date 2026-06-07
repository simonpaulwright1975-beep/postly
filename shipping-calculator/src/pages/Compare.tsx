import { useEffect, useMemo, useState } from "react";
import { getRepo } from "../lib/repo";
import { estimateShipment } from "../lib/shipping/estimate";
import type { CompetitorQuote, RateCard, Shipment } from "../lib/shipping/types";
import { gbp } from "../lib/shipping/format";
import { Spinner } from "../components/ui";

export default function Compare() {
  const [cards, setCards] = useState<RateCard[] | null>(null);
  const [shipments, setShipments] = useState<Shipment[] | null>(null);
  const [quotes, setQuotes] = useState<CompetitorQuote[] | null>(null);

  const [carrier, setCarrier] = useState("");
  const [shipmentId, setShipmentId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

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

  /** Kerry baseline cost per shipment id. */
  const baseline = useMemo(() => {
    const map = new Map<string, number>();
    if (activeCard && shipments) {
      for (const s of shipments) {
        const est = estimateShipment(activeCard, s);
        if (est.ok) map.set(s.id, est.totalGbp);
      }
    }
    return map;
  }, [activeCard, shipments]);

  const totals = useMemo(() => {
    if (!shipments || !quotes) return { kerry: 0, best: 0, saving: 0 };
    let kerry = 0;
    let best = 0;
    for (const s of shipments) {
      const base = baseline.get(s.id);
      if (base == null) continue;
      kerry += base;
      const sQuotes = quotes.filter((q) => q.shipment_id === s.id).map((q) => q.amountGbp);
      best += Math.min(base, ...(sQuotes.length ? sQuotes : [base]));
    }
    return { kerry, best, saving: kerry - best };
  }, [shipments, quotes, baseline]);

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
      <div className="kerry-card text-sm text-kerry-muted">
        Upload a rate card and add some shipments first — then you can drop in quotes from other
        carriers here to see how much you could save.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Headline savings — reference-card big-number style */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={`Current spend · ${activeCard.carrier}`} value={gbp(totals.kerry)} />
        <Stat label="Best available" value={gbp(totals.best)} />
        <Stat label="Potential saving" value={gbp(totals.saving)} accent />
      </div>
      <p className="text-sm text-kerry-muted">
        Totals across your {shipments.length} saved shipment{shipments.length === 1 ? "" : "s"}, taking the
        cheapest of {activeCard.carrier} and any competitor quote for each.
      </p>

      {/* Add a competitor quote */}
      <section className="kerry-card space-y-4">
        <div className="kerry-title text-lg">Add a competitor quote</div>
        {shipments.length === 0 ? (
          <div className="text-sm text-kerry-muted">Add shipments first to compare quotes against them.</div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="lg:col-span-1">
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
                <select
                  className="kerry-input"
                  value={shipmentId}
                  onChange={(e) => setShipmentId(e.target.value)}
                >
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
                <input
                  className="kerry-input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <button className="kerry-btn-ink" onClick={addQuote}>
                Add quote
              </button>
            </div>
          </>
        )}
      </section>

      {/* Per-shipment comparison */}
      <section className="space-y-4">
        <div className="kerry-eyebrow">Shipment by shipment</div>
        {shipments.length === 0 ? (
          <div className="kerry-card text-sm text-kerry-muted">No shipments to compare yet.</div>
        ) : (
          shipments.map((s) => {
            const base = baseline.get(s.id);
            const sQuotes = quotes.filter((q) => q.shipment_id === s.id);
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
                        <th className="px-3 py-2 font-semibold">Notes</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-kerry">
                        <td className="px-3 py-2 font-medium text-kerry-ink">{activeCard.carrier} (baseline)</td>
                        <td className="px-3 py-2">{base != null ? gbp(base) : "—"}</td>
                        <td className="px-3 py-2 text-kerry-muted">—</td>
                        <td className="px-3 py-2 text-kerry-muted">From your rate card</td>
                        <td className="px-3 py-2" />
                      </tr>
                      {sQuotes.length === 0 ? (
                        <tr className="border-t border-kerry">
                          <td colSpan={5} className="px-3 py-3 text-center text-xs text-kerry-muted">
                            No competitor quotes yet for this shipment.
                          </td>
                        </tr>
                      ) : (
                        sQuotes.map((q) => {
                          const saving = base != null ? base - q.amountGbp : null;
                          const cheaper = saving != null && saving > 0;
                          return (
                            <tr key={q.id} className="border-t border-kerry">
                              <td className="px-3 py-2 font-medium text-kerry-ink">{q.carrier}</td>
                              <td className="px-3 py-2">{gbp(q.amountGbp)}</td>
                              <td className={`px-3 py-2 font-semibold ${cheaper ? "text-green-700" : "text-kerry-rust-dark"}`}>
                                {saving == null ? "—" : `${cheaper ? "−" : "+"}${gbp(Math.abs(saving))}`}
                                {saving != null && base ? ` (${((saving / base) * 100).toFixed(0)}%)` : ""}
                              </td>
                              <td className="px-3 py-2 text-kerry-muted">{q.notes || "—"}</td>
                              <td className="px-3 py-2 text-right">
                                <button
                                  className="kerry-label hover:!text-kerry-rust"
                                  onClick={() => removeQuote(q.id)}
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          );
                        })
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

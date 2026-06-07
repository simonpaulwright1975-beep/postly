import { useEffect, useRef, useState } from "react";
import { getRepo } from "../../lib/repo";
import { parseRateCardWorkbook, type ParseResult } from "../../lib/shipping/parseRateCard";
import type { RateCard } from "../../lib/shipping/types";
import { gbp, usd, validityLabel } from "../../lib/shipping/format";
import { Spinner } from "../../components/ui";

export default function RateCards() {
  const [cards, setCards] = useState<RateCard[] | null>(null);
  const [pending, setPending] = useState<ParseResult | null>(null);
  const [pendingTitle, setPendingTitle] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setCards(await getRepo().listRateCards());
  }
  useEffect(() => {
    refresh();
  }, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const title = file.name.replace(/\.(xlsx|xls)$/i, "");
      const result = parseRateCardWorkbook(buf, title);
      setPending(result);
      setPendingTitle(title);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Couldn't read that file.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function savePending() {
    if (!pending) return;
    await getRepo().createRateCard({ ...pending.card, title: pendingTitle.trim() || pending.card.title });
    setPending(null);
    refresh();
  }

  async function setActive(id: string) {
    await getRepo().setActiveRateCard(id);
    refresh();
  }
  async function remove(id: string) {
    if (!confirm("Delete this rate card?")) return;
    await getRepo().deleteRateCard(id);
    refresh();
  }

  if (!cards) return <Spinner />;

  return (
    <div className="space-y-8">
      {/* Upload */}
      <section className="kerry-card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="kerry-title text-xl">Upload a rate card</div>
            <p className="mt-1 text-sm text-kerry-muted">
              Drop in the monthly Kerry Logistics Excel file. We’ll read the freight, inland and
              delivery rates so you can price shipments against them.
            </p>
          </div>
          <button
            className="kerry-btn-primary"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? "Reading…" : "Choose .xlsx file"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={onFile}
          />
        </div>
        {parseError && (
          <div className="mt-4 rounded-xl border border-kerry-rust/40 bg-kerry-rust/10 px-4 py-3 text-sm text-kerry-rust-dark">
            {parseError}
          </div>
        )}
      </section>

      {/* Pending review */}
      {pending && (
        <section className="kerry-card border-kerry-rust/40">
          <div className="kerry-eyebrow mb-2">Review before saving</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="kerry-label mb-1.5 block">Label</label>
              <input
                className="kerry-input"
                value={pendingTitle}
                onChange={(e) => setPendingTitle(e.target.value)}
              />
            </div>
            <div className="flex items-end text-sm text-kerry-muted">
              {pending.card.carrier} · {validityLabel(pending.card.validFrom, pending.card.validTo)}
            </div>
          </div>

          <RateCardDetail card={{ ...(pending.card as RateCard) }} />

          {pending.warnings.length > 0 && (
            <div className="mt-4 rounded-xl border border-kerry-rust/40 bg-kerry-rust/10 px-4 py-3 text-sm text-kerry-rust-dark">
              <div className="font-semibold">A few things to double-check:</div>
              <ul className="mt-1 list-disc pl-5">
                {pending.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <button className="kerry-btn-ink" onClick={savePending}>
              Save rate card
            </button>
            <button className="kerry-btn-ghost" onClick={() => setPending(null)}>
              Discard
            </button>
          </div>
        </section>
      )}

      {/* Saved cards */}
      <section>
        <div className="kerry-eyebrow mb-3">Saved rate cards</div>
        {cards.length === 0 ? (
          <div className="kerry-card text-sm text-kerry-muted">
            No rate cards yet. Upload your first Kerry Logistics card above to get started.
          </div>
        ) : (
          <div className="space-y-4">
            {cards.map((c) => (
              <div
                key={c.id}
                className={`kerry-card ${c.active ? "ring-2 ring-kerry-rust" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="kerry-title text-lg">{c.title}</span>
                      {c.active && (
                        <span className="rounded-full bg-kerry-rust px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-kerry-panel">
                          Active baseline
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-kerry-muted">
                      {c.carrier} · {validityLabel(c.validFrom, c.validTo)} ·{" "}
                      {c.oceanLanes.length} lane{c.oceanLanes.length === 1 ? "" : "s"} · ROE{" "}
                      {c.variables.roe}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!c.active && (
                      <button className="kerry-btn-primary !py-1.5 !text-xs" onClick={() => setActive(c.id)}>
                        Set as baseline
                      </button>
                    )}
                    <button
                      className="kerry-btn-ghost !py-1.5 !text-xs"
                      onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                    >
                      {expanded === c.id ? "Hide" : "View rates"}
                    </button>
                    <button
                      className="kerry-label hover:!text-kerry-rust"
                      onClick={() => remove(c.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {expanded === c.id && <RateCardDetail card={c} />}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** Renders a rate card's contents in the reference-card visual style. */
function RateCardDetail({ card }: { card: RateCard }) {
  const lane = card.oceanLanes[0];
  const fcl = card.fclInland[0];
  const highlights: { label: string; sub: string; value: string }[] = [];
  if (lane) {
    highlights.push({
      label: "Ocean freight, 40′",
      sub: `${lane.origin} → ${lane.pod}`,
      value: usd(lane.freightNet40),
    });
    highlights.push({
      label: "LCL freight",
      sub: `${lane.origin}, per CBM`,
      value: usd(lane.lclPerCbm),
    });
  }
  if (fcl) {
    const inclusive = fcl.shunt.c40 + fcl.devan.c40 + fcl.importServiceFee + fcl.customsClearance + fcl.docs;
    highlights.push({
      label: "UK inland, 40′",
      sub: "All-inclusive per container",
      value: gbp(inclusive),
    });
  }
  highlights.push({
    label: "Exchange rate",
    sub: "GBP → USD (ROE)",
    value: card.variables.roe.toString(),
  });

  return (
    <div className="mt-5 space-y-6">
      {/* By-the-numbers highlights */}
      <div>
        <div className="kerry-eyebrow mb-3">By the numbers</div>
        <div className="divide-y divide-kerry/70 border-y border-kerry">
          {highlights.map((h, i) => (
            <div key={i} className="flex items-center gap-4 py-3">
              <div className="kerry-badge">{i + 1}</div>
              <div className="flex-1">
                <div className="kerry-title text-base">{h.label}</div>
                <div className="text-xs text-kerry-muted">{h.sub}</div>
              </div>
              <div className="kerry-stat text-2xl">{h.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Ocean lanes table */}
      {card.oceanLanes.length > 0 && (
        <RateTable
          title="Ocean freight"
          head={["Origin", "POD", "Transit", "20′", "40′", "40′ HQ", "LCL/CBM"]}
          rows={card.oceanLanes.map((l) => [
            l.origin,
            l.pod,
            l.transitDays != null ? `${l.transitDays} days` : "—",
            usd(l.freightNet20),
            usd(l.freightNet40),
            usd(l.freightNet40hq),
            usd(l.lclPerCbm),
          ])}
        />
      )}

      {/* Inland */}
      <div className="grid gap-6 md:grid-cols-2">
        {fcl && (
          <RateTable
            title="UK FCL inland (per container)"
            head={["Charge", "20′", "40′", "40′ HQ"]}
            rows={[
              ["Shunt", gbp(fcl.shunt.c20), gbp(fcl.shunt.c40), gbp(fcl.shunt.c40hq)],
              ["Devan", gbp(fcl.devan.c20), gbp(fcl.devan.c40), gbp(fcl.devan.c40hq)],
              ["Import service fee", gbp(fcl.importServiceFee), "", ""],
              ["Customs clearance", gbp(fcl.customsClearance), "", ""],
              ["Docs", gbp(fcl.docs), "", ""],
            ]}
          />
        )}
        {card.lclInland[0] && (
          <RateTable
            title="UK LCL inland (per shipment)"
            head={["Charge", "Amount"]}
            rows={[
              ["THC (per 2 CBM)", gbp(card.lclInland[0].thcPer2cbm)],
              ["Customs clearance", gbp(card.lclInland[0].customsClearance)],
              ["Docs", gbp(card.lclInland[0].docs)],
              ["Sort (per carton)", gbp(card.lclInland[0].sortPerCarton)],
            ]}
          />
        )}
      </div>

      {/* Delivery */}
      {card.delivery && card.delivery.bands.length > 0 && (
        <RateTable
          title={`Delivery tariff — ${card.delivery.destination}`}
          head={["From CBM", "To CBM", "Price"]}
          rows={card.delivery.bands.map((b) => [
            b.fromCbm.toString(),
            b.toCbm.toString(),
            gbp(b.price),
          ])}
        />
      )}

      {card.notes.length > 0 && (
        <div className="rounded-xl bg-kerry-bg/70 p-4">
          <div className="kerry-eyebrow mb-2">Notes & conditions</div>
          <ul className="list-disc space-y-1 pl-5 text-xs text-kerry-muted">
            {card.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RateTable({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
  return (
    <div>
      <div className="kerry-eyebrow mb-2">{title}</div>
      <div className="overflow-x-auto rounded-xl border border-kerry">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-kerry-bg/70 text-left">
              {head.map((h, i) => (
                <th key={i} className="px-3 py-2 font-semibold text-kerry-ink first:rounded-tl-xl last:rounded-tr-xl">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-kerry">
                {r.map((cell, j) => (
                  <td key={j} className={`px-3 py-2 ${j === 0 ? "text-kerry-ink" : "text-kerry-muted"}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

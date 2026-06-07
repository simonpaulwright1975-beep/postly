import { useEffect, useMemo, useRef, useState } from "react";
import { getRepo } from "../lib/repo";
import { estimateShipment } from "../lib/shipping/estimate";
import { parseLoadingListWorkbook, type LoadingListResult } from "../lib/shipping/parseLoadingList";
import { readLoadingListPdf } from "../lib/api";
import type { ContainerSize, RateCard, Shipment, ShipMode } from "../lib/shipping/types";
import { gbp } from "../lib/shipping/format";
import { Spinner } from "../components/ui";

type Draft = {
  ref: string;
  origin: string;
  mode: ShipMode;
  containerSize: ContainerSize;
  containers: string;
  cbm: string;
  weightKg: string;
  cartons: string;
  includeSort: boolean;
  includeDelivery: boolean;
  notes: string;
};

const EMPTY: Draft = {
  ref: "",
  origin: "",
  mode: "LCL",
  containerSize: "40HQ",
  containers: "1",
  cbm: "",
  weightKg: "",
  cartons: "",
  includeSort: false,
  includeDelivery: true,
  notes: "",
};

export default function Shipments() {
  const [cards, setCards] = useState<RateCard[] | null>(null);
  const [shipments, setShipments] = useState<Shipment[] | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [imported, setImported] = useState<(LoadingListResult & { fileName: string }) | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const listRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const [c, s] = await Promise.all([getRepo().listRateCards(), getRepo().listShipments()]);
    setCards(c);
    setShipments(s);
  }
  useEffect(() => {
    refresh();
  }, []);

  const activeCard = useMemo(() => cards?.find((c) => c.active) ?? cards?.[0] ?? null, [cards]);
  const origins = useMemo(
    () => Array.from(new Set((cards ?? []).flatMap((c) => c.oceanLanes.map((l) => l.origin)))),
    [cards],
  );

  function startNew() {
    setEditing(null);
    setImported(null);
    setDraft({ ...EMPTY, origin: origins[0] ?? "", cbm: activeCard?.variables.defaultCbm?.toString() ?? "" });
    setOpen(true);
  }

  function startEdit(s: Shipment) {
    setEditing(s.id);
    setDraft({
      ref: s.ref,
      origin: s.origin,
      mode: s.mode,
      containerSize: s.containerSize,
      containers: s.containers.toString(),
      cbm: s.cbm ? s.cbm.toString() : "",
      weightKg: s.weightKg ? s.weightKg.toString() : "",
      cartons: s.cartons ? s.cartons.toString() : "",
      includeSort: s.includeSort,
      includeDelivery: s.includeDelivery,
      notes: s.notes,
    });
    setOpen(true);
  }

  async function onLoadingList(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
    setImporting(true);
    try {
      let result: LoadingListResult & { originPort?: string };
      if (isPdf) {
        // Claude reads the PDF server-side and returns the totals.
        const data = await fileToBase64(file);
        result = await readLoadingListPdf(data, file.name);
      } else {
        result = parseLoadingListWorkbook(await file.arrayBuffer());
      }
      // Match the port Claude found against this card's lanes, if possible.
      const aiOrigin = result.originPort ?? "";
      const matched =
        origins.find((o) => o.toLowerCase() === aiOrigin.toLowerCase()) ??
        origins.find((o) => aiOrigin && o.toLowerCase().includes(aiOrigin.toLowerCase()));
      const ref = file.name.replace(/\.(xlsx|xls|csv|pdf)$/i, "");
      setEditing(null);
      setDraft({
        ...EMPTY,
        ref,
        origin: matched ?? origins[0] ?? aiOrigin,
        mode: "LCL",
        cbm: result.totalCbm ? result.totalCbm.toString() : "",
        weightKg: result.totalWeightKg ? result.totalWeightKg.toString() : "",
        cartons: result.totalCartons ? result.totalCartons.toString() : "",
        includeSort: result.totalCartons > 0,
      });
      setImported({ ...result, fileName: file.name });
      setOpen(true);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Couldn't read that loading list.");
    } finally {
      setImporting(false);
      if (listRef.current) listRef.current.value = "";
    }
  }

  async function submit() {
    const payload = {
      ref: draft.ref.trim() || "Untitled shipment",
      origin: draft.origin.trim(),
      mode: draft.mode,
      containerSize: draft.containerSize,
      containers: Number(draft.containers) || 1,
      cbm: Number(draft.cbm) || 0,
      weightKg: Number(draft.weightKg) || 0,
      cartons: Number(draft.cartons) || 0,
      includeSort: draft.includeSort,
      includeDelivery: draft.includeDelivery,
      rate_card_id: null,
      notes: draft.notes.trim(),
    };
    if (editing) await getRepo().updateShipment(editing, payload);
    else await getRepo().createShipment(payload);
    setOpen(false);
    setImported(null);
    refresh();
  }

  async function remove(id: string) {
    await getRepo().deleteShipment(id);
    refresh();
  }

  if (!cards || !shipments) return <Spinner />;

  if (!activeCard) {
    return (
      <div className="kerry-card text-sm text-kerry-muted">
        You need a rate card first. Head to <span className="font-semibold text-kerry-ink">Rate cards</span>{" "}
        and upload your Kerry Logistics file, then come back to price your shipments.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-kerry-muted">
          Pricing against <span className="font-semibold text-kerry-ink">{activeCard.title}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="kerry-btn-ghost"
            disabled={importing}
            onClick={() => listRef.current?.click()}
          >
            {importing ? "Reading…" : "Upload loading list"}
          </button>
          <button className="kerry-btn-primary" onClick={startNew}>
            Add shipment
          </button>
          <input
            ref={listRef}
            type="file"
            accept=".xlsx,.xls,.csv,.pdf"
            className="hidden"
            onChange={onLoadingList}
          />
        </div>
      </div>

      {importError && (
        <div className="rounded-xl border border-kerry-rust/40 bg-kerry-rust/10 px-4 py-3 text-sm text-kerry-rust-dark">
          {importError}
        </div>
      )}

      {open && (
        <section className="kerry-card space-y-4">
          <div className="kerry-title text-lg">{editing ? "Edit shipment" : "New shipment"}</div>

          {imported && (
            <div className="rounded-xl border border-kerry bg-kerry-bg/70 px-4 py-3 text-sm">
              <div className="font-semibold text-kerry-ink">
                Imported from {imported.fileName}
              </div>
              <div className="mt-1 text-kerry-muted">
                {imported.lineItems} line item{imported.lineItems === 1 ? "" : "s"} totalled —{" "}
                {imported.totalCartons.toLocaleString()} cartons · {imported.totalCbm} CBM ·{" "}
                {imported.totalWeightKg.toLocaleString()} kg. Set the origin port below, then check
                the figures and save.
              </div>
              <div className="mt-1 text-xs text-kerry-muted">
                Detected columns — cartons: {imported.detected.cartons ?? "—"}, CBM:{" "}
                {imported.detected.cbm ?? "—"}, weight: {imported.detected.weight ?? "—"}
              </div>
              {imported.warnings.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs text-kerry-rust-dark">
                  {imported.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Reference">
              <input
                className="kerry-input"
                placeholder="e.g. PO-10482"
                value={draft.ref}
                onChange={(e) => setDraft({ ...draft, ref: e.target.value })}
              />
            </Field>
            <Field label="Origin port">
              <input
                className="kerry-input"
                list="origins"
                value={draft.origin}
                onChange={(e) => setDraft({ ...draft, origin: e.target.value })}
              />
              <datalist id="origins">
                {origins.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </Field>
            <Field label="Mode">
              <div className="flex gap-2">
                {(["LCL", "FCL"] as ShipMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDraft({ ...draft, mode: m })}
                    className={`kerry-btn flex-1 ${
                      draft.mode === m ? "bg-kerry-ink text-kerry-panel" : "border border-kerry text-kerry-ink"
                    }`}
                  >
                    {m === "LCL" ? "LCL (part load)" : "FCL (full container)"}
                  </button>
                ))}
              </div>
            </Field>

            {draft.mode === "FCL" ? (
              <>
                <Field label="Container size">
                  <select
                    className="kerry-input"
                    value={draft.containerSize}
                    onChange={(e) => setDraft({ ...draft, containerSize: e.target.value as ContainerSize })}
                  >
                    <option value="20">20′</option>
                    <option value="40">40′</option>
                    <option value="40HQ">40′ HQ</option>
                  </select>
                </Field>
                <Field label="Number of containers">
                  <input
                    type="number"
                    min="1"
                    className="kerry-input"
                    value={draft.containers}
                    onChange={(e) => setDraft({ ...draft, containers: e.target.value })}
                  />
                </Field>
              </>
            ) : (
              <Field label="Volume (CBM)">
                <input
                  type="number"
                  step="0.01"
                  className="kerry-input"
                  value={draft.cbm}
                  onChange={(e) => setDraft({ ...draft, cbm: e.target.value })}
                />
              </Field>
            )}

            <Field label="Weight (kg)">
              <input
                type="number"
                className="kerry-input"
                value={draft.weightKg}
                onChange={(e) => setDraft({ ...draft, weightKg: e.target.value })}
              />
            </Field>
            <Field label="Cartons (for sort fee)">
              <input
                type="number"
                className="kerry-input"
                value={draft.cartons}
                onChange={(e) => setDraft({ ...draft, cartons: e.target.value })}
              />
            </Field>
          </div>

          <div className="flex flex-wrap gap-5">
            <Check
              label="Include sort fee"
              checked={draft.includeSort}
              onChange={(v) => setDraft({ ...draft, includeSort: v })}
            />
            <Check
              label="Include final delivery"
              checked={draft.includeDelivery}
              onChange={(v) => setDraft({ ...draft, includeDelivery: v })}
            />
          </div>

          <Field label="Notes">
            <input
              className="kerry-input"
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </Field>

          <div className="flex gap-2">
            <button className="kerry-btn-ink" onClick={submit}>
              {editing ? "Save changes" : "Add shipment"}
            </button>
            <button
              className="kerry-btn-ghost"
              onClick={() => {
                setOpen(false);
                setImported(null);
              }}
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {shipments.length === 0 ? (
        <div className="kerry-card text-sm text-kerry-muted">
          No shipments yet. Add a box above and we’ll estimate its landed shipping cost.
        </div>
      ) : (
        <div className="space-y-4">
          {shipments.map((s) => {
            const card = (s.rate_card_id && cards.find((c) => c.id === s.rate_card_id)) || activeCard;
            const est = estimateShipment(card, s);
            return (
              <ShipmentRow
                key={s.id}
                shipment={s}
                est={est}
                onEdit={() => startEdit(s)}
                onDelete={() => remove(s.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function ShipmentRow({
  shipment: s,
  est,
  onEdit,
  onDelete,
}: {
  shipment: Shipment;
  est: ReturnType<typeof estimateShipment>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="kerry-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="kerry-title text-lg">{s.ref}</div>
          <div className="mt-1 text-sm text-kerry-muted">
            {s.origin || "—"} · {s.mode}
            {s.mode === "FCL"
              ? ` · ${s.containers} × ${s.containerSize}′`
              : s.cbm
                ? ` · ${s.cbm} CBM`
                : ""}
            {s.weightKg ? ` · ${s.weightKg.toLocaleString()} kg` : ""}
          </div>
        </div>
        <div className="text-right">
          {est.ok ? (
            <>
              <div className="kerry-stat text-3xl">{gbp(est.totalGbp)}</div>
              <div className="kerry-label">Estimated landed cost</div>
            </>
          ) : (
            <div className="max-w-xs text-sm text-kerry-rust-dark">{est.error}</div>
          )}
        </div>
      </div>

      {est.ok && (
        <>
          {open && (
            <div className="mt-4 divide-y divide-kerry/70 border-y border-kerry">
              {est.lines.map((l, i) => (
                <div key={i} className="flex items-baseline justify-between gap-4 py-2.5">
                  <div>
                    <div className="text-sm font-medium text-kerry-ink">{l.label}</div>
                    {l.note && <div className="text-xs text-kerry-muted">{l.note}</div>}
                  </div>
                  <div className="kerry-stat text-base">{gbp(l.amount)}</div>
                </div>
              ))}
            </div>
          )}
          {est.warnings.length > 0 && (
            <div className="mt-3 rounded-lg border border-kerry-rust/40 bg-kerry-rust/10 px-3 py-2 text-xs text-kerry-rust-dark">
              {est.warnings.map((w, i) => (
                <div key={i}>⚠ {w}</div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {est.ok && (
          <button className="kerry-btn-ghost !py-1.5 !text-xs" onClick={() => setOpen(!open)}>
            {open ? "Hide breakdown" : "Cost breakdown"}
          </button>
        )}
        <button className="kerry-btn-ghost !py-1.5 !text-xs" onClick={onEdit}>
          Edit
        </button>
        <button className="kerry-label hover:!text-kerry-rust" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

/** Read a File into a bare base64 string (no data: prefix) for the API. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="kerry-label mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-kerry-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-kerry-rust"
      />
      {label}
    </label>
  );
}

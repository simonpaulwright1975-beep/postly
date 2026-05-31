import { useEffect, useState } from "react";
import { getRepo } from "../lib/repo";
import type { BrandProfile } from "../lib/types";
import { PageHeader, Spinner } from "../components/ui";

const FIELDS: { key: keyof BrandProfile; label: string; rows: number }[] = [
  { key: "voice", label: "Voice", rows: 3 },
  { key: "tone", label: "Tone", rows: 2 },
  { key: "audience", label: "Audience", rows: 2 },
  { key: "product_list", label: "Products", rows: 2 },
  { key: "do_words", label: "Prefer these words / themes", rows: 2 },
  { key: "dont_words", label: "Avoid these words / themes", rows: 2 },
];

export default function BrandProfilePage() {
  const [brand, setBrand] = useState<BrandProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getRepo().getBrandProfile().then(setBrand);
  }, []);

  async function save() {
    if (!brand) return;
    setSaving(true);
    try {
      const updated = await getRepo().saveBrandProfile(brand);
      setBrand(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  if (!brand) return <Spinner />;

  return (
    <div>
      <PageHeader eyebrow="Identity" title="Brand voice." />
      <p className="mb-6 max-w-2xl text-sm text-mid">
        This profile is fed into every generation so posts sound consistently like TUMCH.
        Tune it once and all future content follows it.
      </p>

      <div className="card max-w-2xl space-y-5">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className="label-mono mb-1.5 block">{f.label}</label>
            <textarea
              className="input resize-y"
              rows={f.rows}
              value={(brand[f.key] as string) ?? ""}
              onChange={(e) => setBrand({ ...brand, [f.key]: e.target.value })}
            />
          </div>
        ))}
        <div className="flex items-center gap-3">
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save brand voice"}
          </button>
          {saved && <span className="text-sm font-medium text-sage-brand">Saved.</span>}
        </div>
      </div>
    </div>
  );
}

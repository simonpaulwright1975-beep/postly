import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getRepo } from "../lib/repo";
import { getMediaSource } from "../providers/media";
import { addImage, mediaSrc } from "../lib/media";
import { stashImage, type ImageRole } from "../lib/handoff";
import type { BankImage, MediaAsset, MediaCategory } from "../lib/types";
import { PageHeader, Spinner } from "../components/ui";

type Tab = MediaCategory | "uploads";

const TABS: { id: Tab; label: string; blurb: string }[] = [
  { id: "inspiration", label: "Inspiration", blurb: "Mood & reference shots that guide the AI's tone — never published." },
  { id: "new", label: "New", blurb: "Fresh photos straight off your phone, waiting to be turned into posts." },
  { id: "stock", label: "Stock", blurb: "Product shots, organised into one subfolder per product — the subfolder name tells the AI which product a photo shows." },
  { id: "uploads", label: "Uploads", blurb: "Photos uploaded straight into Postly (stored compressed in the cloud)." },
];

export default function MediaLibrary() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("new");

  return (
    <div>
      <PageHeader eyebrow="Photo bank" title="Media." />
      <p className="mb-6 max-w-2xl text-sm text-mid">
        Your bank lives in Google Drive — the <em>Inspiration</em>, <em>New</em> and <em>Stock</em> tabs
        read it live. Postly only keeps a small compressed copy of an image when you actually use it.
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={[
              "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
              tab === t.id
                ? "border-charcoal bg-charcoal text-cream"
                : "border-warm text-mid hover:border-strong",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="mb-5 text-sm text-mid">{TABS.find((t) => t.id === tab)?.blurb}</p>

      {tab === "uploads" ? (
        <UploadsTab navigate={navigate} />
      ) : (
        <BankTab key={tab} category={tab} navigate={navigate} />
      )}
    </div>
  );
}

type Nav = ReturnType<typeof useNavigate>;

function useStash(navigate: Nav) {
  return (role: ImageRole, kind: "bank" | "asset", image: BankImage | MediaAsset, label: string) => {
    stashImage({ role, kind, image, label });
    navigate("/generate");
  };
}

function BankTab({ category, navigate }: { category: MediaCategory; navigate: Nav }) {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [images, setImages] = useState<BankImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const send = useStash(navigate);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getMediaSource()
      .listBank(category)
      .then((r) => {
        setConfigured(r.configured);
        setImages(r.images);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load bank."))
      .finally(() => setLoading(false));
  }, [category]);

  if (loading) return <Spinner label="Reading your Drive…" />;
  if (error)
    return (
      <div className="card text-sm text-terracotta">{error}</div>
    );
  if (!configured)
    return (
      <div className="card space-y-2">
        <div className="text-lg font-extrabold">Google Drive not connected yet</div>
        <p className="max-w-lg text-sm text-mid">
          Once the Drive service account and folder IDs are set on the server, your{" "}
          <strong>{category}</strong> photos appear here automatically. Until then, use the{" "}
          <strong>Uploads</strong> tab to add photos directly.
        </p>
      </div>
    );
  if (images.length === 0)
    return (
      <div className="card text-sm text-mid">
        No images in your <strong>{category}</strong> Drive folder yet. Add some from your phone.
      </div>
    );

  // Stock is grouped by product (the Drive subfolder each photo lives in).
  if (category === "stock") {
    const groups = new Map<string, BankImage[]>();
    for (const img of images) {
      const key = img.product ?? "Other";
      groups.set(key, [...(groups.get(key) ?? []), img]);
    }
    return (
      <div className="space-y-8">
        {[...groups.entries()].map(([product, imgs]) => (
          <div key={product}>
            <h3 className="mb-3 text-sm font-extrabold text-charcoal">{product}</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {imgs.map((img) => (
                <ImageCard
                  key={img.id}
                  src={img.thumbnailUrl}
                  name={img.name}
                  category={category}
                  label={img.product}
                  onAttach={() => send("attach", "bank", img, img.product ?? img.name)}
                  onInspire={() => send("inspiration", "bank", img, img.product ?? img.name)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {images.map((img) => (
        <ImageCard
          key={img.id}
          src={img.thumbnailUrl}
          name={img.name}
          category={category}
          onAttach={() => send("attach", "bank", img, img.name)}
          onInspire={() => send("inspiration", "bank", img, img.name)}
        />
      ))}
    </div>
  );
}

function UploadsTab({ navigate }: { navigate: Nav }) {
  const [items, setItems] = useState<{ asset: MediaAsset; src: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState<MediaCategory>("new");
  const fileRef = useRef<HTMLInputElement>(null);
  const send = useStash(navigate);

  async function refresh() {
    setLoading(true);
    const assets = await getRepo().listMedia();
    const uploads = assets.filter((a) => a.source === "upload");
    const resolved = await Promise.all(
      uploads.map(async (asset) => ({ asset, src: await mediaSrc(asset) })),
    );
    setItems(resolved);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) await addImage(f, category, { source: "upload" });
      await refresh();
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(id: string) {
    await getRepo().deleteMedia(id);
    await refresh();
  }

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center gap-3">
        <select
          className="input max-w-44"
          value={category}
          onChange={(e) => setCategory(e.target.value as MediaCategory)}
        >
          <option value="new">New</option>
          <option value="stock">Stock</option>
          <option value="inspiration">Inspiration</option>
          <option value="product">Product</option>
        </select>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
        <button className="btn-primary" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? "Uploading…" : "Upload photos"}
        </button>
        <span className="text-xs text-mid">Compressed automatically before storing.</span>
      </div>

      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <div className="card text-sm text-mid">No uploads yet. Add a few photos above.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map(({ asset, src }) => (
            <ImageCard
              key={asset.id}
              src={src}
              name={asset.category}
              category={asset.category}
              onAttach={() => send("attach", "asset", asset, asset.category)}
              onInspire={() => send("inspiration", "asset", asset, asset.category)}
              onDelete={() => remove(asset.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ImageCard({
  src,
  name,
  category,
  label,
  onAttach,
  onInspire,
  onDelete,
}: {
  src: string;
  name: string;
  category: MediaCategory;
  label?: string;
  onAttach: () => void;
  onInspire: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="card-hover overflow-hidden rounded-2xl border border-warm bg-warm-white">
      <div className="aspect-square overflow-hidden bg-cream">
        <img src={src} alt={name} loading="lazy" className="h-full w-full object-cover" />
      </div>
      <div className="space-y-2 p-3">
        <div className="chip">{label ?? category}</div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={onAttach}
            className="rounded-full bg-charcoal px-3 py-1 text-[11px] font-semibold text-cream"
          >
            Use in post
          </button>
          <button
            onClick={onInspire}
            className="rounded-full border border-strong px-3 py-1 text-[11px] font-semibold text-charcoal hover:bg-cream"
          >
            Inspiration
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              className="rounded-full border border-warm px-3 py-1 text-[11px] font-semibold text-mid hover:text-terracotta"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getRepo } from "../lib/repo";
import type { Product } from "../lib/types";
import { PageHeader, Spinner } from "../components/ui";

type Draft = {
  title: string;
  description: string;
  price: string;
  currency: string;
  image_url: string;
  sku: string;
};

const EMPTY: Draft = {
  title: "",
  description: "",
  price: "",
  currency: "GBP",
  image_url: "",
  sku: "",
};

export default function Catalogue() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [open, setOpen] = useState(false);

  async function refresh() {
    setProducts(await getRepo().listProducts());
  }
  useEffect(() => {
    refresh();
  }, []);

  function startNew() {
    setEditing(null);
    setDraft(EMPTY);
    setOpen(true);
  }

  function startEdit(p: Product) {
    setEditing(p.id);
    setDraft({
      title: p.title,
      description: p.description,
      price: p.price?.toString() ?? "",
      currency: p.currency,
      image_url: p.image_urls[0] ?? "",
      sku: p.sku ?? "",
    });
    setOpen(true);
  }

  async function submit() {
    if (!draft.title.trim()) return;
    const payload = {
      source: "manual" as const,
      external_id: null,
      sku: draft.sku || null,
      title: draft.title.trim(),
      description: draft.description.trim(),
      price: draft.price ? Number(draft.price) : null,
      currency: draft.currency || "GBP",
      image_urls: draft.image_url ? [draft.image_url] : [],
      stock: null,
      url: null,
    };
    if (editing) {
      await getRepo().updateProduct(editing, payload);
    } else {
      await getRepo().createProduct(payload);
    }
    setOpen(false);
    refresh();
  }

  async function remove(id: string) {
    await getRepo().deleteProduct(id);
    refresh();
  }

  if (!products) return <Spinner />;

  return (
    <div>
      <PageHeader eyebrow="Products" title="Catalogue.">
        <button className="btn-primary" onClick={startNew}>
          Add product
        </button>
      </PageHeader>

      {open && (
        <div className="card mb-6 space-y-4">
          <div className="font-extrabold">{editing ? "Edit product" : "New product"}</div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="label-mono mb-1.5 block">Title</label>
              <input
                className="input"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <label className="label-mono mb-1.5 block">Description</label>
              <textarea
                className="input min-h-20 resize-y"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
            <div>
              <label className="label-mono mb-1.5 block">Price</label>
              <input
                className="input"
                type="number"
                step="0.01"
                value={draft.price}
                onChange={(e) => setDraft({ ...draft, price: e.target.value })}
              />
            </div>
            <div>
              <label className="label-mono mb-1.5 block">Currency</label>
              <input
                className="input"
                value={draft.currency}
                onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
              />
            </div>
            <div>
              <label className="label-mono mb-1.5 block">Image URL</label>
              <input
                className="input"
                value={draft.image_url}
                onChange={(e) => setDraft({ ...draft, image_url: e.target.value })}
              />
            </div>
            <div>
              <label className="label-mono mb-1.5 block">SKU</label>
              <input
                className="input"
                value={draft.sku}
                onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-dark" onClick={submit}>
              {editing ? "Save changes" : "Add product"}
            </button>
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {products.length === 0 ? (
        <div className="card text-sm text-mid">
          No products yet. The TUMCH site has no product API, so add products here by hand —
          then generate posts and eBay listings straight from them.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <div key={p.id} className="card card-hover flex flex-col">
              {p.image_urls[0] && (
                <img
                  src={p.image_urls[0]}
                  alt={p.title}
                  className="mb-3 aspect-square w-full rounded-xl object-cover"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
              )}
              <div className="font-bold">{p.title}</div>
              <div className="mt-1 line-clamp-3 flex-1 text-sm text-mid">{p.description}</div>
              <div className="mt-2 stat-number text-lg">
                {p.price != null ? `${p.currency} ${p.price.toFixed(2)}` : "—"}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="btn-primary !py-1.5 !text-xs"
                  onClick={() => navigate(`/generate?product=${p.id}`)}
                >
                  Generate content
                </button>
                <button className="btn-ghost !py-1.5 !text-xs" onClick={() => startEdit(p)}>
                  Edit
                </button>
                <button
                  className="label-mono hover:!text-terracotta"
                  onClick={() => remove(p.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

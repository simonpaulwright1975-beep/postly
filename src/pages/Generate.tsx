import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { generateContent, type GenerateImage } from "../lib/api";
import { getRepo } from "../lib/repo";
import { takeImage } from "../lib/handoff";
import { mediaSrc, resolveImageBase64 } from "../lib/media";
import { PLATFORMS, type BankImage, type GeneratedContent, type Platform, type Product } from "../lib/types";
import { PageHeader } from "../components/ui";

const DEFAULT_PLATFORMS: Platform[] = ["instagram", "facebook", "linkedin"];

interface PickedImage {
  role: "attach" | "inspiration";
  label: string;
  src: string;
  product?: string;
  payload: GenerateImage | null;
}

export default function Generate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [prompt, setPrompt] = useState("");
  const [platforms, setPlatforms] = useState<Platform[]>(DEFAULT_PLATFORMS);
  const [includeBlog, setIncludeBlog] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedContent | null>(null);
  const [saving, setSaving] = useState(false);
  const [picked, setPicked] = useState<PickedImage[]>([]);

  useEffect(() => {
    getRepo()
      .listProducts()
      .then((list) => {
        setProducts(list);
        const wanted = searchParams.get("product");
        if (wanted && list.some((p) => p.id === wanted)) setProductId(wanted);
      });
  }, [searchParams]);

  // Pick up an image stashed from the Media Library, resolve it for display + vision.
  useEffect(() => {
    const handoff = takeImage();
    if (!handoff) return;
    const isBank = "fullUrl" in handoff.image;
    const display = isBank
      ? (handoff.image as { thumbnailUrl: string }).thumbnailUrl
      : "";
    const product = isBank ? (handoff.image as BankImage).product : undefined;
    const placeholder: PickedImage = {
      role: handoff.role,
      label: handoff.label,
      src: display,
      product,
      payload: null,
    };
    setPicked((cur) => [...cur, placeholder]);

    (async () => {
      try {
        const src = isBank ? display : await mediaSrc(handoff.image as never);
        const payload = await resolveImageBase64(handoff.image);
        setPicked((cur) =>
          cur.map((p) =>
            p === placeholder
              ? { ...p, src: src || display, payload: { role: handoff.role, ...payload, product } }
              : p,
          ),
        );
      } catch {
        // Leave the chip with no payload; generation still works text-only.
      }
    })();
  }, []);

  function removePicked(idx: number) {
    setPicked((cur) => cur.filter((_, i) => i !== idx));
  }

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId),
    [products, productId],
  );

  function togglePlatform(p: Platform) {
    setPlatforms((cur) =>
      cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p],
    );
  }

  async function handleGenerate() {
    setError(null);
    setResult(null);
    if (!prompt.trim() && !selectedProduct) {
      setError("Add a prompt or pick a product to write about.");
      return;
    }
    if (platforms.length === 0) {
      setError("Choose at least one platform.");
      return;
    }
    setLoading(true);
    try {
      const brand = await getRepo().getBrandProfile();
      const content = await generateContent({
        prompt: prompt.trim() || undefined,
        product: selectedProduct
          ? {
              title: selectedProduct.title,
              description: selectedProduct.description,
              price: selectedProduct.price,
              currency: selectedProduct.currency,
            }
          : undefined,
        platforms,
        includeBlog,
        images: picked
          .map((p) => p.payload)
          .filter((p): p is GenerateImage => p !== null),
        brand,
      });
      setResult(content);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setLoading(false);
    }
  }

  function editVariant(i: number, patch: Partial<GeneratedContent["variants"][number]>) {
    setResult((r) =>
      r
        ? { ...r, variants: r.variants.map((v, idx) => (idx === i ? { ...v, ...patch } : v)) }
        : r,
    );
  }

  async function saveDraft() {
    if (!result) return;
    setSaving(true);
    try {
      const post = await getRepo().createPost({
        body: result.idea,
        blog_body: result.blog_body ?? null,
        variants: result.variants.map((v) => ({
          platform: v.platform,
          body: v.body,
          hashtags: v.hashtags,
        })),
      });
      navigate(`/drafts?focus=${post.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader eyebrow="Content engine" title="Generate." />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        {/* ── Input ── */}
        <div className="card space-y-5">
          <div>
            <label className="label-mono mb-2 block">Brief / theme</label>
            <textarea
              className="input min-h-28 resize-y"
              placeholder="e.g. Launch the new Sleep Balm — calming evening ritual angle"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          {picked.length > 0 && (
            <div>
              <label className="label-mono mb-2 block">Photos</label>
              <div className="flex flex-wrap gap-2">
                {picked.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-xl border border-warm bg-warm-white py-1.5 pl-1.5 pr-2.5"
                  >
                    {p.src ? (
                      <img
                        src={p.src}
                        alt={p.label}
                        className="h-9 w-9 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="h-9 w-9 rounded-lg bg-cream" />
                    )}
                    <div className="leading-tight">
                      <div className="max-w-32 truncate text-xs font-semibold">{p.label}</div>
                      <div className="label-mono !text-[9px]">
                        {p.role === "attach" ? "Use in post" : "Inspiration"}
                        {p.product ? ` · ${p.product}` : ""}
                        {p.payload ? "" : " · loading…"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePicked(i)}
                      className="ml-1 text-mid hover:text-terracotta"
                      aria-label="Remove photo"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {products.length > 0 && (
            <div>
              <label className="label-mono mb-2 block">Or write about a product</label>
              <select
                className="input"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                <option value="">— none —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="label-mono mb-2 block">Platforms</label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => {
                const on = platforms.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePlatform(p.id)}
                    className={[
                      "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                      on
                        ? "border-charcoal bg-charcoal text-cream"
                        : "border-warm text-mid hover:border-strong",
                    ].join(" ")}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
            <input
              type="checkbox"
              checked={includeBlog}
              onChange={(e) => setIncludeBlog(e.target.checked)}
              className="h-4 w-4 accent-terracotta"
            />
            Also write a blog post (400–800 words)
          </label>

          <button
            className="btn-primary w-full"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? "Generating…" : "Generate content"}
          </button>

          {error && (
            <div className="rounded-xl border border-terracotta/40 bg-terracotta/10 px-4 py-3 text-sm text-terracotta">
              {error}
            </div>
          )}
        </div>

        {/* ── Output ── */}
        <div className="space-y-4">
          {!result && !loading && (
            <div className="card flex h-full min-h-64 flex-col items-center justify-center text-center text-sm text-mid">
              Your tailored drafts will appear here.
            </div>
          )}

          {result && (
            <>
              <div className="card">
                <div className="label-mono mb-2">Core idea</div>
                <p className="text-sm">{result.idea}</p>
              </div>

              {result.variants.map((v, i) => {
                const meta = PLATFORMS.find((p) => p.id === v.platform);
                const total =
                  v.body.length + v.hashtags.join(" ").length + v.hashtags.length;
                const over = meta ? total > meta.maxChars : false;
                return (
                  <div key={i} className="card space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-extrabold">{meta?.label ?? v.platform}</div>
                      <span
                        className={[
                          "label-mono",
                          over ? "!text-terracotta" : "",
                        ].join(" ")}
                      >
                        {total}
                        {meta ? ` / ${meta.maxChars}` : ""}
                      </span>
                    </div>
                    <textarea
                      className="input min-h-28 resize-y"
                      value={v.body}
                      onChange={(e) => editVariant(i, { body: e.target.value })}
                    />
                    <input
                      className="input"
                      value={v.hashtags.join(" ")}
                      placeholder="hashtags, space-separated"
                      onChange={(e) =>
                        editVariant(i, {
                          hashtags: e.target.value
                            .split(/\s+/)
                            .map((h) => h.replace(/^#/, ""))
                            .filter(Boolean),
                        })
                      }
                    />
                  </div>
                );
              })}

              {result.blog_body && (
                <div className="card space-y-2">
                  <div className="label-mono">Blog draft (Markdown)</div>
                  <textarea
                    className="input min-h-48 resize-y font-mono text-xs"
                    value={result.blog_body}
                    onChange={(e) =>
                      setResult((r) => (r ? { ...r, blog_body: e.target.value } : r))
                    }
                  />
                </div>
              )}

              <button className="btn-dark w-full" onClick={saveDraft} disabled={saving}>
                {saving ? "Saving…" : "Save as draft"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

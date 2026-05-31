import { useEffect, useState } from "react";
import { getRepo, type PostWithVariants } from "../lib/repo";
import { PLATFORMS, type PostVariant } from "../lib/types";
import { getManualProvider, getPublishingProvider } from "../providers/publishing";
import { EmptyState, PageHeader, Spinner } from "../components/ui";

const publisher = getPublishingProvider();
const manual = getManualProvider();

export default function Drafts() {
  const [posts, setPosts] = useState<PostWithVariants[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function refresh() {
    setPosts(await getRepo().listPosts());
  }
  useEffect(() => {
    refresh();
  }, []);

  function flash(msg: string) {
    setNote(msg);
    setTimeout(() => setNote(null), 2500);
  }

  async function copyVariant(v: PostVariant) {
    const res = await manual.publish({
      platform: v.platform,
      body: v.body,
      hashtags: v.hashtags,
      mediaUrls: [],
    });
    flash(res.note ?? "Copied.");
  }

  async function scheduleVariant(v: PostVariant, value: string) {
    await getRepo().updateVariant(v.id, {
      scheduled_for: value ? new Date(value).toISOString() : null,
      status: value ? "scheduled" : "draft",
    });
    refresh();
  }

  /** Publish immediately through the aggregator (or copy if not connected). */
  async function publishNow(v: PostVariant) {
    if (!window.confirm("Publish this post live to the connected account now?")) return;
    const res = await publisher.publish({
      platform: v.platform,
      body: v.body,
      hashtags: v.hashtags,
      mediaUrls: [],
    });
    if (res.published) {
      await getRepo().updateVariant(v.id, {
        status: "published",
        published_at: new Date().toISOString(),
        external_id: res.externalId,
      });
      refresh();
    }
    flash(res.note ?? (res.published ? "Published." : "Done."));
  }

  /** Hand the planned scheduled_for time to the aggregator to auto-post. */
  async function scheduleOnSocial(v: PostVariant) {
    if (!v.scheduled_for) {
      flash("Pick a date and time first.");
      return;
    }
    const res = await publisher.publish({
      platform: v.platform,
      body: v.body,
      hashtags: v.hashtags,
      mediaUrls: [],
      scheduleDate: v.scheduled_for,
    });
    if (res.externalId) {
      await getRepo().updateVariant(v.id, {
        status: "scheduled",
        external_id: res.externalId,
      });
      refresh();
    }
    flash(res.note ?? "Scheduled.");
  }

  /** Cancel a post that was scheduled on the aggregator. */
  async function cancelScheduled(v: PostVariant) {
    if (v.external_id && publisher.cancel) {
      await publisher.cancel(v.external_id);
    }
    await getRepo().updateVariant(v.id, {
      status: "draft",
      external_id: null,
      scheduled_for: null,
    });
    refresh();
    flash("Scheduled post cancelled.");
  }

  async function markPublished(v: PostVariant) {
    await getRepo().updateVariant(v.id, {
      status: "published",
      published_at: new Date().toISOString(),
    });
    refresh();
    flash("Marked as published.");
  }

  async function remove(id: string) {
    await getRepo().deletePost(id);
    refresh();
  }

  if (!posts) return <Spinner />;

  return (
    <div>
      <PageHeader eyebrow="Review queue" title="Drafts." />

      {note && (
        <div className="mb-4 rounded-xl border border-sage/40 bg-sage/10 px-4 py-2.5 text-sm font-medium text-sage-brand">
          {note}
        </div>
      )}

      {posts.length === 0 ? (
        <EmptyState
          title="No drafts yet"
          hint="Generate content and save it as a draft — it'll land here for review, scheduling and publishing."
        />
      ) : (
        <div className="space-y-5">
          {posts.map((post) => (
            <div key={post.id} className="card space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="chip mb-2">{post.status}</span>
                  <p className="text-sm text-mid">{post.body}</p>
                </div>
                <button
                  onClick={() => remove(post.id)}
                  className="label-mono shrink-0 hover:!text-terracotta"
                >
                  Delete
                </button>
              </div>

              <div className="space-y-3 border-t border-warm pt-4">
                {post.variants.map((v) => {
                  const label =
                    PLATFORMS.find((p) => p.id === v.platform)?.label ?? v.platform;
                  return (
                    <div key={v.id} className="rounded-xl bg-cream/60 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-bold">{label}</span>
                        <span className="chip">{v.status}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm">{v.body}</p>
                      {v.hashtags.length > 0 && (
                        <p className="mt-1.5 text-sm text-sage-brand">
                          {v.hashtags.map((h) => `#${h}`).join(" ")}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button onClick={() => copyVariant(v)} className="btn-ghost !py-1.5 !text-xs">
                          Copy caption
                        </button>
                        <input
                          type="datetime-local"
                          className="input !w-auto !py-1.5 !text-xs"
                          value={
                            v.scheduled_for
                              ? new Date(v.scheduled_for).toISOString().slice(0, 16)
                              : ""
                          }
                          onChange={(e) => scheduleVariant(v, e.target.value)}
                        />
                        {v.status === "published" ? null : v.external_id ? (
                          <button
                            onClick={() => cancelScheduled(v)}
                            className="btn-ghost !py-1.5 !text-xs hover:!text-terracotta"
                          >
                            Cancel scheduled
                          </button>
                        ) : (
                          <>
                            {v.scheduled_for && (
                              <button
                                onClick={() => scheduleOnSocial(v)}
                                className="btn-ghost !py-1.5 !text-xs"
                              >
                                Schedule on social
                              </button>
                            )}
                            <button
                              onClick={() => publishNow(v)}
                              className="btn-primary !py-1.5 !text-xs"
                            >
                              Publish now
                            </button>
                            <button
                              onClick={() => markPublished(v)}
                              className="btn-ghost !py-1.5 !text-xs"
                            >
                              Mark published
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

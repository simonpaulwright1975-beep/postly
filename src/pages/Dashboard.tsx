import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getRepo, type PostWithVariants } from "../lib/repo";
import { PageHeader } from "../components/ui";

export default function Dashboard() {
  const [posts, setPosts] = useState<PostWithVariants[]>([]);

  useEffect(() => {
    getRepo().listPosts().then(setPosts);
  }, []);

  const variants = posts.flatMap((p) => p.variants);
  const stats = [
    { label: "Drafts", value: posts.filter((p) => p.status === "draft").length },
    {
      label: "Scheduled",
      value: variants.filter((v) => v.status === "scheduled").length,
    },
    {
      label: "Published",
      value: variants.filter((v) => v.status === "published").length,
    },
    { label: "Total posts", value: posts.length },
  ];

  return (
    <div>
      <PageHeader eyebrow="Overview" title="Social on autopilot.">
        <Link to="/generate" className="btn-primary">
          Generate content
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card card-hover">
            <div className="label-mono mb-3">{s.label}</div>
            <div className="stat-number text-5xl">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <div className="label-mono mb-3">Recent posts</div>
        {posts.length === 0 ? (
          <div className="card text-sm text-mid">
            No posts yet. Head to{" "}
            <Link to="/generate" className="font-semibold text-terracotta">
              Generate
            </Link>{" "}
            to create your first on-brand draft.
          </div>
        ) : (
          <div className="space-y-2">
            {posts.slice(0, 6).map((p) => (
              <Link
                key={p.id}
                to="/drafts"
                className="card card-hover flex items-center justify-between gap-4 !py-4"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {p.body.slice(0, 80) || "(no body)"}
                  </div>
                  <div className="label-mono mt-1">
                    {p.variants.length} variant{p.variants.length === 1 ? "" : "s"}
                  </div>
                </div>
                <span className="chip">{p.status}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { PLATFORMS } from "../lib/types";
import { getPublishingStatus, type PublishingStatus } from "../providers/publishing";
import { PageHeader, Spinner } from "../components/ui";

const POSTIZ_DASHBOARD = "https://platform.postiz.com";

export default function Channels() {
  const [status, setStatus] = useState<PublishingStatus | null>(null);

  async function refresh() {
    setStatus(await getPublishingStatus());
  }
  useEffect(() => {
    refresh();
  }, []);

  if (!status) return <Spinner label="Checking connections…" />;

  // The server resolves Postiz channels to our platform ids.
  const connected = new Set(status.accounts);

  return (
    <div>
      <PageHeader eyebrow="Settings" title="Channels.">
        <button onClick={refresh} className="btn-ghost !py-2 !text-xs">
          Refresh
        </button>
      </PageHeader>

      <p className="mb-6 max-w-2xl text-sm text-mid">
        Postly publishes through one connection (Postiz), so every account is
        linked in one place and posts go out automatically — no copy-pasting.
      </p>

      {!status.configured ? (
        <div className="card max-w-2xl space-y-4">
          <div>
            <span className="chip mb-2">Not connected</span>
            <h2 className="text-lg font-extrabold">Connect your social accounts</h2>
          </div>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-mid">
            <li>
              Create an account at{" "}
              <a
                className="font-semibold text-charcoal underline"
                href="https://postiz.com"
                target="_blank"
                rel="noreferrer"
              >
                postiz.com
              </a>{" "}
              (cloud, low monthly cost) — or self-host it for free — and link your
              Instagram, Facebook, LinkedIn, X, TikTok and Threads.
            </li>
            <li>
              In Postiz → Settings → Developers → Public API, copy your{" "}
              <strong>API key</strong>.
            </li>
            <li>
              In Netlify → Site settings → Environment variables, add{" "}
              <code className="rounded bg-cream px-1.5 py-0.5 text-xs">
                POSTIZ_API_KEY
              </code>{" "}
              with that value.
            </li>
            <li>
              Self-hosting? Also add{" "}
              <code className="rounded bg-cream px-1.5 py-0.5 text-xs">
                POSTIZ_API_URL
              </code>{" "}
              pointing at your instance's{" "}
              <code className="rounded bg-cream px-1.5 py-0.5 text-xs">
                /public/v1
              </code>{" "}
              URL. (Skip this for Postiz cloud.)
            </li>
            <li>Redeploy, come back here and hit Refresh.</li>
          </ol>
          {status.error && (
            <p className="text-xs text-terracotta">Service note: {status.error}</p>
          )}
        </div>
      ) : (
        <div className="card max-w-2xl space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <span className="chip mb-2">Connected</span>
              <h2 className="text-lg font-extrabold">Your channels</h2>
            </div>
            <a
              href={POSTIZ_DASHBOARD}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost !py-2 !text-xs"
            >
              Manage accounts
            </a>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {PLATFORMS.map((p) => {
              const on = connected.has(p.id);
              return (
                <div
                  key={p.id}
                  className={[
                    "flex items-center justify-between rounded-xl border px-4 py-3 text-sm",
                    on
                      ? "border-sage/40 bg-sage/10 font-semibold text-sage-brand"
                      : "border-warm bg-cream/40 text-mid",
                  ].join(" ")}
                >
                  <span>{p.label}</span>
                  <span className="label-mono !text-[9px]">{on ? "Linked" : "—"}</span>
                </div>
              );
            })}
          </div>

          {connected.size === 0 && (
            <p className="text-sm text-mid">
              No accounts linked yet. Use <strong>Manage accounts</strong> to
              connect them in Postiz, then hit Refresh.
            </p>
          )}
          {status.error && (
            <p className="text-xs text-terracotta">Service note: {status.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

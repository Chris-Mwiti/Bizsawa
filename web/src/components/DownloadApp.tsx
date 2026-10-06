import { ArrowDownToLine, BellRing, Check, RefreshCw, ShieldCheck } from "lucide-react";
import manifest from "../download.json";
import { BlurFade } from "./magic";

/*
 * Preview-app distribution. All release facts come from
 * `src/download.json`, which the release pipeline rewrites on every
 * stable preview build (version, Drive APK link, size). An empty apkUrl
 * renders the honest "first build in progress" state — never a dead link.
 */
export function DownloadApp() {
  const ready = manifest.apkUrl.length > 0;

  return (
    <section id="download" aria-label="Download the preview app" className="mx-auto max-w-[1400px] px-4 pb-16 md:px-8 md:pb-24">
      <BlurFade>
        <div className="grid items-center gap-8 rounded-[28px] bg-ink p-6 text-white shadow-clinical md:p-10 lg:grid-cols-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/55">
              Preview build · Android
            </p>
            <h2 className="mt-3 font-display text-3xl font-medium leading-tight md:text-5xl">
              Take the counter with you
            </h2>
            <p className="mt-3 max-w-[48ch] text-[15px] leading-relaxed text-white/70">
              {ready
                ? manifest.notes
                : "We are preparing the first stable preview. This button will serve the latest build the moment it lands."}
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold">
              <span className="rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/15">
                v{manifest.version} · build {manifest.buildNumber}
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/15">
                {manifest.sizeMb ? `${manifest.sizeMb} MB` : "size TBA"}
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/15">
                Android {manifest.minAndroid}+
              </span>
            </div>
            <ol className="mt-6 space-y-2.5 text-sm text-white/80">
              {[
                "Download the APK below",
                'When asked, allow "Install unknown apps"',
                "Open BizSawa and sign in — done",
              ].map((s, i) => (
                <li key={s} className="flex items-center gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/12 text-xs font-bold">
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-[24px] bg-surface p-6 text-ink md:p-8">
            <div className="flex items-center gap-4">
              <img src="/logo-mark.png" alt="BizSawa logo" className="size-14 rounded-2xl object-cover shadow-clinical-sm" />
              <div>
                <p className="text-lg font-bold">BizSawa Preview</p>
                <p className="text-sm text-ink-muted">
                  {ready && manifest.releasedAt
                    ? `Released ${manifest.releasedAt}`
                    : "Not released yet"}
                </p>
              </div>
            </div>
            {ready ? (
              <a
                href={manifest.apkUrl}
                download
                className="mt-6 flex items-center justify-center gap-2 rounded-full bg-ink px-8 py-4 text-sm font-semibold tracking-[0.14em] text-white transition-transform duration-300 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]"
              >
                <ArrowDownToLine size={17} />
                DOWNLOAD FOR ANDROID
              </a>
            ) : (
              <button
                disabled
                className="mt-6 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-full bg-sunken px-8 py-4 text-sm font-semibold tracking-[0.14em] text-ink-subtle"
              >
                <BellRing size={17} />
                FIRST BUILD IN PROGRESS
              </button>
            )}
            <ul className="mt-5 space-y-2 text-[13px] font-medium text-ink-muted">
              <li className="flex items-center gap-2">
                <RefreshCw size={14} className="text-accent" />
                Updates itself over the air — most fixes need no reinstall
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-accent" />
                Same app, signed by us
                <Check size={14} className="text-pos" />
              </li>
              <li className="text-ink-subtle">
                Google Play listing ships with version 2.
              </li>
            </ul>
          </div>
        </div>
      </BlurFade>
    </section>
  );
}

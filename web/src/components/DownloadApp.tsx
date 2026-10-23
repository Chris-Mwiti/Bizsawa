import { ArrowDownToLine, BellRing, Check, Globe, RefreshCw, Share, ShieldCheck, Smartphone } from "lucide-react";
import manifest from "../download.json";
import { BlurFade } from "./magic";
import { usePwaInstall } from "../hooks/usePwaInstall";

/*
 * Get-the-app section.
 *
 * Two surfaces, one product:
 *   - The PWA — runs in any browser, installs to the home screen, works
 *     offline through IndexedDB. No install friction, no store.
 *   - The Android APK — the full native build: biometric unlock, automatic
 *     M-Pesa SMS capture, hardware-backed secure storage and background sync.
 *
 * All release facts come from `src/download.json`, which the release pipeline
 * rewrites on every stable build (version, Drive APK link, size, PWA URL).
 * An empty apkUrl renders the honest "first build in progress" state — never
 * a dead link.
 */
export function DownloadApp() {
  const ready = manifest.apkUrl.length > 0;
  const pwaReady = manifest.pwaUrl.length > 0;
  const { canInstall, isInstalled, needsManualSteps, install } = usePwaInstall();

  return (
    <section id="download" aria-label="Get the app" className="mx-auto max-w-[1400px] px-4 pb-16 md:px-8 md:pb-24">
      <BlurFade>
        <div className="grid items-center gap-8 rounded-[28px] bg-ink p-6 text-white shadow-clinical md:p-10 lg:grid-cols-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/55">
              BizSawa · every device
            </p>
            <h2 className="mt-3 font-display text-3xl font-medium leading-tight md:text-5xl">
              Take the counter with you
            </h2>
            <p className="mt-3 max-w-[48ch] text-[15px] leading-relaxed text-white/70">
              Start in the browser and install it to your home screen, or take the full Android build
              with biometric unlock and automatic M-Pesa capture.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold">
              <span className="rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/15">
                v{manifest.version} · build {manifest.buildNumber}
              </span>
              {manifest.sizeMb ? (
                <span className="rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/15">
                  APK {manifest.sizeMb} MB
                </span>
              ) : null}
              <span className="rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/15">
                Android {manifest.minAndroid}+
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/15">
                PWA · offline ready
              </span>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {/* ---- PWA ---- */}
              <div className="rounded-[20px] bg-white/8 p-4 ring-1 ring-white/12">
                <div className="flex items-center gap-2">
                  <Globe size={16} className="text-white/70" />
                  <p className="font-geist-bold text-sm font-bold text-white">In your browser</p>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-white/65">
                  {manifest.pwaNotes ??
                    "Runs in any browser, installs to your home screen and keeps working offline."}
                </p>
                {pwaReady ? (
                  <a
                    href={manifest.pwaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-[13px] font-semibold tracking-[0.1em] text-ink transition-transform duration-300 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]"
                  >
                    <Globe size={15} />
                    OPEN BIZSAWA
                  </a>
                ) : null}
                {/* The install prompt only exists in a browser that supports it. */}
                {canInstall && !isInstalled ? (
                  <button
                    onClick={async () => {
                      const ok = await install();
                      if (!ok) {
                        console.warn("[PWA] install prompt did not complete");
                      }
                    }}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-white/12 px-5 py-3 text-[13px] font-semibold tracking-[0.1em] text-white ring-1 ring-white/20 transition-colors hover:bg-white/20"
                  >
                    <Smartphone size={15} />
                    INSTALL TO HOME SCREEN
                  </button>
                ) : null}
                {needsManualSteps ? (
                  <p className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-white/55">
                    <Share size={13} className="mt-0.5 shrink-0" />
                    On iPhone: tap Share, then “Add to Home Screen”.
                  </p>
                ) : null}
                {isInstalled ? (
                  <p className="mt-3 flex items-center gap-2 text-[12px] font-semibold text-white/70">
                    <Check size={13} />
                    Installed
                  </p>
                ) : null}
              </div>

              {/* ---- APK ---- */}
              <div className="rounded-[20px] bg-white/8 p-4 ring-1 ring-white/12">
                <div className="flex items-center gap-2">
                  <Smartphone size={16} className="text-white/70" />
                  <p className="font-geist-bold text-sm font-bold text-white">Android app</p>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-white/65">
                  The full native build: biometric unlock, automatic M-Pesa SMS capture and background
                  sync.
                </p>
                {ready ? (
                  <a
                    href={manifest.apkUrl}
                    download
                    className="mt-4 flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-[13px] font-semibold tracking-[0.1em] text-ink transition-transform duration-300 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]"
                  >
                    <ArrowDownToLine size={15} />
                    DOWNLOAD APK
                  </a>
                ) : (
                  <button
                    disabled
                    className="mt-4 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-full bg-white/8 px-5 py-3 text-[13px] font-semibold tracking-[0.1em] text-white/40 ring-1 ring-white/10"
                  >
                    <BellRing size={15} />
                    FIRST BUILD IN PROGRESS
                  </button>
                )}
                <ul className="mt-3 space-y-1.5 text-[12px] text-white/55">
                  <li className="flex items-center gap-2">
                    <RefreshCw size={12} className="text-accent" />
                    Updates itself over the air
                  </li>
                  <li className="flex items-center gap-2">
                    <ShieldCheck size={12} className="text-accent" />
                    Signed by us
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] bg-surface p-6 text-ink md:p-8">
            <div className="flex items-center gap-4">
              <img src="/logo-mark.png" alt="BizSawa logo" className="size-14 rounded-2xl object-cover shadow-clinical-sm" />
              <div>
                <p className="text-lg font-bold">BizSawa Preview</p>
                <p className="text-sm text-ink-muted">
                  {ready && manifest.releasedAt ? `Released ${manifest.releasedAt}` : "Not released yet"}
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-3 text-sm">
              <p className="font-geist-bold text-[11px] font-bold uppercase tracking-[0.18em] text-ink-subtle">
                Which one should I pick?
              </p>
              <ul className="space-y-2.5 text-[13px] leading-relaxed text-ink-muted">
                <li className="flex gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                  <span>
                    <strong className="font-semibold text-ink">Browser / PWA</strong> — fastest way to start,
                    works offline, syncs the same data. Install from the page.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                  <span>
                    <strong className="font-semibold text-ink">Android app</strong> — add biometric unlock,
                    automatic M-Pesa SMS capture and background sync.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                  <span className="flex items-center gap-1.5">
                    <Check size={13} className="text-pos" />
                    Same account, same business, on every device.
                  </span>
                </li>
              </ul>
            </div>

            <p className="mt-6 border-t border-gray-200 pt-4 text-[12px] leading-relaxed text-ink-subtle">
              Google Play listing ships with version 2. Installing either option keeps your data in sync
              automatically — sign in with the same email and you land on the same business.
            </p>
          </div>
        </div>
      </BlurFade>
    </section>
  );
}

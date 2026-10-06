import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/*
 * Magic-UI-style primitives, hand-built for BizSawa (inspired by Magic UI,
 * not the official package): shine border, shimmer button, marquee, animated
 * counter, scroll reveal, pulsing hotspot dot. Single accent, ink-tinted
 * shadows, reduced-motion safe.
 */

export function ShineBorder({
  children,
  className = "",
  radius = 32,
}: {
  children: ReactNode;
  className?: string;
  radius?: number;
}) {
  return (
    <div
      className={`relative ${className}`}
      style={{ borderRadius: radius, padding: 1.5 }}
    >
      <div
        aria-hidden
        className="animate-shine pointer-events-none absolute inset-0"
        style={{
          borderRadius: radius,
          background:
            "linear-gradient(110deg, rgba(0,107,95,0) 40%, rgba(0,107,95,0.55) 50%, rgba(0,107,95,0) 60%)",
          backgroundSize: "200% 100%",
        }}
      />
      <div
        className="relative h-full w-full bg-surface"
        style={{ borderRadius: radius - 1.5 }}
      >
        {children}
      </div>
    </div>
  );
}

export function ShimmerButton({
  children,
  onClick,
  className = "",
  label,
  tone = "dark",
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  label?: string;
  tone?: "dark" | "light";
}) {
  const dark = tone === "dark";
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`animate-shine group relative inline-flex cursor-pointer items-center justify-center overflow-hidden rounded-full px-10 py-4 text-sm font-semibold tracking-[0.18em] transition-transform duration-300 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] ${
        dark ? "bg-ink text-white" : "bg-[#FFFDF7] text-ink shadow-clinical"
      } ${className}`}
      style={{
        backgroundImage: dark
          ? "linear-gradient(110deg, #0e1f1c 40%, #2c403b 50%, #0e1f1c 60%)"
          : "linear-gradient(110deg, #FFFDF7 40%, #e1ebe8 50%, #FFFDF7 60%)",
        backgroundSize: "200% 100%",
      }}
    >
      <span className="relative z-10">{children}</span>
    </button>
  );
}

export function Marquee({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div className="animate-marquee flex w-max items-center">{children}</div>
    </div>
  );
}

export function NumberTicker({
  value,
  prefix = "",
  className = "",
}: {
  value: number;
  prefix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const dur = 1400;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(eased * value));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, reduce]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display.toLocaleString("en-KE")}
    </span>
  );
}

export function BlurFade({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 28, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function PulsingDot({ className = "" }: { className?: string }) {
  return (
    <span className={`relative flex size-3 ${className}`} aria-hidden>
      <span className="animate-pulse-dot absolute inline-flex h-full w-full rounded-full bg-white ring-2 ring-white/70" />
      <span className="relative inline-flex size-3 rounded-full border-2 border-white bg-accent" />
    </span>
  );
}

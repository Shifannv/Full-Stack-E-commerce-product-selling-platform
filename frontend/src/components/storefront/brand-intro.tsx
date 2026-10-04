"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

// Module scope resets on every full page load or refresh, so the intro replays
// then and only then. Client-side navigation back to "/" skips it.
let introduced = false;

const MIN_MS = 2400;
const CAP_MS = 4000;
const LEAVE_MS = 800;
const NAME = ["Ownline", "Dropship"];
const TAGLINE = ["Considered", "finds", "for", "the", "everyday."];

function Word({ children, index }: { children: string; index: number }) {
  return <span className="intro-word"><span style={{ "--i": index } as CSSProperties}>{children}</span></span>;
}

export function BrandIntro({ ready, onLeave }: { ready: boolean; onLeave: () => void }) {
  const [phase, setPhase] = useState<"pending" | "show" | "leave" | "done">("pending");
  const mediaReady = useRef(ready);
  useEffect(() => { mediaReady.current = ready; }, [ready]);

  useEffect(() => {
    const root = document.documentElement;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let minimumElapsed = false;
    let leaving = false;
    let skipped = false;
    let finish: number | undefined;
    const complete = () => {
      window.clearTimeout(minimum);
      window.clearInterval(check);
      window.clearTimeout(cap);
      root.classList.remove("intro-lock");
      setPhase("done");
    };
    const leave = () => {
      if (leaving || skipped) return;
      leaving = true;
      window.clearInterval(check);
      window.clearTimeout(cap);
      onLeave();
      setPhase("leave");
      finish = window.setTimeout(complete, LEAVE_MS);
    };
    const frame = requestAnimationFrame(() => {
      if (introduced || motion.matches) {
        skipped = true;
        introduced = true;
        onLeave();
        complete();
      } else {
        introduced = true;
        root.classList.add("intro-lock");
        setPhase("show");
      }
    });
    const minimum = window.setTimeout(() => { minimumElapsed = true; }, MIN_MS);
    const check = window.setInterval(() => {
      if (minimumElapsed && mediaReady.current) leave();
    }, 50);
    const cap = window.setTimeout(leave, CAP_MS);
    const preferenceChanged = () => {
      if (motion.matches) { skipped = true; onLeave(); complete(); }
    };
    motion.addEventListener("change", preferenceChanged);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(minimum);
      window.clearInterval(check);
      window.clearTimeout(cap);
      window.clearTimeout(finish);
      motion.removeEventListener("change", preferenceChanged);
      root.classList.remove("intro-lock");
    };
  }, [onLeave]);

  if (phase === "done") return null;
  return <div className={`brand-intro${phase === "show" ? " is-active" : ""}${phase === "leave" ? " is-active is-leaving" : ""}`} aria-hidden="true">
    <div className="intro-content">
      <p className="intro-name">{NAME.map((word, i) => <Word key={word} index={i}>{word}</Word>)}</p>
      <p className="intro-tagline">{TAGLINE.map((word, i) => <Word key={word} index={i + NAME.length + 3}>{word}</Word>)}</p>
    </div>
  </div>;
}

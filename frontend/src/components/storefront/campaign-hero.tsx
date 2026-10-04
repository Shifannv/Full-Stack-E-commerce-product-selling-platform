"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { BrandIntro } from "./brand-intro";

export function CampaignHero() {
  const video = useRef<HTMLVideoElement>(null);
  const section = useRef<HTMLElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [posterReady, setPosterReady] = useState(false);
  const [introduced, setIntroduced] = useState(false);
  const reveal = useCallback(() => setIntroduced(true), []);

  useEffect(() => {
    const element = video.current;
    const container = section.current;
    if (!element || !container) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    let visible = true;
    let loaded = false;
    const load = () => {
      if (loaded) return;
      const mobile = window.matchMedia("(max-width: 767px)").matches;
      element.src = mobile
        ? process.env.NEXT_PUBLIC_CAMPAIGN_VIDEO_MOBILE || "/videos/ownline-campaign-mobile.mp4?v=studio-3"
        : process.env.NEXT_PUBLIC_CAMPAIGN_VIDEO_DESKTOP || "/videos/ownline-campaign-desktop.mp4?v=studio-3";
      element.load();
      loaded = true;
    };
    const sync = () => {
      if (visible && !document.hidden && !motion.matches && !connection?.saveData && !/^(slow-)?2g$/.test(connection?.effectiveType ?? "")) {
        load();
        void element.play().catch(() => {});
      } else element.pause();
    };
    // The poster paints first; the video never blocks the hero or catalog.
    const frame = requestAnimationFrame(sync);
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }, { threshold: 0.1 });
    observer.observe(container);
    document.addEventListener("visibilitychange", sync);
    motion.addEventListener("change", sync);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener("visibilitychange", sync); motion.removeEventListener("change", sync); element.pause(); };
  }, []);

  return (
    <section ref={section} className={`campaign-hero${introduced ? " is-introduced" : ""}`} aria-labelledby="home-heading">
      <BrandIntro ready={posterReady || ready || failed} onLeave={reveal} />
      <Image src="/images/ownline-campaign-poster.webp" alt="Models in neutral everyday clothing in an editorial campaign" fill preload sizes="100vw" className="campaign-poster object-cover" onLoad={() => setPosterReady(true)} onError={() => setPosterReady(true)} />
      <video ref={video} className={`campaign-film ${ready && !failed ? "is-ready" : ""}`} muted loop playsInline preload="none" aria-hidden="true" onPlaying={() => setReady(true)} onError={() => setFailed(true)} />
      <div className="campaign-shade" />
      <div className="campaign-copy">
        <h1 id="home-heading">Everyday,<br /><em>with feeling.</em></h1>
        <p>Considered finds. A little more you.</p>
        <Link href="/search" className="campaign-link">Explore the collection <ArrowUpRight aria-hidden="true" size={18} /></Link>
      </div>
    </section>
  );
}

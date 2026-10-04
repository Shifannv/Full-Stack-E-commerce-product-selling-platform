"use client";

import { useEffect, useRef } from "react";

// Product grids deliberately stay outside this wrapper: reveal the section,
// never make a shopper chase a moving product or wait for a staggered list.
export function ScrollReveal({ children, image = false, className = "" }: { children: React.ReactNode; image?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!node || motion.matches || !window.IntersectionObserver || !node.animate) return;
    const entrance = node.animate(image ? [
      { clipPath: "inset(12% 0 0 0)", opacity: 0 },
      { clipPath: "inset(0 0 0 0)", opacity: 1 },
    ] : [
      { opacity: 0, transform: "translateY(24px)" },
      { opacity: 1, transform: "translateY(0)" },
    ], { duration: image ? 900 : 650, easing: "cubic-bezier(0.16,1,0.3,1)", fill: "both" });
    entrance.pause();
    let imageEntrance: Animation | undefined;
    const finish = () => { entrance.cancel(); imageEntrance?.cancel(); observer.disconnect(); };
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      entrance.play();
      const picture = image ? node.querySelector("img") : null;
      if (picture) imageEntrance = picture.animate([{ transform: "scale(1.06)" }, { transform: "scale(1)" }], { duration: 1100, easing: "cubic-bezier(0.16,1,0.3,1)" });
      observer.disconnect();
    }, { threshold: 0.08 });
    entrance.onfinish = () => entrance.cancel();
    observer.observe(node);
    motion.addEventListener("change", finish);
    node.addEventListener("focusin", finish);
    return () => { finish(); motion.removeEventListener("change", finish); node.removeEventListener("focusin", finish); };
  }, [image]);
  return <div ref={ref} className={className} data-scroll-reveal={image ? "image" : "heading"}>{children}</div>;
}

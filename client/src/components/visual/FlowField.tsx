import { useEffect, useRef } from "react";

export function FlowField({ density = "sparse" }: { density?: "sparse" | "medium" }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let animation = 0;
    let width = 0;
    let height = 0;
    let time = 0;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const count = density === "medium" ? 700 : 350;
    const particles = Array.from({ length: count }, () => ({
      x: Math.random(),
      y: Math.random(),
      life: Math.random() * 200,
      speed: 0.0006 + Math.random() * 0.0015,
      hue: 190 + Math.random() * 35,
    }));
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const render = () => {
      time += 1;
      context.fillStyle = "rgba(8, 20, 34, .16)";
      context.fillRect(0, 0, width, height);
      for (const particle of particles) {
        const px = particle.x * width;
        const py = particle.y * height;
        const angle = Math.sin(px * 0.0025 + time * 0.0007) * 2 + Math.cos(py * 0.002 + time * 0.0005) * 2;
        if (!prefersReducedMotion) {
          particle.x += Math.cos(angle) * particle.speed;
          particle.y += Math.sin(angle) * particle.speed;
          particle.life += 1;
        }
        if (particle.life > 240 || particle.x < -0.05 || particle.x > 1.05 || particle.y < -0.05 || particle.y > 1.05) {
          particle.x = Math.random();
          particle.y = Math.random();
          particle.life = 0;
        }
        const alpha = prefersReducedMotion
          ? 0.24
          : Math.min(particle.life / 25, 1) * Math.min((240 - particle.life) / 35, 1) * 0.42;
        context.fillStyle = `hsla(${particle.hue}, 88%, 74%, ${Math.max(alpha, 0) * 1.25})`;
        context.fillRect(particle.x * width, particle.y * height, 1.4, 1.4);
      }
      if (!prefersReducedMotion) {
        animation = requestAnimationFrame(render);
      }
    };
    resize();
    window.addEventListener("resize", resize);
    render();
    return () => {
      cancelAnimationFrame(animation);
      window.removeEventListener("resize", resize);
    };
  }, [density]);
  return <canvas ref={canvasRef} className="flow-field" aria-hidden="true" />;
}

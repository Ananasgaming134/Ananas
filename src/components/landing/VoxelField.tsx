"use client";

import { useEffect, useRef } from "react";

type Cube = { col: number; row: number; phase: number; accent: 0 | 1 | 2 };

/**
 * Isometrisches Blockfeld hinter dem Kopfbereich - eine langsam atmende
 * Landschaft aus Wuerfeln, wie ein Chunk, der sich auf- und abbaut. Einzelne
 * Bloecke leuchten in den Hausfarben und markieren so die Regale des
 * Verleihs. Bewegt sich leicht mit dem Zeiger mit; bei reduzierter Bewegung
 * steht das Feld still.
 */
export default function VoxelField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const TILE_W = 46;
    const TILE_H = 23;
    const COLS = 15;
    const ROWS = 15;

    const cubes: Cube[] = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        // Deterministisch statt zufaellig: dasselbe Feld bei jedem Aufruf.
        const seed = (col * 73856093) ^ (row * 19349663);
        const r = Math.abs(Math.sin(seed)) % 1;
        cubes.push({
          col,
          row,
          phase: r * Math.PI * 2,
          accent: r > 0.94 ? 1 : r > 0.88 ? 2 : 0,
        });
      }
    }

    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let pointerX = 0;
    let pointerY = 0;
    let targetX = 0;
    let targetY = 0;
    const onPointer = (e: PointerEvent) => {
      targetX = (e.clientX / window.innerWidth - 0.5) * 2;
      targetY = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    if (!reduced) window.addEventListener("pointermove", onPointer);

    const drawCube = (
      x: number,
      y: number,
      lift: number,
      top: string,
      left: string,
      right: string,
      glow: number
    ) => {
      const hw = TILE_W / 2;
      const hh = TILE_H / 2;
      const depth = 20;

      if (glow > 0) {
        ctx.shadowColor = top;
        ctx.shadowBlur = 18 * glow;
      }

      // Deckflaeche
      ctx.fillStyle = top;
      ctx.beginPath();
      ctx.moveTo(x, y - lift - hh);
      ctx.lineTo(x + hw, y - lift);
      ctx.lineTo(x, y - lift + hh);
      ctx.lineTo(x - hw, y - lift);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;

      // Linke Seite
      ctx.fillStyle = left;
      ctx.beginPath();
      ctx.moveTo(x - hw, y - lift);
      ctx.lineTo(x, y - lift + hh);
      ctx.lineTo(x, y - lift + hh + depth);
      ctx.lineTo(x - hw, y - lift + depth);
      ctx.closePath();
      ctx.fill();

      // Rechte Seite
      ctx.fillStyle = right;
      ctx.beginPath();
      ctx.moveTo(x + hw, y - lift);
      ctx.lineTo(x, y - lift + hh);
      ctx.lineTo(x, y - lift + hh + depth);
      ctx.lineTo(x + hw, y - lift + depth);
      ctx.closePath();
      ctx.fill();
    };

    const PALETTE = [
      { top: "#232c45", left: "#131a2c", right: "#0d1220" },
      { top: "#f2b544", left: "#a8760f", right: "#7a5407" },
      { top: "#3ddc97", left: "#1f8f5e", right: "#146342" },
    ];

    let raf = 0;
    const start = performance.now();

    const render = (now: number) => {
      const t = reduced ? 0 : (now - start) / 1000;

      pointerX += (targetX - pointerX) * 0.05;
      pointerY += (targetY - pointerY) * 0.05;

      ctx.clearRect(0, 0, width, height);

      const originX = width * (width < 900 ? 0.5 : 0.72) + pointerX * 26;
      const originY = height * 0.2 + pointerY * 14;

      for (const cube of cubes) {
        const { col, row } = cube;
        const x = originX + (col - row) * (TILE_W / 2);
        const y = originY + (col + row) * (TILE_H / 2);

        // Welle laeuft diagonal durchs Feld, jeder Block schwingt versetzt.
        const wave = Math.sin(t * 0.7 + (col + row) * 0.42 + cube.phase);
        const lift = reduced ? 0 : wave * 9 + 9;

        // Randbloecke verblassen, damit das Feld nicht abgeschnitten wirkt.
        const edge = Math.min(col, row, COLS - 1 - col, ROWS - 1 - row);
        const fade = Math.min(1, edge / 3.5);
        if (fade <= 0.02) continue;

        const p = PALETTE[cube.accent];
        const glow = cube.accent === 0 ? 0 : (wave + 1) / 2;

        ctx.globalAlpha = fade * (cube.accent === 0 ? 0.55 : 0.9);
        drawCube(x, y, lift, p.top, p.left, p.right, glow);
      }

      ctx.globalAlpha = 1;
      if (!reduced) raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full opacity-70"
    />
  );
}

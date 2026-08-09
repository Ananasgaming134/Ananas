/**
 * Eigene, blockig/"voxel" gestaltete Landschafts-Illustration im Minecraft-
 * Stil - komplett als Vektorgrafik selbst gezeichnet (keine echten
 * Minecraft-Texturen/Screenshots, die waeren urheberrechtlich geschuetzt).
 * Rein dekorativ, deshalb aria-hidden.
 */
export default function VoxelLandscape() {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-border">
      <svg
        viewBox="0 0 1200 340"
        className="block w-full"
        preserveAspectRatio="xMidYMax slice"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="voxel-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a0f1d" />
            <stop offset="55%" stopColor="#151233" />
            <stop offset="100%" stopColor="#3a2340" />
          </linearGradient>
          <radialGradient id="voxel-sun" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f2b544" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#f2b544" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="voxel-mountain-back" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2a2456" />
            <stop offset="100%" stopColor="#1c1a3a" />
          </linearGradient>
          <linearGradient id="voxel-mountain-front" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16324a" />
            <stop offset="100%" stopColor="#0f2233" />
          </linearGradient>
          <linearGradient id="voxel-grass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3ddc97" />
            <stop offset="100%" stopColor="#2aa876" />
          </linearGradient>
        </defs>

        <rect width="1200" height="340" fill="url(#voxel-sky)" />

        {/* Sterne */}
        {[
          [60, 40], [140, 70], [230, 30], [320, 90], [410, 50], [520, 25],
          [610, 75], [700, 40], [790, 60], [880, 30], [970, 85], [1060, 45],
          [1140, 65], [95, 110], [980, 120], [180, 130],
        ].map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={i % 3 === 0 ? 1.6 : 1}
            fill="#eef1f8"
            className="animate-twinkle"
            style={{ animationDelay: `${(i % 5) * 0.6}s` }}
          />
        ))}

        {/* Sonne/Mond mit Glow */}
        <circle cx="960" cy="90" r="70" fill="url(#voxel-sun)" className="animate-sun-glow" />
        <circle cx="960" cy="90" r="26" fill="#f2b544" />

        {/* Wolken (blockig) */}
        <g className="animate-cloud-drift" opacity="0.5">
          {[0, 20, 40].map((dx) => (
            <rect key={dx} x={140 + dx * 10} y={60} width={30} height={12} fill="#eef1f8" />
          ))}
          <rect x="150" y="48" width="60" height="12" fill="#eef1f8" />
        </g>
        <g className="animate-cloud-drift-rev" opacity="0.4">
          {[0, 18, 36].map((dx) => (
            <rect key={dx} x={620 + dx * 10} y={100} width={26} height={10} fill="#eef1f8" />
          ))}
          <rect x="628" y="90" width="50" height="10" fill="#eef1f8" />
        </g>

        {/* Bergkette hinten (gestuft/blockig) */}
        <path
          d="M0,260 L0,220 L60,220 L60,190 L140,190 L140,160 L220,160 L220,200 L300,200 L300,170
             L380,170 L380,210 L460,210 L460,180 L540,180 L540,150 L620,150 L620,190 L700,190
             L700,160 L780,160 L780,200 L860,200 L860,175 L940,175 L940,210 L1020,210 L1020,185
             L1100,185 L1100,220 L1200,220 L1200,260 Z"
          fill="url(#voxel-mountain-back)"
        />

        {/* Bergkette vorne (gestuft/blockig, dunkler/naeher) */}
        <path
          d="M0,300 L0,260 L80,260 L80,230 L160,230 L160,270 L240,270 L240,240 L320,240 L320,280
             L400,280 L400,250 L480,250 L480,220 L560,220 L560,260 L640,260 L640,230 L720,230
             L720,270 L800,270 L800,240 L880,240 L880,275 L960,275 L960,245 L1040,245 L1040,285
             L1120,285 L1120,255 L1200,255 L1200,300 Z"
          fill="url(#voxel-mountain-front)"
        />

        {/* Boden */}
        <rect x="0" y="300" width="1200" height="14" fill="url(#voxel-grass)" />
        <rect x="0" y="314" width="1200" height="26" fill="#5b3a29" />

        {/* Pixel-Baeume */}
        {[70, 220, 980, 1120].map((x, i) => (
          <g key={x} transform={`translate(${x},0)`}>
            <rect x="-4" y="288" width="8" height="16" fill="#6b4226" />
            <rect x="-18" y="276" width="36" height="10" fill={i % 2 === 0 ? "#2aa876" : "#3ddc97"} />
            <rect x="-13" y="266" width="26" height="10" fill={i % 2 === 0 ? "#2aa876" : "#3ddc97"} />
            <rect x="-8" y="256" width="16" height="10" fill={i % 2 === 0 ? "#2aa876" : "#3ddc97"} />
          </g>
        ))}
      </svg>

      {/* Schwebende Item-Blöcke */}
      <div className="pointer-events-none absolute inset-0">
        <span className="animate-bob absolute left-[12%] top-[18%] flex h-11 w-11 items-center justify-center rounded-xl border border-accent/40 bg-surface/80 text-lg shadow-lg backdrop-blur-sm">
          ⛏️
        </span>
        <span
          className="animate-bob-slow absolute left-[28%] top-[45%] flex h-9 w-9 items-center justify-center rounded-lg border border-accent-2/40 bg-surface/80 text-base shadow-lg backdrop-blur-sm"
          style={{ animationDelay: "1.2s" }}
        >
          💎
        </span>
        <span
          className="animate-bob absolute right-[30%] top-[22%] flex h-10 w-10 items-center justify-center rounded-lg border border-accent/40 bg-surface/80 text-base shadow-lg backdrop-blur-sm"
          style={{ animationDelay: "0.6s" }}
        >
          🛡️
        </span>
        <span
          className="animate-bob-slow absolute right-[14%] top-[50%] flex h-10 w-10 items-center justify-center rounded-lg border border-accent-2/40 bg-surface/80 text-base shadow-lg backdrop-blur-sm"
          style={{ animationDelay: "2s" }}
        >
          📦
        </span>
        <span
          className="animate-bob absolute left-[48%] top-[12%] flex h-9 w-9 items-center justify-center rounded-lg border border-accent/40 bg-surface/80 text-base shadow-lg backdrop-blur-sm"
          style={{ animationDelay: "1.8s" }}
        >
          🏹
        </span>
      </div>
    </div>
  );
}

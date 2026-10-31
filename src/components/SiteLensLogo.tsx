/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Design System v1.1 - Geometric Mark & Brand Identity
 * 
 * Concept: Continuous Geometric Folded Ribbon "S" with Central Spatial Datum Aperture
 * Inspired by reference design 3: Topographic Precision × Architectural Geometry
 * Brand Color: Geo Purple #7C5CFF to #A78BFA gradient
 */

import React from 'react';

interface SiteLensLogoProps {
  size?: number;
  className?: string;
  withText?: boolean;
  monochrome?: boolean;
}

export const SiteLensLogo: React.FC<SiteLensLogoProps> = ({
  size = 24,
  className = '',
  withText = false,
  monochrome = false
}) => {
  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* Precision Geometric Folded 'S' Ribbon Aperture Mark */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 transition-transform duration-150 ease-out hover:scale-105"
        aria-label="SiteLens Logo"
      >
        <defs>
          {/* Brand Purple Radiant Gradients */}
          <linearGradient id="sl-ribbon-top" x1="6" y1="6" x2="26" y2="16" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={monochrome ? 'currentColor' : '#C4B5FD'} />
            <stop offset="50%" stopColor={monochrome ? 'currentColor' : '#906BFF'} />
            <stop offset="100%" stopColor={monochrome ? 'currentColor' : '#7C5CFF'} />
          </linearGradient>

          <linearGradient id="sl-ribbon-bot" x1="26" y1="26" x2="6" y2="16" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={monochrome ? 'currentColor' : '#C4B5FD'} />
            <stop offset="50%" stopColor={monochrome ? 'currentColor' : '#906BFF'} />
            <stop offset="100%" stopColor={monochrome ? 'currentColor' : '#7C5CFF'} />
          </linearGradient>

          <linearGradient id="sl-fold-shadow-top" x1="16" y1="12" x2="26" y2="12" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={monochrome ? 'currentColor' : '#6B46FE'} stopOpacity={monochrome ? '0.4' : '0.9'} />
            <stop offset="100%" stopColor={monochrome ? 'currentColor' : '#A78BFA'} />
          </linearGradient>

          <linearGradient id="sl-fold-shadow-bot" x1="16" y1="20" x2="6" y2="20" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={monochrome ? 'currentColor' : '#6B46FE'} stopOpacity={monochrome ? '0.4' : '0.9'} />
            <stop offset="100%" stopColor={monochrome ? 'currentColor' : '#A78BFA'} />
          </linearGradient>
        </defs>

        {/* Top Curved Ribbon Shell */}
        <path
          d="M 12 18 L 12 14 C 12 9.58 15.58 6 20 6 L 21 6 C 24.31 6 27 8.69 27 12 L 27 13 L 20 13 C 17.79 13 16 14.79 16 17 L 16 18 Z"
          fill="url(#sl-ribbon-top)"
        />

        {/* Top Fold Diagonal Turnover (forms top-right apex of the S) */}
        <path
          d="M 21 6 L 27 12 L 20 12 C 18.34 12 17 10.66 17 9 L 17 6 Z"
          fill="url(#sl-fold-shadow-top)"
        />

        {/* Bottom Curved Ribbon Shell (symmetric inversion) */}
        <path
          d="M 20 14 L 20 18 C 20 22.42 16.42 26 12 26 L 11 26 C 7.69 26 5 23.31 5 20 L 5 19 L 12 19 C 14.21 19 16 17.21 16 15 L 16 14 Z"
          fill="url(#sl-ribbon-bot)"
        />

        {/* Bottom Fold Diagonal Turnover (forms bottom-left apex of the S) */}
        <path
          d="M 11 26 L 5 20 L 12 20 C 13.66 20 15 21.34 15 23 L 15 26 Z"
          fill="url(#sl-fold-shadow-bot)"
        />

        {/* Precision Central Spatial Datum Aperture Outline (Subtle Chamfer Reticle) */}
        <rect
          x="12"
          y="12"
          width="8"
          height="8"
          rx="1"
          stroke={monochrome ? 'currentColor' : '#7C5CFF'}
          strokeWidth="1.2"
          strokeDasharray="2 1.5"
          fill="none"
          opacity="0.8"
        />

        {/* Core Center Datum Dot */}
        <circle
          cx="16"
          cy="16"
          r="1.25"
          fill={monochrome ? 'currentColor' : '#FFFFFF'}
        />
      </svg>

      {/* Typographic Brand Lockup */}
      {withText && (
        <div className="flex items-baseline gap-1.5 font-display tracking-tight font-bold text-sm text-[var(--text-primary)]">
          <span>Site<span className="text-[#7C5CFF]">Lens</span></span>
          <span className="text-[10px] font-sans font-semibold text-[var(--text-muted)] tracking-wider uppercase">
            Workstation
          </span>
        </div>
      )}
    </div>
  );
};

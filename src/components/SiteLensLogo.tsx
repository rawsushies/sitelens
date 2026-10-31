/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Design System v1.1 - Geometric Mark & Brand Identity
 * 
 * Concept: Cadastral Boundary Polygon × Geodetic Reticle × Spatial Datum Lens
 * Color: Geo Purple #7C5CFF
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
  const brandColor = monochrome ? 'currentColor' : '#7C5CFF';
  const neutralBorder = monochrome ? 'currentColor' : 'var(--border-strong)';
  const centerPip = monochrome ? 'currentColor' : '#7C5CFF';

  return (
    <div className={`inline-flex items-center gap-2 select-none ${className}`}>
      {/* Precision Geometric Mark */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 transition-transform duration-150 ease-out"
        aria-label="SiteLens Logo"
      >
        {/* Outer Cadastral Site Boundary (Architectural Chamfer Polygon) */}
        <path
          d="M 4 8 L 8 4 L 20 4 L 20 16 L 16 20 L 4 20 Z"
          stroke={brandColor}
          strokeWidth="1.75"
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="none"
        />

        {/* Spatial Inspection Crosshairs */}
        <line
          x1="12"
          y1="7"
          x2="12"
          y2="9.5"
          stroke={brandColor}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1="12"
          y1="14.5"
          x2="12"
          y2="17"
          stroke={brandColor}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1="7"
          y1="12"
          x2="9.5"
          y2="12"
          stroke={brandColor}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1="14.5"
          y1="12"
          x2="17"
          y2="12"
          stroke={brandColor}
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* Center Geodetic Datum Lens Aperture */}
        <circle
          cx="12"
          cy="12"
          r="1.75"
          fill={centerPip}
        />
      </svg>

      {/* Optional Typographic Brand Lockup */}
      {withText && (
        <div className="flex items-baseline gap-1.5 font-display tracking-tight font-bold text-sm text-[var(--text-primary)]">
          <span>SiteLens</span>
          <span className="text-[10px] font-sans font-semibold text-[var(--text-muted)] tracking-wider uppercase">
            Workstation
          </span>
        </div>
      )}
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Bottom Status & Coordinate Bar (Design System v1.1)
 */

import React from 'react';
import { inspectCoordinates } from '../coordinates';
import { Crosshair, Map, Shield } from 'lucide-react';

interface BottomBarProps {
  cursorCoords: [number, number] | null; // [lng, lat]
  centerCoords: [number, number];
  zoom: number;
}

export const BottomBar: React.FC<BottomBarProps> = ({
  cursorCoords,
  centerCoords,
  zoom
}) => {
  const activePoint = cursorCoords || centerCoords;
  const report = inspectCoordinates(activePoint[0], activePoint[1]);

  return (
    <footer className="h-7 bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] px-3 flex items-center justify-between text-[11px] text-[var(--text-secondary)] select-none z-30 transition-colors duration-150">
      {/* Left: Coordinate Telemetry with Tabular Alignment */}
      <div className="flex items-center gap-3.5">
        {/* WGS84 Decimal Degrees */}
        <div className="flex items-center gap-1.5 text-[var(--text-primary)]">
          <Crosshair className="w-3 h-3 text-[#7C5CFF]" />
          <span className="text-[var(--text-muted)] font-medium">WGS84:</span>
          <span className="font-medium tabular-nums">
            {report.latitude.toFixed(6)}° N, {report.longitude.toFixed(6)}° E
          </span>
        </div>

        {/* DMS Representation */}
        <div className="hidden md:flex items-center gap-1.5 border-l border-[var(--border-subtle)] pl-3 text-[var(--text-secondary)]">
          <span className="text-[var(--text-muted)] font-medium">DMS:</span>
          <span className="tabular-nums">{report.dmsFormatted}</span>
        </div>

        {/* Projected UTM */}
        <div className="hidden lg:flex items-center gap-1.5 border-l border-[var(--border-subtle)] pl-3 text-[var(--text-secondary)]">
          <span className="text-[var(--text-muted)] font-medium">UTM ({report.utm.epsg}):</span>
          <span className="tabular-nums font-medium text-sky-500">{report.utm.formatted}</span>
        </div>
      </div>

      {/* Right: Map Telemetry & Geodetic Standards */}
      <div className="flex items-center gap-3">
        {/* Zoom Level */}
        <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
          <Map className="w-3 h-3 text-[var(--text-muted)]" />
          <span className="text-[var(--text-muted)] font-medium uppercase text-[10px] tracking-wider">Zoom:</span>
          <span className="text-[var(--text-primary)] font-medium tabular-nums">{zoom.toFixed(1)}</span>
        </div>

        {/* Authoritative Geodetic Datum */}
        <div className="flex items-center gap-1.5 text-emerald-500 border-l border-[var(--border-subtle)] pl-3 text-[10px] font-medium tracking-wide">
          <Shield className="w-3 h-3" />
          <span>WGS84 ELLIPSOID (EPSG:4326)</span>
        </div>
      </div>
    </footer>
  );
};

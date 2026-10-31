/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Bottom Status & Coordinate Bar
 */

import React from 'react';
import { inspectCoordinates } from '../coordinates';
import { Globe, Crosshair, Map, Shield } from 'lucide-react';

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
    <footer className="h-7 bg-[#090d16] border-t border-[#1a2436] px-3 flex items-center justify-between text-[10px] font-mono text-slate-400 select-none z-30">
      {/* Left: Coordinate Telemetry */}
      <div className="flex items-center gap-4">
        {/* WGS84 Decimal Degrees */}
        <div className="flex items-center gap-1.5 text-slate-200">
          <Crosshair className="w-3 h-3 text-[#a78bfa]" />
          <span>WGS84:</span>
          <span className="text-white font-medium">
            {report.latitude.toFixed(6)}° N, {report.longitude.toFixed(6)}° E
          </span>
        </div>

        {/* DMS Representation */}
        <div className="hidden md:flex items-center gap-1 text-slate-400 border-l border-[#1a2436] pl-3">
          <span>DMS:</span>
          <span className="text-slate-300">{report.dmsFormatted}</span>
        </div>

        {/* Projected UTM */}
        <div className="hidden lg:flex items-center gap-1 text-sky-400 border-l border-[#1a2436] pl-3">
          <span>UTM ({report.utm.epsg}):</span>
          <span className="text-sky-200">{report.utm.formatted}</span>
        </div>
      </div>

      {/* Right: Map Telemetry & Geodetic Standards */}
      <div className="flex items-center gap-3">
        {/* Zoom Level */}
        <div className="flex items-center gap-1 text-slate-400">
          <Map className="w-3 h-3 text-slate-500" />
          <span>ZOOM:</span>
          <span className="text-slate-200 font-medium">{zoom.toFixed(1)}</span>
        </div>

        {/* Authoritative Geodetic Datum */}
        <div className="flex items-center gap-1 text-emerald-400 border-l border-[#1a2436] pl-3">
          <Shield className="w-3 h-3" />
          <span>WGS84 ELLIPSOID (EPSG:4326)</span>
        </div>
      </div>
    </footer>
  );
};

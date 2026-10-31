/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Right Inspector Panel
 */

import React, { useState } from 'react';
import { 
  SiteProject, 
  SiteFeature, 
  PolygonAnalysis, 
  LineAnalysis, 
  CoordinateReport, 
  SolarAnalysis, 
  ClimateContextData, 
  UrbanContextSummary,
  ProvenancedMetric
} from '../types';
import { MetricCard } from './MetricCard';
import { 
  Layers, 
  Ruler, 
  Compass, 
  Sun, 
  CloudRain, 
  Building2, 
  FileText, 
  Copy, 
  Check, 
  AlertTriangle, 
  Info, 
  Eye, 
  Trash2, 
  RefreshCw,
  Split,
  ChevronRight
} from 'lucide-react';

interface InspectorPanelProps {
  project: SiteProject;
  activeFeature: SiteFeature | null;
  polygonAnalysis: PolygonAnalysis | null;
  lineAnalysis: LineAnalysis | null;
  pointReport: CoordinateReport | null;
  solarAnalysis: SolarAnalysis | null;
  climateData: ClimateContextData | null;
  urbanContext: UrbanContextSummary | null;
  isLoadingClimate: boolean;
  isLoadingUrban: boolean;
  onRefreshUrban: () => void;
  onRefreshClimate: () => void;
  onSelectFeature: (featureId: string | null) => void;
  onDeleteFeature: (featureId: string) => void;
  onUpdateFeatureName: (featureId: string, name: string) => void;
}

type InspectorTab = 'overview' | 'geometry' | 'coordinates' | 'environment' | 'features';

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  project,
  activeFeature,
  polygonAnalysis,
  lineAnalysis,
  pointReport,
  solarAnalysis,
  climateData,
  urbanContext,
  isLoadingClimate,
  isLoadingUrban,
  onRefreshUrban,
  onRefreshClimate,
  onSelectFeature,
  onDeleteFeature,
  onUpdateFeatureName,
}) => {
  const [activeTab, setActiveTab] = useState<InspectorTab>('overview');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 1800);
  };

  const transects = project.features.filter(f => f.properties.featureType === 'transect');

  return (
    <aside className="w-[390px] h-full bg-[#0d131f] border-l border-[#1f2b3e] flex flex-col z-20 text-xs text-slate-200 select-none">
      {/* Tab Navigation */}
      <div className="flex border-b border-[#1f2b3e] bg-[#0a0f19] px-1 pt-1 overflow-x-auto no-scrollbar">
        {[
          { id: 'overview', label: 'Overview', icon: <Info className="w-3.5 h-3.5" /> },
          { id: 'geometry', label: 'Geometry', icon: <Ruler className="w-3.5 h-3.5" /> },
          { id: 'coordinates', label: 'Coordinates', icon: <Compass className="w-3.5 h-3.5" /> },
          { id: 'environment', label: 'Context', icon: <Sun className="w-3.5 h-3.5" /> },
          { id: 'features', label: `Layers (${project.features.length})`, icon: <Layers className="w-3.5 h-3.5" /> }
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as InspectorTab)}
              className={`flex items-center gap-1.5 px-3 py-2 font-mono text-[11px] whitespace-nowrap border-b-2 transition-all ${
                isActive
                  ? 'border-[#8b5cf6] text-[#c4b5fd] bg-[#141b2a]'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#111724]'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-3">
            {activeFeature ? (
              <>
                {/* Active Feature Identity */}
                <div className="p-2.5 bg-[#121927] border border-[#233148] rounded">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-mono uppercase text-[#a78bfa] tracking-wider">
                      {activeFeature.properties.featureType.replace('_', ' ')}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      ID: {activeFeature.id.slice(0, 12)}
                    </span>
                  </div>
                  <input
                    type="text"
                    value={activeFeature.properties.name}
                    onChange={(e) => onUpdateFeatureName(activeFeature.id, e.target.value)}
                    className="w-full bg-[#0b101a] border border-[#1f2b3e] focus:border-[#8b5cf6] px-2 py-1 rounded text-white font-medium text-xs outline-none"
                  />
                </div>

                {/* Topology Warning for Polygons */}
                {polygonAnalysis?.isSelfIntersecting && (
                  <div className="p-2.5 bg-rose-950/40 border border-rose-800/60 rounded text-rose-300 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-rose-200">Self-Intersecting Geometry (Bowtie)</div>
                      <div className="text-[11px] text-rose-300/80 mt-0.5">
                        Polygon boundary edges cross each other. Planimetric area computation requires a clean simple ring. Drag vertices to resolve overlap.
                      </div>
                    </div>
                  </div>
                )}

                {/* Primary Metrics */}
                <div className="space-y-2">
                  <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Key Analytical Metrics</span>
                    <span className="text-[10px] text-slate-500">WGS84 Datum</span>
                  </div>

                  {polygonAnalysis && (
                    <>
                      <MetricCard metric={polygonAnalysis.metrics.ellipsoidal_area} />
                      <div className="grid grid-cols-2 gap-2">
                        <MetricCard metric={polygonAnalysis.metrics.area_hectares} />
                        <MetricCard metric={polygonAnalysis.metrics.area_acres} />
                      </div>
                      <MetricCard metric={polygonAnalysis.metrics.ellipsoidal_perimeter} />
                      <MetricCard metric={polygonAnalysis.metrics.self_intersection_status} />
                    </>
                  )}

                  {lineAnalysis && (
                    <>
                      <MetricCard metric={lineAnalysis.metrics.line_total_length} />
                      <MetricCard metric={lineAnalysis.metrics.line_initial_bearing} />
                    </>
                  )}

                  {pointReport && (
                    <>
                      <MetricCard metric={pointReport.utm ? {
                        id: 'pt-utm',
                        name: 'utm_grid',
                        label: 'UTM Grid Coordinate',
                        value: pointReport.utm.formatted,
                        formattedValue: pointReport.utm.formatted,
                        unit: 'm',
                        classification: 'geometry-derived',
                        source: `Proj4 Coordinate Engine (${pointReport.utm.epsg})`,
                        calculationMethod: 'Transverse Mercator projection on WGS84',
                        spatialResolution: '1mm',
                        timestampOrReferencePeriod: 'WGS84',
                        limitations: 'Conformal projection. Scale factor 0.9996 on central meridian.'
                      } : null as any} />
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="p-6 text-center text-slate-500 border border-dashed border-[#1f2b3e] rounded">
                <Compass className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                <div className="font-medium text-slate-400">No Feature Selected</div>
                <div className="text-[11px] mt-1 text-slate-500">
                  Select a feature on the map canvas, or draw a new site boundary using the toolbar.
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: GEOMETRY & TRANSECTS */}
        {activeTab === 'geometry' && (
          <div className="space-y-4">
            {polygonAnalysis ? (
              <>
                {/* Axis-Aligned Envelope with Prominent Warning */}
                <div className="p-3 bg-[#131b2b] border border-[#233148] rounded space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] uppercase text-slate-300 font-semibold">
                      Bounding Box Envelope
                    </span>
                    <span className="text-[10px] font-mono text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/50">
                      Not Site Width
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 font-mono">
                    <div className="bg-[#0b101a] p-2 rounded border border-[#1e2a3f]">
                      <div className="text-[10px] text-slate-500">E-W SPAN</div>
                      <div className="text-sm font-semibold text-white">
                        {polygonAnalysis.bbox.eastWestSpanM.toLocaleString()} m
                      </div>
                    </div>
                    <div className="bg-[#0b101a] p-2 rounded border border-[#1e2a3f]">
                      <div className="text-[10px] text-slate-500">N-S SPAN</div>
                      <div className="text-sm font-semibold text-white">
                        {polygonAnalysis.bbox.northSouthSpanM.toLocaleString()} m
                      </div>
                    </div>
                  </div>

                  <div className="p-2 bg-amber-950/30 border border-amber-800/40 rounded text-[11px] text-amber-200/90 leading-relaxed">
                    <strong>Architectural Notice:</strong> Bounding-box spans represent the axis-aligned geographic envelope, <em>never</em> true site dimensions or perpendicular parcel widths. Use the <strong>Transect Tool (T)</strong> below to measure real site widths.
                  </div>
                </div>

                {/* Site Transects Section */}
                <div className="p-3 bg-[#131b2b] border border-[#233148] rounded space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-mono text-[11px] uppercase text-slate-300 font-semibold">
                      <Split className="w-3.5 h-3.5 text-amber-400" />
                      <span>User-Defined Transects ({transects.length})</span>
                    </div>
                  </div>

                  {transects.length === 0 ? (
                    <div className="text-[11px] text-slate-500 py-1 font-mono">
                      No transects drawn yet. Select the <strong>Transect tool (T)</strong> to draw true cross-section width measurements across the site.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {transects.map((t) => (
                        <div
                          key={t.id}
                          onClick={() => onSelectFeature(t.id)}
                          className="p-2 bg-[#0b101a] hover:bg-[#162032] border border-[#1e2a3f] rounded cursor-pointer transition-colors flex items-center justify-between"
                        >
                          <div>
                            <div className="font-medium text-slate-200">{t.properties.name}</div>
                            <div className="text-[10px] font-mono text-amber-400">
                              {t.properties.metrics?.line_total_length?.formattedValue || 'Measured transect'}
                            </div>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Boundary Segments Table */}
                <div className="p-3 bg-[#131b2b] border border-[#233148] rounded space-y-2">
                  <div className="font-mono text-[11px] uppercase text-slate-300 font-semibold">
                    Boundary Edges & Bearings ({polygonAnalysis.segments.length})
                  </div>
                  <div className="max-h-56 overflow-y-auto space-y-1 pr-1 font-mono text-[10px]">
                    {polygonAnalysis.segments.map((seg) => (
                      <div
                        key={seg.index}
                        className="p-1.5 bg-[#0b101a] border border-[#1e2a3f] rounded flex items-center justify-between"
                      >
                        <span className="text-[#a78bfa] font-bold">Edge {seg.index}</span>
                        <span className="text-white font-medium">{seg.distanceM.toFixed(2)} m</span>
                        <span className="text-slate-400">Azimuth: {seg.initialAzimuthDeg.toFixed(1)}°</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : lineAnalysis ? (
              <div className="space-y-3">
                <MetricCard metric={lineAnalysis.metrics.line_total_length} />
                <MetricCard metric={lineAnalysis.metrics.line_initial_bearing} />

                <div className="p-3 bg-[#131b2b] border border-[#233148] rounded space-y-2">
                  <div className="font-mono text-[11px] uppercase text-slate-300 font-semibold">
                    Line Segments ({lineAnalysis.segments.length})
                  </div>
                  <div className="space-y-1 font-mono text-[10px]">
                    {lineAnalysis.segments.map((seg) => (
                      <div
                        key={seg.index}
                        className="p-1.5 bg-[#0b101a] border border-[#1e2a3f] rounded flex items-center justify-between"
                      >
                        <span className="text-sky-400">Segment {seg.index}</span>
                        <span className="text-white font-medium">{seg.distanceM.toFixed(2)} m</span>
                        <span className="text-slate-400">{seg.initialAzimuthDeg.toFixed(1)}°</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-500 py-6">
                Select a polygon or line feature to inspect geometric edges and measurements.
              </div>
            )}
          </div>
        )}

        {/* TAB 3: COORDINATES */}
        {activeTab === 'coordinates' && (
          <div className="space-y-3">
            {polygonAnalysis ? (
              <>
                <div className="p-2.5 bg-[#131b2b] border border-[#233148] rounded space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] uppercase text-slate-300 font-semibold">
                      Centroid Coordinate
                    </span>
                    <button
                      onClick={() => handleCopy(`${polygonAnalysis.centroid[1]}, ${polygonAnalysis.centroid[0]}`, 'centroid')}
                      className="text-[10px] font-mono text-[#a78bfa] hover:text-white flex items-center gap-1"
                    >
                      {copiedText === 'centroid' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>Copy [Lat, Lon]</span>
                    </button>
                  </div>
                  <div className="font-mono text-xs text-white bg-[#0b101a] p-2 rounded border border-[#1e2a3f]">
                    {polygonAnalysis.centroid[1].toFixed(7)}° N, {polygonAnalysis.centroid[0].toFixed(7)}° E
                  </div>
                </div>

                {/* Vertices List */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                    Site Boundary Vertex Registry ({polygonAnalysis.vertices.length})
                  </div>
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {polygonAnalysis.vertices.map((v, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 bg-[#121927] border border-[#233148] rounded font-mono text-[11px] space-y-1.5"
                      >
                        <div className="flex items-center justify-between border-b border-[#1c273a] pb-1">
                          <span className="text-[#a78bfa] font-bold">Node {idx + 1}</span>
                          <button
                            onClick={() => handleCopy(`${v.latitude.toFixed(7)}, ${v.longitude.toFixed(7)}`, `node-${idx}`)}
                            className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1"
                          >
                            {copiedText === `node-${idx}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            <span>Copy DD</span>
                          </button>
                        </div>

                        <div>
                          <span className="text-slate-500 text-[10px]">WGS84 DD:</span>{' '}
                          <span className="text-slate-200">{v.latitude.toFixed(6)}°, {v.longitude.toFixed(6)}°</span>
                        </div>

                        <div>
                          <span className="text-slate-500 text-[10px]">DMS:</span>{' '}
                          <span className="text-slate-300 text-[10px]">{v.dmsFormatted}</span>
                        </div>

                        <div className="bg-[#0b101a] p-1.5 rounded border border-[#1a2538] text-[10px]">
                          <span className="text-[#38bdf8] font-semibold">{v.utm.epsg}:</span>{' '}
                          <span className="text-slate-300">{v.utm.formatted}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : pointReport ? (
              <div className="p-3 bg-[#131b2b] border border-[#233148] rounded space-y-3 font-mono">
                <div className="font-semibold text-slate-200">Spot Datum Coordinates</div>
                <div className="space-y-2 text-xs">
                  <div>
                    <div className="text-slate-500 text-[10px]">DECIMAL DEGREES (WGS84)</div>
                    <div className="text-white font-medium">{pointReport.latitude.toFixed(7)}°, {pointReport.longitude.toFixed(7)}°</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-[10px]">SEXAGESIMAL (DMS)</div>
                    <div className="text-slate-300">{pointReport.dmsFormatted}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-[10px]">PROJECTED UTM ({pointReport.utm.epsg})</div>
                    <div className="text-sky-300">{pointReport.utm.formatted}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-[10px]">WEB MERCATOR (EPSG:3857)</div>
                    <div className="text-slate-400">{pointReport.webMercator.formatted}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-500 py-6">
                Select a geometry on the map to inspect geodetic and projected coordinates.
              </div>
            )}
          </div>
        )}

        {/* TAB 4: ENVIRONMENTAL & URBAN CONTEXT */}
        {activeTab === 'environment' && (
          <div className="space-y-4">
            {/* Section A: Astronomical Solar Analysis */}
            <div className="p-3 bg-[#131b2b] border border-[#233148] rounded space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-mono text-[11px] uppercase text-violet-300 font-semibold">
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>Astronomical Solar Position</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">NOAA Model</span>
              </div>

              {solarAnalysis ? (
                <>
                  <div className="grid grid-cols-2 gap-2 font-mono">
                    <div className="bg-[#0b101a] p-2 rounded border border-[#1e2a3f]">
                      <div className="text-[10px] text-slate-500">SOLAR ALTITUDE</div>
                      <div className="text-sm font-semibold text-white">
                        {solarAnalysis.solarElevationDeg.toFixed(1)}°
                      </div>
                      <div className="text-[9px] text-slate-500">
                        {solarAnalysis.solarElevationDeg > 0 ? 'Above Horizon' : 'Night'}
                      </div>
                    </div>
                    <div className="bg-[#0b101a] p-2 rounded border border-[#1e2a3f]">
                      <div className="text-[10px] text-slate-500">SOLAR AZIMUTH</div>
                      <div className="text-sm font-semibold text-white">
                        {solarAnalysis.solarAzimuthDeg.toFixed(1)}°
                      </div>
                      <div className="text-[9px] text-slate-500">From True North</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 font-mono text-[10px] text-center">
                    <div className="bg-[#0b101a] p-1.5 rounded border border-[#1e2a3f]">
                      <div className="text-slate-500 text-[9px]">SUNRISE</div>
                      <div className="text-amber-400 font-semibold">{solarAnalysis.sunriseTime}</div>
                    </div>
                    <div className="bg-[#0b101a] p-1.5 rounded border border-[#1e2a3f]">
                      <div className="text-slate-500 text-[9px]">SOLAR NOON</div>
                      <div className="text-amber-300 font-semibold">{solarAnalysis.solarNoonTime}</div>
                    </div>
                    <div className="bg-[#0b101a] p-1.5 rounded border border-[#1e2a3f]">
                      <div className="text-slate-500 text-[9px]">SUNSET</div>
                      <div className="text-amber-500 font-semibold">{solarAnalysis.sunsetTime}</div>
                    </div>
                  </div>

                  {/* Hourly Solar Arc Diagram */}
                  <div className="bg-[#0b101a] p-2 rounded border border-[#1e2a3f]">
                    <div className="text-[10px] font-mono text-slate-400 mb-1 flex items-center justify-between">
                      <span>24-Hour Sun Elevation Arc</span>
                      <span>Daylight: {solarAnalysis.daylightDurationHours}h</span>
                    </div>
                    <svg className="w-full h-16 bg-[#080d16] rounded" viewBox="0 0 240 60">
                      {/* Horizon line */}
                      <line x1="0" y1="45" x2="240" y2="45" stroke="#334155" strokeWidth="1" strokeDasharray="2,2" />
                      <text x="5" y="42" fill="#64748b" fontSize="8" fontFamily="JetBrains Mono">Horizon (0°)</text>

                      {/* Elevation curve */}
                      {(() => {
                        const pathD = solarAnalysis.hourlySunPath.reduce((acc, pt, idx) => {
                          const x = (idx / 23) * 240;
                          // Map elevation -30 to 90 into y 60 to 5
                          const y = 45 - (pt.elevationDeg / 90) * 40;
                          return `${acc} ${idx === 0 ? 'M' : 'L'} ${x} ${Math.max(5, Math.min(58, y))}`;
                        }, '');

                        return (
                          <path
                            d={pathD}
                            fill="none"
                            stroke="#f59e0b"
                            strokeWidth="2"
                          />
                        );
                      })()}
                    </svg>
                  </div>

                  <MetricCard metric={solarAnalysis.metrics.shadow_multiplier} />
                </>
              ) : (
                <div className="text-slate-500 text-center py-2">Loading astronomical data...</div>
              )}
            </div>

            {/* Section B: Open-Meteo Climate Context */}
            <div className="p-3 bg-[#131b2b] border border-[#233148] rounded space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-mono text-[11px] uppercase text-sky-300 font-semibold">
                  <CloudRain className="w-3.5 h-3.5 text-sky-400" />
                  <span>Regional Atmospheric Climate</span>
                </div>
                <button
                  onClick={onRefreshClimate}
                  disabled={isLoadingClimate}
                  className="text-slate-400 hover:text-white"
                  title="Refresh climate observations"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingClimate ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {climateData && climateData.temperatureC !== undefined ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <MetricCard metric={climateData.metrics.ambient_temperature} />
                    <MetricCard metric={climateData.metrics.apparent_temperature} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <MetricCard metric={climateData.metrics.relative_humidity} />
                    <MetricCard metric={climateData.metrics.wind_speed || climateData.metrics.wind_speed_10m} />
                  </div>
                  <MetricCard metric={climateData.metrics.terrain_elevation || climateData.metrics.elevation_dem} />
                </>
              ) : (
                <div className="text-slate-500 text-center py-2 font-mono text-[11px]">
                  {isLoadingClimate ? 'Querying Open-Meteo NWP Grid...' : 'Climate data ready upon site selection.'}
                </div>
              )}
            </div>

            {/* Section C: OpenStreetMap Urban Context & Morphology */}
            <div className="p-3 bg-[#131b2b] border border-[#233148] rounded space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-mono text-[11px] uppercase text-emerald-300 font-semibold">
                  <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Urban Context & Morphology</span>
                </div>
                <button
                  onClick={onRefreshUrban}
                  disabled={isLoadingUrban}
                  className="text-slate-400 hover:text-white flex items-center gap-1 text-[10px] font-mono"
                  title="Query OpenStreetMap Overpass API"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingUrban ? 'animate-spin' : ''}`} />
                  <span>Query OSM</span>
                </button>
              </div>

              {urbanContext && urbanContext.buildingCount !== undefined ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <MetricCard metric={urbanContext.metrics.osm_buildings_nearby} />
                    <MetricCard metric={urbanContext.metrics.osm_roads_nearby} />
                  </div>
                  <MetricCard metric={urbanContext.metrics.osm_amenities_nearby} />
                  <MetricCard metric={urbanContext.metrics.pedestrian_accessibility_proxy} />

                  {urbanContext.items.length > 0 && (
                    <div className="bg-[#0b101a] p-2 rounded border border-[#1e2a3f] space-y-1">
                      <div className="text-[10px] font-mono text-slate-400 uppercase">
                        Sampled Urban Entities
                      </div>
                      <div className="max-h-32 overflow-y-auto space-y-1 pr-1 font-mono text-[10px]">
                        {urbanContext.items.slice(0, 8).map((it, idx) => (
                          <div key={idx} className="flex items-center justify-between text-slate-300">
                            <span className="truncate max-w-[180px]">{it.name}</span>
                            <span className="text-[9px] text-slate-500 bg-[#162032] px-1 rounded">
                              {it.type || it.category}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-slate-500 text-center py-2 font-mono text-[11px]">
                  {isLoadingUrban ? 'Querying OpenStreetMap Overpass...' : 'Click "Query OSM" to inspect surrounding urban fabric.'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: FEATURES & LAYERS */}
        {activeTab === 'features' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 uppercase">
              <span>Project Vector Layers</span>
              <span>{project.features.length} Features</span>
            </div>

            {project.features.length === 0 ? (
              <div className="text-center text-slate-500 py-8 border border-dashed border-[#1f2b3e] rounded font-mono">
                No features in project. Draw geometries using the toolbar.
              </div>
            ) : (
              <div className="space-y-1.5">
                {project.features.map((feat) => {
                  const isSelected = feat.id === project.activeFeatureId;
                  return (
                    <div
                      key={feat.id}
                      onClick={() => onSelectFeature(feat.id)}
                      className={`p-2.5 rounded border cursor-pointer transition-colors flex items-center justify-between ${
                        isSelected
                          ? 'bg-[#182338] border-[#8b5cf6]'
                          : 'bg-[#111827] border-[#1e2a3f] hover:bg-[#162034]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: feat.properties.color }}
                        />
                        <div className="min-w-0">
                          <div className="font-medium text-slate-200 text-xs truncate">
                            {feat.properties.name}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {feat.properties.featureType.replace('_', ' ')}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteFeature(feat.id);
                          }}
                          className="p-1 text-slate-500 hover:text-rose-400 rounded"
                          title="Delete feature"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};

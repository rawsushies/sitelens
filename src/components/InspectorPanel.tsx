/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Right Analytical Inspector (Design System v1.1)
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
  UrbanContextSummary 
} from '../types';
import { MetricCard } from './MetricCard';
import { formatCoordinatePair } from '../coordinates';
import { TopographicDataset, HypsometricRampName, HYPSOMETRIC_RAMPS } from '../topography/contours';
import { 
  Info, 
  Ruler, 
  Compass, 
  Sun, 
  Layers, 
  Copy, 
  Check, 
  Trash2, 
  AlertTriangle, 
  ChevronRight, 
  ChevronLeft,
  Split, 
  RefreshCw,
  CloudRain,
  Building2,
  Mountain
} from 'lucide-react';

interface InspectorPanelProps {
  project: SiteProject;
  activeFeature?: SiteFeature;
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
  showContours?: boolean;
  onToggleContours?: () => void;
  topographicDataset?: TopographicDataset | null;
  isLoadingContours?: boolean;
  contourError?: string | null;
  contourIntervalM?: number;
  onChangeContourInterval?: (intervalM: number) => void;
  contourRamp?: HypsometricRampName;
  onChangeContourRamp?: (ramp: HypsometricRampName) => void;
  onRefreshContours?: () => void;
}

type InspectorTab = 'overview' | 'geometry' | 'coordinates' | 'topography' | 'environment' | 'features';

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
  showContours = false,
  onToggleContours,
  topographicDataset = null,
  isLoadingContours = false,
  contourError = null,
  contourIntervalM = 2,
  onChangeContourInterval,
  contourRamp = 'kepler',
  onChangeContourRamp,
  onRefreshContours
}) => {
  const [activeTab, setActiveTab] = useState<InspectorTab>('overview');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 1800);
  };

  const transects = project.features.filter(f => f.properties.featureType === 'transect');

  if (isCollapsed) {
    return (
      <div className="flex items-start z-20 select-none">
        <button
          onClick={() => setIsCollapsed(false)}
          className="glass-panel rounded-xl p-2.5 text-[var(--text-secondary)] hover:text-[#7C5CFF] transition-all flex items-center gap-1.5 shadow-xl"
          title="Expand Site Intelligence Inspector"
          aria-label="Expand Inspector"
        >
          <ChevronLeft className="w-4 h-4 text-[#7C5CFF]" />
          <span className="text-[11px] font-medium pr-1">Inspector</span>
        </button>
      </div>
    );
  }

  return (
    <aside className="w-[390px] h-full glass-panel rounded-xl overflow-hidden flex flex-col z-20 text-xs text-[var(--text-primary)] select-none transition-all duration-150">
      {/* Tab Navigation */}
      <div className="flex items-center justify-between border-b border-[var(--border-glass)] bg-[var(--bg-glass-subtle)] px-1 pt-1">
        <div className="flex overflow-x-auto no-scrollbar">
          {[
            { id: 'overview', label: 'Overview', icon: <Info className="w-3.5 h-3.5" /> },
            { id: 'geometry', label: 'Geometry', icon: <Ruler className="w-3.5 h-3.5" /> },
            { id: 'coordinates', label: 'Coords', icon: <Compass className="w-3.5 h-3.5" /> },
            { id: 'topography', label: 'Topo', icon: <Mountain className="w-3.5 h-3.5" /> },
            { id: 'environment', label: 'Context', icon: <Sun className="w-3.5 h-3.5" /> },
            { id: 'features', label: `Layers (${project.features.length})`, icon: <Layers className="w-3.5 h-3.5" /> }
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as InspectorTab)}
                className={`flex items-center gap-1 px-2.5 py-2 text-[11px] font-medium whitespace-nowrap border-b-2 transition-all ${
                  isActive
                    ? 'border-[#7C5CFF] text-[#7C5CFF] bg-[var(--bg-surface)]/60'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]/50'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1.5 mr-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded transition-colors shrink-0"
          title="Collapse Inspector Drawer"
          aria-label="Collapse Inspector"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-3">
            {activeFeature ? (
              <>
                {/* Active Feature Identity */}
                <div className="p-3 bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                    <span className="uppercase tracking-wider font-semibold text-[#7C5CFF]">
                      {activeFeature.properties.featureType.replace('_', ' ')}
                    </span>
                    <span className="tabular-nums">
                      ID: {activeFeature.id.slice(0, 12)}
                    </span>
                  </div>
                  <input
                    type="text"
                    value={activeFeature.properties.name}
                    onChange={(e) => onUpdateFeatureName(activeFeature.id, e.target.value)}
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] focus:border-[#7C5CFF] px-2.5 py-1.5 rounded text-[var(--text-primary)] font-medium text-xs outline-none transition-colors"
                  />
                </div>

                {/* Topology Warning for Polygons */}
                {polygonAnalysis?.isSelfIntersecting && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-rose-700 dark:text-rose-300">Self-Intersecting Geometry (Bowtie)</div>
                      <div className="text-[11px] mt-0.5 opacity-90">
                        Polygon boundary edges cross each other. Planimetric area computation requires a clean simple ring. Drag vertices to resolve overlap.
                      </div>
                    </div>
                  </div>
                )}

                {/* Primary Metrics */}
                <div className="space-y-2">
                  <div className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wider flex items-center justify-between">
                    <span>Key Analytical Metrics</span>
                    <span className="text-[10px] text-[var(--text-muted)]">WGS84 Datum</span>
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
              <div className="p-8 text-center text-[var(--text-muted)] border border-dashed border-[var(--border-subtle)] rounded space-y-2">
                <Compass className="w-8 h-8 mx-auto text-[var(--text-muted)] opacity-60" />
                <div className="font-medium text-[var(--text-primary)]">No Feature Selected</div>
                <div className="text-[11px] text-[var(--text-secondary)] max-w-xs mx-auto">
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
                {/* Axis-Aligned Envelope Notice */}
                <div className="p-3 bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase text-[var(--text-primary)] font-semibold tracking-wider">
                      Bounding Box Envelope
                    </span>
                    <span className="text-[10px] text-amber-500 font-medium">
                      Not Site Width
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="bg-[var(--bg-surface)] p-2 rounded border border-[var(--border-subtle)]">
                      <div className="text-[10px] text-[var(--text-muted)] font-medium">E-W SPAN</div>
                      <div className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
                        {polygonAnalysis.bbox.eastWestSpanM.toLocaleString()} m
                      </div>
                    </div>
                    <div className="bg-[var(--bg-surface)] p-2 rounded border border-[var(--border-subtle)]">
                      <div className="text-[10px] text-[var(--text-muted)] font-medium">N-S SPAN</div>
                      <div className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
                        {polygonAnalysis.bbox.northSouthSpanM.toLocaleString()} m
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                    <strong>Architectural Notice:</strong> Bounding-box spans represent the axis-aligned geographic envelope, <em>never</em> true site dimensions or perpendicular parcel widths. Use the <strong>Transect Tool (T)</strong> below to measure real site widths.
                  </div>
                </div>

                {/* Site Transects Section */}
                <div className="p-3 bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[11px] uppercase text-[var(--text-primary)] font-semibold tracking-wider">
                      <Split className="w-3.5 h-3.5 text-amber-500" />
                      <span>User-Defined Transects ({transects.length})</span>
                    </div>
                  </div>

                  {transects.length === 0 ? (
                    <div className="text-[11px] text-[var(--text-muted)] py-1">
                      No transects drawn yet. Select the <strong>Transect tool (T)</strong> to draw true cross-section width measurements across the site.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {transects.map((t) => (
                        <div
                          key={t.id}
                          onClick={() => onSelectFeature(t.id)}
                          className="p-2.5 bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] rounded cursor-pointer transition-colors flex items-center justify-between"
                        >
                          <div>
                            <div className="font-medium text-[var(--text-primary)]">{t.properties.name}</div>
                            <div className="text-[10px] text-amber-500 tabular-nums">
                              {t.properties.metrics?.line_total_length?.formattedValue || 'Measured transect'}
                            </div>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Boundary Segments Table */}
                <div className="p-3 bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded space-y-2">
                  <div className="text-[11px] uppercase text-[var(--text-primary)] font-semibold tracking-wider">
                    Boundary Edges & Bearings ({polygonAnalysis.segments.length})
                  </div>
                  <div className="max-h-56 overflow-y-auto space-y-1 pr-1 text-[11px]">
                    {polygonAnalysis.segments.map((seg) => (
                      <div
                        key={seg.index}
                        className="p-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded flex items-center justify-between tabular-nums"
                      >
                        <span className="text-[#7C5CFF] font-semibold">Edge {seg.index}</span>
                        <span className="text-[var(--text-primary)] font-medium">{seg.distanceM.toFixed(2)} m</span>
                        <span className="text-[var(--text-muted)]">Azimuth: {seg.initialAzimuthDeg.toFixed(1)}°</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : lineAnalysis ? (
              <div className="space-y-3">
                <MetricCard metric={lineAnalysis.metrics.line_total_length} />
                <MetricCard metric={lineAnalysis.metrics.line_initial_bearing} />

                <div className="p-3 bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded space-y-2">
                  <div className="text-[11px] uppercase text-[var(--text-primary)] font-semibold tracking-wider">
                    Line Segments ({lineAnalysis.segments.length})
                  </div>
                  <div className="space-y-1 text-[11px]">
                    {lineAnalysis.segments.map((seg) => (
                      <div
                        key={seg.index}
                        className="p-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded flex items-center justify-between tabular-nums"
                      >
                        <span className="text-sky-500 font-medium">Segment {seg.index}</span>
                        <span className="text-[var(--text-primary)] font-medium">{seg.distanceM.toFixed(2)} m</span>
                        <span className="text-[var(--text-muted)]">{seg.initialAzimuthDeg.toFixed(1)}°</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-[var(--text-muted)] py-6">
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
                <div className="p-3 bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase text-[var(--text-primary)] font-semibold tracking-wider">
                      Centroid Coordinate
                    </span>
                    <button
                      onClick={() => handleCopy(`${polygonAnalysis.centroid[1]}, ${polygonAnalysis.centroid[0]}`, 'centroid')}
                      className="text-[10px] text-[#7C5CFF] hover:text-[#6B47FC] flex items-center gap-1 font-medium transition-colors"
                    >
                      {copiedText === 'centroid' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      <span>Copy [Lat, Lon]</span>
                    </button>
                  </div>
                  <div className="text-xs text-[var(--text-primary)] bg-[var(--bg-surface)] p-2.5 rounded border border-[var(--border-subtle)] tabular-nums font-medium">
                    {formatCoordinatePair(polygonAnalysis.centroid[1], polygonAnalysis.centroid[0], 7)}
                  </div>
                </div>

                {/* Vertices List */}
                <div className="space-y-2">
                  <div className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Site Boundary Vertex Registry ({polygonAnalysis.vertices.length})
                  </div>
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {polygonAnalysis.vertices.map((v, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded text-[11px] space-y-1.5 tabular-nums"
                      >
                        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-1.5">
                          <span className="text-[#7C5CFF] font-semibold">Node {idx + 1}</span>
                          <button
                            onClick={() => handleCopy(`${v.latitude.toFixed(7)}, ${v.longitude.toFixed(7)}`, `node-${idx}`)}
                            className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1 transition-colors"
                          >
                            {copiedText === `node-${idx}` ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                            <span>Copy DD</span>
                          </button>
                        </div>

                        <div>
                          <span className="text-[var(--text-muted)] text-[10px]">WGS84 DD:</span>{' '}
                          <span className="text-[var(--text-primary)] font-medium">{formatCoordinatePair(v.latitude, v.longitude, 6)}</span>
                        </div>

                        <div>
                          <span className="text-[var(--text-muted)] text-[10px]">DMS:</span>{' '}
                          <span className="text-[var(--text-secondary)] text-[10px]">{v.dmsFormatted}</span>
                        </div>

                        <div className="bg-[var(--bg-surface)] p-2 rounded border border-[var(--border-subtle)] text-[10px]">
                          <span className="text-sky-500 font-semibold">{v.utm.epsg}:</span>{' '}
                          <span className="text-[var(--text-secondary)]">{v.utm.formatted}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : pointReport ? (
              <div className="p-3 bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded space-y-3">
                <div className="font-semibold text-[var(--text-primary)]">Spot Datum Coordinates</div>
                <div className="space-y-2 text-xs tabular-nums">
                  <div>
                    <div className="text-[var(--text-muted)] text-[10px]">DECIMAL DEGREES (WGS84)</div>
                    <div className="text-[var(--text-primary)] font-medium">{formatCoordinatePair(pointReport.latitude, pointReport.longitude, 7)}</div>
                  </div>
                  <div>
                    <div className="text-[var(--text-muted)] text-[10px]">SEXAGESIMAL (DMS)</div>
                    <div className="text-[var(--text-secondary)]">{pointReport.dmsFormatted}</div>
                  </div>
                  <div>
                    <div className="text-[var(--text-muted)] text-[10px]">PROJECTED UTM ({pointReport.utm.epsg})</div>
                    <div className="text-sky-500 font-medium">{pointReport.utm.formatted}</div>
                  </div>
                  <div>
                    <div className="text-[var(--text-muted)] text-[10px]">WEB MERCATOR (EPSG:3857)</div>
                    <div className="text-[var(--text-secondary)]">{pointReport.webMercator.formatted}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-[var(--text-muted)] py-6">
                Select a geometry on the map to inspect geodetic and projected coordinates.
              </div>
            )}
          </div>
        )}

        {/* TAB 3.5: TOPOGRAPHY & CONTOURS */}
        {activeTab === 'topography' && (
          <div className="space-y-3">
            {/* Layer Header & Toggle */}
            <div className="p-3 bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] uppercase text-[#7C5CFF] font-semibold tracking-wider">
                  <Mountain className="w-3.5 h-3.5" />
                  <span>Topographic Contours (DEM)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {onRefreshContours && (
                    <button
                      onClick={onRefreshContours}
                      disabled={isLoadingContours}
                      className="p-1 bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] rounded text-[var(--text-secondary)] transition-colors"
                      title="Re-sample DEM Elevation Grid"
                    >
                      <RefreshCw className={`w-3 h-3 ${isLoadingContours ? 'animate-spin text-[#7C5CFF]' : ''}`} />
                    </button>
                  )}
                  {onToggleContours && (
                    <button
                      onClick={onToggleContours}
                      className={`px-2.5 py-1 rounded text-[10px] font-medium border transition-colors ${
                        showContours
                          ? 'bg-[#7C5CFF] border-[#7C5CFF] text-white'
                          : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {showContours ? 'Overlay Active' : 'Enable Overlay'}
                    </button>
                  )}
                </div>
              </div>

              {/* Interval & Hypsometric Ramp Controls */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[var(--border-subtle)]">
                <div>
                  <label className="block text-[10px] text-[var(--text-muted)] uppercase mb-1">
                    Contour Interval
                  </label>
                  <select
                    value={contourIntervalM}
                    onChange={(e) => onChangeContourInterval && onChangeContourInterval(Number(e.target.value))}
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2 py-1 text-[11px] text-[var(--text-primary)] tabular-nums outline-none focus:border-[#7C5CFF]"
                  >
                    <option value={1}>1.0 m (Fine)</option>
                    <option value={2}>2.0 m (Standard)</option>
                    <option value={5}>5.0 m (Medium)</option>
                    <option value={10}>10.0 m (Coarse)</option>
                    <option value={25}>25.0 m (Regional)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-[var(--text-muted)] uppercase mb-1">
                    Hypsometric Ramp
                  </label>
                  <select
                    value={contourRamp}
                    onChange={(e) => onChangeContourRamp && onChangeContourRamp(e.target.value as HypsometricRampName)}
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[#7C5CFF]"
                  >
                    {Object.entries(HYPSOMETRIC_RAMPS).map(([key, val]) => (
                      <option key={key} value={key}>
                        {val.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Loading / Error / Dataset Stats */}
            {isLoadingContours ? (
              <div className="p-4 bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded text-center space-y-2">
                <div className="w-4 h-4 border-2 border-[#7C5CFF] border-t-transparent rounded-full animate-spin mx-auto" />
                <div className="text-[11px] text-[var(--text-secondary)]">
                  Sampling Open-Meteo DEM surface grid...
                </div>
              </div>
            ) : contourError ? (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded text-rose-400 text-[11px] space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>DEM Elevation Data Unavailable</span>
                </div>
                <div className="text-[10px] text-[var(--text-secondary)]">{contourError}</div>
              </div>
            ) : topographicDataset ? (
              <>
                {/* Relief Summary KPI Grid */}
                <div className="grid grid-cols-2 gap-2 tabular-nums">
                  <div className="bg-[var(--bg-surface-secondary)] p-2.5 rounded border border-[var(--border-subtle)]">
                    <div className="text-[10px] text-[var(--text-muted)]">ELEVATION RANGE</div>
                    <div className="text-sm font-semibold text-[var(--text-primary)] mt-0.5">
                      {topographicDataset.minElevationM.toFixed(1)}m – {topographicDataset.maxElevationM.toFixed(1)}m
                    </div>
                    <div className="text-[10px] text-[var(--text-secondary)]">
                      Mean: {topographicDataset.meanElevationM.toFixed(1)} m ASL
                    </div>
                  </div>

                  <div className="bg-[var(--bg-surface-secondary)] p-2.5 rounded border border-[var(--border-subtle)]">
                    <div className="text-[10px] text-[var(--text-muted)]">VERTICAL RELIEF</div>
                    <div className="text-sm font-semibold text-[#7C5CFF] mt-0.5">
                      {topographicDataset.reliefM.toFixed(1)} m
                    </div>
                    <div className="text-[10px] text-[var(--text-secondary)]">
                      {topographicDataset.contours.length} isolines ({topographicDataset.totalLengthKm} km)
                    </div>
                  </div>
                </div>

                {/* Hypsometric Legend */}
                <div className="p-3 bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded space-y-2">
                  <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-medium">
                    <span>Hypsometric Elevation Scale</span>
                    <span className="tabular-nums">
                      {topographicDataset.validSampleCount}/{topographicDataset.totalSampleCount} DEM nodes
                    </span>
                  </div>
                  <div className="space-y-1.5 pt-1">
                    {topographicDataset.legend.slice().reverse().map((bin, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px] tabular-nums">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3.5 h-2 rounded-xs shrink-0"
                            style={{ backgroundColor: bin.color }}
                          />
                          <span className="text-[var(--text-primary)] font-medium">{bin.label}</span>
                        </div>
                        <span className="text-[10px] text-[var(--text-muted)]">EGM96 MSL</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Provenance & Limitations Disclosure */}
                <div className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded space-y-1 text-[10px] text-[var(--text-muted)]">
                  <div className="text-[var(--text-secondary)] font-medium">
                    Source: {topographicDataset.metadata.source}
                  </div>
                  <div>CRS: {topographicDataset.metadata.crs}</div>
                  <div>Method: {topographicDataset.metadata.method}</div>
                  <div className="pt-1 text-[var(--text-muted)] leading-relaxed">
                    {topographicDataset.metadata.limitations}
                  </div>
                </div>
              </>
            ) : (
              <div className="p-4 bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded text-center text-[var(--text-muted)] text-[11px]">
                Enable the Contours overlay to sample genuine DEM surface heights and generate topographic isolines.
              </div>
            )}
          </div>
        )}

        {/* TAB 4: ENVIRONMENTAL & URBAN CONTEXT */}
        {activeTab === 'environment' && (
          <div className="space-y-4">
            {/* Section A: Astronomical Solar Analysis */}
            <div className="p-3 bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] uppercase text-[#7C5CFF] font-semibold tracking-wider">
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                  <span>Astronomical Solar Position</span>
                </div>
                <span className="text-[10px] text-[var(--text-muted)]">NOAA Model</span>
              </div>

              {solarAnalysis ? (
                <>
                  <div className="grid grid-cols-2 gap-2 tabular-nums">
                    <div className="bg-[var(--bg-surface)] p-2 rounded border border-[var(--border-subtle)]">
                      <div className="text-[10px] text-[var(--text-muted)] font-medium">SOLAR ALTITUDE</div>
                      <div className="text-sm font-semibold text-[var(--text-primary)]">
                        {solarAnalysis.solarElevationDeg.toFixed(1)}°
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        {solarAnalysis.solarElevationDeg > 0 ? 'Above Horizon' : 'Night'}
                      </div>
                    </div>
                    <div className="bg-[var(--bg-surface)] p-2 rounded border border-[var(--border-subtle)]">
                      <div className="text-[10px] text-[var(--text-muted)] font-medium">SOLAR AZIMUTH</div>
                      <div className="text-sm font-semibold text-[var(--text-primary)]">
                        {solarAnalysis.solarAzimuthDeg.toFixed(1)}°
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">From True North</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[11px] text-center tabular-nums">
                    <div className="bg-[var(--bg-surface)] p-2 rounded border border-[var(--border-subtle)]">
                      <div className="text-[var(--text-muted)] text-[9px]">SUNRISE</div>
                      <div className="text-amber-500 font-semibold">{solarAnalysis.sunriseTime}</div>
                    </div>
                    <div className="bg-[var(--bg-surface)] p-2 rounded border border-[var(--border-subtle)]">
                      <div className="text-[var(--text-muted)] text-[9px]">SOLAR NOON</div>
                      <div className="text-amber-500 font-semibold">{solarAnalysis.solarNoonTime}</div>
                    </div>
                    <div className="bg-[var(--bg-surface)] p-2 rounded border border-[var(--border-subtle)]">
                      <div className="text-[var(--text-muted)] text-[9px]">SUNSET</div>
                      <div className="text-amber-500 font-semibold">{solarAnalysis.sunsetTime}</div>
                    </div>
                  </div>

                  {/* Hourly Solar Arc Diagram */}
                  <div className="bg-[var(--bg-surface)] p-2.5 rounded border border-[var(--border-subtle)]">
                    <div className="text-[10px] text-[var(--text-secondary)] mb-1.5 flex items-center justify-between">
                      <span className="font-medium">24-Hour Sun Elevation Arc</span>
                      <span className="tabular-nums">Daylight: {solarAnalysis.daylightDurationHours}h</span>
                    </div>
                    <svg className="w-full h-16 bg-[var(--bg-surface-secondary)] rounded" viewBox="0 0 240 60">
                      {/* Horizon line */}
                      <line x1="0" y1="45" x2="240" y2="45" stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="2,2" />
                      <text x="5" y="42" fill="var(--text-muted)" fontSize="8" fontFamily="Inter">Horizon (0°)</text>

                      {/* Elevation curve */}
                      {(() => {
                        const pathD = solarAnalysis.hourlySunPath.reduce((acc, pt, idx) => {
                          const x = (idx / 23) * 240;
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
                <div className="text-[var(--text-muted)] text-center py-2">Loading astronomical data...</div>
              )}
            </div>

            {/* Section B: Open-Meteo Climate Context */}
            <div className="p-3 bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] uppercase text-sky-500 font-semibold tracking-wider">
                  <CloudRain className="w-3.5 h-3.5 text-sky-500" />
                  <span>Regional Atmospheric Climate</span>
                </div>
                <button
                  onClick={onRefreshClimate}
                  disabled={isLoadingClimate}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
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
                <div className="text-[var(--text-muted)] text-center py-2 text-[11px]">
                  {isLoadingClimate ? 'Querying Open-Meteo NWP Grid...' : 'Climate data ready upon site selection.'}
                </div>
              )}
            </div>

            {/* Section C: OpenStreetMap Urban Context & Morphology */}
            <div className="p-3 bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] uppercase text-emerald-500 font-semibold tracking-wider">
                  <Building2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Urban Context & Morphology</span>
                </div>
                <button
                  onClick={onRefreshUrban}
                  disabled={isLoadingUrban}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center gap-1 text-[10px] font-medium transition-colors"
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
                    <div className="bg-[var(--bg-surface)] p-2.5 rounded border border-[var(--border-subtle)] space-y-1.5">
                      <div className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                        Sampled Urban Entities
                      </div>
                      <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1 text-[11px]">
                        {urbanContext.items.slice(0, 8).map((it, idx) => (
                          <div key={idx} className="flex items-center justify-between text-[var(--text-primary)]">
                            <span className="truncate max-w-[180px]">{it.name}</span>
                            <span className="text-[10px] text-[var(--text-muted)]">
                              {it.type || it.category}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-[var(--text-muted)] text-center py-2 text-[11px]">
                  {isLoadingUrban ? 'Querying OpenStreetMap Overpass...' : 'Click "Query OSM" to inspect surrounding urban fabric.'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: FEATURES & LAYERS */}
        {activeTab === 'features' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] uppercase tracking-wider font-semibold">
              <span>Project Vector Layers</span>
              <span className="tabular-nums">{project.features.length} Features</span>
            </div>

            {project.features.length === 0 ? (
              <div className="text-center text-[var(--text-muted)] py-8 border border-dashed border-[var(--border-subtle)] rounded">
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
                          ? 'bg-[var(--brand-subtle)] border-[#7C5CFF]'
                          : 'bg-[var(--bg-surface-secondary)] border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: feat.properties.color }}
                        />
                        <div className="min-w-0">
                          <div className="font-medium text-[var(--text-primary)] text-xs truncate">
                            {feat.properties.name}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)]">
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
                          className="p-1 text-[var(--text-muted)] hover:text-rose-500 rounded transition-colors"
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

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Interactive Map Canvas
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import workerScript from 'maplibre-gl/dist/maplibre-gl-worker.mjs?raw';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { SiteProject, SiteFeature, BasemapId } from '../types';
import { ToolMode } from './ToolBar';
import { BASEMAP_OPTIONS } from '../map/basemaps';
import { calculateGeodesicDistance } from '../geometry';
import { Compass, RotateCcw, AlertTriangle } from 'lucide-react';

// Setup MapLibre web worker reliably
// Inlining the worker via an in-memory Blob URL guarantees zero-network-fetch reliability,
// preventing 404 worker loading errors in Vite dev/preview and sandboxed iframe environments.
if (typeof window !== 'undefined' && maplibregl.setWorkerUrl) {
  try {
    const blob = new Blob([workerScript], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    maplibregl.setWorkerUrl(blobUrl);
  } catch (err) {
    console.warn('Falling back to URL worker registration', err);
    maplibregl.setWorkerUrl(workerUrl);
  }
}

interface MapCanvasProps {
  project: SiteProject;
  currentTool: ToolMode;
  onUpdateFeatureGeometry: (featureId: string, newCoordinates: any) => void;
  onCreateFeature: (newFeature: SiteFeature) => void;
  onSelectFeature: (featureId: string | null) => void;
  onCursorMove: (lng: number, lat: number) => void;
  flyToTarget: { lng: number; lat: number; zoom?: number } | null;
  fitBoundsTrigger: number;
}

export const MapCanvas: React.FC<MapCanvasProps> = ({
  project,
  currentTool,
  onUpdateFeatureGeometry,
  onCreateFeature,
  onSelectFeature,
  onCursorMove,
  flyToTarget,
  fitBoundsTrigger
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Drawing state
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([]);
  const [cursorPos, setCursorPos] = useState<[number, number] | null>(null);
  const [draggingVertexIndex, setDraggingVertexIndex] = useState<number | null>(null);

  // References to keep event handlers fresh
  const currentToolRef = useRef(currentTool);
  currentToolRef.current = currentTool;

  const drawingPointsRef = useRef(drawingPoints);
  drawingPointsRef.current = drawingPoints;

  const projectRef = useRef(project);
  projectRef.current = project;

  // Initialize MapLibre
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const initialBasemap = BASEMAP_OPTIONS.find(b => b.id === project.basemap) || BASEMAP_OPTIONS[0];

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: initialBasemap.styleUrl as any,
      center: project.center,
      zoom: project.zoom,
      pitch: project.pitch || 0,
      bearing: project.bearing || 0,
      attributionControl: false
    });

    // Add scale bar
    const scale = new maplibregl.ScaleControl({
      maxWidth: 160,
      unit: 'metric'
    });
    map.addControl(scale, 'bottom-left');

    // Add custom attribution control
    const attrib = new maplibregl.AttributionControl({
      compact: false,
      customAttribution: 'SiteLens WGS84 Geodesic Precision'
    });
    map.addControl(attrib, 'bottom-right');

    map.on('mousemove', (e) => {
      const lng = e.lngLat.lng;
      const lat = e.lngLat.lat;
      onCursorMove(lng, lat);
      setCursorPos([lng, lat]);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update Basemap Style if changed
  useEffect(() => {
    if (!mapRef.current) return;
    const targetBasemap = BASEMAP_OPTIONS.find(b => b.id === project.basemap);
    if (targetBasemap) {
      mapRef.current.setStyle(targetBasemap.styleUrl as any);
    }
  }, [project.basemap]);

  // Handle flyToTarget
  useEffect(() => {
    if (!mapRef.current || !flyToTarget) return;
    mapRef.current.flyTo({
      center: [flyToTarget.lng, flyToTarget.lat],
      zoom: flyToTarget.zoom || 16.5,
      essential: true,
      duration: 1800
    });
  }, [flyToTarget]);

  // Handle fit bounds
  useEffect(() => {
    if (!mapRef.current || fitBoundsTrigger === 0) return;
    if (project.features.length === 0) return;

    const bounds = new maplibregl.LngLatBounds();
    let hasCoords = false;

    for (const f of project.features) {
      if (f.geometry.type === 'Polygon' && f.geometry.coordinates[0]) {
        for (const coord of f.geometry.coordinates[0]) {
          bounds.extend(coord as [number, number]);
          hasCoords = true;
        }
      } else if (f.geometry.type === 'LineString') {
        for (const coord of f.geometry.coordinates) {
          bounds.extend(coord as [number, number]);
          hasCoords = true;
        }
      } else if (f.geometry.type === 'Point') {
        bounds.extend(f.geometry.coordinates as [number, number]);
        hasCoords = true;
      }
    }

    if (hasCoords) {
      mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 18 });
    }
  }, [fitBoundsTrigger]);

  // Map Click Handling
  const handleMapClick = useCallback((e: React.MouseEvent<SVGElement | HTMLDivElement>) => {
    if (!mapRef.current) return;
    const tool = currentToolRef.current;
    if (tool === 'pan') return;

    const rect = mapContainerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const pixelPoint = new maplibregl.Point(e.clientX - rect.left, e.clientY - rect.top);
    const lngLat = mapRef.current.unproject(pixelPoint);
    const point: [number, number] = [
      Number(lngLat.lng.toFixed(7)),
      Number(lngLat.lat.toFixed(7))
    ];

    if (tool === 'polygon') {
      const currentPoints = drawingPointsRef.current;
      // If user clicked close to the first point (> 2 points), finish polygon
      if (currentPoints.length >= 3) {
        const first = currentPoints[0];
        const distToFirst = calculateGeodesicDistance(point, first).distanceM;
        // If within 15 metres or clicked on start point
        if (distToFirst < 20) {
          finishPolygon();
          return;
        }
      }
      setDrawingPoints([...currentPoints, point]);
    } else if (tool === 'line' || tool === 'transect') {
      const currentPoints = drawingPointsRef.current;
      if (tool === 'transect' && currentPoints.length === 1) {
        // Transect is defined by 2 endpoints
        finishLine([...currentPoints, point], 'transect');
        return;
      }
      setDrawingPoints([...currentPoints, point]);
    } else if (tool === 'point') {
      const newFeature: SiteFeature = {
        type: 'Feature',
        id: `point-${Date.now()}`,
        geometry: {
          type: 'Point',
          coordinates: point
        },
        properties: {
          id: `point-${Date.now()}`,
          name: `Spot Datum ${projectRef.current.features.filter(f => f.properties.featureType === 'datum_point').length + 1}`,
          featureType: 'datum_point',
          color: '#06b6d4',
          strokeColor: '#22d3ee',
          fillOpacity: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          metrics: {}
        }
      };
      onCreateFeature(newFeature);
    }
  }, [onCreateFeature]);

  // Finish polygon drawing
  const finishPolygon = () => {
    const points = drawingPointsRef.current;
    if (points.length < 3) return;

    const closed = [...points, points[0]];
    const newFeature: SiteFeature = {
      type: 'Feature',
      id: `boundary-${Date.now()}`,
      geometry: {
        type: 'Polygon',
        coordinates: [closed]
      },
      properties: {
        id: `boundary-${Date.now()}`,
        name: `Site Boundary ${projectRef.current.features.filter(f => f.properties.featureType === 'site_boundary').length + 1}`,
        featureType: 'site_boundary',
        color: '#8b5cf6',
        strokeColor: '#a78bfa',
        fillOpacity: 0.25,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metrics: {}
      }
    };
    onCreateFeature(newFeature);
    setDrawingPoints([]);
  };

  // Finish line drawing
  const finishLine = (points = drawingPointsRef.current, type: 'measure_line' | 'transect' = 'measure_line') => {
    if (points.length < 2) return;

    const isTransect = type === 'transect';
    const newFeature: SiteFeature = {
      type: 'Feature',
      id: `${type}-${Date.now()}`,
      geometry: {
        type: 'LineString',
        coordinates: points
      },
      properties: {
        id: `${type}-${Date.now()}`,
        name: isTransect
          ? `Site Transect ${projectRef.current.features.filter(f => f.properties.featureType === 'transect').length + 1}`
          : `Measure Line ${projectRef.current.features.filter(f => f.properties.featureType === 'measure_line').length + 1}`,
        featureType: isTransect ? 'transect' : 'measure_line',
        color: isTransect ? '#f59e0b' : '#38bdf8',
        strokeColor: isTransect ? '#fbbf24' : '#0284c7',
        fillOpacity: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metrics: {}
      }
    };
    onCreateFeature(newFeature);
    setDrawingPoints([]);
  };

  // Keyboard shortcuts (Enter, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawingPoints([]);
      } else if (e.key === 'Enter') {
        if (currentTool === 'polygon' && drawingPoints.length >= 3) {
          finishPolygon();
        } else if ((currentTool === 'line' || currentTool === 'transect') && drawingPoints.length >= 2) {
          finishLine(drawingPoints, currentTool === 'transect' ? 'transect' : 'measure_line');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTool, drawingPoints]);

  // Vertex Dragging Logic
  const activeFeature = project.features.find(f => f.id === project.activeFeatureId);

  const handleVertexMouseDown = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentTool !== 'select') return;
    setDraggingVertexIndex(index);
  };

  const handleMidpointClick = (insertIndex: number, midpoint: [number, number], e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeFeature) return;

    if (activeFeature.geometry.type === 'Polygon') {
      const ring = [...activeFeature.geometry.coordinates[0]];
      ring.splice(insertIndex + 1, 0, midpoint);
      // Ensure closure
      ring[ring.length - 1] = ring[0];
      onUpdateFeatureGeometry(activeFeature.id, [ring]);
    } else if (activeFeature.geometry.type === 'LineString') {
      const coords = [...activeFeature.geometry.coordinates];
      coords.splice(insertIndex + 1, 0, midpoint);
      onUpdateFeatureGeometry(activeFeature.id, coords);
    }
  };

  // Global mouse move and up for vertex dragging
  useEffect(() => {
    if (draggingVertexIndex === null || !activeFeature || !mapRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = mapContainerRef.current?.getBoundingClientRect();
      if (!rect || !mapRef.current) return;

      const pt = new maplibregl.Point(e.clientX - rect.left, e.clientY - rect.top);
      const lngLat = mapRef.current.unproject(pt);
      const newCoord: [number, number] = [
        Number(lngLat.lng.toFixed(7)),
        Number(lngLat.lat.toFixed(7))
      ];

      if (activeFeature.geometry.type === 'Polygon') {
        const ring = [...activeFeature.geometry.coordinates[0]];
        ring[draggingVertexIndex] = newCoord;
        // If dragging vertex 0 or last vertex, keep closed
        if (draggingVertexIndex === 0 || draggingVertexIndex === ring.length - 1) {
          ring[0] = newCoord;
          ring[ring.length - 1] = newCoord;
        }
        onUpdateFeatureGeometry(activeFeature.id, [ring]);
      } else if (activeFeature.geometry.type === 'LineString') {
        const coords = [...activeFeature.geometry.coordinates];
        coords[draggingVertexIndex] = newCoord;
        onUpdateFeatureGeometry(activeFeature.id, coords);
      } else if (activeFeature.geometry.type === 'Point') {
        onUpdateFeatureGeometry(activeFeature.id, newCoord);
      }
    };

    const handleMouseUp = () => {
      setDraggingVertexIndex(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingVertexIndex, activeFeature, onUpdateFeatureGeometry]);

  // Convert geo coordinates to screen pixels for SVG overlay
  const projectToPixel = (coord: [number, number]): { x: number; y: number } | null => {
    if (!mapRef.current) return null;
    const pt = mapRef.current.project(new maplibregl.LngLat(coord[0], coord[1]));
    return { x: pt.x, y: pt.y };
  };

  // Re-render SVG overlay on map move / zoom
  const [, setMapVersion] = useState(0);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onMove = () => setMapVersion(v => v + 1);
    map.on('move', onMove);
    return () => {
      map.off('move', onMove);
    };
  }, []);

  // Compute live measurement for rubberband preview
  let rubberbandStats: { distanceM: number; azimuthDeg: number } | null = null;
  if (drawingPoints.length > 0 && cursorPos) {
    const last = drawingPoints[drawingPoints.length - 1];
    const { distanceM, initialAzimuthDeg } = calculateGeodesicDistance(last, cursorPos);
    rubberbandStats = { distanceM, azimuthDeg: initialAzimuthDeg };
  }

  return (
    <div className="relative flex-1 h-full w-full bg-[#0b0f17] overflow-hidden select-none">
      {/* MapLibre DOM Target */}
      <div 
        ref={mapContainerRef} 
        className="w-full h-full"
        style={{ cursor: currentTool === 'pan' ? 'grab' : 'crosshair' }}
      />

      {/* SVG Interactive Geometry & Drawing Overlay */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
        onClick={handleMapClick}
      >
        <defs>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* 1. Render Existing Features */}
        {project.features.map((feature) => {
          const isSelected = feature.id === project.activeFeatureId;

          if (feature.geometry.type === 'Polygon') {
            const ring = feature.geometry.coordinates[0] || [];
            const screenPoints = ring
              .map((c: [number, number]) => projectToPixel(c))
              .filter(Boolean) as { x: number; y: number }[];

            if (screenPoints.length < 3) return null;

            const pathD = screenPoints.reduce(
              (acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`,
              ''
            ) + ' Z';

            return (
              <g key={feature.id} className="pointer-events-auto">
                <path
                  d={pathD}
                  fill={feature.properties.color}
                  fillOpacity={isSelected ? 0.35 : 0.2}
                  stroke={feature.properties.strokeColor}
                  strokeWidth={isSelected ? 3 : 2}
                  strokeDasharray={isSelected ? '6,3' : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectFeature(feature.id);
                  }}
                  className="cursor-pointer transition-all hover:fill-opacity-40"
                />
              </g>
            );
          }

          if (feature.geometry.type === 'LineString') {
            const coords = feature.geometry.coordinates || [];
            const screenPoints = coords
              .map((c: [number, number]) => projectToPixel(c))
              .filter(Boolean) as { x: number; y: number }[];

            if (screenPoints.length < 2) return null;

            const pathD = screenPoints.reduce(
              (acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`,
              ''
            );

            const isTransect = feature.properties.featureType === 'transect';

            return (
              <g key={feature.id} className="pointer-events-auto">
                <path
                  d={pathD}
                  fill="none"
                  stroke={feature.properties.strokeColor}
                  strokeWidth={isSelected ? 3.5 : 2.5}
                  strokeDasharray={isTransect ? '8,4' : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectFeature(feature.id);
                  }}
                  className="cursor-pointer transition-all hover:stroke-width-4"
                />
              </g>
            );
          }

          if (feature.geometry.type === 'Point') {
            const coord = feature.geometry.coordinates as [number, number];
            const pt = projectToPixel(coord);
            if (!pt) return null;

            return (
              <g
                key={feature.id}
                transform={`translate(${pt.x}, ${pt.y})`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectFeature(feature.id);
                }}
                className="cursor-pointer pointer-events-auto"
              >
                <circle r={9} fill={feature.properties.color} fillOpacity={0.3} stroke="#22d3ee" strokeWidth={1.5} />
                <circle r={4} fill="#22d3ee" />
                <circle r={14} fill="none" stroke="#22d3ee" strokeWidth={1} strokeDasharray="2,2" opacity={0.6} />
                {isSelected && (
                  <text y={-16} textAnchor="middle" fill="#67e8f9" fontSize={10} fontFamily="JetBrains Mono">
                    {feature.properties.name}
                  </text>
                )}
              </g>
            );
          }

          return null;
        })}

        {/* 2. Interactive Vertex Handles & Midpoints on Selected Feature */}
        {activeFeature && currentTool === 'select' && (
          <g className="pointer-events-auto">
            {/* Polygon vertices & midpoints */}
            {activeFeature.geometry.type === 'Polygon' && (
              <>
                {(() => {
                  const ring = activeFeature.geometry.coordinates[0] || [];
                  const elements = [];
                  for (let i = 0; i < ring.length - 1; i++) {
                    const c1 = ring[i];
                    const c2 = ring[i + 1];
                    const pt1 = projectToPixel(c1);
                    const pt2 = projectToPixel(c2);

                    if (pt1) {
                      elements.push(
                        <g key={`vertex-${i}`} onMouseDown={(e) => handleVertexMouseDown(i, e)} className="cursor-move">
                          <circle cx={pt1.x} cy={pt1.y} r={7} fill="#1e1b4b" stroke="#a78bfa" strokeWidth={2} />
                          <circle cx={pt1.x} cy={pt1.y} r={3} fill="#ffffff" />
                          <text cx={pt1.x + 8} cy={pt1.y - 8} fill="#c4b5fd" fontSize={9} fontFamily="JetBrains Mono">
                            {i + 1}
                          </text>
                        </g>
                      );
                    }

                    // Midpoint insert handle
                    if (pt1 && pt2) {
                      const midX = (pt1.x + pt2.x) / 2;
                      const midY = (pt1.y + pt2.y) / 2;
                      const midCoord: [number, number] = [
                        (c1[0] + c2[0]) / 2,
                        (c1[1] + c2[1]) / 2
                      ];

                      elements.push(
                        <g
                          key={`mid-${i}`}
                          onClick={(e) => handleMidpointClick(i, midCoord, e)}
                          className="cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
                        >
                          <circle cx={midX} cy={midY} r={5} fill="#4c1d95" stroke="#c4b5fd" strokeWidth={1} />
                          <text x={midX} y={midY + 3} textAnchor="middle" fill="#ffffff" fontSize={8} fontWeight="bold">
                            +
                          </text>
                        </g>
                      );
                    }
                  }
                  return elements;
                })()}
              </>
            )}

            {/* Line vertices */}
            {activeFeature.geometry.type === 'LineString' && (
              <>
                {activeFeature.geometry.coordinates.map((c: [number, number], i: number) => {
                  const pt = projectToPixel(c);
                  if (!pt) return null;
                  return (
                    <g key={`line-v-${i}`} onMouseDown={(e) => handleVertexMouseDown(i, e)} className="cursor-move">
                      <circle cx={pt.x} cy={pt.y} r={7} fill="#0c4a6e" stroke="#38bdf8" strokeWidth={2} />
                      <circle cx={pt.x} cy={pt.y} r={3} fill="#ffffff" />
                      <text cx={pt.x + 8} cy={pt.y - 8} fill="#7dd3fc" fontSize={9} fontFamily="JetBrains Mono">
                        {i + 1}
                      </text>
                    </g>
                  );
                })}
              </>
            )}
          </g>
        )}

        {/* 3. Drawing In-Progress Live Feedback */}
        {drawingPoints.length > 0 && (
          <g>
            {/* Draw confirmed segments */}
            {(() => {
              const screenPoints = drawingPoints
                .map(c => projectToPixel(c))
                .filter(Boolean) as { x: number; y: number }[];

              const pathD = screenPoints.reduce(
                (acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`,
                ''
              );

              return (
                <>
                  <path
                    d={pathD}
                    fill={currentTool === 'polygon' ? 'rgba(139, 92, 246, 0.15)' : 'none'}
                    stroke="#a78bfa"
                    strokeWidth={2}
                  />
                  {screenPoints.map((pt, idx) => (
                    <circle
                      key={idx}
                      cx={pt.x}
                      cy={pt.y}
                      r={idx === 0 ? 8 : 5}
                      fill={idx === 0 ? '#10b981' : '#8b5cf6'}
                      stroke="#ffffff"
                      strokeWidth={1.5}
                    />
                  ))}
                </>
              );
            })()}

            {/* Rubberband line to cursor */}
            {cursorPos && (
              (() => {
                const last = drawingPoints[drawingPoints.length - 1];
                const pt1 = projectToPixel(last);
                const pt2 = projectToPixel(cursorPos);

                if (!pt1 || !pt2) return null;

                return (
                  <line
                    x1={pt1.x}
                    y1={pt1.y}
                    x2={pt2.x}
                    y2={pt2.y}
                    stroke="#c4b5fd"
                    strokeWidth={1.5}
                    strokeDasharray="4,4"
                  />
                );
              })()
            )}
          </g>
        )}
      </svg>

      {/* Floating Instructions & Live Measurements Banner during Drawing */}
      {drawingPoints.length > 0 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[#090d16]/90 border border-[#233148] px-3.5 py-1.5 rounded-full shadow-2xl flex items-center gap-3 text-xs font-mono text-slate-200 z-20 backdrop-blur-md">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Vertices: {drawingPoints.length}</span>
          </div>

          {rubberbandStats && (
            <div className="flex items-center gap-2 border-l border-[#233148] pl-3 text-slate-300">
              <span>
                Length:{' '}
                <strong className="text-white">
                  {rubberbandStats.distanceM >= 1000
                    ? `${(rubberbandStats.distanceM / 1000).toFixed(2)} km`
                    : `${rubberbandStats.distanceM.toFixed(1)} m`}
                </strong>
              </span>
              <span>•</span>
              <span>
                Bearing:{' '}
                <strong className="text-[#a78bfa]">{rubberbandStats.azimuthDeg.toFixed(1)}°</strong>
              </span>
            </div>
          )}

          <div className="border-l border-[#233148] pl-3 text-[11px] text-slate-400">
            {currentTool === 'polygon'
              ? (drawingPoints.length >= 3 ? 'Click start point or double-click to close' : 'Click to add boundary vertices')
              : currentTool === 'transect'
              ? 'Click second point to set cross-section transect'
              : 'Double-click or press Enter to complete'}
          </div>

          <button
            onClick={() => setDrawingPoints([])}
            className="text-rose-400 hover:text-rose-300 text-[10px] uppercase font-bold border-l border-[#233148] pl-2"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Map Control Buttons: Reset Bearing / North, Zoom In/Out */}
      <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-20">
        <button
          onClick={() => {
            if (mapRef.current) {
              mapRef.current.resetNorthPitch({ duration: 600 });
            }
          }}
          title="Reset North & Pitch"
          className="w-8 h-8 rounded bg-[#101726]/90 hover:bg-[#1a253a] border border-[#233148] flex items-center justify-center text-[#a78bfa] shadow-lg transition-colors"
        >
          <Compass className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

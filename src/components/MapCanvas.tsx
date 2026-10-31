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
import { calculateGeodesicDistance, deleteVertexFromRing, insertVertexIntoRing } from '../geometry';
import { Compass, AlertTriangle, Check, X } from 'lucide-react';

// Setup MapLibre web worker reliably
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
  onSelectTool?: (tool: ToolMode) => void;
  onStartGeometryTransaction?: () => void;
  onUpdateFeatureGeometry: (featureId: string, newCoordinates: any, recordHistory?: boolean) => void;
  onCreateFeature: (newFeature: SiteFeature) => void;
  onSelectFeature: (featureId: string | null) => void;
  onCursorMove: (lng: number, lat: number) => void;
  flyToTarget: { lng: number; lat: number; zoom?: number } | null;
  fitBoundsTrigger: number;
  completeTrigger?: number;
  cancelTrigger?: number;
  onDrawingActiveChange?: (isActive: boolean) => void;
}

export const MapCanvas: React.FC<MapCanvasProps> = ({
  project,
  currentTool,
  onSelectTool,
  onStartGeometryTransaction,
  onUpdateFeatureGeometry,
  onCreateFeature,
  onSelectFeature,
  onCursorMove,
  flyToTarget,
  fitBoundsTrigger,
  completeTrigger = 0,
  cancelTrigger = 0,
  onDrawingActiveChange,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Drawing state
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([]);
  const [cursorPos, setCursorPos] = useState<[number, number] | null>(null);
  const [draggingVertexIndex, setDraggingVertexIndex] = useState<number | null>(null);

  // Authoritative State Ref: completely eliminates stale closures across MapLibre event listeners
  const stateRef = useRef({
    project,
    currentTool,
    drawingPoints,
    onSelectTool,
    onStartGeometryTransaction,
    onUpdateFeatureGeometry,
    onCreateFeature,
    onSelectFeature,
    onCursorMove,
  });

  // Keep stateRef synchronously up-to-date on EVERY render pass
  stateRef.current = {
    project,
    currentTool,
    drawingPoints,
    onSelectTool,
    onStartGeometryTransaction,
    onUpdateFeatureGeometry,
    onCreateFeature,
    onSelectFeature,
    onCursorMove,
  };

  // Notify parent of drawing active state for keyboard coordination
  useEffect(() => {
    onDrawingActiveChange?.(drawingPoints.length > 0);
  }, [drawingPoints.length, onDrawingActiveChange]);

  // Cleanly cancel incomplete drawings when switching tools without corrupting existing features
  useEffect(() => {
    setDrawingPoints([]);
  }, [currentTool]);

  // Toggle MapLibre doubleClickZoom based on active tool
  useEffect(() => {
    if (!mapRef.current) return;
    if (['polygon', 'line', 'transect'].includes(currentTool)) {
      mapRef.current.doubleClickZoom.disable();
    } else {
      mapRef.current.doubleClickZoom.enable();
    }
  }, [currentTool]);

  // Finish polygon drawing
  const finishPolygon = useCallback(() => {
    const { drawingPoints: points, project: curProj, onCreateFeature: commitFeature } = stateRef.current;
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
        name: `Site Boundary ${curProj.features.filter(f => f.properties.featureType === 'site_boundary').length + 1}`,
        featureType: 'site_boundary',
        color: '#7C5CFF',
        strokeColor: '#7C5CFF',
        fillOpacity: 0.22,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metrics: {}
      }
    };
    commitFeature(newFeature);
    setDrawingPoints([]);
  }, []);

  // Finish line drawing
  const finishLine = useCallback((type: 'measure_line' | 'transect' = 'measure_line', customPoints?: [number, number][]) => {
    const { drawingPoints: points, project: curProj, onCreateFeature: commitFeature } = stateRef.current;
    const pts = customPoints || points;
    if (pts.length < 2) return;

    const isTransect = type === 'transect';
    const newFeature: SiteFeature = {
      type: 'Feature',
      id: `${type}-${Date.now()}`,
      geometry: {
        type: 'LineString',
        coordinates: pts
      },
      properties: {
        id: `${type}-${Date.now()}`,
        name: isTransect
          ? `Site Transect ${curProj.features.filter(f => f.properties.featureType === 'transect').length + 1}`
          : `Measure Line ${curProj.features.filter(f => f.properties.featureType === 'measure_line').length + 1}`,
        featureType: isTransect ? 'transect' : 'measure_line',
        color: isTransect ? '#f59e0b' : '#38bdf8',
        strokeColor: isTransect ? '#fbbf24' : '#0284c7',
        fillOpacity: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metrics: {}
      }
    };
    commitFeature(newFeature);
    setDrawingPoints([]);
  }, []);

  // External complete trigger from consolidated keyboard handler
  useEffect(() => {
    if (completeTrigger === 0) return;
    const { currentTool: tool, drawingPoints: pts } = stateRef.current;
    if (tool === 'polygon' && pts.length >= 3) {
      finishPolygon();
    } else if ((tool === 'line' || tool === 'transect') && pts.length >= 2) {
      finishLine(tool === 'transect' ? 'transect' : 'measure_line');
    }
  }, [completeTrigger, finishPolygon, finishLine]);

  // External cancel trigger from consolidated keyboard handler
  useEffect(() => {
    if (cancelTrigger === 0) return;
    setDrawingPoints([]);
  }, [cancelTrigger]);

  // MapLibre click handler using current state from stateRef
  const handleMapClickCoords = useCallback((lng: number, lat: number) => {
    const { currentTool: tool, drawingPoints: currentPoints, onSelectFeature: deselect, project: curProj, onCreateFeature: commitFeature } = stateRef.current;
    if (tool === 'pan') return;

    const point: [number, number] = [
      Number(lng.toFixed(7)),
      Number(lat.toFixed(7))
    ];

    if (tool === 'select') {
      // Clicking empty canvas deselects active feature
      deselect(null);
      return;
    }

    if (tool === 'polygon') {
      // If user clicked close to the first point (> 2 points), finish polygon
      if (currentPoints.length >= 3) {
        const first = currentPoints[0];
        const distToFirst = calculateGeodesicDistance(point, first).distanceM;
        if (distToFirst < 25) {
          finishPolygon();
          return;
        }
      }
      setDrawingPoints(prev => [...prev, point]);
    } else if (tool === 'line') {
      setDrawingPoints(prev => [...prev, point]);
    } else if (tool === 'transect') {
      if (currentPoints.length === 1) {
        // Transect is committed on second point
        finishLine('transect', [currentPoints[0], point]);
        return;
      }
      setDrawingPoints([point]);
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
          name: `Spot Datum ${curProj.features.filter(f => f.properties.featureType === 'datum_point').length + 1}`,
          featureType: 'datum_point',
          color: '#06b6d4',
          strokeColor: '#22d3ee',
          fillOpacity: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          metrics: {}
        }
      };
      commitFeature(newFeature);
    }
  }, [finishPolygon, finishLine]);

  // Double click handler on map
  const handleMapDoubleClick = useCallback(() => {
    const { currentTool: tool, drawingPoints: currentPoints } = stateRef.current;
    if (tool === 'polygon' && currentPoints.length >= 3) {
      finishPolygon();
    } else if ((tool === 'line' || tool === 'transect') && currentPoints.length >= 2) {
      finishLine(tool === 'transect' ? 'transect' : 'measure_line');
    }
  }, [finishPolygon, finishLine]);

  // Initialize MapLibre ONCE - Preserves map instance across all state updates
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

    const scale = new maplibregl.ScaleControl({ maxWidth: 160, unit: 'metric' });
    map.addControl(scale, 'bottom-left');

    const attrib = new maplibregl.AttributionControl({
      compact: false,
      customAttribution: 'SiteLens WGS84 Geodesic Precision'
    });
    map.addControl(attrib, 'bottom-right');

    map.on('mousemove', (e) => {
      const lng = e.lngLat.lng;
      const lat = e.lngLat.lat;
      stateRef.current.onCursorMove(lng, lat);
      setCursorPos([lng, lat]);
    });

    map.on('click', (e) => {
      handleMapClickCoords(e.lngLat.lng, e.lngLat.lat);
    });

    map.on('dblclick', (e) => {
      e.preventDefault();
      handleMapDoubleClick();
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
  }, [fitBoundsTrigger, project.features]);

  // Vertex Dragging Logic
  const activeFeature = project.features.find(f => f.id === project.activeFeatureId);

  const handleVertexMouseDown = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentTool !== 'select') return;
    stateRef.current.onStartGeometryTransaction?.();
    setDraggingVertexIndex(index);
  };

  const handleVertexDelete = (index: number) => {
    if (!activeFeature) return;
    stateRef.current.onStartGeometryTransaction?.();

    if (activeFeature.geometry.type === 'Polygon') {
      const ring = activeFeature.geometry.coordinates[0];
      const newRing = deleteVertexFromRing(ring, index);
      if (!newRing) return;
      stateRef.current.onUpdateFeatureGeometry(activeFeature.id, [newRing], false);
    } else if (activeFeature.geometry.type === 'LineString') {
      const coords = [...activeFeature.geometry.coordinates];
      if (coords.length <= 2) return;
      coords.splice(index, 1);
      stateRef.current.onUpdateFeatureGeometry(activeFeature.id, coords, false);
    }
  };

  const handleMidpointClick = (insertIndex: number, midpoint: [number, number], e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeFeature) return;
    stateRef.current.onStartGeometryTransaction?.();

    if (activeFeature.geometry.type === 'Polygon') {
      const ring = activeFeature.geometry.coordinates[0];
      const newRing = insertVertexIntoRing(ring, insertIndex, midpoint);
      stateRef.current.onUpdateFeatureGeometry(activeFeature.id, [newRing], false);
    } else if (activeFeature.geometry.type === 'LineString') {
      const coords = [...activeFeature.geometry.coordinates];
      coords.splice(insertIndex + 1, 0, midpoint);
      stateRef.current.onUpdateFeatureGeometry(activeFeature.id, coords, false);
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
        if (draggingVertexIndex === 0 || draggingVertexIndex === ring.length - 1) {
          ring[0] = newCoord;
          ring[ring.length - 1] = newCoord;
        }
        stateRef.current.onUpdateFeatureGeometry(activeFeature.id, [ring], false);
      } else if (activeFeature.geometry.type === 'LineString') {
        const coords = [...activeFeature.geometry.coordinates];
        coords[draggingVertexIndex] = newCoord;
        stateRef.current.onUpdateFeatureGeometry(activeFeature.id, coords, false);
      } else if (activeFeature.geometry.type === 'Point') {
        stateRef.current.onUpdateFeatureGeometry(activeFeature.id, newCoord, false);
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
  }, [draggingVertexIndex, activeFeature]);

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
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
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
                    if (currentTool === 'select') {
                      onSelectFeature(feature.id);
                    }
                  }}
                  className={currentTool === 'select' ? "cursor-pointer transition-all hover:fill-opacity-40" : ""}
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
                    if (currentTool === 'select') {
                      onSelectFeature(feature.id);
                    }
                  }}
                  className={currentTool === 'select' ? "cursor-pointer transition-all hover:stroke-width-4" : ""}
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
                  if (currentTool === 'select') {
                    onSelectFeature(feature.id);
                  }
                }}
                className={currentTool === 'select' ? "cursor-pointer pointer-events-auto" : "pointer-events-auto"}
              >
                <circle r={9} fill={feature.properties.color} fillOpacity={0.3} stroke="#22d3ee" strokeWidth={1.5} />
                <circle r={4} fill="#22d3ee" />
                <circle r={14} fill="none" stroke="#22d3ee" strokeWidth={1} strokeDasharray="2,2" opacity={0.6} />
                {isSelected && (
                  <text y={-16} textAnchor="middle" fill="#67e8f9" fontSize={10} fontFamily="Inter, sans-serif" fontWeight="500">
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
                        <g 
                          key={`vertex-${i}`} 
                          onMouseDown={(e) => handleVertexMouseDown(i, e)} 
                          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); handleVertexDelete(i); }}
                          className="cursor-move group"
                        >
                          <circle cx={pt1.x} cy={pt1.y} r={7} fill="#1e1b4b" stroke="#a78bfa" strokeWidth={2} />
                          <circle cx={pt1.x} cy={pt1.y} r={3} fill="#ffffff" />
                          <text cx={pt1.x + 8} cy={pt1.y - 8} fill="#c4b5fd" fontSize={9} fontFamily="Inter, sans-serif" fontWeight="600">
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
                          <title>Click to insert vertex</title>
                          <circle cx={midX} cy={midY} r={6} fill="#4c1d95" stroke="#c4b5fd" strokeWidth={1} />
                          <text x={midX} y={midY + 3} textAnchor="middle" fill="#ffffff" fontSize={9} fontWeight="bold">
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

            {/* Line vertices & midpoints */}
            {activeFeature.geometry.type === 'LineString' && (
              <>
                {(() => {
                  const coords = activeFeature.geometry.coordinates || [];
                  const elements = [];
                  for (let i = 0; i < coords.length; i++) {
                    const c = coords[i];
                    const pt = projectToPixel(c);
                    if (pt) {
                      elements.push(
                        <g 
                          key={`line-v-${i}`} 
                          onMouseDown={(e) => handleVertexMouseDown(i, e)} 
                          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); handleVertexDelete(i); }}
                          className="cursor-move"
                        >
                          <circle cx={pt.x} cy={pt.y} r={7} fill="#0c4a6e" stroke="#38bdf8" strokeWidth={2} />
                          <circle cx={pt.x} cy={pt.y} r={3} fill="#ffffff" />
                          <text cx={pt.x + 8} cy={pt.y - 8} fill="#7dd3fc" fontSize={9} fontFamily="Inter, sans-serif" fontWeight="600">
                            {i + 1}
                          </text>
                        </g>
                      );
                    }

                    if (i < coords.length - 1) {
                      const next = coords[i + 1];
                      const ptNext = projectToPixel(next);
                      if (pt && ptNext) {
                        const midX = (pt.x + ptNext.x) / 2;
                        const midY = (pt.y + ptNext.y) / 2;
                        const midCoord: [number, number] = [
                          (c[0] + next[0]) / 2,
                          (c[1] + next[1]) / 2
                        ];
                        elements.push(
                          <g
                            key={`line-mid-${i}`}
                            onClick={(e) => handleMidpointClick(i, midCoord, e)}
                            className="cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
                          >
                            <title>Click to insert vertex</title>
                            <circle cx={midX} cy={midY} r={6} fill="#0369a1" stroke="#7dd3fc" strokeWidth={1} />
                            <text x={midX} y={midY + 3} textAnchor="middle" fill="#ffffff" fontSize={9} fontWeight="bold">
                              +
                            </text>
                          </g>
                        );
                      }
                    }
                  }
                  return elements;
                })()}
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
                  {screenPoints.map((pt, idx) => {
                    const isFirst = idx === 0;
                    const canSnapClose = isFirst && currentTool === 'polygon' && drawingPoints.length >= 3;

                    return (
                      <g key={idx} className={canSnapClose ? "pointer-events-auto cursor-pointer" : ""}>
                        {canSnapClose && (
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r={14}
                            fill="none"
                            stroke="#10b981"
                            strokeWidth={2}
                            strokeDasharray="3,3"
                            className="animate-spin"
                          />
                        )}
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isFirst ? 8 : 5}
                          fill={isFirst ? '#10b981' : '#8b5cf6'}
                          stroke="#ffffff"
                          strokeWidth={1.5}
                          onClick={(e) => {
                            if (canSnapClose) {
                              e.stopPropagation();
                              finishPolygon();
                            }
                          }}
                        />
                        {canSnapClose && (
                          <text
                            x={pt.x}
                            y={pt.y - 18}
                            textAnchor="middle"
                            fill="#10B981"
                            fontSize={10}
                            fontFamily="Inter, sans-serif"
                            fontWeight="600"
                          >
                            Click to close
                          </text>
                        )}
                      </g>
                    );
                  })}
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
                    stroke="#7C5CFF"
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
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3.5 py-1.5 rounded shadow-xl flex items-center gap-3 text-xs text-[var(--text-primary)] z-20 transition-colors">
          <div className="flex items-center gap-1.5 text-emerald-500 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Points: {drawingPoints.length}</span>
          </div>

          {rubberbandStats && (
            <div className="flex items-center gap-2 border-l border-[var(--border-subtle)] pl-3 text-[var(--text-secondary)] tabular-nums">
              <span>
                Length:{' '}
                <strong className="text-[var(--text-primary)]">
                  {rubberbandStats.distanceM >= 1000
                    ? `${(rubberbandStats.distanceM / 1000).toFixed(2)} km`
                    : `${rubberbandStats.distanceM.toFixed(1)} m`}
                </strong>
              </span>
              <span>·</span>
              <span>
                Bearing:{' '}
                <strong className="text-[#7C5CFF]">{rubberbandStats.azimuthDeg.toFixed(1)}°</strong>
              </span>
            </div>
          )}

          <div className="border-l border-[var(--border-subtle)] pl-3 text-[11px] text-[var(--text-muted)]">
            {currentTool === 'polygon'
              ? (drawingPoints.length >= 3 ? 'Click start point, double-click, or press Enter' : 'Click map to place boundary vertices')
              : currentTool === 'transect'
              ? 'Click second point to finish transect line'
              : 'Double-click or press Enter to finish polyline'}
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-1.5 border-l border-[var(--border-subtle)] pl-3">
            {((currentTool === 'polygon' && drawingPoints.length >= 3) ||
              ((currentTool === 'line' || currentTool === 'transect') && drawingPoints.length >= 2)) && (
              <button
                onClick={() => {
                  if (currentTool === 'polygon') finishPolygon();
                  else finishLine(currentTool === 'transect' ? 'transect' : 'measure_line');
                }}
                className="px-2.5 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-semibold flex items-center gap-1 transition-colors"
              >
                <Check className="w-3 h-3" />
                <span>Finish</span>
              </button>
            )}

            <button
              onClick={() => setDrawingPoints([])}
              className="px-2.5 py-0.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/30 rounded text-[10px] font-semibold flex items-center gap-1 transition-colors"
            >
              <X className="w-3 h-3" />
              <span>Cancel</span>
            </button>
          </div>
        </div>
      )}

      {/* Map Control Buttons: Reset Bearing / North */}
      <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-20">
        <button
          onClick={() => {
            if (mapRef.current) {
              mapRef.current.resetNorthPitch({ duration: 600 });
            }
          }}
          title="Reset North & Pitch"
          aria-label="Reset North and Pitch"
          className="w-8 h-8 rounded bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] flex items-center justify-center text-[#7C5CFF] shadow-sm transition-colors"
        >
          <Compass className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

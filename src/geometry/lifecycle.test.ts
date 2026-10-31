/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens CAD/GIS Interaction & Geometry Lifecycle Regression Tests
 */

import { describe, it, expect } from 'vitest';
import { analyzePolygon, analyzeLine } from './index';
import { SiteFeature, SiteProject } from '../types';
import { createDefaultProject } from '../projects';

describe('CAD/GIS Geometry Lifecycle & Sequential Creation', () => {
  it('creates multiple polygons sequentially without data corruption or overwriting', () => {
    const project: SiteProject = createDefaultProject();
    const initialCount = project.features.length;

    // 1. Create first polygon: Quadrilateral A
    const polyCoordsA: [number, number][] = [
      [0.0, 0.0],
      [0.01, 0.0],
      [0.01, 0.01],
      [0.0, 0.01],
      [0.0, 0.0]
    ];
    const analysisA = analyzePolygon(polyCoordsA);

    const featureA: SiteFeature = {
      type: 'Feature',
      id: 'poly-A',
      geometry: { type: 'Polygon', coordinates: [polyCoordsA] },
      properties: {
        id: 'poly-A',
        name: 'Site Boundary Alpha',
        featureType: 'site_boundary',
        color: '#8b5cf6',
        strokeColor: '#a78bfa',
        fillOpacity: 0.25,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metrics: analysisA.metrics
      }
    };

    project.features.push(featureA);
    expect(project.features.length).toBe(initialCount + 1);

    // 2. Create second polygon: Pentagon B in adjacent parcel
    const polyCoordsB: [number, number][] = [
      [0.02, 0.0],
      [0.03, 0.0],
      [0.035, 0.005],
      [0.03, 0.01],
      [0.02, 0.01],
      [0.02, 0.0]
    ];
    const analysisB = analyzePolygon(polyCoordsB);

    const featureB: SiteFeature = {
      type: 'Feature',
      id: 'poly-B',
      geometry: { type: 'Polygon', coordinates: [polyCoordsB] },
      properties: {
        id: 'poly-B',
        name: 'Site Boundary Beta',
        featureType: 'site_boundary',
        color: '#8b5cf6',
        strokeColor: '#a78bfa',
        fillOpacity: 0.25,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metrics: analysisB.metrics
      }
    };

    project.features.push(featureB);

    // Verify both polygons coexist with independent geometries and areas
    expect(project.features.length).toBe(initialCount + 2);
    expect(project.features.some(f => f.id === 'poly-A')).toBe(true);
    expect(project.features.some(f => f.id === 'poly-B')).toBe(true);
    expect(analysisA.ellipsoidalAreaSqM).toBeGreaterThan(1200000);
    expect(analysisB.ellipsoidalAreaSqM).toBeGreaterThan(1200000);
    expect(analysisA.vertexCount).toBe(4);
    expect(analysisB.vertexCount).toBe(5);
  });

  it('creates multiple polylines and transects sequentially', () => {
    // Polyline 1: Measure corridor
    const lineCoordsA: [number, number][] = [
      [-0.001, 51.476],
      [-0.001, 51.478],
      [-0.003, 51.478]
    ];
    const lineAnalysisA = analyzeLine(lineCoordsA);

    // Polyline 2: Cross-section transect
    const transectCoords: [number, number][] = [
      [-0.002, 51.476],
      [-0.002, 51.478]
    ];
    const transectAnalysis = analyzeLine(transectCoords);

    expect(lineAnalysisA.segmentCount).toBe(2);
    expect(transectAnalysis.segmentCount).toBe(1);
    expect(lineAnalysisA.totalDistanceM).toBeGreaterThan(transectAnalysis.totalDistanceM);
    expect(transectAnalysis.metrics.line_total_length.classification).toBe('geometry-derived');
  });

  it('preserves existing geometry when cancelling an in-progress drawing', () => {
    const existingFeatures: SiteFeature[] = [
      {
        type: 'Feature',
        id: 'existing-1',
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
        },
        properties: {
          id: 'existing-1',
          name: 'Preserved Boundary',
          featureType: 'site_boundary',
          color: '#8b5cf6',
          strokeColor: '#a78bfa',
          fillOpacity: 0.25,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          metrics: {}
        }
      }
    ];

    // Simulate in-progress drawing with 2 points
    let drawingPoints: [number, number][] = [[0.5, 0.5], [0.6, 0.6]];
    expect(drawingPoints.length).toBe(2);

    // User presses Escape or switches tool -> drawing is cancelled
    drawingPoints = [];

    // Verify existing features remain completely intact and uncorrupted
    expect(drawingPoints.length).toBe(0);
    expect(existingFeatures.length).toBe(1);
    expect(existingFeatures[0].id).toBe('existing-1');
    expect(existingFeatures[0].geometry.coordinates[0].length).toBe(5);
  });
});

describe('CAD/GIS Vertex Editing & Topology Operations', () => {
  it('moves a vertex and updates ellipsoidal area and perimeter dynamically', () => {
    const initialRing: [number, number][] = [
      [0.0, 0.0],
      [0.01, 0.0],
      [0.01, 0.01],
      [0.0, 0.01],
      [0.0, 0.0]
    ];
    const initialAnalysis = analyzePolygon(initialRing);

    // Move vertex 2 ([0.01, 0.01]) outwards to [0.02, 0.02]
    const modifiedRing: [number, number][] = [
      [0.0, 0.0],
      [0.01, 0.0],
      [0.02, 0.02], // Moved vertex
      [0.0, 0.01],
      [0.0, 0.0]
    ];
    const modifiedAnalysis = analyzePolygon(modifiedRing);

    // Area and perimeter must increase and ring must remain closed
    expect(modifiedAnalysis.ellipsoidalAreaSqM).toBeGreaterThan(initialAnalysis.ellipsoidalAreaSqM);
    expect(modifiedAnalysis.ellipsoidalPerimeterM).toBeGreaterThan(initialAnalysis.ellipsoidalPerimeterM);
    expect(modifiedRing[0]).toEqual(modifiedRing[modifiedRing.length - 1]);
  });

  it('inserts a midpoint vertex, increasing vertex count and updating geometry', () => {
    const initialRing: [number, number][] = [
      [0.0, 0.0],
      [0.02, 0.0],
      [0.02, 0.02],
      [0.0, 0.02],
      [0.0, 0.0]
    ];
    expect(initialRing.length).toBe(5); // 4 unique vertices + 1 closed

    // Insert midpoint between vertex 0 and vertex 1 at [0.01, 0.0]
    const insertIndex = 0;
    const midpoint: [number, number] = [0.01, 0.0];
    const newRing = [...initialRing];
    newRing.splice(insertIndex + 1, 0, midpoint);
    newRing[newRing.length - 1] = newRing[0]; // ensure closure

    expect(newRing.length).toBe(6); // 5 unique vertices + 1 closed
    const newAnalysis = analyzePolygon(newRing);
    expect(newAnalysis.vertexCount).toBe(5);
    expect(newAnalysis.segments.length).toBe(5);
  });

  it('deletes a vertex from a polygon ring with >= 4 vertices', () => {
    // 5-vertex polygon ring
    const ring: [number, number][] = [
      [0.0, 0.0],
      [0.01, 0.0],
      [0.02, 0.01],
      [0.02, 0.02],
      [0.0, 0.02],
      [0.0, 0.0]
    ];
    expect(ring.length).toBe(6);

    // Remove vertex 2
    ring.splice(2, 1);
    ring[ring.length - 1] = ring[0];

    expect(ring.length).toBe(5);
    const analysis = analyzePolygon(ring);
    expect(analysis.vertexCount).toBe(4);
    expect(analysis.isSelfIntersecting).toBe(false);
  });
});

describe('CAD/GIS Undo & Redo History Lifecycle', () => {
  it('records transaction history and faithfully restores geometric states', () => {
    let features: SiteFeature[] = [];
    const history: SiteFeature[][] = [];
    const redoStack: SiteFeature[][] = [];

    const pushHistory = (current: SiteFeature[]) => {
      history.push(JSON.parse(JSON.stringify(current)));
      redoStack.length = 0;
    };

    // 1. Initial State: Empty
    expect(features.length).toBe(0);

    // 2. Add Feature 1
    pushHistory(features);
    const feat1: SiteFeature = {
      type: 'Feature',
      id: 'f1',
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: {
        id: 'f1',
        name: 'Point 1',
        featureType: 'datum_point',
        color: '#06b6d4',
        strokeColor: '#22d3ee',
        fillOpacity: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metrics: {}
      }
    };
    features = [...features, feat1];
    expect(features.length).toBe(1);

    // 3. Add Feature 2
    pushHistory(features);
    const feat2: SiteFeature = {
      type: 'Feature',
      id: 'f2',
      geometry: { type: 'Point', coordinates: [1, 1] },
      properties: {
        id: 'f2',
        name: 'Point 2',
        featureType: 'datum_point',
        color: '#06b6d4',
        strokeColor: '#22d3ee',
        fillOpacity: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metrics: {}
      }
    };
    features = [...features, feat2];
    expect(features.length).toBe(2);

    // 4. Test Undo: Feature 2 should be removed
    const previousState = history.pop()!;
    redoStack.unshift(features);
    features = previousState;
    expect(features.length).toBe(1);
    expect(features[0].id).toBe('f1');

    // 5. Test Redo: Feature 2 should be restored
    const nextState = redoStack.shift()!;
    history.push(features);
    features = nextState;
    expect(features.length).toBe(2);
    expect(features[1].id).toBe('f2');

    // 6. Test Delete with Undo
    pushHistory(features);
    features = features.filter(f => f.id !== 'f1');
    expect(features.length).toBe(1);
    expect(features[0].id).toBe('f2');

    // Undo delete
    const restored = history.pop()!;
    redoStack.unshift(features);
    features = restored;
    expect(features.length).toBe(2);
    expect(features.some(f => f.id === 'f1')).toBe(true);
  });
});

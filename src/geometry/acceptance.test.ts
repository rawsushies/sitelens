/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Comprehensive Acceptance Test & State Transition Suite
 *
 * ACCEPTANCE TEST:
 * Load an existing project, create polygon A, create polygon B, create polyline C,
 * delete polygon A, undo deletion, move a vertex in polygon B, undo, redo, save and reload.
 * Verify that every feature and its geometry remain correct throughout.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SiteProject, SiteFeature } from '../types';
import { createDefaultProject, exportToGeoJSON } from '../projects';
import { HistoryManager } from '../projects/history';
import { analyzePolygon, analyzeLine } from './index';

describe('SiteLens Acceptance Test & Engineering State Transitions', () => {
  let project: SiteProject;
  let historyManager: HistoryManager;

  beforeEach(() => {
    project = createDefaultProject();
    historyManager = new HistoryManager(30);
  });

  it('passes the complete acceptance test sequence without state corruption', () => {
    // Step 1: Load existing project
    expect(project.id).toBeDefined();
    expect(project.features.length).toBe(1);
    const initialFeatureId = project.features[0].id;
    const initialArea = analyzePolygon(project.features[0].geometry.coordinates[0]).ellipsoidalAreaSqM;
    expect(initialArea).toBeGreaterThan(1000);

    // Step 2: Create Polygon A
    historyManager.push({ features: project.features, activeFeatureId: project.activeFeatureId });
    const polyACoords: [number, number][] = [
      [-0.002, 51.476],
      [-0.001, 51.476],
      [-0.001, 51.477],
      [-0.002, 51.477],
      [-0.002, 51.476]
    ];
    const polyAAnalysis = analyzePolygon(polyACoords);
    const featureA: SiteFeature = {
      type: 'Feature',
      id: 'feature-poly-A',
      geometry: { type: 'Polygon', coordinates: [polyACoords] },
      properties: {
        id: 'feature-poly-A',
        name: 'Site Boundary Alpha',
        featureType: 'site_boundary',
        color: '#8b5cf6',
        strokeColor: '#a78bfa',
        fillOpacity: 0.25,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metrics: polyAAnalysis.metrics
      }
    };
    project.features = [...project.features, featureA];
    project.activeFeatureId = featureA.id;

    expect(project.features.length).toBe(2);
    expect(project.features.some(f => f.id === 'feature-poly-A')).toBe(true);
    expect(polyAAnalysis.ellipsoidalAreaSqM).toBeGreaterThan(5000);
    expect(polyAAnalysis.vertexCount).toBe(4);

    // Step 3: Create Polygon B
    historyManager.push({ features: project.features, activeFeatureId: project.activeFeatureId });
    const polyBCoords: [number, number][] = [
      [-0.004, 51.476],
      [-0.003, 51.476],
      [-0.003, 51.477],
      [-0.004, 51.477],
      [-0.004, 51.476]
    ];
    const polyBAnalysis = analyzePolygon(polyBCoords);
    const featureB: SiteFeature = {
      type: 'Feature',
      id: 'feature-poly-B',
      geometry: { type: 'Polygon', coordinates: [polyBCoords] },
      properties: {
        id: 'feature-poly-B',
        name: 'Site Boundary Beta',
        featureType: 'site_boundary',
        color: '#8b5cf6',
        strokeColor: '#a78bfa',
        fillOpacity: 0.25,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metrics: polyBAnalysis.metrics
      }
    };
    project.features = [...project.features, featureB];
    project.activeFeatureId = featureB.id;

    // Both Polygon A and Polygon B must exist simultaneously
    expect(project.features.length).toBe(3);
    expect(project.features.some(f => f.id === 'feature-poly-A')).toBe(true);
    expect(project.features.some(f => f.id === 'feature-poly-B')).toBe(true);

    // Step 4: Create Polyline C
    historyManager.push({ features: project.features, activeFeatureId: project.activeFeatureId });
    const lineCCoords: [number, number][] = [
      [-0.005, 51.475],
      [-0.005, 51.476],
      [-0.006, 51.476]
    ];
    const lineCAnalysis = analyzeLine(lineCCoords);
    const featureC: SiteFeature = {
      type: 'Feature',
      id: 'feature-line-C',
      geometry: { type: 'LineString', coordinates: lineCCoords },
      properties: {
        id: 'feature-line-C',
        name: 'Access Corridor C',
        featureType: 'measure_line',
        color: '#38bdf8',
        strokeColor: '#0284c7',
        fillOpacity: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metrics: lineCAnalysis.metrics
      }
    };
    project.features = [...project.features, featureC];
    project.activeFeatureId = featureC.id;

    // All three features must coexist
    expect(project.features.length).toBe(4);
    expect(project.features.some(f => f.id === 'feature-poly-A')).toBe(true);
    expect(project.features.some(f => f.id === 'feature-poly-B')).toBe(true);
    expect(project.features.some(f => f.id === 'feature-line-C')).toBe(true);
    expect(lineCAnalysis.segmentCount).toBe(2);
    expect(lineCAnalysis.totalDistanceM).toBeGreaterThan(50);

    // Step 5: Delete Polygon A
    historyManager.push({ features: project.features, activeFeatureId: project.activeFeatureId });
    project.features = project.features.filter(f => f.id !== 'feature-poly-A');
    project.activeFeatureId = null;

    expect(project.features.length).toBe(3);
    expect(project.features.some(f => f.id === 'feature-poly-A')).toBe(false);
    expect(project.features.some(f => f.id === 'feature-poly-B')).toBe(true);
    expect(project.features.some(f => f.id === 'feature-line-C')).toBe(true);

    // Step 6: Undo Deletion of Polygon A
    const restoredAfterDelete = historyManager.undo({
      features: project.features,
      activeFeatureId: project.activeFeatureId,
    });
    expect(restoredAfterDelete).not.toBeNull();
    project.features = restoredAfterDelete!.features;
    project.activeFeatureId = restoredAfterDelete!.activeFeatureId;

    // Polygon A is fully restored with exact coordinates
    expect(project.features.length).toBe(4);
    const restoredA = project.features.find(f => f.id === 'feature-poly-A');
    expect(restoredA).toBeDefined();
    expect(restoredA?.geometry.coordinates).toEqual([polyACoords]);

    // Step 7: Move a vertex in Polygon B
    historyManager.push({ features: project.features, activeFeatureId: project.activeFeatureId });
    const polyB = project.features.find(f => f.id === 'feature-poly-B')!;
    const originalBVertices = JSON.parse(JSON.stringify(polyB.geometry.coordinates[0]));

    // Move vertex 1 from [-0.003, 51.476] to [-0.0025, 51.4755]
    const updatedBRing: [number, number][] = [...originalBVertices];
    updatedBRing[1] = [-0.0025, 51.4755];
    const newBAnalysis = analyzePolygon(updatedBRing);

    project.features = project.features.map(f => {
      if (f.id === 'feature-poly-B') {
        return {
          ...f,
          geometry: { type: 'Polygon', coordinates: [updatedBRing] },
          properties: { ...f.properties, metrics: newBAnalysis.metrics, updatedAt: Date.now() }
        };
      }
      return f;
    });

    const bAfterMove = project.features.find(f => f.id === 'feature-poly-B')!;
    expect(bAfterMove.geometry.coordinates[0][1]).toEqual([-0.0025, 51.4755]);
    expect(newBAnalysis.ellipsoidalAreaSqM).not.toBe(polyBAnalysis.ellipsoidalAreaSqM);

    // Step 8: Undo vertex move in Polygon B
    const restoredAfterMove = historyManager.undo({
      features: project.features,
      activeFeatureId: project.activeFeatureId,
    });
    expect(restoredAfterMove).not.toBeNull();
    project.features = restoredAfterMove!.features;

    const bAfterUndo = project.features.find(f => f.id === 'feature-poly-B')!;
    expect(bAfterUndo.geometry.coordinates[0]).toEqual(originalBVertices);

    // Step 9: Redo vertex move in Polygon B
    const redoneAfterMove = historyManager.redo({
      features: project.features,
      activeFeatureId: project.activeFeatureId,
    });
    expect(redoneAfterMove).not.toBeNull();
    project.features = redoneAfterMove!.features;

    const bAfterRedo = project.features.find(f => f.id === 'feature-poly-B')!;
    expect(bAfterRedo.geometry.coordinates[0][1]).toEqual([-0.0025, 51.4755]);

    // Step 10: Save and reload project
    const serializedGeoJSON = exportToGeoJSON(project);
    expect(serializedGeoJSON).toContain('Site Boundary Alpha');
    expect(serializedGeoJSON).toContain('Site Boundary Beta');
    expect(serializedGeoJSON).toContain('Access Corridor C');

    // Deserialization check: simulated reload
    const parsed = JSON.parse(serializedGeoJSON);
    expect(parsed.type).toBe('FeatureCollection');
    expect(parsed.features.length).toBe(4);

    const reloadedA = parsed.features.find((f: any) => f.id === 'feature-poly-A');
    const reloadedB = parsed.features.find((f: any) => f.id === 'feature-poly-B');
    const reloadedC = parsed.features.find((f: any) => f.id === 'feature-line-C');

    expect(reloadedA).toBeDefined();
    expect(reloadedB).toBeDefined();
    expect(reloadedC).toBeDefined();
    expect(reloadedA.geometry.coordinates).toEqual([polyACoords]);
    expect(reloadedB.geometry.coordinates[0][1]).toEqual([-0.0025, 51.4755]);
    expect(reloadedC.geometry.coordinates).toEqual(lineCCoords);
  });
});

describe('History Engine No-Op Prevention & Deep Immutability', () => {
  it('prevents no-op operations from polluting the history stack', () => {
    const manager = new HistoryManager();
    const feat: SiteFeature = {
      type: 'Feature',
      id: 'f1',
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: {
        id: 'f1',
        name: 'Point',
        featureType: 'datum_point',
        color: '#06b6d4',
        strokeColor: '#22d3ee',
        fillOpacity: 1,
        createdAt: 100,
        updatedAt: 100,
        metrics: {}
      }
    };

    // First push succeeds
    const push1 = manager.push({ features: [feat], activeFeatureId: 'f1' });
    expect(push1).toBe(true);
    expect(manager.getUndoCount()).toBe(1);

    // Second push with identical features is rejected (no-op prevented)
    const push2 = manager.push({ features: [feat], activeFeatureId: 'f1' });
    expect(push2).toBe(false);
    expect(manager.getUndoCount()).toBe(1);

    // Push with modified feature succeeds
    const modifiedFeat = { ...feat, geometry: { type: 'Point' as const, coordinates: [1, 1] } };
    const push3 = manager.push({ features: [modifiedFeat], activeFeatureId: 'f1' });
    expect(push3).toBe(true);
    expect(manager.getUndoCount()).toBe(2);
  });

  it('maintains deep immutability so in-memory mutations do not corrupt history snapshots', () => {
    const manager = new HistoryManager();
    const poly: SiteFeature = {
      type: 'Feature',
      id: 'poly-1',
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
      },
      properties: {
        id: 'poly-1',
        name: 'Polygon',
        featureType: 'site_boundary',
        color: '#8b5cf6',
        strokeColor: '#a78bfa',
        fillOpacity: 0.25,
        createdAt: 100,
        updatedAt: 100,
        metrics: {}
      }
    };

    manager.push({ features: [poly], activeFeatureId: 'poly-1' });

    // Mutate the object in place
    poly.geometry.coordinates[0][0] = [999, 999];

    // Undo should restore the snapshot before the mutation occurred
    const restored = manager.undo({ features: [poly], activeFeatureId: 'poly-1' });
    expect(restored?.features[0].geometry.coordinates[0][0]).toEqual([0, 0]);
  });
});

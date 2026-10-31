/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Project Management & Persistence
 */

import { SiteProject, SiteFeature, ProvenancedMetric } from '../types';

const DB_NAME = 'sitelens_db';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const ACTIVE_PROJECT_KEY = 'sitelens_active_project_id';

/**
 * Initializes and returns the IndexedDB database instance
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not supported in this environment'));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db: IDBDatabase = event.target.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Creates an empty default project initialized at Greenwich Meridian / London
 */
export function createDefaultProject(): SiteProject {
  const id = `project-${Date.now()}`;
  return {
    id,
    name: 'Royal Observatory Greenwich Site',
    description: 'Initial architectural site intelligence baseline study at the Prime Meridian.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    center: [-0.0015, 51.4769], // Greenwich [lng, lat]
    zoom: 16.5,
    features: [
      {
        type: 'Feature',
        id: 'feat-default-boundary',
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-0.0028, 51.4776],
            [-0.0004, 51.4777],
            [-0.0003, 51.4763],
            [-0.0027, 51.4762],
            [-0.0028, 51.4776]
          ]]
        },
        properties: {
          id: 'feat-default-boundary',
          name: 'Site Boundary Alpha',
          featureType: 'site_boundary',
          color: '#8b5cf6',
          strokeColor: '#a78bfa',
          fillOpacity: 0.25,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          metrics: {},
        }
      }
    ],
    activeFeatureId: 'feat-default-boundary',
    basemap: 'liberty',
    metadata: {
      client: 'Greenwich Heritage Trust',
      siteLocationName: 'Greenwich Park, London SE10 8QY, UK',
      targetProgram: 'Observatory Visitor Pavilion & Landscape Preservation',
      version: '1.0.0',
    }
  };
}

/**
 * Loads all saved projects from IndexedDB
 */
export async function loadAllProjects(): Promise<SiteProject[]> {
  try {
    const db = await openDB();
    const idbProjects = await new Promise<SiteProject[]>((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      const store = tx.objectStore(STORE_PROJECTS);
      const req = store.getAll();

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    if (idbProjects && idbProjects.length > 0) {
      return idbProjects;
    }
  } catch (err) {
    console.warn('IndexedDB loadAllProjects error, checking fallback:', err);
  }

  // Resilient fallback to localStorage backup
  try {
    const raw = localStorage.getItem('sitelens_projects_backup');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (lsErr) {
    console.error('localStorage fallback load error:', lsErr);
  }

  return [];
}

/**
 * Saves or updates a project in IndexedDB and localStorage mirror
 */
export async function saveProject(project: SiteProject): Promise<void> {
  const updatedProject: SiteProject = {
    ...project,
    updatedAt: new Date().toISOString(),
  };

  // Always mirror to localStorage as resilient fallback
  try {
    const raw = localStorage.getItem('sitelens_projects_backup');
    const backupList: SiteProject[] = raw ? JSON.parse(raw) : [];
    const idx = backupList.findIndex(p => p.id === updatedProject.id);
    if (idx >= 0) {
      backupList[idx] = updatedProject;
    } else {
      backupList.push(updatedProject);
    }
    localStorage.setItem('sitelens_projects_backup', JSON.stringify(backupList));
    localStorage.setItem(ACTIVE_PROJECT_KEY, updatedProject.id);
  } catch (lsErr) {
    console.warn('localStorage backup warning:', lsErr);
  }

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readwrite');
      const store = tx.objectStore(STORE_PROJECTS);
      const req = store.put(updatedProject);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB saveProject error (persisted via localStorage fallback):', err);
  }
}

/**
 * Deletes a project from IndexedDB and localStorage mirror
 */
export async function deleteProject(projectId: string): Promise<void> {
  // Update localStorage mirror
  try {
    const raw = localStorage.getItem('sitelens_projects_backup');
    if (raw) {
      const backupList: SiteProject[] = JSON.parse(raw);
      const filtered = backupList.filter(p => p.id !== projectId);
      localStorage.setItem('sitelens_projects_backup', JSON.stringify(filtered));
    }
    if (localStorage.getItem(ACTIVE_PROJECT_KEY) === projectId) {
      localStorage.removeItem(ACTIVE_PROJECT_KEY);
    }
  } catch (lsErr) {
    console.warn('localStorage delete warning:', lsErr);
  }

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readwrite');
      const store = tx.objectStore(STORE_PROJECTS);
      const req = store.delete(projectId);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('IndexedDB deleteProject error:', err);
  }
}

/**
 * Gets the active project ID stored in localStorage
 */
export function getStoredActiveProjectId(): string | null {
  return localStorage.getItem(ACTIVE_PROJECT_KEY);
}

/**
 * Exports project as GeoJSON FeatureCollection
 */
export function exportToGeoJSON(project: SiteProject): string {
  const featureCollection = {
    type: 'FeatureCollection',
    name: project.name,
    crs: {
      type: 'name',
      properties: {
        name: 'urn:ogc:def:crs:OGC:1.3:CRS84'
      }
    },
    metadata: {
      projectId: project.id,
      description: project.description,
      exportedAt: new Date().toISOString(),
      siteLocation: project.metadata.siteLocationName,
      provenanceStandard: 'SiteLens Geospatial Precision Specification v1',
      authoritativeEllipsoid: 'WGS84 (EPSG:4326)'
    },
    features: project.features.map(f => ({
      type: 'Feature',
      id: f.id,
      geometry: f.geometry,
      properties: {
        id: f.id,
        name: f.properties.name,
        featureType: f.properties.featureType,
        createdAt: new Date(f.properties.createdAt).toISOString(),
        updatedAt: new Date(f.properties.updatedAt).toISOString(),
        notes: f.properties.notes || '',
        metrics: Object.values(f.properties.metrics || {}).map(m => ({
          metric_id: m.id,
          name: m.name,
          label: m.label,
          value: m.value,
          unit: m.unit,
          classification: m.classification,
          source: m.source,
          calculation_method: m.calculationMethod,
          spatial_resolution: m.spatialResolution,
          timestamp_or_reference_period: m.timestampOrReferencePeriod,
          limitations: m.limitations,
          warning: m.warning || null
        }))
      }
    }))
  };

  return JSON.stringify(featureCollection, null, 2);
}

/**
 * Exports project analytical metrics and coordinates to comprehensive CSV format
 */
export function exportToCSV(project: SiteProject): string {
  const rows: string[] = [];

  // Header 1: Metadata block
  rows.push('# SITELENS GEOSPATIAL INTELLIGENCE REPORT');
  rows.push(`# Project Name: "${project.name.replace(/"/g, '""')}"`);
  rows.push(`# Project ID: ${project.id}`);
  rows.push(`# Export Timestamp: ${new Date().toISOString()}`);
  rows.push(`# Authoritative Geodetic Datum: WGS84 Ellipsoid (EPSG:4326)`);
  rows.push(`# Notes: Ellipsoidal measurements computed via GeographicLib (Karney 2013).`);
  rows.push('');

  // Table 1: Feature Inventory & Metrics
  rows.push('FEATURE INVENTORY & ANALYTICAL METRICS');
  rows.push([
    'Feature ID',
    'Feature Name',
    'Feature Type',
    'Metric ID',
    'Metric Name',
    'Value',
    'Unit',
    'Classification',
    'Source',
    'Calculation Method',
    'Spatial Resolution',
    'Reference Period',
    'Limitations & Warnings'
  ].map(c => `"${c}"`).join(','));

  for (const feat of project.features) {
    const metrics = Object.values(feat.properties.metrics || {});
    if (metrics.length === 0) {
      rows.push([
        feat.id,
        feat.properties.name,
        feat.properties.featureType,
        'N/A',
        'No metrics computed',
        '',
        '',
        'unavailable',
        'SiteLens',
        'Uncalculated',
        '',
        '',
        ''
      ].map(c => `"${String(c).replace(/"/g, '""')}"`).join(','));
    } else {
      for (const m of metrics) {
        rows.push([
          feat.id,
          feat.properties.name,
          feat.properties.featureType,
          m.id,
          m.label,
          m.value !== null && m.value !== undefined ? String(m.value) : '',
          m.unit,
          m.classification,
          m.source,
          m.calculationMethod,
          m.spatialResolution,
          m.timestampOrReferencePeriod,
          m.warning ? `[WARNING: ${m.warning}] ${m.limitations}` : m.limitations
        ].map(c => `"${String(c).replace(/"/g, '""')}"`).join(','));
      }
    }
  }

  rows.push('');
  // Table 2: Vertex Coordinate Registry
  rows.push('VERTEX COORDINATE REGISTRY');
  rows.push([
    'Feature ID',
    'Feature Name',
    'Vertex Index',
    'Longitude (DD)',
    'Latitude (DD)',
    'DMS Latitude',
    'DMS Longitude',
    'UTM Coordinate String'
  ].map(c => `"${c}"`).join(','));

  for (const feat of project.features) {
    let coords: [number, number][] = [];
    if (feat.geometry.type === 'Polygon' && feat.geometry.coordinates[0]) {
      coords = feat.geometry.coordinates[0];
    } else if (feat.geometry.type === 'LineString') {
      coords = feat.geometry.coordinates;
    } else if (feat.geometry.type === 'Point') {
      coords = [feat.geometry.coordinates];
    }

    coords.forEach((c, idx) => {
      rows.push([
        feat.id,
        feat.properties.name,
        idx + 1,
        c[0].toFixed(8),
        c[1].toFixed(8),
        '',
        '',
        ''
      ].map(col => `"${String(col).replace(/"/g, '""')}"`).join(','));
    });
  }

  return rows.join('\r\n');
}

/**
 * Triggers file download in browser
 */
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

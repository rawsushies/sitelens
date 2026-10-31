/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens - Geospatial Site Intelligence Workstation
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  SiteProject, 
  SiteFeature, 
  BasemapId, 
  PolygonAnalysis, 
  LineAnalysis, 
  CoordinateReport, 
  SolarAnalysis, 
  ClimateContextData, 
  UrbanContextSummary 
} from './types';
import { 
  createDefaultProject, 
  loadAllProjects, 
  saveProject, 
  deleteProject, 
  getStoredActiveProjectId,
  exportToGeoJSON,
  exportToCSV,
  downloadFile
} from './projects';
import { analyzePolygon, analyzeLine } from './geometry';
import { inspectCoordinates } from './coordinates';
import { calculateSolarAnalysis } from './solar';
import { fetchClimateContext } from './climate';
import { fetchUrbanContext } from './urban-analysis';
import { generateSiteIntelligenceReport, reportToMarkdown } from './reporting';

import { TopBar } from './components/TopBar';
import { ToolBar, ToolMode } from './components/ToolBar';
import { MapCanvas } from './components/MapCanvas';
import { InspectorPanel } from './components/InspectorPanel';
import { BottomBar } from './components/BottomBar';
import { ProjectModal } from './components/ProjectModal';
import { ReportModal } from './components/ReportModal';

export default function App() {
  const [projects, setProjects] = useState<SiteProject[]>([]);
  const [project, setProject] = useState<SiteProject>(createDefaultProject());
  const [currentTool, setCurrentTool] = useState<ToolMode>('select');
  const [cursorCoords, setCursorCoords] = useState<[number, number] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [flyToTarget, setFlyToTarget] = useState<{ lng: number; lat: number; zoom?: number } | null>(null);
  const [fitBoundsTrigger, setFitBoundsTrigger] = useState(0);

  // Undo / Redo History
  const [history, setHistory] = useState<SiteFeature[][]>([]);
  const [redoStack, setRedoStack] = useState<SiteFeature[][]>([]);

  // Analytical Context States
  const [solarAnalysis, setSolarAnalysis] = useState<SolarAnalysis | null>(null);
  const [climateData, setClimateData] = useState<ClimateContextData | null>(null);
  const [urbanContext, setUrbanContext] = useState<UrbanContextSummary | null>(null);
  const [isLoadingClimate, setIsLoadingClimate] = useState(false);
  const [isLoadingUrban, setIsLoadingUrban] = useState(false);

  // Initialize projects from IndexedDB on startup
  useEffect(() => {
    async function init() {
      try {
        const savedProjects = await loadAllProjects();
        if (savedProjects.length > 0) {
          setProjects(savedProjects);
          const activeId = getStoredActiveProjectId();
          const found = savedProjects.find(p => p.id === activeId) || savedProjects[0];
          setProject(found);
        } else {
          const defaultProj = createDefaultProject();
          await saveProject(defaultProj);
          setProjects([defaultProj]);
          setProject(defaultProj);
        }
      } catch (err) {
        console.error('Initialization error:', err);
      }
    }
    init();
  }, []);

  // Compute active feature analyses
  const activeFeature = project.features.find(f => f.id === project.activeFeatureId) || null;

  let polygonAnalysis: PolygonAnalysis | null = null;
  let lineAnalysis: LineAnalysis | null = null;
  let pointReport: CoordinateReport | null = null;

  if (activeFeature) {
    if (activeFeature.geometry.type === 'Polygon' && activeFeature.geometry.coordinates[0]?.length >= 3) {
      try {
        polygonAnalysis = analyzePolygon(activeFeature.geometry.coordinates[0]);
      } catch (e) {
        console.warn('Polygon analysis warning:', e);
      }
    } else if (activeFeature.geometry.type === 'LineString' && activeFeature.geometry.coordinates?.length >= 2) {
      try {
        lineAnalysis = analyzeLine(activeFeature.geometry.coordinates);
      } catch (e) {
        console.warn('Line analysis warning:', e);
      }
    } else if (activeFeature.geometry.type === 'Point' && activeFeature.geometry.coordinates) {
      pointReport = inspectCoordinates(
        activeFeature.geometry.coordinates[0],
        activeFeature.geometry.coordinates[1]
      );
    }
  }

  // Update Solar and Environmental context when site centroid or project center changes
  const targetLocation: [number, number] = polygonAnalysis
    ? polygonAnalysis.centroid
    : project.center;

  useEffect(() => {
    // 1. Solar Astronomical calculation (instantaneous local calculation)
    const solar = calculateSolarAnalysis(targetLocation[1], targetLocation[0], new Date());
    setSolarAnalysis(solar);
  }, [targetLocation[0], targetLocation[1]]);

  // Fetch real climate context on demand or location change
  const loadClimate = useCallback(async () => {
    setIsLoadingClimate(true);
    try {
      const data = await fetchClimateContext(targetLocation[1], targetLocation[0]);
      setClimateData(data);
    } catch (err) {
      console.error('Climate load error:', err);
    } finally {
      setIsLoadingClimate(false);
    }
  }, [targetLocation]);

  // Fetch real urban context on demand
  const loadUrban = useCallback(async () => {
    setIsLoadingUrban(true);
    try {
      const data = await fetchUrbanContext(targetLocation[1], targetLocation[0], 350);
      setUrbanContext(data);
    } catch (err) {
      console.error('Urban context load error:', err);
    } finally {
      setIsLoadingUrban(false);
    }
  }, [targetLocation]);

  // Initial climate query
  useEffect(() => {
    loadClimate();
  }, [targetLocation[0], targetLocation[1]]);

  // Project Management Handlers
  const handleSaveProject = async () => {
    setIsSaving(true);
    try {
      // Re-attach latest metrics into features
      const updatedFeatures = project.features.map(f => {
        if (f.id === activeFeature?.id && polygonAnalysis) {
          return {
            ...f,
            properties: {
              ...f.properties,
              metrics: polygonAnalysis.metrics,
              selfIntersecting: polygonAnalysis.isSelfIntersecting
            }
          };
        }
        if (f.id === activeFeature?.id && lineAnalysis) {
          return {
            ...f,
            properties: {
              ...f.properties,
              metrics: lineAnalysis.metrics
            }
          };
        }
        return f;
      });

      const updatedProject: SiteProject = {
        ...project,
        features: updatedFeatures,
        updatedAt: new Date().toISOString()
      };

      await saveProject(updatedProject);
      setProject(updatedProject);
      setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
    } finally {
      setIsSaving(false);
    }
  };

  const pushHistory = (currentFeatures: SiteFeature[]) => {
    setHistory(prev => [...prev.slice(-25), currentFeatures]);
    setRedoStack([]);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory(prev => prev.slice(0, prev.length - 1));
    setRedoStack(prev => [project.features, ...prev]);
    setProject(prev => ({ ...prev, features: previous }));
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[0];
    setRedoStack(prev => prev.slice(1));
    setHistory(prev => [...prev, project.features]);
    setProject(prev => ({ ...prev, features: next }));
  };

  const handleCreateFeature = (newFeature: SiteFeature) => {
    pushHistory(project.features);
    let metrics: any = {};
    if (newFeature.geometry.type === 'Polygon') {
      try {
        const poly = analyzePolygon(newFeature.geometry.coordinates[0]);
        metrics = poly.metrics;
      } catch (e) {}
    } else if (newFeature.geometry.type === 'LineString') {
      try {
        const line = analyzeLine(newFeature.geometry.coordinates);
        metrics = line.metrics;
      } catch (e) {}
    }

    const featureWithMetrics = {
      ...newFeature,
      properties: {
        ...newFeature.properties,
        metrics
      }
    };

    setProject(prev => ({
      ...prev,
      features: [...prev.features, featureWithMetrics],
      activeFeatureId: newFeature.id
    }));
    setCurrentTool('select');
  };

  const handleUpdateFeatureGeometry = (featureId: string, newCoordinates: any) => {
    pushHistory(project.features);
    setProject(prev => ({
      ...prev,
      features: prev.features.map(f => {
        if (f.id === featureId) {
          let metrics = f.properties.metrics || {};
          if (f.geometry.type === 'Polygon' && newCoordinates[0]?.length >= 3) {
            try {
              const poly = analyzePolygon(newCoordinates[0]);
              metrics = poly.metrics;
            } catch (e) {}
          } else if (f.geometry.type === 'LineString' && newCoordinates?.length >= 2) {
            try {
              const line = analyzeLine(newCoordinates);
              metrics = line.metrics;
            } catch (e) {}
          }
          return {
            ...f,
            geometry: { ...f.geometry, coordinates: newCoordinates },
            properties: { ...f.properties, metrics, updatedAt: Date.now() }
          };
        }
        return f;
      })
    }));
  };

  const handleDeleteFeature = (featureId: string) => {
    pushHistory(project.features);
    setProject(prev => ({
      ...prev,
      features: prev.features.filter(f => f.id !== featureId),
      activeFeatureId: prev.activeFeatureId === featureId ? null : prev.activeFeatureId
    }));
  };

  const handleUpdateFeatureName = (featureId: string, name: string) => {
    setProject(prev => ({
      ...prev,
      features: prev.features.map(f => 
        f.id === featureId ? { ...f, properties: { ...f.properties, name } } : f
      )
    }));
  };

  const handleSelectBasemap = (basemap: BasemapId) => {
    setProject(prev => ({ ...prev, basemap }));
  };

  const handleFlyToLocation = (lng: number, lat: number, zoom = 16.5) => {
    setFlyToTarget({ lng, lat, zoom });
    setProject(prev => ({ ...prev, center: [lng, lat], zoom }));
  };

  // Global hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger hotkeys if inside text input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        handleRedo();
        e.preventDefault();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (project.activeFeatureId) {
          handleDeleteFeature(project.activeFeatureId);
        }
      } else if (e.key === 'v' || e.key === 'V') {
        setCurrentTool('select');
      } else if (e.key === 'h' || e.key === 'H') {
        setCurrentTool('pan');
      } else if (e.key === 'p' || e.key === 'P') {
        setCurrentTool('polygon');
      } else if (e.key === 'l' || e.key === 'L') {
        setCurrentTool('line');
      } else if (e.key === 't' || e.key === 'T') {
        setCurrentTool('transect');
      } else if (e.key === 'd' || e.key === 'D') {
        setCurrentTool('point');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [project.activeFeatureId, history, redoStack]);

  // Aggregate comprehensive dossier
  const dossier = generateSiteIntelligenceReport(
    project,
    polygonAnalysis,
    climateData?.metrics,
    solarAnalysis?.metrics,
    urbanContext?.metrics
  );

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0b0f17] text-slate-100 overflow-hidden font-sans">
      {/* Top Bar */}
      <TopBar
        project={project}
        onUpdateProjectName={(name) => setProject(p => ({ ...p, name }))}
        onSelectBasemap={handleSelectBasemap}
        onFlyToLocation={handleFlyToLocation}
        onSaveProject={handleSaveProject}
        onOpenProjectManager={() => setIsProjectModalOpen(true)}
        onOpenReportModal={() => setIsReportModalOpen(true)}
        onExportGeoJSON={() => {
          const geojson = exportToGeoJSON(project);
          downloadFile(geojson, `${project.name.toLowerCase().replace(/\s+/g, '_')}.geojson`, 'application/geo+json');
        }}
        onExportCSV={() => {
          const csv = exportToCSV(project);
          downloadFile(csv, `${project.name.toLowerCase().replace(/\s+/g, '_')}_metrics.csv`, 'text/csv');
        }}
        isSaving={isSaving}
      />

      {/* Main Workspace: Left ToolBar, Central Map Canvas, Right Inspector */}
      <div className="flex-1 flex overflow-hidden relative">
        <ToolBar
          currentTool={currentTool}
          onSelectTool={setCurrentTool}
          canUndo={history.length > 0}
          canRedo={redoStack.length > 0}
          onUndo={handleUndo}
          onRedo={handleRedo}
          hasSelectedFeature={!!project.activeFeatureId}
          onDeleteSelected={() => {
            if (project.activeFeatureId) {
              handleDeleteFeature(project.activeFeatureId);
            }
          }}
          onFitBounds={() => setFitBoundsTrigger(t => t + 1)}
        />

        <MapCanvas
          project={project}
          currentTool={currentTool}
          onUpdateFeatureGeometry={handleUpdateFeatureGeometry}
          onCreateFeature={handleCreateFeature}
          onSelectFeature={(id) => setProject(p => ({ ...p, activeFeatureId: id }))}
          onCursorMove={(lng, lat) => setCursorCoords([lng, lat])}
          flyToTarget={flyToTarget}
          fitBoundsTrigger={fitBoundsTrigger}
        />

        <InspectorPanel
          project={project}
          activeFeature={activeFeature}
          polygonAnalysis={polygonAnalysis}
          lineAnalysis={lineAnalysis}
          pointReport={pointReport}
          solarAnalysis={solarAnalysis}
          climateData={climateData}
          urbanContext={urbanContext}
          isLoadingClimate={isLoadingClimate}
          isLoadingUrban={isLoadingUrban}
          onRefreshUrban={loadUrban}
          onRefreshClimate={loadClimate}
          onSelectFeature={(id) => setProject(p => ({ ...p, activeFeatureId: id }))}
          onDeleteFeature={handleDeleteFeature}
          onUpdateFeatureName={handleUpdateFeatureName}
        />
      </div>

      {/* Bottom Bar: Coordinates, Datum, Projection */}
      <BottomBar
        cursorCoords={cursorCoords}
        centerCoords={project.center}
        zoom={project.zoom}
      />

      {/* Project Manager Modal */}
      <ProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        projects={projects}
        currentProjectId={project.id}
        onSelectProject={(id) => {
          const found = projects.find(p => p.id === id);
          if (found) setProject(found);
        }}
        onCreateProject={async (name, description) => {
          const newProj: SiteProject = {
            id: `project-${Date.now()}`,
            name,
            description,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            center: project.center,
            zoom: 16.5,
            features: [],
            activeFeatureId: null,
            basemap: project.basemap,
            metadata: {
              version: '1.0.0',
            }
          };
          await saveProject(newProj);
          setProjects(prev => [...prev, newProj]);
          setProject(newProj);
          setIsProjectModalOpen(false);
        }}
        onDeleteProject={async (id) => {
          await deleteProject(id);
          const remaining = projects.filter(p => p.id !== id);
          setProjects(remaining);
          if (project.id === id && remaining.length > 0) {
            setProject(remaining[0]);
          }
        }}
      />

      {/* Architectural Site Intelligence Report Modal */}
      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        report={dossier}
        onDownloadMarkdown={() => {
          const md = reportToMarkdown(dossier);
          downloadFile(md, `${project.name.toLowerCase().replace(/\s+/g, '_')}_intelligence_report.md`, 'text/markdown');
        }}
        onDownloadCSV={() => {
          const csv = exportToCSV(project);
          downloadFile(csv, `${project.name.toLowerCase().replace(/\s+/g, '_')}_metrics.csv`, 'text/csv');
        }}
        onDownloadGeoJSON={() => {
          const geojson = exportToGeoJSON(project);
          downloadFile(geojson, `${project.name.toLowerCase().replace(/\s+/g, '_')}.geojson`, 'application/geo+json');
        }}
      />
    </div>
  );
}

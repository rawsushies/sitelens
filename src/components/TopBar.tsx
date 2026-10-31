/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Top Bar
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Compass, 
  Search, 
  Layers, 
  Download, 
  FolderGit2, 
  Save, 
  Plus, 
  FileText, 
  Check, 
  MapPin, 
  FileSpreadsheet, 
  ExternalLink,
  ChevronDown
} from 'lucide-react';
import { SiteProject, BasemapId } from '../types';
import { BASEMAP_OPTIONS } from '../map/basemaps';
import { searchLocations, GeocodingResult } from '../data-sources/geocoding';
import { parseCoordinatesInput } from '../coordinates';

interface TopBarProps {
  project: SiteProject;
  onUpdateProjectName: (name: string) => void;
  onSelectBasemap: (basemap: BasemapId) => void;
  onFlyToLocation: (lng: number, lat: number, zoom?: number) => void;
  onSaveProject: () => void;
  onOpenProjectManager: () => void;
  onOpenReportModal: () => void;
  onExportGeoJSON: () => void;
  onExportCSV: () => void;
  isSaving: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  project,
  onUpdateProjectName,
  onSelectBasemap,
  onFlyToLocation,
  onSaveProject,
  onOpenProjectManager,
  onOpenReportModal,
  onExportGeoJSON,
  onExportCSV,
  isSaving
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [showBasemapMenu, setShowBasemapMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(project.name);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const basemapMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Sync title input if project name changes externally
  useEffect(() => {
    setTitleInput(project.name);
  }, [project.name]);

  // Handle outside clicks to close dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearchResults(false);
      }
      if (basemapMenuRef.current && !basemapMenuRef.current.contains(e.target as Node)) {
        setShowBasemapMenu(false);
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced geocoding search
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      // Check if user entered direct coordinates first
      const directCoords = parseCoordinatesInput(searchQuery);
      if (directCoords) {
        setSearchResults([
          {
            name: `Coordinates: ${directCoords[1].toFixed(5)}, ${directCoords[0].toFixed(5)}`,
            label: `Direct Geodetic Input [Lng: ${directCoords[0].toFixed(5)}°, Lat: ${directCoords[1].toFixed(5)}°]`,
            longitude: directCoords[0],
            latitude: directCoords[1],
            type: 'Coordinates'
          }
        ]);
        setShowSearchResults(true);
        return;
      }

      setIsSearching(true);
      try {
        const results = await searchLocations(searchQuery);
        setSearchResults(results);
        setShowSearchResults(true);
      } catch (err) {
        console.error('Search error', err);
      } finally {
        setIsSearching(false);
      }
    }, 320);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectLocation = (loc: GeocodingResult) => {
    onFlyToLocation(loc.longitude, loc.latitude, 16.5);
    setShowSearchResults(false);
    setSearchQuery(loc.name);
  };

  const handleTitleSubmit = () => {
    if (titleInput.trim()) {
      onUpdateProjectName(titleInput.trim());
    } else {
      setTitleInput(project.name);
    }
    setIsEditingTitle(false);
  };

  const currentBasemap = BASEMAP_OPTIONS.find(b => b.id === project.basemap) || BASEMAP_OPTIONS[0];

  return (
    <header className="h-12 bg-[#0d131f] border-b border-[#1f2b3e] px-3 flex items-center justify-between text-xs select-none z-30">
      {/* Brand & Project Identity */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 pr-3 border-r border-[#1f2b3e]">
          <div className="w-7 h-7 rounded bg-[#8b5cf6]/20 border border-[#8b5cf6]/50 flex items-center justify-center text-[#a78bfa]">
            <Compass className="w-4 h-4 stroke-[2.2]" />
          </div>
          <div>
            <div className="font-bold text-white tracking-wider flex items-center gap-1 font-mono text-[13px]">
              SITELENS
              <span className="text-[9px] px-1 py-0.2 bg-[#8b5cf6]/30 text-[#c4b5fd] rounded font-mono font-normal">
                GIS
              </span>
            </div>
          </div>
        </div>

        {/* Project Name & In-Place Editing */}
        <div className="flex items-center gap-2">
          {isEditingTitle ? (
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={(e) => e.key === 'Enter' && handleTitleSubmit()}
              autoFocus
              className="bg-[#161f30] text-white px-2 py-1 rounded border border-[#8b5cf6] font-medium outline-none text-xs w-64"
            />
          ) : (
            <button
              onClick={() => setIsEditingTitle(true)}
              title="Click to rename project"
              className="text-slate-200 hover:text-white font-medium hover:bg-[#161f30] px-2 py-1 rounded transition-colors text-xs flex items-center gap-1.5 max-w-[200px] truncate"
            >
              <span className="truncate">{project.name}</span>
              <span className="text-[10px] text-slate-500 font-mono">✎</span>
            </button>
          )}

          <button
            onClick={onOpenProjectManager}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-[#182335] rounded transition-colors"
            title="Project Manager (New, Open, Manage)"
          >
            <FolderGit2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Center: Search & Geodetic Location Navigation */}
      <div className="relative w-[340px]" ref={searchContainerRef}>
        <div className="flex items-center bg-[#131b2b] border border-[#233148] focus-within:border-[#8b5cf6] rounded px-2.5 py-1 text-xs transition-colors">
          <Search className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => {
              if (searchResults.length > 0) setShowSearchResults(true);
            }}
            placeholder="Search address, place, or coordinates (e.g. 51.5, -0.1)..."
            className="bg-transparent text-slate-100 placeholder-slate-500 outline-none w-full font-mono text-[11px]"
          />
          {isSearching && (
            <div className="w-3 h-3 border-2 border-[#8b5cf6] border-t-transparent rounded-full animate-spin ml-1 shrink-0" />
          )}
        </div>

        {/* Dropdown Results */}
        {showSearchResults && searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-[#101726] border border-[#233148] rounded shadow-2xl overflow-hidden z-50 max-h-72 overflow-y-auto">
            <div className="px-2.5 py-1 text-[10px] font-mono text-slate-500 bg-[#0c121e] border-b border-[#1b263a]">
              OPEN GEOLOCATION RESULTS (PHOTON / OSM)
            </div>
            {searchResults.map((loc, idx) => (
              <button
                key={idx}
                onClick={() => handleSelectLocation(loc)}
                className="w-full text-left px-2.5 py-2 hover:bg-[#1a253a] border-b border-[#172235] last:border-0 transition-colors flex items-start gap-2"
              >
                <MapPin className="w-3.5 h-3.5 text-[#a78bfa] shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-slate-200 font-medium text-xs truncate">{loc.name}</div>
                  <div className="text-[10px] text-slate-400 truncate">{loc.label}</div>
                  <div className="text-[9px] font-mono text-slate-500 mt-0.5">
                    {loc.latitude.toFixed(5)}°N, {loc.longitude.toFixed(5)}°E
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right Actions: Basemap, Save, Export, Report */}
      <div className="flex items-center gap-2">
        {/* Basemap Switcher */}
        <div className="relative" ref={basemapMenuRef}>
          <button
            onClick={() => setShowBasemapMenu(!showBasemapMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-[#131b2b] hover:bg-[#1a253a] border border-[#233148] rounded text-slate-300 font-medium transition-colors"
          >
            <Layers className="w-3.5 h-3.5 text-[#a78bfa]" />
            <span className="text-[11px] font-mono">{currentBasemap.name.split(' ')[0]}</span>
            <ChevronDown className="w-3 h-3 text-slate-500" />
          </button>

          {showBasemapMenu && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-[#101726] border border-[#233148] rounded shadow-2xl p-1 z-50">
              <div className="px-2 py-1 text-[10px] font-mono text-slate-500 uppercase">
                Cartographic Basemap
              </div>
              {BASEMAP_OPTIONS.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    onSelectBasemap(b.id);
                    setShowBasemapMenu(false);
                  }}
                  className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between text-xs transition-colors ${
                    project.basemap === b.id
                      ? 'bg-[#8b5cf6]/20 text-[#c4b5fd]'
                      : 'text-slate-300 hover:bg-[#1a253a]'
                  }`}
                >
                  <div>
                    <div className="font-medium text-xs">{b.name}</div>
                    <div className="text-[10px] text-slate-400">{b.description}</div>
                  </div>
                  {project.basemap === b.id && <Check className="w-3.5 h-3.5 text-[#8b5cf6] shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Save Button */}
        <button
          onClick={onSaveProject}
          disabled={isSaving}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-[#162032] hover:bg-[#202c44] border border-[#283852] text-slate-200 rounded font-medium transition-colors"
          title="Save project to local IndexedDB"
        >
          <Save className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[11px] font-mono">{isSaving ? 'Saving...' : 'Save'}</span>
        </button>

        {/* Export Dropdown */}
        <div className="relative" ref={exportMenuRef}>
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-[#131b2b] hover:bg-[#1a253a] border border-[#233148] rounded text-slate-300 font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-[11px] font-mono">Export</span>
            <ChevronDown className="w-3 h-3 text-slate-500" />
          </button>

          {showExportMenu && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-[#101726] border border-[#233148] rounded shadow-2xl p-1 z-50">
              <div className="px-2 py-1 text-[10px] font-mono text-slate-500 uppercase">
                Geospatial Export
              </div>
              <button
                onClick={() => {
                  onExportGeoJSON();
                  setShowExportMenu(false);
                }}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-[#1a253a] text-slate-300 text-xs flex items-center gap-2"
              >
                <MapPin className="w-3.5 h-3.5 text-violet-400" />
                <div>
                  <div className="font-medium">GeoJSON FeatureCollection</div>
                  <div className="text-[9px] text-slate-500 font-mono">Standard OGC GIS vector</div>
                </div>
              </button>
              <button
                onClick={() => {
                  onExportCSV();
                  setShowExportMenu(false);
                }}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-[#1a253a] text-slate-300 text-xs flex items-center gap-2"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <div>
                  <div className="font-medium">CSV Measurement Registry</div>
                  <div className="text-[9px] text-slate-500 font-mono">Full metrics & coordinates</div>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* View Site Report */}
        <button
          onClick={onOpenReportModal}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-[#8b5cf6]/20 hover:bg-[#8b5cf6]/30 border border-[#8b5cf6]/60 text-[#c4b5fd] rounded font-medium transition-colors"
          title="Open comprehensive site intelligence report"
        >
          <FileText className="w-3.5 h-3.5" />
          <span className="text-[11px] font-mono">Site Report</span>
        </button>
      </div>
    </header>
  );
};

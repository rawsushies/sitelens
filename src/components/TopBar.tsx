/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Top Bar (Design System v1.1)
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Layers, 
  Download, 
  FolderGit2, 
  Save, 
  FileText, 
  Check, 
  MapPin, 
  FileSpreadsheet, 
  ChevronDown,
  Sun,
  Moon
} from 'lucide-react';
import { SiteProject, BasemapId } from '../types';
import { BASEMAP_OPTIONS } from '../map/basemaps';
import { searchLocations, GeocodingResult } from '../data-sources/geocoding';
import { parseCoordinatesInput, formatCoordinatePair } from '../coordinates';
import { SiteLensLogo } from './SiteLensLogo';
import { useTheme } from '../theme/ThemeContext';

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
  const { theme, toggleTheme } = useTheme();
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

  useEffect(() => {
    setTitleInput(project.name);
  }, [project.name]);

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

  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      const directCoords = parseCoordinatesInput(searchQuery);
      if (directCoords) {
        const [lng, lat] = directCoords;
        setSearchResults([
          {
            name: `Coordinates: ${formatCoordinatePair(lat, lng, 5)}`,
            label: 'Direct Coordinate Navigation',
            latitude: lat,
            longitude: lng
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
        console.error('Geocoding search failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 320);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectLocation = (loc: GeocodingResult) => {
    onFlyToLocation(loc.longitude, loc.latitude, 16.5);
    setShowSearchResults(false);
    setSearchQuery('');
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
    <header className="h-12 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] px-3 flex items-center justify-between text-xs select-none z-30 transition-colors duration-150">
      {/* Brand & Project Identity */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5 pr-3 border-r border-[var(--border-subtle)]">
          <SiteLensLogo size={22} />
          <div className="flex items-baseline gap-1.5">
            <span className="font-display font-bold text-sm tracking-tight text-[var(--text-primary)]">
              SiteLens
            </span>
            <span className="text-[10px] text-[var(--text-muted)] tracking-wider uppercase font-medium">
              GIS
            </span>
          </div>
        </div>

        {/* Project Name & In-Place Editing */}
        <div className="flex items-center gap-1.5">
          {isEditingTitle ? (
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={(e) => e.key === 'Enter' && handleTitleSubmit()}
              autoFocus
              className="bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] px-2 py-1 rounded border border-[#7C5CFF] font-medium outline-none text-xs w-60"
            />
          ) : (
            <button
              onClick={() => setIsEditingTitle(true)}
              title="Click to rename project"
              className="text-[var(--text-primary)] font-medium hover:bg-[var(--bg-surface-hover)] px-2 py-1 rounded transition-colors text-xs flex items-center gap-1.5 max-w-[200px] truncate"
            >
              <span className="truncate">{project.name}</span>
              <span className="text-[10px] text-[var(--text-muted)]">✎</span>
            </button>
          )}

          <button
            onClick={onOpenProjectManager}
            className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] rounded transition-colors"
            title="Project Manager (New, Open, Manage)"
            aria-label="Open Project Manager"
          >
            <FolderGit2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Center: Search & Geodetic Location Navigation */}
      <div className="relative w-[340px]" ref={searchContainerRef}>
        <div className="flex items-center bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] focus-within:border-[#7C5CFF] rounded px-2.5 py-1 text-xs transition-colors">
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)] mr-2 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => {
              if (searchResults.length > 0) setShowSearchResults(true);
            }}
            placeholder="Search location or coordinates (e.g. 51.5, -0.1)..."
            className="bg-transparent text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none w-full text-[11px] tabular-nums"
          />
          {isSearching && (
            <div className="w-3 h-3 border-2 border-[#7C5CFF] border-t-transparent rounded-full animate-spin ml-1 shrink-0" />
          )}
        </div>

        {/* Dropdown Results */}
        {showSearchResults && searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded shadow-xl overflow-hidden z-50 max-h-72 overflow-y-auto">
            <div className="px-2.5 py-1 text-[10px] font-medium text-[var(--text-muted)] bg-[var(--bg-surface-secondary)] border-b border-[var(--border-subtle)] uppercase tracking-wider">
              Open Geolocation Results
            </div>
            {searchResults.map((loc, idx) => (
              <button
                key={idx}
                onClick={() => handleSelectLocation(loc)}
                className="w-full text-left px-2.5 py-2 hover:bg-[var(--bg-surface-hover)] border-b border-[var(--border-subtle)] last:border-0 transition-colors flex items-start gap-2"
              >
                <MapPin className="w-3.5 h-3.5 text-[#7C5CFF] shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-[var(--text-primary)] font-medium text-xs truncate">{loc.name}</div>
                  <div className="text-[10px] text-[var(--text-secondary)] truncate">{loc.label}</div>
                  <div className="text-[10px] text-[var(--text-muted)] tabular-nums mt-0.5">
                    {formatCoordinatePair(loc.latitude, loc.longitude, 5)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right Actions: Basemap, Theme Toggle, Save, Export, Report */}
      <div className="flex items-center gap-1.5">
        {/* Basemap Switcher */}
        <div className="relative" ref={basemapMenuRef}>
          <button
            onClick={() => setShowBasemapMenu(!showBasemapMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-[var(--bg-surface-secondary)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium transition-colors"
            title="Select Basemap"
          >
            <Layers className="w-3.5 h-3.5 text-[#7C5CFF]" />
            <span className="text-[11px]">{currentBasemap.name.split(' ')[0]}</span>
            <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />
          </button>

          {showBasemapMenu && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded shadow-xl p-1 z-50">
              <div className="px-2 py-1 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-medium">
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
                      ? 'bg-[var(--brand-subtle)] text-[#7C5CFF] font-medium'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <div>
                    <div className="font-medium text-xs">{b.name}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">{b.description}</div>
                  </div>
                  {project.basemap === b.id && <Check className="w-3.5 h-3.5 text-[#7C5CFF] shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* UI Theme Switcher */}
        <button
          onClick={toggleTheme}
          className="p-1.5 bg-[var(--bg-surface-secondary)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded transition-colors"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Workspace Theme`}
          aria-label="Toggle UI Theme"
        >
          {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-[var(--text-primary)]" />}
        </button>

        {/* Save Button */}
        <button
          onClick={onSaveProject}
          disabled={isSaving}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-[var(--bg-surface-secondary)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded font-medium transition-colors"
          title="Save project to local storage"
        >
          <Save className="w-3.5 h-3.5 text-emerald-500" />
          <span className="text-[11px]">{isSaving ? 'Saving...' : 'Save'}</span>
        </button>

        {/* Export Dropdown */}
        <div className="relative" ref={exportMenuRef}>
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-[var(--bg-surface-secondary)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-sky-500" />
            <span className="text-[11px]">Export</span>
            <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />
          </button>

          {showExportMenu && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded shadow-xl p-1 z-50">
              <div className="px-2 py-1 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-medium">
                Geospatial Export
              </div>
              <button
                onClick={() => {
                  onExportGeoJSON();
                  setShowExportMenu(false);
                }}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] text-xs flex items-center gap-2 transition-colors"
              >
                <MapPin className="w-3.5 h-3.5 text-[#7C5CFF]" />
                <div>
                  <div className="font-medium">GeoJSON FeatureCollection</div>
                  <div className="text-[10px] text-[var(--text-muted)]">Standard OGC GIS vector</div>
                </div>
              </button>
              <button
                onClick={() => {
                  onExportCSV();
                  setShowExportMenu(false);
                }}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] text-xs flex items-center gap-2 transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                <div>
                  <div className="font-medium">CSV Measurement Registry</div>
                  <div className="text-[10px] text-[var(--text-muted)]">Full metrics & coordinates</div>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* View Site Report */}
        <button
          onClick={onOpenReportModal}
          className="flex items-center gap-1.5 px-3 py-1 bg-[#7C5CFF] hover:bg-[#6B47FC] text-white rounded font-medium transition-colors shadow-sm"
          title="Open comprehensive site intelligence report"
        >
          <FileText className="w-3.5 h-3.5" />
          <span className="text-[11px]">Site Report</span>
        </button>
      </div>
    </header>
  );
};

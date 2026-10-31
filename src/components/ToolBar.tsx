/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Vertical CAD/GIS Toolbar (Design System v1.1)
 */

import React from 'react';
import { 
  MousePointer, 
  Hand, 
  Pentagon, 
  Ruler, 
  Split, 
  MapPin, 
  Undo2, 
  Redo2, 
  Trash2, 
  Maximize2 
} from 'lucide-react';

export type ToolMode = 
  | 'select' 
  | 'pan' 
  | 'polygon' 
  | 'line' 
  | 'transect' 
  | 'point';

interface ToolBarProps {
  currentTool: ToolMode;
  onSelectTool: (tool: ToolMode) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  hasSelectedFeature: boolean;
  onDeleteSelected: () => void;
  onFitBounds: () => void;
}

export const ToolBar: React.FC<ToolBarProps> = ({
  currentTool,
  onSelectTool,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  hasSelectedFeature,
  onDeleteSelected,
  onFitBounds,
}) => {
  const tools: {
    id: ToolMode;
    label: string;
    shortcut: string;
    icon: React.ReactNode;
    description: string;
  }[] = [
    {
      id: 'select',
      label: 'Select / Inspect',
      shortcut: 'V',
      icon: <MousePointer className="w-4 h-4" />,
      description: 'Select features, inspect metrics, and drag vertex handles'
    },
    {
      id: 'pan',
      label: 'Pan Camera',
      shortcut: 'H',
      icon: <Hand className="w-4 h-4" />,
      description: 'Free map pan and tilt navigation'
    },
    {
      id: 'polygon',
      label: 'Site Boundary Polygon',
      shortcut: 'P',
      icon: <Pentagon className="w-4 h-4" />,
      description: 'Draw closed site boundary with WGS84 ellipsoidal area calculation'
    },
    {
      id: 'line',
      label: 'Geodesic Distance Line',
      shortcut: 'L',
      icon: <Ruler className="w-4 h-4" />,
      description: 'Measure geodesic distances and segment azimuths'
    },
    {
      id: 'transect',
      label: 'Site Width Transect',
      shortcut: 'T',
      icon: <Split className="w-4 h-4" />,
      description: 'Draw actual user-defined cross-section transect to measure site width/depth'
    },
    {
      id: 'point',
      label: 'Datum / Spot Point',
      shortcut: 'D',
      icon: <MapPin className="w-4 h-4" />,
      description: 'Place reference point for spot coordinate & elevation inspection'
    }
  ];

  return (
    <aside className="w-12 bg-[var(--bg-surface)] border-r border-[var(--border-subtle)] flex flex-col items-center py-2.5 z-20 select-none transition-colors duration-150">
      {/* Primary Drawing & Selection Tools */}
      <div className="flex flex-col gap-1 w-full px-1.5">
        {tools.map((t) => {
          const isActive = currentTool === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onSelectTool(t.id)}
              title={`${t.label} (${t.shortcut}) — ${t.description}`}
              aria-label={`${t.label} (Shortcut: ${t.shortcut})`}
              className={`w-9 h-9 rounded flex items-center justify-center transition-all relative group ${
                isActive
                  ? 'bg-[#7C5CFF] text-white shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
              }`}
            >
              {t.icon}
              {/* Tooltip */}
              <div className="absolute left-full ml-2.5 px-2.5 py-1.5 bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] text-xs rounded border border-[var(--border-subtle)] shadow-xl whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50 flex items-center gap-2">
                <span className="font-medium">{t.label}</span>
                <kbd className="px-1.5 py-0.5 bg-[var(--bg-surface-secondary)] text-[10px] text-[#7C5CFF] font-medium rounded border border-[var(--border-subtle)]">
                  {t.shortcut}
                </kbd>
              </div>
            </button>
          );
        })}
      </div>

      <div className="w-6 h-[1px] bg-[var(--border-subtle)] my-2" />

      {/* Editing, History & Camera Controls */}
      <div className="flex flex-col gap-1 w-full px-1.5">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
          className={`w-9 h-9 rounded flex items-center justify-center transition-colors ${
            canUndo
              ? 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
              : 'text-[var(--text-muted)] opacity-40 cursor-not-allowed'
          }`}
        >
          <Undo2 className="w-4 h-4" />
        </button>

        <button
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
          aria-label="Redo"
          className={`w-9 h-9 rounded flex items-center justify-center transition-colors ${
            canRedo
              ? 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
              : 'text-[var(--text-muted)] opacity-40 cursor-not-allowed'
          }`}
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <button
          onClick={onDeleteSelected}
          disabled={!hasSelectedFeature}
          title="Delete Selected Geometry (Del)"
          aria-label="Delete Selected Geometry"
          className={`w-9 h-9 rounded flex items-center justify-center transition-colors ${
            hasSelectedFeature
              ? 'text-rose-500 hover:text-rose-600 hover:bg-rose-500/10'
              : 'text-[var(--text-muted)] opacity-40 cursor-not-allowed'
          }`}
        >
          <Trash2 className="w-4 h-4" />
        </button>

        <button
          onClick={onFitBounds}
          title="Fit Site Features to Canvas"
          aria-label="Fit Site Features to Canvas"
          className="w-9 h-9 rounded flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};

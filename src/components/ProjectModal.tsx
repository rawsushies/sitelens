/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Project Manager Modal
 */

import React, { useState } from 'react';
import { SiteProject } from '../types';
import { 
  FolderGit2, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  X, 
  Calendar, 
  Layers, 
  MapPin, 
  AlertCircle 
} from 'lucide-react';

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: SiteProject[];
  currentProjectId: string;
  onSelectProject: (projectId: string) => void;
  onCreateProject: (name: string, description: string) => void;
  onDeleteProject: (projectId: string) => void;
}

export const ProjectModal: React.FC<ProjectModalProps> = ({
  isOpen,
  onClose,
  projects,
  currentProjectId,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onCreateProject(newTitle.trim(), newDesc.trim());
    setNewTitle('');
    setNewDesc('');
    setIsCreating(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 select-none">
      <div className="bg-[#0e1524] border border-[#233148] rounded-lg shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="px-4 py-3 bg-[#0a0f19] border-b border-[#1f2b3e] flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-mono font-medium text-sm">
            <FolderGit2 className="w-4 h-4 text-[#a78bfa]" />
            <span>Site Projects Workspace</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 flex-1 overflow-y-auto space-y-4 text-xs">
          {/* Action Bar */}
          <div className="flex items-center justify-between">
            <span className="font-mono text-slate-400 text-[11px] uppercase">
              Local IndexedDB Projects ({projects.length})
            </span>
            <button
              onClick={() => setIsCreating(!isCreating)}
              className="px-2.5 py-1.5 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-medium rounded flex items-center gap-1.5 transition-colors font-mono"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Site Project</span>
            </button>
          </div>

          {/* Create Form */}
          {isCreating && (
            <form onSubmit={handleCreate} className="p-3 bg-[#131b2b] border border-[#273854] rounded space-y-3">
              <div className="font-medium text-slate-200">Initialize New Project</div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Project Name *</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Hudson Yards Site Feasibility"
                  className="w-full bg-[#0a0f19] border border-[#1f2b3e] focus:border-[#8b5cf6] px-2.5 py-1.5 rounded text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Description / Client Objective</label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="e.g. Masterplanning site boundary, solar shadow and walkability baseline"
                  className="w-full bg-[#0a0f19] border border-[#1f2b3e] focus:border-[#8b5cf6] px-2.5 py-1.5 rounded text-white outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-3 py-1 bg-[#1a2436] hover:bg-[#223047] text-slate-300 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-medium rounded"
                >
                  Create Project
                </button>
              </div>
            </form>
          )}

          {/* Project List */}
          <div className="space-y-2">
            {projects.map((proj) => {
              const isCurrent = proj.id === currentProjectId;
              const isDeleting = deleteConfirmId === proj.id;

              return (
                <div
                  key={proj.id}
                  className={`p-3 rounded border transition-colors ${
                    isCurrent
                      ? 'bg-[#152033] border-[#8b5cf6]'
                      : 'bg-[#101726] border-[#1f2b3e] hover:bg-[#141d2f]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-100 truncate">
                          {proj.name}
                        </span>
                        {isCurrent && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-[#8b5cf6]/30 text-[#c4b5fd] border border-[#8b5cf6]/60">
                            ACTIVE
                          </span>
                        )}
                      </div>

                      {proj.description && (
                        <p className="text-slate-400 text-xs mt-0.5 line-clamp-1">
                          {proj.description}
                        </p>
                      )}

                      <div className="flex items-center gap-3 mt-2 text-[10px] font-mono text-slate-500">
                        <span className="flex items-center gap-1">
                          <Layers className="w-3 h-3 text-[#a78bfa]" />
                          {proj.features.length} Features
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(proj.updatedAt).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {proj.center[1].toFixed(3)}°N, {proj.center[0].toFixed(3)}°E
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!isCurrent && (
                        <button
                          onClick={() => {
                            onSelectProject(proj.id);
                            onClose();
                          }}
                          className="px-2.5 py-1 bg-[#1c283e] hover:bg-[#283854] text-slate-200 rounded font-medium transition-colors"
                        >
                          Switch
                        </button>
                      )}

                      {projects.length > 1 && (
                        isDeleting ? (
                          <div className="flex items-center gap-1 bg-rose-950/70 p-1 rounded border border-rose-800">
                            <span className="text-[10px] text-rose-300 font-mono">Confirm?</span>
                            <button
                              onClick={() => {
                                onDeleteProject(proj.id);
                                setDeleteConfirmId(null);
                              }}
                              className="px-1.5 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-bold"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="px-1.5 py-0.5 bg-slate-700 text-slate-300 rounded text-[10px]"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirmId(proj.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 rounded transition-colors"
                            title="Delete project"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-2.5 bg-[#0a0f19] border-t border-[#1f2b3e] flex items-center justify-between text-[11px] font-mono text-slate-500">
          <span>All changes persist automatically in browser IndexedDB</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-[#1a2538] hover:bg-[#24334b] text-slate-300 rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

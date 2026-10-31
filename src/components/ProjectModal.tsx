/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Project Manager Modal (Design System v1.1)
 */

import React, { useState } from 'react';
import { SiteProject } from '../types';
import { formatCoordinatePair } from '../coordinates';
import { FolderGit2, X, Plus, Calendar, Layers, MapPin, Trash2 } from 'lucide-react';

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: SiteProject[];
  currentProjectId: string;
  onSelectProject: (id: string) => void;
  onCreateProject: (name: string, description: string) => void;
  onDeleteProject: (id: string) => void;
}

export const ProjectModal: React.FC<ProjectModalProps> = ({
  isOpen,
  onClose,
  projects,
  currentProjectId,
  onSelectProject,
  onCreateProject,
  onDeleteProject
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 select-none">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] text-[var(--text-primary)]">
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-[var(--bg-surface-secondary)] border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-2.5 font-display font-semibold text-sm text-[var(--text-primary)]">
            <FolderGit2 className="w-4 h-4 text-[#7C5CFF]" />
            <span>Site Projects Workspace</span>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded transition-colors"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4 text-xs">
          {/* Action Bar */}
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-secondary)] text-[11px] font-medium uppercase tracking-wider">
              Local Storage Projects ({projects.length})
            </span>
            <button
              onClick={() => setIsCreating(!isCreating)}
              className="px-3 py-1.5 bg-[#7C5CFF] hover:bg-[#6B47FC] text-white font-medium rounded flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Site Project</span>
            </button>
          </div>

          {/* Create Form */}
          {isCreating && (
            <form onSubmit={handleCreate} className="p-4 bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded space-y-3">
              <div className="font-semibold text-[var(--text-primary)] text-sm">Initialize New Project</div>
              <div>
                <label className="block text-[11px] text-[var(--text-secondary)] mb-1 font-medium">Project Name *</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Hudson Yards Site Feasibility"
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] focus:border-[#7C5CFF] px-3 py-1.5 rounded text-[var(--text-primary)] outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[var(--text-secondary)] mb-1 font-medium">Description / Client Objective</label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="e.g. Masterplanning site boundary, solar shadow and walkability baseline"
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] focus:border-[#7C5CFF] px-3 py-1.5 rounded text-[var(--text-primary)] outline-none transition-colors"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-3 py-1.5 bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-[#7C5CFF] hover:bg-[#6B47FC] text-white font-medium rounded transition-colors shadow-sm"
                >
                  Create Project
                </button>
              </div>
            </form>
          )}

          {/* Project List */}
          <div className="space-y-2.5">
            {projects.map((proj) => {
              const isCurrent = proj.id === currentProjectId;
              const isDeleting = deleteConfirmId === proj.id;

              return (
                <div
                  key={proj.id}
                  className={`p-3.5 rounded border transition-colors ${
                    isCurrent
                      ? 'bg-[var(--brand-subtle)] border-[#7C5CFF]'
                      : 'bg-[var(--bg-surface-secondary)] border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-[var(--text-primary)] truncate">
                          {proj.name}
                        </span>
                        {isCurrent && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#7C5CFF]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#7C5CFF]" aria-hidden="true" />
                            Active
                          </span>
                        )}
                      </div>

                      {proj.description && (
                        <p className="text-[var(--text-secondary)] text-xs mt-1 line-clamp-1">
                          {proj.description}
                        </p>
                      )}

                      <div className="flex items-center gap-3 mt-2.5 text-[11px] text-[var(--text-muted)] tabular-nums">
                        <span className="flex items-center gap-1">
                          <Layers className="w-3 h-3 text-[#7C5CFF]" />
                          {proj.features.length} Features
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(proj.updatedAt).toLocaleDateString()}
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {formatCoordinatePair(proj.center[1], proj.center[0], 3)}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {!isCurrent && (
                        <button
                          onClick={() => {
                            onSelectProject(proj.id);
                            onClose();
                          }}
                          className="px-3 py-1 bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded font-medium transition-colors"
                        >
                          Switch
                        </button>
                      )}

                      {projects.length > 1 && (
                        isDeleting ? (
                          <div className="flex items-center gap-1.5 bg-rose-500/10 p-1 rounded border border-rose-500/30">
                            <span className="text-[10px] text-rose-600 dark:text-rose-400 font-medium">Delete?</span>
                            <button
                              onClick={() => {
                                onDeleteProject(proj.id);
                                setDeleteConfirmId(null);
                              }}
                              className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-[10px] font-semibold transition-colors"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="px-2 py-0.5 bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] rounded text-[10px] transition-colors"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirmId(proj.id)}
                            className="p-1.5 text-[var(--text-muted)] hover:text-rose-500 rounded transition-colors"
                            title="Delete project"
                            aria-label="Delete project"
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
        <div className="px-5 py-3 bg-[var(--bg-surface-secondary)] border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
          <span>All changes persist automatically in browser storage</span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

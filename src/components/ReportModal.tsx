/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Architectural Report Modal (Design System v1.1)
 */

import React, { useState } from 'react';
import { SiteIntelligenceReport, reportToMarkdown } from '../reporting';
import { MetricBadge } from './MetricCard';
import { 
  FileText, 
  X, 
  Copy, 
  Check, 
  Download, 
  Printer 
} from 'lucide-react';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: SiteIntelligenceReport;
  onDownloadMarkdown: () => void;
  onDownloadCSV: () => void;
  onDownloadGeoJSON: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  report,
  onDownloadMarkdown,
  onDownloadCSV,
  onDownloadGeoJSON,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopyMarkdown = () => {
    const md = reportToMarkdown(report);
    navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 select-none">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-[var(--text-primary)]">
        {/* Header */}
        <div className="px-6 py-4 bg-[var(--bg-surface-secondary)] border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-[var(--brand-subtle)] border border-[var(--brand-border)] flex items-center justify-center text-[#7C5CFF]">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="font-display text-sm font-bold text-[var(--text-primary)] tracking-tight">
                Site Intelligence Dossier
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                Authoritative Geodetic Datum: {report.authoritativeDatum}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyMarkdown}
              className="px-3 py-1.5 bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-[#7C5CFF]" />}
              <span>{copied ? 'Copied MD' : 'Copy Markdown'}</span>
            </button>

            <button
              onClick={onDownloadMarkdown}
              className="px-3 py-1.5 bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded text-xs font-medium flex items-center gap-1.5 transition-colors"
              title="Download report as markdown"
            >
              <Download className="w-3.5 h-3.5 text-sky-500" />
              <span>.MD</span>
            </button>

            <button
              onClick={onClose}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded transition-colors ml-1"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Document Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-[var(--text-primary)]">
          {/* Document Title Banner */}
          <div className="border-b border-[var(--border-subtle)] pb-4">
            <div className="text-[11px] text-[#7C5CFF] font-semibold uppercase tracking-wider">
              Project Specification & Geodetic Baseline
            </div>
            <h1 className="text-xl font-bold font-display text-[var(--text-primary)] mt-1">
              {report.projectTitle}
            </h1>
            <div className="text-[11px] text-[var(--text-muted)] mt-1.5 flex items-center gap-2 flex-wrap tabular-nums">
              <span>Timestamp: {new Date(report.generatedAt).toUTCString()}</span>
              <span>·</span>
              <span>Project ID: {report.projectId}</span>
            </div>
          </div>

          {/* Section 1: Executive Observations */}
          <section className="space-y-3">
            <h2 className="text-xs font-bold font-display uppercase tracking-wider text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-1.5">
              1. Executive Site Observations & Topologic Assessment
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {report.summaryStatements.map((item, idx) => (
                <div key={idx} className="p-3.5 bg-[var(--bg-surface-secondary)] border border-[var(--border-subtle)] rounded space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[var(--text-primary)]">{item.title}</span>
                    <MetricBadge classification={item.classification as any} />
                  </div>
                  <p className="text-[var(--text-secondary)] text-xs leading-relaxed">
                    {item.observation}
                  </p>
                  <div className="text-[11px] text-[var(--text-muted)] pt-1.5 border-t border-[var(--border-subtle)]">
                    Method: {item.evidence}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Section 2: Comprehensive Provenanced Metrics */}
          <section className="space-y-3">
            <h2 className="text-xs font-bold font-display uppercase tracking-wider text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-1.5">
              2. Scientific Provenance & Analytical Metrics Registry
            </h2>

            <div className="overflow-x-auto border border-[var(--border-subtle)] rounded bg-[var(--bg-surface-secondary)]">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] text-[var(--text-secondary)] text-[10px] font-semibold uppercase tracking-wider">
                    <th className="p-3">Metric</th>
                    <th className="p-3">Value</th>
                    <th className="p-3">Classification</th>
                    <th className="p-3">Source & Method</th>
                    <th className="p-3">Limitations & Uncertainty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {Object.entries(report.metricsByCategory).flatMap(([category, metrics]) =>
                    metrics.map((m) => (
                      <tr key={m.id} className="hover:bg-[var(--bg-surface-hover)] transition-colors">
                        <td className="p-3 font-medium text-[var(--text-primary)]">
                          {m.label}
                        </td>
                        <td className="p-3 font-semibold text-[var(--text-primary)] whitespace-nowrap tabular-nums">
                          {m.formattedValue || String(m.value)}
                        </td>
                        <td className="p-3">
                          <MetricBadge classification={m.classification} />
                        </td>
                        <td className="p-3 text-[var(--text-secondary)] text-[10px] max-w-[240px]">
                          <div className="text-[var(--text-primary)] font-medium">{m.source}</div>
                          <div className="text-[var(--text-muted)] mt-0.5">{m.calculationMethod}</div>
                        </td>
                        <td className="p-3 text-amber-600 dark:text-amber-400 text-[10px] max-w-[280px]">
                          {m.limitations}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-[var(--bg-surface-secondary)] border-t border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={onDownloadCSV}
              className="px-3 py-1.5 bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-emerald-500" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={onDownloadGeoJSON}
              className="px-3 py-1.5 bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-[#7C5CFF]" />
              <span>Export GeoJSON</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#7C5CFF] hover:bg-[#6B47FC] text-white font-medium rounded text-xs transition-colors shadow-sm"
          >
            Close Dossier
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Architectural Report Modal
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
  Printer, 
  ShieldCheck, 
  AlertTriangle 
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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 select-none">
      <div className="bg-[#0c121e] border border-[#233148] rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#080d16] border-b border-[#1c273a] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-[#8b5cf6]/20 border border-[#8b5cf6]/60 flex items-center justify-center text-[#c4b5fd]">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="font-mono text-sm font-bold text-white tracking-wide">
                SITE INTELLIGENCE DOSSIER
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                Authoritative Geodetic Datum: {report.authoritativeDatum}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyMarkdown}
              className="px-2.5 py-1.5 bg-[#141d2e] hover:bg-[#1d2b42] text-slate-200 border border-[#273854] rounded text-xs font-mono flex items-center gap-1.5 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-[#a78bfa]" />}
              <span>{copied ? 'Copied MD' : 'Copy Markdown'}</span>
            </button>

            <button
              onClick={onDownloadMarkdown}
              className="px-2.5 py-1.5 bg-[#141d2e] hover:bg-[#1d2b42] text-slate-200 border border-[#273854] rounded text-xs font-mono flex items-center gap-1.5 transition-colors"
              title="Download report as markdown"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>.MD</span>
            </button>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded transition-colors ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Document Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-300">
          {/* Document Title Banner */}
          <div className="border-b border-[#1f2b3e] pb-4">
            <div className="text-[11px] font-mono text-[#a78bfa] uppercase tracking-wider">
              Project Specification & Geodetic Baseline
            </div>
            <h1 className="text-xl font-bold text-white mt-1">
              {report.projectTitle}
            </h1>
            <div className="text-[11px] font-mono text-slate-400 mt-1 flex items-center gap-4 flex-wrap">
              <span>Timestamp: {new Date(report.generatedAt).toUTCString()}</span>
              <span>•</span>
              <span>Project ID: {report.projectId}</span>
            </div>
          </div>

          {/* Section 1: Executive Observations */}
          <section className="space-y-3">
            <h2 className="text-xs font-mono font-bold text-white uppercase tracking-wider text-slate-200 border-b border-[#1b263a] pb-1">
              1. Executive Site Observations & Topologic Assessment
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {report.summaryStatements.map((item, idx) => (
                <div key={idx} className="p-3 bg-[#111827] border border-[#202c40] rounded space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">{item.title}</span>
                    <MetricBadge classification={item.classification as any} />
                  </div>
                  <p className="text-slate-300 text-xs leading-relaxed">
                    {item.observation}
                  </p>
                  <div className="text-[10px] font-mono text-slate-500 pt-1 border-t border-[#1a2436]">
                    Method: {item.evidence}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Section 2: Comprehensive Provenanced Metrics */}
          <section className="space-y-3">
            <h2 className="text-xs font-mono font-bold text-white uppercase tracking-wider text-slate-200 border-b border-[#1b263a] pb-1">
              2. Scientific Provenance & Analytical Metrics Registry
            </h2>

            <div className="overflow-x-auto border border-[#1f2b3e] rounded bg-[#0e1524]">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="bg-[#080d16] border-b border-[#1f2b3e] font-mono text-slate-400 text-[10px] uppercase">
                    <th className="p-2.5">Metric</th>
                    <th className="p-2.5">Value</th>
                    <th className="p-2.5">Classification</th>
                    <th className="p-2.5">Source & Method</th>
                    <th className="p-2.5">Limitations & Uncertainty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#172235]">
                  {Object.entries(report.metricsByCategory).flatMap(([category, metrics]) =>
                    metrics.map((m) => (
                      <tr key={m.id} className="hover:bg-[#131c2c] transition-colors">
                        <td className="p-2.5 font-medium text-slate-200">
                          {m.label}
                        </td>
                        <td className="p-2.5 font-mono font-semibold text-white whitespace-nowrap">
                          {m.formattedValue || String(m.value)}
                        </td>
                        <td className="p-2.5">
                          <MetricBadge classification={m.classification} />
                        </td>
                        <td className="p-2.5 text-slate-400 text-[10px] max-w-[240px]">
                          <div className="text-slate-300 font-medium">{m.source}</div>
                          <div className="text-slate-500">{m.calculationMethod}</div>
                        </td>
                        <td className="p-2.5 text-amber-300/80 text-[10px] max-w-[280px]">
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
        <div className="px-5 py-3 bg-[#080d16] border-t border-[#1c273a] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={onDownloadCSV}
              className="px-3 py-1.5 bg-[#141d2e] hover:bg-[#1e2a3e] border border-[#233148] text-slate-200 rounded font-mono text-xs flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={onDownloadGeoJSON}
              className="px-3 py-1.5 bg-[#141d2e] hover:bg-[#1e2a3e] border border-[#233148] text-slate-200 rounded font-mono text-xs flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-violet-400" />
              <span>Export GeoJSON</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-medium rounded font-mono text-xs transition-colors"
          >
            Close Dossier
          </button>
        </div>
      </div>
    </div>
  );
};

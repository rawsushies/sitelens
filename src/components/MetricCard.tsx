/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Metric Card with Full Scientific Provenance & Limitation Disclosure
 */

import React, { useState } from 'react';
import { ProvenancedMetric, MetricClassification } from '../types';
import { Info, AlertTriangle, ShieldCheck, Database, Cpu, Compass } from 'lucide-react';

interface MetricCardProps {
  metric: ProvenancedMetric;
  compact?: boolean;
}

export function MetricBadge({ classification }: { classification: MetricClassification }) {
  switch (classification) {
    case 'geometry-derived':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-800/50">
          <ShieldCheck className="w-2.5 h-2.5" />
          geometry-derived
        </span>
      );
    case 'dataset-derived':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-sky-950/60 text-sky-400 border border-sky-800/50">
          <Database className="w-2.5 h-2.5" />
          dataset-derived
        </span>
      );
    case 'model-derived':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-violet-950/60 text-violet-400 border border-violet-800/50">
          <Cpu className="w-2.5 h-2.5" />
          model-derived
        </span>
      );
    case 'proxy':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-950/60 text-amber-400 border border-amber-800/50">
          <Compass className="w-2.5 h-2.5" />
          proxy indicator
        </span>
      );
    case 'unavailable':
    default:
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-900 text-slate-400 border border-slate-700">
          <AlertTriangle className="w-2.5 h-2.5 text-slate-500" />
          unavailable
        </span>
      );
  }
}

export const MetricCard: React.FC<MetricCardProps> = ({ metric, compact = false }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-[#131b2b] border border-[#233148] rounded hover:border-[#334664] transition-colors p-2.5 text-xs">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[#94a3b8] font-medium text-[11px] truncate uppercase tracking-wider">
            {metric.label}
          </div>
          <div className="text-base font-semibold text-white font-mono mt-0.5 flex items-baseline gap-1.5 flex-wrap">
            <span>{metric.formattedValue || String(metric.value ?? 'N/A')}</span>
            {metric.unit && metric.unit !== 'count' && metric.unit !== 'status' && metric.unit !== 'boolean' && (
              <span className="text-[11px] text-[#64748b] font-normal">{metric.unit}</span>
            )}
          </div>
        </div>
        <MetricBadge classification={metric.classification} />
      </div>

      {/* Warning notice if present */}
      {metric.warning && (
        <div className="mt-2 p-1.5 bg-amber-950/40 border border-amber-800/50 rounded flex items-start gap-1.5 text-amber-300 text-[11px]">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
          <span>{metric.warning}</span>
        </div>
      )}

      {/* Provenance Toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-2 w-full flex items-center justify-between text-[10px] font-mono text-[#7e8ea6] hover:text-[#a78bfa] transition-colors pt-1.5 border-t border-[#1c273a]"
      >
        <span className="flex items-center gap-1">
          <Info className="w-3 h-3 text-[#7e8ea6]" />
          {expanded ? 'Hide Provenance & Limitations' : 'Inspect Provenance & Limitations'}
        </span>
        <span>{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Expanded Provenance Details */}
      {expanded && (
        <div className="mt-2 pt-2 border-t border-[#1e2a3f] space-y-1.5 text-[10px] font-mono text-[#94a3b8] bg-[#0c1320] p-2 rounded">
          <div>
            <span className="text-[#64748b] uppercase">Source:</span>{' '}
            <span className="text-slate-200">{metric.source}</span>
          </div>
          <div>
            <span className="text-[#64748b] uppercase">Method:</span>{' '}
            <span className="text-slate-300">{metric.calculationMethod}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[#64748b] uppercase">Resolution:</span>{' '}
              <span className="text-slate-300">{metric.spatialResolution}</span>
            </div>
            <div>
              <span className="text-[#64748b] uppercase">Reference:</span>{' '}
              <span className="text-slate-300">{metric.timestampOrReferencePeriod}</span>
            </div>
          </div>
          <div className="p-1.5 bg-[#141d2e] rounded border border-[#212e45] text-amber-200/90">
            <span className="text-amber-400 font-semibold uppercase">Limitations:</span>{' '}
            {metric.limitations}
          </div>
        </div>
      )}
    </div>
  );
};

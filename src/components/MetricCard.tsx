/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Metric Card with Scientific Provenance & Limitation Disclosure (Design System v1.1)
 */

import React, { useState } from 'react';
import { ProvenancedMetric, MetricClassification } from '../types';
import { Info, AlertTriangle, ShieldCheck, Database, Cpu, Compass } from 'lucide-react';

interface MetricCardProps {
  metric: ProvenancedMetric;
  compact?: boolean;
}

export function MetricBadge({ classification }: { classification: MetricClassification }) {
  // Anti-slop zero-pill discipline: render as clean unboxed text with subtle indicator dot
  switch (classification) {
    case 'geometry-derived':
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          geometry-derived
        </span>
      );
    case 'dataset-derived':
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-sky-500">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-500" aria-hidden="true" />
          dataset-derived
        </span>
      );
    case 'model-derived':
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#7C5CFF]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#7C5CFF]" aria-hidden="true" />
          model-derived
        </span>
      );
    case 'proxy':
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-500">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true" />
          proxy indicator
        </span>
      );
    case 'unavailable':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" aria-hidden="true" />
          unavailable
        </span>
      );
  }
}

export const MetricCard: React.FC<MetricCardProps> = ({ metric, compact = false }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] rounded transition-colors p-3 text-xs">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[var(--text-secondary)] font-medium text-[11px] truncate uppercase tracking-wider">
            {metric.label}
          </div>
          <div className="text-base font-semibold text-[var(--text-primary)] tabular-nums mt-0.5 flex items-baseline gap-1.5 flex-wrap">
            <span>{metric.formattedValue || String(metric.value ?? 'N/A')}</span>
            {metric.unit && metric.unit !== 'count' && metric.unit !== 'status' && metric.unit !== 'boolean' && (
              <span className="text-[11px] text-[var(--text-muted)] font-normal">{metric.unit}</span>
            )}
          </div>
        </div>
        <MetricBadge classification={metric.classification} />
      </div>

      {/* Warning notice if present */}
      {metric.warning && (
        <div className="mt-2.5 p-2 bg-amber-500/10 border border-amber-500/30 rounded flex items-start gap-2 text-amber-600 dark:text-amber-400 text-[11px]">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{metric.warning}</span>
        </div>
      )}

      {/* Provenance Disclosure Toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-2.5 w-full flex items-center justify-between text-[11px] text-[var(--text-secondary)] hover:text-[#7C5CFF] transition-colors pt-2 border-t border-[var(--border-subtle)]"
      >
        <span className="flex items-center gap-1.5">
          <Info className="w-3 h-3 text-[var(--text-muted)]" />
          <span>{expanded ? 'Hide Provenance & Limitations' : 'Inspect Provenance & Limitations'}</span>
        </span>
        <span className="text-[10px] text-[var(--text-muted)]">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Expanded Provenance Details */}
      {expanded && (
        <div className="mt-2 pt-2 border-t border-[var(--border-subtle)] space-y-2 text-[11px] text-[var(--text-secondary)] bg-[var(--bg-surface-secondary)] p-2.5 rounded">
          <div>
            <span className="text-[var(--text-muted)] uppercase text-[10px] font-semibold tracking-wider block">
              Source & Provenance
            </span>
            <span className="text-[var(--text-primary)] font-medium mt-0.5 block">{metric.source}</span>
          </div>

          <div>
            <span className="text-[var(--text-muted)] uppercase text-[10px] font-semibold tracking-wider block">
              Calculation Method
            </span>
            <span className="text-[var(--text-primary)] mt-0.5 block">{metric.calculationMethod}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[var(--border-subtle)] text-[10px]">
            <div>
              <span className="text-[var(--text-muted)] block">Spatial Resolution</span>
              <span className="text-[var(--text-primary)] font-medium">{metric.spatialResolution}</span>
            </div>
            <div>
              <span className="text-[var(--text-muted)] block">Reference Period</span>
              <span className="text-[var(--text-primary)] font-medium">{metric.timestampOrReferencePeriod}</span>
            </div>
          </div>

          <div className="pt-1 border-t border-[var(--border-subtle)]">
            <span className="text-[var(--text-muted)] uppercase text-[10px] font-semibold tracking-wider block">
              Scientific Limitations
            </span>
            <span className="text-[var(--text-secondary)] mt-0.5 block italic">{metric.limitations}</span>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Design System v1.1 - Centralized Token Architecture
 *
 * Directive: TOPOGRAPHIC PRECISION × ARCHITECTURAL MINIMALISM × CONTEMPORARY DIGITAL DESIGN
 * Primary Brand Color: Geo Purple #7C5CFF
 */

export const tokens = {
  colors: {
    brand: {
      primary: '#7C5CFF', // Geo Purple
      hover: '#6B47FC',
      active: '#5A35EB',
      subtle: 'rgba(124, 92, 255, 0.12)',
      border: 'rgba(124, 92, 255, 0.35)',
      focus: 'rgba(124, 92, 255, 0.5)'
    },
    dark: {
      workspace: '#0A0E17',
      surface: '#101726',
      surfaceElevated: '#162032',
      surfaceSecondary: '#131B2A',
      surfaceHover: '#1B273E',
      textPrimary: '#F8FAFC',
      textSecondary: '#94A3B8',
      textMuted: '#64748B',
      borderSubtle: '#1E293B',
      borderStrong: '#334155',
      mapAttributionBg: 'rgba(10, 14, 23, 0.88)'
    },
    light: {
      workspace: '#F1F5F9',
      surface: '#FFFFFF',
      surfaceElevated: '#F8FAFC',
      surfaceSecondary: '#F1F5F9',
      surfaceHover: '#E2E8F0',
      textPrimary: '#0F172A',
      textSecondary: '#475569',
      textMuted: '#94A3B8',
      borderSubtle: '#E2E8F0',
      borderStrong: '#CBD5E1',
      mapAttributionBg: 'rgba(255, 255, 255, 0.92)'
    },
    status: {
      success: '#10B981',
      successSubtle: 'rgba(16, 185, 129, 0.12)',
      warning: '#F59E0B',
      warningSubtle: 'rgba(245, 158, 11, 0.12)',
      danger: '#EF4444',
      dangerSubtle: 'rgba(239, 68, 68, 0.12)',
      info: '#3B82F6',
      infoSubtle: 'rgba(59, 130, 246, 0.12)'
    }
  },
  typography: {
    fontFamily: {
      sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      display: "'Manrope', 'Inter', -apple-system, sans-serif"
    },
    // No monospace in UI — all numerical & spatial displays use tabular numerals in Inter
    features: {
      tabularNums: "'cv02', 'cv03', 'cv04', 'cv11', 'tnum'"
    }
  },
  radii: {
    sm: '4px',
    md: '6px',
    lg: '8px',
    xl: '12px',
    full: '9999px'
  },
  shadows: {
    subtle: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    panel: '0 4px 16px -2px rgba(0, 0, 0, 0.25)',
    floating: '0 8px 24px -4px rgba(0, 0, 0, 0.35)'
  },
  transitions: {
    fast: '150ms cubic-bezier(0.16, 1, 0.3, 1)',
    normal: '200ms cubic-bezier(0.16, 1, 0.3, 1)'
  }
} as const;

export type ThemeMode = 'dark' | 'light';

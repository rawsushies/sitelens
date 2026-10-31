/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Reporting Engine
 */

import { SiteProject, SiteFeature, ProvenancedMetric, PolygonAnalysis } from '../types';
import { inspectCoordinates } from '../coordinates';

export interface SiteIntelligenceReport {
  projectTitle: string;
  projectId: string;
  generatedAt: string;
  authoritativeDatum: string;
  primaryBoundary?: {
    name: string;
    areaM2: number;
    areaHectares: number;
    areaAcres: number;
    perimeterM: number;
    centroidDms: string;
    centroidUtm: string;
    bboxEnvelope: string;
  };
  metricsByCategory: Record<string, ProvenancedMetric[]>;
  summaryStatements: {
    title: string;
    observation: string;
    evidence: string;
    classification: string;
  }[];
}

/**
 * Generates an aggregated Site Intelligence Report for the active project
 */
export function generateSiteIntelligenceReport(
  project: SiteProject,
  activePolygonAnalysis?: PolygonAnalysis | null,
  climateMetrics?: Record<string, ProvenancedMetric>,
  solarMetrics?: Record<string, ProvenancedMetric>,
  urbanMetrics?: Record<string, ProvenancedMetric>
): SiteIntelligenceReport {
  const allMetrics: ProvenancedMetric[] = [];

  // Gather feature metrics
  for (const feat of project.features) {
    if (feat.properties.metrics) {
      allMetrics.push(...Object.values(feat.properties.metrics));
    }
  }

  // Gather additional contextual metrics
  if (climateMetrics) allMetrics.push(...Object.values(climateMetrics));
  if (solarMetrics) allMetrics.push(...Object.values(solarMetrics));
  if (urbanMetrics) allMetrics.push(...Object.values(urbanMetrics));

  // Deduplicate metrics by id
  const uniqueMetricsMap = new Map<string, ProvenancedMetric>();
  for (const m of allMetrics) {
    uniqueMetricsMap.set(m.id || m.name, m);
  }

  const metricsByCategory: Record<string, ProvenancedMetric[]> = {
    geometry: [],
    coordinates: [],
    solar: [],
    climate: [],
    urban: [],
    terrain: []
  };

  uniqueMetricsMap.forEach(m => {
    const cat = m.category || 'geometry';
    if (!metricsByCategory[cat]) metricsByCategory[cat] = [];
    metricsByCategory[cat].push(m);
  });

  let primaryBoundary = undefined;
  if (activePolygonAnalysis) {
    const centroidReport = inspectCoordinates(
      activePolygonAnalysis.centroid[0],
      activePolygonAnalysis.centroid[1]
    );
    primaryBoundary = {
      name: project.features.find(f => f.id === project.activeFeatureId)?.properties.name || 'Active Site Boundary',
      areaM2: activePolygonAnalysis.ellipsoidalAreaSqM,
      areaHectares: activePolygonAnalysis.ellipsoidalAreaHectares,
      areaAcres: activePolygonAnalysis.ellipsoidalAreaAcres,
      perimeterM: activePolygonAnalysis.ellipsoidalPerimeterM,
      centroidDms: centroidReport.dmsFormatted,
      centroidUtm: centroidReport.utm.formatted,
      bboxEnvelope: `EW: ${activePolygonAnalysis.bbox.eastWestSpanM}m x NS: ${activePolygonAnalysis.bbox.northSouthSpanM}m`
    };
  }

  const summaryStatements = [
    {
      title: 'Geodetic Site Enclosure',
      observation: activePolygonAnalysis
        ? `Site boundary encloses ${activePolygonAnalysis.ellipsoidalAreaSqM.toLocaleString()} m² (${activePolygonAnalysis.ellipsoidalAreaHectares.toFixed(3)} ha) of horizontal planimetric area.`
        : 'No closed polygon site boundary currently defined.',
      evidence: 'WGS84 ellipsoidal surface integral calculated via GeographicLib (Karney 2013).',
      classification: 'geometry-derived'
    },
    {
      title: 'Boundary Integrity & Topologic Conformance',
      observation: activePolygonAnalysis?.isSelfIntersecting
        ? 'Warning: Boundary contains self-intersecting segments (bowtie error). Vertex adjustment required.'
        : 'Boundary verified as simple, non-self-intersecting closed polygon ring.',
      evidence: 'Exhaustive edge intersection algorithm.',
      classification: 'geometry-derived'
    },
    {
      title: 'Solar Exposure Geometry',
      observation: solarMetrics?.solar_elevation?.value !== undefined
        ? `Current solar altitude is ${solarMetrics.solar_elevation.formattedValue} with azimuth ${solarMetrics.solar_azimuth?.formattedValue}.`
        : 'Solar calculation available upon coordinate selection.',
      evidence: 'NOAA astronomical solar algorithms based on Meeus celestial mechanics.',
      classification: 'model-derived'
    },
    {
      title: 'Urban Fabric & Infrastructure Context',
      observation: urbanMetrics?.osm_buildings_nearby?.value !== undefined
        ? `Surrounding parcel contains ${urbanMetrics.osm_buildings_nearby.formattedValue} and ${urbanMetrics.osm_roads_nearby?.formattedValue}.`
        : 'OpenStreetMap context query can be triggered on demand.',
      evidence: 'OpenStreetMap vector features via Overpass query API (ODbL).',
      classification: 'dataset-derived'
    }
  ];

  return {
    projectTitle: project.name,
    projectId: project.id,
    generatedAt: new Date().toISOString(),
    authoritativeDatum: 'WGS84 Ellipsoidal Datum (GRS80 compatible) & Local UTM Projection',
    primaryBoundary,
    metricsByCategory,
    summaryStatements
  };
}

/**
 * Converts SiteIntelligenceReport to clean structured Markdown
 */
export function reportToMarkdown(report: SiteIntelligenceReport): string {
  let md = `# SiteLens Geospatial Site Intelligence Report\n\n`;
  md += `**Project:** ${report.projectTitle}\n`;
  md += `**Report Generated:** ${new Date(report.generatedAt).toUTCString()}\n`;
  md += `**Authoritative Geodetic Datum:** ${report.authoritativeDatum}\n\n`;
  md += `---\n\n`;

  md += `## 1. Executive Site Observations\n\n`;
  for (const s of report.summaryStatements) {
    md += `### ${s.title}\n`;
    md += `- **Observation:** ${s.observation}\n`;
    md += `- **Evidence & Method:** ${s.evidence}\n`;
    md += `- **Classification:** \`${s.classification}\`\n\n`;
  }

  md += `## 2. Comprehensive Provenanced Metrics Registry\n\n`;
  md += `| Metric | Value | Unit | Classification | Source | Calculation Method | Limitations |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

  for (const cat of Object.keys(report.metricsByCategory)) {
    const list = report.metricsByCategory[cat];
    for (const m of list) {
      md += `| **${m.label}** | ${m.formattedValue || m.value} | ${m.unit} | \`${m.classification}\` | ${m.source} | ${m.calculationMethod} | ${m.limitations} |\n`;
    }
  }

  md += `\n---\n*Report generated by SiteLens Geospatial Site Intelligence Workstation. All measurements strictly maintain source provenance and uncertainty disclosures.*`;
  return md;
}

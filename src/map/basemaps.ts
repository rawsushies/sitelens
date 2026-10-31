/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Basemap Registry
 */

import { BasemapOption } from '../types';

export const BASEMAP_OPTIONS: BasemapOption[] = [
  {
    id: 'liberty',
    name: 'OpenFreeMap Liberty',
    attribution: '© OpenStreetMap contributors, OpenFreeMap',
    styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
    description: 'Vector cartography with clear topographic, building, and road hierarchy'
  },
  {
    id: 'dark',
    name: 'Carto Dark Matter',
    attribution: '© OpenStreetMap contributors, © CARTO',
    styleUrl: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    description: 'High-contrast dark architectural canvas for highlighting site geometries'
  },
  {
    id: 'osm',
    name: 'OpenFreeMap Positron',
    attribution: '© OpenStreetMap contributors, OpenFreeMap',
    styleUrl: 'https://tiles.openfreemap.org/styles/positron',
    description: 'Clean light technical drafting background'
  },
  {
    id: 'terrain',
    name: 'OpenTopo Topographic',
    attribution: '© OpenStreetMap, SRTM | Kartendaten: OpenTopoMap (CC-BY-SA)',
    styleUrl: {
      version: 8,
      sources: {
        'opentopo-tiles': {
          type: 'raster',
          tiles: [
            'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
            'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
            'https://c.tile.opentopomap.org/{z}/{x}/{y}.png'
          ],
          tileSize: 256,
          attribution: 'Map data: © OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)'
        }
      },
      layers: [
        {
          id: 'opentopo-layer',
          type: 'raster',
          source: 'opentopo-tiles',
          minzoom: 0,
          maxzoom: 17
        }
      ]
    } as any,
    description: 'Topographic contour lines, elevation shading, and natural features'
  }
];

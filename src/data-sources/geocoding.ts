/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * SiteLens Geospatial Site Intelligence Workstation - Open Geocoding Service
 */

export interface GeocodingResult {
  name: string;
  label: string;
  longitude: number;
  latitude: number;
  type?: string;
  country?: string;
  postcode?: string;
}

/**
 * Searches locations using open Photon (OSM-based) and Nominatim geocoders
 */
export async function searchLocations(query: string): Promise<GeocodingResult[]> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) return [];

  // Try Photon first (fast, open, CORS enabled)
  try {
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(trimmed)}&limit=7`);
    if (res.ok) {
      const data = await res.json();
      const features: any[] = data.features || [];
      return features.map(f => {
        const p = f.properties || {};
        const coords = f.geometry?.coordinates || [0, 0];
        const parts = [
          p.name,
          p.street ? `${p.housenumber ? p.housenumber + ' ' : ''}${p.street}` : null,
          p.city || p.town || p.district,
          p.state,
          p.country
        ].filter(Boolean);

        return {
          name: p.name || parts[0] || 'Unknown Place',
          label: parts.join(', '),
          longitude: coords[0],
          latitude: coords[1],
          type: p.osm_value || p.type,
          country: p.country,
          postcode: p.postcode,
        };
      });
    }
  } catch (err) {
    console.warn('Photon geocoding error, falling back to Nominatim', err);
  }

  // Fallback to OpenStreetMap Nominatim
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmed)}&limit=5&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (res.ok) {
      const data: any[] = await res.json();
      return data.map(item => ({
        name: item.name || item.display_name.split(',')[0],
        label: item.display_name,
        longitude: parseFloat(item.lon),
        latitude: parseFloat(item.lat),
        type: item.type,
      }));
    }
  } catch (err) {
    console.error('Nominatim geocoding error:', err);
  }

  return [];
}

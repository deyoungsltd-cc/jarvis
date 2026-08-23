/**
 * Weather Plugin for JARVIS
 *
 * Fetches current weather from wttr.in — free, no API key required.
 * GET https://wttr.in/{location}?format=j1
 */

export default {
  name: 'weather',
  description: 'Fetches current weather conditions for a given location using wttr.in (free, no API key)',
  inputSchema: {
    type: 'object',
    properties: {
      location: { type: 'string', description: 'City name or location (e.g. "London", "Tokyo")' },
      units:    { type: 'string', description: 'Temperature units: "metric" (default) or "imperial"' },
    },
    required: ['location'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      location:     { type: 'string' },
      temperature:  { type: 'number' },
      feelsLike:    { type: 'number' },
      condition:    { type: 'string' },
      humidity:     { type: 'number' },
      windSpeed:    { type: 'number' },
      windDirection:{ type: 'string' },
      visibility:   { type: 'number' },
      units:        { type: 'string' },
    },
  },
  riskLevel: 'low',

  async execute(input) {
    const start = Date.now();
    const location = encodeURIComponent(String(input.location));
    const isImperial = input.units === 'imperial';

    try {
      const url = `https://wttr.in/${location}?format=j1`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'JARVIS-Plugin/1.0' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return {
          success: false,
          output: null,
          error: `Weather API returned status ${response.status}`,
          durationMs: Date.now() - start,
        };
      }

      const data = await response.json();
      const current = data.current_condition?.[0];
      if (!current) {
        return {
          success: false,
          output: null,
          error: 'No weather data returned for location',
          durationMs: Date.now() - start,
        };
      }

      const tempC      = parseFloat(current.temp_C);
      const feelsLikeC = parseFloat(current.FeelsLikeC);
      const windKph    = parseFloat(current.windspeedKmph);
      const visKm      = parseFloat(current.visibility);

      let temperature, feelsLike, windSpeed, visibility;

      if (isImperial) {
        temperature = Math.round((tempC * 9 / 5 + 32) * 100) / 100;
        feelsLike   = Math.round((feelsLikeC * 9 / 5 + 32) * 100) / 100;
        windSpeed   = Math.round((windKph / 1.60934) * 100) / 100;
        visibility  = Math.round((visKm / 1.60934) * 100) / 100;
      } else {
        temperature = tempC;
        feelsLike   = feelsLikeC;
        windSpeed   = windKph;
        visibility  = visKm;
      }

      return {
        success: true,
        output: {
          location:      data.nearest_area?.[0]?.areaName?.[0]?.value || String(input.location),
          temperature,
          feelsLike,
          condition:     current.weatherDesc?.[0]?.value || 'Unknown',
          humidity:      parseInt(current.humidity, 10),
          windSpeed,
          windDirection: current.winddir16Point || 'N/A',
          visibility,
          units:         isImperial ? 'imperial' : 'metric',
        },
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        output: null,
        error: `Weather fetch failed: ${err.message}`,
        durationMs: Date.now() - start,
      };
    }
  },
};

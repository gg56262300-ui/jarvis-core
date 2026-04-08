import { logger } from '../shared/logger/logger.js';

type GeocodingResult = {
  latitude: number;
  longitude: number;
  name: string;
  country?: string;
};

type WeatherResult = {
  place: string;
  temperature: number | null;
  windSpeed: number | null;
  weatherCode: number | null;
  responseText: string;
};

export class WeatherService {
  async debugGeocoding(query: string) {
    const normalizedQuery = this.normalizePlaceQuery(query);
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(normalizedQuery)}&count=10&language=et&format=json`;
    const response = await fetch(url);
    const data = await response.json() as { results?: Array<Record<string, unknown>> };
    return {
      query,
      normalizedQuery,
      results: data.results ?? [],
    };
  }

  async getWeather(placeQuery: string): Promise<WeatherResult> {
    const place = await this.findPlace(placeQuery);
    const weather = await this.fetchWeather(place.latitude, place.longitude);

    const placeLabel = place.country ? `${place.name}, ${place.country}` : place.name;
    const tempText = weather.temperature !== null ? `${weather.temperature} kraadi` : 'temperatuur puudub';
    const windText = weather.windSpeed !== null ? `${weather.windSpeed} m/s` : 'tuuleinfo puudub';
    const codeText = this.describeWeatherCode(weather.weatherCode);

    return {
      place: placeLabel,
      temperature: weather.temperature,
      windSpeed: weather.windSpeed,
      weatherCode: weather.weatherCode,
      responseText: `${placeLabel}: ${codeText}, temperatuur ${tempText}, tuul ${windText}.`,
    };
  }

  private async findPlace(query: string): Promise<GeocodingResult> {
    const knownPlace = this.resolveKnownPlace(query);

    if (knownPlace) {
      return knownPlace;
    }

    const startedAt = Date.now();
    const normalizedQuery = this.normalizePlaceQuery(query);
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(normalizedQuery)}&count=10&language=et&format=json`;
    const response = await fetch(url);

    logger.info(
      { provider: 'open-meteo', operation: 'weather.geocoding', durationMs: Date.now() - startedAt, query },
      'External API latency',
    );

    if (!response.ok) {
      throw new Error('GEOCODING_FAILED');
    }

    const data = await response.json() as {
      results?: Array<{
        latitude: number;
        longitude: number;
        name: string;
        country?: string;
      }>;
    };

    const results = data.results ?? [];
    if (!results.length) {
      throw new Error('PLACE_NOT_FOUND');
    }

    const preferred = results.find((item) =>
      ['Spain', 'Hispaania', 'España'].includes(item.country ?? '')
    ) ?? results[0];

    return {
      latitude: preferred.latitude,
      longitude: preferred.longitude,
      name: preferred.name,
      country: preferred.country,
    };
  }

  private async fetchWeather(latitude: number, longitude: number) {
    const startedAt = Date.now();
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`;
    const response = await fetch(url);

    logger.info(
      {
        provider: 'open-meteo',
        operation: 'weather.current',
        durationMs: Date.now() - startedAt,
        latitude,
        longitude,
      },
      'External API latency',
    );

    if (!response.ok) {
      throw new Error('WEATHER_FAILED');
    }

    const data = await response.json() as {
      current?: {
        temperature_2m?: number;
        weather_code?: number;
        wind_speed_10m?: number;
      };
    };

    return {
      temperature: data.current?.temperature_2m ?? null,
      weatherCode: data.current?.weather_code ?? null,
      windSpeed: data.current?.wind_speed_10m ?? null,
    };
  }

  private normalizePlaceQuery(query: string) {
    return query.trim();
  }

  private resolveKnownPlace(query: string): GeocodingResult | null {
    const normalized = query.trim().toLowerCase();

    if (['calpe', 'calpes', 'calp'].includes(normalized)) {
      return {
        latitude: 38.6447,
        longitude: 0.0445,
        name: 'Calpe',
        country: 'Hispaania',
      };
    }

    return null;
  }

  private describeWeatherCode(code: number | null) {
    const map: Record<number, string> = {
      0: 'selge',
      1: 'enamasti selge',
      2: 'vahelduv pilvisus',
      3: 'pilvine',
      45: 'udu',
      48: 'härmatisudu',
      51: 'nõrk uduvihm',
      53: 'mõõdukas uduvihm',
      55: 'tugev uduvihm',
      61: 'nõrk vihm',
      63: 'mõõdukas vihm',
      65: 'tugev vihm',
      71: 'nõrk lumi',
      73: 'mõõdukas lumi',
      75: 'tugev lumi',
      80: 'vihmahood',
      81: 'tugevamad vihmahood',
      82: 'väga tugevad vihmahood',
      95: 'äike',
    };

    return code !== null && map[code] ? map[code] : 'ilmaseis teadmata';
  }
}

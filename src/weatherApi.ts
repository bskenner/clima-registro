import type { WeatherApiResponse } from './types';
import { validateCoordinates } from './utils';

interface OpenMeteoCurrent {
  time?: string;
  temperature_2m?: number;
  relative_humidity_2m?: number;
  precipitation?: number;
  rain?: number;
  weather_code?: number;
  surface_pressure?: number;
  wind_speed_10m?: number;
}

interface OpenMeteoResponse {
  current?: OpenMeteoCurrent;
}

export async function fetchCurrentWeather(latitude: number, longitude: number): Promise<WeatherApiResponse> {
  if (!validateCoordinates(latitude, longitude)) {
    throw new Error('Coordenadas inválidas.');
  }

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current:
      'temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,surface_pressure,wind_speed_10m',
    timezone: 'America/Sao_Paulo',
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Open-Meteo respondeu com status ${response.status}.`);
  }

  const payload = (await response.json()) as OpenMeteoResponse;
  const current = payload.current;
  if (!current) {
    throw new Error('Resposta da Open-Meteo não trouxe dados atuais.');
  }

  const weatherCode = current.weather_code ?? null;

  return {
    temperatureC: normalizeNumber(current.temperature_2m),
    humidityPercent: normalizeNumber(current.relative_humidity_2m),
    precipitationMm: normalizeNumber(current.precipitation ?? current.rain),
    pressureHpa: normalizeNumber(current.surface_pressure),
    windKmh: normalizeNumber(current.wind_speed_10m),
    weatherCode,
    weatherCondition: mapWeatherCodeToPortuguese(weatherCode),
    source: 'Open-Meteo',
    dateTime: normalizeOpenMeteoTime(current.time),
  };
}

export function mapWeatherCodeToPortuguese(code: number | null): string {
  if (code === 0) return 'Limpo';
  if (code === 1 || code === 2) return 'Parcialmente nublado';
  if (code === 3) return 'Nublado';
  if (code === 45 || code === 48) return 'Nevoeiro';
  if (code === 51 || code === 53 || code === 55) return 'Garoa';
  if (code === 61 || code === 80) return 'Chuva fraca';
  if (code === 63 || code === 81) return 'Chuva moderada';
  if (code === 65 || code === 82) return 'Chuva forte';
  if (code === 71 || code === 73 || code === 75 || code === 77) return 'Geada';
  if (code === 95 || code === 96 || code === 99) return 'Temporal';
  return 'Outro';
}

function normalizeNumber(value: number | undefined): number | null {
  return Number.isFinite(value) ? Number(value) : null;
}

function normalizeOpenMeteoTime(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const date = new Date(`${value}-03:00`);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

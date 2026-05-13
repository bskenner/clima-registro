import type { AlertEvent, WeatherRecord, WeatherSummary } from './types';
import { APP_TIMEZONE } from './config';

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: APP_TIMEZONE,
  }).format(date);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeZone: APP_TIMEZONE,
  }).format(date);
}

export function parseNumber(value: FormDataEntryValue | string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = String(value).trim().replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function validateCoordinates(latitude: number | null, longitude: number | null): boolean {
  if (latitude === null || longitude === null) return false;
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

export function calculateSummary(records: WeatherRecord[], alerts: AlertEvent[] = []): WeatherSummary {
  const averageTemperatureC = average(records.map((record) => record.temperature_c));
  const averagePressureHpa = average(records.map((record) => record.pressure_hpa));
  const averageHumidityPercent = average(records.map((record) => record.humidity_percent));

  return {
    totalRecords: records.length,
    rainTotalMm: sum(records.map((record) => record.precipitation_mm)),
    averageTemperatureC,
    averagePressureHpa,
    averageHumidityPercent,
    activeAlerts: alerts.filter((alert) => !alert.is_read).length,
  };
}

export function groupRecordsByDate(records: WeatherRecord[]): Map<string, WeatherRecord[]> {
  const groups = new Map<string, WeatherRecord[]>();

  for (const record of records) {
    const key = getLocalDateKey(record.date_time);
    const existing = groups.get(key) ?? [];
    existing.push(record);
    groups.set(key, existing);
  }

  return groups;
}

export function groupRecordsByLocation(records: WeatherRecord[]): Map<string, WeatherRecord[]> {
  const groups = new Map<string, WeatherRecord[]>();

  for (const record of records) {
    const key = record.location_id;
    const existing = groups.get(key) ?? [];
    existing.push(record);
    groups.set(key, existing);
  }

  return groups;
}

export function getLocalDateKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const partMap = new Map(parts.map((part) => [part.type, part.value]));
  return `${partMap.get('year') ?? '0000'}-${partMap.get('month') ?? '00'}-${partMap.get('day') ?? '00'}`;
}

function sum(values: Array<number | null>): number {
  return values.reduce<number>((total, value) => total + (Number.isFinite(value) ? Number(value) : 0), 0);
}

function average(values: Array<number | null>): number | null {
  const numericValues = values.filter((value): value is number => Number.isFinite(value));
  if (numericValues.length === 0) return null;
  return sum(numericValues) / numericValues.length;
}

import type { CsvImportResult, Location, Region, WeatherRecord, WeatherRecordInput } from './types';
import { generateId } from './utils';

const headers = [
  'id',
  'date_time',
  'region_id',
  'region_name',
  'location_id',
  'location_name',
  'precipitation_mm',
  'weather_condition',
  'weather_code',
  'temperature_c',
  'pressure_hpa',
  'humidity_percent',
  'wind_kmh',
  'source',
  'notes',
];

export function recordsToCsv(records: WeatherRecord[]): string {
  const rows = records.map((record) =>
    [
      record.id,
      record.date_time,
      record.region_id ?? '',
      record.regions?.name ?? '',
      record.location_id,
      record.locations?.name ?? '',
      formatNumber(record.precipitation_mm),
      record.weather_condition ?? '',
      record.weather_code ?? '',
      formatNumber(record.temperature_c),
      formatNumber(record.pressure_hpa),
      formatNumber(record.humidity_percent),
      formatNumber(record.wind_kmh),
      record.source,
      record.notes ?? '',
    ].map(escapeCsv),
  );

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

export function csvToRecords(csv: string, locations: Location[] = [], regions: Region[] = []): CsvImportResult {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return {
      records: [],
      errors: ['CSV sem linhas de dados.'],
    };
  }

  const parsedHeaders = parseCsvLine(lines[0] ?? '').map((header) => header.trim());
  const records: WeatherRecordInput[] = [];
  const errors: string[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const rowValues = parseCsvLine(lines[index] ?? '');
    const row = Object.fromEntries(parsedHeaders.map((header, headerIndex) => [header, rowValues[headerIndex] ?? '']));
    const result = validateCsvRow(row, index + 1, locations, regions);
    if (result.errors.length > 0) errors.push(...result.errors);
    if (result.record) records.push(result.record);
  }

  return { records, errors };
}

export function validateCsvRow(
  row: Record<string, string>,
  rowNumber = 1,
  locations: Location[] = [],
  regions: Region[] = [],
): { record: WeatherRecordInput | null; errors: string[] } {
  const errors: string[] = [];
  const location = findLocation(row, locations);
  const region = findRegion(row, regions);
  const dateTime = row.date_time?.trim();
  const parsedDate = dateTime ? new Date(dateTime) : null;

  if (!location && !row.location_id?.trim()) errors.push(`Linha ${rowNumber}: local não encontrado.`);
  if (!dateTime || !parsedDate || Number.isNaN(parsedDate.getTime())) errors.push(`Linha ${rowNumber}: data inválida.`);

  if (errors.length > 0) {
    return {
      record: null,
      errors,
    };
  }

  return {
    record: {
      id: row.id?.trim() || generateId(),
      location_id: row.location_id?.trim() || location?.id || '',
      region_id: row.region_id?.trim() || region?.id || location?.region_id || null,
      date_time: parsedDate?.toISOString() ?? new Date().toISOString(),
      precipitation_mm: parseBrazilianNumber(row.precipitation_mm),
      weather_condition: row.weather_condition?.trim() || null,
      weather_code: parseBrazilianNumber(row.weather_code),
      temperature_c: parseBrazilianNumber(row.temperature_c),
      pressure_hpa: parseBrazilianNumber(row.pressure_hpa),
      humidity_percent: parseBrazilianNumber(row.humidity_percent),
      wind_kmh: parseBrazilianNumber(row.wind_kmh),
      source: row.source?.trim() || 'Manual',
      notes: row.notes?.trim() || null,
    },
    errors: [],
  };
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function parseBrazilianNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function escapeCsv(value: string | number): string {
  const text = String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function formatNumber(value: number | null): string {
  return value === null ? '' : String(value).replace('.', ',');
}

function findLocation(row: Record<string, string>, locations: Location[]): Location | undefined {
  const locationId = row.location_id?.trim();
  if (locationId) return locations.find((location) => location.id === locationId);
  const locationName = row.location_name?.trim().toLowerCase();
  if (!locationName) return undefined;
  return locations.find((location) => location.name.toLowerCase() === locationName);
}

function findRegion(row: Record<string, string>, regions: Region[]): Region | undefined {
  const regionId = row.region_id?.trim();
  if (regionId) return regions.find((region) => region.id === regionId);
  const regionName = row.region_name?.trim().toLowerCase();
  if (!regionName) return undefined;
  return regions.find((region) => region.name.toLowerCase() === regionName);
}

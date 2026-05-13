import { createClient } from '@supabase/supabase-js';
import { createAlertEvents, detectAlertsForRecord } from '../src/alerts';
import { fetchCurrentWeather } from '../src/weatherApi';
import { getLocalDateKey } from '../src/utils';
import type { AlertRule, Location, WeatherRecord, WeatherRecordInput } from '../src/types';

const AUTO_NOTE = 'Coleta automática diária';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY antes de executar a coleta.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function main(): Promise<void> {
  console.log('Iniciando coleta diária de clima...');

  const { data: locations, error } = await supabase
    .from('locations')
    .select('*')
    .eq('is_active', true)
    .eq('collect_daily', true)
    .order('name', { ascending: true });

  if (error) throw new Error(`Erro ao carregar locais: ${error.message}`);

  const activeLocations = normalizeLocations(locations ?? []);
  console.log(`Locais ativos para coleta: ${activeLocations.length}`);

  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  let alertsCreated = 0;

  for (const location of activeLocations) {
    try {
      const result = await collectForLocation(location);
      if (result.status === 'inserted') inserted += 1;
      if (result.status === 'skipped') skipped += 1;
      alertsCreated += result.alertsCreated;
    } catch (errorItem) {
      failed += 1;
      console.error(`Falha ao coletar ${location.name}:`, errorItem);
    }
  }

  console.log(
    `Coleta concluída. Inseridos: ${inserted}. Ignorados por duplicidade: ${skipped}. Alertas: ${alertsCreated}. Falhas: ${failed}.`,
  );

  if (failed > 0) {
    process.exitCode = 1;
  }
}

async function collectForLocation(
  location: Location,
): Promise<{ status: 'inserted' | 'skipped'; alertsCreated: number }> {
  const weather = await fetchCurrentWeather(location.latitude, location.longitude);
  const localDateKey = getLocalDateKey(weather.dateTime);
  const duplicate = await hasAutomaticRecordForDate(location.id, localDateKey);

  if (duplicate) {
    console.log(`Ignorado: ${location.name} já tem coleta Open-Meteo em ${localDateKey}.`);
    return { status: 'skipped', alertsCreated: 0 };
  }

  const recordInput: WeatherRecordInput = {
    user_id: location.user_id,
    location_id: location.id,
    region_id: location.region_id,
    date_time: weather.dateTime,
    precipitation_mm: weather.precipitationMm,
    weather_condition: weather.weatherCondition,
    weather_code: weather.weatherCode,
    temperature_c: weather.temperatureC,
    pressure_hpa: weather.pressureHpa,
    humidity_percent: weather.humidityPercent,
    wind_kmh: weather.windKmh,
    source: weather.source,
    notes: AUTO_NOTE,
  };

  const { data, error } = await supabase.from('weather_records').insert(recordInput).select('*').single();
  if (error) throw new Error(`Erro ao inserir registro: ${error.message}`);

  const insertedRecord = normalizeWeatherRecord(data);
  const previousRecord = await getPreviousRecord(insertedRecord);
  const rules = await getAlertRules(location.id);
  const alertEvents = detectAlertsForRecord(insertedRecord, previousRecord, rules, locationLabel(location));

  await createAlertEvents(alertEvents, async (event) => {
    const { error: alertError } = await supabase.from('alert_events').insert(event);
    if (alertError) throw new Error(`Erro ao inserir alerta: ${alertError.message}`);
  });

  console.log(
    `Inserido: ${location.name} (${localDateKey}) - ${weather.weatherCondition}, ${weather.temperatureC ?? '-'} °C.`,
  );

  return { status: 'inserted', alertsCreated: alertEvents.length };
}

async function hasAutomaticRecordForDate(locationId: string, localDateKey: string): Promise<boolean> {
  const range = localDateRangeUtc(localDateKey);
  const { data, error } = await supabase
    .from('weather_records')
    .select('id')
    .eq('location_id', locationId)
    .eq('source', 'Open-Meteo')
    .eq('notes', AUTO_NOTE)
    .gte('date_time', range.startIso)
    .lt('date_time', range.endIso)
    .limit(1);

  if (error) throw new Error(`Erro ao verificar duplicidade: ${error.message}`);
  return (data ?? []).length > 0;
}

async function getPreviousRecord(record: WeatherRecord): Promise<WeatherRecord | null> {
  const { data, error } = await supabase
    .from('weather_records')
    .select('*')
    .eq('location_id', record.location_id)
    .lt('date_time', record.date_time)
    .neq('id', record.id)
    .order('date_time', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Erro ao consultar registro anterior: ${error.message}`);
  return data ? normalizeWeatherRecord(data) : null;
}

async function getAlertRules(locationId: string): Promise<AlertRule[]> {
  const { data, error } = await supabase
    .from('alert_rules')
    .select('*')
    .eq('location_id', locationId)
    .eq('is_active', true);

  if (error) throw new Error(`Erro ao carregar regras de alerta: ${error.message}`);
  return (data ?? []) as AlertRule[];
}

function localDateRangeUtc(localDateKey: string): { startIso: string; endIso: string } {
  const start = new Date(`${localDateKey}T00:00:00-03:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function normalizeLocations(rows: unknown[]): Location[] {
  return rows.map((row) => {
    const location = row as Location;
    return {
      ...location,
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
    };
  });
}

function normalizeWeatherRecord(row: unknown): WeatherRecord {
  const record = row as WeatherRecord;
  return {
    ...record,
    precipitation_mm: nullableNumber(record.precipitation_mm),
    temperature_c: nullableNumber(record.temperature_c),
    pressure_hpa: nullableNumber(record.pressure_hpa),
    humidity_percent: nullableNumber(record.humidity_percent),
    wind_kmh: nullableNumber(record.wind_kmh),
  };
}

function nullableNumber(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function locationLabel(location: Location): string {
  if (location.city && location.state) return `${location.city}/${location.state}`;
  return location.name;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

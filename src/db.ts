import { createAlertEvents, detectAlertsForRecord } from './alerts';
import { supabase } from './supabaseClient';
import type {
  AlertEvent,
  AlertRule,
  AlertRuleInput,
  Location,
  LocationInput,
  RecordFilters,
  Region,
  RegionInput,
  WeatherRecord,
  WeatherRecordInput,
} from './types';

const WEATHER_SELECT = '*, regions(name), locations(name, city, state)';

export async function getRegions(): Promise<Region[]> {
  const { data, error } = await supabase.from('regions').select('*').order('name', { ascending: true });
  if (error) throw new Error(`Erro ao carregar regiões: ${error.message}`);
  return (data ?? []) as Region[];
}

export async function createRegion(input: RegionInput): Promise<Region> {
  const userId = await getRequiredUserId();
  const { data, error } = await supabase
    .from('regions')
    .insert({ ...input, user_id: userId })
    .select('*')
    .single();
  if (error) throw new Error(`Erro ao criar região: ${error.message}`);
  return data as Region;
}

export async function updateRegion(id: string, input: Partial<RegionInput>): Promise<Region> {
  const { data, error } = await supabase.from('regions').update(input).eq('id', id).select('*').single();
  if (error) throw new Error(`Erro ao atualizar região: ${error.message}`);
  return data as Region;
}

export async function deleteRegion(id: string): Promise<void> {
  const { error } = await supabase.from('regions').delete().eq('id', id);
  if (error) throw new Error(`Erro ao excluir região: ${error.message}`);
}

export async function getLocations(): Promise<Location[]> {
  const { data, error } = await supabase.from('locations').select('*, regions(name)').order('name', { ascending: true });
  if (error) throw new Error(`Erro ao carregar locais: ${error.message}`);
  return normalizeLocations(data ?? []);
}

export async function createLocation(input: LocationInput): Promise<Location> {
  const userId = await getRequiredUserId();
  const { data, error } = await supabase
    .from('locations')
    .insert({ ...input, user_id: userId })
    .select('*, regions(name)')
    .single();
  if (error) throw new Error(`Erro ao criar local: ${error.message}`);
  return normalizeLocation(data);
}

export async function updateLocation(id: string, input: Partial<LocationInput>): Promise<Location> {
  const { data, error } = await supabase
    .from('locations')
    .update(input)
    .eq('id', id)
    .select('*, regions(name)')
    .single();
  if (error) throw new Error(`Erro ao atualizar local: ${error.message}`);
  return normalizeLocation(data);
}

export async function deleteLocation(id: string): Promise<void> {
  const { error } = await supabase.from('locations').delete().eq('id', id);
  if (error) throw new Error(`Erro ao excluir local: ${error.message}`);
}

export async function getWeatherRecords(filters: RecordFilters = {}): Promise<WeatherRecord[]> {
  let query = supabase.from('weather_records').select(WEATHER_SELECT);

  if (filters.regionId) query = query.eq('region_id', filters.regionId);
  if (filters.locationId) query = query.eq('location_id', filters.locationId);
  if (filters.condition) query = query.eq('weather_condition', filters.condition);
  if (filters.source) query = query.eq('source', filters.source);
  if (filters.startDate) query = query.gte('date_time', localDateStartIso(filters.startDate));
  if (filters.endDate) query = query.lt('date_time', localDateEndIso(filters.endDate));
  if (filters.search) {
    const search = escapeSearch(filters.search);
    query = query.or(`notes.ilike.%${search}%,weather_condition.ilike.%${search}%,source.ilike.%${search}%`);
  }

  query = query.order('date_time', { ascending: false });
  if (filters.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw new Error(`Erro ao carregar registros: ${error.message}`);
  return normalizeWeatherRecords(data ?? []);
}

export async function createWeatherRecord(input: WeatherRecordInput): Promise<WeatherRecord> {
  const userId = await getRequiredUserId();
  const { data, error } = await supabase
    .from('weather_records')
    .insert({ ...input, user_id: userId })
    .select(WEATHER_SELECT)
    .single();

  if (error) throw new Error(`Erro ao criar registro: ${error.message}`);

  const inserted = normalizeWeatherRecord(data);
  const previous = await getPreviousRecord(inserted.location_id, inserted.date_time, inserted.id);
  const rules = await getAlertRules(inserted.location_id);
  await createAlertEvents(detectAlertsForRecord(inserted, previous, rules, getLocationLabel(inserted)));
  return inserted;
}

export async function updateWeatherRecord(id: string, input: Partial<WeatherRecordInput>): Promise<WeatherRecord> {
  const { data, error } = await supabase
    .from('weather_records')
    .update(input)
    .eq('id', id)
    .select(WEATHER_SELECT)
    .single();
  if (error) throw new Error(`Erro ao atualizar registro: ${error.message}`);
  return normalizeWeatherRecord(data);
}

export async function deleteWeatherRecord(id: string): Promise<void> {
  const { error } = await supabase.from('weather_records').delete().eq('id', id);
  if (error) throw new Error(`Erro ao excluir registro: ${error.message}`);
}

export async function getAlertEvents(): Promise<AlertEvent[]> {
  const { data, error } = await supabase
    .from('alert_events')
    .select('*, locations(name, city, state)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Erro ao carregar alertas: ${error.message}`);
  return (data ?? []) as AlertEvent[];
}

export async function markAlertAsRead(id: string): Promise<void> {
  const { error } = await supabase.from('alert_events').update({ is_read: true }).eq('id', id);
  if (error) throw new Error(`Erro ao marcar alerta como lido: ${error.message}`);
}

export async function deleteAlertEvent(id: string): Promise<void> {
  const { error } = await supabase.from('alert_events').delete().eq('id', id);
  if (error) throw new Error(`Erro ao excluir alerta: ${error.message}`);
}

export async function getAlertRules(locationId?: string): Promise<AlertRule[]> {
  let query = supabase.from('alert_rules').select('*').order('created_at', { ascending: true });
  if (locationId) query = query.eq('location_id', locationId);
  const { data, error } = await query;
  if (error) throw new Error(`Erro ao carregar regras de alerta: ${error.message}`);
  return (data ?? []) as AlertRule[];
}

export async function createAlertRule(input: AlertRuleInput): Promise<AlertRule> {
  const userId = await getRequiredUserId();
  const { data, error } = await supabase
    .from('alert_rules')
    .insert({ ...input, user_id: userId })
    .select('*')
    .single();
  if (error) throw new Error(`Erro ao criar regra de alerta: ${error.message}`);
  return data as AlertRule;
}

export async function updateAlertRule(id: string, input: Partial<AlertRuleInput>): Promise<AlertRule> {
  const { data, error } = await supabase.from('alert_rules').update(input).eq('id', id).select('*').single();
  if (error) throw new Error(`Erro ao atualizar regra de alerta: ${error.message}`);
  return data as AlertRule;
}

export async function deleteAlertRule(id: string): Promise<void> {
  const { error } = await supabase.from('alert_rules').delete().eq('id', id);
  if (error) throw new Error(`Erro ao excluir regra de alerta: ${error.message}`);
}

async function getRequiredUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Usuário não autenticado.');
  return data.user.id;
}

async function getPreviousRecord(
  locationId: string,
  dateTime: string,
  excludeRecordId?: string,
): Promise<WeatherRecord | null> {
  let query = supabase
    .from('weather_records')
    .select(WEATHER_SELECT)
    .eq('location_id', locationId)
    .lt('date_time', dateTime)
    .order('date_time', { ascending: false })
    .limit(1);

  if (excludeRecordId) query = query.neq('id', excludeRecordId);

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Erro ao consultar registro anterior: ${error.message}`);
  return data ? normalizeWeatherRecord(data) : null;
}

function normalizeLocations(rows: unknown[]): Location[] {
  return rows.map((row) => normalizeLocation(row));
}

function normalizeLocation(row: unknown): Location {
  const location = row as Location;
  return {
    ...location,
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
  };
}

function normalizeWeatherRecords(rows: unknown[]): WeatherRecord[] {
  return rows.map((row) => normalizeWeatherRecord(row));
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

function localDateStartIso(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00-03:00`).toISOString();
}

function localDateEndIso(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00-03:00`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function escapeSearch(value: string): string {
  return value.trim().replaceAll('%', '\\%').replaceAll(',', ' ');
}

function getLocationLabel(record: WeatherRecord): string {
  const location = record.locations;
  if (!location) return 'local monitorado';
  if (location.city && location.state) return `${location.city}/${location.state}`;
  return location.name;
}

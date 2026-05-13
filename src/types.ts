export type AlertSeverity = 'baixa' | 'média' | 'alta' | 'crítica';

export type AlertRuleType =
  | 'frost_risk'
  | 'heavy_rain'
  | 'pressure_drop'
  | 'cold_front_signal'
  | 'high_wind'
  | 'custom';

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Region {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export type RegionInput = Pick<Region, 'name'> & Partial<Pick<Region, 'description' | 'user_id'>>;

export interface Location {
  id: string;
  user_id: string;
  region_id: string | null;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
  is_active: boolean;
  collect_daily: boolean;
  created_at: string;
  updated_at: string;
  regions?: Pick<Region, 'name'> | null;
}

export type LocationInput = Omit<Location, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'regions'> &
  Partial<Pick<Location, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;

export interface WeatherRecord {
  id: string;
  user_id: string;
  location_id: string;
  region_id: string | null;
  date_time: string;
  precipitation_mm: number | null;
  weather_condition: string | null;
  weather_code: number | null;
  temperature_c: number | null;
  pressure_hpa: number | null;
  humidity_percent: number | null;
  wind_kmh: number | null;
  source: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  regions?: Pick<Region, 'name'> | null;
  locations?: Pick<Location, 'name' | 'city' | 'state'> | null;
}

export type WeatherRecordInput = Omit<
  WeatherRecord,
  'id' | 'user_id' | 'created_at' | 'updated_at' | 'regions' | 'locations'
> &
  Partial<Pick<WeatherRecord, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;

export interface AlertRule {
  id: string;
  user_id: string;
  location_id: string;
  name: string;
  type: AlertRuleType;
  is_active: boolean;
  threshold_value: number | null;
  comparison_operator: '>' | '>=' | '<' | '<=' | '=' | '!=' | null;
  created_at: string;
  updated_at: string;
}

export type AlertRuleInput = Omit<AlertRule, 'id' | 'user_id' | 'created_at' | 'updated_at'> &
  Partial<Pick<AlertRule, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;

export interface AlertEvent {
  id: string;
  user_id: string;
  location_id: string;
  weather_record_id: string;
  alert_rule_id: string | null;
  type: AlertRuleType;
  severity: AlertSeverity;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  locations?: Pick<Location, 'name' | 'city' | 'state'> | null;
}

export type AlertEventInput = Omit<AlertEvent, 'id' | 'created_at' | 'is_read' | 'locations'> &
  Partial<Pick<AlertEvent, 'id' | 'created_at' | 'is_read'>>;

export interface WeatherApiResponse {
  temperatureC: number | null;
  humidityPercent: number | null;
  precipitationMm: number | null;
  pressureHpa: number | null;
  windKmh: number | null;
  weatherCode: number | null;
  weatherCondition: string;
  source: 'Open-Meteo';
  dateTime: string;
}

export interface WeatherSummary {
  totalRecords: number;
  rainTotalMm: number;
  averageTemperatureC: number | null;
  averagePressureHpa: number | null;
  averageHumidityPercent: number | null;
  activeAlerts: number;
}

export interface ChartFilters {
  regionId?: string;
  locationId?: string;
  startDate?: string;
  endDate?: string;
}

export interface RecordFilters extends ChartFilters {
  condition?: string;
  source?: string;
  search?: string;
  limit?: number;
}

export interface CsvImportResult {
  records: WeatherRecordInput[];
  errors: string[];
}

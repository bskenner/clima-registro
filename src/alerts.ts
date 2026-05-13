import type { AlertEventInput, AlertRule, AlertRuleType, AlertSeverity, WeatherRecord } from './types';

export interface RecordComparison {
  temperatureDropC: number | null;
  pressureDropHpa: number | null;
  pressureChangeHpa: number | null;
}

export function compareWithPreviousRecord(record: WeatherRecord, previousRecord: WeatherRecord | null): RecordComparison {
  if (!previousRecord) {
    return {
      temperatureDropC: null,
      pressureDropHpa: null,
      pressureChangeHpa: null,
    };
  }

  const temperatureDropC =
    record.temperature_c !== null && previousRecord.temperature_c !== null
      ? previousRecord.temperature_c - record.temperature_c
      : null;

  const pressureDropHpa =
    record.pressure_hpa !== null && previousRecord.pressure_hpa !== null
      ? previousRecord.pressure_hpa - record.pressure_hpa
      : null;

  const pressureChangeHpa =
    record.pressure_hpa !== null && previousRecord.pressure_hpa !== null
      ? Math.abs(record.pressure_hpa - previousRecord.pressure_hpa)
      : null;

  return {
    temperatureDropC,
    pressureDropHpa,
    pressureChangeHpa,
  };
}

export function detectAlertsForRecord(
  record: WeatherRecord,
  previousRecord: WeatherRecord | null = null,
  rules: AlertRule[] = [],
  locationLabel = 'local monitorado',
): AlertEventInput[] {
  const events: AlertEventInput[] = [];
  const comparison = compareWithPreviousRecord(record, previousRecord);
  const frostSeverity = getSeverityForFrost(record.temperature_c);
  const rainSeverity = getSeverityForRain(record.precipitation_mm);
  const pressureSeverity = getSeverityForPressureDrop(comparison.pressureDropHpa);
  const coldFrontSeverity = getSeverityForColdFront(comparison.temperatureDropC, comparison.pressureChangeHpa);
  const windSeverity = getSeverityForWind(record.wind_kmh);

  if (frostSeverity) {
    events.push(
      buildAlert(record, 'frost_risk', frostSeverity, `Risco de geada em ${locationLabel}`, temperatureText(record)),
    );
  }

  if (rainSeverity) {
    events.push(
      buildAlert(
        record,
        'heavy_rain',
        rainSeverity,
        `Chuva forte registrada em ${locationLabel}`,
        `Precipitação registrada: ${formatValue(record.precipitation_mm, 'mm')}.`,
      ),
    );
  }

  if (pressureSeverity) {
    events.push(
      buildAlert(
        record,
        'pressure_drop',
        pressureSeverity,
        'Queda de pressão atmosférica detectada',
        `Queda em relação ao registro anterior: ${formatValue(comparison.pressureDropHpa, 'hPa')}.`,
      ),
    );
  }

  if (coldFrontSeverity) {
    events.push(
      buildAlert(
        record,
        'cold_front_signal',
        coldFrontSeverity,
        'Sinal possível de frente fria',
        `Temperatura caiu ${formatValue(comparison.temperatureDropC, '°C')} e a pressão variou ${formatValue(
          comparison.pressureChangeHpa,
          'hPa',
        )}.`,
      ),
    );
  }

  if (windSeverity) {
    events.push(
      buildAlert(
        record,
        'high_wind',
        windSeverity,
        'Vento forte registrado',
        `Vento registrado: ${formatValue(record.wind_kmh, 'km/h')}.`,
      ),
    );
  }

  for (const rule of rules.filter((ruleItem) => ruleItem.is_active)) {
    const event = detectRuleAlert(record, comparison, rule, locationLabel);
    if (event) events.push(event);
  }

  return events;
}

export async function createAlertEvents(
  events: AlertEventInput[],
  insertEvent?: (event: AlertEventInput) => Promise<unknown>,
): Promise<void> {
  if (events.length === 0) return;

  if (insertEvent) {
    for (const event of events) {
      await insertEvent(event);
    }
    return;
  }

  const { supabase } = await import('./supabaseClient');
  const { error } = await supabase.from('alert_events').insert(events);
  if (error) throw new Error(`Erro ao criar alertas: ${error.message}`);
}

export function getSeverityForFrost(temperatureC: number | null): AlertSeverity | null {
  if (temperatureC === null || temperatureC > 3) return null;
  if (temperatureC <= 0) return 'crítica';
  if (temperatureC <= 1) return 'alta';
  return 'média';
}

export function getSeverityForRain(precipitationMm: number | null): AlertSeverity | null {
  if (precipitationMm === null || precipitationMm < 20) return null;
  if (precipitationMm >= 70) return 'crítica';
  if (precipitationMm >= 40) return 'alta';
  return 'média';
}

export function getSeverityForPressureDrop(dropHpa: number | null): AlertSeverity | null {
  if (dropHpa === null || dropHpa < 5) return null;
  if (dropHpa >= 12) return 'crítica';
  if (dropHpa >= 8) return 'alta';
  return 'média';
}

export function getSeverityForColdFront(
  temperatureDropC: number | null,
  pressureChangeHpa: number | null,
): AlertSeverity | null {
  if (temperatureDropC === null || pressureChangeHpa === null) return null;
  if (temperatureDropC < 5 || pressureChangeHpa < 4) return null;
  if (temperatureDropC >= 10) return 'crítica';
  if (temperatureDropC >= 8) return 'alta';
  return 'média';
}

export function getSeverityForWind(windKmh: number | null): AlertSeverity | null {
  if (windKmh === null || windKmh < 40) return null;
  if (windKmh >= 80) return 'crítica';
  if (windKmh >= 60) return 'alta';
  return 'média';
}

function buildAlert(
  record: WeatherRecord,
  type: AlertRuleType,
  severity: AlertSeverity,
  title: string,
  message: string,
  alertRuleId: string | null = null,
): AlertEventInput {
  return {
    user_id: record.user_id,
    location_id: record.location_id,
    weather_record_id: record.id,
    alert_rule_id: alertRuleId,
    type,
    severity,
    title,
    message,
    is_read: false,
  };
}

function detectRuleAlert(
  record: WeatherRecord,
  comparison: RecordComparison,
  rule: AlertRule,
  locationLabel: string,
): AlertEventInput | null {
  if (rule.threshold_value === null || !rule.comparison_operator) return null;
  const value = valueForRule(record, comparison, rule.type);
  if (value === null || !compare(value, rule.comparison_operator, rule.threshold_value)) return null;

  return buildAlert(
    record,
    rule.type,
    'baixa',
    rule.name,
    `Regra "${rule.name}" acionada em ${locationLabel}. Valor observado: ${formatValue(value, '')}.`,
    rule.id,
  );
}

function valueForRule(record: WeatherRecord, comparison: RecordComparison, type: AlertRuleType): number | null {
  if (type === 'frost_risk') return record.temperature_c;
  if (type === 'heavy_rain') return record.precipitation_mm;
  if (type === 'pressure_drop') return comparison.pressureDropHpa;
  if (type === 'cold_front_signal') return comparison.temperatureDropC;
  if (type === 'high_wind') return record.wind_kmh;
  return null;
}

function compare(value: number, operator: NonNullable<AlertRule['comparison_operator']>, threshold: number): boolean {
  if (operator === '>') return value > threshold;
  if (operator === '>=') return value >= threshold;
  if (operator === '<') return value < threshold;
  if (operator === '<=') return value <= threshold;
  if (operator === '=') return value === threshold;
  return value !== threshold;
}

function temperatureText(record: WeatherRecord): string {
  return `Temperatura registrada: ${formatValue(record.temperature_c, '°C')}.`;
}

function formatValue(value: number | null, suffix: string): string {
  if (value === null) return '-';
  const valueText = Number(value.toFixed(2)).toLocaleString('pt-BR');
  return suffix ? `${valueText} ${suffix}` : valueText;
}

import './styles.css';
import { ensureDefaultUserData, getCurrentUser, onAuthStateChange, signIn, signOut, signUp } from './auth';
import {
  createLocation,
  createRegion,
  createWeatherRecord,
  deleteAlertEvent,
  deleteLocation,
  deleteRegion,
  deleteWeatherRecord,
  getAlertEvents,
  getLocations,
  getRegions,
  getWeatherRecords,
  markAlertAsRead,
  updateLocation,
  updateRegion,
  updateWeatherRecord,
} from './db';
import { fetchCurrentWeather } from './weatherApi';
import {
  destroyExistingCharts,
  renderCityRankingChart,
  renderComparisonChart,
  renderHumidityChart,
  renderPrecipitationChart,
  renderPressureChart,
  renderTemperatureChart,
} from './charts';
import { csvToRecords, downloadCsv, recordsToCsv } from './csv';
import { isSupabaseConfigured } from './config';
import {
  calculateSummary,
  formatDateTime,
  getLocalDateKey,
  parseNumber,
  validateCoordinates,
} from './utils';
import type { AlertEvent, Location, RecordFilters, Region, WeatherRecord, WeatherRecordInput } from './types';

type TabId = 'dashboard' | 'record' | 'history' | 'charts' | 'alerts' | 'locations' | 'backup';

interface AppState {
  userEmail: string | null;
  activeTab: TabId;
  regions: Region[];
  locations: Location[];
  records: WeatherRecord[];
  alerts: AlertEvent[];
  dashboardFilters: RecordFilters;
  historyFilters: RecordFilters;
  chartFilters: RecordFilters;
  editingRecord: WeatherRecord | null;
  editingRegion: Region | null;
  editingLocation: Location | null;
  notice: string;
  error: string;
  importReport: string;
}

const WEATHER_CONDITIONS = [
  'Limpo',
  'Parcialmente nublado',
  'Nublado',
  'Garoa',
  'Chuva fraca',
  'Chuva moderada',
  'Chuva forte',
  'Temporal',
  'Nevoeiro',
  'Geada',
  'Granizo',
  'Outro',
];

const SOURCES = ['Manual', 'Open-Meteo', 'INMET', 'NASA POWER', 'Pluviômetro próprio', 'Outro'];

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'record', label: 'Novo Registro' },
  { id: 'history', label: 'Histórico' },
  { id: 'charts', label: 'Gráficos' },
  { id: 'alerts', label: 'Alertas' },
  { id: 'locations', label: 'Locais e Regiões' },
  { id: 'backup', label: 'Backup CSV' },
];

const appRoot = document.querySelector<HTMLDivElement>('#app');

const state: AppState = {
  userEmail: null,
  activeTab: 'dashboard',
  regions: [],
  locations: [],
  records: [],
  alerts: [],
  dashboardFilters: defaultPeriod(),
  historyFilters: defaultPeriod(),
  chartFilters: defaultPeriod(),
  editingRecord: null,
  editingRegion: null,
  editingLocation: null,
  notice: '',
  error: '',
  importReport: '',
};

if (!appRoot) {
  throw new Error('Elemento #app não encontrado.');
}

const app = appRoot;

app.addEventListener('submit', (event) => {
  event.preventDefault();
  void handleSubmit(event as SubmitEvent).catch(showError);
});

app.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!target) return;
  void handleAction(target).catch(showError);
});

app.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  void handleChange(target).catch(showError);
});

void init().catch(showFatalError);

async function init(): Promise<void> {
  renderLoading();

  onAuthStateChange((user) => {
    if (!user) {
      resetSession();
      render();
      return;
    }

    void bootstrapAuthenticated(user.email ?? '').catch(showError);
  });

  const user = await getCurrentUser();
  if (user) {
    await bootstrapAuthenticated(user.email ?? '');
  } else {
    render();
  }
}

async function bootstrapAuthenticated(email: string): Promise<void> {
  state.userEmail = email;
  state.notice = '';
  state.error = '';
  await ensureDefaultUserData();
  await loadData();
  render();
}

async function loadData(): Promise<void> {
  const [regions, locations, records, alerts] = await Promise.all([
    getRegions(),
    getLocations(),
    getWeatherRecords(),
    getAlertEvents(),
  ]);

  state.regions = regions;
  state.locations = locations;
  state.records = records;
  state.alerts = alerts;
}

function render(): void {
  destroyExistingCharts();

  if (!state.userEmail) {
    renderLogin();
    return;
  }

  app.innerHTML = `
    <header class="site-header">
      <div>
        <h1>clima-registro</h1>
        <p>Registro meteorológico leve, prático e consultável.</p>
      </div>
      <div class="session-box">
        <span>${escapeHtml(state.userEmail)}</span>
        <button type="button" data-action="sign-out">Sair</button>
      </div>
    </header>
    <div class="message-holder">${renderMessages()}</div>
    <nav class="tabs" aria-label="Seções">
      ${tabs
        .map(
          (tab) => `
            <button type="button" class="${tab.id === state.activeTab ? 'active' : ''}" data-action="tab" data-tab="${
              tab.id
            }">${tab.label}</button>
          `,
        )
        .join('')}
    </nav>
    <main>${renderActiveTab()}</main>
  `;

  if (state.activeTab === 'charts') {
    renderChartsAfterPaint();
  }
}

function renderLogin(): void {
  app.innerHTML = `
    <main class="login-page">
      <section class="panel login-panel">
        <h1>clima-registro</h1>
        <p class="muted">Sistema simples para registro e monitoramento meteorológico.</p>
        ${!isSupabaseConfigured ? '<p class="notice error">Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.</p>' : ''}
        <div class="message-holder">${renderMessages()}</div>
        <form id="login-form" class="stack">
          <label>
            Email
            <input type="email" name="email" required autocomplete="email" />
          </label>
          <label>
            Senha
            <input type="password" name="password" required autocomplete="current-password" minlength="6" />
          </label>
          <div class="button-row">
            <button type="submit" name="mode" value="sign-in">Entrar</button>
            <button type="submit" name="mode" value="sign-up">Criar conta</button>
          </div>
        </form>
      </section>
    </main>
  `;
}

function renderActiveTab(): string {
  if (state.activeTab === 'dashboard') return renderDashboard();
  if (state.activeTab === 'record') return renderRecordForm();
  if (state.activeTab === 'history') return renderHistory();
  if (state.activeTab === 'charts') return renderCharts();
  if (state.activeTab === 'alerts') return renderAlerts();
  if (state.activeTab === 'locations') return renderLocationsAndRegions();
  return renderBackup();
}

function renderDashboard(): string {
  const records = applyFilters(state.records, state.dashboardFilters);
  const summary = calculateSummary(records, state.alerts);
  const latestRecords = records.slice(0, 8);

  return `
    <section class="panel">
      <h2>Dashboard</h2>
      <form id="dashboard-filters" class="filters">
        ${renderRegionSelect('regionId', state.dashboardFilters.regionId)}
        ${renderLocationSelect('locationId', state.dashboardFilters.locationId)}
        ${renderDateInput('startDate', 'Início', state.dashboardFilters.startDate)}
        ${renderDateInput('endDate', 'Fim', state.dashboardFilters.endDate)}
        <button type="submit">Filtrar</button>
      </form>
      <div class="summary-grid">
        ${metric('Registros', String(summary.totalRecords))}
        ${metric('Chuva total', `${formatNumber(summary.rainTotalMm)} mm`)}
        ${metric('Temp. média', formatNullable(summary.averageTemperatureC, '°C'))}
        ${metric('Pressão média', formatNullable(summary.averagePressureHpa, 'hPa'))}
        ${metric('Umidade média', formatNullable(summary.averageHumidityPercent, '%'))}
        ${metric('Alertas ativos', String(summary.activeAlerts))}
      </div>
    </section>
    <section class="panel">
      <h2>Última coleta por local</h2>
      ${renderLastRecordsByLocation()}
    </section>
    <section class="panel">
      <h2>Registros recentes</h2>
      ${renderRecordsTable(latestRecords, false)}
    </section>
  `;
}

function renderRecordForm(): string {
  const record = state.editingRecord;
  const selectedLocation = record ? state.locations.find((location) => location.id === record.location_id) : null;
  const title = record ? 'Editar registro' : 'Novo registro';

  return `
    <section class="panel">
      <h2>${title}</h2>
      <form id="record-form" class="grid-form">
        <input type="hidden" name="id" value="${escapeAttr(record?.id ?? '')}" />
        <input type="hidden" name="weather_code" id="record-weather-code" value="${escapeAttr(record?.weather_code ?? '')}" />
        <label>
          Data e hora
          <input id="record-date-time" type="datetime-local" name="date_time" value="${toDateTimeLocal(record?.date_time)}" required />
        </label>
        ${renderRegionSelect('region_id', record?.region_id ?? selectedLocation?.region_id ?? '', 'Região')}
        ${renderLocationSelect('location_id', record?.location_id ?? '', 'Local', 'record-location')}
        <label>
          Latitude
          <input id="record-latitude" type="number" name="latitude" step="0.000001" value="${escapeAttr(
            String(selectedLocation?.latitude ?? ''),
          )}" required />
        </label>
        <label>
          Longitude
          <input id="record-longitude" type="number" name="longitude" step="0.000001" value="${escapeAttr(
            String(selectedLocation?.longitude ?? ''),
          )}" required />
        </label>
        <div class="form-row span-2">
          <button type="button" data-action="fetch-current-weather">Buscar dados atuais</button>
          <span class="muted">Usa a API pública Open-Meteo com as coordenadas acima.</span>
        </div>
        <label>
          Precipitação mm
          <input id="record-rain" type="number" name="precipitation_mm" step="0.01" value="${escapeAttr(
            valueOrEmpty(record?.precipitation_mm),
          )}" />
        </label>
        <label>
          Condição
          <select id="record-condition" name="weather_condition">
            ${renderOptions(WEATHER_CONDITIONS, record?.weather_condition ?? '')}
          </select>
        </label>
        <label>
          Temperatura °C
          <input id="record-temperature" type="number" name="temperature_c" step="0.01" value="${escapeAttr(
            valueOrEmpty(record?.temperature_c),
          )}" />
        </label>
        <label>
          Pressão hPa
          <input id="record-pressure" type="number" name="pressure_hpa" step="0.01" value="${escapeAttr(
            valueOrEmpty(record?.pressure_hpa),
          )}" />
        </label>
        <label>
          Umidade %
          <input id="record-humidity" type="number" name="humidity_percent" step="0.01" value="${escapeAttr(
            valueOrEmpty(record?.humidity_percent),
          )}" />
        </label>
        <label>
          Vento km/h
          <input id="record-wind" type="number" name="wind_kmh" step="0.01" value="${escapeAttr(valueOrEmpty(record?.wind_kmh))}" />
        </label>
        <label>
          Fonte
          <select id="record-source" name="source">
            ${renderOptions(SOURCES, record?.source ?? 'Manual')}
          </select>
        </label>
        <label class="span-2">
          Observações
          <textarea name="notes" rows="4">${escapeHtml(record?.notes ?? '')}</textarea>
        </label>
        <div class="button-row span-2">
          <button type="submit">Salvar</button>
          <button type="button" data-action="clear-record-form">Limpar</button>
        </div>
      </form>
    </section>
  `;
}

function renderHistory(): string {
  const records = applyFilters(state.records, state.historyFilters);

  return `
    <section class="panel">
      <h2>Histórico</h2>
      <form id="history-filters" class="filters">
        ${renderRegionSelect('regionId', state.historyFilters.regionId)}
        ${renderLocationSelect('locationId', state.historyFilters.locationId)}
        ${renderDateInput('startDate', 'Início', state.historyFilters.startDate)}
        ${renderDateInput('endDate', 'Fim', state.historyFilters.endDate)}
        <label>
          Condição
          <select name="condition">
            <option value="">Todas</option>
            ${renderOptions(WEATHER_CONDITIONS, state.historyFilters.condition ?? '')}
          </select>
        </label>
        <label>
          Fonte
          <select name="source">
            <option value="">Todas</option>
            ${renderOptions(SOURCES, state.historyFilters.source ?? '')}
          </select>
        </label>
        <label>
          Busca
          <input type="search" name="search" value="${escapeAttr(state.historyFilters.search ?? '')}" />
        </label>
        <button type="submit">Filtrar</button>
      </form>
      ${renderRecordsTable(records, true)}
    </section>
  `;
}

function renderCharts(): string {
  return `
    <section class="panel">
      <h2>Gráficos</h2>
      <form id="chart-filters" class="filters">
        ${renderRegionSelect('regionId', state.chartFilters.regionId)}
        ${renderLocationSelect('locationId', state.chartFilters.locationId)}
        ${renderDateInput('startDate', 'Início', state.chartFilters.startDate)}
        ${renderDateInput('endDate', 'Fim', state.chartFilters.endDate)}
        <button type="submit">Aplicar</button>
      </form>
    </section>
    <section class="chart-grid">
      ${chartPanel('Precipitação por dia', 'chart-rain')}
      ${chartPanel('Temperatura média por dia', 'chart-temperature')}
      ${chartPanel('Pressão atmosférica por dia', 'chart-pressure')}
      ${chartPanel('Umidade média por dia', 'chart-humidity')}
      ${chartPanel('Comparativo chuva x pressão x temperatura', 'chart-comparison')}
      ${chartPanel('Ranking de cidades por chuva acumulada', 'chart-ranking')}
    </section>
  `;
}

function renderAlerts(): string {
  const rows = state.alerts;

  return `
    <section class="panel">
      <h2>Alertas</h2>
      <p class="notice">Alertas gerados por regras simples do sistema. Não substituem avisos oficiais de órgãos meteorológicos.</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Severidade</th>
              <th>Tipo</th>
              <th>Título</th>
              <th>Mensagem</th>
              <th>Criado em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows.length
                ? rows
                    .map(
                      (alert) => `
                        <tr>
                          <td>${alert.is_read ? 'lido' : 'novo'}</td>
                          <td><span class="severity ${severityClass(alert.severity)}">${alert.severity}</span></td>
                          <td>${escapeHtml(alert.type)}</td>
                          <td>${escapeHtml(alert.title)}</td>
                          <td>${escapeHtml(alert.message)}</td>
                          <td>${formatDateTime(alert.created_at)}</td>
                          <td class="actions">
                            ${
                              alert.is_read
                                ? ''
                                : `<button type="button" data-action="mark-alert-read" data-id="${escapeAttr(alert.id)}">Ler</button>`
                            }
                            <button type="button" data-action="delete-alert" data-id="${escapeAttr(alert.id)}">Excluir</button>
                          </td>
                        </tr>
                      `,
                    )
                    .join('')
                : '<tr><td colspan="7">Nenhum alerta registrado.</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderLocationsAndRegions(): string {
  const region = state.editingRegion;
  const location = state.editingLocation;

  return `
    <section class="two-column">
      <div class="panel">
        <h2>${region ? 'Editar região' : 'Nova região'}</h2>
        <form id="region-form" class="stack">
          <input type="hidden" name="id" value="${escapeAttr(region?.id ?? '')}" />
          <label>
            Nome
            <input name="name" value="${escapeAttr(region?.name ?? '')}" required />
          </label>
          <label>
            Descrição
            <textarea name="description" rows="3">${escapeHtml(region?.description ?? '')}</textarea>
          </label>
          <div class="button-row">
            <button type="submit">Salvar região</button>
            <button type="button" data-action="clear-region-form">Limpar</button>
          </div>
        </form>
      </div>
      <div class="panel">
        <h2>${location ? 'Editar local' : 'Novo local'}</h2>
        <form id="location-form" class="grid-form">
          <input type="hidden" name="id" value="${escapeAttr(location?.id ?? '')}" />
          <label>
            Nome
            <input name="name" value="${escapeAttr(location?.name ?? '')}" required />
          </label>
          <label>
            Cidade
            <input name="city" value="${escapeAttr(location?.city ?? '')}" />
          </label>
          <label>
            Estado
            <input name="state" value="${escapeAttr(location?.state ?? '')}" />
          </label>
          <label>
            País
            <input name="country" value="${escapeAttr(location?.country ?? 'Brasil')}" />
          </label>
          <label>
            Latitude
            <input type="number" name="latitude" step="0.000001" value="${escapeAttr(valueOrEmpty(location?.latitude))}" required />
          </label>
          <label>
            Longitude
            <input type="number" name="longitude" step="0.000001" value="${escapeAttr(valueOrEmpty(location?.longitude))}" required />
          </label>
          ${renderRegionSelect('region_id', location?.region_id ?? '', 'Região')}
          <label class="check">
            <input type="checkbox" name="is_active" ${location?.is_active ?? true ? 'checked' : ''} />
            Ativo
          </label>
          <label class="check">
            <input type="checkbox" name="collect_daily" ${location?.collect_daily ?? true ? 'checked' : ''} />
            Coleta diária
          </label>
          <div class="button-row span-2">
            <button type="submit">Salvar local</button>
            <button type="button" data-action="clear-location-form">Limpar</button>
          </div>
        </form>
      </div>
    </section>
    <section class="panel">
      <h2>Regiões</h2>
      ${renderRegionsTable()}
    </section>
    <section class="panel">
      <h2>Locais</h2>
      ${renderLocationsTable()}
    </section>
  `;
}

function renderBackup(): string {
  const filteredRecords = applyFilters(state.records, state.historyFilters);

  return `
    <section class="panel">
      <h2>Backup CSV</h2>
      <p class="notice">Os dados ficam em banco online, mas é recomendado exportar CSV periodicamente como backup.</p>
      <div class="button-row">
        <button type="button" data-action="export-all-csv">Exportar todos os registros</button>
        <button type="button" data-action="export-filtered-csv">Exportar registros filtrados (${filteredRecords.length})</button>
      </div>
    </section>
    <section class="panel">
      <h2>Importar CSV</h2>
      <form id="csv-import-form" class="stack">
        <input id="csv-file" type="file" accept=".csv,text/csv" />
        <button type="submit">Validar e importar</button>
      </form>
      ${state.importReport ? `<pre class="import-report">${escapeHtml(state.importReport)}</pre>` : ''}
    </section>
  `;
}

async function handleSubmit(event: SubmitEvent): Promise<void> {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;

  if (form.id === 'login-form') await handleLogin(form, event.submitter);
  if (form.id === 'dashboard-filters') updateFilters(form, 'dashboardFilters');
  if (form.id === 'history-filters') updateFilters(form, 'historyFilters');
  if (form.id === 'chart-filters') updateFilters(form, 'chartFilters');
  if (form.id === 'record-form') await saveWeatherRecord(form);
  if (form.id === 'region-form') await saveRegion(form);
  if (form.id === 'location-form') await saveLocation(form);
  if (form.id === 'csv-import-form') await importCsv();
}

async function handleAction(target: HTMLElement): Promise<void> {
  const action = target.dataset.action;
  const id = target.dataset.id ?? '';

  if (action === 'tab') {
    state.activeTab = (target.dataset.tab as TabId) ?? 'dashboard';
    state.notice = '';
    state.error = '';
    render();
  }

  if (action === 'sign-out') {
    await signOut();
    resetSession();
    render();
  }

  if (action === 'fetch-current-weather') await fillCurrentWeather();
  if (action === 'clear-record-form') {
    state.editingRecord = null;
    render();
  }

  if (action === 'edit-record') {
    state.editingRecord = state.records.find((record) => record.id === id) ?? null;
    state.activeTab = 'record';
    render();
  }

  if (action === 'delete-record') await removeRecord(id);
  if (action === 'mark-alert-read') await readAlert(id);
  if (action === 'delete-alert') await removeAlert(id);

  if (action === 'edit-region') {
    state.editingRegion = state.regions.find((region) => region.id === id) ?? null;
    render();
  }

  if (action === 'delete-region') await removeRegion(id);
  if (action === 'clear-region-form') {
    state.editingRegion = null;
    render();
  }

  if (action === 'edit-location') {
    state.editingLocation = state.locations.find((location) => location.id === id) ?? null;
    render();
  }

  if (action === 'delete-location') await removeLocation(id);
  if (action === 'clear-location-form') {
    state.editingLocation = null;
    render();
  }

  if (action === 'export-all-csv') exportCsv(state.records, 'clima-registro-todos.csv');
  if (action === 'export-filtered-csv') {
    exportCsv(applyFilters(state.records, state.historyFilters), 'clima-registro-filtrado.csv');
  }
}

async function handleChange(target: HTMLElement): Promise<void> {
  if (target.id !== 'record-location' || !(target instanceof HTMLSelectElement)) return;
  const location = state.locations.find((item) => item.id === target.value);
  if (!location) return;

  setInputValue('record-latitude', String(location.latitude));
  setInputValue('record-longitude', String(location.longitude));
  setSelectValue('region_id', location.region_id ?? '');
}

async function handleLogin(form: HTMLFormElement, submitter: HTMLElement | null): Promise<void> {
  const data = new FormData(form);
  const email = String(data.get('email') ?? '').trim();
  const password = String(data.get('password') ?? '');
  const mode = submitter instanceof HTMLButtonElement ? submitter.value : 'sign-in';

  if (mode === 'sign-up') {
    await signUp(email, password);
    state.notice = 'Conta criada. Se o Supabase exigir confirmação, verifique seu email antes de entrar.';
    state.error = '';
    render();
    return;
  }

  await signIn(email, password);
  const user = await getCurrentUser();
  if (user) await bootstrapAuthenticated(user.email ?? email);
}

function updateFilters(form: HTMLFormElement, key: 'dashboardFilters' | 'historyFilters' | 'chartFilters'): void {
  const data = new FormData(form);
  state[key] = {
    regionId: stringOrUndefined(data.get('regionId')),
    locationId: stringOrUndefined(data.get('locationId')),
    startDate: stringOrUndefined(data.get('startDate')),
    endDate: stringOrUndefined(data.get('endDate')),
    condition: stringOrUndefined(data.get('condition')),
    source: stringOrUndefined(data.get('source')),
    search: stringOrUndefined(data.get('search')),
  };
  render();
}

async function saveWeatherRecord(form: HTMLFormElement): Promise<void> {
  const data = new FormData(form);
  const id = stringOrUndefined(data.get('id'));
  const locationId = String(data.get('location_id') ?? '');
  const location = state.locations.find((item) => item.id === locationId);
  const latitude = parseNumber(data.get('latitude'));
  const longitude = parseNumber(data.get('longitude'));

  if (!locationId || !validateCoordinates(latitude, longitude)) {
    throw new Error('Selecione um local e informe coordenadas válidas.');
  }

  const record: WeatherRecordInput = {
    location_id: locationId,
    region_id: stringOrUndefined(data.get('region_id')) ?? location?.region_id ?? null,
    date_time: new Date(String(data.get('date_time'))).toISOString(),
    precipitation_mm: parseNumber(data.get('precipitation_mm')),
    weather_condition: stringOrNull(data.get('weather_condition')),
    weather_code: parseNumber(data.get('weather_code')),
    temperature_c: parseNumber(data.get('temperature_c')),
    pressure_hpa: parseNumber(data.get('pressure_hpa')),
    humidity_percent: parseNumber(data.get('humidity_percent')),
    wind_kmh: parseNumber(data.get('wind_kmh')),
    source: String(data.get('source') ?? 'Manual'),
    notes: stringOrNull(data.get('notes')),
  };

  if (id) {
    await updateWeatherRecord(id, record);
    state.notice = 'Registro atualizado.';
  } else {
    await createWeatherRecord(record);
    state.notice = 'Registro salvo.';
  }

  state.error = '';
  state.editingRecord = null;
  await loadData();
  render();
}

async function fillCurrentWeather(): Promise<void> {
  const latitude = parseNumber(getInputValue('record-latitude'));
  const longitude = parseNumber(getInputValue('record-longitude'));

  if (latitude === null || longitude === null || !validateCoordinates(latitude, longitude)) {
    throw new Error('Informe latitude e longitude válidas antes de buscar.');
  }

  const weather = await fetchCurrentWeather(latitude, longitude);
  setInputValue('record-date-time', toDateTimeLocal(weather.dateTime));
  setInputValue('record-rain', valueOrEmpty(weather.precipitationMm));
  setInputValue('record-temperature', valueOrEmpty(weather.temperatureC));
  setInputValue('record-pressure', valueOrEmpty(weather.pressureHpa));
  setInputValue('record-humidity', valueOrEmpty(weather.humidityPercent));
  setInputValue('record-wind', valueOrEmpty(weather.windKmh));
  setInputValue('record-weather-code', valueOrEmpty(weather.weatherCode));
  setSelectValue('record-condition', weather.weatherCondition);
  setSelectValue('record-source', weather.source);
  state.notice = 'Dados atuais preenchidos a partir da Open-Meteo.';
  state.error = '';
  renderTransientMessages();
}

async function saveRegion(form: HTMLFormElement): Promise<void> {
  const data = new FormData(form);
  const id = stringOrUndefined(data.get('id'));
  const payload = {
    name: String(data.get('name') ?? '').trim(),
    description: stringOrNull(data.get('description')),
  };

  if (id) {
    await updateRegion(id, payload);
    state.notice = 'Região atualizada.';
  } else {
    await createRegion(payload);
    state.notice = 'Região criada.';
  }

  state.error = '';
  state.editingRegion = null;
  await loadData();
  render();
}

async function saveLocation(form: HTMLFormElement): Promise<void> {
  const data = new FormData(form);
  const id = stringOrUndefined(data.get('id'));
  const latitude = parseNumber(data.get('latitude'));
  const longitude = parseNumber(data.get('longitude'));

  if (!validateCoordinates(latitude, longitude)) {
    throw new Error('Informe coordenadas válidas para o local.');
  }

  const payload = {
    region_id: stringOrUndefined(data.get('region_id')) ?? null,
    name: String(data.get('name') ?? '').trim(),
    city: stringOrNull(data.get('city')),
    state: stringOrNull(data.get('state')),
    country: stringOrNull(data.get('country')) ?? 'Brasil',
    latitude: latitude ?? 0,
    longitude: longitude ?? 0,
    is_active: data.get('is_active') === 'on',
    collect_daily: data.get('collect_daily') === 'on',
  };

  if (id) {
    await updateLocation(id, payload);
    state.notice = 'Local atualizado.';
  } else {
    await createLocation(payload);
    state.notice = 'Local criado.';
  }

  state.error = '';
  state.editingLocation = null;
  await loadData();
  render();
}

async function removeRecord(id: string): Promise<void> {
  if (!window.confirm('Excluir este registro?')) return;
  await deleteWeatherRecord(id);
  state.notice = 'Registro excluído.';
  await loadData();
  render();
}

async function readAlert(id: string): Promise<void> {
  await markAlertAsRead(id);
  state.notice = 'Alerta marcado como lido.';
  await loadData();
  render();
}

async function removeAlert(id: string): Promise<void> {
  if (!window.confirm('Excluir este alerta?')) return;
  await deleteAlertEvent(id);
  state.notice = 'Alerta excluído.';
  await loadData();
  render();
}

async function removeRegion(id: string): Promise<void> {
  if (!window.confirm('Excluir esta região? Os locais ficarão sem região.')) return;
  await deleteRegion(id);
  state.notice = 'Região excluída.';
  await loadData();
  render();
}

async function removeLocation(id: string): Promise<void> {
  if (!window.confirm('Excluir este local? Os registros vinculados serão excluídos.')) return;
  await deleteLocation(id);
  state.notice = 'Local excluído.';
  await loadData();
  render();
}

function exportCsv(records: WeatherRecord[], filename: string): void {
  downloadCsv(recordsToCsv(records), filename);
  state.notice = `${records.length} registros exportados.`;
  render();
}

async function importCsv(): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('#csv-file');
  const file = input?.files?.[0];
  if (!file) throw new Error('Selecione um arquivo CSV.');

  const text = await file.text();
  const result = csvToRecords(text, state.locations, state.regions);
  const existingKeys = new Set(state.records.map(recordDuplicateKey));
  let inserted = 0;
  let skipped = 0;
  const errors = [...result.errors];

  for (const record of result.records) {
    const key = recordDuplicateKey(record);
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }

    try {
      await createWeatherRecord(record);
      existingKeys.add(key);
      inserted += 1;
    } catch (errorItem) {
      errors.push(errorItem instanceof Error ? errorItem.message : String(errorItem));
    }
  }

  await loadData();
  state.importReport = [`Importados: ${inserted}`, `Ignorados por duplicidade: ${skipped}`, ...errors].join('\n');
  state.notice = 'Importação CSV finalizada.';
  state.error = '';
  render();
}

function renderRecordsTable(records: WeatherRecord[], withActions: boolean): string {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Data/hora</th>
            <th>Região</th>
            <th>Local</th>
            <th>Condição</th>
            <th>Chuva mm</th>
            <th>Temperatura °C</th>
            <th>Pressão hPa</th>
            <th>Umidade %</th>
            <th>Vento km/h</th>
            <th>Fonte</th>
            <th>Observações</th>
            ${withActions ? '<th>Ações</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${
            records.length
              ? records
                  .map(
                    (record) => `
                      <tr>
                        <td>${formatDateTime(record.date_time)}</td>
                        <td>${escapeHtml(record.regions?.name ?? '-')}</td>
                        <td>${escapeHtml(locationRecordLabel(record))}</td>
                        <td>${escapeHtml(record.weather_condition ?? '-')}</td>
                        <td>${formatNullable(record.precipitation_mm, '')}</td>
                        <td>${formatNullable(record.temperature_c, '')}</td>
                        <td>${formatNullable(record.pressure_hpa, '')}</td>
                        <td>${formatNullable(record.humidity_percent, '')}</td>
                        <td>${formatNullable(record.wind_kmh, '')}</td>
                        <td>${escapeHtml(record.source)}</td>
                        <td>${escapeHtml(record.notes ?? '')}</td>
                        ${
                          withActions
                            ? `<td class="actions">
                                <button type="button" data-action="edit-record" data-id="${escapeAttr(record.id)}">Editar</button>
                                <button type="button" data-action="delete-record" data-id="${escapeAttr(record.id)}">Excluir</button>
                              </td>`
                            : ''
                        }
                      </tr>
                    `,
                  )
                  .join('')
              : `<tr><td colspan="${withActions ? 12 : 11}">Nenhum registro encontrado.</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function renderRegionsTable(): string {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Descrição</th>
            <th>Criada em</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${
            state.regions.length
              ? state.regions
                  .map(
                    (region) => `
                      <tr>
                        <td>${escapeHtml(region.name)}</td>
                        <td>${escapeHtml(region.description ?? '')}</td>
                        <td>${formatDateTime(region.created_at)}</td>
                        <td class="actions">
                          <button type="button" data-action="edit-region" data-id="${escapeAttr(region.id)}">Editar</button>
                          <button type="button" data-action="delete-region" data-id="${escapeAttr(region.id)}">Excluir</button>
                        </td>
                      </tr>
                    `,
                  )
                  .join('')
              : '<tr><td colspan="4">Nenhuma região cadastrada.</td></tr>'
          }
        </tbody>
      </table>
    </div>
  `;
}

function renderLocationsTable(): string {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Cidade</th>
            <th>Região</th>
            <th>Latitude</th>
            <th>Longitude</th>
            <th>Ativo</th>
            <th>Coleta diária</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${
            state.locations.length
              ? state.locations
                  .map(
                    (location) => `
                      <tr>
                        <td>${escapeHtml(location.name)}</td>
                        <td>${escapeHtml([location.city, location.state].filter(Boolean).join('/') || '-')}</td>
                        <td>${escapeHtml(location.regions?.name ?? '-')}</td>
                        <td>${formatNumber(location.latitude)}</td>
                        <td>${formatNumber(location.longitude)}</td>
                        <td>${location.is_active ? 'sim' : 'não'}</td>
                        <td>${location.collect_daily ? 'sim' : 'não'}</td>
                        <td class="actions">
                          <button type="button" data-action="edit-location" data-id="${escapeAttr(location.id)}">Editar</button>
                          <button type="button" data-action="delete-location" data-id="${escapeAttr(location.id)}">Excluir</button>
                        </td>
                      </tr>
                    `,
                  )
                  .join('')
              : '<tr><td colspan="8">Nenhum local cadastrado.</td></tr>'
          }
        </tbody>
      </table>
    </div>
  `;
}

function renderLastRecordsByLocation(): string {
  const rows = state.locations.map((location) => {
    const latest = state.records
      .filter((record) => record.location_id === location.id)
      .sort((a, b) => new Date(b.date_time).getTime() - new Date(a.date_time).getTime())[0];
    return { location, latest };
  });

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Local</th>
            <th>Último registro</th>
            <th>Condição</th>
            <th>Temp.</th>
            <th>Chuva</th>
            <th>Fonte</th>
          </tr>
        </thead>
        <tbody>
          ${
            rows.length
              ? rows
                  .map(
                    ({ location, latest }) => `
                      <tr>
                        <td>${escapeHtml(location.name)}</td>
                        <td>${latest ? formatDateTime(latest.date_time) : '-'}</td>
                        <td>${escapeHtml(latest?.weather_condition ?? '-')}</td>
                        <td>${formatNullable(latest?.temperature_c ?? null, '°C')}</td>
                        <td>${formatNullable(latest?.precipitation_mm ?? null, 'mm')}</td>
                        <td>${escapeHtml(latest?.source ?? '-')}</td>
                      </tr>
                    `,
                  )
                  .join('')
              : '<tr><td colspan="6">Nenhum local cadastrado.</td></tr>'
          }
        </tbody>
      </table>
    </div>
  `;
}

function renderChartsAfterPaint(): void {
  window.requestAnimationFrame(() => {
    const records = applyFilters(state.records, state.chartFilters);
    renderPrecipitationChart('chart-rain', records);
    renderTemperatureChart('chart-temperature', records);
    renderPressureChart('chart-pressure', records);
    renderHumidityChart('chart-humidity', records);
    renderComparisonChart('chart-comparison', records);
    renderCityRankingChart('chart-ranking', records);
  });
}

function applyFilters(records: WeatherRecord[], filters: RecordFilters): WeatherRecord[] {
  const search = filters.search?.trim().toLowerCase();

  return records.filter((record) => {
    const dateKey = getLocalDateKey(record.date_time);
    if (filters.regionId && record.region_id !== filters.regionId) return false;
    if (filters.locationId && record.location_id !== filters.locationId) return false;
    if (filters.startDate && dateKey < filters.startDate) return false;
    if (filters.endDate && dateKey > filters.endDate) return false;
    if (filters.condition && record.weather_condition !== filters.condition) return false;
    if (filters.source && record.source !== filters.source) return false;
    if (search) {
      const haystack = [
        record.weather_condition,
        record.source,
        record.notes,
        record.locations?.name,
        record.locations?.city,
        record.locations?.state,
        record.regions?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

function renderRegionSelect(name: string, selected = '', label = 'Região'): string {
  return `
    <label>
      ${label}
      <select name="${escapeAttr(name)}">
        <option value="">Todas</option>
        ${state.regions
          .map(
            (region) =>
              `<option value="${escapeAttr(region.id)}" ${region.id === selected ? 'selected' : ''}>${escapeHtml(region.name)}</option>`,
          )
          .join('')}
      </select>
    </label>
  `;
}

function renderLocationSelect(name: string, selected = '', label = 'Local', id = ''): string {
  return `
    <label>
      ${label}
      <select ${id ? `id="${escapeAttr(id)}"` : ''} name="${escapeAttr(name)}">
        <option value="">Todos</option>
        ${state.locations
          .map(
            (location) =>
              `<option value="${escapeAttr(location.id)}" ${location.id === selected ? 'selected' : ''}>${escapeHtml(
                location.name,
              )}</option>`,
          )
          .join('')}
      </select>
    </label>
  `;
}

function renderDateInput(name: string, label: string, value = ''): string {
  return `
    <label>
      ${label}
      <input type="date" name="${escapeAttr(name)}" value="${escapeAttr(value)}" />
    </label>
  `;
}

function renderOptions(values: string[], selected = ''): string {
  return values
    .map((value) => `<option value="${escapeAttr(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(value)}</option>`)
    .join('');
}

function renderMessages(): string {
  return `
    ${state.notice ? `<p class="notice">${escapeHtml(state.notice)}</p>` : ''}
    ${state.error ? `<p class="notice error">${escapeHtml(state.error)}</p>` : ''}
  `;
}

function renderTransientMessages(): void {
  const existing = document.querySelector('.message-holder');
  if (existing) existing.innerHTML = renderMessages();
}

function metric(label: string, value: string): string {
  return `
    <div class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function chartPanel(title: string, canvasId: string): string {
  return `
    <div class="panel chart-panel">
      <h2>${escapeHtml(title)}</h2>
      <div class="chart-box"><canvas id="${escapeAttr(canvasId)}"></canvas></div>
    </div>
  `;
}

function resetSession(): void {
  state.userEmail = null;
  state.regions = [];
  state.locations = [];
  state.records = [];
  state.alerts = [];
  state.editingRecord = null;
  state.editingRegion = null;
  state.editingLocation = null;
}

function defaultPeriod(): RecordFilters {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30);

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function toDateTimeLocal(value?: string): string {
  const date = value ? new Date(value) : new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function recordDuplicateKey(record: Pick<WeatherRecord, 'location_id' | 'date_time' | 'source'>): string {
  return `${record.location_id}|${record.date_time}|${record.source}`;
}

function locationRecordLabel(record: WeatherRecord): string {
  if (record.locations?.city && record.locations.state) return `${record.locations.city}/${record.locations.state}`;
  return record.locations?.name ?? '-';
}

function severityClass(severity: AlertEvent['severity']): string {
  if (severity === 'crítica') return 'critical';
  if (severity === 'alta') return 'high';
  if (severity === 'média') return 'medium';
  return 'low';
}

function stringOrUndefined(value: FormDataEntryValue | null): string | undefined {
  const text = String(value ?? '').trim();
  return text || undefined;
}

function stringOrNull(value: FormDataEntryValue | null): string | null {
  return stringOrUndefined(value) ?? null;
}

function getInputValue(id: string): string {
  const element = document.getElementById(id);
  return element instanceof HTMLInputElement ? element.value : '';
}

function setInputValue(id: string, value: string): void {
  const element = document.getElementById(id);
  if (element instanceof HTMLInputElement) element.value = value;
}

function setSelectValue(idOrName: string, value: string): void {
  const element =
    document.getElementById(idOrName) ?? document.querySelector<HTMLSelectElement>(`select[name="${CSS.escape(idOrName)}"]`);
  if (element instanceof HTMLSelectElement) element.value = value;
}

function formatNullable(value: number | null, suffix: string): string {
  if (value === null) return '-';
  return suffix ? `${formatNumber(value)} ${suffix}` : formatNumber(value);
}

function formatNumber(value: number): string {
  return Number(value.toFixed(2)).toLocaleString('pt-BR');
}

function valueOrEmpty(value: number | string | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value: string | number): string {
  return escapeHtml(String(value));
}

function renderLoading(): void {
  app.innerHTML = '<main class="login-page"><p class="muted">Carregando...</p></main>';
}

function showError(error: unknown): void {
  state.error = error instanceof Error ? error.message : String(error);
  state.notice = '';
  render();
}

function showFatalError(error: unknown): void {
  app.innerHTML = `<main class="login-page"><p class="notice error">${escapeHtml(
    error instanceof Error ? error.message : String(error),
  )}</p></main>`;
}

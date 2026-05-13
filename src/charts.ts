import { Chart, type ChartConfiguration, registerables } from 'chart.js';
import type { WeatherRecord } from './types';
import { groupRecordsByDate, groupRecordsByLocation } from './utils';

Chart.register(...registerables);

const charts = new Map<string, Chart>();

export function renderPrecipitationChart(canvasId: string, records: WeatherRecord[]): void {
  const points = dailyRows(records);
  renderChart(canvasId, {
    type: 'bar',
    data: {
      labels: points.map((point) => point.date),
      datasets: [
        {
          label: 'Precipitação mm',
          data: points.map((point) => point.rain),
          backgroundColor: '#7aa7d9',
          borderColor: '#336699',
        },
      ],
    },
    options: defaultOptions(),
  });
}

export function renderTemperatureChart(canvasId: string, records: WeatherRecord[]): void {
  const points = dailyRows(records);
  renderChart(canvasId, {
    type: 'line',
    data: {
      labels: points.map((point) => point.date),
      datasets: [
        {
          label: 'Temperatura média °C',
          data: points.map((point) => point.temperature),
          borderColor: '#b44d4d',
          backgroundColor: '#f1b7b7',
          tension: 0.2,
        },
      ],
    },
    options: defaultOptions(),
  });
}

export function renderPressureChart(canvasId: string, records: WeatherRecord[]): void {
  const points = dailyRows(records);
  renderChart(canvasId, {
    type: 'line',
    data: {
      labels: points.map((point) => point.date),
      datasets: [
        {
          label: 'Pressão média hPa',
          data: points.map((point) => point.pressure),
          borderColor: '#566573',
          backgroundColor: '#c7ced4',
          tension: 0.2,
        },
      ],
    },
    options: defaultOptions(),
  });
}

export function renderHumidityChart(canvasId: string, records: WeatherRecord[]): void {
  const points = dailyRows(records);
  renderChart(canvasId, {
    type: 'line',
    data: {
      labels: points.map((point) => point.date),
      datasets: [
        {
          label: 'Umidade média %',
          data: points.map((point) => point.humidity),
          borderColor: '#3b7f66',
          backgroundColor: '#bfe3d5',
          tension: 0.2,
        },
      ],
    },
    options: defaultOptions(),
  });
}

export function renderComparisonChart(canvasId: string, records: WeatherRecord[]): void {
  const points = dailyRows(records);
  renderChart(canvasId, {
    type: 'bar',
    data: {
      labels: points.map((point) => point.date),
      datasets: [
        {
          type: 'bar',
          label: 'Chuva mm',
          data: points.map((point) => point.rain),
          backgroundColor: '#7aa7d9',
          yAxisID: 'rain',
        },
        {
          type: 'line',
          label: 'Temperatura °C',
          data: points.map((point) => point.temperature),
          borderColor: '#b44d4d',
          backgroundColor: '#f1b7b7',
          tension: 0.2,
          yAxisID: 'weather',
        },
        {
          type: 'line',
          label: 'Pressão hPa',
          data: points.map((point) => point.pressure),
          borderColor: '#566573',
          backgroundColor: '#c7ced4',
          tension: 0.2,
          yAxisID: 'pressure',
        },
      ],
    },
    options: {
      ...defaultOptions(),
      scales: {
        rain: { beginAtZero: true, position: 'left' },
        weather: { beginAtZero: false, position: 'right' },
        pressure: { beginAtZero: false, position: 'right', grid: { drawOnChartArea: false } },
      },
    },
  });
}

export function renderCityRankingChart(canvasId: string, records: WeatherRecord[]): void {
  const rows = Array.from(groupRecordsByLocation(records).entries())
    .map(([locationId, locationRecords]) => ({
      label: getLocationLabel(locationId, locationRecords),
      rain: sum(locationRecords.map((record) => record.precipitation_mm)),
    }))
    .sort((a, b) => b.rain - a.rain);

  renderChart(canvasId, {
    type: 'bar',
    data: {
      labels: rows.map((row) => row.label),
      datasets: [
        {
          label: 'Chuva acumulada mm',
          data: rows.map((row) => row.rain),
          backgroundColor: '#9fbf75',
          borderColor: '#59743b',
        },
      ],
    },
    options: {
      ...defaultOptions(),
      indexAxis: 'y',
    },
  });
}

export function destroyExistingCharts(): void {
  for (const chart of charts.values()) {
    chart.destroy();
  }
  charts.clear();
}

function renderChart(canvasId: string, config: ChartConfiguration): void {
  const canvas = document.getElementById(canvasId);
  if (!(canvas instanceof HTMLCanvasElement)) return;

  charts.get(canvasId)?.destroy();
  const chart = new Chart(canvas, config);
  charts.set(canvasId, chart);
}

function dailyRows(records: WeatherRecord[]): Array<{
  date: string;
  rain: number;
  temperature: number | null;
  pressure: number | null;
  humidity: number | null;
}> {
  return Array.from(groupRecordsByDate(records).entries())
    .map(([date, dateRecords]) => ({
      date,
      rain: sum(dateRecords.map((record) => record.precipitation_mm)),
      temperature: average(dateRecords.map((record) => record.temperature_c)),
      pressure: average(dateRecords.map((record) => record.pressure_hpa)),
      humidity: average(dateRecords.map((record) => record.humidity_percent)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function defaultOptions(): ChartConfiguration['options'] {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        labels: {
          boxWidth: 12,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };
}

function average(values: Array<number | null>): number | null {
  const numericValues = values.filter((value): value is number => Number.isFinite(value));
  if (numericValues.length === 0) return null;
  return Number((sum(numericValues) / numericValues.length).toFixed(2));
}

function sum(values: Array<number | null>): number {
  return Number(
    values.reduce<number>((total, value) => total + (Number.isFinite(value) ? Number(value) : 0), 0).toFixed(2),
  );
}

function getLocationLabel(locationId: string, records: WeatherRecord[]): string {
  const first = records[0];
  if (!first?.locations) return locationId;
  if (first.locations.city && first.locations.state) return `${first.locations.city}/${first.locations.state}`;
  return first.locations.name;
}

import type { AccessoryPlugin, Logging, Service } from 'homebridge';

import type { ThermoPlatform } from './platform.js';


export interface ThermoHistoryState {
  currentTemp: number;
  setTemp: number;
  valvePosition: number;
}

export interface ThermoHistoryEntry {
  currentTemp: number;
  setTemp: number;
  valvePosition: number;
}

interface FakeGatoHistoryOptions {
  storage: 'fs';
  log: Logging;
}

interface FakeGatoThermoHistoryEntry {
  time?: number;
  currentTemp?: number;
  setTemp?: number;
  valvePosition?: number | null;
}

interface FakeGatoThermoService extends Service {
  history: FakeGatoThermoHistoryEntry[];
  _addEntry(entry: ThermoHistoryEntry & { time: number }): void;
}

interface IndexedFakeGatoThermoHistoryEntry {
  entry: FakeGatoThermoHistoryEntry;
  index: number;
}

type FakeGatoHistoryServiceConstructor = new (
  serviceType: 'thermo',
  accessory: AccessoryPlugin,
  options: FakeGatoHistoryOptions,
) => FakeGatoThermoService;

function numericTime(time: number | undefined): number | undefined {
  if (typeof time === 'number' && Number.isFinite(time)) {
    return time;
  }
  return undefined;
}

function compareNewestFirst(
  left: IndexedFakeGatoThermoHistoryEntry,
  right: IndexedFakeGatoThermoHistoryEntry,
): number {
  const leftTime = numericTime(left.entry.time);
  const rightTime = numericTime(right.entry.time);

  if (leftTime !== undefined && rightTime !== undefined) {
    const timeSort = rightTime - leftTime;
    if (timeSort !== 0) {
      return timeSort;
    }
    return right.index - left.index;
  }

  if (leftTime !== undefined) {
    return -1;
  }
  if (rightTime !== undefined) {
    return 1;
  }

  return right.index - left.index;
}

export class ThermoHistory {
  public readonly service: Service;

  private readonly fakeGatoService: FakeGatoThermoService;

  constructor(platform: ThermoPlatform, accessory: AccessoryPlugin) {
    const HistoryService = platform.fakeGatoHistoryService as FakeGatoHistoryServiceConstructor;
    this.fakeGatoService = new HistoryService('thermo', accessory, { storage: 'fs', log: platform.log });
    this.service = this.fakeGatoService;
  }

  restore(): ThermoHistoryState {
    const state: ThermoHistoryState = {
      currentTemp: 0.0,
      setTemp: 10.0,
      valvePosition: 0.0,
    };
    let hasCurrentTemp = false;
    let hasSetTemp = false;
    let hasValvePosition = false;

    const entries = this.fakeGatoService.history
      .map((entry, index): IndexedFakeGatoThermoHistoryEntry => ({ entry, index }))
      .sort((left, right) => compareNewestFirst(left, right))
      .map(({ entry }) => entry);

    for (const entry of entries) {
      if (!hasCurrentTemp && entry.currentTemp !== undefined) {
        state.currentTemp = entry.currentTemp;
        hasCurrentTemp = true;
      }
      if (!hasSetTemp && entry.setTemp !== undefined) {
        state.setTemp = entry.setTemp;
        hasSetTemp = true;
      }
      if (!hasValvePosition && entry.valvePosition !== undefined && entry.valvePosition !== null) {
        state.valvePosition = entry.valvePosition;
        hasValvePosition = true;
      }

      if (hasCurrentTemp && hasSetTemp && hasValvePosition) {
        break;
      }
    }

    return state;
  }

  record(entry: ThermoHistoryEntry): void {
    this.fakeGatoService._addEntry({
      time: Math.round(new Date().valueOf() / 1000),
      currentTemp: entry.currentTemp,
      setTemp: entry.setTemp,
      valvePosition: entry.valvePosition,
    });
  }
}

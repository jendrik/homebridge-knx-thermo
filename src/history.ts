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

interface FakeGatoThermoHistoryRow {
  currentTemp?: number;
  setTemp?: number;
  valvePosition?: number | null;
}

interface FakeGatoThermoService extends Service {
  history: FakeGatoThermoHistoryRow[];
  _addEntry(entry: ThermoHistoryEntry & { time: number }): void;
}

type FakeGatoHistoryServiceConstructor = new (
  serviceType: 'thermo',
  accessory: AccessoryPlugin,
  options: FakeGatoHistoryOptions,
) => FakeGatoThermoService;

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

    for (let i = this.fakeGatoService.history.length; i > 0; --i) {
      const entry = this.fakeGatoService.history[i - 1];

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

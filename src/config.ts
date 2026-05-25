import type { Logging, PlatformConfig } from 'homebridge';

const DEFAULT_IP = '224.0.23.12';
const DEFAULT_PORT = 3671;
const GROUP_ADDRESS_PATTERN = /^[0-9]{1,4}\/[0-9]{1,4}\/[0-9]{1,4}$/;

export interface ThermoDeviceConfig {
  name: string;
  listen_current_temperature: string;
  listen_target_temperature?: string;
  set_target_temperature?: string;
  listen_current_heating_cooling_state?: string;
  listen_target_heating_cooling_state?: string;
  listen_valve_position?: string;
}

export interface ThermoPlatformConfig {
  ip: string;
  port: number;
  devices: ThermoDeviceConfig[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalGroupAddress(
  record: Record<string, unknown>,
  key: string,
  index: number,
  log: Logging,
): string | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'string' && GROUP_ADDRESS_PATTERN.test(value)) {
    return value;
  }
  log.warn(`Ignoring ${key} for thermostat at index ${index}: expected a KNX group address like 1/2/3.`);
  return undefined;
}

function readRequiredString(
  record: Record<string, unknown>,
  key: string,
  index: number,
  log: Logging,
): string | undefined {
  const value = record[key];
  if (typeof value === 'string' && value.trim() !== '') {
    return value;
  }
  log.warn(`Skipping thermostat at index ${index}: ${key} must be a non-empty string.`);
  return undefined;
}

function readRequiredGroupAddress(
  record: Record<string, unknown>,
  key: string,
  index: number,
  log: Logging,
): string | undefined {
  const value = record[key];
  if (value === undefined) {
    log.warn(`Skipping thermostat at index ${index}: ${key} is required.`);
    return undefined;
  }
  if (typeof value === 'string' && GROUP_ADDRESS_PATTERN.test(value)) {
    return value;
  }
  log.warn(`Ignoring ${key} for thermostat at index ${index}: expected a KNX group address like 1/2/3.`);
  return undefined;
}

function readPort(config: PlatformConfig, log: Logging): number {
  if (Number.isInteger(config.port) && Number.isFinite(config.port) && config.port >= 1 && config.port <= 65535) {
    return config.port;
  }

  log.warn(`Invalid or missing KNX port configured. Using default port ${DEFAULT_PORT}.`);
  return DEFAULT_PORT;
}

function parseDevice(rawDevice: unknown, index: number, log: Logging): ThermoDeviceConfig[] {
  if (!isRecord(rawDevice)) {
    log.warn(`Skipping thermostat at index ${index}: device entry must be an object.`);
    return [];
  }

  const name = readRequiredString(rawDevice, 'name', index, log);
  const listenCurrentTemperature = readRequiredGroupAddress(rawDevice, 'listen_current_temperature', index, log);

  if (name === undefined || listenCurrentTemperature === undefined) {
    return [];
  }

  const device: ThermoDeviceConfig = {
    name,
    listen_current_temperature: listenCurrentTemperature,
  };

  for (const key of [
    'listen_target_temperature',
    'set_target_temperature',
    'listen_current_heating_cooling_state',
    'listen_target_heating_cooling_state',
    'listen_valve_position',
  ] as const) {
    const value = readOptionalGroupAddress(rawDevice, key, index, log);
    if (value !== undefined) {
      device[key] = value;
    }
  }

  return [device];
}

export function parseThermoConfig(config: PlatformConfig, log: Logging): ThermoPlatformConfig {
  const ip = typeof config.ip === 'string' && config.ip.trim() !== '' ? config.ip.trim() : DEFAULT_IP;
  const port = readPort(config, log);
  const rawDevices = Array.isArray(config.devices) ? config.devices : [];

  if (!Array.isArray(config.devices)) {
    log.warn('No valid devices array configured. The plugin will start without thermostat accessories.');
  }

  return {
    ip,
    port,
    devices: rawDevices.flatMap((rawDevice, index) => parseDevice(rawDevice, index, log)),
  };
}

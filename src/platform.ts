import type { API, StaticPlatformPlugin, Logging, PlatformConfig, AccessoryPlugin, Service, Characteristic, uuid } from 'homebridge';

import fakegato from 'fakegato-history';
import { Connection } from 'knx';

import { ThermoAccessory } from './accessory.js';
import { parseThermoConfig } from './config.js';


export class ThermoPlatform implements StaticPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly uuid: typeof uuid;

  public readonly fakeGatoHistoryService;

  public readonly connection: Connection;

  private readonly devices: ThermoAccessory[] = [];

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.uuid = api.hap.uuid;

    this.fakeGatoHistoryService = fakegato(this.api);
    const thermoConfig = parseThermoConfig(config, log);

    // connect
    this.connection = new Connection({
      ipAddr: thermoConfig.ip,
      ipPort: thermoConfig.port,
      handlers: {
        connected: () => {
          log.info('KNX connected');
        },
        error: (connstatus: unknown) => {
          log.error(`KNX status: ${connstatus}`);
        },
      },
    });

    // read devices
    thermoConfig.devices.forEach((device) => {
      this.devices.push(new ThermoAccessory(this, device));
    });

    log.info('finished initializing!');
  }

  accessories(callback: (foundAccessories: AccessoryPlugin[]) => void): void {
    callback(this.devices);
  }
}

import { AccessoryConfig, AccessoryPlugin, CharacteristicValue, Service } from 'homebridge';

import { Datapoint } from 'knx';
import fakegato from 'fakegato-history';

import { PLUGIN_NAME, PLUGIN_VERSION, PLUGIN_DISPLAY_NAME } from './settings';

import { ThermoPlatform } from './platform';


export class ThermoAccessory implements AccessoryPlugin {
  private readonly uuid_base: string;
  private readonly name: string;
  private readonly displayName: string;

  private currentTemp = NaN;
  private setTemp = NaN;
  private valvePosition = NaN;

  private readonly thermostatService: Service;
  private readonly loggingService: fakegato;
  private readonly informationService: Service;

  constructor(
    private readonly platform: ThermoPlatform,
    private readonly config: AccessoryConfig,
  ) {

    class EveThermoValvePosition extends platform.Characteristic {
      public static readonly UUID: string = 'E863F12E-079E-48FF-8F27-9C2605A29F52';

      constructor() {
        super('Valve Position', EveThermoValvePosition.UUID, {
          format: platform.Characteristic.Formats.UINT8,
          unit: platform.Characteristic.Units.PERCENTAGE,
          perms: [platform.Characteristic.Perms.READ, platform.Characteristic.Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
      }
    }

    // class EveThermoProgramCommand extends platform.Characteristic {
    //   public static readonly UUID: string = 'E863F12C-079E-48FF-8F27-9C2605A29F52';

    //   constructor() {
    //     super('Program Command', EveThermoProgramCommand.UUID, {
    //       format: platform.Characteristic.Formats.DATA,
    //       perms: [platform.Characteristic.Perms.WRITE],
    //     });
    //     this.value = this.getDefaultValue();
    //   }
    // }

    // class EveThermoProgramData extends platform.Characteristic {
    //   public static readonly UUID: string = 'E863F12F-079E-48FF-8F27-9C2605A29F52';

    //   constructor() {
    //     super('Program Data', EveThermoProgramData.UUID, {
    //       format: platform.Characteristic.Formats.DATA,
    //       perms: [platform.Characteristic.Perms.READ, platform.Characteristic.Perms.NOTIFY],
    //     });
    //     this.value = this.getDefaultValue();
    //   }
    // }

    this.name = config.name;
    this.uuid_base = platform.uuid.generate(PLUGIN_NAME + '-' + this.name + '-' + config.listen_current_temperature);
    this.displayName = this.uuid_base;

    this.informationService = new platform.Service.AccessoryInformation()
      .setCharacteristic(platform.Characteristic.Name, this.name)
      .setCharacteristic(platform.Characteristic.Identify, this.name)
      .setCharacteristic(platform.Characteristic.Manufacturer, '@jendrik')
      .setCharacteristic(platform.Characteristic.Model, PLUGIN_DISPLAY_NAME)
      .setCharacteristic(platform.Characteristic.SerialNumber, this.displayName)
      .setCharacteristic(platform.Characteristic.FirmwareRevision, PLUGIN_VERSION);

    this.thermostatService = new platform.Service.Thermostat(this.name);
    this.thermostatService.getCharacteristic(platform.Characteristic.StatusActive).updateValue(true);

    // schedules
    // this.thermostatService.addCharacteristic(EveThermoProgramCommand);
    // this.thermostatService.addCharacteristic(EveThermoProgramData);

    this.loggingService = new platform.fakeGatoHistoryService('thermo', this, { storage: 'fs', log: platform.log });

    // initialize from history
    for (let i = this.loggingService.history.length; i > 0; --i) {
      if (isNaN(this.currentTemp)
      && this.loggingService.history[i - 1].currentTemp !== undefined) {
        this.currentTemp = this.loggingService.history[i - 1].currentTemp;
      }
      if (isNaN(this.setTemp)
      && this.loggingService.history[i - 1].setTemp !== undefined) {
        this.setTemp = this.loggingService.history[i - 1].setTemp;
      }
      if (isNaN(this.valvePosition)
      && this.loggingService.history[i - 1].valvePosition !== undefined
      && this.loggingService.history[i - 1].valvePosition !== null) {
        this.valvePosition = this.loggingService.history[i - 1].valvePosition;
      }
    }
    if (isNaN(this.currentTemp)) {
      this.currentTemp = 0.0;
    }
    if (isNaN(this.setTemp)) {
      this.setTemp = 10.0;
    }
    if (isNaN(this.valvePosition)) {
      this.valvePosition = 0.0;
    }

    // Current Temperature
    const dp_listen_current_temperature = new Datapoint({
      ga: config.listen_current_temperature,
      dpt: 'DPT9.001',
      autoread: true,
    }, platform.connection);

    dp_listen_current_temperature.on('change', (oldValue: number, newValue: number) => {
      this.currentTemp = newValue;
      platform.log.info(`Current Temperature: ${this.currentTemp}`);
      this.thermostatService.getCharacteristic(platform.Characteristic.CurrentTemperature).updateValue(this.currentTemp);
      this.loggingService._addEntry({ time: Math.round(new Date().valueOf() / 1000),
        currentTemp: this.currentTemp,
        setTemp: this.setTemp,
        valvePosition: this.valvePosition,
      });
    });

    this.thermostatService.getCharacteristic(platform.Characteristic.CurrentTemperature).onGet(async () => {
      return this.currentTemp;
    });

    // Target Temperature
    if (config.listen_target_temperature !== undefined) {
      const dp_listen_target_temperature = new Datapoint({
        ga: config.listen_target_temperature,
        dpt: 'DPT9.001',
        autoread: true,
      }, platform.connection);

      dp_listen_target_temperature.on('change', (oldValue: number, newValue: number) => {
        this.setTemp = newValue;
        platform.log.info(`Target Temperature: ${this.setTemp}`);
        this.thermostatService.getCharacteristic(platform.Characteristic.TargetTemperature).updateValue(this.setTemp);
        this.loggingService._addEntry({ time: Math.round(new Date().valueOf() / 1000),
          currentTemp: this.currentTemp,
          setTemp: this.setTemp,
          valvePosition: this.valvePosition,
        });
      });

      this.thermostatService.getCharacteristic(platform.Characteristic.TargetTemperature).onGet(async () => {
        return this.setTemp;
      });
    }

    if (config.set_target_temperature !== undefined) {
      const dp_set_target_temperature = new Datapoint({
        ga: config.set_target_temperature,
        dpt: 'DPT9.001',
        autoread: true,
      }, platform.connection);

      dp_set_target_temperature.on('change', (oldValue: number, newValue: number) => {
        platform.log.info(`Target Temperature from KNX: ${newValue}`);
        this.thermostatService.getCharacteristic(platform.Characteristic.TargetTemperature).updateValue(newValue);
      });

      this.thermostatService.getCharacteristic(platform.Characteristic.TargetTemperature)
        .onSet(async (value: CharacteristicValue) => {
          platform.log.info(`Target Temperature from HomeKit: ${Number(value)}`);
          dp_set_target_temperature.write(Number(value));
        });
    }

    // HeatingCooling State
    if (config.listen_current_heating_cooling_state !== undefined) {
      const dp_listen_current_heating_cooling_state = new Datapoint({
        ga: config.listen_current_heating_cooling_state,
        dpt: 'DPT7',
        autoread: true,
      }, platform.connection);

      dp_listen_current_heating_cooling_state.on('change', (oldValue: number, newValue: number) => {
        platform.log.info(`listen_current_heating_cooling_state: ${newValue}`);

        const RHCC_HEATING = 1 << 8;
        const RHCC_DISABLED = (1 << 7) | (1 << 11);

        let state = 0;
        if (newValue & RHCC_DISABLED) {
          state = 0;
        } else if (newValue & RHCC_HEATING) {
          state = 1;
        } else {
          state = 2;
        }

        this.thermostatService.getCharacteristic(platform.Characteristic.CurrentHeatingCoolingState).updateValue(state);
        this.thermostatService.getCharacteristic(platform.Characteristic.TargetHeatingCoolingState).updateValue(state);
      });
    }

    if (config.listen_target_heating_cooling_state !== undefined) {
      const dp_listen_target_heating_cooling_state = new Datapoint({
        ga: config.listen_target_heating_cooling_state,
        dpt: 'DPT7',
        autoread: true,
      }, platform.connection);

      dp_listen_target_heating_cooling_state.on('change', (oldValue: number, newValue: number) => {
        platform.log.info(`listen_target_heating_cooling_state: ${newValue}`);
      });
    }

    this.thermostatService.getCharacteristic(platform.Characteristic.TargetHeatingCoolingState)
      .onSet(async (value: CharacteristicValue) => {
        platform.log.info(`Target Heating Cooling State from HomeKit: ${value}`);
      });

    // valve position
    if (config.listen_valve_position !== undefined) {
      this.thermostatService.addCharacteristic(EveThermoValvePosition);

      const dp_listen_valve_position = new Datapoint({
        ga: config.listen_valve_position,
        dpt: 'DPT5.001',
        autoread: true,
      }, platform.connection);

      dp_listen_valve_position.on('change', (oldValue: number, newValue: number) => {
        this.valvePosition = newValue;
        platform.log.info(`Current Valve Position: ${this.valvePosition}`);
        this.thermostatService.getCharacteristic(EveThermoValvePosition).updateValue(this.valvePosition);
        this.loggingService._addEntry({ time: Math.round(new Date().valueOf() / 1000),
          currentTemp: this.currentTemp,
          setTemp: this.setTemp,
          valvePosition: this.valvePosition,
        });
      });

      this.thermostatService.getCharacteristic(EveThermoValvePosition).onGet(async () => {
        return this.valvePosition;
      });
    }
  }

  getServices(): Service[] {
    return [
      this.informationService,
      this.thermostatService,
      this.loggingService,
    ];
  }
}

# homebridge-knx-thermo

Homebridge plugin for KNX thermostats. Exposes KNX-based thermostat devices to Apple HomeKit via [Homebridge](https://homebridge.io).

## Features

- Current and target temperature reading/control via KNX group addresses
- Heating/cooling state monitoring
- Valve position reporting (Eve-compatible)
- Temperature and valve history logging via [fakegato-history](https://github.com/simont77/fakegato-history) (viewable in the Eve app)
- Supports multiple thermostats per KNX connection

## Requirements

- [Homebridge](https://homebridge.io) v1.8.0+ or v2.0.0+
- Node.js v20.18.0+, v22.10.0+, or v24.0.0+
- A KNX IP router or interface on the network

## Installation

Install via the Homebridge UI by searching for `homebridge-knx-thermo`, or manually:

```sh
npm install -g @jendrik/homebridge-knx-thermo
```

## Configuration

Configure via the Homebridge UI (recommended) or add the following to your Homebridge `config.json`:

```json
{
  "platforms": [
    {
      "platform": "knx-thermo",
      "ip": "224.0.23.12",
      "port": 3671,
      "devices": [
        {
          "name": "Living Room",
          "listen_current_temperature": "1/2/3",
          "listen_target_temperature": "1/2/4",
          "set_target_temperature": "1/2/5",
          "listen_current_heating_cooling_state": "1/2/6",
          "listen_target_heating_cooling_state": "1/2/7",
          "listen_valve_position": "1/2/8"
        }
      ]
    }
  ]
}
```

### Global Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `ip` | IP address of the KNX router/interface | `224.0.23.12` (multicast) |
| `port` | KNX port | `3671` |

### Device Settings

| Setting | Required | KNX DPT | Description |
|---------|----------|---------|-------------|
| `name` | Yes | - | Display name in HomeKit |
| `listen_current_temperature` | Yes | DPT9.001 | Group address for current temperature |
| `listen_target_temperature` | No | DPT9.001 | Group address for target temperature |
| `set_target_temperature` | No | DPT9.001 | Group address to write target temperature |
| `listen_current_heating_cooling_state` | No | DPT7 | Group address for current heating/cooling state |
| `listen_target_heating_cooling_state` | No | DPT7 | Group address for target heating/cooling state |
| `listen_valve_position` | No | DPT5.001 | Group address for valve position (Eve-compatible) |

All group addresses use the three-level KNX format (e.g., `1/2/3`).

## Development

```sh
# Install dependencies
npm install

# Build
npm run build

# Lint
npm run lint

# Watch mode (rebuild on changes and restart Homebridge)
npm run watch
```

## License

[Apache-2.0](LICENSE)

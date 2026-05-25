# Homebridge 2 Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `@jendrik/homebridge-knx-thermo` Homebridge 2.x-only while preserving the existing static platform architecture and `fakegato-history` support.

**Architecture:** Keep `StaticPlatformPlugin`. Add explicit config parsing, isolate `fakegato-history` behind a wrapper, tighten Homebridge 2/Node 22+ metadata, and make target-temperature state consistent across KNX, HomeKit, and history.

**Tech Stack:** TypeScript ESM, Homebridge 2.x, HAP-NodeJS through Homebridge APIs, `knx`, `fakegato-history`, ESLint 9, npm lockfile.

---

## File Structure

- Modify `package.json`: Homebridge 2/Node 22+ engines, dependency versions, scripts if a smoke check is added.
- Modify `package-lock.json`: refreshed npm dependency graph.
- Modify `config.schema.json`: strict schema with numeric port and object-level required fields.
- Create `src/config.ts`: typed config interfaces, defaults, KNX group-address validation, platform config parser.
- Create `src/history.ts`: typed wrapper around `fakegato-history` service and history restoration.
- Modify `src/platform.ts`: use parsed config, skip invalid devices, instantiate accessories from typed config, register shutdown cleanup when available.
- Modify `src/accessory.ts`: consume typed device config and history wrapper, remove direct history `_addEntry` calls from accessory code, fix target-temperature state consistency.
- Modify `src/types/fakegato-history.d.ts`: improve local declarations only as needed by `src/history.ts`.
- Modify `README.md`: document Homebridge 2.x, Node 22/24, numeric port, and unchanged fakegato support.

## Task 1: Dependencies And Package Metadata

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Check current published versions**

Run:

```bash
npm view homebridge version engines --json
npm view knx version --json
npm view fakegato-history version --json
npm outdated --json || true
```

Expected: `homebridge` is stable 2.x, `knx` is 2.x, and `fakegato-history` is 0.6.x.

- [ ] **Step 2: Update runtime and development dependencies**

Run:

```bash
npm pkg set engines.node='^22 || ^24'
npm pkg set engines.homebridge='^2.0.0'
npm install homebridge@^2 knx@^2.5.4 fakegato-history@^0.6.7 --save
npm install @types/node@^24 typescript@^5.9 @eslint/js@^9 eslint@^9 typescript-eslint@^8 rimraf@^6 nodemon@^3 --save-dev
```

Expected: `package.json` no longer references Homebridge 1.x, Homebridge beta, or Node 20.

- [ ] **Step 3: Verify dependency graph installs**

Run:

```bash
npm install
npm ls homebridge knx fakegato-history
```

Expected: npm exits successfully and reports one installed version for each runtime package.

- [ ] **Step 4: Commit dependency metadata**

Run:

```bash
git add package.json package-lock.json
git commit -m "chore: update homebridge 2 dependency metadata"
```

## Task 2: Typed Config Parser

**Files:**
- Create: `src/config.ts`
- Modify: `src/platform.ts`

- [ ] **Step 1: Create config types and parser**

Create `src/config.ts` with this shape:

```ts
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

export function parseThermoConfig(config: PlatformConfig, log: Logging): ThermoPlatformConfig {
  const ip = typeof config.ip === 'string' && config.ip.trim() !== '' ? config.ip : DEFAULT_IP;
  const port = typeof config.port === 'number' ? config.port : DEFAULT_PORT;
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

function readRequiredString(record: Record<string, unknown>, key: string, index: number, log: Logging): string | undefined {
  const value = record[key];
  if (typeof value === 'string' && value.trim() !== '') {
    return value;
  }
  log.warn(`Skipping thermostat at index ${index}: ${key} must be a non-empty string.`);
  return undefined;
}

function readRequiredGroupAddress(record: Record<string, unknown>, key: string, index: number, log: Logging): string | undefined {
  const value = readOptionalGroupAddress(record, key, index, log);
  if (value === undefined) {
    log.warn(`Skipping thermostat at index ${index}: ${key} is required.`);
  }
  return value;
}

function readOptionalGroupAddress(record: Record<string, unknown>, key: string, index: number, log: Logging): string | undefined {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
```

- [ ] **Step 2: Wire parser into platform**

In `src/platform.ts`, import `parseThermoConfig` and replace direct `config.ip`, `config.port`, and `config.devices` access with parsed config:

```ts
const thermoConfig = parseThermoConfig(config, log);

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

thermoConfig.devices.forEach((device) => {
  this.devices.push(new ThermoAccessory(this, device));
});
```

- [ ] **Step 3: Build to expose type errors**

Run:

```bash
npm run build
```

Expected: any remaining type errors point to `ThermoAccessory` still accepting `Record<string, unknown>`, which Task 4 will fix.

- [ ] **Step 4: Commit config parser**

Run after build is passing or after Task 4 if this task cannot compile independently:

```bash
git add src/config.ts src/platform.ts
git commit -m "feat: add typed thermostat config parsing"
```

## Task 3: Strict Homebridge UI Schema

**Files:**
- Modify: `config.schema.json`
- Modify: `README.md`

- [ ] **Step 1: Replace schema with strict JSON Schema structure**

Update `config.schema.json` so `schema` contains `type: "object"`, object-level `required`, numeric `port`, and strict device objects:

```json
{
  "pluginAlias": "knx-thermo",
  "pluginType": "platform",
  "singular": true,
  "schema": {
    "type": "object",
    "properties": {
      "ip": {
        "title": "KNX Router or Interface",
        "type": "string",
        "default": "224.0.23.12",
        "description": "IP of the KNX router or interface."
      },
      "port": {
        "title": "KNX Port",
        "type": "number",
        "default": 3671,
        "description": "KNX port."
      },
      "devices": {
        "title": "Thermostats",
        "type": "array",
        "default": [],
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": ["name", "listen_current_temperature"],
          "properties": {
            "name": {
              "title": "Name",
              "type": "string",
              "minLength": 1,
              "placeholder": "Living Room"
            },
            "listen_current_temperature": {
              "title": "Listen Current Temperature Address",
              "type": "string",
              "placeholder": "1/1/1",
              "pattern": "^[0-9]{1,4}/[0-9]{1,4}/[0-9]{1,4}$"
            },
            "listen_target_temperature": {
              "title": "Listen Target Temperature Address",
              "type": "string",
              "placeholder": "1/1/1",
              "pattern": "^[0-9]{1,4}/[0-9]{1,4}/[0-9]{1,4}$"
            },
            "set_target_temperature": {
              "title": "Set Target Temperature Address",
              "type": "string",
              "placeholder": "1/1/1",
              "pattern": "^[0-9]{1,4}/[0-9]{1,4}/[0-9]{1,4}$"
            },
            "listen_current_heating_cooling_state": {
              "title": "Listen Current Heating Cooling State Address",
              "type": "string",
              "placeholder": "1/1/1",
              "pattern": "^[0-9]{1,4}/[0-9]{1,4}/[0-9]{1,4}$"
            },
            "listen_target_heating_cooling_state": {
              "title": "Listen Target Heating Cooling State Address",
              "type": "string",
              "placeholder": "1/1/1",
              "pattern": "^[0-9]{1,4}/[0-9]{1,4}/[0-9]{1,4}$"
            },
            "listen_valve_position": {
              "title": "Listen Current Valve Position Address",
              "type": "string",
              "placeholder": "1/1/1",
              "pattern": "^[0-9]{1,4}/[0-9]{1,4}/[0-9]{1,4}$"
            }
          }
        }
      }
    },
    "additionalProperties": false
  },
  "layout": [
    {
      "key": "devices",
      "type": "array",
      "orderable": false,
      "buttonText": "Add Thermostat",
      "items": [
        "devices[].name",
        "devices[].listen_current_temperature",
        "devices[].listen_target_temperature",
        "devices[].set_target_temperature",
        "devices[].listen_current_heating_cooling_state",
        "devices[].listen_target_heating_cooling_state",
        "devices[].listen_valve_position"
      ]
    },
    {
      "type": "section",
      "title": "Global",
      "expandable": true,
      "expanded": false,
      "items": ["ip", "port"]
    }
  ]
}
```

- [ ] **Step 2: Update README requirements**

Change Requirements to say:

```md
- [Homebridge](https://homebridge.io) v2.0.0+
- Node.js v22 or v24
- A KNX IP router or interface on the network
```

Confirm the example keeps `"port": 3671` as a number.

- [ ] **Step 3: Validate JSON files**

Run:

```bash
node -e "JSON.parse(require('node:fs').readFileSync('config.schema.json', 'utf8')); JSON.parse(require('node:fs').readFileSync('package.json', 'utf8'));"
```

Expected: no output and exit code 0.

- [ ] **Step 4: Commit schema and docs**

Run:

```bash
git add config.schema.json README.md
git commit -m "docs: update homebridge 2 config schema"
```

## Task 4: History Wrapper And Typed Accessory Config

**Files:**
- Create: `src/history.ts`
- Modify: `src/accessory.ts`
- Modify: `src/types/fakegato-history.d.ts`

- [ ] **Step 1: Add history wrapper**

Create `src/history.ts`:

```ts
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

interface FakegatoHistoryEntry {
  currentTemp?: number;
  setTemp?: number;
  valvePosition?: number | null;
}

interface FakegatoHistoryService extends Service {
  history: FakegatoHistoryEntry[];
  _addEntry(entry: FakegatoHistoryEntry & { time: number }): void;
}

const DEFAULT_HISTORY_STATE: ThermoHistoryState = {
  currentTemp: 0,
  setTemp: 10,
  valvePosition: 0,
};

export class ThermoHistory {
  public readonly service: FakegatoHistoryService;

  constructor(platform: ThermoPlatform, accessory: AccessoryPlugin, log: Logging) {
    this.service = new platform.fakeGatoHistoryService('thermo', accessory, { storage: 'fs', log }) as FakegatoHistoryService;
  }

  restore(): ThermoHistoryState {
    const state = { ...DEFAULT_HISTORY_STATE };
    let restoredCurrentTemp = false;
    let restoredSetTemp = false;
    let restoredValvePosition = false;

    for (let index = this.service.history.length - 1; index >= 0; index -= 1) {
      const entry = this.service.history[index];
      if (!restoredCurrentTemp && entry.currentTemp !== undefined) {
        state.currentTemp = entry.currentTemp;
        restoredCurrentTemp = true;
      }
      if (!restoredSetTemp && entry.setTemp !== undefined) {
        state.setTemp = entry.setTemp;
        restoredSetTemp = true;
      }
      if (!restoredValvePosition && entry.valvePosition !== undefined && entry.valvePosition !== null) {
        state.valvePosition = entry.valvePosition;
        restoredValvePosition = true;
      }
    }

    return state;
  }

  record(entry: ThermoHistoryEntry): void {
    this.service._addEntry({
      time: Math.round(Date.now() / 1000),
      currentTemp: entry.currentTemp,
      setTemp: entry.setTemp,
      valvePosition: entry.valvePosition,
    });
  }
}
```

- [ ] **Step 2: Update accessory constructor signature**

In `src/accessory.ts`, import `ThermoDeviceConfig` and `ThermoHistory`:

```ts
import type { ThermoDeviceConfig } from './config.js';
import { ThermoHistory } from './history.js';
```

Change constructor config type:

```ts
constructor(
  private readonly platform: ThermoPlatform,
  private readonly config: ThermoDeviceConfig,
) {
```

- [ ] **Step 3: Replace direct fakegato usage in accessory**

Replace the `loggingService` property with:

```ts
private readonly history: ThermoHistory;
```

Replace construction and restore logic with:

```ts
this.history = new ThermoHistory(platform, this, platform.log);
const restoredState = this.history.restore();
this.currentTemp = restoredState.currentTemp;
this.setTemp = restoredState.setTemp;
this.valvePosition = restoredState.valvePosition;
```

Replace each `_addEntry` block with:

```ts
this.recordHistory();
```

Add this private method:

```ts
private recordHistory(): void {
  this.history.record({
    currentTemp: this.currentTemp,
    setTemp: this.setTemp,
    valvePosition: this.valvePosition,
  });
}
```

Update `getServices()` to return `this.history.service`.

- [ ] **Step 4: Build and fix local declaration mismatches**

Run:

```bash
npm run build
```

Expected: build passes. If TypeScript rejects the fakegato constructor type, adjust `src/types/fakegato-history.d.ts` so the default export can be called with `api` and returns a constructable history service.

- [ ] **Step 5: Commit history wrapper**

Run:

```bash
git add src/history.ts src/accessory.ts src/types/fakegato-history.d.ts
git commit -m "refactor: wrap fakegato thermostat history"
```

## Task 5: Accessory State Consistency And Write Errors

**Files:**
- Modify: `src/accessory.ts`

- [ ] **Step 1: Add helper methods for temperature updates**

In `ThermoAccessory`, add:

```ts
private updateCurrentTemperature(value: number): void {
  this.currentTemp = value;
  this.platform.log.info(`Current Temperature: ${this.currentTemp}`);
  this.thermostatService.getCharacteristic(this.platform.Characteristic.CurrentTemperature).updateValue(this.currentTemp);
  this.recordHistory();
}

private updateTargetTemperature(value: number, source: 'KNX' | 'HomeKit'): void {
  this.setTemp = value;
  this.platform.log.info(`Target Temperature from ${source}: ${this.setTemp}`);
  this.thermostatService.getCharacteristic(this.platform.Characteristic.TargetTemperature).updateValue(this.setTemp);
  this.recordHistory();
}
```

Keep the `EveThermoValvePosition` class scoped in the constructor. Valve-position updates can stay inline because the characteristic class is local to that setup block.

- [ ] **Step 2: Use helpers in KNX listeners**

Change current-temperature listener to:

```ts
dp_listen_current_temperature.on('change', (_oldValue: number, newValue: number) => {
  this.updateCurrentTemperature(newValue);
});
```

Change target-temperature listeners to call:

```ts
this.updateTargetTemperature(newValue, 'KNX');
```

Change valve-position listener to:

```ts
dp_listen_valve_position.on('change', (_oldValue: number, newValue: number) => {
  this.valvePosition = newValue;
  platform.log.info(`Current Valve Position: ${this.valvePosition}`);
  this.thermostatService.getCharacteristic(EveThermoValvePosition).updateValue(this.valvePosition);
  this.recordHistory();
});
```

- [ ] **Step 3: Make HomeKit writes update state consistently**

Change target-temperature `onSet` to:

```ts
this.thermostatService.getCharacteristic(platform.Characteristic.TargetTemperature)
  .onSet(async (value: CharacteristicValue) => {
    const targetTemperature = Number(value);
    try {
      dp_set_target_temperature.write(targetTemperature);
      this.updateTargetTemperature(targetTemperature, 'HomeKit');
    } catch (error) {
      platform.log.error(`Failed to write target temperature ${targetTemperature} to KNX: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });
```

- [ ] **Step 4: Build and lint**

Run:

```bash
npm run build
npm run lint
```

Expected: both pass.

- [ ] **Step 5: Commit state consistency fix**

Run:

```bash
git add src/accessory.ts
git commit -m "fix: keep thermostat target state consistent"
```

## Task 6: Platform Shutdown Handling

**Files:**
- Modify: `src/platform.ts`

- [ ] **Step 1: Inspect KNX connection close API**

Run:

```bash
node -e "const knx = require('knx'); console.log(Object.keys(knx)); const c = new knx.Connection({ handlers: {} }); console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(c))); process.exit(0);"
```

Expected: output includes `Disconnect`.

- [ ] **Step 2: Add guarded shutdown handler**

Add:

```ts
api.on('shutdown', () => {
  const connection = this.connection as Connection & { Disconnect?: () => void };
  if (typeof connection.Disconnect === 'function') {
    connection.Disconnect();
  }
});
```

The current `knx` 2.x `Connection` prototype exposes `Disconnect`, so do not use a different method unless the installed package version changes during Task 1.

- [ ] **Step 3: Build and lint**

Run:

```bash
npm run build
npm run lint
```

Expected: both pass.

- [ ] **Step 4: Commit shutdown handling when code changed**

Run only if `src/platform.ts` changed:

```bash
git add src/platform.ts
git commit -m "fix: close knx connection on shutdown"
```

## Task 7: Final Verification And Documentation Pass

**Files:**
- Modify: `README.md` if verification finds docs drift.

- [ ] **Step 1: Run full verification**

Run:

```bash
npm run lint
npm run build
npm pack --dry-run
```

Expected: lint and build pass. `npm pack --dry-run` includes `dist`, `config.schema.json`, `README.md`, `LICENSE`, and `package.json`.

- [ ] **Step 2: Inspect final diff**

Run:

```bash
git status --short
git diff --stat HEAD
git diff -- package.json config.schema.json README.md src/platform.ts src/accessory.ts src/config.ts src/history.ts
```

Expected: only intended Homebridge 2 modernization changes remain uncommitted.

- [ ] **Step 3: Commit final docs or packaging adjustments**

If Step 1 or Step 2 required README or packaging fixes, commit them:

```bash
git add README.md package.json package-lock.json .npmignore
git commit -m "docs: refresh homebridge 2 plugin documentation"
```

- [ ] **Step 4: Report completion**

Summarize:

- Homebridge 2 and Node engine changes.
- Dependency updates.
- Config validation/schema changes.
- `fakegato-history` retention and wrapper.
- Target-temperature consistency fix.
- Verification command results.

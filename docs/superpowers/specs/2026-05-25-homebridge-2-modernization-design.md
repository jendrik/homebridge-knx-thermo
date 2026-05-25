# Homebridge 2 Modernization Design

## Purpose

Modernize `@jendrik/homebridge-knx-thermo` for Homebridge 2.0 while keeping the existing static platform architecture. Backward compatibility with Homebridge 1.x and older Node.js versions is not required. Eve history support through `fakegato-history` must remain.

## Scope

This work updates runtime compatibility, dependencies, configuration validation, typing, and targeted internal behavior. It does not convert the plugin to a dynamic platform and does not remove or replace `fakegato-history`.

## Architecture

The plugin remains a `StaticPlatformPlugin`.

- `src/index.ts` keeps registering the existing `knx-thermo` platform alias.
- `ThermoPlatform` owns the Homebridge API references, one KNX connection, parsed platform config, and the list of thermostat accessories.
- `ThermoAccessory` owns the HomeKit services, KNX datapoints, local thermostat state, and Eve history integration for one configured thermostat.

The package becomes Homebridge 2.x-only:

- `engines.homebridge` is `^2.0.0`.
- `engines.node` is `^22 || ^24`, matching current Homebridge 2 requirements.
- `homebridge` is updated to the current stable 2.x development dependency.

## Dependency Updates

Update the plugin and tooling dependencies conservatively:

- Update `homebridge` from beta to current stable 2.x.
- Update `knx` to the current 2.x release.
- Update `fakegato-history` to the current 0.6.x release and keep it as a runtime dependency.
- Update TypeScript, ESLint, and related tooling only within stable lines that support the current TypeScript ESM setup.

Avoid adopting TypeScript 6 or ESLint 10 unless local install, lint, and build verification show they are stable for this project. Those major tooling jumps are not required for Homebridge 2 readiness.

## Config Model

Add a typed config boundary instead of passing raw `PlatformConfig` and `Record<string, unknown>` through the runtime.

The normalized platform config has:

- `ip`: string, default `"224.0.23.12"`.
- `port`: number, default `3671`.
- `devices`: array, default `[]`.

Each valid device has:

- `name`: required string.
- `listen_current_temperature`: required KNX group address.
- `listen_target_temperature`: optional KNX group address.
- `set_target_temperature`: optional KNX group address.
- `listen_current_heating_cooling_state`: optional KNX group address.
- `listen_target_heating_cooling_state`: optional KNX group address.
- `listen_valve_position`: optional KNX group address.

Runtime parsing should skip invalid devices with clear logs. Missing `devices` should log a warning and produce an empty accessory list rather than crashing.

`config.schema.json` should be corrected to use strict JSON Schema structure:

- `port` is a number, not a string.
- Required fields are declared with object-level `required` arrays.
- Group addresses keep the existing three-level KNX pattern.
- `additionalProperties: false` is used where practical.

## Accessory Behavior

The existing HomeKit surface stays intact:

- Accessory information service.
- Thermostat service.
- Current temperature reading from KNX.
- Optional target temperature reading from KNX.
- Optional target temperature writes to KNX.
- Optional heating/cooling state monitoring.
- Optional Eve-compatible valve position characteristic.
- Eve history service through `fakegato-history`.

Target temperature state must become internally consistent. When target temperature changes from either a KNX listener or a HomeKit write, the accessory should update the local `setTemp`, update HomeKit, and record history where appropriate. HomeKit reads should return the same last-known target value.

Heating/cooling state mapping should preserve the current behavior unless verification reveals an obvious bug:

- Disabled maps to HomeKit off.
- Heating maps to HomeKit heat.
- Otherwise maps to HomeKit cool.

## History Integration

Keep `fakegato-history`, but isolate its untyped surface in a small wrapper.

The wrapper should:

- Construct the `fakegato-history` thermo service.
- Read previous history entries to restore `currentTemp`, `setTemp`, and `valvePosition`.
- Expose a typed `record` method for new history rows.
- Contain any required `any` usage and private `_addEntry` access.

The accessory should not directly depend on `loggingService._addEntry` outside the wrapper.

## Error Handling And Shutdown

Configuration and KNX errors should be logged with enough context to identify the affected device or group address.

- Invalid devices are skipped.
- KNX connection status and errors are logged but not thrown from event handlers.
- HomeKit write failures are caught and logged.
- If the KNX library exposes a safe connection close or destroy method, register a Homebridge shutdown handler that uses it.

## Verification

Required verification:

- `npm install` or `npm update` as needed to refresh `package-lock.json`.
- `npm run lint`.
- `npm run build`.

Add a lightweight test or smoke check only if it can cover config parsing or thermostat state mapping without introducing a heavy framework. If a smoke check is added, wire it into the standard verification path.

## Out Of Scope

- Dynamic platform conversion.
- Homebridge 1.x compatibility.
- Node.js 20 compatibility.
- Removing or replacing `fakegato-history`.
- Adding a Homebridge UI server or custom UI.
- Changing KNX datapoint semantics beyond targeted consistency fixes.

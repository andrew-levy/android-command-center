const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAvailability,
  canCreateEmulator,
  canPlayRoute,
  canUseDeviceControls,
  matchAvdDevices,
  parseCoords,
  parseEmulatorProfiles,
  restoreOpenSections,
} = require('../media/panel-logic.js');

test('parseCoords accepts boundaries and rejects incomplete or out-of-range values', () => {
  assert.deepEqual(parseCoords('0, -180'), {lat: 0, lng: -180});
  assert.deepEqual(parseCoords('90 180'), {lat: 90, lng: 180});
  assert.equal(parseCoords('91, 0'), null);
  assert.equal(parseCoords('37.4'), null);
  assert.equal(parseCoords('north, west'), null);
});

test('saved sections migrate old ids and reset obsolete defaults', () => {
  assert.deepEqual(restoreOpenSections({uiVersion: 2, openSections: ['project', 'database']}, 2), ['build', 'database']);
  assert.deepEqual(restoreOpenSections({uiVersion: 1, openSections: ['device', 'toolchain', 'database']}, 2), ['database']);
  assert.deepEqual(restoreOpenSections({}, 2), ['build']);
});

test('Gradle-only actions remain available without Android CLI', () => {
  assert.deepEqual(buildAvailability(false, true, 1), {run: false, clean: true, sync: true});
  assert.deepEqual(buildAvailability(true, false, 1), {run: false, clean: true, sync: true});
  assert.deepEqual(buildAvailability(true, true, 0), {run: false, clean: true, sync: true});
  assert.deepEqual(buildAvailability(true, true, 2), {run: true, clean: true, sync: true});
});

test('route playback requires ADB and an emulator serial', () => {
  assert.equal(canPlayRoute(true, 'emulator-5554'), true);
  assert.equal(canPlayRoute(true, ''), false);
  assert.equal(canPlayRoute(true, 'physical-123'), false);
  assert.equal(canPlayRoute(false, 'emulator-5554'), false);
});

test('emulator create and device controls gate on the right dependencies', () => {
  assert.equal(canCreateEmulator(true, true), true);
  assert.equal(canCreateEmulator(true, false), false);
  assert.equal(canCreateEmulator(false, true), false);
  assert.equal(canUseDeviceControls(true, 'emulator-5554'), true);
  assert.equal(canUseDeviceControls(false, 'emulator-5554'), false);
  assert.deepEqual(parseEmulatorProfiles('medium_phone\nlarge_desktop\n'), ['medium_phone', 'large_desktop']);
});

test('a lone unidentified emulator is reconciled with the AVD currently starting', () => {
  const booting = {serial: 'emulator-5554', state: 'offline', description: 'emulator-5554'};
  const result = matchAvdDevices(
    [booting],
    ['Pixel_9_Pro_API_31', 'Pixel_4_API_31'],
    'Pixel_4_API_31',
  );

  assert.deepEqual(result.avdMatches, [
    {name: 'Pixel_9_Pro_API_31', device: undefined},
    {name: 'Pixel_4_API_31', device: booting},
  ]);
  assert.deepEqual(result.connected, []);
});

test('ambiguous unidentified emulators remain separate instead of being guessed', () => {
  const devices = [
    {serial: 'emulator-5554', state: 'offline'},
    {serial: 'emulator-5556', state: 'offline'},
  ];
  const result = matchAvdDevices(devices, ['Pixel_4_API_31'], 'Pixel_4_API_31');

  assert.equal(result.avdMatches[0].device, undefined);
  assert.deepEqual(result.connected, devices);
});

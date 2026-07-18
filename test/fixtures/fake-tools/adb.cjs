#!/usr/bin/env node
const args = process.argv.slice(2);
const scenario = process.env.ANDROID_CLI_FAKE_SCENARIO || 'healthy';

function fail(code,message){process.stderr.write(`${message}\n`);process.exit(code)}
function devices(){
 const lines=['List of devices attached'];
 if(scenario==='offline-device')lines.push('emulator-5554 offline product:fake model:Fake_Pixel transport_id:1');
 else if(scenario==='unauthorized-device')lines.push('FAKE-PHYSICAL-1 unauthorized usb:1-1 product:fake model:Fake_Phone transport_id:2');
 else if(scenario==='multiple-devices'){
  lines.push('emulator-5554 device product:fake model:Fake_Pixel transport_id:1');
  lines.push('FAKE-PHYSICAL-1 device usb:1-1 product:fake model:Fake_Phone transport_id:2');
 }else if(scenario!=='no-devices')lines.push('emulator-5554 device product:fake model:Fake_Pixel transport_id:1');
 process.stdout.write(lines.join('\n')+'\n');
}

if(scenario==='adb-error')fail(31,'Fake ADB server is unavailable.');
if(args[0]==='version')process.stdout.write('Android Debug Bridge fake-1.0\n');
else if(args[0]==='devices')devices();
else{
 const command=args[0]==='-s'?args.slice(2):args;
 if(command[0]==='emu'&&command[1]==='avd'&&command[2]==='name')process.stdout.write('Fake_Pixel_API_31\nOK\n');
 else if(command[0]==='emu'&&command[1]==='kill')process.stdout.write('OK: killing emulator\n');
 else if(command[0]==='emu'&&command[1]==='geo')process.stdout.write('OK\n');
 else if(command[0]==='shell'&&command.slice(1,4).join(' ')==='cmd uimode night')process.stdout.write('Night mode: no\n');
 else if(command[0]==='shell'&&command[1]==='settings'&&command[2]==='get'){
  const key=command[4];
  if(key==='font_scale')process.stdout.write('1.0\n');
  else if(key==='user_rotation')process.stdout.write('0\n');
  else if(key==='show_touches')process.stdout.write('0\n');
  else if(key==='pointer_location')process.stdout.write('0\n');
  else process.stdout.write('null\n');
 }
 else if(command[0]==='shell'&&command[1]==='settings'&&command[2]==='put')process.stdout.write('');
 else if(command[0]==='shell'&&command[1]==='getprop'&&command[2]==='debug.layout')process.stdout.write('false\n');
 else if(command[0]==='shell'&&command[1]==='setprop')process.stdout.write('');
 else if(command[0]==='shell'&&command[1]==='service'&&command[2]==='call')process.stdout.write('');
 else if(command[0]==='shell'&&command[1]==='dumpsys'&&command[2]==='battery')process.stdout.write('Current Battery Service state:\n  level: 85\n  status: 2\n  USB powered: true\n');
 else if(command[0]==='shell'&&command[1]==='pm'&&command[2]==='grant')process.stdout.write('');
 else if(command[0]==='shell'&&command[1]==='pm'&&command[2]==='revoke')process.stdout.write('');
 else if(command[0]==='shell'&&command[1]==='pm'&&command[2]==='list')process.stdout.write('package:com.example.androidclitest\npackage:com.example.other\n');
 else if(command[0]==='shell'&&command[1]==='pm'&&command[2]==='path')process.stdout.write('package:/data/app/fake/base.apk\n');
 else if(command[0]==='shell'&&command[1]==='am'&&command[2]==='start')process.stdout.write('Status: ok\nActivity: com.example.androidclitest/.MainActivity\n');
 else if(command[0]==='shell'&&command[1]==='am'&&command[2]==='force-stop')process.stdout.write('');
 else if(command[0]==='shell'&&command[1]==='pm'&&command[2]==='clear')process.stdout.write('Success\n');
 else if(command[0]==='shell'&&command[1]==='dumpsys'&&command[2]==='gfxinfo'){
  if(command.includes('reset'))process.stdout.write('Graphics stats reset.\n');
  else process.stdout.write([
   'Applications Graphics Acceleration Info:',
   'Total frames rendered: 120',
   'Janky frames: 6 (5.00%)',
   '50th percentile: 12ms',
   'Number Missed Vsync: 3',
   '---PROFILEDATA---',
   'Flags,IntendedVsync,Vsync,FrameCompleted',
   '0,1000000000,1000000000,1012000000',
   '0,1016666667,1016666667,1030000000',
   '0,1033333334,1033333334,1055000000',
   '0,1050000001,1050000001,1064000000',
   '---PROFILEDATA---',
   '',
  ].join('\n'));
 }
 else if(command[0]==='shell'&&command[1]==='dumpsys'&&command[2]==='meminfo'){
  process.stdout.write([
   'Applications Memory Usage:',
   'App Summary',
   '                       Pss(KB)',
   '                       ------',
   '           Java Heap:    42000',
   '         Native Heap:    18000',
   '                TOTAL:   188416',
   '',
  ].join('\n'));
 }
 else if(command[0]==='shell'&&command[1]==='screenrecord')process.stdout.write('');
 else if(command[0]==='shell'&&command[1]==='pkill')process.stdout.write('');
 else if(command[0]==='shell'&&command[1]==='rm')process.stdout.write('');
 else if(command[0]==='pull')process.stdout.write('');
 else if(command.includes('run-as'))fail(32,'run-as: package not debuggable in fake scenario');
 else process.stdout.write(`Fake ADB accepted: ${command.join(' ')}\n`);
}

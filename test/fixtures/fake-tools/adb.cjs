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
 else if(command[0]==='shell'&&command[1]==='pm'&&command[2]==='list')process.stdout.write('package:com.example.androidclitest\npackage:com.example.other\n');
 else if(command[0]==='shell'&&command[1]==='pm'&&command[2]==='path')process.stdout.write('package:/data/app/fake/base.apk\n');
 else if(command[0]==='shell'&&command[1]==='am'&&command[2]==='start')process.stdout.write('Status: ok\nActivity: com.example.androidclitest/.MainActivity\n');
 else if(command[0]==='shell'&&command[1]==='am'&&command[2]==='force-stop')process.stdout.write('');
 else if(command[0]==='shell'&&command[1]==='pm'&&command[2]==='clear')process.stdout.write('Success\n');
 else if(command.includes('run-as'))fail(32,'run-as: package not debuggable in fake scenario');
 else process.stdout.write(`Fake ADB accepted: ${command.join(' ')}\n`);
}

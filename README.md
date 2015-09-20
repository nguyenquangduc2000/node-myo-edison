# node-myo-edison
Control Myo Armband with node.js on your Intel Edison Board

## Prerequisites
Install noble
see : https://github.com/sandeepmistry/noble

## Usage
```javascript
var myo = require('./myo.js');
```

## CONNECT

### Quick Connect
```javascript
myo.quickConnect(function(err, id){
    console.log('myo unique id : ', id);
});
```

### Classic Connect
```javascript
myo.scan.start(function(err, data){
    console.log(err, data);
});
myo.event.on('ready', function(id){
    console.log('myo unique id : ', id);
});
```

## DISCONNECT
```javascript
myo.connected[id]..disconnect();
```

## INITIATE

Initiate Myo for receiving stream and data
```javascript
myo.connected[id].unlock("hold", function() {
    // lock - time (will lock after inactivity) - hold
    myo.connected[id].sleepMode("forever", function () {
        // normal - forever (never sleep)
        myo.connected[id].setMode('send', 'all', 'enabled', function () {
            // emg : none - send - raw
            // imu : none - data - events - all - raw
            // classifier : enabled - disabled
            console.log('initiated');
        });
    });
});    
```

## INTERACTION

### Get Name
```javascript
myo.connected[id].generic.getName(function (err, data){ // Get device name
    console.log(err, data);
});
```
### Set Name
```javascript
myo.connected[id].generic.setName('Myo NAME', function (err, data){ // Set device name
    console.log(err, data);
});
```
### Battery Info
```javascript
myo.connected[id].battery(function(err, data) {
    console.log("battery : " + data + " %"); // data => battery in percent
});
```
### Vibrate Classic
```javascript
myo.connected[id].vibrate("strong"); // light, medium, strong
```
### Vibrate Custom
```javascript
myo.connected[id].vibrate2(1500, 255); // time in milliseconds, power 0 - 255
```
### Vibrate Notify
```javascript
myo.connected[id].notify(); // notify :  short and light vibration
```
### Deep Sleep
```javascript
myo.connected[id].deepSleep(function(){}); // go into deep sleep
```
### Basic Info
```javascript
myo.connected[id].info(function(err, data){
    console.log(err, data);
});
```
### Firmware Info
```javascript
myo.connected[id].firmware(function(err, data){
    console.log(err, data);
});
```

## STREAM

Set "true" to get stream on events or "false" to disable.

## IMU
```javascript
myo.connected[id].imu(true);
```
## Classifier
```javascript
myo.connected[id].classifier(true);
```
## EMG
```javascript
myo.connected[id].emg(true);
```

## EVENTS
```javascript
myo.event.on('discover', function(id){
    console.log('discover', id);
});
myo.event.on('connect', function(id){
    console.log('connect', id);
});
myo.event.on('disconnect', function(id){
    console.log('disconnect', id);
});
myo.event.on('ready', function(id){
    console.log('peripheral ready :', id);
});
myo.event.on('imu', function(data){
    console.log('imu', data);
});
myo.event.on('classifier', function(data){
    console.log('classifier', data);
});
myo.event.on('emg4', function(data){
    console.log('emg', data);
});
```
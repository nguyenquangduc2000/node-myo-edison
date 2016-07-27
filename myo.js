var noble = require('noble');
var events = require('events');
var eventEmitter = new events.EventEmitter();

Object.size = function(obj) {
    var size = 0, key;
    for (key in obj) {
        if (obj.hasOwnProperty(key)) size++;
    }
    return size;
};

var ble = false;
var serviceBase = ['d506' , 'a904deb947482c7f4a124842']; // 0x0000
var services = {
    ControlService                : '0001', ///< Myo info service
    MyoInfoCharacteristic         : '0101', ///< Serial number for this Myo and various parameters which
                                            ///< are specific to this firmware. Read-only attribute.
                                            ///< See myohw_fw_info_t.
    FirmwareVersionCharacteristic : '0201', ///< Current firmware version. Read-only characteristic.
                                            ///< See myohw_fw_version_t.
    CommandCharacteristic         : '0401', ///< Issue commands to the Myo. Write-only characteristic.
                                            ///< See myohw_command_t.

    ImuDataService                : '0002', ///< IMU service
    IMUDataCharacteristic         : '0402', ///< See myohw_imu_data_t. Notify-only characteristic.
    MotionEventCharacteristic     : '0a02', ///< Motion event data. Indicate-only characteristic.

    ClassifierService             : '0003', ///< Classifier event service.
    ClassifierEventCharacteristic : '0103', ///< Classifier event data. Indicate-only characteristic. See myohw_pose_t.

    EmgDataService                : '0005', ///< Raw EMG data service.
    EmgData0Characteristic        : '0105', ///< Raw EMG data. Notify-only characteristic.
    EmgData1Characteristic        : '0205', ///< Raw EMG data. Notify-only characteristic.
    EmgData2Characteristic        : '0305', ///< Raw EMG data. Notify-only characteristic.
    EmgData3Characteristic        : '0405'  ///< Raw EMG data. Notify-only characteristic.
};
// Standard Bluetooth device services.
var bluetoothStandard = {
    BatteryService                : '180f', ///< Battery service
    BatteryLevelCharacteristic    : '2a19', ///< Current battery level information. Read/notify characteristic.

    DeviceService                 : '1800',
    DeviceName                    : '2a00' ///< Device name data. Read/write characteristic.
};


function format(data){
    return serviceBase[0] + data + serviceBase[1];
}

for(var k in services){
    services[k] = format(services[k]);
}

noble.on('stateChange', function (state) {
    if (state === 'poweredOn') {
        ble = true;
    } else {
        console.log('bluetooth LE down');
        ble = false;
    }
});

function startScan(callback) {
    if(ble){
        noble.startScanning(services.ControlService);
        callback(false, 'bluetooth LE up');
    }else {
        setTimeout(function () {
            startScan(callback);
        }, 100);
    }
}

function stopScan(){
    noble.stopScanning();
}

var myo = {};

myo.scan = {};
myo.scan.start = startScan;
myo.scan.stop = stopScan;
myo.connected = {};
myo.event = eventEmitter;
myo.connectedSize = function(){
    return Object.size(myo.connected);
};
myo.key = function(){
    return Object.keys(myo.connected);
};
myo.quickConnect = function(callback){
  myo.scan.start(function(err, data){
        if(err){
            callback(true, data);
        }else{
            var loop = setInterval(function(){
                if(myo.connectedSize() > 0){
                    var id = myo.key()[0];
                    if(myo.connected[id].ready) {
                        myo.scan.stop();
                        clearInterval(loop);
                        callback(false, id);
                    }
                }
            },100);
        }
    });
};

function registerUtil(peripheral, callbackMain){
    myo.connected[peripheral.id].disconnect = function(){
        peripheral.disconnect();
    };

    callbackMain();
}

function registerGeneric(GenericAccess, peripheral, callbackMain){
    GenericAccess.discoverCharacteristics([bluetoothStandard.DeviceName], function(error, characteristics) {
        if (characteristics.length > 0) {
            myo.connected[peripheral.id].generic = {};
            myo.connected[peripheral.id].generic.setName = function (data, callback) {
                characteristics[0].write(new Buffer(data, 'utf-8'), false, function (err) {
                    if (err) {
                        callback(true, err);
                    } else {
                        callback(false, data);
                    }
                });
            };

            myo.connected[peripheral.id].generic.getName = function (callback) {
                characteristics[0].read(function (err, data) {
                    if (err) {
                        callback(true, err);
                    } else {
                        var readable = data.toString('utf-8');
                        callback(false, readable);
                    }
                });
            };
            callbackMain();
        } else {
            callbackMain(true, 'characteristic not found');
        }
    });
}

function registerBattery(Battery, peripheral, callbackMain){
    Battery.discoverCharacteristics([bluetoothStandard.BatteryLevelCharacteristic], function (error, characteristics) {
        if (characteristics.length > 0) {
            myo.connected[peripheral.id].battery = function(callback) {
                var batteryChar = characteristics[0];
                batteryChar.read(function (err, data) {
                    if (err) {
                        callback(true, err);
                    } else {
                        callback(false, data.readUInt8(0));
                    }
                });
            };

            callbackMain();
        } else {
            callbackMain(true, 'characteristic not found');
        }
    });
}

function registerControl(Control, peripheral, callbackMain){
    Control.discoverCharacteristics([services.CommandCharacteristic, services.FirmwareVersionCharacteristic, services.MyoInfoCharacteristic], function (error, characteristics) {
        if (characteristics.length == 3) {
            var myoInfo = characteristics[0];
            var firmware = characteristics[1];
            var command = characteristics[2];

            myo.connected[peripheral.id].firmware = function(callback){
                 firmware.read(function(err, data){
                    if(err){
                        callback(true, data);
                    } else {
                        var hardware;
                        switch (data.readUInt16LE(6)){
                            case 0:
                                hardware = "undefined";
                                break;
                            case 1:
                                hardware = "Myo Alpha (REV-C) hardware";
                                break;
                            case 2:
                                hardware = "Myo (REV-D) hardware.";
                                break;
                            default :
                                hardware = "undefined";
                                break;
                        }
                        callback(false, {
                            major: data.readUInt16LE(0),
                            minor: data.readUInt16LE(2),
                            patch: data.readUInt16LE(4),
                            hardware_rev: hardware
                        })
                    }
                 });
            };

            myo.connected[peripheral.id].info = function(callback){
                myoInfo.read(function(err, data){
                    if (err) {
                        callback(true, err);
                    } else {
                        var unlock_pose;
                        var unlock_pose_raw = data.readUInt16LE(6);
                        switch(unlock_pose_raw){
                            case 0:
                                unlock_pose = "rest";
                                break;
                            case 1:
                                unlock_pose = "fist";
                                break;
                            case 2:
                                unlock_pose = "wave_in";
                                break;
                            case 3:
                                unlock_pose = "wave_out";
                                break;
                            case 4:
                                unlock_pose = "fingers_spread";
                                break;
                            case 5:
                                unlock_pose = "double_tap";
                                break;
                            default :
                                unlock_pose = "unknow pose";
                                break;
                        }

                        var classifier_type;
                        if(data.readUInt8(8) == 0){
                            classifier_type = "default";
                        } else {
                            classifier_type = "personalized";
                        }
                        callback(false, {
                            serial_number:data.readUInt8(0).toString()+data.readUInt8(1).toString()+data.readUInt8(2).toString()+data.readUInt8(3).toString()+data.readUInt8(4).toString()+data.readUInt8(5).toString(),
                            unlock_pose:unlock_pose,
                            active_classifier_type:classifier_type,
                            active_classifier_index:data.readUInt8(9),
                            has_custom_classifier:data.readUInt8(10),
                            stream_indicating:data.readUInt8(11),
                            sku:data.readUInt8(12)
                        });
                    }
                });
            };

            myo.connected[peripheral.id].vibrate = function(type){
                var len = 0x00;
                if(type == "light"){
                    len = 0x01;
                } else  if(type == "medium"){
                    len = 0x02;
                } else  if(type == "strong"){
                    len = 0x03;
                }
                command.write(new Buffer([0x03, 1, len]));
            };

            myo.connected[peripheral.id].vibrate2 = function(time, strength){
                var buf = new Buffer(2);
                buf.writeUInt16LE(time, 0); // Milliseconds
                var buf2 = new Buffer(1);
                buf2.writeUInt8(strength, 0); // 0 - 255
                command.write(new Buffer([0x07, 18, buf[0], buf[1], buf2[0]]));
            };

            myo.connected[peripheral.id].notify = function(){
                command.write(new Buffer([0x0b, 1, 0x00]));
            };

            myo.connected[peripheral.id].setMode = function(emg, imu, classifier, callback){
                var data = {};

                if(emg == "none"){
                    data.emg = 0x00;
                } else if(emg == "send"){
                    data.emg = 0x02;
                } else if(emg == "raw"){
                    data.emg = 0x03;
                }else{
                    data.emg = 0x02;
                }

                if(imu == "none"){
                    data.imu = 0x00;
                } else if(imu == "data"){
                    data.imu = 0x01;
                } else if(imu == "events"){
                    data.imu = 0x02;
                } else if(imu == "all"){
                    data.imu = 0x03;
                } else if(imu == "raw"){
                    data.imu = 0x04;
                } else {
                    data.imu = 0x03;
                }

                if(classifier == "disabled"){
                    data.classifier = 0x00;
                } else if(classifier == "enabled"){
                     data.classifier = 0x01;
                } else {
                    data.classifier = 0x01;
                }

                command.write(new Buffer([0x01, 3, data.emg, data.imu, data.classifier]), true, function(err){
                    if(err) console.log(err);
                    callback();
                });
            };

            myo.connected[peripheral.id].deepSleep = function(callback){
                command.write(new Buffer([0x04, 0]), true,  function(err){
                    if(err) console.log(err);
                    callback();
                });
            };

            myo.connected[peripheral.id].sleepMode = function(type, callback) {
                var mode;
                if (type == "normal") {
                    mode = 0x00;
                } else if (type == "forever") {
                    mode = 0x01;
                } else {
                    mode = 0x00;
                }
                command.write(new Buffer([0x09, 1, mode]), true,  function(err){
                    if(err) console.log(err);
                    callback();
                });
            };

            myo.connected[peripheral.id].unlock = function(type, callback){
                var mode;
                if(type == "lock"){
                    mode = 0x00;
                } else if(type == "timed"){
                    mode = 0x01;
                } else if(type == "hold"){
                    mode = 0x02;
                } else {
                    mode = 0x02;
                }
                command.write(new Buffer([0x0a, 1, mode]), true,  function(err){
                    if(err) console.log(err);
                    callback();
                });
            };
            callbackMain();
        }
    });
}

function registerImu(Imu, peripheral, callbackMain){
    Imu.discoverCharacteristics([services.IMUDataCharacteristic], function (error, characteristics) {
        var imuChar = characteristics[0];
        var scaling = {
            'ORIENTATION_SCALE': 16384.0,
            'ACCELEROMETER_SCALE': 2048.0,
            'GYROSCOPE_SCALE': 16.0
        };

        myo.connected[peripheral.id].imu = function (status) {
            imuChar.notify(status, function (error) {
                if(error) console(error);
            });
        };

        imuChar.on('read', function (data) {
            var metrics = {
                orientation: {
                    w: data.readInt16LE(0) / scaling.ORIENTATION_SCALE,
                    x: data.readInt16LE(2) / scaling.ORIENTATION_SCALE,
                    y: data.readInt16LE(4) / scaling.ORIENTATION_SCALE,
                    z: data.readInt16LE(6) / scaling.ORIENTATION_SCALE
                },
                accelerometer: [
                    data.readInt16LE(8) / scaling.ACCELEROMETER_SCALE,
                    data.readInt16LE(10) / scaling.ACCELEROMETER_SCALE,
                    data.readInt16LE(12) / scaling.ACCELEROMETER_SCALE
                ],
                gyroscope: [
                    data.readInt16LE(14) / scaling.GYROSCOPE_SCALE,
                    data.readInt16LE(16) / scaling.GYROSCOPE_SCALE,
                    data.readInt16LE(18) / scaling.GYROSCOPE_SCALE
                ]
            };
            eventEmitter.emit('imu', {id: peripheral.id, metrics:metrics});
        });

        callbackMain();
    });
}

function registerClassifier(Classifier, peripheral, callbackMain){
    Classifier.discoverCharacteristics([services.ClassifierEventCharacteristic], function (error, characteristics) {
        var classifierChar = characteristics[0];
        myo.connected[peripheral.id].classifier = function (status) {
            classifierChar.notify(status, function (error) {
                if (error) console(error);
            });
        };

        classifierChar.on('read', function (data) {
            var info = {};
            switch (data.readInt8(0)){
                case 1:
                    info.event_type = "arm_synced";
                    switch (data.readInt8(1)){
                        case 1:
                            info.arm = "right";
                            break;
                        case 2:
                            info.arm = "left";
                            break;
                        default :
                            info.arm = "unknow";
                            break;
                    }
                    switch (data.readInt8(2)){
                        case 1:
                            info.x_direction = "wrist";
                            break;
                        case 2:
                            info.x_direction = "elbow";
                            break;
                        default :
                            info.x_direction = "unknow";
                            break;
                    }
                    break;
                case 2:
                    info.event_type = "arm_unsynced";
                    switch (data.readInt8(1)){
                        case 1:
                            info.arm = "right";
                            break;
                        case 2:
                            info.arm = "left";
                            break;
                        default :
                            info.arm = "unknow";
                            break;
                    }
                    switch (data.readInt8(2)){
                        case 1:
                            info.x_direction = "wrist";
                            break;
                        case 2:
                            info.x_direction = "elbow";
                            break;
                        default :
                            info.x_direction = "unknow";
                            break;
                    }
                    break;
                case 3:
                    info.event_type = "pose";
                    switch (data.readInt16LE(1)){
                        case 0:
                            info.pose = "rest";
                            break;
                        case 1:
                            info.pose = "fist";
                            break;
                        case 2:
                            info.pose = "wave_in";
                            break;
                        case 3:
                            info.pose = "wave_out";
                            break;
                        case 4:
                            info.pose = "fingers_spread";
                            break;
                        case 5:
                            info.pose = "double_tap";
                            break;
                        default :
                            info.pose = "unknow";
                            break;
                    }
                    break;
                case 4:
                    info.event_type = "unlocked";
                    break;
                case 5:
                    info.event_type = "locked";
                    break;
                case 6:
                    info.event_type = "sync_failed";
                    break;
            }
            eventEmitter.emit('classifier', {id: peripheral.id, info:info});
        });


        callbackMain();
    });
}

function registerEmg(Emg, peripheral, callbackMain){
    Emg.discoverCharacteristics([services.EmgData0Characteristic, services.EmgData1Characteristic, services.EmgData2Characteristic, services.EmgData3Characteristic], function (error, characteristics) {
        var EmgChar = characteristics;
        myo.connected[peripheral.id].emg = function (status) {
            for(var i = 0; i < 4; i++) {
                EmgChar[i].notify(status, function (error) {
                    if (error) console(error);
                });
            }
        };

        for(var i = 0; i < 4; i++) {
            EmgChar[i].on('read', function (data) {
                var objEMG = {
                    sample1: [
                        data.readInt8(0),
                        data.readInt8(1),
                        data.readInt8(2),
                        data.readInt8(3),
                        data.readInt8(4),
                        data.readInt8(5),
                        data.readInt8(6),
                        data.readInt8(7)
                    ],
                    sample2: [
                        data.readInt8(8),
                        data.readInt8(9),
                        data.readInt8(10),
                        data.readInt8(11),
                        data.readInt8(12),
                        data.readInt8(13),
                        data.readInt8(14),
                        data.readInt8(15)
                    ]
                };
                eventEmitter.emit('emg'+i, {id: peripheral.id, data:objEMG});
            });
        }

        callbackMain();
    });
}

noble.on('discover', function(peripheral) {
    //noble.stopScanning();
    eventEmitter.emit('discover', peripheral.id);

    peripheral.on('disconnect', function(){
        eventEmitter.emit('disconnect', peripheral.id);
        delete myo.connected[peripheral.id];
    });

    peripheral.on('connect', function () {
        eventEmitter.emit('connect', peripheral.id);
        myo.connected[peripheral.id] = {};
        myo.connected[peripheral.id].ready = false;

        peripheral.discoverServices([services.ControlService,services.ClassifierService, services.ImuDataService, services.EmgDataService, bluetoothStandard.BatteryService, bluetoothStandard.DeviceService], function(error, services) {

            var GenericAccess = services[0];
            var Battery = services[1];
            var Control = services[2];
            var Imu = services[3];
            var Classifier = services[4];
            var Emg = services[5];

            registerUtil(peripheral, function() {
                registerGeneric(GenericAccess, peripheral, function () {
                    registerBattery(Battery, peripheral, function () {
                        registerControl(Control, peripheral, function () {
                            registerImu(Imu, peripheral, function(){
                                registerClassifier(Classifier, peripheral, function() {
                                    registerEmg(Emg, peripheral, function() {
                                        eventEmitter.emit('ready', peripheral.id);
                                        myo.connected[peripheral.id].ready = true;
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });


    peripheral.connect();
});

module.exports = myo;

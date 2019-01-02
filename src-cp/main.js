// Modules to control application life and create native browser window
const {app, BrowserWindow} = require('electron')
const {ipcMain} = require('electron')
const fs = require('fs');
var request = require('request')

const elremote = require('electron-remote');
const iotaHelper = elremote.requireTaskPool(require.resolve('./iotaHelper'));

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow
let uid = makeid();

let iotaConfigRaw = fs.readFileSync('config.json');  
let iotaConfig = JSON.parse(iotaConfigRaw);  
console.log(iotaConfig);

function createWindow () {
  // Create the browser window.
  mainWindow = new BrowserWindow({width: 800, height: 480, frame: false})

  // and load the index.html of the app.
  mainWindow.loadFile('index.html')

  // Open the DevTools.
  //mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  })
  
  mainWindow.setFullScreen(true);
  
  mainWindow.webContents.on('did-finish-load', () => {
    console.log = function(...d) {
        mainWindow.webContents.send('logging', d.join(' '));
        process.stdout.write(d.join(' ') + '\n');
    };
    mainWindow.webContents.send('station-type', stationType);
    mainWindow.webContents.send('balance', funds);
    sendState();
    getBalance();
  }) 
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', function () {
    app.quit()
})

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
let IOTA = require('iota.lib.js');
//let iota = new IOTA({ provider: 'https://zettai.muride.su/' });
let iota = new IOTA({ provider: 'http://node02.iotatoken.nl:14265' });

let zmq = require('zeromq');
let sock = zmq.socket('sub');

let funds = 0;

let stationTypes = [
    { phase: 'single', voltage: 230, maxcurrent: 16 },
    { phase: 'single', voltage: 230, maxcurrent: 32 },
    { phase: 'three', voltage: 400, maxcurrent: 16 },
    { phase: 'three', voltage: 400, maxcurrent: 32 },
    { phase: 'three', voltage: 400, maxcurrent: 63 }
]

let stationType = {};
let interval = null;
let latestData = null;
let loopTimeout = null;

let chargeDuration = null;
let chargeStart = null;
let charging = false;

let latestReceivedZMQ = new Date();

let publishInterval = 30 * 1000; // 30 seconds

let smartCharge = false;

sock.on('connect', function(fd, ep) {console.log('connect, endpoint:', ep);});
sock.on('connect_delay', function(fd, ep) {console.log('connect_delay, endpoint:', ep);});
sock.on('connect_retry', function(fd, ep) {console.log('connect_retry, endpoint:', ep);});
sock.on('listen', function(fd, ep) {console.log('listen, endpoint:', ep);});
sock.on('bind_error', function(fd, ep) {console.log('bind_error, endpoint:', ep);});
sock.on('accept', function(fd, ep) {console.log('accept, endpoint:', ep);});
sock.on('accept_error', function(fd, ep) {console.log('accept_error, endpoint:', ep);});
sock.on('close', function(fd, ep) {console.log('close, endpoint:', ep);});
sock.on('close_error', function(fd, ep) {console.log('close_error, endpoint:', ep);});
sock.on('disconnect', function(fd, ep) {console.log('disconnect, endpoint:', ep);});

sock.on('monitor_error', function(err) {
    console.log('Error in monitoring: %s, will restart monitoring in 5 seconds', err);
    setTimeout(function() { sock.monitor(500, 0); }, 5000);
});

sock.connect('tcp://zettai.muride.su:55556');
sock.monitor(500, 0);
sock.subscribe('tx');
console.log('ZMQ Worker connected to port 55556');

sock.on('message', function(message) {
    data = message.toString().split(' ');
    if(data[0] == 'tx' && data[2] == 'TRAFODATATRAFODATATRAFODATATRAFODATATRAFODATATRAFODATATRAFODATATRAFODATAA99999999') {
        latestReceivedZMQ = new Date();
        let hash = data[1];
        console.log("ZMQ: Found new transaction with hash", hash);

        iotaHelper.findTransactionWithHash(hash).then(function(response) {
            objects = response;
            if(objects.length > 0) {
                try {
                    let rawData = objects[0];
                    let decoded = stripEmptyTrytes(rawData.signatureMessageFragment);
                    decoded = iota.utils.fromTrytes(decoded);
                    decoded = JSON.parse(decoded);
                    latestData = decoded;
                    latestData.hash = hash;
                    mainWindow.webContents.send('latest-data', latestData);
                }
                catch(err) {
                    console.log(err);
                }
                
            }
        });
    }
    if(data[0] == 'tx' && data[2] == iotaConfig.address) {
        console.log("New transaction to CP");
        let hash = data[1];
        console.log("ZMQ: Found new payment transaction with hash", hash);

        iotaHelper.findTransactionWithHash(hash).then(function(response) {
        objects = response;
            if(objects.length > 0) {
                let rawData = objects[0];
                //console.log(JSON.stringify(rawData));
                mainWindow.webContents.send('incoming-balance', rawData.value);
            }
        });

        getBalance();
    }
});

function getBalance() {
    console.log("Getting balance...");
    iotaHelper.getBalance().then(function(response) {
        funds = response;
        mainWindow.webContents.send('balance', funds);
    });
}

function checkSocketAlive() {
    var now = new Date();
    if((now - latestReceivedZMQ) / 1000 > 50) {
        console.log("Did not receive a ZMQ message for a long time");
        console.log("Reconnecting...");
        sock.connect('tcp://zettai.muride.su:55556');
        sock.monitor(500, 0);
        sock.subscribe('tx');
    }
}

ipcMain.on('request-mainprocess-action', (event, arg) => {
    let action = arg['action'];
    switch(action) {
        case "startCharge":
            startCharge();
            break;
        case "stopCharge":
            stopCharge();
            break;
        default:
            console.log("Unknown command");
    }
});

function stripEmptyTrytes(tryteString) {
    tryteString = tryteString.replace(/9+$/, "");
    return tryteString;
}

function makeid() {
  var text = "";
  var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (var i = 0; i < 20; i++)
    text += possible.charAt(Math.floor(Math.random() * possible.length));

  return text;
}

function setStationType() {
    let randomValue = Math.floor((Math.random() * stationTypes.length) + 0);
    stationType = stationTypes[randomValue];
    console.log("Simulated charger type:");
    console.log(stationType);
    stationType['actualcurrent'] = stationType.maxcurrent;
}

function startCharge() {
    console.log("Car connected!");
    
    chargeDuration = Math.floor((Math.random() * 30) + 2) * 60 * 1000; // Charge time between 2 and 30 minutes
    chargeStart = new Date().getTime();
    charging = true;
    
    console.log("Starting charge session for " + (chargeDuration/60/1000) + " minutes");
    setTimeout(chargeLoop, 1000);
    sendState();
}

function stopCharge() {
    charging = false;
    console.log("Charging session done!");
    console.log("Waiting for car to connect...");
    let waitTime = Math.floor((Math.random() * 2) + 1) * 60 * 1000;
    loopTimeout = setTimeout(startCharge, waitTime);
    sendState();
}

function chargeLoop() {
    if(new Date().getTime() - chargeStart <= chargeDuration && charging) {
        if(latestData && latestData.smart_charge == true) {
            console.log("Starting to smart charge as requested by trafo!");
            let percentage = latestData.smart_charge_amount;
            let newCurrent = (1 - (percentage/100)) * stationType.maxcurrent;
            stationType.actualcurrent = newCurrent.toFixed(2);
            console.log("Requested to reduce capacity by " + String(percentage.toFixed(2)) + "% to " + String(stationType.actualcurrent) + "A");
            smartCharge = true;
        }
        else if(latestData && latestData.smart_charge == false && smartCharge == true) {
            stationType.actualcurrent = stationType.maxcurrent;
            console.log("No need to smart charge anymore! Back to full capacity!");
            console.log("Current capacity is: " + String(stationType.actualcurrent) + "A");
            smartCharge = false;
        }

        console.log("Charging (" + stationType.actualcurrent + "A)...");

        setTimeout(chargeLoop, 10000);
    }
    else {
        stopCharge();
    }
    sendState();
    mainWindow.webContents.send('station-type', stationType);
}

function sendStatsToServer() {
    request({
        url: 'http://node04.iotatoken.nl:3030/cpload',
        method: "POST",
        json: {
            "id": uid,
            "load": (charging ? (stationType.actualcurrent * stationType.voltage) : 0),
            "address": iotaConfig.address,
            "charging": charging
        },
        auth: {
            'user': 'elaad_lab',
            'pass': 'appelflap1337',
            'sendImmediately': true
        }
    }, function(err, res, body) {
        //console.log(body);
    });
}

function sendStatsToTangle() {
    var jsonMessage = {
        chargestation_id: uid,
        currently_charging: charging,
        station_type: stationType,
    }
    var newMessage = iota.utils.toTrytes(JSON.stringify(jsonMessage));
    var transfers = [{
        'address': 'STATIONDATASTATIONDATASTATIONDATASTATIONDATASTATIONDATASTATIONDATASTATIONDATA9999',
        'value': 0,
        'tag': 'STATIONDATAELAAD',
        'message': newMessage,
    }];
    iotaHelper.sendTransaction(transfers).then(function(response) {
        console.log("Published my state: " + response[0].hash);
    });
}

function sendState() {
    let state = {};
    state['charging'] = charging;
    state['smart-charging'] = smartCharge;
    mainWindow.webContents.send('state', state);
}

setStationType();

let waitTime = Math.floor((Math.random() * 2) + 1) * 60 * 1000;
loopTimeout = setTimeout(startCharge, waitTime);

setInterval(getBalance, 60000);
setInterval(sendStatsToServer, 20000);
setInterval(checkSocketAlive, 30000);
//setInterval(sendStatsToTangle, 30000);

console.log("Waiting for car to connect...");

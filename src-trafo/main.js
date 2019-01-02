// Modules to control application life and create native browser window
const {app, BrowserWindow} = require('electron')
const {ipcMain} = require('electron')
var request = require('request');
var colors = require('nice-color-palettes');

const elremote = require('electron-remote');
const iotaHelper = elremote.requireTaskPool(require.resolve('./iotaHelper'));

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow

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
let iota = new IOTA({ provider: 'https://zettai.muride.su/' });

let zmq = require('zeromq');
let sock = zmq.socket('sub');


let stationType = {};
let interval = null;
let latestData = null;
let loopTimeout = null;

let chargeDuration = null;
let chargeStart = null;
let charging = false;

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

sock.connect('tcp://zettai.muride.su:55556');
sock.monitor(500, 0);
sock.subscribe('tx');
console.log('ZMQ Worker connected to port 55556');

sock.on('message', function(message) {
    data = message.toString().split(' ');
    if(data[0] == 'tx' && data[2] == 'TRAFODATATRAFODATATRAFODATATRAFODATATRAFODATATRAFODATATRAFODATATRAFODATAA99999999') {
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
});

ipcMain.on('request-mainprocess-action', (event, arg) => {
    let action = arg['action'];
    switch(action) {
        case "updateThreshold":
            setThreshold(arg['value']);
            break;
        default:
            console.log("Unknown command");
    }
});

function setThreshold(value) {
    request({
        url: 'http://node04.iotatoken.nl:3030/trafolimit',
        method: "POST",
        json: {
            "trafoLimit": value
        },
        auth: {
            'user': 'elaad_lab',
            'pass': 'appelflap1337',
            'sendImmediately': true
        }
    }, function(err, res, body) {
        console.log(body);
    });
}

function stripEmptyTrytes(tryteString) {
    tryteString = tryteString.replace(/9+$/, "");
    return tryteString;
}

console.log("Waiting for car to connect...");

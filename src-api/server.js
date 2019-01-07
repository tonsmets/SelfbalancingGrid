var express = require('express');
var bodyParser = require('body-parser');
var basicAuth = require('express-basic-auth')
var usePowSrvIO = require('iota.lib.js.powsrvio')
var IOTA = require('iota.lib.js');
var iota = new IOTA({ provider: 'https://zettai.muride.su/' });
usePowSrvIO(iota, 5000, null)

var seed = '<insert here>';
var address = 'TRAFODATATRAFODATATRAFODATATRAFODATATRAFODATATRAFODATATRAFODATATRAFODATAA99999999';
var publishInterval = 30 * 1000;
var cacheSize = 5;

var latestPaymentCheck = new Date();

var interval = null;

var trafoLimitValue = 60000;
 
var app = express();

var sentTransactions = [];

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(basicAuth({
    users: { 'us3r': 'passw0rd' }
}));

let smart_charge = false;
let smart_charge_amount = 0;

var latestReadings = {};

var latestCPLoads = {};

var supported_values = [
    {
        id: 'trafo', 
        keys: ['active_power', 'voltage_l1', 'voltage_l2', 'voltage_l3', 'current_l1', 'current_l2', 'current_l3'] 
    }];

function updateReadings(data) {
    for(var i = 0; i < data.length; i++) {
        var id = data[i].id;
        supported = supported_values.find(x => x.id == id);

        if(supported) {
            for(var k in data[i]) {
                var supp_key = supported.keys.find(x => x == k);
                if(supp_key) {
                    var value = data[i][supp_key];
                    var key = supp_key;

                    if(!isObj(latestReadings[id])) {
                        latestReadings[id] = {};
                    }
                    if(!isArray(latestReadings[id][key])) {
                        latestReadings[id][key] = [];
                    }
                    if(latestReadings[id][key].length >= cacheSize) {
                        latestReadings[id][key].shift();
                    }
                    latestReadings[id][key].push(value);
                }
            }
        }
    }
}

function checkPay() {
    console.log("Checking for payments to make");
    for(cpid in latestCPLoads) {
        let cpdata = latestCPLoads[cpid];
        let cpreadings = cpdata.readings;
        let transfers = [];
        let previous = "";
        for(let count = 0; count < cpreadings.length; count++) {
            let tmpreading = cpreadings[count];
            let tmpaddr = tmpreading.address;
            if(tmpreading.timestamp - latestPaymentCheck > 0) {
                if(previous == "") {
                    previous = tmpreading;
                    continue;
                }
                if(tmpreading.load < previous.load) {
                    transfers.push({
                        'address': tmpaddr,
                        'value': Math.floor(tmpreading.sc_amount),
                        'tag': 'TRAFOPAYMENTELAAD9999999999',
                        'message': iota.utils.toTrytes("Thanks for smart charging")
                    });
                }
                previous = tmpreading;
            }   
        }
        latestPaymentCheck = new Date();
        console.log(transfers);
        if(transfers.length > 0) {
            iota.api.sendTransfer(seed, 9, 14, transfers, function(e, bundle) {
                if (e) throw e;
                console.log(bundle);
                sentTransactions.push({bundle: bundle[0].bundle, reattach_amount: 0});
                console.log("Successfully sent your payment transfers: ", bundle);
            });
        }
    }
}

function reattachTransactions() {
    if(sentTransactions.length < 1) {
        return false;
    }
    console.log(sentTransactions);
    for(var i = 0; i < sentTransactions.length; i++ ) {
        iota.api.findTransactionObjects({'bundles':[sentTransactions[i].bundle]}, function(error, objects){
            if (error) {
                console.error(error);
            } else {
                for(var j = 0; j < objects.length; j++) {
                    var tx = objects[j];
                    console.log(tx);
                    if(tx.currentIndex === 0){
                        iota.api.isReattachable(tx.hash, function(err, isReattachable){
                            console.log(isReattachable);
                            if(isReattachable && sentTransactions[i].reattach_amount != 3){
                                iota.api.replayBundle(tx.hash, 3, 14, function(e,s){
                                    if(e){
                                        console.error(e);
                                    } else{
                                        console.log("Succesfully reattached!");
                                        sentTransactions[i].reattach_amount += 1;
                                    }
                                });
                            } else{
                                console.log("Bundle already confirmed!");
                                sentTransactions.splice(i, 1);
                            }
                        });
                    }
                }
            }
        });
    }
}

function parseCPLoad(data) {
    var id = data.id;
    var load = data.load;
    var address = data.address;
    var charging = data.charging;
    var timestamp = new Date();
    
    if (!(latestCPLoads.hasOwnProperty(id))) {
        latestCPLoads[id] = {};
        latestCPLoads[id].readings = [];
    }
    
    var readings = latestCPLoads[id].readings;
    if(readings.length >= 15) {
        readings.shift();
    }
    readings.push({
        id: id,
        load: load,
        timestamp: timestamp,
        address: address,
        charging: charging,
        sc_amount: smart_charge_amount
    });
    latestCPLoads[id].readings = readings;
    //console.log(JSON.stringify(latestCPLoads));
}

function isEmpty(obj) {
    for(var key in obj) {
        if(obj.hasOwnProperty(key))
            return false;
    }
    return true;
}

function isObj(variable) {
    return (variable !== null && typeof variable === 'object');
}

function isArray(variable) {
    return (Array.isArray(variable));
}

function getCPLoad() {
    let total = 0;
    for(keyy in latestCPLoads) {
        let current = latestCPLoads[keyy];
        let readings = current.readings;
        let latestDate = new Date(1970, 1, 1);
        let latestLoad = 0;
        for(let reading of readings) {
            let thisDate = new Date(reading.timestamp);
            if(thisDate - latestDate > 0) {
                latestDate = thisDate;
                latestLoad = reading.load;
            }
        }
        let now = new Date();
        if((now - latestDate)/1000 > 30) {
            delete latestCPLoads[keyy];
        }
        else {
            total += latestLoad;
        }
    }
    return total;
}

function clamp(num, min, max) {
  return num <= min ? min : num >= max ? max : num;
}

function publishOnInterval() {
    var result = {}
    // Calculate average
    for(id in latestReadings) {
        if(id != 'trafo') {
            break;
        }
        result['type'] = id;
        result['readings'] = [];
        result['timestamp'] = new Date().toLocaleString();
        result['smart_charge'] = false;
        result['smart_charge_amount'] = 0;
        for(key in latestReadings[id]) {
            var meanValue = 0;
            var rawValue = 0;
            var divideBy = latestReadings[id][key].length;
            for(var i = 0; i < latestReadings[id][key].length; i++) {
                rawValue += latestReadings[id][key][i];
            }
            meanValue = rawValue/divideBy;
            let currentload = meanValue;
            let virtualLoad = getCPLoad();
            if(key == 'active_power') {
                if(trafoLimitValue - meanValue < 0) {
                    result['smart_charge'] = true;
                    result['smart_charge_amount'] = 100;
                    smart_charge = true;
                    smart_charge_amount = 100;
                }
                else if(trafoLimitValue - meanValue > 0) {
                    let available = trafoLimitValue - meanValue;
                    if(virtualLoad > available) {
                        let decrease = virtualLoad - available;
                        let perc = decrease/virtualLoad * 100;
                        result['smart_charge'] = true;
                        result['smart_charge_amount'] = clamp(perc, 0, 100);
                        smart_charge = true;
                        smart_charge_amount = clamp(perc, 0, 100);
                    }
                    else {
                        result['smart_charge'] = false;
                        smart_charge = false;
                        smart_charge_amount = 0;
                    }
                }
            }
            if(key == 'active_power') {
                meanValue += virtualLoad;
            }
            result['readings'].push({ name: key, value: meanValue});
        }
        result['trafo_limit'] = trafoLimitValue;
    }
    console.log(result);

    if(!isEmpty(result)) {
        var newMessage = iota.utils.toTrytes(JSON.stringify(result));
        var newtransfer = [{
            'address': address,
            'value': 0,
            'tag': 'TRAFODATAELAAD',
            'message': newMessage,
        }];

        // Send transfer to the Tangle. Depending on the Node config of the connected Node
        // you also do the PoW at this point. The magic numbers can stay there for the Mainnet
        iota.api.sendTransfer(seed, 9, 14, newtransfer, function(e, bundle) {
            if (e) throw e;
            console.log("Successfully sent your transfer: ", bundle);
        });
    }
}

function saveValue(req, res) {
    var data = req.body;
    //console.log("Received trafo data: " + JSON.stringify(data));
    updateReadings(data);
    res.send("Thanks!");
}

function trafoLimit(req, res) {
    var data = req.body;
    console.log("Received limit data: " + JSON.stringify(data));
    trafoLimitValue = data.trafoLimit;
    res.send("Updated!");
}

function cpLoad(req, res) {
    var data = req.body;
    console.log("Received cpload data: " + JSON.stringify(data));
    parseCPLoad(data);
    getCPLoad();
    res.send("Updated!");
}

var interval = setInterval(publishOnInterval, publishInterval);
setInterval(checkPay, 60 * 10 * 1000);
setInterval(reattachTransactions, 60 * 2 * 1000);

app.post('/trafo', saveValue);
app.post('/trafolimit', trafoLimit);
app.post('/cpload', cpLoad);

reattachTransactions();

app.listen(3030);
console.log('Listening on port 3030...'); 
const fs = require('fs');
let iotaConfigRaw = fs.readFileSync('config.json');  
let iotaConfig = JSON.parse(iotaConfigRaw); 
let IOTA = require('iota.lib.js');
let iota = new IOTA({ provider: 'https://zettai.muride.su/' });

let exportfuncs = {};

exportfuncs.getBalance = function() {
	return new Promise(function(resolve, reject) {
	    iota.api.getAccountData(iotaConfig.seed, function(err, response) {
	        if(err) {
	            reject(err);
	        }
	        else {
	        	if(response.balance) {
	        		funds = response.balance;
	            	resolve(funds);
	        	}
	            else {
	            	reject("No funds");
	            }
	        }
	    });
	});
}

exportfuncs.findTransactionWithHash = function(hash) {
	return new Promise(function(resolve, reject) {
		iota.api.getTransactionsObjects([hash], function(err, objects) {
	        if(err){
	            console.log("Something went wrong... (Probably the node not responding in time)");
	            reject(err)
	        } else {
	            resolve(objects);
	        }
	    });
    });
}

module.exports = exportfuncs;
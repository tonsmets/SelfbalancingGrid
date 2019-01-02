// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.
const {ipcRenderer} = require('electron');
const Chart = require('chart.js');

let latestTrafoData = [];
let latestTrafoLimitData = [];
let trafoDataLength = 10;

let balance = 0;
let incomingBalance = 0;

let logs = [];

ipcRenderer.on('station-type', function(event, text){
  console.log(text);
  document.getElementById("station-type").innerHTML = "Phases: " + text['phase'] + "<br />" + "Max current: " + text['maxcurrent'];
});

ipcRenderer.on('balance', function(event, text){
  console.log(text);
  newbalance = parseInt(text);
  let difference = newbalance - balance;
  balance = newbalance;
  incomingBalance -= difference;
  if(incomingBalance < 0) {
  	incomingBalance = 0;
  }
  if(incomingBalance > 0) {
  	document.getElementById("funds-data").innerHTML = "Funds: " + balance + "i (+ " + incomingBalance + "i)";
  }
  else {
  	document.getElementById("funds-data").innerHTML = "Funds: " + balance + "i";
  }
  
});

ipcRenderer.on('incoming-balance', function(event, text){
  console.log(text);
  incomingBalance = parseInt(text);
  if(incomingBalance > 0) {
  	document.getElementById("funds-data").innerHTML = "Funds: " + balance + "i (+ " + incomingBalance + "i)";
  }
  else {
  	document.getElementById("funds-data").innerHTML = "Funds: " + balance + "i";
  }
});

ipcRenderer.on('latest-data', function(event, text){
	console.log(text);
	if(latestTrafoData.length >= trafoDataLength) {
		latestTrafoData.shift();
		latestTrafoLimitData.shift();
		trafoLineChart.data.labels.shift();
	}
	for(let i = 0; i < text.readings.length; i++) {
		if(text.readings[i].name == "active_power") {
			latestTrafoData.push(text.readings[i].value);
			trafoLineChart.data.labels.push(text.timestamp.split(" ")[1]);
			latestTrafoLimitData.push(text.trafo_limit);

			//Sort the data since it comes in async
			var list = [];
			for (var j = 0; j < latestTrafoData.length; j++) 
			    list.push({'data': latestTrafoData[j], 'label': trafoLineChart.data.labels[j]});

			list.sort(function(a, b) {
			    return ((a.label < b.label) ? -1 : ((a.label == b.label) ? 0 : 1));
			});

			for (var k = 0; k < list.length; k++) {
			    latestTrafoData[k] = list[k].data;
			    trafoLineChart.data.labels[k] = list[k].label;
			}
		}
	}
	trafoLineChart.update();
	console.log(latestTrafoData);
	console.log(latestTrafoLimitData);
	let htmldata = "<b>Time:</b> " + text.timestamp + "<br />";
	htmldata += "<b>Hash:</b> " + text.hash.slice(0, 18) + "...";
	document.getElementById("latest-data").innerHTML = htmldata;
});

ipcRenderer.on('state', function(event, text){
	console.log(text);
	if(text['charging'] == true) {
		document.getElementById("start_session").disabled = true;
		document.getElementById("stop_session").disabled = false;
	}
	else {
		document.getElementById("start_session").disabled = false;
		document.getElementById("stop_session").disabled = true;
	}
	let htmldata = "<b>Charging:</b> " + text["charging"] + "<br />";
	htmldata += "<b>Smart Charging:</b> " + text["smart-charging"];
	document.getElementById("state").innerHTML = htmldata;
});

ipcRenderer.on('logging', function(event, text){
	let elem = document.getElementById("logs");
	logs.push(text);
	if(logs.length >= 6) {
		logs.shift();
	}
	elem.innerHTML = logs.join('<br />');
});


let requestActionMain = function(data) {
    ipcRenderer.send('request-mainprocess-action', data);
}

let startClicked = function() {
	document.getElementById("start_session").disabled = true;
	document.getElementById("stop_session").disabled = false;
	requestActionMain({action: "startCharge"});
}

let stopClicked = function() {
	document.getElementById("stop_session").disabled = true;
	document.getElementById("start_session").disabled = false;
	requestActionMain({action: "stopCharge"});
}

let trafoChartData = {
	datasets: [{
		label: "Trafo Load (W)",
		borderColor: "#1cb841",
		backgroundColor: "#1cb841",
		data: latestTrafoData,
		fill: false
	},{
		label: "Trafo Limit (W)",
		borderColor: "#ca3c3c",
		backgroundColor: "#ca3c3c",
		data: latestTrafoLimitData,
		fill: false
	}]
};

Chart.defaults.global.defaultFontColor = '#ffffff';
Chart.defaults.global.defaultFontFamily = "'Exo 2', sans-serif";

let trafoChartOptions = {
	responsive: true,
	title: {
		display: true,
		text: 'Trafo Data',
		position: 'top',
	},
	tooltips: {
		mode: 'index',
		intersect: false,
	},
	hover: {
		mode: 'nearest',
		intersect: true
	},
	scales: {
		xAxes: [{
			display: true,
			scaleLabel: {
				display: true,
				labelString: 'Time'
			},
			gridLines: {
			  display: false ,
			  color: "#888888"
			}
		}],
		yAxes: [{
			display: true,
			scaleLabel: {
				display: true,
				labelString: 'Watt'
			},
			gridLines: {
			  display: true ,
			  color: "#888888"
			}
		}]
	}
};

let trafoCtx = document.getElementById("trafoChart");
let trafoLineChart = new Chart(trafoCtx, {
    type: 'line',
    data: trafoChartData,
    options: trafoChartOptions
});

trafoCtx.style.backgroundColor = '#000000';

document.querySelector('#start_session').addEventListener('click', startClicked);
document.querySelector('#stop_session').addEventListener('click', stopClicked);
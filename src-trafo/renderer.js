// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.
const {ipcRenderer} = require('electron');
const Chart = require('chart.js');
var colors = require('nice-color-palettes');

let latestTrafoData = [];
let latestTrafoLimitData = [];
let trafoDataLength = 10;

let latestVoltageL1 = [];
let latestVoltageL2 = [];
let latestVoltageL3 = [];
let latestCurrentL1 = [];
let latestCurrentL2 = [];
let latestCurrentL3 = [];

let sliderValue = 0;

let logs = [];

ipcRenderer.on('station-type', function(event, text){
  console.log(text);
  document.getElementById("station-type").innerHTML = "Phases: " + text['phase'] + "<br />" + "Max current: " + text['maxcurrent'];
});

ipcRenderer.on('latest-data', function(event, text){
	console.log(text);
	if(latestTrafoData.length >= trafoDataLength) {
		latestTrafoData.shift();
		latestTrafoLimitData.shift();
		trafoLineChart.data.labels.shift();
		trafoDetailLineChart.data.labels.shift();

		latestVoltageL1.shift();
		latestVoltageL2.shift();
		latestVoltageL3.shift();
		latestCurrentL1.shift();
		latestCurrentL2.shift();
		latestCurrentL3.shift();
	}
	
	for(let i = 0; i < text.readings.length; i++) {
		if(text.readings[i].name == "active_power") {
			latestTrafoData.push(text.readings[i].value);
			trafoLineChart.data.labels.push(text.timestamp.split(" ")[1]);

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
		if(text.readings[i].name == "voltage_l1") {
			latestVoltageL1.push(text.readings[i].value);
		}
		if(text.readings[i].name == "voltage_l2") {
			latestVoltageL2.push(text.readings[i].value);
		}
		if(text.readings[i].name == "voltage_l3") {
			latestVoltageL3.push(text.readings[i].value);
		}
		if(text.readings[i].name == "current_l1") {
			latestCurrentL1.push(text.readings[i].value);
		}
		if(text.readings[i].name == "current_l2") {
			latestCurrentL2.push(text.readings[i].value);
		}
		if(text.readings[i].name == "current_l3") {
			latestCurrentL3.push(text.readings[i].value);
		}
	}
	
	//trafoLineChart.data.labels.push(text.timestamp.split(" ")[1]);
	trafoDetailLineChart.data.labels.push(text.timestamp.split(" ")[1]);
	latestTrafoLimitData.push(text.trafo_limit);
	
	trafoLineChart.update();
	trafoDetailLineChart.update();
	
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
	if(logs.length >= 4) {
		logs.shift();
	}
	elem.innerHTML = logs.join('<br />');
});


let requestActionMain = function(data) {
    ipcRenderer.send('request-mainprocess-action', data);
}

let trafoChartData = {
	datasets: [{
		label: "Trafo Load (W)",
		backgroundColor: "#1cb841",
		borderColor: "#1cb841",
		data: latestTrafoData,
		fill: false
	},{
		label: "Trafo Limit (W)",
		backgroundColor: "#ca3c3c",
		borderColor: "#ca3c3c",
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

let trafoDetailChartData = {
	datasets: [{
		label: "Voltage L1",
		data: latestVoltageL1,
		backgroundColor: colors[0][1],
		borderColor: colors[0][1],
		fill: false,
		yAxisID: "id1"
	},{
		label: "Voltage L2",
		data: latestVoltageL2,
		backgroundColor: colors[1][1],
		borderColor: colors[1][1],
		fill: false,
		yAxisID: "id1"
	},{
		label: "Voltage L3",
		data: latestVoltageL3,
		backgroundColor: colors[2][1],
		borderColor: colors[2][1],
		fill: false,
		yAxisID: "id1"
	},{
		label: "Current L1",
		data: latestCurrentL1,
		backgroundColor: colors[3][1],
		borderColor: colors[3][1],
		fill: false,
		yAxisID: "id2"
	},{
		label: "Current L2",
		data: latestCurrentL2,
		backgroundColor: colors[4][1],
		borderColor: colors[4][1],
		fill: false,
		yAxisID: "id2"
	},{
		label: "Current L3",
		data: latestCurrentL3,
		backgroundColor: colors[5][1],
		borderColor: colors[5][1],
		fill: false,
		yAxisID: "id2"
	}]
};

let trafoDetailChartOptions = {
	responsive: true,
	title: {
		display: true,
		text: 'Trafo Detailed Data',
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
			position: 'left',
			scaleLabel: {
				display: true,
				labelString: 'Voltage'
			},
			gridLines: {
			  display: true ,
			  color: "#888888"
			},
			id: "id1"
		},{
			display: true,
			position: 'right',
			scaleLabel: {
				display: true,
				labelString: 'Current'
			},
			gridLines: {
			  display: false ,
			  color: "#888888"
			},
			id: "id2"
		}]
	}
};

let trafoDetailCtx = document.getElementById("trafoDetailChart");
let trafoDetailLineChart = new Chart(trafoDetailCtx, {
    type: 'line',
    data: trafoDetailChartData,
    options: trafoDetailChartOptions
});

trafoDetailCtx.style.backgroundColor = '#000000';

var slideCol = document.getElementById("threshold_slider");
var valuespan = document.getElementById("trafo_threshold");
valuespan.innerHTML = slideCol.value;
sliderValue = slideCol.value;

slideCol.oninput = function() {
    valuespan.innerHTML = this.value;
    sliderValue = this.value;
}

let updateClicked = function() {
	requestActionMain({action: "updateThreshold", value: sliderValue});
}

document.querySelector('#update_value').addEventListener('click', updateClicked);

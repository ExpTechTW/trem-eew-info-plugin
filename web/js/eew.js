const { ipcRenderer } = require("electron");
const echarts = require("../resource/js/echarts");
const region_v2 = require("../resource/region_v2.json");

const eew_get_time = document.getElementById("eew_get_time");
const eew_time = document.getElementById("eew_time");
eew_time.textContent = "暫無生效中的 緊急地震速報 時間";
const local_time = document.getElementById("local_time");
const core_eew_taipei = document.getElementById("core_eew_taipei");
const core_eew_estimate_taipei = document.getElementById("core_eew_estimate_taipei");
core_eew_estimate_taipei.className = "intensity-null";
core_eew_estimate_taipei.textContent = "暫無生效中的 緊急地震速報";
const core_alert_area = document.getElementById("alert-area");
core_alert_area.innerHTML = "";
const cancel = document.getElementById("cancel");

const intensity_list = ["0", "1", "2", "3", "4", "5⁻", "5⁺", "6⁻", "6⁺", "7"];

const constant = {
    BEEP   : new Audio("./audio/beep.wav"),
    WARN   : new Audio("./audio/warn.wav"),
    UPDATE : new Audio("./audio/update.wav"),
    AREA   : new Audio("./audio/area.wav"),

    1      : new Audio("./audio/1.wav"),
    2      : new Audio("./audio/2.wav"),
    3      : new Audio("./audio/3.wav"),
    4      : new Audio("./audio/4.wav"),
    "5⁻"   : new Audio("./audio/5⁻.wav"),
    "5⁺"   : new Audio("./audio/5⁺.wav"),
    "6⁻"   : new Audio("./audio/6⁻.wav"),
    "6⁺"   : new Audio("./audio/6⁺.wav"),
    7      : new Audio("./audio/7.wav"),
    CANCEL : new Audio("./audio/cancel.wav"),
    NOTICE : new Audio("./audio/notice.wav"),

    RTS       : new Audio("./audio/rts.wav"),
    EEW       : new Audio("./audio/eew.wav"),
    EQ        : new Audio("./audio/eq.wav"),
    TSUNAMI   : new Audio("./audio/tsunami.wav"),
};

const charts = [
	echarts.init(document.getElementById("wave-1"), null, { height: 100, width: 600, renderer: "svg" })
];

charts_init();

function charts_init() {
  for (let i = 0, j = charts.length; i < j; i++) {
    charts[i].setOption({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' }
      },
      xAxis: {
        type      : "value",
        splitLine : {
          show: false,
        },
        show: false,
      },
      yAxis: {
        type      : "value",
        animation : false,
        splitLine : {
          show: false,
        },
        axisLabel: {
          interval : 1,
          fontSize : 10,
        },
        axisLine: {
          show: false,
        },
        axisTick: {
          customValues: [0],
          // show: false,
        },
      },
      grid: {
        top    : 16,
        right  : 0,
        bottom : 0,
      }
    });
  }
}

let chartdata = [
	[],
	[],
	[]
];

let work_station = {};
let station_temp = {};
let off_station = {};
let play_mode_name = "HTTP";
let play_mode_num = 0;
let eew_timer = null;
let alert_area = {};
let audio_intensity = "";
let audio_beep = 0;
let audio_warn = 0;
let eew_id = 0;
let eew_max = 0;
let eew_rts = 0;
let eew_alert = 0;
let area_alert_text = "";

ipcRenderer.on("play_mode", (event, ans) => {
  if (ans == 0) {
    play_mode_name = "HTTP";
    if (play_mode_num != 0) eew_timer_fun(true);
  } else if (ans == 1) {
    play_mode_name = "websocket";
    if (play_mode_num != 1) eew_timer_fun(true);
  } else if (ans == 2) {
    play_mode_name = "HTTP (重播)";
    if (play_mode_num != 2) eew_timer_fun(true);
  }
  play_mode_num = ans;
});

let time_now = 0;

ipcRenderer.on("now", (event, ans) => {
  time_now = ans;
});

let rts_max = {};

ipcRenderer.on("DataRts", (event, ans) => {
    const data = ans.data;

    if (data)
        if (data.box) {
            if (Object.keys(data.box).length)
                for (const id of Object.keys(data.station)) {
                    if (!rts_max[id] || rts_max[id] < data.station[id].I) rts_max[id] = data.station[id].I;
                }
            else rts_max = {};
        }
});

function distance(latA, lngA) {
    return function(latB, lngB) {
      latA = latA * Math.PI / 180;
      lngA = lngA * Math.PI / 180;
      latB = latB * Math.PI / 180;
      lngB = lngB * Math.PI / 180;
      const sin_latA = Math.sin(Math.atan(Math.tan(latA)));
      const sin_latB = Math.sin(Math.atan(Math.tan(latB)));
      const cos_latA = Math.cos(Math.atan(Math.tan(latA)));
      const cos_latB = Math.cos(Math.atan(Math.tan(latB)));
      return Math.acos(sin_latA * sin_latB + cos_latA * cos_latB * Math.cos(lngA - lngB)) * 6371.008;
    };
}

function pow(num) {
    return Math.pow(num, 2);
}

function pga_to_float(pga) {
    return 2 * Math.log10(pga) + 0.7;
}

function eew_area_pgv(epicenterLocaltion, pointLocaltion, depth, magW) {
    const long = 10 ** (0.5 * magW - 1.85) / 2;
    const epicenterDistance = distance(epicenterLocaltion[0], epicenterLocaltion[1])(pointLocaltion[0], pointLocaltion[1]);
    const hypocenterDistance = (depth ** 2 + epicenterDistance ** 2) ** 0.5 - long;
    const x = Math.max(hypocenterDistance, 3);
    const gpv600 = 10 ** (0.58 * magW + 0.0038 * depth - 1.29 - Math.log10(x + 0.0028 * (10 ** (0.5 * magW))) - 0.002 * x);
    const pgv400 = gpv600 * 1.31;
    const pgv = pgv400 * 1.0;
    return 2.68 + 1.72 * Math.log10(pgv);
}

function eew_area_pga(lat, lon, depth, mag) {
    const json = {};
    let eew_max_i = 0;
    for (const city of Object.keys(region_v2))
      for (const town of Object.keys(region_v2[city])) {
        const info = region_v2[city][town];
        const dist_surface = distance(lat, lon)(info.lat, info.lon);
        const dist = Math.sqrt(pow(dist_surface) + pow(depth));
        const pga = 1.657 * Math.pow(Math.E, (1.533 * mag)) * Math.pow(dist, -1.607);
        let i = pga_to_float(pga);
        if (i >= 4.5) i = eew_area_pgv([lat, lon], [info.lat, info.lon], depth, mag);
        if (i > eew_max_i) eew_max_i = i;
        json[`${city} ${town}`] = { dist, i };
      }
    json.max_i = eew_max_i;
    return json;
}

function eew_timer_fun(stop = false) {
    let time = 60_000;
    if (stop) time = 1_000;
    if (eew_timer) clearTimeout(eew_timer);
    eew_timer = null;
    eew_timer = setTimeout(() => {
        core_eew_estimate_taipei.className = "intensity-null";
        core_eew_estimate_taipei.textContent = "暫無生效中的 緊急地震速報";
        eew_time.textContent = "暫無生效中的 緊急地震速報 時間";
        core_eew_taipei.innerHTML = "";
        core_alert_area.innerHTML = "";
        cancel.style.display = "none";
        charts[0].clear();
        charts_init();
        eew_timer = null;
        chartdata = [
            [],
            [],
            []
        ];
        alert_area = {};
        audio_intensity = "";
        audio_beep = 0;
        audio_warn = 0;
        eew_id = 0;
        eew_max = 0;
        eew_rts = 0;
        eew_alert = 0;
        area_alert_text = "";
    }, time);
}

ipcRenderer.on("showEew", (event, ans) => {
    const data = ans.data;

    if (data.author != "trem") return;

    if (eew_timer) clearTimeout(eew_timer);

    if (data.time) {
      eew_get_time.textContent = formatTime(data.time);
    } else {
      eew_get_time.textContent = formatTime(time_now);
    }

    if (data.eq) {
      eew_time.textContent = formatTime(data.eq.time);
    }

    if (data.id != eew_id) {
        eew_id = data.id;
        eew_max = 0;
        eew_alert = 0;
        alert_area = {};
        if (!audio_beep) {
          audio_beep = 1;
          constant.BEEP.play();
          constant.EQ.play();
          constant.BEEP.onended = () => {
            audio_beep = 0;
          };
        }
        core_eew_taipei.innerHTML = "";
        eew_rts = 0;
        cancel.style.display = "none";
    } else constant.UPDATE.play();

    if (data.eq.max && data.eq.max != eew_max) {
        eew_max = data.eq.max;
        audio_intensity = intensity_list[data.eq.max];
    }

    if (data.rts && !eew_rts) {
        eew_rts = 1;
        if (!audio_warn) {
            audio_warn = 1;
          constant.WARN.play();
          constant.RTS.play();
          constant.WARN.onended = () => {
            audio_warn = 0;
          };
        }
    }

    if (data.eq.max > 4 && !eew_alert) {
        eew_alert = 1;
        constant.EEW.play();
    }

    if (data.status == 3) {
        constant.CANCEL.play();
        cancel.style.display = "flex";
    }

    if (data.final) {
        if (data.status == 1) setTimeout(() => {
          constant.NOTICE.play();
          constant.NOTICE.onended = () => {
            if ((data.eq.mag >= 6 && data.eq.loc.includes("海")) || data.eq.mag >= 7) constant.TSUNAMI.play();
          };
        }, 5000);
    }

    const li = document.createElement("li");
    li.innerHTML = `<span style='color: ${(data.status == 3) ? "grey" : (data.final) ? "#ddbce0" : (data.status == 1) ? "#ffb4ab" : (data.rts) ? "#f19743" : "yellowgreen"};'>${data.serial}報 ${data.eq.loc} M${data.eq.mag.toFixed(1)} ${data.eq.depth}km ${data.eq.lat.toFixed(2)}/${data.eq.lon.toFixed(2)} ${(!data.eq.max) ? "不明" : intensity_list[data.eq.max]}</span>`;
    core_eew_taipei.appendChild(li);
    core_eew_taipei.scrollTop = core_eew_taipei.scrollHeight;

    core_eew_estimate_taipei.textContent = "";
    core_eew_estimate_taipei.className = `intensity-box intensity-${data.eq.max}`;

    const eew_intensity_list = eew_area_pga(data.eq.lat, data.eq.lon, data.eq.depth, data.eq.mag);

    const alert_city = [];
    for (const name of Object.keys(eew_intensity_list)) {
        if (name == "max_i") continue;
        if (eew_intensity_list[name].i <= 3.5) continue;
        const city = name.split(" ")[0].replace("市", "").replace("縣", "");
        if (!alert_city.includes(city)) alert_city.push(city);
    }

    for (const city of alert_city)
        if (!alert_area[city]) alert_area[city] = time_now;

    for (const city of Object.keys(alert_area))
        if (!alert_city.includes(city)) delete alert_area[city];

    const chart_intensity_list = [];

    for (const id of Object.keys(work_station)) {
        const info = work_station[id];
        const dist_surface = distance(data.eq.lat, data.eq.lon)(info.Lat, info.Long);
        const d = Math.sqrt(pow(dist_surface) + pow(data.eq.depth));
        const pga = 1.657 * Math.pow(Math.E, (1.533 * data.eq.mag)) * Math.pow(d, -1.607);
        let i = pga_to_float(pga);
        if (i >= 4.5) i = eew_area_pgv([data.eq.lat, data.eq.lon], [info.Lat, info.Long], data.eq.depth, data.eq.mag);
        chart_intensity_list.push({ id, i, d });
    }

    chart_intensity_list.sort((a, b) => a.d - b.d);

    chartdata = [
        [],
        [],
        []
    ];

    let count = 0;
    for (const obj of chart_intensity_list) {
        if (obj.i <= 0) break;
        chartdata[0].push(Math.floor(obj.d));
        chartdata[1].push(obj.i.toFixed(1));
        const int = rts_max[obj.id];
        chartdata[2].push((!int || int < 0) ? 0 : int);
        count++;
        if (count >= 45) break;
    }

    charts[0].setOption({
        animation: false,
        xAxis: {
          data: chartdata[0],
          inverse: true,
        },
        series: [
            {
                name: '預估',
                type: "line",
                showSymbol: false,
                data: chartdata[1],
                label: {
                    backgroundColor: "green",
                    borderColor: "black",
                },
                lineStyle: {
                    normal: {
                        color: 'black',
                        width: 4,
                        type: 'dashed'
                    }
                }
            },
            {
                name: '實際',
                type: "bar",
                showSymbol: false,
                data: chartdata[2],
                label: {
                    backgroundColor: "#c4c6d0",
                    borderColor: "white",
                }
            },
        ],
    });
});

ipcRenderer.on("EewEnd", (event, ans) => {
    const data = ans.data;
    if (data.author != "trem") return;
    eew_timer_fun();
});

async function get_station_info() {
    const stationCache = localStorage.getItem('cache.station');
    station_temp = stationCache ? JSON.parse(stationCache) : {};
    const station_num = Object.keys(station_temp).length;

    if (station_num != 0) {
        const new_station = {};
        for (let k = 0, k_ks = Object.keys(station_temp), n = k_ks.length; k < n; k++) {
        const station_id = k_ks[k];
        const station_ = station_temp[station_id];

        //	if (!station_.work) continue;

        const station_net = station_.net === "MS-Net" ? "H" : "L";
        const work = station_.work;

        if (!work) {
            delete off_station[station_id];
            continue;
        }

        let id = "";
        let station_code = "000";
        let Loc = "";
        let area = "";
        let Lat = 0;
        let Long = 0;

        let latest = station_.info[0];

        if (station_.info.length > 1)
            for (let i = 1; i < station_.info.length; i++) {
            const currentTime = new Date(station_.info[i].time);
            const latestTime = new Date(latest.time);

            if (currentTime > latestTime)
                latest = station_.info[i];
            }

        for (let i = 0, ks = Object.keys(region_v2), j = ks.length; i < j; i++) {
            const reg_id = ks[i];
            const reg = region_v2[reg_id];

            for (let r = 0, r_ks = Object.keys(reg), l = r_ks.length; r < l; r++) {
            const ion_id = r_ks[r];
            const ion = reg[ion_id];

            if (ion.code === latest.code) {
                station_code = latest.code.toString();
                Loc = `${reg_id} ${ion_id}`;
                area = ion.area;
                Lat = latest.lat;
                Long = latest.lon;
            }
            }
        }

        id = `${station_net}-${station_code}-${station_id}`;

        if (station_code === "000") {
            Lat = latest.lat;
            Long = latest.lon;

            if (station_id === "13379360") {
            Loc = "重庆市 北碚区";
            area = "重庆市中部";
            } else if (station_id === "7735548") {
            Loc = "南楊州市 和道邑";
            area = "南楊州市中部";
            }
        }

        if (work) {
            new_station[station_id] = { id, Lat, Long, Loc, area, work };
        }
        }

        work_station = Object.assign({}, new_station);
        off_station = Object.assign({}, new_station);
    }
}

get_station_info();

setInterval(get_station_info, 600000);

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

setInterval(() => {
    local_time.textContent = formatTime(time_now);
}, 500);

function formatTimeDifference(milliseconds) {
    if (milliseconds < 1000) {
        return `${milliseconds} 毫秒`;
    }
    const totalSeconds = Math.floor(milliseconds / 1000);
    const seconds = totalSeconds % 60;
    if (milliseconds < 60000) {
        return `${seconds} 秒`;
    }
    const minutes = Math.floor(totalSeconds / 60);
    if (milliseconds < 3600000) {
        return `${minutes} 分 ${seconds} 秒`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (milliseconds < 86400000) {
        return `${hours} 小時 ${remainingMinutes} 分 ${seconds} 秒`;
    }
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days} 天 ${remainingHours} 小時 ${remainingMinutes} 分 ${seconds} 秒`;
}

setInterval(() => {
    const now = time_now;
    const flashElements = document.getElementsByClassName("flash");
    for (const item of flashElements) item.style.visibility = "visible";
    setTimeout(() => {
      for (const item of flashElements) item.style.visibility = "hidden";
    }, 500);

    let city_text = "";
    let city_count = 0;
    let city_flash = 0;
    for (const city of Object.keys(alert_area)) {
      if (now - alert_area[city] < 15000) city_flash++;
      city_text += `${(now - alert_area[city] < 15000) ? `<a class='alert-flash'>${city}</a>` : city}${(city_count % 4) == 3 ? "<br>" : "&emsp;"}`;
      city_count++;
      if (city_count >= 12) break;
    }
    if (city_flash && city_text != area_alert_text) {
      area_alert_text = city_text;
      constant.AREA.play();
    }
    core_alert_area.innerHTML = city_text;
    const alertFlashElements = document.getElementsByClassName("alert-flash");
    for (const item of alertFlashElements) item.style.color = "red";
    setTimeout(() => {
      for (const item of alertFlashElements) item.style.color = "#c4c6d0";
    }, 500);
}, 1000);

setInterval(() => {
    if (audio_intensity != "" && !audio_beep && !audio_warn) {
      constant[audio_intensity].play();
      audio_intensity = "";
    }
}, 2500);
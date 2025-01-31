const config = require("../config/config");
const path = require("path");
const { ipcRenderer } = require("electron");

class Plugin {
  static instance = null;

  #ctx;
  #config;

  constructor(ctx) {
    if (Plugin.instance) return Plugin.instance;

    this.#ctx = ctx;
    this.name = "eew-info";
    this.#config = null;
    this.config = {};
    this.logger = null;

    Plugin.instance = this;
  }

  static getInstance() {
    if (!Plugin.instance) throw new Error("Plugin not initialized");

    return Plugin.instance;
  }

  onLoad() {
    const { TREM, Logger, info, utils } = this.#ctx;

    const { CustomLogger } =
      require("../logger/logger").createCustomLogger(Logger);
    this.logger = new CustomLogger("eew-info");

    const defaultDir = path.join(
      info.pluginDir,
      "./eew-info/resource/default.yml"
    );
    const configDir = path.join(info.pluginDir, "./eew-info/config.yml");

    this.#config = new config(this.name, this.logger, utils.fs, defaultDir, configDir);

    this.config = this.#config.getConfig(this.name);

    const event = (event, callback) => TREM.variable.events.on(event, callback);

    event("DataRts", (ans) => {
      ipcRenderer.send("send-to-plugin-window", {
        windowId: this.name,
        channel: "DataRts",
        payload: ans,
      });
    });

    event("EewRelease", (ans) => {
      ipcRenderer.send("send-to-plugin-window", {
        windowId: this.name,
        channel: "showEew",
        payload: ans,
      });
    });

    event("EewUpdate", (ans) => {
      ipcRenderer.send("send-to-plugin-window", {
        windowId: this.name,
        channel: "showEew",
        payload: ans,
      });
    });

    event("EewEnd", (ans) => {
      ipcRenderer.send("send-to-plugin-window", {
        windowId: this.name,
        channel: "EewEnd",
        payload: ans,
      });
    });

    setInterval(async () => {
      ipcRenderer.send("send-to-plugin-window", {
        windowId: this.name,
        channel: "play_mode",
        payload: TREM.variable.play_mode,
      });
    }, 1_000);

    this.init();
    this.addClickEvent(info);
  }

  init() {
    const focusButton = document.querySelector("#focus");
    if (focusButton) {
      const button = document.createElement("div");
      button.id = "eew-info";
      button.className = "nav-bar-location";
      button.title = "EEW 監控面板";
      button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="#e8eaed"><path d="M228.21-192q-15.21 0-25.71-10.35T192-228v-48q0-15.3 10.29-25.65Q212.58-312 227.79-312t25.71 10.35Q264-291.3 264-276v48q0 15.3-10.29 25.65Q243.42-192 228.21-192Zm126 0q-15.21 0-25.71-10.35T318-228v-192.15q0-14.85 10.29-25.35 10.29-10.5 25.5-10.5t25.71 10.35Q390-435.3 390-420v192.15q0 14.85-10.29 25.35-10.29 10.5-25.5 10.5Zm126 0q-15.21 0-25.71-10.35T444-228v-96q0-15.3 10.29-25.65Q464.58-360 479.79-360t25.71 10.35Q516-339.3 516-324v96q0 15.3-10.29 25.65Q495.42-192 480.21-192Zm126 0q-15.21 0-25.71-10.35T570-228v-168q0-15.3 10.29-25.65Q590.58-432 605.79-432t25.71 10.35Q642-411.3 642-396v168q0 15.3-10.29 25.65Q621.42-192 606.21-192Zm126 0q-15.21 0-25.71-10.35T696-228v-264q0-15.3 10.29-25.65Q716.58-528 731.79-528t25.71 10.35Q768-507.3 768-492v264q0 15.3-10.29 25.65Q747.42-192 732.21-192ZM527.94-456Q514-456 501-461q-13-5-24-16l-93-93-130 130q-11 11-26 11t-26.48-11Q191-451 191.5-465.5T203-491l130-130q10.68-10.96 23.6-15.98 12.91-5.02 27.15-5.02 14.25 0 27.25 5t24 16l93 93 178-178q11-11 26-11t26.48 11q10.52 11 10.02 25.5T757-655L579-477q-11 11-24.06 16-13.07 5-27 5Z"/></svg>`;
      focusButton.insertAdjacentElement("afterend", button);
    }
  }

  addClickEvent(info) {
    const button = document.querySelector("#eew-info");
    button.addEventListener("click", () => {
      ipcRenderer.send("open-plugin-window", {
        pluginId: this.name,
        htmlPath: `${info.pluginDir}/eew-info/web/index.html`,
        options: {
          minWidth: 690,
          minHeight: 1000,
          width: 690,
          height: 1000,
          title: "EEW 監控面板",
        },
      });
    });
  }
}

module.exports = Plugin;

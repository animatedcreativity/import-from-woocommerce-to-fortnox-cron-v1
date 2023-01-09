var appConfig = {"mainFile":"main.js","minimal":"v1"};

var app = {
  start: async function() {
    var options = app.parseArgv(["conf-airtable-base-name", "conf-airtable-table-name", "conf-airtable-view-name", "conf-airtable-api-key", "conf-airtable-table-key", "conf-airtable-key-name", "conf-airtable-key-value", "type", "fn-api-url", "fn-access-token", "fn-client-secret", "console-key", "console-prefix"]);
    if (app.has(options) && app.has(options.type) && app.has(app.cron[options.type])) {
      await app.cron[options.type].start(options);
    } else {
      console.log(app.consoleColors.bgRed, "Invalid options:", options);
    }
  }
};app.startUps = [];
app.workerStartUps= [];
app.callbacks = {static: []};app["api"] = {"airtable": (function() {
  var mod = {
    getRecords: async function(options, page, offset) {
      var fetchAll = !app.has(page) || page > 1;
      if (!app.has(page)) page = 1;
      var url = "https://api.airtable.com/v0/" + options.airtableBaseName + "/" + options.airtableTableName + "?view=" + options.airtableViewName + "&pageSize=100" + (app.has(offset) ? "&offset=" + offset : "");
      console.log(app.consoleColors.bgBlue, "Fetching airtable page:", page + " " + url.split(" ").join("+"));
      var result = await fetch(url, {
        headers: {
          "Authorization": "Bearer " + options.airtableApiKey
        }
      });
      if (result.status === 200) {
        var records = await result.json();
        var list = {};
        for (var i=0; i<=records.records.length-1; i++) {
          var record = records.records[i];
          if (app.has(record.fields) && app.has(record.fields[options.airtableTableKey]) && record.fields[options.airtableKeyName] === options.airtableKeyValue) {
            list[record.fields[options.airtableTableKey]] = record;
          }
        }
        if (!(!app.has(records.offset) || fetchAll !== true)) {
          var moreRecords = await mod.getRecords(options, page + 1, records.offset);
          for (var key in moreRecords) list[key] = moreRecords[key];
        }
        return list;
      }
    }
  };
  return mod;
})(), };app["build"] = {};app["cron"] = {"order": (function() {
  var exec = require("child_process").exec;
  var mod = {
    start: async function(options) {
      var confOptions = app.utils.airtable.getOptions(options, "conf");
      if (
        app.has(confOptions.airtableBaseName)
        && app.has(confOptions.airtableTableName)
        && app.has(confOptions.airtableViewName)
        && app.has(confOptions.airtableApiKey)
        && app.has(confOptions.airtableTableKey)
        && app.has(confOptions.airtableKeyName)
        && app.has(confOptions.airtableKeyValue)
        && app.has(options.fnApiUrl)
        && app.has(options.fnClientSecret)
        && app.has(options.fnAccessToken)
      ) {
        var confRecords = await app.api.airtable.getRecords(confOptions);
        for (var confKey in confRecords) {
          var confRecord = confRecords[confKey];
          console.log(app.consoleColors.bgMagenta, confRecord.fields[confOptions.airtableTableKey]);
          if (
            app.has(confRecord.fields["wc-api-url"])
            && app.has(confRecord.fields["wc-consumer-key"])
            && app.has(confRecord.fields["wc-consumer-secret"])
          ) {
            var domain = app.utils.url.domain(confRecord.fields["wc-api-url"]);
            var command = "node import-from-woocommerce-to-fortnox-v1.js wc-api-url=" + confRecord.fields["wc-api-url"] + " wc-consumer-key=" + confRecord.fields["wc-consumer-key"] + " wc-consumer-secret=" + confRecord.fields["wc-consumer-secret"] + " type=" + options.type + " fn-api-url=" + options.fnApiUrl + " fn-access-token=" + options.fnAccessToken + " fn-client-secret=" + options.fnClientSecret + (app.has(options.consoleKey) ? " console-key=\"" + options.consoleKey + "\"" : "") + (app.has(options.consolePrefix) ? " console-prefix=\"" + options.consolePrefix + ": " + domain + "\"" : domain);
            app.workers.task(async function() {
              console.log(app.consoleColors.bgMagenta, command);
              await new Promise(function(resolve, reject) {
                exec(command, function(error, stdout, stderr) {
                  console.log(stdout, stderr);
                  resolve(true);
                });
              });
            }, "update");
            //doing one by one only for now
            await app.workers.do("update");
          }
        }
      } else {
        console.log(app.consoleColors.bgRed, "Invalid/Missing options:", options);
      }
    }
  };
  return mod;
})(), };app["enhance"] = {"argv": (function() {
  var mod = {
    start: function() {
      app.parseArgv = function(list) {
        var options = {};
        for (var i=2; i<=process.argv.length-1; i++) {
          var option = process.argv[i];
          var name = option.split("=").shift().trim();
          var cName = app.camelCase(name).split("-").join("");
          var value = option.split("=").pop().trim();
          if (list.indexOf(name) >= 0) {
            options[cName] = value;
          } else {
            console.log(app.consoleColors.bgRed, "Invalid option: " + name);
            return;
          }
        }
        app.cliOptions = options;
        return options;
      };
    }
  };
  mod.start();
  return mod;
})(), "console": (function() {
  var mod = {
    logged: false,
    start: function() {
      app.console = function() {
        if (app.has(app.cliOptions) && app.has(app.cliOptions.consoleKey)) {
          if (!app.has(mod.consoleRe)) {
            mod.consoleRe = require('console-remote-client').connect({server: "https://console.ylo.one:8088", channel: app.cliOptions.consoleKey});
          }
          var args = Array.prototype.slice.call(arguments);
          if (app.has(app.cliOptions.consolePrefix)) {
            args.unshift("[lime]" + app.cliOptions.consolePrefix + "[/lime]");
          }
          console.re.log.apply(null, args);
          mod.logged = true;
        }
      };
      app.exit = async function(time) {
        if (mod.logged === true) {
          console.log("Waiting for remote console...");
          if (!app.has(time)) time = 5; // 5 seconds
          await new Promise(function(resolve, reject) {
            setTimeout(function() { resolve(true); }, time * 1000);
          });
        }
        process.exit();
      };
      app.consoleColors = {
        reset: "\x1b[0m%s\x1b[0m",
        bright: "\x1b[1m%s\x1b[0m",
        dim: "\x1b[2m%s\x1b[0m",
        underscore: "\x1b[4m%s\x1b[0m",
        blink: "\x1b[5m%s\x1b[0m",
        reverse: "\x1b[7m%s\x1b[0m",
        hidden: "\x1b[8m%s\x1b[0m",
        fgBlack: "\x1b[30m%s\x1b[0m",
        fgRed: "\x1b[31m%s\x1b[0m",
        fgGreen: "\x1b[32m%s\x1b[0m",
        fgYellow: "\x1b[33m%s\x1b[0m",
        fgBlue: "\x1b[34m%s\x1b[0m",
        fgMagenta: "\x1b[35m%s\x1b[0m",
        fgCyan: "\x1b[36m%s\x1b[0m",
        fgWhite: "\x1b[37m%s\x1b[0m",
        fgGray: "\x1b[90m%s\x1b[0m",
        bgBlack: "\x1b[40m%s\x1b[0m",
        bgRed: "\x1b[41m%s\x1b[0m",
        bgGreen: "\x1b[42m%s\x1b[0m",
        bgYellow: "\x1b[43m%s\x1b[0m",
        bgBlue: "\x1b[44m%s\x1b[0m",
        bgMagenta: "\x1b[45m%s\x1b[0m",
        bgCyan: "\x1b[46m%s\x1b[0m",
        bgWhite: "\x1b[47m%s\x1b[0m",
        bgGray: "\x1b[100m%s\x1b[0m"
      };
    }
  };
  mod.start();
  return mod;
})(), "string": (function() {
  var mod = {
    start: function() {
      app.camelCase = function camelize(str, capitalFirst) {
        if (!app.has(capitalFirst)) capitalFirst = false;
        var result = str.replace(/(?:^\w|[A-Z]|\b\w)/g, function(word, index) {
          return index === 0 ? word.toLowerCase() : word.toUpperCase();
        }).replace(/\s+/g, '');
        if (capitalFirst) result = result.substr(0, 1).toUpperCase() + result.substr(1, 999);
        return result;
      };
      app.properCase = function(str) {
        return str.replace(
          /\w\S*/g,
          function(txt) { return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase(); }
        );
      };
    }
  };
  mod.start();
  return mod;
})(), "workers": (function() {
  var mod = {
    start: function() {
      app.workers = {
        index: 0,
        list: {},
        task: function(callback, taskName) {
          app.workers.index += 1;
          app.workers.list[app.workers.index] = {taskName: taskName, callback: callback};
        },
        count: function(taskName) {
          var count = 0;
          for (var index in app.workers.list) {
            var item = app.workers.list[index];
            if (item.name === taskName) count += 1;
          }
          return count;
        },
        do: async function(taskName) {
          return new Promise(function(resolve, reject) {
            for (var index in app.workers.list) {
              (async function(index) {
                var item = app.workers.list[index];
                if (taskName === item.taskName) {
                  await item.callback();
                  delete app.workers.list[index];
                  if (app.workers.count(taskName) <= 0) resolve(true);
                }
              })(index);
            }
          });
        }
      };
    }
  };
  mod.start();
  return mod;
})(), };app["publish"] = {};app["utils"] = {"airtable": (function() {
  var mod = {
    getOptions: function(options, prefix) {
      var list = {};
      for (var key in options) {
        if (key.split(prefix + "Airtable").length > 1) {
          list[app.camelCase(key.split(prefix).pop())] = options[key];
        }
      }
      return list;
    }
  };
  return mod;
})(), "url": (function() {
  var mod = {
    domain: function(link) {
      return new URL(link).hostname;
    }
  };
  return mod;
})(), };
var config = app.config;
var modules = app.modules;
app.has = function(value) {
  var found = true;
  for (var i=0; i<=arguments.length-1; i++) {
    var value = arguments[i];
    if (!(typeof value !== "undefined" && value !== null && value !== "")) found = false;
  }
  return found;
};
if (!app.has(fetch)) {
  var fetch = require("node-fetch");
}
if (typeof app.start === "function") app.start();

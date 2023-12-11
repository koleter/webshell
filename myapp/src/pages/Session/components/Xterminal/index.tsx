import {useEffect, useRef, useState} from "react";
import React from "react";
import {Terminal} from "xterm"
import "xterm/css/xterm.css"
import util, {sleep, msgMap, sessionStatusMap, showMessage} from "../../../../util"
import {DISCONNECTED, CONNECTING, CONNECTED} from "../../../../const"
import {sessionIdRef, sessionIdMapFileName} from "../../main"
import {request} from 'umi';
import "./index.less"

const termOptions = {
  rendererType: "canvas",
  fontSize: 12,
  cursorBlink: true,
  theme: {
    background: 'black',
    foreground: 'white',
    cursor: 'white'
  }
};


const style = {};

const Index: React.FC = (props) => {
  const terminalRef = useRef<null | HTMLDivElement>(null);
  let {id, sessionConfId, activeKey, sessions, setSessions, removeTabByKey} = props;
  // console.log(id, sessionConfId, activeKey, sessions, setSessions, removeTabByKey);

  useEffect(() => {
    const ws_url = util.baseUrl.split(/\?|#/, 1)[0].replace('http', 'ws'),
      join = (ws_url[ws_url.length - 1] === '/' ? '' : '/'),
      url = ws_url + join + 'ws?id=' + id,
      url_opts_data = {
        command: ''
      },
      encoding = 'utf-8',
      decoder = window.TextDecoder ? new window.TextDecoder(encoding) : encoding;

    const term = new Terminal(termOptions);

    const sock = new window.WebSocket(url);
    sessionStatusMap[id] = CONNECTING;

    sock.onopen = function () {
      term.open(terminalRef.current as HTMLDivElement);
      term.focus();
      if (url_opts_data.command) {
        setTimeout(function () {
          sock.send(JSON.stringify({'data': url_opts_data.command + '\r', 'type': 'data'}));
        }, 500);
      }
      resize_terminal(term);
      sessionStatusMap[id] = CONNECTED;
    };

    sessionIdRef[id] = {
      id: id,
      sock: sock,
      term: term,
      send: function (msg: object) {
        sock.send(JSON.stringify(msg));
      },
      sendData: function (data: string) {
        sock.send(JSON.stringify({'data': data + '\r', 'type': 'data'}));
      },
      sendRecv: async function (data: string, maxRetryCount = 10, retryTime = 1000) {
        const uid = genUUid();
        console.log(`uuid: ${uid}`)

        sock.send(JSON.stringify({'data': data + '\r', requestId: uid, 'type': 'sendRecv'}));
        for (let i = 0; i < maxRetryCount; i++) {
          console.log('msgMap:', msgMap)
          if (uid in msgMap) {
            const msg = msgMap[uid];
            delete msgMap[uid];
            return msg
          }
          await sleep(retryTime);
        }
        return {
          error: 'excced time'
        }
      }
    };

    function get_cell_size(term) {
      style.width = term._core._renderService._renderer.dimensions.css.cell.width;
      style.height = term._core._renderService._renderer.dimensions.css.cell.height;
    }

    function current_geometry(term) {
      if (!style.width || !style.height) {
        get_cell_size(term);
      }

      const terminal_container = document.querySelector('#root > div > section > div > main > section > main');

      const cols = parseInt(parseInt(getComputedStyle(terminal_container).width) / style.width, 10) - 2;
      const rows = parseInt(parseInt(parseFloat(getComputedStyle(terminal_container).height) * 0.96) / style.height, 10);
      return {'cols': cols, 'rows': rows};
    }

    function resize_terminal(term) {
      const geometry = current_geometry(term);
      term.on_resize(geometry.cols, geometry.rows);
    }

    sock.onerror = function (e) {
      console.error(e);
    };

    term.onData(function () {
      let str = "";
      return function (data) {
        str += data;
        if (data.indexOf("\r") >= 0 || data.indexOf("\n") >= 0) {
          console.log(`onData: ${id}, data: ${str}`);
          sock.send(JSON.stringify({'data': str, 'type': 'data'}));
          str = "";
        }
        term.write(data);
      }
    }());

    window.onresize = function () {
      resize_terminal(term);
    }

    term.on_resize = function (cols, rows) {
      if (cols !== this.cols || rows !== this.rows) {
        this.resize(cols, rows);
        sock.send(JSON.stringify({'type': 'resize', 'resize': [cols, rows]}));
      }
    };
  }, []);

  const methodMap = {
    createNewSession: (sessionConfs, callback) => {
      const arr = [];
      sessionConfs.forEach(sessionConf => {
        var body;
        switch (Object.prototype.toString.call(sessionConf)) {
          case "[object String]":
            body = {
              filePath: sessionConf
            };
            break;
          case '[object Object]':
            body = {
              filePath: sessionConf.conf_id,
              sessionName: sessionConf.session_name
            };
        }
        arr.push(request(util.baseUrl, {
          method: 'POST',
          body: JSON.stringify(body),
        }));
      });

      Promise.all(arr).then(res => {
        for (let i = 0; i < res.length; i++) {
          if (res[i].status) {
            showMessage(res[i]);
            return;
          }
        }

        // 保存新创建的所有会话的id
        const newSessionIds = [];
        let hasError = false;
        for (let i = 0; i < res.length; i++) {
          const item = res[i];
          if (!item.filePath) {
            showMessage({
              status: 'error',
              content: item.status
            });
            hasError = true;
          }
          newSessionIds.push(item.id);
        }
        if (hasError) {
          return;
        }
        setSessions((sessions) => {
          const data = [...sessions];
          for (let i = 0; i < res.length; i++) {
            const item = res[i];
            sessionIdMapFileName[item.id] = item.filePath.substr(item.filePath.lastIndexOf('\\') + 1);
            data.push({label: item.sessionName, key: item.id, sessionConfId: item.filePath, isConnected: true});
          }

          const interval = 200;

          // 创建新会话需要等待所有会话的websocket与后端建立完毕
          function checkAllSessionIsReady(time) {
            // 最多等4秒,无法全部执行成功的话就不再执行回调
            if (time > 4000) {
              return;
            }
            for (let i = 0; i < newSessionIds.length; i++) {
              if (sessionStatusMap[newSessionIds[i]] !== CONNECTED) {
                setTimeout(() => {
                  checkAllSessionIsReady(time + interval);
                }, interval);
                return;
              }
            }
            callback && callback(res);
          }

          checkAllSessionIsReady(0);
          return data;
        });
      })
    },
    prompts: (msgs, callback) => {
      const res = [];
      for (const msg of msgs) {
        const userInput = prompt(msg);
        res.push(userInput);
      }
      callback && callback(res);
    }
  };

  useEffect(() => {
    function term_write(text) {
      sessionIdRef[id].term.write(text);
    }

    function wsockCallback(res) {
      switch (res.type) {
        case 'data':
          term_write(res.val);
          break;
        case 'message':
          showMessage(res);
          break;
        case 'execMethod':
          if (res.requestId) {
            methodMap[res.method](res.args, (callbackResponse) => {
              sessionIdRef[id].send({
                type: 'callback',
                requestId: res.requestId,
                args: callbackResponse
              })
            })
          } else {
            methodMap[res.method](res.args);
          }
          break;
        case 'eval':
          const result = eval(`${res.method}('${res.args}')`);
          if (res.requestId) {
            sessionIdRef[id].send({
              type: 'callback',
              requestId: res.requestId,
              args: result
            })
          }
          break;
        case 'response':
          console.log(res);
          if (res.val) {
            msgMap[res.requestId] = res.val;
          }
          console.log(msgMap)
          break;
        default:
          throw new Error(`unexpected result type: ${res.type}`);
          break;
      }
    }

    if (sessionIdRef[id]) {
      sessionIdRef[id].sock.onclose = function (e) {
        console.log(`sock: ${id} closed`, e);
        try {
          sessionIdRef[id].term.write("\nthis session is closed.....");
        } catch (e) {
        }
        // removeTabByKey(id);
        window.onresize = null;
        delete sessionIdRef[id];
        delete sessionIdMapFileName[id];
        delete sessionStatusMap[id];

        setSessions(sessions => {
          const data = [...sessions];
          for (let i = 0; i < data.length; i++) {
            if (data[i].key == id) {
              data[i].isConnected = false;
              break;
            }
          }
          return data;
        })
        // console.log(`sessionIdRef, sessionIdMapFileName, `, sessionIdRef, sessionIdMapFileName)
      };

      sessionIdRef[id].sock.onmessage = function (msg) {
        const res = JSON.parse(msg.data);
        wsockCallback(res);
      };
    }
  }, [sessions])

  const renderElement = () => {
    return (
      <div style={{display: id === activeKey ? 'block' : 'none'}}>
        <div ref={terminalRef}></div>
      </div>
    )
  }

  return (
    renderElement()
  )
}

// export default React.memo(Xterminal);
export default Index;

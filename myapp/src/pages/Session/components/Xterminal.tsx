import {useEffect, useRef, useState} from "react";
import React from "react";
import {Terminal} from "xterm"
import "xterm/css/xterm.css"
import util, {sleep, msgMap, getUUid, showMessage} from "../../../util"
import {Button, List, message} from 'antd';
import {sessionIdRef} from "../index"
import {request} from 'umi';

const termOptions = {
  fontSize: 12,
  cursorBlink: true,
  theme: {
    background: 'black',
    foreground: 'white',
    cursor: 'white'
  }
};


const style = {};

const Xterminal: React.FC = (props) => {
  const terminalRef = useRef<null | HTMLDivElement>(null);
  let {id, sessionConfId, activeKey, sessions, setSessions, removeTabByKey} = props;
  // console.log(id, sessionConfId, activeKey, sessions, setSessions, removeTabByKey);

  useEffect(() => {
    const ws_url = util.baseUrl.split(/\?|#/, 1)[0].replace('http', 'ws'),
      join = (ws_url[ws_url.length - 1] === '/' ? '' : '/'),
      url = ws_url + join + 'ws?id=' + id,
      DISCONNECTED = 0,
      CONNECTING = 1,
      CONNECTED = 2,
      url_opts_data = {
        command: ''
      },
      encoding = 'utf-8',
      decoder = window.TextDecoder ? new window.TextDecoder(encoding) : encoding;

    const term = new Terminal(termOptions);

    const sock = new window.WebSocket(url);
    let state = CONNECTING;

    sock.onopen = function () {
      term.open(terminalRef.current as HTMLDivElement);
      term.focus();
      state = CONNECTED;
      if (url_opts_data.command) {
        setTimeout(function () {
          sock.send(JSON.stringify({'data': url_opts_data.command + '\r', 'type': 'data'}));
        }, 500);
      }
      resize_terminal(term);
    };

    sessionIdRef[id] = {
      id: id,
      status: state,
      sock: sock,
      term: term,
      send: function(msg: object) {
        sock.send(JSON.stringify(msg));
      },
      sendData: function(data: string) {
        sock.send(JSON.stringify({'data': data + '\r', 'type': 'data'}));
      },
      sendRecv: async function(data: string, maxRetryCount=10, retryTime=1000) {
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
      const rows = parseInt(parseInt(parseFloat(getComputedStyle(terminal_container).height) * 0.905) / style.height, 10);
      return {'cols': cols, 'rows': rows};
    }

    function resize_terminal(term) {
      const geometry = current_geometry(term);
      term.on_resize(geometry.cols, geometry.rows);
    }

    sock.onerror = function (e) {
      console.error(e);
    };

    term.onData(function (data) {
      // console.log(`onData: ${id}`);
      sock.send(JSON.stringify({'data': data, 'type': 'data'}));
    });

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
    createNewSession: (sessionConfIds, callback) => {
      const arr = [];
      for (let i = 0; i < sessionConfIds.length; i++) {
        arr.push(request(util.baseUrl, {
          method: 'POST',
          body: JSON.stringify((Object.assign({term: 'xterm-256color'}))),
        }))
      }
      Promise.all(arr).then(res => {
        for (let i = 0; i < res.length; i++) {
          if (res.status) {
            message.error({
              type: 'error',
              content: res.status
            });
            return;
          }
        }
        const sessionIds = res.map(item => item.id);
        const data = [...sessions];
        sessionIds.forEach(sessionId => {
        })
        setSessions(data);
        callback && callback(sessionIds);
      })
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
            methodMap[res.method](JSON.parse(res.args), (sessionIds) => {
              sessionIdRef[id].send({
                type: 'response',
                res: sessionIds
              })
            })
          } else {
            methodMap[res.method](JSON.parse(res.args));
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

    sessionIdRef[id].sock.onclose = function (e) {
      console.log(`sock: ${id} closed`, e);
      sessionIdRef[id].term.write("\nthis session is closed.....");
      // removeTabByKey(id);
      window.onresize = null;
      delete sessionIdRef[id];
    };

    sessionIdRef[id].sock.onmessage = function (msg) {
      const res = JSON.parse(msg.data);
      wsockCallback(res);
    };
  }, [sessions])


  const scriptData = [
    {
      name: '现网通过traceId查找日志',
      method: () => {
        const traceid = prompt("请输入traceId");
        if (!traceid) {
          return;
        }
        const input = prompt("请输入堡垒机id,逗号隔开");
        if (!input) {
          return;
        }
        const codes = input.split(",");
        const arr = [];
        for (let i = 0; i < codes.length; i++) {
          arr.push(request(util.baseUrl, {
            method: 'POST',
            body: JSON.stringify((Object.assign({term: 'xterm-256color'}))),
          }))
        }
        Promise.all(arr).then(res => {
          for (let i = 0; i < res.length; i++) {
            if (res.status) {
              message.error({
                type: 'error',
                content: res.status
              });
              return;
            }
          }
          const data = [...sessions];
          res.forEach(item => {

          })
          setSessions(data);

          let idx = 0;
          res.forEach((item) => {
            setTimeout(() => {
              sessionIdRef[item.id].sendData(codes[idx]);
              sessionIdRef[item.id].sendData("su");
              idx++;
            }, 1000);
          })
        })
      }
    },
    {
      name: '删除其它session',
      method: () => {
       const data = [...sessions].filter(session => session.key === id);
       setSessions(data);
      }
    }
  ];

  const renderElement = () => {
    return (
      <div style={{display: id === activeKey ? 'block' : 'none'}} className="terminal-container" items={sessions}>
        <div ref={terminalRef}></div>
        <List
          size="small"
          dataSource={scriptData}
          style={{overflow: 'auto'}}
          renderItem={(item) => <Button onClick={item.method}>{item.name}</Button>}
        />
      </div>
    )
  }

  return (
    renderElement()
  )
}

// export default React.memo(Xterminal);
export default Xterminal;

import {Dropdown, Layout, message, Tabs} from 'antd';
import type {DataNode} from 'antd/es/tree';
import React, {useState} from 'react';
import "./index.less"
import "xterm/css/xterm.css"
import SessionWindow from "@/pages/Session/components/Xterminal/sessionWindow";
import ScriptDrawer from "@/pages/Session/components/ScriptDrawer";
import SessionList from "@/pages/Session/components/SessionList";
import util, {showMessage} from "@/util";
import {AppContext, AppContextProvider} from "@/pages/context/AppContextProvider";
import {request} from "@@/plugin-request/request";


const {Content, Sider} = Layout;
type TargetKey = React.MouseEvent | React.KeyboardEvent | string;
let startX;

// 记录sessionId对应的文件名,这个用来过滤session可用的脚本
export const sessionIdMapFileName = {};

// 记录sessionId对应的sock等信息
export const sessionIdRef = {};

const loop = (
  data: DataNode[],
  key: React.Key,
  callback: (node, i: number, data) => void,
) => {
  for (let i = 0; i < data.length; i++) {
    if (data[i].key === key) {
      return callback(data[i], i, data);
    }
    if (data[i].children) {
      if (loop(data[i].children!, key, callback)) {
        return true;
      }
    }
  }
};

const SessionMain: React.FC = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeKey, setActiveKey] = useState('');
  const [sessions, setSessions] = useState([]);

  const onChange = (newActiveKey: string) => {
    setActiveKey(newActiveKey);
  };

  const removeTabByKey = (targetKey: TargetKey) => {
    try {
      sessionIdRef[targetKey].sock.close();
    } catch (e) {
      console.error(e);
    }

    let newActiveKey = activeKey;
    let lastIndex = -1;
    const data = [...sessions];
    data.forEach((item, i) => {
      if (item.key === targetKey) {
        lastIndex = i - 1;
      }
    });
    const newPanes = data.filter((item) => item.key !== targetKey);
    if (newPanes.length && newActiveKey === targetKey) {
      if (lastIndex >= 0) {
        newActiveKey = newPanes[lastIndex].key;
      } else {
        newActiveKey = newPanes[0].key;
      }
    }
    setSessions(newPanes);
    delete sessionIdRef[targetKey];
    setActiveKey(newActiveKey);
  };

  const onEdit = (
    targetKey: React.MouseEvent | React.KeyboardEvent | string,
    action: 'add' | 'remove',
  ) => {
    removeTabByKey(targetKey);
  };

  return <AppContext.Consumer>
    {({xshListWindowWidth, setXshListWindowWidth}) => {
      return <>
        <div style={{
          position: 'absolute',
          right: '0',
          bottom: 0,
          width: '6px',
          height: '95%',
          zIndex: 999
        }} onMouseEnter={() => {
          sessions.length && setDrawerOpen(true);
        }}/>
        <Layout hasSider style={{display: 'flex'}}>
          <Sider
            width={xshListWindowWidth}
            style={{height: "100vh", backgroundColor: 'white'}}>
            <SessionList
              sessions={sessions}
              setSessions={setSessions}
              setActiveKey={setActiveKey}
            />
          </Sider>
          <div
            style={{width: '3px', height: '100vh', cursor: 'col-resize'}}
            onMouseDown={(e) => {
              // console.log(e);
              startX = e.clientX;

              function move(e) {
                startX = startX + e.movementX;
                setXshListWindowWidth(startX);
              }

              document.addEventListener('mousemove', move);

              function removeDocumentListener() {
                console.log("document mouseup, removeDocumentListener")
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', removeDocumentListener);
                request(util.baseUrl + 'conf', {
                  method: 'POST',
                  body: JSON.stringify({
                    type: 'GlobalAutoConfig',
                    args: {
                      xshListWindowWidth: startX
                    }
                  })
                })
              }

              document.addEventListener('mouseup', removeDocumentListener);
            }}
          ></div>
          <Content style={{width: '100%', overflow: 'hidden'}}>
            <Tabs
              id={"sessionTabs"}
              type="editable-card"
              activeKey={activeKey}
              hideAdd
              items={sessions.map(item => {
                function closeSessions(sessions) {
                  sessions.forEach(session => {
                    try {
                      // 必须要调用websocket的close方法,直接设置session会导致页面上的会话关闭但是ssh连接未断开
                      sessionIdRef[session.key].sock.close();
                    } catch (e) {
                      console.error(e);
                    }
                  })
                }

                return {
                  label: (
                    <Dropdown
                      menu={{
                      items: [
                        {
                          label: (
                            <span onClick={() => {
                              var name = prompt("重命名");
                              if (!name.trim()) {
                                showMessage({
                                  status: "error",
                                  content: "name can not be empty"
                                });
                                return;
                              }
                              setSessions((sessions) => {
                                const data = [...sessions];
                                for (const session of data) {
                                  if (session.key === item.key) {
                                    session.label = name;
                                    break;
                                  }
                                }
                                return data;
                              });
                            }}>重命名</span>
                          ),
                          key: 'rename'
                        },
                        {
                          label: (
                            <span onClick={() => {
                              setSessions(sessions.filter(session => session.key === item.key));
                              closeSessions(sessions.filter(session => session.key !== item.key));
                            }}>关闭其他选项卡</span>
                          ),
                          key: 'closeOtherTabs'
                        },
                        {
                          label: (
                            <span onClick={() => {
                              closeSessions(sessions);
                              setSessions([]);
                            }}>关闭所有选项卡</span>
                          ),
                          key: 'closeAllTabs'
                        }
                      ]
                    }} trigger={['contextMenu']}>
                  <span>
                    {item.label}
                    <div style={{
                      display: 'inline-block',
                      backgroundColor: item.isConnected ? 'green' : 'red',
                      borderRadius: '50%',
                      width: '1em',
                      height: '1em'
                    }}></div>
                  </span>
                    </Dropdown>

                  ),
                  key: item.key,
                  forceRender: true,
                  children: <SessionWindow
                    key={item.key}
                    id={item.key}
                    sessions={sessions}
                    setSessions={setSessions}
                  />
                }
              })}
              onEdit={onEdit}
              onChange={onChange}/>
          </Content>
        </Layout>

        <ScriptDrawer
          activeKey={activeKey}
          sessions={sessions}
          drawerOpen={drawerOpen}
          setDrawerOpen={setDrawerOpen}
        />
      </>

    }}


  </AppContext.Consumer>
};

export default SessionMain;

import {Dropdown, Form, Input, Layout, Drawer, Modal, Tabs, Tree, message, Space, Tag, Button, Radio} from 'antd';
import {ProList} from '@ant-design/pro-components';
import type {DataNode, TreeProps} from 'antd/es/tree';
import React, {useRef, useState, useEffect} from 'react';
import "./index.less"
import "xterm/css/xterm.css"
import {request, FormattedMessage} from 'umi';
import util, {msgMap, sleep, getUUid} from '../../util'
import Xterminal from "@/pages/Session/components/Xterminal";


const {DirectoryTree} = Tree;
const {Content, Sider} = Layout;
type TargetKey = React.MouseEvent | React.KeyboardEvent | string;
let sessionRootKey = "";

// 记录sessionId对应的文件名,这个用来过滤session可用的脚本
export const sessionIdMapFileName = {};

function genSessionFormProperties() {
  return <>
    <Form.Item
      label="会话名"
      name="sessionName"
      initialValue={""}
      rules={[{required: true, message: '请输入会话名!'}]}
    >
      <Input/>
    </Form.Item>

    <Form.Item
      label="主机"
      name="hostname"
      initialValue={""}
      rules={[{required: true, message: '请输入主机!'}]}
    >
      <Input/>
    </Form.Item>

    <Form.Item
      label="端口"
      name="port"
      initialValue={22}
      rules={[{required: true, message: '请输入端口!'}]}
    >
      <Input/>
    </Form.Item>

    <Form.Item
      label="用户名"
      name="username"
      initialValue={""}
      rules={[{required: true, message: '请输入用户名!'}]}
    >
      <Input/>
    </Form.Item>

    <Form.Item
      label="密码"
      name="password"
      initialValue={""}
    >
      <Input.Password/>
    </Form.Item>

    <Form.Item
      label="密钥文件路径"
      name="privatekey"
      initialValue={""}
    >
      <Input/>
    </Form.Item>

    <Form.Item
      label="密钥密码"
      name="passphrase"
      initialValue={""}
    >
      <Input.Password/>
    </Form.Item>

    <Form.Item
      label="totp"
      name="totp"
      initialValue={""}
    >
      <Input/>
    </Form.Item>
  </>
}

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

const Session: React.FC = () => {
  const [treeData, setTreeData] = useState([]);
  const [refreshTreeData, setRefreshTreeData] = useState(0);
  const [refreshScriptData, setRefreshScriptData] = useState(0);
  const [scriptData, setScriptData] = useState([]);


  useEffect(() => {
    request(util.baseUrl + 'conf', {
      method: 'GET',
      params: {
        type: 'ScriptConfig',
      },
    }).then(res => {
      if (res.status !== 'success') {
        message[res.status](res.msg);
      }
      setScriptData(res.scriptData);
    })
  }, [refreshScriptData])

  useEffect(() => {
    request(util.baseUrl + 'conf', {
      method: 'GET',
      params: {
        type: 'SessionConfig',
      },
    }).then(res => {
      if (res.status !== 'success') {
        message[res.status](res.msg);
      }
      sessionRootKey = res.defaultTreeData[0].key;
      setTreeData(res.defaultTreeData);
    })
  }, [refreshTreeData])
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scriptSearchValue, setScriptSearchValue] = useState("");


  const [activeKey, setActiveKey] = useState('');
  const [sessions, setSessions] = useState([]);

  const [form] = Form.useForm();
  const [editForm] = Form.useForm();

  const [addScriptForm] = Form.useForm();
  const [editScriptForm] = Form.useForm();
  const [addSessionModalVisiable, setAddSessionModalVisiable] = useState(false);
  const [editSessionModalVisiable, setEditSessionModalVisiable] = useState(false);
  const [addScriptModalVisiable, setAddScriptModalVisiable] = useState(false);
  const [editScriptModalVisiable, setEditScriptModalVisiable] = useState(false);

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

  const onDrop: TreeProps['onDrop'] = (info) => {
    const dropKey = info.node.key;
    const dragKey = info.dragNode.key;
    if (dragKey.substr(0, dragKey.lastIndexOf("\\")) == dropKey) {
      return;
    }
    request(util.baseUrl + 'conf', {
      method: 'POST',
      body: JSON.stringify({
        type: 'SessionConfig',
        args: {
          type: 'moveFileOrDir',
          src: dragKey,
          dst: dropKey
        }
      }),
    }).then(res => {
      message[res.status](res.msg);
      if (res.status == 'success') {
        setRefreshTreeData(e => e + 1);
      }
    })
  };

  const [modalNode, setModalNode] = useState(null);

  const genTreeNodeMenu = (node) => {
    const items = [];
    // 非session节点
    if (!node.isLeaf) {
      items.push({
        label: (
          <span onClick={() => {
            const dirName = prompt("请输入文件夹名");
            if (!dirName) {
              return;
            }
            request(util.baseUrl + 'conf', {
              method: 'POST',
              body: JSON.stringify({
                type: 'SessionConfig',
                args: {
                  type: 'createDir',
                  path: node.key ? node.key + '/' + dirName : dirName
                }
              }),
            }).then(res => {
              message[res.status](res.msg);
              if (res.status == 'success') {
                setRefreshTreeData(e => e + 1)
              }
            })
          }}>新增文件夹</span>
        ),
        key: 'addFolder',
      }, {
        label: (
          <span onClick={() => {
            form.resetFields();
            setModalNode(node);
            setAddSessionModalVisiable(true);
          }}>新增会话</span>
        ),
        key: 'addSession',
      });
    } else {
      // session节点可以复制某个session配置
      items.push({
        label: (
          <span onClick={() => {
            request(util.baseUrl + 'conf', {
              method: 'POST',
              body: JSON.stringify({
                type: 'SessionConfig',
                args: {
                  type: 'duplicateSession',
                  path: node.key
                }
              }),
            }).then(res => {
              message[res.status](res.msg);
              if (res.status == 'success') {
                setRefreshTreeData(e => e + 1)
              }
            })
          }}>复制</span>
        ),
        key: 'duplicateSession',
      });
    }

    // 非root节点
    if (sessionRootKey != node.key) {
      items.push({
        label: (
          <span onClick={() => {
            setModalNode(node);
            if (node.isLeaf) {
              request(util.baseUrl + 'conf', {
                method: 'POST',
                body: JSON.stringify({
                  type: 'SessionConfig',
                  args: {
                    type: 'readFile',
                    path: node.key,
                  }
                }),
              }).then(res => {
                if (res.status !== 'success') {
                  message[res.status](res.msg);
                } else {
                  editForm.setFieldsValue(Object.assign({key: node.key}, JSON.parse(res.content)));
                  setEditSessionModalVisiable(true);
                }
              })
            } else {
              editForm.setFieldsValue(node);
              setEditSessionModalVisiable(true);
            }
          }}>编辑</span>
        ),
        key: 'edit',
      }, {
        label: (
          <span onClick={() => {
            request(util.baseUrl + 'conf', {
              method: 'POST',
              body: JSON.stringify({
                type: 'SessionConfig',
                args: {
                  type: 'deleteFile',
                  path: node.key
                }
              }),
            }).then(res => {
              message[res.status](res.msg);
              if (res.status == 'success') {
                setRefreshTreeData(e => e + 1);
              }
            })
          }}>删除</span>
        ),
        key: 'delete',
      });
    }

    return {items}
  }

  /**
   *
   * @param filePath  session配置文件的路径
   * @param title     新建session会话的标题
   * @param callback  回调函数,参数是新创建的session会话的id
   */
  async function createNewSession(filePath, title, callback) {
    // xterm-256color
    request(util.baseUrl, {
      method: 'POST',
      body: JSON.stringify({
        filePath
      }),
    }).then(res => {
      if (res.status) {
        message.error({
          type: 'error',
          content: res.status
        });
        return;
      }
      sessionIdMapFileName[res.id] = filePath.substr(filePath.lastIndexOf('\\') + 1);
      const data = [...sessions];
      data.push({label: title, key: res.id, sessionConfId: filePath, isConnected: true});
      setSessions(data);
      setActiveKey(res.id);
      callback && callback(res.id);
    })
  }

  const titleRender = (nodeData: DataNode) => {
    return (
      <Dropdown menu={genTreeNodeMenu(nodeData)} trigger={['contextMenu']}>
        <span onDoubleClick={() => {
          if (!nodeData.isLeaf) {
            return;
          }
          createNewSession(nodeData.key, nodeData.title);
        }}>{nodeData.title}</span>
      </Dropdown>
    );
  }

  function genScriptFormProperties() {
    return <>
      <Form.Item
        label="脚本名"
        name="name"
        initialValue={""}
        rules={[{required: true, message: '请输入脚本名!'}]}
      >
        <Input/>
      </Form.Item>

      <Form.Item
        label="python脚本文件路径"
        name="scriptPath"
        initialValue={""}
        rules={[{required: true, message: '请输入python脚本文件路径!'}]}
      >
        <Input/>
      </Form.Item>
    </>
  }


  return <>
    <div style={{
      position: 'absolute',
      right: '0',
      width: '10px',
      height: '100%',
      zIndex: 999
    }} onMouseEnter={() => {
      sessions.length && setDrawerOpen(true);
    }}/>
    <Layout>
      <Sider
        style={{height: "100vh", backgroundColor: 'white'}}>
        <DirectoryTree
          className="draggable-tree"
          draggable
          blockNode
          autoExpandParent={true}
          titleRender={titleRender}
          onDrop={onDrop}
          treeData={treeData}
        />
      </Sider>

      <Content>
        <Tabs
          type="editable-card"
          activeKey={activeKey}
          hideAdd
          items={sessions.map(item => {
            function closeSessions(sessions) {
              sessions.forEach(session => {
                try {
                  sessionIdRef[session.key].sock.close();
                } catch (e) {
                  console.error(e);
                }
              })
            }
            return {
              label: (
                <Dropdown menu={{
                  items: [
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
                ]}} trigger={['contextMenu']}>
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
              key: item.key
            }
          })}
          style={{marginBottom: 0}}
          onEdit={onEdit}
          onChange={onChange}/>
        {
          sessions.map(item => {
            return <Xterminal
              key={item.key}
              id={item.key}
              sessionConfId={item.sessionConfId}
              activeKey={activeKey}
              sessions={sessions}
              setSessions={setSessions}
              removeTabByKey={removeTabByKey}
            />
          })
        }
      </Content>
    </Layout>
    <Modal
      maskClosable={false}
      open={editSessionModalVisiable}
      closable={false}
      onOk={() => {
        editForm.submit();
      }}
      onCancel={() => {
        setEditSessionModalVisiable(false);
      }}
    >
      <Form
        form={editForm}
        onFinish={(formInfo) => {
          if (!modalNode.isLeaf) {
            request(util.baseUrl + 'conf', {
              method: 'POST',
              body: JSON.stringify({
                type: 'SessionConfig',
                args: {
                  type: 'renameDir',
                  src: modalNode.key,
                  dst: formInfo.title
                }
              }),
            }).then(res => {
              message[res.status](res.msg);
              if (res.status == 'success') {
                setRefreshTreeData(e => e + 1);
                setEditSessionModalVisiable(false);
              }
            })
            return;
          }
          request(util.baseUrl + 'conf', {
            method: 'POST',
            body: JSON.stringify({
              type: 'SessionConfig',
              args: {
                type: 'editSession',
                src: modalNode.key,
                sessionInfo: formInfo
              }
            }),
          }).then(res => {
            message[res.status](res.msg);
            if (res.status == 'success') {
              setRefreshTreeData(e => e + 1);
              setEditSessionModalVisiable(false);
            }
          })
        }}
      >
        {
          <>
            {
              modalNode?.isLeaf ?
                <>
                  <Form.Item
                    label="key"
                    name="key"
                    initialValue={""}
                    rules={[{required: true, message: 'please enter key!'}]}
                  >
                    <Input disabled={true}/>
                  </Form.Item>
                  {genSessionFormProperties()}
                </>
                : <Form.Item
                  label="文件夹名"
                  name="title"
                  initialValue={modalNode?.title}
                  rules={[{required: true, message: '请输入文件夹名!'}]}
                >
                  <Input/>
                </Form.Item>
            }
          </>
        }
      </Form>
    </Modal>
    <Modal
      maskClosable={false}
      open={addSessionModalVisiable}
      closable={false}
      onOk={() => {
        form.submit();
      }}
      onCancel={() => {
        setAddSessionModalVisiable(false);
      }}
    >
      <Form
        form={form}
        onFinish={(formInfo) => {
          request(util.baseUrl + 'conf', {
            method: 'POST',
            body: JSON.stringify({
              type: 'SessionConfig',
              args: {
                type: 'addFile',
                dir: modalNode.key,
                fileName: formInfo.sessionName,
                content: JSON.stringify(formInfo)
              }
            }),
          }).then(res => {
            message[res.status](res.msg);
            if (res.status == 'success') {
              setRefreshTreeData(e => e + 1);
              setAddSessionModalVisiable(false);
            }
          })
        }}
      >
        {genSessionFormProperties()}
      </Form>
    </Modal>

    <Drawer
      title={`脚本`}
      placement="right"
      onClose={() => {
        setDrawerOpen(false);
      }}
      open={drawerOpen}
      size={'large'}
    >
      <ProList
        rowKey="name"
        dataSource={scriptData.filter(item => (!item.scriptOwner || item.scriptOwner == sessionIdMapFileName[activeKey]) && item.title.name.indexOf(scriptSearchValue) > -1)}
        metas={{
          title: {
            render: (text, row) => {
              return <Button onClick={() => {
                const sessionList = sessions.filter(session => session.key == activeKey);
                if (sessionList.length != 1) {
                  return;
                }

                sessionIdRef[activeKey].send({
                  type: 'exec',
                  path: row.scriptPath,
                  sessionId: activeKey,
                  xshConfId: sessionList[0].sessionConfId
                })
              }
              }>{text.name}</Button>
            }
          },
          actions: {
            render: (text, row) => [
              <a
                key="link"
                onClick={() => {
                  const fields = Object.assign(row, {name: row.title.name})
                  if (!fields.scriptOwner) {
                    fields.scriptOwner = "common";
                  }
                  editScriptForm.setFieldsValue(fields);
                  setEditScriptModalVisiable(true);
                }}
              >
                <FormattedMessage
                  key="loginWith"
                  id="pages.session.edit"
                  defaultMessage="编辑"
                />
              </a>,
              <a
                key="view"
                onClick={() => {
                  request(util.baseUrl + 'conf', {
                    method: 'POST',
                    body: JSON.stringify({
                      type: 'ScriptConfig',
                      args: {
                        type: 'deleteFile',
                        path: row.file
                      }
                    }),
                  }).then(res => {
                    message[res.status](res.msg);
                    if (res.status == 'success') {
                      setRefreshScriptData(e => e + 1);
                    }
                  })
                }}
              >
                <FormattedMessage
                  key="pages.session.delete"
                  id="pages.session.delete"
                  defaultMessage="删除"
                />
              </a>,
            ],
          },
        }}
        toolBarRender={() => {
          return [
            <Form.Item
              label={<FormattedMessage
                key="loginWith"
                id="pages.session.search"
                defaultMessage="查询"
              />}
            >
              <Input style={{float: 'left'}} onChange={(e) => {
                const {value: inputValue} = e.target;
                setScriptSearchValue(inputValue);
              }}/>
            </Form.Item>
            ,
            <Form.Item>
              <Button key="add" type="primary" onClick={() => {
                addScriptForm.resetFields();
                setAddScriptModalVisiable(true);
              }}>
                <FormattedMessage
                  key="loginWith"
                  id="pages.session.add"
                  defaultMessage="添加"
                />
              </Button>
            </Form.Item>
          ];
        }}
      />
    </Drawer>

    <Modal
      maskClosable={false}
      open={addScriptModalVisiable}
      closable={false}
      onOk={() => {
        addScriptForm.submit();
      }}
      onCancel={() => {
        setAddScriptModalVisiable(false);
      }}
    >
      <Form
        form={addScriptForm}
        onFinish={(formInfo) => {
          if (formInfo.scriptOwner == 'common') {
            formInfo.scriptOwner = "";
          } else {
            formInfo.scriptOwner = sessionIdMapFileName[activeKey];
          }
          request(util.baseUrl + 'conf', {
            method: 'POST',
            body: JSON.stringify({
              type: 'ScriptConfig',
              args: {
                type: 'addFile',
                ...formInfo
              }
            }),
          }).then(res => {
            message[res.status](res.msg);
            if (res.status == 'success') {
              setAddScriptModalVisiable(false);
              setRefreshScriptData(e => e + 1);
            }
          })
        }}
      >
        {genScriptFormProperties()}
        <Form.Item
          name="scriptOwner"
          rules={[() => ({
            validator(e, value) {
              console.log(e);
              if (value || value === "") {
                return Promise.resolve();
              }
              return Promise.reject(new Error('请选择按钮类型!'));
            },
          })]}
          label={<FormattedMessage
            key="pages.session.type"
            id="pages.session.type"
            defaultMessage="类型"
          />}>
          <Radio.Group>
            <Radio value="common">
              <FormattedMessage
                key="pages.session.common"
                id="pages.session.common"
                defaultMessage="公共"
              /> </Radio>
            <Radio value={activeKey}>
              <FormattedMessage
                key="pages.session.currentSession"
                id="pages.session.currentSession"
                defaultMessage="当前会话"
              /> </Radio>
          </Radio.Group>
        </Form.Item>
      </Form>
    </Modal>

    <Modal
      maskClosable={false}
      open={editScriptModalVisiable}
      closable={false}
      onOk={() => {
        editScriptForm.submit();
      }}
      onCancel={() => {
        setEditScriptModalVisiable(false);
      }}
    >
      <Form
        form={editScriptForm}
        onFinish={(formInfo) => {
          request(util.baseUrl + 'conf', {
            method: 'POST',
            body: JSON.stringify({
              type: 'ScriptConfig',
              args: {
                type: 'editScript',
                ...formInfo
              }
            }),
          }).then(res => {
            message[res.status](res.msg);
            if (res.status == 'success') {
              setEditScriptModalVisiable(false);
              setRefreshScriptData(e => e + 1);
            }
          })
        }}
      >
        <Form.Item
          name="file"
          style={{display: 'none'}}
        >
          <Input/>
        </Form.Item>
        {genScriptFormProperties()}
      </Form>
    </Modal>
  </>;
};

export default Session;

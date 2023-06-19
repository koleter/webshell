import {Dropdown, Form, Input, Layout, Drawer, Modal, Tabs, Tree, message, Space, Tag, Button, Upload} from 'antd';
import {ProList} from '@ant-design/pro-components';
import type {DataNode, TreeProps} from 'antd/es/tree';
import React, {useRef, useState, useEffect} from 'react';
import "./index.less"
import "xterm/css/xterm.css"
import {request, FormattedMessage} from 'umi';
import util, {msgMap, sleep, getUUid} from '../../util'
import Xterminal from "@/pages/Session/components/Xterminal";
import {scriptDataSource, defaultTreeData, SESSION_CONF_INFO_MAP} from './init'


const {DirectoryTree} = Tree;
const {Content, Sider} = Layout;
type TargetKey = React.MouseEvent | React.KeyboardEvent | string;

/*window.addEventListener('resize', (e) => {
  console.log(e);
  console.log(document.body.clientWidth)
});*/

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

function initSessionInfoMap() {
  const result = {};

  function dfs(treeData) {
    for (let i = 0; i < treeData.length; i++) {
      result[treeData[i].key] = treeData[i];
      if (treeData[i].children) {
        dfs(treeData[i].children!);
      }
    }
  }

  dfs(defaultTreeData);
  return result;
}

export const sessionConfInfoMap = (localStorage.getItem(SESSION_CONF_INFO_MAP) && JSON.parse(localStorage.getItem(SESSION_CONF_INFO_MAP))) || initSessionInfoMap(defaultTreeData);

const Session: React.FC = () => {
  const [treeData, setTreeData] = useState(defaultTreeData);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scriptSearchValue, setScriptSearchValue] = useState("");
  const [scriptData, setScriptData] = useState(scriptDataSource || []);

  const [activeKey, setActiveKey] = useState('');
  const [sessions, setSessions] = useState([]);
  const setScriptConf = (data) => {
    setScriptData(data);
    localStorage.setItem("scriptData", JSON.stringify(data));
  }

  const [form] = Form.useForm();
  const [editForm] = Form.useForm();

  const [addScriptForm] = Form.useForm();
  const [editScriptForm] = Form.useForm();
  const [addSessionModalVisiable, setAddSessionModalVisiable] = useState(false);
  const [editSessionModalVisiable, setEditSessionModalVisiable] = useState(false);
  const [addScriptModalVisiable, setAddScriptModalVisiable] = useState(false);
  const [editScriptModalVisiable, setEditScriptModalVisiable] = useState(false);

  function saveSessionConfig() {
    localStorage.setItem(SESSION_CONF_INFO_MAP, JSON.stringify(sessionConfInfoMap));
    localStorage.setItem("session", JSON.stringify(treeData));
  }

  const onChange = (newActiveKey: string) => {
    setActiveKey(newActiveKey);
  };

  const removeTabByKey = (targetKey: TargetKey) => {
    console.log(`removeTabByKey: ${targetKey}`);

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
    // console.log(`items: ${JSON.stringify(newPanes)}`)
    // console.log(`activeKey: ${activeKey}`)
    // console.log(`sessionIdRef: ${JSON.stringify(sessionIdRef)}`)
  };

  const onEdit = (
    targetKey: React.MouseEvent | React.KeyboardEvent | string,
    action: 'add' | 'remove',
  ) => {
    // if (action === 'add') {
    //   add();
    // } else {
    removeTabByKey(targetKey);
    // }
  };


  const onDragEnter: TreeProps['onDragEnter'] = (info) => {
    console.log(info);
    // expandedKeys 需要受控时设置
    // setExpandedKeys(info.expandedKeys)
  };

  const onDrop: TreeProps['onDrop'] = (info) => {
    console.log(info);
    const dropKey = info.node.key;
    const dragKey = info.dragNode.key;
    const dropPos = info.node.pos.split('-');
    const dropPosition = info.dropPosition - Number(dropPos[dropPos.length - 1]);

    const data = [...treeData];

    // Find dragObject
    let dragObj: DataNode;
    loop(data, dragKey, (item, index, arr) => {
      arr.splice(index, 1);
      dragObj = item;
      return true;
    });

    if (!info.dropToGap) {
      // Drop on the content
      loop(data, dropKey, (item) => {
        item.children = item.children || [];
        // where to insert 示例添加到头部，可以是随意位置
        item.children.unshift(dragObj);
        return true;
      });
    } else if (
      ((info.node as any).props.children || []).length > 0 && // Has children
      (info.node as any).props.expanded && // Is expanded
      dropPosition === 1 // On the bottom gap
    ) {
      loop(data, dropKey, (item) => {
        item.children = item.children || [];
        // where to insert 示例添加到头部，可以是随意位置
        item.children.unshift(dragObj);
        // in previous version, we use item.children.push(dragObj) to insert the
        // item to the tail of the children
        return true;
      });
    } else {
      let ar: DataNode[] = [];
      let i: number;
      loop(data, dropKey, (_item, index, arr) => {
        ar = arr;
        i = index;
        return true;
      });
      if (dropPosition === -1) {
        ar.splice(i!, 0, dragObj!);
      } else {
        ar.splice(i! + 1, 0, dragObj!);
      }
    }
    setTreeData(data);
  };

  const [modalNode, setModalNode] = useState(null);

  const genTreeNodeMenu = (node) => {
    const items = [];
    if (!node.isLeaf) {
      items.push({
        label: (
          <span onClick={() => {
            const dirName = prompt("请输入文件夹名");
            if (!dirName) {
              return;
            }
            const data = [...treeData];
            if (!node.children) {
              node.children = [];
            }

            const dropKey = node.key;
            loop(data, dropKey, (item) => {
              item.children = item.children || [];
              const uuid = getUUid();
              const newNode = {
                title: dirName,
                key: uuid,
                isLeaf: false,
              };
              item.children.unshift(newNode);
              sessionConfInfoMap[uuid] = newNode;
              saveSessionConfig();
              return true;
            });

            setTreeData(data);
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
    }

    items.push({
      label: (
        <span onClick={() => {
          setModalNode(node);
          editForm.setFieldsValue(sessionConfInfoMap[node?.key])
          setEditSessionModalVisiable(true);
        }}>编辑</span>
      ),
      key: 'edit',
    }, {
      label: (
        <span onClick={() => {
          const data = [...treeData];
          let ar: DataNode[] = [];
          const dropKey = node.key;
          let i: number;
          loop(data, dropKey, (_item, index, arr) => {
            ar = arr;
            i = index;
            return true;
          });
          const delNode = ar[i];
          ar.splice(i, 1);
          delete sessionConfInfoMap[delNode.key];
          saveSessionConfig();
          setTreeData(data);
        }}>删除</span>
      ),
      key: 'delete',
    });

    return {items}
  }

  async function createNewSession(key, label, callback) {
    // xterm-256color
    request(util.baseUrl, {
      method: 'POST',
      body: JSON.stringify((Object.assign({term: 'xterm-256color'}, sessionConfInfoMap[key]))),
    }).then(res => {
      if (res.status) {
        message.error({
          type: 'error',
          content: res.status
        });
        return;
      }

      const data = [...sessions];
      data.push({label: label, key: res.id, sessionConfId: key});
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
        name="path"
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
      setDrawerOpen(true);
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
          onDragEnter={onDragEnter}
          onDrop={onDrop}
          treeData={treeData}
        />
      </Sider>

      <Content>
        <Tabs
          type="editable-card"
          activeKey={activeKey}
          hideAdd
          items={sessions}
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
        setEditSessionModalVisiable(false);
      }}
      onCancel={() => {
        setEditSessionModalVisiable(false);
        editForm.resetFields();
      }}
    >
      <Form
        form={editForm}
        onFinish={(formInfo) => {
          if (!modalNode.isLeaf) {
            const data = [...treeData];
            loop(data, modalNode.key, (item) => {
              item.title = formInfo.title;
              sessionConfInfoMap[modalNode.key].title = formInfo.title;
              return true;
            })
            setTreeData(data);
            saveSessionConfig();
            return;
          }
          const node = sessionConfInfoMap[modalNode.key];
          for (let key in formInfo) {
            if (key === 'key') {
              continue;
            }
            node[key] = formInfo[key];
          }
          sessionConfInfoMap[modalNode.key] = node;
          localStorage.setItem(SESSION_CONF_INFO_MAP, JSON.stringify(sessionConfInfoMap));
        }}
      >
        {
          <>
            <Form.Item
              label="key"
              name="key"
              initialValue={modalNode?.key}
              rules={[{required: true}]}
            >
              <Input disabled={true}/>
            </Form.Item>
            {
              modalNode?.isLeaf ? genSessionFormProperties(modalNode) : <Form.Item
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
          const data = [...treeData];
          if (!modalNode.children) {
            modalNode.children = [];
          }

          const dropKey = modalNode.key;
          const uuid = getUUid();
          loop(data, dropKey, (item) => {
            item.children = item.children || [];
            const newNode = {
              title: formInfo.sessionName,
              key: uuid,
              isLeaf: true
            };
            item.children.push(newNode);
            sessionConfInfoMap[uuid] = formInfo;
            saveSessionConfig();
            return true;
          });
          setTreeData(data);
          setAddSessionModalVisiable(false);
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
        dataSource={scriptData.filter(item => item.title.name.indexOf(scriptSearchValue) > -1)}
        metas={{
          title: {
            render: (e) => {
              return <Button onClick={() => {
                const sessionList = sessions.filter(session => session.key == activeKey);
                if (sessionList.length != 1) {
                  return;
                }

                sessionIdRef[activeKey].send({
                  type: 'exec',
                  path: e.path,
                  sessionId: activeKey,
                  xshConfId: sessionList[0].sessionConfId
                })
              }
              }>{e.name}</Button>
            }
          },
          actions: {
            render: (text, row) => [
              <a
                key="link"
                onClick={() => {
                  editScriptForm.setFieldsValue(row.title);
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
                  const name = row.title.name;
                  const data = [...scriptData];
                  for (let i = 0; i < data.length; i++) {
                    if (data[i].title.name === name) {
                      data.splice(i, 1);
                      setScriptConf(data);
                      return;
                    }
                  }
                }}
              >
                <FormattedMessage
                  key="loginWith"
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
          const data = [...scriptData];
          data.push({
            title: {
              key: getUUid(),
              name: formInfo.name,
              path: formInfo.path
            }
          })
          setScriptConf(data);
          setAddScriptModalVisiable(false);
        }}
      >
        {genScriptFormProperties()}
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
          const data = [...scriptData];
          for (let i = 0; i < data.length; i++) {
            if (data[i].title.key === formInfo.key) {
              data[i] = {
                title: formInfo
              };
              setScriptConf(data);
              setEditScriptModalVisiable(false);
              return;
            }
          }
        }}
      >
        <Form.Item
          name="key"
          initialValue={""}
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

import React, {useEffect, useState} from "react";
import {Dropdown, Form, Input, message, Modal, Tree} from "antd";
import {DataNode, TreeProps} from "antd/es/tree";
import {request} from "@@/plugin-request/request";
import util from "@/util";
import {sessionIdMapFileName} from "@/pages/Session";

const {DirectoryTree} = Tree;
let sessionRootKey = "";


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


const SessionList: React.FC = (props) => {
  const {sessions, setSessions, setActiveKey} = props;

  const [treeData, setTreeData] = useState([]);
  const [refreshTreeData, setRefreshTreeData] = useState(0);
  const [form] = Form.useForm();
  const [modalNode, setModalNode] = useState(null);
  const [addSessionModalVisiable, setAddSessionModalVisiable] = useState(false);
  const [editForm] = Form.useForm();
  const [editSessionModalVisiable, setEditSessionModalVisiable] = useState(false);

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


  return <>
    <DirectoryTree
      className="draggable-tree"
      draggable
      blockNode
      autoExpandParent={true}
      titleRender={titleRender}
      onDrop={onDrop}
      treeData={treeData}
    />

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
  </>
}

export default SessionList;

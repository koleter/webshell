import React, {useEffect, useState} from "react";
import {Dropdown, Form, Input, message, Modal, Tabs, Tree, Button, Row, Col, Space} from "antd";
import {
  EditableProTable,
  ProCard,
  ProFormField,
} from '@ant-design/pro-components';
import {DataNode, TreeProps} from "antd/es/tree";
import {request} from "@@/plugin-request/request";
import util, {defineValidatorWithErrMessage} from "@/util";
import {sessionIdMapFileName} from "@/pages/Session";

const {DirectoryTree} = Tree;
let sessionRootKey = "";
const defaultSessionPropertyActiveKey = 'baseInfo';

const SessionList: React.FC = (props) => {
  const {sessions, setSessions, setActiveKey} = props;

  const [treeData, setTreeData] = useState([]);
  const [refreshTreeData, setRefreshTreeData] = useState(0);
  const [form] = Form.useForm();
  const [modalNode, setModalNode] = useState(null);
  const [addSessionModalVisiable, setAddSessionModalVisiable] = useState(false);
  const [editForm] = Form.useForm();
  const [editSessionModalVisiable, setEditSessionModalVisiable] = useState(false);
  const [dataSource, setDataSource] = useState([]);
  const [sessionPropertyActiveKey, setSessionPropertyActiveKey] = useState(defaultSessionPropertyActiveKey);

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

  function genSessionBaseInfo(showType: string) {
    return <>
      {
        showType === 'edit' &&
        <Form.Item
          label="key"
          name="key"
          initialValue={""}
          rules={[{required: true, message: 'please enter key!'}]}
        >
          <Input disabled={true}/>
        </Form.Item>
      }
      < Form.Item
        label="会话名"
        name="sessionName"
        initialValue={""}
        rules={defineValidatorWithErrMessage('请输入会话名!')}
      >
        <Input/>
      </Form.Item>

      <Form.Item
        label="主机"
        name="hostname"
        initialValue={""}
        rules={defineValidatorWithErrMessage('请输入主机!')}
      >
        <Input/>
      </Form.Item>

      <Form.Item
        label="端口"
        name="port"
        initialValue={22}
        rules={defineValidatorWithErrMessage('请输入端口!')}
      >
        <Input/>
      </Form.Item>

      <Form.Item
        label="用户名"
        name="username"
        initialValue={""}
        rules={defineValidatorWithErrMessage('请输入用户名!')}
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

  const columns = [
    {
      title: '预期字符串',
      dataIndex: 'expect',
      formItemProps: {
        rules: [
          {
            required: true,
            whitespace: true,
            message: '此项是必填项',
          }
        ],
      },
    },
    {
      title: '发送的命令',
      dataIndex: 'command',
      formItemProps: {
        rules: [
          {
            required: true,
            whitespace: true,
            message: '此项是必填项',
          }
        ],
      },
    },
    {
      title: '操作',
      valueType: 'option',
      width: 50,
      render: () => {
        return null;
      },
    },
  ];

  function genLoginScript() {
    return <EditableProTable
      columns={columns}
      rowKey="id"
      value={dataSource}
      onChange={setDataSource}
      recordCreatorProps={{
        newRecordType: 'dataSource',
        record: () => ({
          id: Date.now(),
        }),
      }}
      editable={{
        type: 'multiple',
        editableKeys: dataSource.map(item => item.id),
        actionRender: (row, config, defaultDoms) => {
          return [defaultDoms.delete];
        },
        onValuesChange: (record, recordList) => {
          setDataSource(recordList);
        },
      }}
    />
  }

  function genSessionFormProperties(showType: string) {
    return <Tabs style={{
      height: "60vh"
    }}
                 activeKey={sessionPropertyActiveKey}
                 tabBarGutter={4}
                 tabPosition={'left'}
                 onChange={(newActiveKey: string) => {
                   setSessionPropertyActiveKey(newActiveKey);
                 }}
                 items={[{
                   key: 'baseInfo',
                   label: '基本信息',
                   forceRender: true,
                   children: genSessionBaseInfo(showType)
                 }, {
                   key: 'loginScript',
                   label: '登录脚本',
                   forceRender: true,
                   children: genLoginScript()
                 }]}
    />
  }

  function calcSessionPropertyModalWidth() {
    switch (sessionPropertyActiveKey) {
      case "baseInfo":
        return '35vw'
      case 'loginScript':
        return '35vw';
      default:
        throw new Error("unexpect active key: " + sessionPropertyActiveKey);
    }
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
            setDataSource([]);
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
                  const sessionInfo = JSON.parse(res.content);
                  console.log(sessionInfo)
                  setDataSource(sessionInfo.login_script || []);
                  editForm.setFieldsValue(Object.assign({key: node.key}, sessionInfo));
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
    let srcDir = dragKey;
    if (info.dragNode.isLeaf) {
      srcDir = dragKey.substr(0, dragKey.lastIndexOf("\\"));
    }
    let dstDir = dropKey;
    if (info.dragNode.isLeaf) {
      dstDir = dropKey.substr(0, dropKey.lastIndexOf("\\"));
    }
    if (srcDir == dstDir) {
      return true;
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

  function commonSessionModalClose() {
    setSessionPropertyActiveKey(defaultSessionPropertyActiveKey);
  }

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
      width={calcSessionPropertyModalWidth()}
      maskClosable={false}
      open={editSessionModalVisiable}
      closable={false}
      onOk={() => {
        editForm.submit();
      }}
      onCancel={() => {
        setEditSessionModalVisiable(false);
        commonSessionModalClose();
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
          formInfo.login_script = dataSource || [];
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
                  {genSessionFormProperties("edit")}
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
      width={calcSessionPropertyModalWidth()}
      maskClosable={false}
      open={addSessionModalVisiable}
      closable={false}
      onOk={() => {
        form.submit();
      }}
      onCancel={() => {
        setAddSessionModalVisiable(false);
        commonSessionModalClose();
      }}
    >
      <Form
        form={form}
        onFinish={(formInfo) => {
          formInfo.login_script = dataSource || [];
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
        {genSessionFormProperties("create")}
      </Form>
    </Modal>
  </>
}

export default SessionList;

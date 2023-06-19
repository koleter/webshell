from handler.pojo.worker import Worker
import uuid


class SessionContext:
    def __init__(self, worker: Worker, xsh_conf_id, session_id):
        self.worker = worker
        self.xsh_conf_id = xsh_conf_id
        self.session_id = session_id


    def on_write(self, data):
        '''
        发送数据
        '''
        self.worker.data_to_dst.append(data)
        self.worker.on_write()


    def send_recv(self, data):
        '''
        发送数据并接收执行的结果,但是结果会有一点奇怪
        '''
        return self.worker.on_recv(data)


    def create_new_session(self, conf_id_list, callback):
        '''
        创建新的session
        conf_id_list: 一个列表,表示session配置文件的id
        '''
        req_id = str(uuid.uuid1())
        self.worker.handler.write_message({
            'requestId': req_id,
            'args': conf_id_list,
            'type': 'execMethod',
            'method': 'createNewSession'
        })
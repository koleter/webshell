from handler.const import callback_map
from handler.pojo.worker import Worker, workers
import uuid


class SessionContext:
    def __init__(self, worker: Worker, xsh_conf_id, session_id):
        self.worker = worker
        self.xsh_conf_id = xsh_conf_id
        self.session_id = session_id

    def send(self, data):
        '''
        send data
        '''
        self.worker.data_to_dst.append(data)
        self.worker.on_write()

    def send_recv(self, data):
        '''
        Send data and receive execution results, but the results will be a little strange
        '''
        return self.worker.on_recv(data)

    def create_new_session(self, conf_path_list=None, callback=None):
        '''
        create new session
        conf_path_list: A list, indicating the path of the session configuration file, if conf_id_list is None
        callback: Callback function, the parameter is the SessionContext instance object corresponding to the newly created session list
        '''
        def session_id_to_worker(session_infos):
            session_context_list = []
            for session_info in session_infos:
                session_context_list.append(SessionContext(workers[session_info['id']], session_info['filePath'], session_info['id']))
            callback(session_context_list)
        message = {
            'args': conf_path_list,
            'type': 'execMethod',
            'method': 'createNewSession'
        }
        if callback:
            req_id = str(uuid.uuid1())
            message['requestId'] = req_id
            callback_map[req_id] = session_id_to_worker
        self.worker.handler.write_message(message)

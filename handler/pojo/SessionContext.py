class SessionContext:
    def __init__(self, worker):
        self._worker = worker

    def on_recv(self, data, sleep=0.5):
        '''
        send data and receive result
        data: The command which will be execute
        sleep: The waiting time from sending the command to reading the result, in seconds
        '''
        return self._worker.on_recv(data, sleep)

    def prompt(self, msg, callback, *args):
        '''
        Pop-up window to get user input
        msg: prompt information
        callback: a callback function, it has at least two parameters, callback(ctx, user_input, *args)
        args: The User-Defined parameters of callback
        '''
        return self._worker.prompt(msg, callback, args)

    def create_new_session(self, conf_path_list=None, callback=None, *args):
        '''
        create new session
        conf_path_list: A list, indicating the path of the session configuration file, self.get_xsh_conf_id() means duplicate current session
        callback: Callback function, the parameter is the SessionContext instance object corresponding to the newly created session list
        args: The User-Defined parameters of callback
        '''
        return self._worker.create_new_session(conf_path_list, callback, args)

    def send(self, data):
        self._worker.send(data)

    def get_xsh_conf_id(self):
        return self._worker.xsh_conf_id

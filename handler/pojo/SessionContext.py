class SessionContext:
    def __init__(self, worker):
        self._worker = worker

    def on_recv(self, data, sleep=0.2):
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

    def create_new_session(self, conf_list=None, callback=None, *args):
        '''
        create new session
        conf_list: A list, Elements can be strings or objects, The element can be a string or an object.
                If it is a string type, it should be sessionId. If it is an object, the object should have two attributes: conf_id and session_name,
                 which respectively correspond to the configuration file of the created session and the created session name.
        callback: Callback function, the parameter is the SessionContext instance object corresponding to the newly created session list
        args: The User-Defined parameters of callback
        '''
        return self._worker.create_new_session(conf_list, callback, args)

    def send(self, data):
        self._worker.send(data)

    def get_xsh_conf_id(self):
        return self._worker.xsh_conf_id

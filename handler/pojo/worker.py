import logging
import traceback
import types
import uuid

import paramiko
import threading
import time

from handler.pojo.SessionContext import SessionContext
from utils import reset_font, gen_id, find_sub_str_index

try:
    import secrets
except ImportError:
    secrets = None
import tornado.websocket

from tornado.ioloop import IOLoop
from tornado.iostream import _ERRNO_CONNRESET
from tornado.util import errno_from_exception
from handler.const import BUF_SIZE, callback_map

workers = {}  # {id: worker}

# logger = logging.getLogger(__name__)
# console_fmt = "%(name)s--->%(levelname)s--->%(asctime)s--->%(message)s--->%(filename)s:%(lineno)d"
#
# logging.basicConfig(level="INFO", format=console_fmt)


def clear_worker(worker):
    assert worker.id in workers
    workers.pop(worker.id)


def recycle_worker(worker):
    if worker.handler:
        return
    logging.warning('Recycling worker {}'.format(worker.id))
    worker.close(reason='worker recycled')


class Worker(object):
    def __init__(self, loop, ssh, chan: paramiko.Channel, dst_addr, login_script=[], debug=False):
        self.loop = loop
        self.ssh = ssh
        self.chan = chan
        self.dst_addr = dst_addr
        self.fd = chan.fileno()
        self.id = gen_id()
        self.data_to_dst = []
        self.handler = None
        self.mode = IOLoop.READ
        self.closed = False
        # self.lock = threading.Lock()
        self.debug = debug
        self.xsh_conf_id = None
        self.login_script = login_script

    def __call__(self, fd, events):
        if events & IOLoop.READ:
            self._on_read()
        if events & IOLoop.WRITE:
            logging.info("{} IOLoop.WRITE".format(self.id))
            self._on_write()
        if events & IOLoop.ERROR:
            logging.info("{} IOLoop.ERROR".format(self.id))
            self.close(reason='error event occurred')


    def set_handler(self, handler):
        if not self.handler:
            logging.info("{} set handler".format(self.id))
            self.handler = handler

    def update_handler(self, mode):
        if self.mode != mode:
            self.loop.update_handler(self.fd, mode)
            self.mode = mode
        if mode == IOLoop.WRITE:
            self.loop.call_later(0.1, self, self.fd, IOLoop.WRITE)

    def _on_read(self):
        logging.debug('worker {} on read'.format(self.id))
        try:
            data = self.chan.recv(BUF_SIZE)
        except (OSError, IOError) as e:
            traceback.print_exc()
            logging.error(str(e))
            if self.chan.closed or errno_from_exception(e) in _ERRNO_CONNRESET:
                self.close(reason='chan error on reading')
        else:
            if not data:
                self.close(reason='chan closed')
                return

            val = str(data, 'utf-8')
            try:
                res = {
                    'val': val,
                    'type': 'data'
                }
                if not self.handler:
                    logging.error("{}'s handler is None".format(self.id))
                self.handler.write_message(res, binary=False)
                if self.login_script is not None and len(self.login_script) != 0 and self.login_script[0]['expect'] in val:
                    self.send(self.login_script[0]['command'] + "\r")
                    self.login_script = self.login_script[1:]

            except tornado.websocket.WebSocketClosedError:
                self.close(reason='websocket closed')


    def on_recv(self, data, sleep=0.3):
        logging.info('worker {} on read'.format(self.id))
        newline = data[-1]
        data = data[:-1]

        self.data_to_dst.append(data)
        self._on_write()
        self._on_read()

        self.data_to_dst.append(newline)
        self._on_write()
        time.sleep(sleep)

        data = b""
        try:
            data += self.chan.recv(BUF_SIZE)
        except (OSError, IOError) as e:
            traceback.print_exc()
            if self.chan.closed or errno_from_exception(e) in _ERRNO_CONNRESET:
                self.close(reason='chan error on reading')
                return

        if not data:
            self.close(reason='chan closed')
            return

        val = str(data, 'utf-8')
        try:
            res = {
                'val': val,
                'type': 'data'
            }
            self.handler.write_message(res, binary=False)
        except tornado.websocket.WebSocketClosedError:
            self.close(reason='websocket closed')
        i = find_sub_str_index(val, "\n", 3)
        val = val[i+1:]
        handler_str = reset_font(val)
        return str(handler_str)


    def send(self, data, update_handler=True):
        self.data_to_dst.append(data)
        self._on_write(update_handler)

    def _on_write(self, update_handler=True):
        logging.debug('worker {} on write'.format(self.id))
        if not self.data_to_dst:
            return

        data = ''.join(self.data_to_dst)
        logging.debug('{!r} to {}:{}'.format(data, *self.dst_addr))

        try:
            sent = self.chan.send(data)
        except (OSError, IOError) as e:
            logging.error(e)
            if self.chan.closed or errno_from_exception(e) in _ERRNO_CONNRESET:
                self.close(reason='chan error on writing')
            else:
                self.update_handler(IOLoop.WRITE)
        else:
            self.data_to_dst = []
            data = data[sent:]
            if data:
                self.data_to_dst.append(data)
                self.update_handler(IOLoop.WRITE)
            elif update_handler:
                self.update_handler(IOLoop.READ)

    def prompt(self, msg, callback, args):
        '''
        Pop-up window to get user input
        msg: prompt information
        args: The parameters of callback
        callback: a callback function, the result of user input will be a parameter of callback, it has two args, callback(worker, args)
        '''
        message = {
            'arg': msg,
            'type': 'eval',
            'method': 'prompt'
        }
        if callback:
            self.set_callback_message(callback, message, args)
        self.handler.write_message(message)

    def set_callback_message(self, callback, message, args):
        if type(callback) != types.FunctionType:
            raise Exception("callback must be a function")
        req_id = str(uuid.uuid1())
        message['requestId'] = req_id
        callback_map[req_id] = (callback, args)
        def delete_callback():
            callback_map.pop(req_id, None)
        threading.Timer(30, delete_callback).start()

    def create_new_session(self, conf_path_list, callback, args):
        '''
        create new session
        conf_path_list: A list, indicating the path of the session configuration file, self.xsh_conf_id means duplicate current session
        callback: Callback function, the parameter is the SessionContext instance object corresponding to the newly created session list
        '''
        if not conf_path_list:
            logging.info("conf_path_list is None, do notihing")
            return

        message = {
            'args': conf_path_list,
            'type': 'execMethod',
            'method': 'createNewSession'
        }
        if callback:
            self.set_callback_message(self._init_callback_worker_list(callback), message, args)
        self.handler.write_message(message)

    def _init_callback_worker(self, callback):
        def warp(ctx, args):
            callback(ctx, args)

        return warp

    def _init_callback_worker_list(self, callback):
        def warp(ctx, session_infos, *args):
            context_list = []
            for session_info in session_infos:
                context_list.append(SessionContext(workers[session_info['id']]))
            callback(ctx, context_list, *args)

        return warp

    def close(self, reason=None):
        if self.closed:
            return
        self.closed = True

        logging.info(
            'Closing worker {} with reason: {}'.format(self.id, reason)
        )
        if self.handler:
            self.loop.remove_handler(self.fd)
            self.handler.close(reason=reason)
        self.chan.close()
        self.ssh.close()
        logging.info('Connection to {}:{} lost'.format(*self.dst_addr))


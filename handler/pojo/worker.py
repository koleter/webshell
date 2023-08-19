import logging
import traceback
import types
import uuid
import weakref

import paramiko
import threading
import time

from utils import reset_font, gen_id

try:
    import secrets
except ImportError:
    secrets = None
import tornado.websocket

from tornado.ioloop import IOLoop
from tornado.iostream import _ERRNO_CONNRESET
from tornado.util import errno_from_exception
from handler.const import BUF_SIZE, callback_map

workers = weakref.WeakValueDictionary()  # {id: worker}

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
    worker._close(reason='worker recycled')


class Worker(object):
    def __init__(self, loop, ssh, chan: paramiko.Channel, dst_addr, debug=False):
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
        self.lock = threading.Lock()
        self.debug = debug
        self.xsh_conf_id = None

    def __call__(self, fd, events):
        if events & IOLoop.READ:
            self._on_read()
        if events & IOLoop.WRITE:
            self._on_write()
        if events & IOLoop.ERROR:
            self._close(reason='error event occurred')


    def set_handler(self, handler):
        if not self.handler:
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
            logging.error(e)
            if self.chan.closed or errno_from_exception(e) in _ERRNO_CONNRESET:
                self._close(reason='chan error on reading')
        else:
            if not data:
                self._close(reason='chan closed')
                return

            val = str(data, 'utf-8')
            try:
                res = {
                    'val': val,
                    'type': 'data'
                }
                self.handler.write_message(res, binary=False)
            except tornado.websocket.WebSocketClosedError:
                self._close(reason='websocket closed')


    def on_recv(self, data, sleep=0.5):
        logging.debug('worker {} on read'.format(self.id))
        newline = data[-1]
        data = data[:-1]
        self.data_to_dst.append(data)
        self._on_write()
        time.sleep(0.5)
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
                self._close(reason='chan error on reading')
        else:
            if not data:
                self._close(reason='chan closed')
                return

            val = str(data, 'utf-8')
            try:
                res = {
                    'val': val,
                    'type': 'data'
                }
                self.handler.write_message(res, binary=False)
            except tornado.websocket.WebSocketClosedError:
                self._close(reason='websocket closed')
            handler_str = reset_font(val)
            return str(handler_str)


    def send(self, data):
        self.data_to_dst.append(data)
        self._on_write()

    def _on_write(self):
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
                self._close(reason='chan error on writing')
            else:
                self.update_handler(IOLoop.WRITE)
        else:
            self.data_to_dst = []
            data = data[sent:]
            if data:
                self.data_to_dst.append(data)
                self.update_handler(IOLoop.WRITE)
            else:
                self.update_handler(IOLoop.READ)

    def prompt(self, msg, callback):
        '''
        Pop-up window to get user input
        msg: prompt information
        callback: a callback function, the result of user input will be a parameter of callback, it has two args, callback(worker, args)
        '''
        message = {
            'arg': msg,
            'type': 'eval',
            'method': 'prompt'
        }
        if callback:
            if type(callback) != types.FunctionType:
                raise Exception("callback must be a function")
            req_id = str(uuid.uuid1())
            message['requestId'] = req_id
            callback_map[req_id] = callback
        self.handler.write_message(message)

    def create_new_session(self, conf_path_list=None, callback=None):
        '''
        create new session
        conf_path_list: A list, indicating the path of the session configuration file, self.xsh_conf_id means duplicate current session
        callback: Callback function, the parameter is the SessionContext instance object corresponding to the newly created session list
        '''

        message = {
            'args': conf_path_list,
            'type': 'execMethod',
            'method': 'createNewSession'
        }
        if callback:
            req_id = str(uuid.uuid1())
            message['requestId'] = req_id
            callback_map[req_id] = self._init_callback_worker_list(callback)
        self.handler.write_message(message)

    def _init_callback_worker(self, callback):
        def warp(worker, args):
            callback(worker, args)

        return warp

    def _init_callback_worker_list(self, callback):
        def warp(session_infos):
            worker_list = []
            for session_info in session_infos:
                worker_list.append(
                    workers[session_info['id']])
            callback(worker_list)

        return warp

    def _close(self, reason=None):
        if self.closed:
            return
        self.closed = True

        logging.info(
            'Closing worker {} with reason: {}'.format(self.id, reason)
        )
        if self.handler:
            self.loop.remove_handler(self.fd)
            self.handler._close(reason=reason)
        self.chan.close()
        self.ssh._close()
        logging.info('Connection to {}:{} lost'.format(*self.dst_addr))


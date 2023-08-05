import logging
import traceback
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
from handler.const import BUF_SIZE


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
    worker.close(reason='worker recycled')


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

    def __call__(self, fd, events):
        if events & IOLoop.READ:
            self.on_read()
        if events & IOLoop.WRITE:
            self.on_write()
        if events & IOLoop.ERROR:
            self.close(reason='error event occurred')


    def set_handler(self, handler):
        if not self.handler:
            self.handler = handler

    def update_handler(self, mode):
        if self.mode != mode:
            self.loop.update_handler(self.fd, mode)
            self.mode = mode
        if mode == IOLoop.WRITE:
            self.loop.call_later(0.1, self, self.fd, IOLoop.WRITE)

    def on_read(self):
        logging.debug('worker {} on read'.format(self.id))
        try:
            data = self.chan.recv(BUF_SIZE)
        except (OSError, IOError) as e:
            logging.error(e)
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
                self.handler.write_message(res, binary=False)
            except tornado.websocket.WebSocketClosedError:
                self.close(reason='websocket closed')


    def on_recv(self, data, sleep=0.5):
        # time.sleep(5)
        logging.debug('worker {} on read'.format(self.id))
        newline = data[-1]
        data = data[:-1]
        self.data_to_dst.append(data)
        self.on_write()
        time.sleep(0.5)
        self.on_read()

        self.data_to_dst.append(newline)
        self.on_write()
        time.sleep(sleep)

        data = b""
        try:
            data += self.chan.recv(BUF_SIZE)
        except (OSError, IOError) as e:
            traceback.print_exc()
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
                self.handler.write_message(res, binary=False)
            except tornado.websocket.WebSocketClosedError:
                self.close(reason='websocket closed')
            handler_str = reset_font(val)
            return str(handler_str)


    def on_write(self):
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
            else:
                self.update_handler(IOLoop.READ)

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


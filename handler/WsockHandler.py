import imp
import json
import logging
import struct
import time
import paramiko
import tornado.web

from tornado.ioloop import IOLoop

from exception.InvalidValueError import InvalidValueError
from handler.MixinHandler import MixinHandler
from handler.pojo.session_context import SessionContext
from utils import (
    UnicodeType
)
from handler.pojo.worker import clients

try:
    from json.decoder import JSONDecodeError
except ImportError:
    JSONDecodeError = ValueError


class WsockHandler(MixinHandler, tornado.websocket.WebSocketHandler):

    def initialize(self, loop):
        super(WsockHandler, self).initialize(loop)
        self.worker_ref = None

    def open(self):
        self.src_addr = self.get_client_addr()
        logging.info('Connected from {}:{}'.format(*self.src_addr))

        workers = clients.get(self.src_addr[0])
        if not workers:
            self.close(reason='Websocket authentication failed.')
            return

        try:
            worker_id = self.get_value('id')
        except (tornado.web.MissingArgumentError, InvalidValueError) as exc:
            self.close(reason=str(exc))
        else:
            worker = workers.get(worker_id)
            if worker:
                workers[worker_id] = None
                self.set_nodelay(True)
                worker.set_handler(self)
                self.worker_ref = worker
                self.loop.add_handler(worker.fd, worker, IOLoop.READ)
            else:
                self.close(reason='Websocket authentication failed.')

    def on_message(self, message):
        logging.debug('{!r} from {}:{}'.format(message, *self.src_addr))
        worker = self.worker_ref
        if not worker:
            # The worker has likely been closed. Do not process.
            logging.debug(
                "received message to closed worker from {}:{}".format(
                    *self.src_addr
                )
            )
            self.close(reason='No worker found')
            return

        if worker.closed:
            self.close(reason='Worker closed')
            return

        try:
            msg = json.loads(message)
        except JSONDecodeError:
            return

        if not isinstance(msg, dict):
            return

        type = msg.get('type')
        if type == 'resize':
            resize = msg.get('resize')
            if resize and len(resize) == 2:
                try:
                    worker.chan.resize_pty(*resize)
                except (TypeError, struct.error, paramiko.SSHException):
                    pass
        elif type == 'data':
            data = msg.get('data')
            if data and isinstance(data, UnicodeType):
                worker.data_to_dst.append(data)
                worker.on_write()
        elif type == 'sendRecv':
            data = msg.get('data')
            requestId = msg.get('requestId')

            recv = worker.on_recv(data)

            worker.handler.write_message({
                'requestId': requestId,
                'val': recv,
                'type': 'response'
            }, binary=False)
        elif type == 'exec':
            path = msg.get('path')
            session_id = msg.get('sessionId')
            xsh_conf_id = msg.get('xshConfId')

            sc = SessionContext(self, xsh_conf_id, session_id)
            try:
                module = imp.load_source(path, path)
                module.Main(sc)
                worker.handler.write_message({
                    'type': 'message',
                    'status': 'ok'
                })
            except Exception as e:
                worker.handler.write_message({
                    'type': 'message',
                    'status': 'error',
                    "msg": e
                })

    def on_close(self):
        logging.info('Disconnected from {}:{}'.format(*self.src_addr))
        if not self.close_reason:
            self.close_reason = 'client disconnected'

        worker = self.worker_ref if self.worker_ref else None
        if worker:
            worker.close(reason=self.close_reason)


import imp
import json
import os

import tornado.web
from handler.MixinHandler import MixinHandler
from settings import base_dir


conf_dir_path = os.path.join(base_dir, 'conf')
xsh_dir_path = os.path.join(base_dir, 'xsh')
script_dir_path = os.path.join(conf_dir_path, 'script')
common_script_dir_path = os.path.join(script_dir_path, 'common')


class ConfigHandler(MixinHandler, tornado.web.RequestHandler):
    def initialize(self, loop):
        super(ConfigHandler, self).initialize(loop)
        self.script = None


    def post(self):
        try:
            data = json.loads(self.request.body)
            module = imp.load_source("main_module", data.path)
            module.Main()
        except Exception as e:
            self.write({
                'status': 'error',
                'msg': e
            })


import json
import logging
import os

from handler.pojo.BaseConfig import BaseConfig

class GlobalAutoConfig(BaseConfig):

    def __init__(self, path):
        super().__init__(path)
        self.path = os.path.join(self.path, "autoConf.json")
        self.conf_cache = dict({
            "xshListWindowWidth": 250
        })
        try:
            with open(self.path, 'r') as f:
                data = json.loads(f.read())
                self._update_conf(data)
        except Exception as e:
            logging.error(str(e))


    def _update_conf(self, args):
        for item in args.items():
            self.conf_cache[item[0]] = item[1]

    def get(self):
        with self.lock:
            return {
                'status': 'success',
                'data': self.conf_cache
            }

    def post(self, args):
        with self.lock:
            self._update_conf(args)
            with open(self.path, 'w') as f:
                f.write(json.dumps(self.conf_cache))
        return {
            'status': 'success'
        }

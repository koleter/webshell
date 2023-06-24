import json
import os
import shutil

from handler.pojo.BaseConfig import BaseConfig
from handler.pojo.status import status_success, status_error


class SessionConfig(BaseConfig):
    def _file_listdir_dfs(self, parent_item, dir):
        for file in os.listdir(self._get_real_path(dir)):
            if not parent_item.get('children'):
                parent_item.setdefault('children', [])
            fake_file_path = os.path.join(dir, file)
            if os.path.isdir(self._get_real_path(fake_file_path)):
                file_item = {
                    'title': file,
                    'key': fake_file_path,
                    'isLeaf': False
                }
                self._file_listdir_dfs(file_item, fake_file_path)
                parent_item.get('children').append(file_item)
            else:
                with open(self._get_real_path(fake_file_path), 'r') as f:
                    data = json.loads(f.read())
                parent_item.get('children').append({
                    'title': data['sessionName'],
                    'key': fake_file_path,
                    'isLeaf': True
                })

    def get(self):
        default_root_dir = {
            'title': "默认文件夹",
            'key': '',
            'isLeaf': False
        }
        if os.path.exists(self.path):
            self._file_listdir_dfs(default_root_dir, '')
        return {
            'status': 'success',
            'defaultTreeData': [default_root_dir]
        }

    def post(self, args):
        type = args['type']
        if type == 'editSession':
            session_info = args['sessionInfo']
            src = self._get_real_path(args['src'])
            with open(src, 'w') as f:
                f.write(json.dumps(session_info))
            return status_success('opration success')
        return super().post(args)
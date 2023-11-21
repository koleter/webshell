import json
import os
import re
import shutil

from handler.pojo.BaseConfig import BaseConfig
from handler.pojo.status import status_success, status_error
from utils import gen_id


class SessionConfig(BaseConfig):
    def _file_listdir_dfs(self, parent_item, dir):
        for file in os.listdir(self._get_real_path(dir)):
            if not parent_item.get('children'):
                parent_item.setdefault('children', [])
            relative_file_path = os.path.join(dir, file)
            if os.path.isdir(self._get_real_path(relative_file_path)):
                file_item = {
                    'title': file,
                    'key': relative_file_path,
                    'isLeaf': False
                }
                self._file_listdir_dfs(file_item, relative_file_path)
                parent_item.get('children').append(file_item)
            else:
                with open(self._get_real_path(relative_file_path), 'r') as f:
                    data = json.loads(f.read())
                parent_item.get('children').append({
                    'title': data['sessionName'],
                    'key': relative_file_path,
                    'isLeaf': True
                })
        def sort(item):
            return (1 if item['isLeaf'] else -1, item['title'])

        if parent_item.get('children') is not None:
            parent_item.get('children').sort(key=sort)

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
        elif type == 'duplicateSession':
            origin_file = os.path.join(self.path, args['path'])
            with open(origin_file, 'r') as f:
                data = json.loads(f.read())
            data['sessionName'] += ' - 副本'
            new_file_path = os.path.join(os.path.dirname(origin_file), gen_id())
            with open(new_file_path, 'w') as f:
                f.write(json.dumps(data))
            return status_success('opration success')

        return super().post(args)

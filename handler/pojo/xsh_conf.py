import os


class XshConfig:
    def __init__(self, path):
        self.path = path
        if not os.path.exists(path):
            os.mkdir(path)


    def dfs(self, parent_path, result):
        file_list = os.listdir(parent_path)
        for f in file_list:
            file_path = os.path.join(self.path, f)
            if os.path.isfile(file_path):
                os.remove(file_path)
            elif os.path.isdir(file_path):

    def get(self):
        result = []
        if os.listdir(self.path):
            file_list = os.listdir(self.path)
            for f in file_list:
                file_path = os.path.join(self.path, f)
                if os.path.isfile(file_path):
                    os.remove(file_path)
                elif os.path.isdir(file_path):





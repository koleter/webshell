export const scriptDataSource = localStorage.getItem("scriptData") && JSON.parse( localStorage.getItem("scriptData")) || [];

export const SESSION_CONF_INFO_MAP = "sessionConfInfoMap";

export const defaultTreeData = (JSON.parse(localStorage.getItem("session"))?.length && JSON.parse(localStorage.getItem("session"))) || [{
  title: '默认文件夹',
  key: 'root',
  isLeaf: false
}];

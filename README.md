## WebShell


### Introduction

用作 ssh 客户端以连接到 ssh 服务器的一个 Web 应用程序

在以往的工作中接触到了很多的ssh客户端工具,finalShell,xshell,MobaxTerm等,xshell的脚本功能在某些
情况下节省了我不少的时间,但是xshell的脚本可以做的事情也比较有限,存在如下一些问题:
1. 使用不便,比如想要使用一个非系统模块requests去发送一个网络请求,首先就要先安装该模块,xshell的python
是自带的,并不是用户自己指定的python,故无法实现上面的操作且百度无果,没有找到好的解决方案
2. 可以创建新的会话,但是创建出来的会话用户不可控,你无法在脚本中控制新创建的会话比如向其发送某些命令
3. 可以发送命令但是无法接收命令执行后的返回结果(该项目可以做到这一点,但是由于技术原因,获取的结果会有点奇怪)

网上找了一些ssh客户端工具,发现基本都没有脚本功能,之后在github上找到了一个webssh的项目(感谢大佬),在此基础上自己尝试着
做了这么一个工具出来

该项目运用了tornado,websocket,antd,xterm这些技术

### Preview

![webshell.jpg](preview/webshell.jpg)

### script
鼠标移动到窗口的最右侧可弹出脚本窗口
![script.jpg](preview%2Fscript.jpg)

点击添加按钮显示如下界面

![addScript.jpg](preview%2FaddScript.jpg)

脚本名是显示在界面上的按钮名字,python文件路径为一个python文件的绝对路径,
一个脚本按钮的类型分为两种,公共表示所有的会话都可以使用该按钮,当前会话表示只有当前的会话可以使用的按钮(
其他的会话处于活跃状态时无法看到该按钮)

python脚本的入口为Main函数,接受一个形参,该参数为handler.pojo.session_context.SessionContext类的一个实例对象,
可以认为是代表了当前会话的一个对象,可用的接口可以参考该类的定义

For example:

```python
def Main(ctx):
    ctx.send('pwd\r')
```
该脚本在运行时会向当前的会话发送pwd命令

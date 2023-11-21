import { createContext, useState } from 'react';

//根据定义创建Context
export const AppContext = createContext(null);
//定义ContextProvider，children是组件
export function AppContextProvider(props: {children: React.ReactNode | React.ReactNode[]}) {
    //调用useState创建state
    const [dataInfo, setDataInfo] = useState({ activeKey: '1' ,
        tabItems: [{ label: '首页', children: '首页页签内容', key: '1', closable: false }]});
    return (
        <AppContext.Provider value={{dataInfo, setDataInfo}}>{/** value就是可在<AppContextProvider>组件的子组件中使用useContext() hook函数所获取的对象 */}
            {props.children}
        </AppContext.Provider>
    );
}

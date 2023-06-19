export default [
  {
    name: 'session',
    icon: 'table',
    path: '/session',
    component: './Session',
    menuRender: false
  },
  {
    path: '/',
    redirect: '/session',
  },
  {
    component: './404',
  },
];

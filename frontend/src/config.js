// 获取当前主机名
const hostname = window.location.hostname;
// 根据环境设置后端API地址
export const API_BASE_URL = `http://${hostname}:8000`; 
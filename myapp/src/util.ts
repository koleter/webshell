import {sessionConfInfoMap} from "@/pages/Session";

export default {
  baseUrl: "http://localhost:8888/"
}

export function sleep(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

export const msgMap = {};

export function getUUid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0,
      v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

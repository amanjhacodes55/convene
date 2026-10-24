/** Meeting codes look like "kfa-wqpz-tnu". Shared by the server and the browser. */
export const isCode = (s: string) => /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(s);

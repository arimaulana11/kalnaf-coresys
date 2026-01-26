export const serializeDate = (obj: any) => {
  return JSON.parse(JSON.stringify(obj));
};
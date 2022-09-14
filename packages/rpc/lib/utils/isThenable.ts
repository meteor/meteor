export const isThenable = (promise: any): promise is Promise<any> => {
    return promise && typeof promise.then === 'function';
}

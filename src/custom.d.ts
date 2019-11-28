declare module 'gtfs-realtime-bindings' {
  var transit_realtime: any;
  export = transit_realtime;
}

declare module 'aws4fetch' {
  export class AwsClient {
    constructor(params: any);
    public fetch(url: any, params: any): Promise<Response>;
  }
}

declare module 'pigeon' {
  export function init(opts: any): void;
  export function captureException(err: any): void;
}
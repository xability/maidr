export class APIHandler {
  static BASE_URL = 'https://maidr-service.azurewebsites.net/api/';
  static SUFFIX =
    '?code=I8Aa2PlPspjQ8Hks0QzGyszP8_i2-XJ3bq7Xh8-ykEe4AzFuYn_QWA%3D%3D';

  static headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  static async get(enpoint: string) {
    return fetch(APIHandler.BASE_URL + enpoint + APIHandler.SUFFIX, {
      method: 'GET',
      headers: APIHandler.headers,
    });
  }

  static async post(enpoint: string, body: BodyInit) {
    return fetch(APIHandler.BASE_URL + enpoint + APIHandler.SUFFIX, {
      method: 'POST',
      headers: APIHandler.headers,
      body: body,
    });
  }

  static setHeaders(headers: Record<string, string>) {
    APIHandler.headers = {...APIHandler.headers, ...headers};
  }
}

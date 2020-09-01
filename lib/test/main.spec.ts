jest.mock("msal");
jest.mock("axios");

import axios from "axios";
import { cloneDeep } from "lodash";
import { AuthenticationParameters, UserAgentApplication } from "msal";
import { mocked } from "ts-jest/dist/util/testing";
import winston from "winston";
import { Config } from "../plugin";
import { MSAL } from "../src/main";
import {
  AuthResponse,
  ErrorCode,
  Query,
  QueryOptions,
  QueryResponse,
} from "../src/types";

const logger = (): winston.Logger =>
  winston.createLogger({
    silent: true,
  });

const baseConfig: Config = {
  auth: {
    clientId: "1ced1w79-a343-4d56c-b444-411ed438da2f",
    requireAuthOnInitialize: false,
  },
  query: {
    parameters: {
      scopes: ["user.read"],
    },
    baseUrl: "https://graph.microsoft.com/v1.0",
  },
};
// Allows to edit the config object since its a clone of baseConfig and is reset before each test
let config = cloneDeep(baseConfig);
// Since msal module is mocked, it is preferable to create a copy
// of the AuthError class defined by msal
class AuthError extends Error {
  errorCode: string;
  errorMessage: string;

  constructor(errorCode: string, errorMessage = "") {
    super();

    this.errorCode = errorCode;
    this.errorMessage = errorMessage;
  }
}
const defaultTokenValue = "token";
const defaultUserAgentApplicationMock = {
  // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
  loginRedirect: (_: AuthenticationParameters | undefined): void => {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
  logout: (_?: string | undefined): void => {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isCallback: (_: string): boolean => false,
  getAccount: (): Account => ({
    displayName: "displayName",
    id: "id",
    rpDisplayName: "rpDisplayName",
  }),
  acquireTokenSilent: async (): Promise<AuthResponse> =>
    new Promise((resolve) => {
      resolve({
        accessToken: defaultTokenValue,
        expiresOn: new Date("9999-12-31"), // Makes sure the token timeout is never hit unintentionally
        scopes: [] as Array<string>,
      } as AuthResponse);
    }),
  // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
  acquireTokenRedirect: (_: AuthenticationParameters): void => {},
};
const defaultAxiosResponse: QueryResponse = {
  data: { test: 123 },
  status: 200,
  statusText: "OK",
  config: {},
  headers: {},
};

beforeEach(() => {
  // Mock the implementation of MSAL's UserAgentApplication class
  (UserAgentApplication as jest.Mock).mockImplementation(
    () => defaultUserAgentApplicationMock
  );
  // Mock axios request implementation to resolve a mocked response
  mocked(axios.request).mockResolvedValue(defaultAxiosResponse);

  // Reset the MSAL config object with the baseConfig
  config = cloneDeep(baseConfig);
  config.logger = logger();
});

describe(MSAL.name, () => {
  describe("initialization", () => {
    it("should not throw any error with basic config", () => {
      try {
        new MSAL(config);
      } catch (e) {
        fail(e);
      }
    });

    it("should call login when auth.requireAuthOnInitialize is set to true", () => {
      config.auth.requireAuthOnInitialize = true;
      const spy = jest.spyOn(MSAL.prototype, "login");

      new MSAL(config);

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("should call getAccount if the user is authenticated", () => {
      config.auth.requireAuthOnInitialize = true;
      const spy = jest.spyOn(defaultUserAgentApplicationMock, "getAccount");

      new MSAL(config);

      // We just want to make sure it has been called at least once
      // since it may be called by the lib (msal) itself
      expect(spy).toHaveBeenCalled();
    });
  });

  describe("login", () => {
    it("should call lib.loginRedirect if the user is not already authenticated", () => {
      const spy = jest.spyOn(defaultUserAgentApplicationMock, "loginRedirect");

      // If isCallback returns true then we can assume the user is not authenticated
      (UserAgentApplication as jest.Mock).mockImplementationOnce(() => ({
        ...defaultUserAgentApplicationMock,
        isCallback: (): boolean => true,
      }));

      const msal = new MSAL(config);
      msal.login();

      expect(spy).toHaveBeenCalledTimes(1);
      // should call lib.loginRedirect with query.parameters
      expect(spy).toHaveBeenCalledWith(config.query?.parameters);
    });

    it("should not call lib.loginRedirect if the user is already authenticated", () => {
      const spy = jest.spyOn(defaultUserAgentApplicationMock, "loginRedirect");

      const msal = new MSAL(config);
      msal.login();

      expect(spy).not.toHaveBeenCalled();
    });

    it("should throw an error if the clientId is not set", () => {
      const invalidConfig = Object.assign({}, config);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (invalidConfig.auth.clientId as any) = null;

      expect(() => new MSAL(invalidConfig)).toThrowError();
    });
  });

  describe("logout", () => {
    it("should call lib.logout if the user is authenticated", () => {
      const spy = jest.spyOn(defaultUserAgentApplicationMock, "logout");

      const msal = new MSAL(config);
      msal.logout();

      expect(spy).toHaveBeenCalledTimes(1);
      // should call lib.logout without any parameter
      expect(spy).toHaveBeenCalledWith();
    });

    it("should not call lib.logout if the user is not authenticated", () => {
      const spy = jest.spyOn(defaultUserAgentApplicationMock, "logout");

      // If isCallback returns true then we can assume the user is not authenticated
      (UserAgentApplication as jest.Mock).mockImplementationOnce(() => ({
        ...defaultUserAgentApplicationMock,
        isCallback: (): boolean => true,
      }));

      const msal = new MSAL(config);
      msal.logout();

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("isAuthenticated", () => {
    it("should return false if the current location is a callback", () => {
      const spy = jest.spyOn(defaultUserAgentApplicationMock, "getAccount");

      // If isCallback returns true then we can assume the user is not authenticated
      (UserAgentApplication as jest.Mock).mockImplementationOnce(() => ({
        ...defaultUserAgentApplicationMock,
        isCallback: (): boolean => true,
      }));

      const msal = new MSAL(config);

      expect(msal.isAuthenticated()).toEqual(false);
      expect(spy).not.toHaveBeenCalled();
    });

    it("should return false if the current user's information are empty", () => {
      const spy = jest.spyOn(defaultUserAgentApplicationMock, "isCallback");

      // If isCallback returns true then we can assume the user is not authenticated
      (UserAgentApplication as jest.Mock).mockImplementationOnce(() => ({
        ...defaultUserAgentApplicationMock,
        getAccount: (): Account => ({} as Account),
      }));

      const msal = new MSAL(config);

      expect(msal.isAuthenticated()).toEqual(false);
      // Once during initialization, once with the call to isAuthenticated above
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it("should return true when the current location is not a callback and the current user's information are not empty", () => {
      const msal = new MSAL(config);

      expect(msal.isAuthenticated()).toEqual(true);
    });
  });

  describe("query", () => {
    it("should query the endpoint and return the response", async () => {
      const spyAcquireToken = jest.spyOn(
        defaultUserAgentApplicationMock,
        "acquireTokenSilent"
      );
      const spyAxios = jest.spyOn(axios, "request");

      const msal = new MSAL(config);

      const endpoint: Query = { url: "http://www.url.com" };

      expect(await msal.query(endpoint)).toEqual(defaultAxiosResponse);
      expect(spyAcquireToken).toHaveBeenCalledTimes(1);
      expect(spyAxios).toHaveBeenCalledTimes(1);
    });

    it("should query the endpoint, return the response and store the result into data.query", async () => {
      const spyAcquireToken = jest.spyOn(
        defaultUserAgentApplicationMock,
        "acquireTokenSilent"
      );
      const spyAxios = jest.spyOn(axios, "request");

      const msal = new MSAL(config);

      const endpoint: Query = { url: "http://www.url.com", id: "test" };

      expect(await msal.query(endpoint)).toEqual(defaultAxiosResponse);
      expect(msal.data.query.test).toEqual(defaultAxiosResponse.data);
      expect(spyAcquireToken).toHaveBeenCalledTimes(1);
      expect(spyAxios).toHaveBeenCalledTimes(1);
    });
  });

  describe("executeQuery", () => {
    it("should execute the query and return the response", async () => {
      const spy = jest.spyOn(axios, "request");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msal: any = new MSAL(config);

      const endpoint: Query = { url: "http://www.url.com" };
      // Mock the options added by executeQuery
      const options: QueryOptions = {
        headers: {
          Authorization: "Bearer ", // The accessToken is empty which explains the space
        },
      };

      expect(await msal.executeQuery(endpoint, options)).toEqual(
        defaultAxiosResponse
      );
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(msal.createQuery(endpoint, options));
    });

    it("should convert the endpoint path into an URL, execute the query and return the response", async () => {
      const spy = jest.spyOn(axios, "request");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msal: any = new MSAL(config);

      const endpointPath = "/a/random/path";
      const endpointURL = `${config.query?.baseUrl}${endpointPath}`;
      // Mock the options added by executeQuery
      const options: QueryOptions = {
        headers: {
          Authorization: "Bearer ", // The accessToken is empty which explains the space
        },
      };

      expect(await msal.executeQuery(endpointPath, options)).toEqual(
        defaultAxiosResponse
      );
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(msal.createQuery(endpointURL, options));
    });

    it("should override the Authorization header, execute the query and return the response", async () => {
      const spy = jest.spyOn(axios, "request");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msal: any = new MSAL(config);

      const endpoint: Query = { url: "http://www.url.com" };
      // Mock the options added by executeQuery
      const options: QueryOptions = {
        headers: {
          Authorization: "Bearer ", // The accessToken is empty which explains the space
        },
      };
      const invalidOptions: QueryOptions = {
        headers: {
          Authorization: "Bearer my-token",
        },
      };

      expect(await msal.executeQuery(endpoint, invalidOptions)).toEqual(
        defaultAxiosResponse
      );
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(msal.createQuery(endpoint, options));
    });

    it("should throw an error when the request fails", async () => {
      mocked(axios.request).mockRejectedValue(new Error());
      const spy = jest.spyOn(axios, "request");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msal: any = new MSAL(config);

      const endpoint: Query = { url: "http://www.url.com" };
      const options: QueryOptions = {};

      await expect(msal.executeQuery(endpoint, options)).rejects.toThrow();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("should call the logger when the request fails", async () => {
      if (config.logger !== undefined) {
        mocked(axios.request).mockRejectedValue(new Error());
        const spy = jest.spyOn(config.logger, "log");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const msal: any = new MSAL(config);

        const endpoint: Query = { url: "http://www.url.com" };
        const options: QueryOptions = {};

        await expect(msal.executeQuery(endpoint, options)).rejects.toThrow();
        expect(spy).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe("createQuery", () => {
    it("should return the query made of the endpoint URL and the options", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msal: any = new MSAL(config);

      const endpoint: Query = { url: "an.url.com" };
      const options: QueryOptions = {
        method: "GET",
        responseType: "json",
        data: {},
        headers: {
          "Content-Type": "json",
        },
      };

      expect(msal.createQuery(endpoint, options)).toEqual({
        ...options,
        url: endpoint.url,
      });
    });

    it("should transform the string endpoint into a Query", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msal: any = new MSAL(config);

      const endpoint = "an.url.com";
      const endpointQuery: Query = { url: endpoint };
      const options: QueryOptions = {};

      // Either way should result to the same query
      expect(msal.createQuery(endpoint, options)).toEqual(
        msal.createQuery(endpointQuery, options)
      );
    });

    it("should throw an error if the URL is empty", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msal: any = new MSAL(config);

      const endpoint = "";
      const endpointQuery: Query = { url: endpoint };
      const options: QueryOptions = {};

      // Either way should throw an error
      expect(() => msal.createQuery(endpoint, options)).toThrow();
      expect(() => msal.createQuery(endpointQuery, options)).toThrow();
    });
  });

  describe("acquireToken", () => {
    it("should return the token if the request is successful", async () => {
      const spy = jest.spyOn(
        defaultUserAgentApplicationMock,
        "acquireTokenSilent"
      );

      // If isCallback returns true then we can assume the user is not authenticated
      (UserAgentApplication as jest.Mock).mockImplementationOnce(() => ({
        ...defaultUserAgentApplicationMock,
        // This makes sure acquireToken is not called on initialization
        isCallback: (): boolean => true,
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msal: any = new MSAL(config);
      const token = await msal.acquireToken();

      expect(token).toEqual("token");
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(config.query?.parameters);
    });

    it("should return an empty string if the request fails", async () => {
      const spy = jest
        .spyOn(defaultUserAgentApplicationMock, "acquireTokenSilent")
        .mockRejectedValueOnce(new Error());

      // If isCallback returns true then we can assume the user is not authenticated
      (UserAgentApplication as jest.Mock).mockImplementationOnce(() => ({
        ...defaultUserAgentApplicationMock,
        // This makes sure acquireToken is not called on initialization
        isCallback: (): boolean => true,
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msal: any = new MSAL(config);
      const token = await msal.acquireToken();

      expect(token).toEqual("");
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(config.query?.parameters);
    });

    it("should call acquireTokenRedirect if the request fails and interaction is required by the user", async () => {
      jest
        .spyOn(defaultUserAgentApplicationMock, "acquireTokenSilent")
        .mockRejectedValueOnce(new AuthError(ErrorCode.ConsentRequired));

      const spy = jest.spyOn(
        defaultUserAgentApplicationMock,
        "acquireTokenRedirect"
      );

      // If isCallback returns true then we can assume the user is not authenticated
      (UserAgentApplication as jest.Mock).mockImplementationOnce(() => ({
        ...defaultUserAgentApplicationMock,
        // This makes sure acquireToken is not called on initialization
        isCallback: (): boolean => true,
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msal: any = new MSAL(config);
      const token = await msal.acquireToken();

      expect(token).toEqual("");
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(config.query?.parameters);
    });
  });

  describe("requiresInteraction", () => {
    it("should return true if the errorCode is of type ErrorCode", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msal: any = new MSAL(config);

      expect(msal.requiresInteraction(ErrorCode.ConsentRequired)).toEqual(true);
      expect(msal.requiresInteraction(ErrorCode.InteractionRequired)).toEqual(
        true
      );
      expect(msal.requiresInteraction(ErrorCode.LoginRequired)).toEqual(true);
    });

    it("should return false if the errorCode is empty", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msal: any = new MSAL(config);

      expect(msal.requiresInteraction("")).toEqual(false);
      expect(msal.requiresInteraction(null)).toEqual(false);
    });

    it("should return false if the errorCode is not of type ErrorCode", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msal: any = new MSAL(config);

      expect(msal.requiresInteraction("error_not_found")).toEqual(false);
    });
  });

  describe("setAccessToken", () => {
    it("should properly set the expiration timer if the request is successful", async () => {
      // If isCallback returns true then we can assume the user is not authenticated
      (UserAgentApplication as jest.Mock).mockImplementationOnce(() => ({
        ...defaultUserAgentApplicationMock,
        // This makes sure acquireToken is not called on initialization
        isCallback: (): boolean => true,
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msal: any = new MSAL(config);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(msal.tokenExpirationTimer).toBeUndefined();
      await msal.acquireToken();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((msal as any).tokenExpirationTimer).not.toBeUndefined();
    });
  });

  // TODO: Test token expiration
});

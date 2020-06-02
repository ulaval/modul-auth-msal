jest.mock("msal");

import { UserAgentApplication, AuthenticationParameters } from "msal";
import { MSAL } from "../src/main";
import { Config } from "../plugin";
import { AuthResponse, ErrorCode } from "../src/types";
import { cloneDeep } from "lodash";

const baseConfig: Config = {
  auth: {
    clientId: "1ced1w79-a343-4d56c-b444-411ed438da2f",
    requireAuthOnInitialize: false,
  },
  query: {
    parameters: {
      scopes: ["user.read"],
    },
    makeQueryOnInitialize: false,
    endpoints: { profile: "/me" },
    baseUrl: "https://graph.microsoft.com/v1.0",
  },
};
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

beforeEach(() => {
  (UserAgentApplication as jest.Mock).mockImplementation(
    () => defaultUserAgentApplicationMock
  );

  config = cloneDeep(baseConfig);
});

describe(MSAL.name, () => {
  describe("initialization", () => {
    it("should not throw any error with basic configurations", () => {
      try {
        new MSAL(config);
      } catch (e) {
        fail(e);
      }
    });

    it("should call login when auth.requireAuthOnInitialize is true", () => {
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
      expect(spy).toHaveBeenCalled();
    });

    it("should call query when isAuthenticated, query.makeQueryOnInitialize are true and query contains endpoints", () => {
      config.auth.requireAuthOnInitialize = true;
      config.query = Object.assign(config.query, {
        makeQueryOnInitialize: true,
      });

      const spy = jest.spyOn(MSAL.prototype, "query");

      new MSAL(config);

      let parameters: { id: string; url: string } | null = null;
      Object.entries(config.query?.endpoints || []).forEach(([id, url]) => {
        parameters = { id, url };
      });

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(parameters);
    });

    it("should throw an error when isAuthenticated, query.makeQueryOnInitialize are true, but query contains no endpoints", () => {
      config.auth.requireAuthOnInitialize = true;
      config.query = Object.assign(config.query, {
        makeQueryOnInitialize: true,
        endpoints: {},
      });

      const spy = jest.spyOn(MSAL.prototype, "query");

      expect(() => {
        new MSAL(config);
      }).toThrow();

      expect(spy).not.toHaveBeenCalled();
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

      expect(spy).toHaveBeenCalledTimes(0);
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
      // Once on initialization, once with the call to isAuthenticated above
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it("should return true otherwise", () => {
      const spy = jest.spyOn(defaultUserAgentApplicationMock, "isCallback");

      const msal = new MSAL(config);

      expect(msal.isAuthenticated()).toEqual(true);
      expect(spy).toHaveBeenCalledWith(window.location.hash);
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
        .mockRejectedValueOnce(new AuthError(ErrorCode.ConsentRequired)); // Requires consent by the user

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
});

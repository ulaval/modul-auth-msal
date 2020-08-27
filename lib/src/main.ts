import axios from "axios";
import { cloneDeep, isEmpty } from "lodash";
import { ILogger } from "./interfaces";
import {
  AuthConfig,
  AuthError,
  CacheConfig,
  Config,
  DataObject,
  ErrorCode,
  MSALBasic,
  Query,
  QueryConfig,
  QueryEndpoint,
  QueryOptions,
  QueryParameters,
  QueryResponse,
} from "./types";
import { UserAgentApplicationExtended } from "./UserAgentApplicationExtended";

/**
 * Manage authentication and querying of Microsoft's online services
 */
export class MSAL implements MSALBasic {
  private lib: UserAgentApplicationExtended;
  private logger: ILogger;
  private tokenExpirationTimer?: number;
  private readonly authConfig: AuthConfig = {
    clientId: "",
    tenantId: "common",
    tenantName: "login.microsoftonline.com",
    validateAuthority: true,
    redirectUri: window.location.href,
    postLogoutRedirectUri: window.location.href,
    navigateToLoginRequestUrl: true,
    requireAuthOnInitialize: false,
    autoRefreshToken: true,
  };
  private readonly cacheConfig: CacheConfig = {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: true,
  };
  private readonly queryConfig: QueryConfig = {
    parameters: {
      scopes: ["user.read"],
    },
    baseUrl: "https://graph.microsoft.com/v1.0",
  };
  private accessToken = "";

  public data: DataObject = {
    isAuthenticated: false,
    query: {},
  };

  constructor(private readonly config: Config) {
    if (!config.auth.clientId) {
      throw new Error("auth.clientId option is required");
    }

    this.authConfig = Object.assign(this.authConfig, config.auth);
    this.cacheConfig = Object.assign(this.cacheConfig, config.cache);
    this.queryConfig = Object.assign(this.queryConfig, config.query);

    this.logger = config.logger || {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      info: (): void => {},
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      debug: (): void => {},
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      error: (): void => {},
      logLevel: "info",
    };

    // TODO: Update authority once ADFS is supported by MSAL
    // Since ULaval's auth page only supports ADFS
    this.lib = new UserAgentApplicationExtended({
      auth: {
        clientId: this.authConfig.clientId,
        authority: `https://${this.authConfig.tenantName}/${this.authConfig.tenantId}`,
        validateAuthority: this.authConfig.validateAuthority,
        redirectUri: this.authConfig.redirectUri,
        postLogoutRedirectUri: this.authConfig.postLogoutRedirectUri,
        navigateToLoginRequestUrl: this.authConfig.navigateToLoginRequestUrl,
      },
      cache: this.cacheConfig,
      system: cloneDeep(config.system),
    });

    if (this.authConfig.requireAuthOnInitialize) {
      this.login();
    }

    this.data.isAuthenticated = this.isAuthenticated();
    if (this.data.isAuthenticated) {
      this.data.user = this.lib.getAccount();
    }
  }

  /**
   * Used when initiating the login process by redirecting the user's browser to the authorization endpoint.
   */
  public login(): void {
    if (!this.isAuthenticated()) {
      this.lib.loginRedirect(this.queryConfig.parameters);
    }
  }

  /**
   * Used to logout the current user, and redirect the user to the postLogoutRedirectUri.
   * **Note: Default behavior is to redirect the user to `window.location.href`.**
   */
  public logout(): void {
    if (this.isAuthenticated()) {
      this.lib.logout();
    }
  }

  /**
   * Check if the user is authenticated
   */
  public isAuthenticated(): boolean {
    return (
      !this.lib.isCallback(window.location.hash) &&
      !isEmpty(this.lib.getAccount())
    );
  }

  /**
   * Allows to query Microsoft's APIs.
   * **Note: This function will attempt to acquire the required access token.
   * Make sure to update the parameter's scopes if needed.**
   *
   * @param endpoint A string URL or an object containing The API URL to query and an optional ID.
   * The ID is used to store the result into teh query data object.
   * *e.g. `{url: "/me", id: "profile"}` will store the result of "/me" into data.query.profile.*
   * @param options The query options (method, headers, params, data, responseType)
   * @param parameters The query authentication parameters (scopes)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async query<Response = any>(
    endpoint: QueryEndpoint,
    options: QueryOptions = {
      method: "GET",
      responseType: "json",
    },
    parameters: QueryParameters = this.queryConfig.parameters
  ): Promise<QueryResponse<Response>> {
    this.accessToken = await this.acquireToken(parameters);

    const response = await this.executeQuery<Response>(endpoint, options);

    if (typeof endpoint === "object" && endpoint.id !== undefined) {
      this.data.query[endpoint.id] = response.data;
    }

    return response;
  }

  /**
   * Execute a query and return its response
   * @param endpoint The API endpoint to query
   * @param options The query options (method, headers, params, data, responseType)
   */
  private async executeQuery<Response>(
    endpoint: QueryEndpoint,
    options: QueryOptions
  ): Promise<QueryResponse<Response>> {
    const query = this.createQuery(endpoint, options);

    // If the query URL is only a path (e.g. /api/blabla), append the query base URL to it.
    if (
      query.url.search("http") !== 0 &&
      this.queryConfig.baseUrl !== undefined
    ) {
      query.url = `${this.queryConfig.baseUrl}${query.url}`;
    }

    query.headers = {
      ...query.headers,
      Authorization: `Bearer ${this.accessToken}`,
    };

    return await axios.request<Response>(query).catch((err) => {
      this.logger.error(err);

      // Re-throw the error so it can be handled where it was called
      throw err;
    });
  }

  /**
   * Create a query query object
   * @param endpoint The API endpoint to query
   * @param options The query options (method, headers, params, data, responseType)
   */
  private createQuery(
    endpoint: QueryEndpoint,
    options: QueryOptions = {}
  ): Query {
    if (typeof endpoint === "string") {
      endpoint = { url: endpoint };
    }
    if (endpoint.url === "") {
      throw new Error("URL endpoint must not be empty");
    }

    const query: Query = {
      ...options,
      url: endpoint.url,
    };

    return query;
  }

  /**
   * Allow to fetch the cached token or acquire a new one.
   * **Note: returns an empty string in case of an error.**
   * @param queryParameters The authentication parameters used to fetch the token
   */
  private async acquireToken(
    queryParameters = this.queryConfig.parameters
  ): Promise<string> {
    try {
      // Use acquireTokenSilent to obtain the signed in user's token from cache if possible.
      const response = await this.lib.acquireTokenSilent(queryParameters);

      this.setAccessToken(
        response.accessToken,
        response.expiresOn,
        response.scopes
      );

      return this.accessToken;
    } catch (error) {
      this.logger.error(error);

      // Upon acquireTokenSilent failure (due to consent, interaction or login required ONLY).
      // Call acquireTokenRedirect
      if (this.requiresInteraction((error as AuthError).errorCode)) {
        this.lib.acquireTokenRedirect(queryParameters);
      }

      return "";
    }
  }

  /**
   * Check if a user interaction is required based on an error code
   * @param errorCode The error code returned by the Microsoft API
   */
  private requiresInteraction(errorCode: string): boolean {
    if (!errorCode) {
      return false;
    }

    return (
      errorCode === ErrorCode.ConsentRequired ||
      errorCode === ErrorCode.InteractionRequired ||
      errorCode === ErrorCode.LoginRequired
    );
  }

  /**
   * Set the current access token and handle token expiration
   * @param accessToken The access token used to query Microsoft related services
   * @param expiresOn The moment when the token will expire
   * @param scopes The permissions that the client request access to
   */
  private setAccessToken(
    accessToken: string,
    expiresOn: Date,
    scopes: string[]
  ): void {
    this.accessToken = accessToken;

    // Sets the window of offset needed to renew the token before expiry
    const tokenRenewalOffset = this.lib.configuration.system
      ?.tokenRenewalOffsetSeconds;
    const expirationOffset = tokenRenewalOffset || 0;

    const expiration =
      expiresOn.getTime() - new Date().getTime() - expirationOffset;

    // Clear the timer is set before setting a new one
    if (this.tokenExpirationTimer) {
      clearTimeout(this.tokenExpirationTimer);
    }

    // Set a timer for when the token will expire
    this.tokenExpirationTimer = window.setTimeout(() => {
      // Refresh the token once it expires if auto refresh is on.
      if (this.authConfig.autoRefreshToken) {
        this.acquireToken({ scopes });
      } else {
        this.accessToken = "";
      }
    }, expiration);
  }
}

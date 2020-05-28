import { cloneDeep, includes } from "lodash";
import axios from "axios";
import { UserAgentApplicationExtended } from "./UserAgentApplicationExtended";
import {
  AuthConfig,
  CacheConfig,
  QueryConfig,
  Config,
  DataObject,
  MSALBasic,
  Query,
  QueryEndpoint,
  QueryResponse,
  QueryData,
  QueryOptions,
  ErrorCode,
  AuthError,
} from "./types";

/**
 * Manage authentication and querying of Microsoft's onlice services
 */
export class MSAL implements MSALBasic {
  private lib: UserAgentApplicationExtended;
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
    parameter: {
      scopes: ["user.read"],
    },
    callAfterInit: false,
    endpoints: { profile: "/me" },
    baseUrl: "https://graph.microsoft.com/v1.0",
  };

  public data: DataObject = {
    isAuthenticated: false,
    accessToken: "",
  };

  constructor(private readonly config: Config) {
    if (!config.auth.clientId) {
      throw new Error("auth.clientId option is required");
    }

    this.authConfig = Object.assign(this.authConfig, config.auth);
    this.cacheConfig = Object.assign(this.cacheConfig, config.cache);
    this.queryConfig = Object.assign(this.queryConfig, config.query);

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
      // Get basic user information
      this.data.user = this.lib.getAccount();

      this.acquireToken().then(() => {
        if (this.queryConfig.callAfterInit) {
          this.initialQuery();
        }
      });
    }
  }

  /**
   * Use when initiating the login process by redirecting the user's browser to the authorization endpoint.
   */
  public login(): void {
    if (!this.isAuthenticated()) {
      this.lib.loginRedirect(this.queryConfig.parameter);
    }
  }

  /**
   * Use to log out the current user, and redirect the user to the postLogoutRedirectUri.
   * Default behaviour is to redirect the user to `window.location.href`.
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
      !this.lib.isCallback(window.location.hash) && !!this.lib.getAccount()
    );
  }

  /**
   * Allows to query MSQuery API
   * @param endpoint The API endpoint to query
   * @param options The query options (method, headers, params, data, responseType)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async query<Response = any>(
    endpoint: QueryEndpoint,
    options: QueryOptions
  ): Promise<QueryResponse<Response>> {
    return await this.executeQuery<Response>(endpoint, options);
  }

  /**
   * Allow to fetch the cached token or acquire a new one.
   * **Note: returns an empty string in case of error.**
   * @param queryParameters The authentication parameters used to fetch the token
   */
  public async acquireToken(
    queryParameters = this.queryConfig.parameter
  ): Promise<string> {
    try {
      // Use acquireTokenSilent to obtain the signed in user's token from cache.
      const response = await this.lib.acquireTokenSilent(queryParameters);

      // Check that its not the same token as the one currently set (or the cached one).
      if (this.data.accessToken !== response.accessToken) {
        this.setAccessToken(
          response.accessToken,
          response.expiresOn,
          response.scopes
        );
      }

      return response.accessToken;
    } catch (error) {
      // Upon acquireTokenSilent failure (due to consent, interaction or login required ONLY)
      // Call acquireTokenRedirect
      if (this.requiresInteraction((error as AuthError).errorCode)) {
        this.lib.acquireTokenRedirect(queryParameters);
      }

      return "";
    }
  }

  /**
   * Initial MS query on initialisation
   */
  private async initialQuery(): Promise<void> {
    const endpoints = this.queryConfig.endpoints;

    if (endpoints !== undefined) {
      const results: QueryData = {};
      const queries: Query[] = [];

      // Fetch cached results
      let storedIds: string[] = [];
      const storedStringData = this.lib.store.getItem(
        `msal.query-${this.data.accessToken}`
      );
      if (storedStringData) {
        const storedData: QueryData = JSON.parse(storedStringData);
        storedIds = Object.keys(storedData);

        Object.assign(results, storedData);
      }

      // Only keep queries that have not already been made and cached
      for (const id in endpoints) {
        if (!includes(storedIds, id)) {
          queries.push({
            id: id,
            url: endpoints[id],
          });
        }
      }

      const promises = queries.map(async (endpoint) => {
        return {
          id: endpoint.id as string,
          value: await this.query(endpoint, {
            method: "GET",
            responseType: "json",
          }),
        };
      });

      await Promise.all(promises).then((responses) => {
        const formattedResponses: QueryData = {};

        for (const resp of responses) {
          formattedResponses[resp.id] = resp.value.data;
        }

        Object.assign(results, formattedResponses);
      });

      // Append new results to the cached ones and save them into the store.
      this.data.query = cloneDeep(results);
      this.lib.store.setItem(
        `msal.query-${this.data.accessToken}`,
        JSON.stringify({ ...results })
      );
    }
  }

  /**
   * Check if a user interation is required based on an error code
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
    this.data.accessToken = accessToken;

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
        this.data.accessToken = "";
      }
    }, expiration);
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
      Authorization: `Bearer ${this.data.accessToken}`,
    };

    return await axios.request<Response>(query);
  }

  /**
   * Create a query query object
   * @param endpoint The API endpoint to query
   * @param options The query options (method, headers, params, data, responseType)
   * @param index The query index (in case of batch query)
   */
  private createQuery(
    endpoint: string | Query,
    options: QueryOptions = {},
    index = 0
  ): Query {
    if (typeof endpoint === "string") {
      endpoint = { url: endpoint };
    }
    if (typeof endpoint === "object" && endpoint.url === "") {
      throw new Error("Empty endpoint url");
    }

    const query: Query = {
      ...options,
      url: endpoint.url,
      id: endpoint.id || `defaultID-${index}`,
    };

    return query;
  }
}
